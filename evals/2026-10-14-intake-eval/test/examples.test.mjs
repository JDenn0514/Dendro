import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateExamples, relabelSet } from '../lib/examples.mjs';

const owner = {
  a: { keep: true, step: 2 }, b: { keep: true, step: 1 }, c: { keep: true, step: 2 },
  d: { keep: true, step: 3 }, e: { keep: false, step: null }, f: { keep: true, step: 1 }, g: { keep: false, step: null, doubt: true },
};
const s = (keep, step = null, line = null) => ({ keep, step, line });
const steps = [
  new Map([['a', s(true, 1)], ['b', s(true, 2)], ['c', s(true, 1)], ['d', s(true, 3)], ['e', s(true, 2)], ['f', s(false, null, 'reject_list')], ['g', s(true, 1)]]),
  new Map([['a', s(true, 1)], ['b', s(true, 2)], ['c', s(true, 2)], ['d', s(true, 3)], ['e', s(true, 1)], ['f', s(false, null, 'key_no')], ['g', s(true, 1)]]),
];

test('the step examples are the photos all keep where the set-ups agree on a step that is not the owner\'s', () => {
  const x = gateExamples(Object.keys(owner), owner, steps);
  assert.deepEqual(x.step.map(e => [e.key, e.owner, e.judged]), [['a', 2, 1], ['b', 1, 2]]);
});

test('the keep examples are the photos where every set-up disagrees with the owner on keep', () => {
  const x = gateExamples(Object.keys(owner), owner, steps);
  assert.deepEqual(x.dropped.map(e => e.key), ['f']);
  assert.deepEqual(x.kept.map(e => e.key), ['e']);
});

test('a photo with a species doubt or no owner call is no example', () => {
  const x = gateExamples(['g', 'zz'], owner, steps);
  assert.deepEqual([x.step, x.kept, x.dropped], [[], [], []]);
});

test('the relabel set is every photo where any set-up differs from the owner, less the photos already reviewed', () => {
  const x = relabelSet(Object.keys(owner), owner, steps, new Set(['a']));
  // b, c, e, f differ; a is reviewed; d agrees; g has a species doubt.
  assert.deepEqual(x, ['b', 'c', 'e', 'f']);
  const one = [new Map([['c', s(true, 2)], ['d', s(true, 2)]])];
  assert.deepEqual(relabelSet(['c', 'd'], owner, one, new Set()), ['d']);
});
