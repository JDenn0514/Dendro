import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayA, replayB, replayC, lineAt } from '../lib/replay.mjs';

const k = n => `k${String(n).padStart(2, '0')}`;
const POOL = Array.from({ length: 25 }, (_, i) => k(i + 1));
const unit = Object.fromEntries(POOL.map(x => [x, { tokens: 1, usd: 0.01 }]));
const LINE = { tokens: { a: 100, b: 10 }, usd: { a: 1, b: 0.1 } };
// A ranking with every photo tagged good, except the keys in `hard`.
const rk = (ranked, rejects = [], hard = []) => ({ ranked, rejects, tags: Object.fromEntries(ranked.map(x => [x, hard.includes(x) ? 'hard' : 'good'])) });
const RANK = rk([k(20), k(3), k(11), k(25), k(7), k(1), k(14), k(9), k(2), k(16)], [k(5), k(12)]);
const RANK2 = rk([...POOL]);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('A stops after the batch that brings the good count to 6', () => {
  const p1 = Object.fromEntries(POOL.map(x => [x, 'hard']));
  for (const n of [2, 5, 9, 12, 15, 18, 19, 22]) p1[k(n)] = 'good';
  const r = replayA(POOL, p1, unit);
  assert.deepEqual(r.picks, [k(2), k(5), k(9), k(12), k(15), k(18)]);
  assert.equal(r.seen, 20);
  assert.equal(r.hardAbove, null);
  near(r.cost.tokens, 20);
  near(r.cost.usd, 0.2);
});

test('A walks the whole pool when it never reaches 6, and a missing verdict is not good', () => {
  const r = replayA(POOL, { [k(4)]: 'good', [k(24)]: 'good', [k(6)]: 'hard' }, unit);
  assert.deepEqual(r.picks, [k(4), k(24)]);
  assert.equal(r.seen, 25);
});

test('B(K) ranks the first K photos without the rejects, cost from the line at K', () => {
  const r = replayB(POOL, 12, RANK, LINE);
  assert.deepEqual(r.picks, [k(3), k(11), k(7), k(1), k(9), k(2)]);
  assert.equal(r.seen, 12);
  near(r.cost.tokens, 220);
  near(r.cost.usd, 2.2);
  const all = replayB(POOL, 'all', RANK, LINE);
  assert.deepEqual(all.picks, [k(20), k(3), k(11), k(25), k(7), k(1)]);
  near(all.cost.tokens, 350);
});

test('B drops a photo that is in both ranked and rejects', () => {
  const r = replayB(POOL, 12, { ...RANK, rejects: [k(3)] }, LINE);
  assert.ok(!r.picks.includes(k(3)));
});

test('B and C do not keep a hard photo ranked first, and count it above the sixth kept photo', () => {
  const rank = rk([k(3), k(11), k(7), k(1), k(9), k(2), k(4)], [], [k(3)]);
  const b = replayB(POOL, 12, rank, LINE);
  assert.deepEqual(b.picks, [k(11), k(7), k(1), k(9), k(2), k(4)]);
  assert.equal(b.hardAbove, 1);
  const c = replayC(POOL, rank, LINE);
  assert.ok(!c.picks.includes(k(3)));
  assert.equal(c.hardAbove, 1);
});

test('a target with fewer than 6 good photos keeps fewer than 6', () => {
  const rank = rk([k(1), k(2), k(3), k(4), k(5)], [], [k(2), k(5)]);
  const b = replayB(POOL, 'all', rank, LINE);
  assert.deepEqual(b.picks, [k(1), k(3), k(4)]);
  assert.equal(b.hardAbove, 1);
  // C holds only 3 good photos, so it does not stop at 24 when the top stays the same; it runs to the end.
  const c = replayC(POOL, rank, LINE);
  assert.deepEqual(c.picks, [k(1), k(3), k(4)]);
  assert.equal(c.seen, 25);
  near(c.cost.tokens, 350);
  const a = replayA(POOL, { [k(1)]: 'good', [k(2)]: 'hard', [k(3)]: 'good' }, unit);
  assert.deepEqual(a.picks, [k(1), k(3)]);
  assert.equal(a.hardAbove, null);
});

test('B with K above the pool size uses the whole pool', () => {
  assert.equal(replayB(POOL, 30, RANK, LINE).seen, 25);
});

test('C stops when a new batch of 12 does not change the top 6', () => {
  const r = replayC(POOL, RANK2, LINE);
  assert.deepEqual(r.picks, [k(1), k(2), k(3), k(4), k(5), k(6)]);
  assert.equal(r.seen, 24);
  near(r.cost.tokens, 340);
});

test('C runs to the end of the pool when the top 6 keeps changing', () => {
  const r = replayC(POOL, RANK, LINE);
  assert.equal(r.seen, 25);
  assert.deepEqual(r.picks, [k(20), k(3), k(11), k(25), k(7), k(1)]);
});

test('lineAt is a + b * n', () => {
  const c = lineAt(LINE, 3);
  near(c.tokens, 130);
  near(c.usd, 1.3);
});
