import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speciesPools, heldoutOwner } from '../lib/heldout.mjs';
import { replayCR } from '../lib/replay.mjs';
import { KEY_FEATURES, OTHER_FEATURES } from '../lib/step.mjs';

const clear = part => Object.fromEntries([...KEY_FEATURES[part], ...OTHER_FEATURES[part]].map(f => [f, 'clear']));
const ans = part => ({
  part, photo_features: part === 'other' ? {} : clear(part), whole: true, alone: true, too_close: false, causes: [],
  reject: [], usual_look: false, scale: 'none', escalate: 'none',
});
const photo = (key, n) => ({ key, n, part: null, source: 'iNaturalist', source_species: 'Quercus laurifolia' });

test('a held-out species pool has the cells leaf, bark, and fruit, set by the judge\'s part', () => {
  const pools = { set: 'heldout', cells: [{ cell: 'QULA', target: 'QULA', part: null, species: 'Quercus laurifolia', photos: [photo('QULA-02', 2), photo('QULA-01', 1), photo('QULA-03', 3)] }] };
  const [s] = speciesPools(pools);
  assert.deepEqual(s.parts, ['leaf', 'bark', 'fruit']);
  assert.deepEqual(s.photos.map(p => p.key), ['QULA-01', 'QULA-02', 'QULA-03']);
  const answers = { 'QULA-01': ans('bark'), 'QULA-02': ans('leaf'), 'QULA-03': ans('other') };
  const r = replayCR(s, { K: 'all', answers, cost: {}, rule: 'P', quota: { 1: 3, 2: 3, 3: 2, usual_look_min: 0 } });
  assert.deepEqual(Object.keys(r.cells), ['QULA-leaf', 'QULA-bark', 'QULA-fruit']);
  assert.deepEqual(r.cells['QULA-bark'][1], ['QULA-01']);
  assert.deepEqual(r.cells['QULA-leaf'][1], ['QULA-02']);
});

test('a key species pool keeps its own cells and interleaves them by the key number', () => {
  const pools = { set: 'key', cells: [
    { cell: 'ACRU-leaf', target: 'ACRU', part: 'leaf', photos: [{ key: 'ACRU-leaf-01', n: 1, part: 'leaf', owner: {} }, { key: 'ACRU-leaf-02', n: 2, part: 'leaf' }] },
    { cell: 'ACRU-bark', target: 'ACRU', part: 'bark', photos: [{ key: 'ACRU-bark-01', n: 1, part: 'bark' }] },
  ] };
  const [s] = speciesPools(pools);
  assert.deepEqual(s.parts, ['leaf', 'bark']);
  assert.deepEqual(s.photos.map(p => p.key), ['ACRU-leaf-01', 'ACRU-bark-01', 'ACRU-leaf-02']);
});

test('the owner\'s held-out labels: the part other is a drop', () => {
  const owner = heldoutOwner({
    a: { part: 'leaf', keep: true, step: 2, at: 'x' },
    b: { part: 'other', keep: true, step: 1, at: 'x' },
    c: { part: 'bark', keep: false, step: null, at: 'x' },
  });
  assert.deepEqual(owner, {
    a: { part: 'leaf', keep: true, step: 2 },
    b: { part: 'other', keep: false, step: null },
    c: { part: 'bark', keep: false, step: null },
  });
});
