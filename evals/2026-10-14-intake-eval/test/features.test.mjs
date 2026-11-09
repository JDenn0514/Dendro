import { test } from 'node:test';
import assert from 'node:assert/strict';
import { featureSet, importFeatures, compareFeatures } from '../lib/features.mjs';

// A key pool of 4 species and 3 parts, 10 photos per cell: 40 photos per part.
const SPECIES = [['ACRU', 'Acer rubrum'], ['QUAL', 'Quercus alba'], ['PLHI', 'Platanus ×hispanica'], ['PLOC', 'Platanus occidentalis']];
const POOLS = { set: 'key', cells: SPECIES.flatMap(([t, name]) => ['leaf', 'bark', 'fruit'].map(part => ({
  cell: `${t}-${part}`, target: t, part, species: name,
  photos: Array.from({ length: 10 }, (_, i) => ({ key: `${t}-${part}-${String(i + 1).padStart(2, '0')}`, code: `p${t}${part}${i}`, source: 'iNaturalist', credit: { author: 'A', license: 'CC BY 4.0', origin: 'https://x' } })),
}))) };
const DEPTH = { PLHI: { fruit: 'two_heads' } };

test('the feature set has 20 photos of each part, each with an opaque id', () => {
  const set = featureSet(POOLS, { seed: 7, depthFeatures: DEPTH });
  for (const part of ['leaf', 'bark', 'fruit']) assert.equal(set.filter(p => p.part === part).length, 20, part);
  assert.equal(new Set(set.map(p => p.key)).size, 60);
  assert.deepEqual(set.map(p => p.id).sort(), Array.from({ length: 60 }, (_, i) => `f${String(i + 1).padStart(2, '0')}`));
});

test('the same seed gives the same set, and another seed gives another set', () => {
  const a = featureSet(POOLS, { seed: 7, depthFeatures: DEPTH }), b = featureSet(POOLS, { seed: 7, depthFeatures: DEPTH });
  assert.deepEqual(a, b);
  const c = featureSet(POOLS, { seed: 8, depthFeatures: DEPTH });
  assert.notDeepEqual(a.map(p => p.key).sort(), c.map(p => p.key).sort());
});

test('the ids do not follow the key order', () => {
  const set = featureSet(POOLS, { seed: 7, depthFeatures: DEPTH });
  const byId = [...set].sort((x, y) => x.id.localeCompare(y.id)).map(p => p.key);
  assert.notDeepEqual(byId, [...byId].sort());
});

test('each photo asks about the photo features of its part, wing for a samara, cap for an acorn, and the depth feature', () => {
  const set = featureSet(POOLS, { seed: 7, depthFeatures: DEPTH });
  const of = (t, part) => set.find(p => p.target === t && p.part === part)?.features;
  assert.deepEqual(of('ACRU', 'leaf'), ['shape', 'margin', 'venation', 'arrangement', 'size']);
  assert.deepEqual(of('QUAL', 'bark'), ['texture', 'pattern', 'colour']);
  assert.deepEqual(of('ACRU', 'fruit'), ['kind', 'shape', 'hang', 'wing']);
  assert.deepEqual(of('QUAL', 'fruit'), ['kind', 'shape', 'hang', 'cap']);
  assert.deepEqual(of('PLHI', 'fruit'), ['kind', 'shape', 'hang', 'two_heads']);
  assert.deepEqual(of('PLOC', 'fruit'), ['kind', 'shape', 'hang']);
});

// A full export: the owner answers yes on every odd question, no on the others.
const SET = featureSet(POOLS, { seed: 7, depthFeatures: DEPTH });
const fullDocs = () => Object.fromEntries(SET.map(p => [p.id, { answers: Object.fromEntries(p.features.map((f, i) => [f, i % 2 === 0])), at: '2026-11-04T10:00:00Z' }]));

test('the import gives each photo its key and a yes or no for each question', () => {
  const rows = importFeatures(fullDocs(), SET);
  assert.equal(rows.length, 60);
  const r = rows.find(x => x.target === 'ACRU' && x.part === 'fruit');
  assert.deepEqual(r.owner, { kind: true, shape: false, hang: true, wing: false });
  assert.match(r.key, /^ACRU-fruit-\d\d$/);
});

test('the import refuses an unknown id, a missing photo, a missing answer, an answer that is not yes or no, and an answer to a question not asked', () => {
  const id = SET[0].id, f = SET[0].features[0];
  const cases = [
    [d => { d.f99 = { answers: {} }; }, /f99: unknown id/],
    [d => { delete d[id]; }, new RegExp(`${id}: no answers`)],
    [d => { delete d[id].answers[f]; }, new RegExp(`${id}: no answer to ${f}`)],
    [d => { d[id].answers[f] = 'yes'; }, new RegExp(`${id}: ${f} is not yes or no`)],
    [d => { d[id].answers.colourful = true; }, new RegExp(`${id}: colourful was not asked`)],
  ];
  for (const [change, msg] of cases) {
    const d = fullDocs(); change(d);
    assert.throws(() => importFeatures(d, SET), msg);
  }
});

// Two photos, 5 questions. Worked by hand.
const ROWS = [
  { id: 'f01', key: 'A-leaf-01', part: 'leaf', features: ['shape', 'margin', 'arrangement'], owner: { shape: true, margin: true, arrangement: false } },
  { id: 'f02', key: 'A-bark-01', part: 'bark', features: ['texture', 'pattern'], owner: { texture: true, pattern: false } },
];
const ANSWERS = {
  'opus:high:V1:n20': {
    'A-leaf-01': { photo_features: { shape: 'clear', margin: 'search', arrangement: 'no' } }, // yes, no, no: 2 of 3 agree
    'A-bark-01': { photo_features: { texture: 'clear', pattern: 'no' } }, // yes, no: 2 of 2
  },
  'haiku:high:V1:n20': {
    'A-leaf-01': { photo_features: { shape: 'clear', margin: 'clear' } }, // arrangement left out: a no. 3 of 3
    'A-bark-01': null, // no answer: every question a no. texture disagrees: 1 of 2
  },
};

test('a photo feature at clear is a yes; search, no, a missing feature, and a missing answer are a no', () => {
  const c = compareFeatures(ROWS, ANSWERS);
  assert.deepEqual(c.setups['opus:high:V1:n20'].all, { n: 5, agree: 4, owner_yes: 3, model_yes: 2 });
  assert.deepEqual(c.setups['haiku:high:V1:n20'].all, { n: 5, agree: 4, owner_yes: 3, model_yes: 2 });
  assert.equal(c.setups['haiku:high:V1:n20'].no_answer, 1);
  // A question with no value from a judge that did answer the photo is counted apart, so the report can show it.
  assert.equal(c.setups['haiku:high:V1:n20'].left_out, 1);
  assert.equal(c.setups['opus:high:V1:n20'].left_out, 0);
  assert.deepEqual(c.setups['opus:high:V1:n20'].by_feature['leaf:margin'], { n: 1, agree: 0, owner_yes: 1, model_yes: 0 });
  assert.deepEqual(c.setups['haiku:high:V1:n20'].by_part.bark, { n: 2, agree: 1, owner_yes: 1, model_yes: 0 });
});

test('the models are compared in pairs on the same questions', () => {
  const c = compareFeatures(ROWS, ANSWERS);
  // opus: yes no no / yes no. haiku: yes yes no / no no. They agree on shape, arrangement, and pattern.
  assert.deepEqual(c.pairs['opus:high:V1:n20 | haiku:high:V1:n20'], { n: 5, agree: 3 });
  // All models agree with each other on 3 of 5 questions.
  assert.deepEqual(c.all_models, { n: 5, agree: 3 });
});
