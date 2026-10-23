import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gates, shortlist, candidate, heldoutCheck } from '../lib/score.mjs';

const row = (id, x = {}) => ({ id, ranking: true, drop_recall: 0.9, keep: 0.9, exact: 0.9, within1: 0.99, usd_per_kept: 0.1, ...x });

test('the gates pass at the exact limits and fail just under them', () => {
  assert.equal(gates(row('a', { drop_recall: 4 / 5, keep: 17 / 20, exact: 0.8, within1: 97 / 100 })), true);
  assert.equal(gates(row('a', { drop_recall: 0.799 })), false);
  assert.equal(gates(row('a', { keep: 0.849 })), false);
  assert.equal(gates(row('a', { exact: 0.799 })), false);
  assert.equal(gates(row('a', { within1: 0.969 })), false);
  assert.equal(gates(row('a', { drop_recall: null })), false);
});

test('the shortlist holds ranking methods within exactly 5 points of the best, on exact step and keep', () => {
  const rows = [
    row('best', { exact: 0.95, keep: 0.95 }),
    row('at5', { exact: 0.9, keep: 0.9 }),
    row('exact-out', { exact: 0.899, keep: 0.95 }),
    row('keep-out', { exact: 0.95, keep: 0.899 }),
    row('S', { ranking: false, exact: 0.99, keep: 0.99 }),
    row('gated', { exact: 0.99, keep: 0.99, within1: 0.9 }),
  ];
  assert.deepEqual(shortlist(rows).map(r => r.id), ['best', 'at5']);
  assert.deepEqual(shortlist([row('x', { exact: 0.5 })]), []);
});

test('the candidate is the cheapest per kept photo; one that fails the check gives way to the next-cheapest', () => {
  const rows = [row('mid', { usd_per_kept: 0.2 }), row('cheap', { usd_per_kept: 0.1, keep: 0.7 }), row('dear', { usd_per_kept: 0.3 }), row('none', { usd_per_kept: null })];
  assert.deepEqual(candidate(rows), { candidate: 'cheap', checked: ['cheap'] });
  const check = r => heldoutCheck(r, { keep: 0.8, exact: 0.8 });
  assert.deepEqual(candidate(rows, check), { candidate: 'mid', checked: ['cheap', 'mid'] });
  assert.deepEqual(candidate(rows, () => false), { candidate: null, checked: ['cheap', 'mid', 'dear'] });
});

test('the held-out check allows at most 5 points below the owner\'s repeat agreement on each measure', () => {
  const owner = { keep: 0.85, exact: 0.8 };
  assert.equal(heldoutCheck(row('a', { keep: 0.8, exact: 0.75 }), owner), true);
  assert.equal(heldoutCheck(row('a', { keep: 0.799, exact: 0.75 }), owner), false);
  assert.equal(heldoutCheck(row('a', { keep: 0.8, exact: 0.749 }), owner), false);
});
