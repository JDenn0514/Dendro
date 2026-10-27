import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_FEATURES, OTHER_FEATURES } from '../lib/step.mjs';
import { judgeSteps, joinedOrder, lineAt, replayS, replayF, replayR, replayFR, replayCR } from '../lib/replay.mjs';

// The answers of one photo. Kinds: s1 (difficulty step 1), u1 (step 1, usual look), s2, s3, rej (a reject),
// last (rejected by the last reject line only: kept at difficulty step 3 under rule K3).
function ans(part, kind, extra = {}) {
  const photo_features = {};
  for (const f of [...KEY_FEATURES[part], ...OTHER_FEATURES[part]]) photo_features[f] = 'clear';
  const a = {
    part, photo_features, whole: true, alone: true, too_close: part === 'bark' ? false : null, side: null,
    causes: [], scale: 'none', season: 'summer', growth_stage: 'mature', usual_look: kind === 'u1',
    not_for: [], reject: [], escalate: 'none', note: '', ...extra,
  };
  if (kind === 's2') a.alone = false;
  if (kind === 's3') a.causes = ['angle'];
  if (kind === 'rej') a.reject = ['blur'];
  if (kind === 'last') { a.photo_features[KEY_FEATURES[part][0]] = 'search'; a.causes = ['angle']; }
  return a;
}

const k = i => `T-${String(i).padStart(2, '0')}`;
// A pool of `size` photos of one part, in fetch order. kinds: { <index>: kind }; every other photo is a reject.
function pool(size, kinds, { part = 'leaf', parts = [part] } = {}) {
  const photos = [], answers = {}, cost = {};
  for (let i = 1; i <= size; i++) {
    photos.push({ key: k(i), n: i, part, source: i % 2 ? 'iNaturalist' : 'Bioimages' });
    answers[k(i)] = ans(part, kinds[i] ?? 'rej');
    cost[k(i)] = { tokens: 100, usd: 0.01 };
  }
  return { pool: { target: 'T', parts, photos }, answers, cost };
}
const haikuOf = (p, rejects) => {
  const answers = {}, cost = {};
  for (const ph of p.photos) {
    answers[ph.key] = ans(ph.part, rejects.includes(ph.key) ? 'rej' : 's2');
    cost[ph.key] = { tokens: 10, usd: 0.001 };
  }
  return { answers, cost };
};
const Q = { 1: 2, 2: 2, 3: 1, usual_look_min: 0 };
const close = (x, y) => assert.ok(Math.abs(x - y) < 1e-9, `${x} is not ${y}`);

test('S stops after the call that fills every quota, and keeps the first photos in fetch order', () => {
  const { pool: p, answers, cost } = pool(25, { 1: 's1', 2: 's1', 3: 's2', 4: 's2', 6: 's1', 12: 's3', 15: 's3', 22: 's2' });
  const r = replayS(p, { answers, cost, rule: 'P', quota: Q });
  assert.equal(r.judged, 20);
  assert.deepEqual(r.cells['T-leaf'], { 1: [k(1), k(2)], 2: [k(3), k(4)], 3: [k(12)] });
  assert.deepEqual(r.filled['T-leaf'], { 1: true, 2: true, 3: true });
  close(r.cost.usd, 0.2);
  assert.equal(r.cost.tokens, 2000);
});

test('S goes to the end of the pool when a part never fills', () => {
  const { pool: p, answers, cost } = pool(25, { 1: 's1', 2: 's1', 3: 's2', 4: 's2', 5: 's3' }, { parts: ['leaf', 'fruit'] });
  const r = replayS(p, { answers, cost, rule: 'P', quota: Q });
  assert.equal(r.judged, 25);
  assert.deepEqual(r.filled['T-fruit'], { 1: false, 2: false, 3: false });
  assert.deepEqual(r.cells['T-fruit'], { 1: [], 2: [], 3: [] });
});

test('the usual-look rule swaps a photo into difficulty step 1, and S goes on until it holds', () => {
  const { pool: p, answers, cost } = pool(25, { 1: 's1', 2: 's1', 3: 'u1', 4: 's2', 5: 's2', 6: 's3', 15: 'u1', 16: 'u1' });
  const r = replayS(p, { answers, cost, rule: 'P', quota: { ...Q, usual_look_min: 2 } });
  assert.equal(r.judged, 20);
  assert.deepEqual(r.cells['T-leaf'][1], [k(3), k(15)]);
  const one = replayS(p, { answers, cost, rule: 'P', quota: { ...Q, usual_look_min: 1 } });
  assert.equal(one.judged, 10);
  assert.deepEqual(one.cells['T-leaf'][1], [k(1), k(3)]);
});

test('F pays for Haiku on every photo and for the main model on the calls of 10 it reads', () => {
  const { pool: p, answers, cost } = pool(25, { 1: 's1', 6: 's1', 7: 's1', 8: 's2', 9: 's2', 10: 's3', 11: 's2' });
  const filter = haikuOf(p, [k(1), k(2), k(3), k(4), k(5)]);
  const r = replayF(p, { filter, answers, cost, rule: 'P', quota: Q });
  assert.equal(r.filtered, 25);
  assert.equal(r.judged, 10);
  close(r.cost.usd, 25 * 0.001 + 10 * 0.01);
  assert.deepEqual(r.cells['T-leaf'], { 1: [k(6), k(7)], 2: [k(8), k(9)], 3: [k(10)] });
});

test('the joined order puts difficulty step 1, then 2, then 3', () => {
  assert.deepEqual(joinedOrder({ orders: { 3: ['c'], 1: ['a'], 2: ['b'] }, unread: [] }), ['a', 'b', 'c']);
  assert.deepEqual(joinedOrder({ orders: { all: ['z', 'y'] }, unread: ['x'] }), ['z', 'y']);
  assert.deepEqual(joinedOrder(undefined), []);
});

test('R at K = 20 judges only the first 20 photos and keeps the ranking order inside each difficulty step', () => {
  const { pool: p, answers, cost } = pool(25, { 2: 's1', 5: 's1', 9: 's1', 12: 's2', 22: 's1' });
  const rank = { 'T-leaf': { orders: { 1: [k(22), k(9), k(2), k(5)], 2: [k(12)] }, unread: [] } };
  const line = { tokens: { a: 100, b: 10 }, usd: { a: 0.1, b: 0.01 } };
  const r = replayR(p, { K: 20, answers, cost, rule: 'P', quota: Q, rank, line });
  assert.equal(r.judged, 20);
  assert.equal(r.ranked, 4);
  assert.equal(r.unranked, 0);
  assert.deepEqual(r.cells['T-leaf'][1], [k(9), k(2)]);
  close(r.cost.usd, 20 * 0.01 + 0.1 + 0.04);
  assert.equal(r.cost.tokens, 2000 + 140);
  assert.equal(replayR(p, { K: 'all', answers, cost, rule: 'P', quota: Q, rank, line }).judged, 25);
});

test('the joined order holds under rule K3: a photo of the last reject line ranks in difficulty step 3', () => {
  const { pool: p, answers, cost } = pool(10, { 1: 's1', 2: 's3', 3: 'last', 4: 's3' });
  const rank = { 'T-leaf': { orders: { 1: [k(1)], 3: [k(3), k(4), k(2)] }, unread: [] } };
  const line = lineOf(0, 0);
  const quota = { ...Q, 3: 2 };
  assert.deepEqual(replayR(p, { K: 'all', answers, cost, rule: 'K3', quota, rank, line }).cells['T-leaf'][3], [k(3), k(4)]);
  assert.deepEqual(replayR(p, { K: 'all', answers, cost, rule: 'P', quota, rank, line }).cells['T-leaf'][3], [k(4), k(2)]);
});
function lineOf(a, b) { return { tokens: { a, b }, usd: { a, b } }; }

test('R puts photos the ranker left out after the ranked ones, and counts a cell with no ranking', () => {
  const { pool: p, answers, cost } = pool(10, { 1: 's1', 2: 's1', 3: 's1' });
  const r = replayR(p, { K: 'all', answers, cost, rule: 'P', quota: Q, rank: { 'T-leaf': { orders: { 1: [k(3)] }, unread: [k(1), k(2)] } }, line: lineOf(0, 0) });
  assert.deepEqual(r.cells['T-leaf'][1], [k(3), k(1)]);
  const none = replayR(p, { K: 'all', answers, cost, rule: 'P', quota: Q, rank: {}, line: lineOf(0, 0) });
  assert.equal(none.unranked, 1);
  assert.deepEqual(none.cells['T-leaf'][1], [k(1), k(2)]);
});

test('R has no cost when there is no ranking cost line', () => {
  const { pool: p, answers, cost } = pool(10, { 1: 's1', 2: 's1' });
  assert.equal(replayR(p, { K: 'all', answers, cost, rule: 'P', quota: Q, rank: {}, line: null }).cost, null);
});

test('a cell with fewer than 2 photos to rank costs no ranking', () => {
  const { pool: p, answers, cost } = pool(10, { 1: 's1' });
  const r = replayR(p, { K: 'all', answers, cost, rule: 'P', quota: Q, rank: {}, line: lineOf(1, 1) });
  assert.equal(r.ranked, 0);
  assert.equal(r.unranked, 0);
  close(r.cost.usd, 0.1);
});

test('FR drops Haiku\'s rejects before the ranking', () => {
  const { pool: p, answers, cost } = pool(10, { 1: 's1', 2: 's1', 3: 's1', 4: 's2' });
  const filter = haikuOf(p, [k(3)]);
  const rank = { 'T-leaf': { orders: { 1: [k(3), k(2), k(1)], 2: [k(4)] }, unread: [] } };
  const r = replayFR(p, { filter, answers, cost, rule: 'P', quota: Q, rank, line: lineOf(0, 1) });
  assert.deepEqual(r.cells['T-leaf'][1], [k(2), k(1)]);
  assert.equal(r.filtered, 10);
  assert.equal(r.judged, 9);
  assert.equal(r.ranked, 3);
  close(r.cost.usd, 10 * 0.001 + 9 * 0.01 + 3);
});

test('CR keeps code order: a fruit with a scale object ranks first; a leaf with one does not', () => {
  const fruit = pool(6, { 1: 's2', 2: 's2', 3: 's2' }, { part: 'fruit' });
  fruit.answers[k(3)].scale = 'coin';
  assert.deepEqual(replayCR(fruit.pool, { K: 'all', ...fruit, rule: 'P', quota: Q }).cells['T-fruit'][2], [k(3), k(1)]);
  const leaf = pool(6, { 1: 's2', 2: 's2', 3: 's2' });
  leaf.answers[k(3)].scale = 'coin';
  const r = replayCR(leaf.pool, { K: 'all', ...leaf, rule: 'P', quota: Q });
  assert.deepEqual(r.cells['T-leaf'][2], [k(1), k(2)]);
  assert.equal(r.ranked, 0);
  close(r.cost.usd, 0.06);
});

test('the thin-cell rule keeps one photo at difficulty step 3 when the cell has no other keep', () => {
  const { pool: p, answers, cost } = pool(6, { 4: 'last', 5: 'last' });
  answers[k(5)].usual_look = true;
  const r = replayCR(p, { K: 'all', answers, cost, rule: 'P', quota: Q });
  assert.deepEqual(r.cells['T-leaf'], { 1: [], 2: [], 3: [k(5)] });
  assert.equal(judgeSteps(p.target, p.photos, answers, 'P').get(k(5)).thin_cell, true);
});

test('judgeSteps: a key photo with another part is a part error; on a held-out pool the judge sets the part', () => {
  const photos = [{ key: 'a', n: 1, part: 'leaf' }, { key: 'b', n: 2, part: 'leaf' }];
  const s = judgeSteps('T', photos, { a: ans('bark', 's1'), b: null }, 'P');
  assert.deepEqual(s.get('a'), { cell: 'T-leaf', keep: false, step: null, line: 'part_error', thin_cell: false });
  assert.equal(s.get('b').line, 'no_answer');
  const held = [{ key: 'c', n: 1, part: null }, { key: 'd', n: 2, part: null }, { key: 'e', n: 3, part: null }];
  const h = judgeSteps('T', held, { c: ans('fruit', 's1'), d: ans('leaf', 's2', { part: 'other' }), e: null }, 'P');
  assert.deepEqual(h.get('c'), { cell: 'T-fruit', keep: true, step: 1, line: null, thin_cell: false });
  assert.equal(h.get('d').cell, null);
  assert.equal(h.get('d').keep, false);
  assert.equal(h.get('e').cell, null);
});

test('lineAt prices a ranking call of n photos', () => {
  assert.deepEqual(lineAt({ tokens: { a: 100, b: 10 }, usd: { a: 1, b: 2 } }, 3), { tokens: 130, usd: 7 });
});
