import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPicks } from '../lib/picks.mjs';

const pools = { targets: [{ target: 'A', photos: ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06', 'A-07'].map(key => ({ key })) }, { target: 'B', photos: [{ key: 'B-01' }] }] };

test('a complete picks file has no problems', () => {
  const picks = { targets: { A: { picks: ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06'], done: false }, B: { picks: [], done: true } } };
  assert.deepEqual(checkPicks(pools, picks), []);
});

test('checkPicks names each problem', () => {
  const picks = { targets: { A: { picks: ['A-01', 'A-01', 'Z-09'], done: false } } };
  const p = checkPicks(pools, picks).join('\n');
  assert.match(p, /A: a photo is picked twice/);
  assert.match(p, /A: Z-09 is not in the pool/);
  assert.match(p, /A: 3 picks and not marked done/);
  assert.match(p, /B: no picks/);
});

test('checkPicks names more than 6 picks', () => {
  const picks = { targets: { A: { picks: ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06', 'A-07'], done: true }, B: { picks: [], done: true } } };
  assert.deepEqual(checkPicks(pools, picks), ['A: 7 picks, more than 6']);
});
