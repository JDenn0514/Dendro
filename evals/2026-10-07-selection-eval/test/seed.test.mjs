import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseTargets } from '../lib/seed.mjs';

const t = (name, good_old, n = 30) => ({ target: name, good_old, photos: Array.from({ length: n }, (_, i) => ({ key: `${name}-${i + 1}` })) });
const ALL = [
  ...Array.from({ length: 10 }, (_, i) => t(`R${i}`, 6 + i)),
  ...Array.from({ length: 5 }, (_, i) => t(`T${i}`, i)),
  t('SMALL1', 9, 10), t('SMALL2', 1, 23),
];

test('chooseTargets takes 6 rich and 4 thin eligible targets, and 2 rich plus 1 thin for P3', () => {
  const { chosen, p3 } = chooseTargets(ALL, 20261007);
  assert.equal(chosen.filter(x => x.kind === 'rich').length, 6);
  assert.equal(chosen.filter(x => x.kind === 'thin').length, 4);
  assert.ok(chosen.every(x => x.photos.length >= 24));
  assert.ok(chosen.filter(x => x.kind === 'rich').every(x => x.good_old >= 6));
  assert.ok(chosen.filter(x => x.kind === 'thin').every(x => x.good_old < 6));
  assert.equal(p3.length, 3);
  const kindOf = name => chosen.find(x => x.target === name)?.kind;
  assert.deepEqual(p3.map(kindOf), ['rich', 'rich', 'thin']);
});

test('chooseTargets gives the same answer for the same seed and any input order', () => {
  const a = chooseTargets(ALL, 7);
  const b = chooseTargets([...ALL].reverse(), 7);
  assert.deepEqual(a.chosen.map(x => x.target), b.chosen.map(x => x.target));
  assert.deepEqual(a.p3, b.p3);
});

test('chooseTargets throws when there are too few thin targets', () => {
  assert.throws(() => chooseTargets(ALL.filter(x => !x.target.startsWith('T')), 1), /not enough targets/);
});
