import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildJobs, renderScript, tracerPhotos, MODELS } from '../make-workflow.mjs';
import { SCHEMAS } from '../lib/schemas.mjs';
import { EVAL } from '../lib/paths.mjs';

const config = {
  seed: 20261014,
  tracer_model: 'haiku',
  efforts: ['medium', 'high', 'xhigh'],
  effort: { opus: 'high', sonnet: 'high', haiku: 'high' },
  rank_effort: 'high',
  variants: ['V1', 'V2'],
  model_opt: { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' },
  depth_features: { PLHI: { fruit: 'two_heads' } },
};
let order = 0;
const cell = (target, part, n, species = `${target} species`) => ({
  cell: `${target}-${part}`, target, part, species,
  photos: Array.from({ length: n }, (_, i) => ({
    key: `${target}-${part}-${String(i + 1).padStart(2, '0')}`, n: i + 1, order: ++order, target, part,
    url: `https://x/${target}/${part}/${i + 1}.jpg`, fetch_url: `https://x/${target}/${part}/${i + 1}.jpg`,
    code: `p${String(order).padStart(3, '0')}`, source_species: `${target} source`, owner: { keep: true, step: 1 },
  })),
});
// 13 + 12 + 6 + 8 + 7 + 9 = 55 photos, in key order.
const POOL = { set: 'key', cells: [cell('ACRU', 'leaf', 13), cell('ACRU', 'bark', 12), cell('ACRU', 'fruit', 6), cell('PLHI', 'leaf', 8), cell('PLHI', 'bark', 7), cell('PLHI', 'fruit', 9, 'Platanus ×hispanica')] };
const keysOf = jobs => jobs.flatMap(j => j.keys);
const codeOf = new Map(POOL.cells.flatMap(c => c.photos.map(p => [p.key, p.code])));

test('tracerPhotos takes 4 leaf, 3 bark, and 3 fruit photos, fixed by the seed', () => {
  const a = tracerPhotos(POOL, config.seed);
  assert.deepEqual(['leaf', 'bark', 'fruit'].map(p => a.filter(x => x.part === p).length), [4, 3, 3]);
  assert.deepEqual(a.map(x => x.key), tracerPhotos(POOL, config.seed).map(x => x.key));
  assert.notDeepEqual(a.map(x => x.key), tracerPhotos(POOL, 7).map(x => x.key));
  assert.deepEqual(a.map(x => x.order), [...a.map(x => x.order)].sort((x, y) => x - y));
});

test('tracer plan: 3 model checks, a V1 and a V2 call per model, and one Haiku ranking', () => {
  const jobs = buildJobs(POOL, 'tracer', config);
  assert.equal(jobs.length, 10);
  assert.equal(new Set(jobs.map(j => j.label)).size, 10);
  const checks = jobs.filter(j => j.kind === 'check');
  assert.deepEqual(checks.map(j => [j.label, j.model_opt, j.schema, j.keys.length]), [
    ['check:opus', 'claude-opus-5-5', 'CHECK', 2], ['check:sonnet', 'claude-sonnet-5-5', 'CHECK', 2], ['check:haiku', 'claude-haiku-5-5', 'CHECK', 2],
  ]);
  const judges = jobs.filter(j => j.kind === 'judge');
  assert.deepEqual(judges.map(j => j.label), MODELS.flatMap(m => [`judge:${m}:high:V1:b01`, `judge:${m}:high:V2:b01`]));
  const ten = tracerPhotos(POOL, config.seed).map(p => p.key);
  for (const j of judges) assert.deepEqual(j.keys, ten);
  assert.ok(judges.every(j => j.schema === 'JUDGE' && j.effort === 'high'));
  assert.ok(judges.find(j => j.variant === 'V2').prompt.includes(path.join(EVAL, 'briefs', 'judge-V2.md')));
  const [rank] = jobs.filter(j => j.kind === 'rank');
  assert.equal(rank.label, 'rank:haiku:high:ACRU-fruit');
  assert.equal(rank.model_opt, 'claude-haiku-5-5');
  assert.deepEqual(Object.keys(rank.groups), ['all']);
  assert.equal(rank.keys.length, 6);
  assert.deepEqual(rank.sheets.map(s => s.file), [path.join(EVAL, 'images', 'sheets', 'key', 'ACRU-fruit', 'all-1.jpg')]);
});

test('tracer-effort plan: V1 at medium and xhigh for each model, on the same 10 photos', () => {
  const jobs = buildJobs(POOL, 'tracer-effort', config);
  assert.deepEqual(jobs.map(j => j.label), MODELS.flatMap(m => [`judge:${m}:medium:V1:b01`, `judge:${m}:xhigh:V1:b01`]));
  assert.ok(jobs.every(j => j.keys.length === 10 && j.variant === 'V1'));
});

test('key-judge plan: calls of 10 across the cells in key order, for each model and variant', () => {
  const jobs = buildJobs(POOL, 'key-judge', config);
  assert.equal(jobs.length, 3 * 2 * 6);
  const one = jobs.filter(j => j.model === 'sonnet' && j.variant === 'V2');
  assert.deepEqual(one.map(j => j.keys.length), [10, 10, 10, 10, 10, 5]);
  assert.deepEqual(keysOf(one), POOL.cells.flatMap(c => c.photos.map(p => p.key)));
  // The first call ends inside ACRU-leaf; the second crosses into ACRU-bark.
  assert.deepEqual(one[1].keys.slice(2, 4), ['ACRU-leaf-13', 'ACRU-bark-01']);
  assert.equal(one[5].label, 'judge:sonnet:high:V2:b06');
  assert.ok(jobs.every(j => j.effort === 'high' && j.model_opt === config.model_opt[j.model]));
});

test('key-batch20 plan: V1 at high in calls of 20, for each model, with labels apart from the calls of 10', () => {
  const jobs = buildJobs(POOL, 'key-batch20', config);
  const one = jobs.filter(j => j.model === 'haiku');
  assert.deepEqual(one.map(j => j.keys.length), [20, 20, 15]);
  assert.deepEqual(keysOf(one), POOL.cells.flatMap(c => c.photos.map(p => p.key)));
  assert.deepEqual(jobs.map(j => j.label).slice(0, 3), ['judge:opus:high:V1:n20:b01', 'judge:opus:high:V1:n20:b02', 'judge:opus:high:V1:n20:b03']);
  assert.ok(jobs.every(j => j.batch === 20 && j.variant === 'V1' && j.effort === 'high'));
  assert.ok(buildJobs(POOL, 'key-judge', config).every(j => j.batch === 10));
  const ten = new Set(buildJobs(POOL, 'key-judge', config).map(j => j.label));
  assert.ok(jobs.every(j => !ten.has(j.label)));
});

test('key-effort plan: the named variant at medium and xhigh for each model', () => {
  const jobs = buildJobs(POOL, 'key-effort', config, { variant: 'V2' });
  assert.equal(jobs.length, 3 * 2 * 6);
  assert.deepEqual([...new Set(jobs.map(j => j.effort))], ['medium', 'xhigh']);
  assert.ok(jobs.every(j => j.variant === 'V2'));
  assert.throws(() => buildJobs(POOL, 'key-effort', config), /needs --variant/);
  assert.throws(() => buildJobs(POOL, 'nope', config), /unknown plan nope/);
});

test('judge prompts list the 440 px copies, the tree, and the source name, and nothing of the owner', () => {
  const jobs = buildJobs(POOL, 'key-judge', config);
  const j = jobs.find(x => x.label === 'judge:opus:high:V1:b01');
  assert.ok(j.prompt.includes(`- p002: ${path.join(EVAL, 'images', 'app', 'key', 'p002.jpg')} | tree: ACRU species | source name: ACRU source`));
  for (const x of jobs) {
    assert.ok(!x.prompt.includes('https://x/'), `${x.label} lists a source URL`);
    assert.ok(!/owner|keep|step/i.test(x.prompt.split('\n').slice(1).join('\n')), `${x.label} names an owner field`);
  }
});

// The judge sets the part, so every PLHI photo names the depth feature, with the part it applies to.
test('judge and check prompts show only the codes, never a key or a part, and the job maps each code back', () => {
  const jobs = [...buildJobs(POOL, 'tracer', config), ...buildJobs(POOL, 'key-judge', config)].filter(j => j.kind !== 'rank');
  for (const j of jobs) {
    const body = j.prompt.split('\n').slice(1).join('\n');
    assert.ok(!/ACRU-|PLHI-|-leaf|-bark|-fruit/.test(body), `${j.label} shows a key`);
    assert.deepEqual(Object.values(j.codes).sort(), [...j.keys].sort());
    for (const [code, key] of Object.entries(j.codes)) assert.equal(codeOf.get(key), code);
  }
});

test('the photos of a judge call are in a fixed shuffled order, not in key order', () => {
  const jobs = buildJobs(POOL, 'key-judge', config).filter(j => j.model === 'opus' && j.variant === 'V1');
  const shown = j => j.prompt.split('\n').filter(l => l.startsWith('- ')).map(l => j.codes[l.slice(2, l.indexOf(':'))]);
  assert.deepEqual(shown(jobs[0]).sort(), [...jobs[0].keys].sort());
  assert.ok(jobs.some(j => shown(j).join() !== j.keys.join()), 'no call is shuffled');
  assert.deepEqual(shown(jobs[0]), shown(buildJobs(POOL, 'key-judge', config)[0]));
});

test('the depth feature goes on the PLHI photos only, for the part fruit', () => {
  const jobs = buildJobs(POOL, 'key-judge', config);
  const lines = jobs.filter(j => j.model === 'opus' && j.variant === 'V1').flatMap(j => j.prompt.split('\n')).filter(l => l.startsWith('- '));
  const withDepth = lines.filter(l => l.includes('when the part is fruit, also answer `two_heads`')).map(l => l.slice(2, l.indexOf(':')));
  assert.deepEqual(withDepth.sort(), POOL.cells.slice(3).flatMap(c => c.photos.map(p => p.code)).sort());
});

test('renderScript writes a pure-literal meta and the job list', () => {
  const jobs = buildJobs(POOL, 'tracer', config);
  const s = renderScript('tracer', jobs);
  const lines = s.split('\n');
  assert.ok(lines[0].startsWith('export const meta = {'));
  const meta = JSON.parse(lines[0].slice('export const meta = '.length));
  assert.equal(meta.name, 'intake-eval-tracer');
  assert.deepEqual(meta.phases.map(p => p.title), ['check', 'judge', 'rank']);
  const slim = JSON.parse(lines[1].slice('const JOBS = '.length));
  assert.equal(slim.length, jobs.length);
  assert.equal(slim[0].model, 'claude-opus-5-5');
  assert.equal(slim[0].effort, 'high');
  assert.ok(s.includes('agent(j.prompt, { label: j.label, phase: j.phase, model: j.model, effort: j.effort, schema: SCHEMAS[j.schema] })'));
  const schemas = JSON.parse(lines[2].slice('const SCHEMAS = '.length));
  assert.deepEqual(schemas, SCHEMAS);
});
