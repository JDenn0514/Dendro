import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJobs, renderScript, MODELS } from '../make-workflow.mjs';
import { SCHEMAS } from '../lib/schemas.mjs';

const photos = (t, n) => Array.from({ length: n }, (_, i) => ({ key: `${t}-${String(i + 1).padStart(2, '0')}`, n: i + 1, abs: `/x/${t}/${i + 1}.jpg` }));
const config = {
  tracer_model: 'haiku',
  effort: { opus: 'high', sonnet: 'high', haiku: 'high' },
  model_opt: { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' },
};

test('tracer plan: P0 for 3 full IDs and the short name haiku, P1 batches of 10, one P2', () => {
  const jobs = buildJobs({ p3: [], targets: [{ target: 'QUAC2', species: 'Q', photos: photos('QUAC2', 43) }] }, 'tracer', config);
  assert.deepEqual(jobs.filter(j => j.pass === 'P0' && !j.check_only).map(j => j.model), MODELS);
  const alias = jobs.find(j => j.check_only);
  assert.equal(alias.label, 'P0:haiku-alias');
  assert.equal(alias.model_opt, 'haiku');
  assert.equal(jobs.find(j => j.pass === 'P0').keys.length, 2);
  const p1 = jobs.filter(j => j.pass === 'P1');
  assert.deepEqual(p1.map(j => j.keys.length), [10, 10, 10, 10, 3]);
  assert.ok(p1.every(j => j.model === 'haiku' && j.model_opt === 'claude-haiku-5-5'));
  assert.ok(jobs.every(j => j.effort === 'high'));
  assert.equal(jobs.filter(j => j.pass === 'P2').length, 1);
  assert.equal(jobs.length, 10);
  assert.equal(new Set(jobs.map(j => j.label)).size, jobs.length);
});

test('P0 and P1 prompts list the app-size copies; P2 lists sheets and keys only', () => {
  const jobs = buildJobs({ p3: [], targets: [{ target: 'QUAC2', species: 'Q', photos: photos('QUAC2', 12) }] }, 'tracer', config);
  for (const j of jobs.filter(x => x.pass === 'P0' || x.pass === 'P1')) {
    assert.ok(/\/images\/QUAC2\/\d+\.jpg/.test(j.prompt), j.label);
    assert.ok(!j.prompt.includes('/x/'), `${j.label} lists an original`);
  }
  const p1 = jobs.find(j => j.label === 'P1:haiku:QUAC2:b2');
  assert.ok(p1.prompt.includes('- QUAC2-11: ') && p1.prompt.includes('/images/QUAC2/11.jpg') && p1.prompt.includes('/images/QUAC2/12.jpg'));
  assert.ok(!p1.prompt.includes('/images/QUAC2/10.jpg'));
  const p2 = jobs.find(j => j.pass === 'P2');
  assert.ok(!p2.prompt.includes('/images/') && !p2.prompt.includes('/x/'));
});

test('full plan: P1 and P2 for every model and target, P3 on the P3 targets with 12 photos', () => {
  const pools = { p3: ['B'], targets: [{ target: 'A', photos: photos('A', 25) }, { target: 'B', photos: photos('B', 31) }] };
  const jobs = buildJobs(pools, 'full', config);
  assert.equal(jobs.filter(j => j.pass === 'P1').length, 3 * (3 + 4));
  assert.equal(jobs.filter(j => j.pass === 'P2').length, 6);
  const p3 = jobs.filter(j => j.pass === 'P3');
  assert.equal(p3.length, 3);
  assert.ok(p3.every(j => j.target === 'B' && j.keys.length === 12));
  assert.ok(p3[0].prompt.includes('/sheets/B/first12-2.jpg'));
});

test('renderScript writes a pure-literal meta and the job list', () => {
  const jobs = buildJobs({ p3: [], targets: [{ target: 'T', photos: photos('T', 3) }] }, 'tracer', config);
  const s = renderScript('selection-eval-tracer', jobs);
  const lines = s.split('\n');
  assert.ok(lines[0].startsWith('export const meta = {'));
  const meta = JSON.parse(lines[0].slice('export const meta = '.length));
  assert.equal(meta.name, 'selection-eval-tracer');
  assert.deepEqual(meta.phases.map(p => p.title), ['P0', 'P1', 'P2']);
  const slim = JSON.parse(lines[1].slice('const JOBS = '.length));
  assert.equal(slim.length, jobs.length);
  assert.equal(slim[0].model, 'claude-opus-5-5');
  assert.equal(slim[0].effort, 'high');
  assert.ok(s.includes('agent(j.prompt, { label: j.label, phase: j.phase, model: j.model, effort: j.effort, schema: SCHEMAS[j.schema] })'));
  const tagged = SCHEMAS.RANK.properties.ranked.items;
  assert.deepEqual(tagged.required, ['key', 'tag']);
  assert.deepEqual(tagged.properties.tag.enum, ['good', 'hard']);
  assert.ok(s.includes('"enum":["good","hard"]'));
});
