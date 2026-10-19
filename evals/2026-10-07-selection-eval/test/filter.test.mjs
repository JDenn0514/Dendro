import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayFilterB, replayFilterC, survivors } from '../lib/replay.mjs';

const k = n => `k${String(n).padStart(2, '0')}`;
const pool = n => Array.from({ length: n }, (_, i) => k(i + 1));
const POOL = pool(25);
const unit = Object.fromEntries(pool(40).map(x => [x, { tokens: 1, usd: 0.01 }]));
const LINE = { tokens: { a: 100, b: 10 }, usd: { a: 1, b: 0.1 } };
const rk = (ranked, rejects = [], hard = []) => ({ ranked, rejects, tags: Object.fromEntries(ranked.map(x => [x, hard.includes(x) ? 'hard' : 'good'])) });
const RANK = rk([k(20), k(3), k(11), k(25), k(7), k(1), k(14), k(9), k(2), k(16)], [k(5), k(12)]);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const F = Object.fromEntries(POOL.map(x => [x, 'hard']));
Object.assign(F, { [k(1)]: 'reject', [k(2)]: 'reject', [k(3)]: 'escalate', [k(10)]: 'good' });
delete F[k(4)];

test('survivors drop reject, escalate, and unread, and keep fetch order', () => {
  assert.deepEqual(survivors(POOL, F), pool(25).slice(4));
});

test('filter then B(12): the filter stops after the batch of the 12th survivor', () => {
  const r = replayFilterB(POOL, 12, F, unit, RANK, LINE);
  assert.equal(r.ranked, 12);
  assert.equal(r.seen, 20);
  assert.deepEqual(r.picks, [k(11), k(7), k(14), k(9), k(16)]);
  near(r.cost.tokens, 20 + 220);
  near(r.cost.usd, 0.2 + 2.2);
});

test('filter then B(all) or B(K above the survivors) judges the whole pool', () => {
  for (const K of ['all', 30]) {
    const r = replayFilterB(POOL, K, F, unit, RANK, LINE);
    assert.equal(r.ranked, 21);
    assert.equal(r.seen, 25);
    assert.deepEqual(r.picks, [k(20), k(11), k(25), k(7), k(14), k(9)]);
    near(r.cost.tokens, 25 + 310);
  }
});

test('filter then C that uses every survivor judges the whole pool', () => {
  const r = replayFilterC(POOL, F, unit, rk([...POOL]), LINE);
  assert.equal(r.ranked, 21);
  assert.equal(r.seen, 25);
  assert.deepEqual(r.picks, pool(10).slice(4));
  near(r.cost.tokens, 25 + 310);
});

test('filter then C that stops early: the filter stops after the batch of the last survivor used', () => {
  const P40 = pool(40);
  const f = Object.fromEntries(P40.map((x, i) => [x, i < 4 ? 'reject' : 'hard']));
  const r = replayFilterC(P40, f, unit, rk([...P40]), LINE);
  assert.equal(r.ranked, 24);
  assert.equal(r.seen, 30);
  near(r.cost.tokens, 30 + 340);
});

test('filter first keeps good photos only: a hard photo ranked first is not kept', () => {
  const rank = rk([k(5), k(6), k(7), k(8), k(9), k(10), k(11)], [], [k(5)]);
  for (const r of [replayFilterB(POOL, 12, F, unit, rank, LINE), replayFilterC(POOL, F, unit, rank, LINE)]) {
    assert.deepEqual(r.picks, [k(6), k(7), k(8), k(9), k(10), k(11)]);
    assert.equal(r.hardAbove, 1);
  }
});

test('no survivors: no picks, the ranker costs nothing', () => {
  const none = Object.fromEntries(POOL.map(x => [x, 'reject']));
  for (const r of [replayFilterB(POOL, 12, none, unit, RANK, LINE), replayFilterC(POOL, none, unit, RANK, LINE)]) {
    assert.deepEqual(r.picks, []);
    assert.equal(r.ranked, 0);
    assert.equal(r.hardAbove, 0);
    near(r.cost.tokens, 25);
  }
});
