// node make-workflow.mjs --plan tracer|full
// Writes briefs/P1.md, P2.md, P3.md, wf/<name>.js, and wf/<name>.jobs.json.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, EVAL } from './lib/paths.mjs';
import { readJson, writeJson } from './lib/data.mjs';
import { SCHEMAS } from './lib/schemas.mjs';
import { extractQuality, briefP1, briefRank, promptP0, promptP1, promptRank } from './lib/prompts.mjs';
import { sheetPaths } from './lib/sheet.mjs';

export const MODELS = ['opus', 'sonnet', 'haiku'];

export function buildJobs(pools, plan, config) {
  const jobs = [];
  const brief = name => `${EVAL}/briefs/${name}.md`;
  // P0 and P1 judges read the app-size copy (images/<target>/<n>.jpg): the size the learner sees. Ranking judges read sheets only.
  const appCopy = (t, list) => list.map(p => ({ ...p, abs: `${EVAL}/images/${t.target}/${p.n}.jpg` }));
  const base = (pass, m, t) => ({ pass, phase: pass, model: m, model_opt: config.model_opt[m], effort: config.effort[m], target: t.target });
  const p1 = (m, t) => {
    for (let i = 0; i < t.photos.length; i += 10) {
      const b = appCopy(t, t.photos.slice(i, i + 10));
      jobs.push({ label: `P1:${m}:${t.target}:b${i / 10 + 1}`, ...base('P1', m, t), keys: b.map(p => p.key), schema: 'P1', prompt: promptP1(t, b, brief('P1')) });
    }
  };
  const rank = (pass, m, t, photos, prefix) => jobs.push({
    label: `${pass}:${m}:${t.target}`, ...base(pass, m, t), keys: photos.map(p => p.key), schema: 'RANK',
    prompt: promptRank(t, photos, sheetPaths(EVAL, t.target, photos.length, prefix), brief(pass)),
  });
  if (plan === 'tracer') {
    const t = pools.targets[0];
    const two = appCopy(t, t.photos.slice(0, 2));
    for (const m of MODELS) jobs.push({ label: `P0:${m}`, ...base('P0', m, t), keys: two.map(p => p.key), schema: 'P0', prompt: promptP0(t, two, brief('P1')) });
    // A check only: which model the short name runs. The eval itself uses full IDs.
    jobs.push({ label: 'P0:haiku-alias', ...base('P0', 'haiku', t), model_opt: 'haiku', check_only: true, keys: two.map(p => p.key), schema: 'P0', prompt: promptP0(t, two, brief('P1')) });
    p1(config.tracer_model, t);
    rank('P2', config.tracer_model, t, t.photos, 'all');
  } else if (plan === 'full') {
    for (const m of MODELS) for (const t of pools.targets) p1(m, t);
    for (const m of MODELS) for (const t of pools.targets) rank('P2', m, t, t.photos, 'all');
    for (const m of MODELS) for (const t of pools.targets.filter(x => pools.p3.includes(x.target))) rank('P3', m, t, t.photos.slice(0, 12), 'first12');
  } else throw new Error(`unknown plan ${plan}`);
  return jobs;
}

export function renderScript(name, jobs) {
  const phases = [...new Set(jobs.map(j => j.phase))].map(title => ({ title }));
  const meta = { name, description: `Selection-method eval judges (${jobs.length} agents)`, phases };
  const slim = jobs.map(j => ({ label: j.label, phase: j.phase, model: j.model_opt, effort: j.effort, schema: j.schema, prompt: j.prompt }));
  return [
    `export const meta = ${JSON.stringify(meta)}`,
    `const JOBS = ${JSON.stringify(slim)}`,
    `const SCHEMAS = ${JSON.stringify(SCHEMAS)}`,
    'const res = await parallel(JOBS.map(j => () => agent(j.prompt, { label: j.label, phase: j.phase, model: j.model, effort: j.effort, schema: SCHEMAS[j.schema] })))',
    'log(`${res.filter(r => r == null).length} of ${JOBS.length} agents returned nothing`)',
    'return JOBS.map((j, i) => ({ label: j.label, result: res[i] ?? null }))',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const plan = args[args.indexOf('--plan') + 1];
  const name = `selection-eval-${plan}`;
  const config = readJson(path.join(EVAL, 'config.json'));
  const pools = readJson(path.join(EVAL, plan === 'tracer' ? 'tracer/pools.json' : 'pools.json'));
  const quality = extractQuality(fs.readFileSync(path.join(ROOT, '.claude', 'skills', 'photo-check', 'SKILL.md'), 'utf8'));
  fs.mkdirSync(path.join(EVAL, 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(EVAL, 'briefs', 'P1.md'), briefP1(quality));
  fs.writeFileSync(path.join(EVAL, 'briefs', 'P2.md'), briefRank(quality, 'P2'));
  fs.writeFileSync(path.join(EVAL, 'briefs', 'P3.md'), briefRank(quality, 'P3'));
  const jobs = buildJobs(pools, plan, config);
  fs.mkdirSync(path.join(EVAL, 'wf'), { recursive: true });
  fs.writeFileSync(path.join(EVAL, 'wf', `${name}.js`), renderScript(name, jobs));
  writeJson(path.join(EVAL, 'wf', `${name}.jobs.json`), jobs);
  const count = {};
  for (const j of jobs) count[`${j.pass} ${j.model}`] = (count[`${j.pass} ${j.model}`] || 0) + 1;
  console.log(JSON.stringify(count, null, 1));
  console.log(`agents: ${jobs.length} | script: ${path.join(EVAL, 'wf', `${name}.js`)}`);
}
