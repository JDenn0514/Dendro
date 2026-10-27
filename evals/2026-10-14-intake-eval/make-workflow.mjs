// node make-workflow.mjs --plan tracer|tracer-effort|key-judge|key-batch20|key-effort|key-n20|key-repeat|key-rank [--variant V1|V2]
//   key-rank: [--runs key-batch20,key-n20] names the runs that hold the first calls-of-20 answers of each leading set-up.
// Writes briefs/judge-V1.md, judge-V2.md, rank.md, wf/<plan>.js, and wf/<plan>.jobs.json.
// The workflow is named intake-eval-<plan>. collect.mjs --name <plan> then writes runs/<plan>/.
// Prints the agent count per kind, model, and effort, and the USD estimate of estimate.mjs.
// Job kinds: `check` (the model check), `judge` (model, effort, variant, batch), and `rank` (model, set, cell, groups).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, EVAL } from './lib/paths.mjs';
import { readJson, writeJson } from './lib/data.mjs';
import { SCHEMAS } from './lib/schemas.mjs';
import { extractChecks, briefJudge, briefRank, promptJudge, promptCheck, promptRank } from './lib/prompts.mjs';
import { mulberry32, shuffle } from './lib/seed.mjs';
import { sheetsFor, PER_SHEET } from './lib/sheet.mjs';
import { rankSets, groupLine } from './lib/rank-jobs.mjs';
import { estimateJobs, printEstimate } from './estimate.mjs';
import { buildViews } from './lib/views.mjs';

export const MODELS = ['opus', 'sonnet', 'haiku'];
const BATCH = 10;
// The batch-size test (owner ruling 2026-10-23): V1 at high in calls of 20, against the calls of 10 of key-judge.
const BATCH_TEST = 20;

// The tracer's 10 key photos: 4 leaf, 3 bark, and 3 fruit, drawn with the seed, then in key order.
export function tracerPhotos(pool, seed) {
  const all = shuffle(pool.cells.flatMap(c => c.photos.map(p => ({ ...p, part: c.part }))), mulberry32(seed));
  const want = { leaf: 4, bark: 3, fruit: 3 };
  return all.filter(p => want[p.part]-- > 0).sort((a, b) => a.order - b.order);
}

// pool: a set's pools.json. opts.variant: the variant of the key-effort plan.
export function buildJobs(pool, plan, config, opts = {}) {
  const brief = name => path.join(EVAL, 'briefs', `${name}.md`);
  const cellOf = new Map(pool.cells.flatMap(c => c.photos.map(p => [p.key, c])));
  // Judges read the 440 px copy: the size that the learner sees. They see only the photo code (key-pools.mjs),
  // never the key, so the prompt does not give away the part or the place in the cell.
  const line = p => {
    const c = cellOf.get(p.key);
    return { key: p.code, abs: path.join(EVAL, 'images', 'app', pool.set, `${p.code}.jpg`), tree: c.species, source_species: p.source_species, depth: config.depth_features?.[c.target] };
  };
  const codes = list => Object.fromEntries(list.map(p => [p.code, p.key]));
  const base = (kind, m, effort) => ({ kind, phase: kind, set: pool.set, model: m, model_opt: config.model_opt[m], effort });
  const jobs = [];
  const judge = (photos, m, effort, variant, size = BATCH) => {
    for (let i = 0; i < photos.length; i += size) {
      const b = photos.slice(i, i + size);
      const n = String(i / size + 1).padStart(2, '0');
      const tag = size === BATCH ? '' : `:n${size}`;
      // The photos of a call in an order fixed per call, the same for every model and variant.
      // The key order inside a cell follows the review prototype, so the prompt does not show it.
      const shown = shuffle(b, mulberry32(config.seed + i));
      jobs.push({ label: `judge:${m}:${effort}:${variant}${tag}:b${n}`, ...base('judge', m, effort), variant, batch: size, keys: b.map(p => p.key), codes: codes(b), schema: 'JUDGE', prompt: promptJudge(shown.map(line), brief(`judge-${variant}`)) });
    }
  };
  // method: 'R', or 'FR' for a ranking of the set left after Haiku's reject pass (views.mjs files it under :FR).
  const rank = (m, c, groups, groupLine, method = 'R') => {
    const tag = method === 'FR' ? 'FR' : '';
    const prefix = g => (g === 'all' ? 'all' : `${m}${tag}-${g}`);
    const sheets = Object.entries(groups).flatMap(([g, keys]) => sheetsFor(EVAL, pool.set, c.cell, prefix(g), keys));
    jobs.push({
      label: `rank:${m}:${config.rank_effort}:${tag ? 'FR:' : ''}${c.cell}`, ...base('rank', m, config.rank_effort), method, cell: c.cell, groups,
      keys: Object.values(groups).flat(), sheets, schema: 'RANK',
      prompt: promptRank(c, groups, sheets.map(s => s.file), brief('rank'), groupLine),
    });
  };
  const all = pool.cells.flatMap(c => c.photos);
  const offHigh = config.efforts.filter(e => e !== 'high');
  if (plan === 'tracer') {
    const ten = tracerPhotos(pool, config.seed);
    const two = ten.slice(0, 2);
    for (const m of MODELS) jobs.push({ label: `check:${m}`, ...base('check', m, config.effort[m]), variant: 'V1', keys: two.map(p => p.key), codes: codes(two), schema: 'CHECK', prompt: promptCheck(two.map(line), brief('judge-V1')) });
    for (const m of MODELS) for (const v of config.variants) judge(ten, m, config.effort[m], v);
    // One cell that fits on one sheet, ranked as one group: the tracer has no judge answers to group by yet.
    const c = pool.cells.find(x => x.photos.length <= PER_SHEET);
    rank(config.tracer_model, c, { all: c.photos.map(p => p.key) }, null);
  } else if (plan === 'tracer-effort') {
    const ten = tracerPhotos(pool, config.seed);
    for (const m of MODELS) for (const e of offHigh) judge(ten, m, e, 'V1');
  } else if (plan === 'key-judge') {
    for (const m of MODELS) for (const v of config.variants) judge(all, m, 'high', v);
  } else if (plan === 'key-batch20') {
    for (const m of MODELS) judge(all, m, 'high', 'V1', BATCH_TEST);
  } else if (plan === 'key-effort') {
    if (!config.variants.includes(opts.variant)) throw new Error('the key-effort plan needs --variant V1 or V2');
    for (const m of MODELS) for (const e of offHigh) judge(all, m, e, opts.variant);
  } else if (plan === 'key-n20' || plan === 'key-repeat') {
    // Owner ruling 2026-10-27: later runs use calls of 20. config.leading holds the leading variant and effort
    // of Task 5. key-n20 runs each leading set-up that has no calls-of-20 run yet (key-batch20 ran high).
    // key-repeat runs every leading set-up again, with the same labels and prompts: analyze.mjs --repeat.
    const { variant, batch, effort } = config.leading;
    for (const m of MODELS) if (plan === 'key-repeat' || effort[m] !== 'high') judge(all, m, effort[m], variant, batch);
  } else if (plan === 'key-rank') {
    // opts.answers: { <model>: answers } of each model's leading set-up. opts.filter: Haiku's leading answers.
    // FR runs for Opus and Sonnet only, and only where its set differs from R's (plan choice 10).
    if (!opts.answers || !opts.filter) throw new Error('the key-rank plan needs the judge answers of each leading set-up');
    const cellOf = name => pool.cells.find(c => c.cell === name);
    for (const m of MODELS) {
      const r = rankSets(pool, opts.answers[m]);
      for (const [cell, groups] of Object.entries(r)) rank(m, cellOf(cell), groups, groupLine(pool, cell, opts.answers[m]));
      if (m === 'haiku') continue;
      const same = (a, b) => JSON.stringify(Object.values(a ?? {}).flat().sort()) === JSON.stringify(Object.values(b ?? {}).flat().sort());
      for (const [cell, groups] of Object.entries(rankSets(pool, opts.answers[m], opts.filter))) {
        if (!same(groups, r[cell])) rank(m, cellOf(cell), groups, groupLine(pool, cell, opts.answers[m]), 'FR');
      }
    }
  } else throw new Error(`unknown plan ${plan}`);
  return jobs;
}

export function renderScript(name, jobs) {
  const phases = [...new Set(jobs.map(j => j.phase))].map(title => ({ title }));
  const meta = { name: `intake-eval-${name}`, description: `Intake eval agents (${jobs.length} agents)`, phases };
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

export function writeBriefs() {
  const checks = extractChecks(fs.readFileSync(path.join(ROOT, '.claude', 'skills', 'photo-check', 'SKILL.md'), 'utf8'));
  fs.mkdirSync(path.join(EVAL, 'briefs'), { recursive: true });
  for (const v of ['V1', 'V2']) fs.writeFileSync(path.join(EVAL, 'briefs', `judge-${v}.md`), briefJudge(checks, v));
  fs.writeFileSync(path.join(EVAL, 'briefs', 'rank.md'), briefRank());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const plan = opt('--plan');
  const name = plan;
  const config = readJson(path.join(EVAL, 'config.json'));
  const pool = readJson(path.join(EVAL, 'key', 'pools.json'));
  writeBriefs();
  const opts = { variant: opt('--variant') };
  if (plan === 'key-rank') {
    const runs = (opt('--runs') ?? 'key-batch20,key-n20').split(',');
    const all = runs.map(r => path.join(EVAL, 'runs', r));
    const v = buildViews(all.flatMap(d => readJson(path.join(d, 'results.json')).jobs), Object.assign({}, ...all.map(d => readJson(path.join(d, 'tokens.json')))));
    const { variant, batch, effort } = config.leading;
    const setup = m => `${m}:${effort[m]}:${variant}:n${batch}`;
    opts.answers = Object.fromEntries(MODELS.map(m => {
      if (!v.answers[setup(m)]) throw new Error(`no answers of ${setup(m)} in runs ${runs.join(', ')}`);
      return [m, v.answers[setup(m)]];
    }));
    opts.filter = opts.answers.haiku;
    console.log(`answers: ${MODELS.map(setup).join(', ')} | problems in the runs: ${v.problems.length}`);
  }
  const jobs = buildJobs(pool, plan, config, opts);
  fs.mkdirSync(path.join(EVAL, 'wf'), { recursive: true });
  fs.writeFileSync(path.join(EVAL, 'wf', `${name}.js`), renderScript(name, jobs));
  writeJson(path.join(EVAL, 'wf', `${name}.jobs.json`), jobs);
  const count = {};
  for (const j of jobs) count[`${j.kind} ${j.model} ${j.effort}`] = (count[`${j.kind} ${j.model} ${j.effort}`] || 0) + 1;
  console.log(JSON.stringify(count, null, 1));
  console.log(`agents: ${jobs.length} | script: ${path.join(EVAL, 'wf', `${name}.js`)}`);
  printEstimate(estimateJobs(jobs));
}
