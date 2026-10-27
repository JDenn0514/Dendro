import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewOf, groupLine, rankSets } from '../lib/rank-jobs.mjs';

// A judge answer. step1: clear key features, whole, alone (difficulty step 1). Other kinds as named.
const A = (part, kind = 'step1', extra = {}) => {
  const keys = { leaf: ['shape', 'margin'], bark: ['texture', 'pattern'], fruit: ['kind', 'shape'] }[part];
  const pf = Object.fromEntries(keys.map(f => [f, 'clear']));
  const a = { part, photo_features: pf, whole: true, alone: true, too_close: part === 'bark' ? false : null, causes: [], reject: [], side: part === 'leaf' ? 'upper' : null };
  if (kind === 'step2') a.alone = false;
  if (kind === 'step3') a.photo_features = { ...pf, [keys[0]]: 'search' };
  if (kind === 'last') { a.photo_features = { ...pf, [keys[0]]: 'search' }; a.causes = ['light']; } // rejected by rule P's last line only
  if (kind === 'reject') a.reject = ['blur'];
  return { ...a, ...extra, photo_features: { ...a.photo_features, ...(extra.photo_features ?? {}) } };
};
const photos = (target, part, n) => Array.from({ length: n }, (_, i) => ({ key: `${target}-${part}-${i + 1}`, n: i + 1, part }));
const POOL = {
  set: 'key',
  cells: [
    { cell: 'ACRU-leaf', target: 'ACRU', part: 'leaf', species: 'Acer rubrum', photos: photos('ACRU', 'leaf', 6) },
    { cell: 'ACRU-fruit', target: 'ACRU', part: 'fruit', species: 'Acer rubrum', photos: photos('ACRU', 'fruit', 3) },
    { cell: 'ACSA3-leaf', target: 'ACSA3', part: 'leaf', species: 'Acer saccharum', photos: photos('ACSA3', 'leaf', 4) },
    { cell: 'LITU-leaf', target: 'LITU', part: 'leaf', species: 'Liriodendron tulipifera', photos: photos('LITU', 'leaf', 3) },
  ],
};

test('viewOf follows v1 spec section 3.7: twig or one leaf with the side, twig or picked fruit, close or far bark', () => {
  assert.equal(viewOf(A('leaf', 'step1', { photo_features: { arrangement: 'clear' } })), 'a leaf on a twig, upper side');
  assert.equal(viewOf(A('leaf', 'step1', { side: 'under', photo_features: { arrangement: 'search' } })), 'one leaf, under side');
  assert.equal(viewOf(A('fruit', 'step1', { photo_features: { hang: 'clear' } })), 'fruit on the twig');
  assert.equal(viewOf(A('fruit')), 'picked fruit');
  assert.equal(viewOf(A('bark')), 'close bark');
  assert.equal(viewOf(A('bark', 'step3', { photo_features: { texture: 'search' } })), 'far bark');
  assert.equal(viewOf(null), null);
});

test('groupLine: the most common view of the kept step 1 photos of the same part of the other species of the genus', () => {
  const answers = {
    'ACSA3-leaf-1': A('leaf', 'step1', { photo_features: { arrangement: 'clear' } }),
    'ACSA3-leaf-2': A('leaf', 'step1', { photo_features: { arrangement: 'clear' } }),
    'ACSA3-leaf-3': A('leaf'), // one leaf, upper side
    'ACSA3-leaf-4': A('leaf', 'step2', { photo_features: { arrangement: 'search' } }), // not step 1: does not count
  };
  assert.equal(groupLine(POOL, 'ACRU-leaf', answers), 'a leaf on a twig, upper side');
  // LITU has no genus mate in the set.
  assert.equal(groupLine(POOL, 'LITU-leaf', answers), null);
  // ACSA3 has no fruit cell, so no line for ACRU fruit.
  assert.equal(groupLine(POOL, 'ACRU-fruit', answers), null);
  // No kept step 1 photo: no line.
  assert.equal(groupLine(POOL, 'ACRU-leaf', { 'ACSA3-leaf-1': A('leaf', 'reject') }), null);
});

test('groupLine breaks a tie by the view met first in key order', () => {
  const answers = { 'ACSA3-leaf-1': A('leaf'), 'ACSA3-leaf-2': A('leaf', 'step1', { photo_features: { arrangement: 'clear' } }) };
  assert.equal(groupLine(POOL, 'ACRU-leaf', answers), 'one leaf, upper side');
});

test('rankSets R: the photos that rule K3 keeps, grouped by the difficulty step of rule P; the last-line rejects sit with step 3', () => {
  const answers = {
    'ACRU-leaf-1': A('leaf', 'step2'), 'ACRU-leaf-2': A('leaf'), 'ACRU-leaf-3': A('leaf', 'last'),
    'ACRU-leaf-4': A('leaf', 'reject'), 'ACRU-leaf-5': A('leaf', 'step3'), 'ACRU-leaf-6': A('fruit'), // a part error
    'ACRU-fruit-1': A('fruit'), 'ACRU-fruit-2': A('fruit', 'reject'), 'ACRU-fruit-3': null,
  };
  const sets = rankSets(POOL, answers);
  assert.deepEqual(sets['ACRU-leaf'], { 1: ['ACRU-leaf-2'], 2: ['ACRU-leaf-1'], 3: ['ACRU-leaf-3', 'ACRU-leaf-5'] });
  // One photo to rank: no agent.
  assert.equal(sets['ACRU-fruit'], undefined);
});

test('rankSets R: a thin-cell photo of rule P is a step 3 photo', () => {
  const answers = { 'ACRU-fruit-1': A('fruit', 'last'), 'ACRU-fruit-2': A('fruit', 'last'), 'ACRU-fruit-3': A('fruit', 'reject') };
  assert.deepEqual(rankSets(POOL, answers)['ACRU-fruit'], { 3: ['ACRU-fruit-1', 'ACRU-fruit-2'] });
});

test('rankSets FR: Haiku rejects under rule K3 drop out first', () => {
  const answers = { 'ACRU-leaf-1': A('leaf'), 'ACRU-leaf-2': A('leaf', 'step2'), 'ACRU-leaf-3': A('leaf', 'step3'), 'ACRU-leaf-4': A('leaf') };
  const filter = { 'ACRU-leaf-1': A('leaf'), 'ACRU-leaf-2': A('leaf', 'reject'), 'ACRU-leaf-3': A('leaf', 'last'), 'ACRU-leaf-4': null };
  assert.deepEqual(rankSets(POOL, answers, filter)['ACRU-leaf'], { 1: ['ACRU-leaf-1'], 3: ['ACRU-leaf-3'] });
});
