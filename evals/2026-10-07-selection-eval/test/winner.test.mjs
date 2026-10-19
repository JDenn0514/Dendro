import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costLine, p3Diff, extras, summarizeRow, pickWinner, P3_LIMIT } from '../lib/score.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const six = ['a', 'b', 'c', 'd', 'e', 'f'];

test('costLine averages the per-target lines through the P3 and P2 points', () => {
  const line = costLine([
    { n3: 12, c3: { tokens: 30000, usd: 0.3 }, n2: 42, c2: { tokens: 90000, usd: 0.9 } },
    { n3: 12, c3: { tokens: 20000, usd: 0.2 }, n2: 32, c2: { tokens: 60000, usd: 0.6 } },
  ]);
  near(line.tokens.b, 2000);
  near(line.tokens.a, 1000);
  near(line.usd.b, 0.02);
  near(line.usd.a, 0.01);
});

test('p3Diff is half the symmetric difference of the two top 6 sets', () => {
  const first12 = Array.from({ length: 12 }, (_, i) => `k${String(i + 1).padStart(2, '0')}`);
  const good = ranked => Object.fromEntries(ranked.map(x => [x, 'good']));
  const p3 = { ranked: ['k01', 'k02', 'k03', 'k04', 'k05', 'k06', 'k07'], rejects: [], tags: good(['k01', 'k02', 'k03', 'k04', 'k05', 'k06', 'k07']) };
  const p2r = ['k02', 'k01', 'k03', 'k04', 'k08', 'k09', 'k05', 'k40'];
  const p2 = { ranked: p2r, rejects: ['k06'], tags: good(p2r) };
  assert.equal(p3Diff(p3, p2, first12), 2);
  assert.equal(p3Diff(p3, p3, first12), 0);
  // A hard tag takes a photo out of the top 6 on that side.
  assert.equal(p3Diff({ ...p3, tags: { ...p3.tags, k01: 'hard' } }, p3, first12), 1);
  assert.equal(P3_LIMIT, 1);
});

test('extras: with fewer than 6 picks and done, it counts the kept photos not in the picks', () => {
  assert.equal(extras(six, ['a', 'x'], true), 5);
  assert.equal(extras(['a', 'b'], ['a', 'b', 'c'], true), 0);
  // Fewer than 6 picks and not done: the picks are not every photo the owner would show.
  assert.equal(extras(six, ['a', 'x'], false), null);
});

test('extras: with 0 picks and done, every kept photo is an extra', () => {
  assert.equal(extras(['a', 'b', 'c'], [], true), 3);
  assert.equal(extras([], [], true), 0);
});

test('extras: a target with 6 picks has no extras score', () => {
  assert.equal(extras(six, ['a', 'b', 'x', 'y', 'z', 'w'], true), null);
  assert.equal(extras(six, ['a', 'b', 'x', 'y', 'z', 'w'], false), null);
});

test('summarizeRow gives the means, the splits, the short count, and the spread', () => {
  const r = summarizeRow('B20|opus', [
    { target: 'A', kind: 'rich', picks: six, seen: 20, cost: { tokens: 100, usd: 1 }, q: 0.5, x: null, hard_above: 2 },
    { target: 'B', kind: 'thin', picks: ['a', 'b', 'c'], seen: 30, cost: { tokens: 300, usd: 3 }, q: 1, x: 1, hard_above: 1 },
    { target: 'C', kind: 'thin', picks: [], seen: 10, cost: { tokens: 0, usd: 0 }, q: null, x: 0, hard_above: 0 },
  ], true);
  near(r.hard_above_mean, 1);
  assert.equal(r.hard_above_total, 3);
  assert.equal(r.unreliable, true);
  near(r.q_mean, 0.75);
  near(r.q_rich, 0.5);
  near(r.q_thin, 1);
  near(r.x_mean, 0.5);
  assert.equal(r.x_rich, null);
  near(r.x_thin, 0.5);
  assert.equal(r.short, 2);
  near(r.q_min, 0.5);
  near(r.q_max, 1);
  near(r.q_sd, 0.25);
  near(r.usd_mean, 4 / 3);
  near(r.seen_mean, 20);
});

test('summarizeRow skips a null hard_above, and gives null when every target is null', () => {
  const per = h => ({ target: 'A', kind: 'rich', picks: ['a'], seen: 10, cost: { tokens: 1, usd: 1 }, q: 1, x: null, hard_above: h });
  const some = summarizeRow('B|x', [per(2), per(null), per(4)]);
  near(some.hard_above_mean, 3);
  assert.equal(some.hard_above_total, 6);
  assert.equal(some.x_mean, null);
  const none = summarizeRow('A|x', [per(null), per(null)]);
  assert.equal(none.hard_above_mean, null);
  assert.equal(none.hard_above_total, null);
});

const row = (id, q, usd, unreliable = false, x = 0) => ({ id, q_mean: q, x_mean: x, usd_mean: usd, tokens_mean: usd * 1000, unreliable });

test('pickWinner: shortlist within 1/6 of Q*, cheapest is the candidate, unreliable rows left out', () => {
  const rows = [row('R1', 0.8, 1.0), row('R2', 0.7, 0.2), row('R3', 0.6, 0.05), row('R4', 0.9, 0.5, true)];
  const w = pickWinner(rows);
  near(w.qStar, 0.8);
  near(w.eStar, 0);
  assert.deepEqual(w.shortlist, ['R2', 'R1']);
  assert.deepEqual(w.excluded, ['R4']);
  assert.equal(w.candidate, 'R2');
  assert.equal(w.best, 'R1');
  assert.equal(w.next, null);
  const w2 = pickWinner([...rows, row('R5', 0.75, 0.3)]);
  assert.deepEqual(w2.shortlist, ['R2', 'R5', 'R1']);
  assert.equal(w2.next, 'R5');
});

test('pickWinner: a row with top quality but more than E* + 1 extras is left off the shortlist', () => {
  const rows = [row('Q1', 0.9, 1.0, false, 3), row('Q2', 0.8, 0.5, false, 1), row('Q3', 0.75, 0.1, false, 2.5), row('Q4', 0.5, 0.01, false, 0), row('Q5', 0.95, 0.02, true, 0)];
  const w = pickWinner(rows);
  near(w.qStar, 0.9);
  near(w.eStar, 0);
  assert.deepEqual(w.shortlist, ['Q2']);
  assert.deepEqual(w.excluded, ['Q5']);
  assert.equal(w.candidate, 'Q2');
  // The best-quality row goes to the blind check, though it is off the shortlist.
  assert.equal(w.best, 'Q1');
  assert.equal(w.next, null);
  assert.equal(w.blind_needed, true);
});

test('pickWinner: a set blind opponent replaces best, and the highest-Q row stays as best_quality', () => {
  const rows = [row('R1', 0.8, 1.0), row('R2', 0.7, 0.2), row('R3', 0.6, 0.05), row('R5', 0.75, 0.3)];
  const plain = pickWinner(rows);
  assert.equal(plain.best, 'R1');
  assert.equal(plain.best_quality, 'R1');
  const w = pickWinner(rows, { opponent: 'R5' });
  assert.equal(w.candidate, 'R2');
  assert.equal(w.best, 'R5');
  assert.equal(w.best_quality, 'R1');
  // Next skips the candidate and the opponent.
  assert.equal(w.next, 'R1');
  assert.equal(w.blind_needed, true);
  assert.throws(() => pickWinner(rows, { opponent: 'R9' }), /R9/);
});

// per: { target: picks }.
const rowP = (id, q, usd, per) => ({ ...row(id, q, usd), per: Object.entries(per).map(([target, picks]) => ({ target, picks })) });

test('pickWinner: a row with the same picks as the candidate or the best row on every target is not chosen as next', () => {
  const rows = [
    rowP('C1', 0.8, 0.1, { T1: ['a', 'b'], T2: ['c'] }),
    rowP('D1', 0.8, 0.2, { T1: ['b', 'a'], T2: ['c'] }),
    rowP('B2', 0.85, 0.3, { T1: ['a'], T2: ['d'] }),
    rowP('N1', 0.8, 0.5, { T1: ['a', 'b'], T2: ['e'] }),
    rowP('B1', 0.9, 1.0, { T1: ['a'], T2: ['d'] }),
  ];
  const w = pickWinner(rows);
  assert.equal(w.candidate, 'C1');
  assert.equal(w.best, 'B1');
  assert.equal(w.next, 'N1');
  assert.equal(w.blind_needed, true);
});

test('pickWinner: blind_needed is false when the candidate is the best row, has its picks, or is null', () => {
  const same = pickWinner([row('R1', 0.9, 0.1), row('R2', 0.8, 0.2)]);
  assert.equal(same.candidate, 'R1');
  assert.equal(same.best, 'R1');
  assert.equal(same.blind_needed, false);
  const twin = pickWinner([rowP('S1', 0.8, 0.1, { T1: ['a'] }), rowP('S2', 0.8, 0.5, { T1: ['a'] })]);
  assert.equal(twin.candidate, 'S1');
  assert.equal(twin.best, 'S1');
  assert.equal(twin.blind_needed, false);
  const dup = pickWinner([rowP('P1', 0.8, 0.1, { T1: ['a'] }), rowP('P2', 0.85, 0.5, { T1: ['a'] })]);
  assert.equal(dup.candidate, 'P1');
  assert.equal(dup.best, 'P2');
  assert.equal(dup.blind_needed, false);
  const empty = pickWinner([row('Q1', 0.9, 1.0, false, 3), row('Q4', 0.5, 0.01, false, 0)]);
  assert.equal(empty.candidate, null);
  assert.equal(empty.next, null);
  assert.equal(empty.blind_needed, false);
});
