import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildViews } from '../lib/views.mjs';

test('buildViews spreads P1 tokens over the batch and marks missing verdicts unread', () => {
  const jobs = [
    { label: 'P1:haiku:T:b1', pass: 'P1', model: 'haiku', target: 'T', keys: ['T-01', 'T-02'], result: { results: [{ key: 'T-01', label: 'good', note: '' }] } },
    { label: 'P2:haiku:T', pass: 'P2', model: 'haiku', target: 'T', keys: ['T-01', 'T-02', 'T-03', 'T-04'], result: { ranked: [{ key: 'T-02', tag: 'good' }, { key: 'T-02', tag: 'hard' }, { key: 'X-09', tag: 'good' }, { key: 'T-04', tag: 'odd' }], rejects: ['T-01'], unread: [] } },
    { label: 'P3:haiku:T', pass: 'P3', model: 'haiku', target: 'T', keys: ['T-01', 'T-02'], result: null },
  ];
  const tokens = { 'P1:haiku:T:b1': { tokens: 100, usd: 0.2 }, 'P2:haiku:T': { tokens: 900, usd: 0.9 } };
  const v = buildViews(jobs, tokens);
  assert.deepEqual(v.p1.haiku, { 'T-01': 'good', 'T-02': 'unread' });
  assert.deepEqual(v.p1Cost.haiku['T-02'], { tokens: 50, usd: 0.1 });
  assert.deepEqual(v.p2.haiku.T, { ranked: ['T-02', 'T-04'], tags: { 'T-02': 'good', 'T-04': 'hard' }, rejects: ['T-01', 'T-03'] });
  assert.deepEqual(v.p2Cost.haiku.T, { tokens: 900, usd: 0.9, n: 4 });
  assert.deepEqual(v.p3.haiku.T, { ranked: [], tags: {}, rejects: ['T-01', 'T-02'] });
  assert.deepEqual(v.tags.P2.haiku, { good: 1, hard: 1 });
  assert.deepEqual(v.p3Cost.haiku.T, { tokens: 0, usd: 0, n: 2 });
  assert.equal(v.unread.P1.haiku, 1);
  assert.equal(v.unread.P2.haiku, 1);
  assert.equal(v.unread.P3.haiku, 2);
  assert.ok(v.problems.some(p => /T-04: no valid tag/.test(p)));
  assert.ok(v.problems.length >= 4);
});

test('a key that is ranked and rejected stays rejected, and a problem is logged', () => {
  const jobs = [{ label: 'P2:haiku:T', pass: 'P2', model: 'haiku', target: 'T', keys: ['T-01', 'T-02', 'T-03'], result: { ranked: [{ key: 'T-01', tag: 'good' }, { key: 'T-02', tag: 'good' }], rejects: ['T-02', 'T-03'], unread: [] } }];
  const v = buildViews(jobs, { 'P2:haiku:T': { tokens: 10, usd: 0.1 } });
  assert.deepEqual(v.p2.haiku.T.rejects, ['T-02', 'T-03']);
  assert.ok(v.problems.some(p => /T-02: ranked and rejected/.test(p)));
  assert.equal(v.unread.P2.haiku, 0);
});

test('a P1 label outside the list and a missing tokens entry each log a problem', () => {
  const jobs = [{ label: 'P1:haiku:T:b1', pass: 'P1', model: 'haiku', target: 'T', keys: ['T-01', 'T-02'], result: { results: [{ key: 'T-01', label: 'great', note: '' }, { key: 'T-02', label: 'good', note: '' }] } }];
  const v = buildViews(jobs, {});
  assert.equal(v.p1.haiku['T-01'], 'unread');
  assert.equal(v.unread.P1.haiku, 1);
  assert.ok(v.problems.some(p => /T-01: label "great" is not valid/.test(p)));
  assert.ok(v.problems.some(p => /P1:haiku:T:b1: no tokens entry/.test(p)));
});
