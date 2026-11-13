import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gates, shortlist, candidate, heldoutCheck, decision } from '../lib/score.mjs';

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

test('without the gates (owner ruling 2026-10-27), the shortlist holds every ranking method within 5 points', () => {
  const rows = [
    row('best', { exact: 0.8, keep: 0.86, within1: 0.9 }),
    row('at5', { exact: 0.75, keep: 0.81, within1: 0.9 }),
    row('exact-out', { exact: 0.749, keep: 0.86, within1: 0.9 }),
    row('keep-high', { exact: 0.76, keep: 0.9, within1: 0.9 }),
    row('S', { ranking: false, exact: 0.99, keep: 0.99 }),
  ];
  assert.deepEqual(shortlist(rows), []);
  assert.deepEqual(shortlist(rows, { gated: false }).map(r => r.id), ['best', 'keep-high']);
});

test('the decision: the shortlist from the key, then the cheapest held-out row that passes the check', () => {
  const key = [
    row('FR/opus', { exact: 0.82, keep: 0.86 }),
    row('R20/opus', { exact: 0.8, keep: 0.87 }),
    row('CRall/haiku', { exact: 0.75, keep: 0.88 }),
    row('S/opus', { ranking: false, exact: 0.9, keep: 0.9 }),
  ];
  const heldout = [
    row('FR/opus', { usd_per_kept: 0.04, keep: 0.8, exact: 0.6 }),
    row('R20/opus', { usd_per_kept: 0.03, keep: 0.7, exact: 0.7 }),
    row('CRall/haiku', { usd_per_kept: 0.001, keep: 0.9, exact: 0.9 }),
    row('S/opus', { usd_per_kept: 0.0001, ranking: false }),
  ];
  const d = decision({ key, heldout, ownerRepeat: { keep: 0.825, exact: 0.632 } });
  assert.deepEqual(d.shortlist, ['FR/opus', 'R20/opus']);
  assert.deepEqual(d.best, { exact: 0.82, keep: 0.88 });
  assert.ok(Math.abs(d.bar.keep - 0.775) < 1e-9 && Math.abs(d.bar.exact - 0.582) < 1e-9);
  assert.deepEqual(d.checked.map(c => [c.id, c.pass]), [['R20/opus', false], ['FR/opus', true]]);
  assert.equal(d.candidate, 'FR/opus');
  const none = decision({ key, heldout: heldout.map(r => ({ ...r, keep: 0.5 })), ownerRepeat: { keep: 0.825, exact: 0.632 } });
  assert.equal(none.candidate, null);
  assert.equal(none.checked.length, 2);
});
