import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildViews } from '../lib/views.mjs';

const ans = (key, extra = {}) => ({ key, part: 'leaf', photo_features: { shape: 'clear', margin: 'clear' }, reject: [], ...extra });

test('judge answers go under model, effort, and variant; tokens spread over the batch; a missing answer is null', () => {
  const jobs = [
    { label: 'judge:haiku:high:V1:b01', kind: 'judge', model: 'haiku', effort: 'high', variant: 'V1', keys: ['T-01', 'T-02'], result: { results: [ans('T-01')] } },
    { label: 'judge:haiku:xhigh:V1:b01', kind: 'judge', model: 'haiku', effort: 'xhigh', variant: 'V1', keys: ['T-01'], result: null },
  ];
  const v = buildViews(jobs, { 'judge:haiku:high:V1:b01': { tokens: 100, usd: 0.2 }, 'judge:haiku:xhigh:V1:b01': { tokens: 50, usd: 0.1 } });
  assert.deepEqual(v.answers['haiku:high:V1']['T-01'], ans('T-01'));
  assert.equal(v.answers['haiku:high:V1']['T-02'], null);
  assert.equal(v.answers['haiku:xhigh:V1']['T-01'], null);
  assert.deepEqual(v.judgeCost['haiku:high:V1']['T-02'], { tokens: 50, usd: 0.1 });
  assert.deepEqual(v.noAnswer, { 'haiku:high:V1': 1, 'haiku:xhigh:V1': 1 });
  assert.ok(v.problems.some(p => /judge:haiku:high:V1:b01: no answer for T-02/.test(p)));
  assert.ok(v.problems.some(p => /judge:haiku:xhigh:V1:b01: no result/.test(p)));
});

test('an unread answer counts as unread; an answer with a bad part becomes null; the first answer of a key wins', () => {
  const jobs = [{ label: 'judge:opus:high:V2:b01', kind: 'judge', model: 'opus', effort: 'high', variant: 'V2', keys: ['A', 'B', 'C'], result: { results: [ans('A', { reject: ['unread'] }), ans('B', { part: 'twig' }), ans('C'), ans('C', { part: 'bark' }), ans('Z')] } }];
  const v = buildViews(jobs, { 'judge:opus:high:V2:b01': { tokens: 30, usd: 0.3 } });
  const a = v.answers['opus:high:V2'];
  assert.deepEqual(a.A.reject, ['unread']);
  assert.equal(a.B, null);
  assert.equal(a.C.part, 'leaf');
  assert.equal('Z' in a, false);
  assert.deepEqual(v.unread, { 'opus:high:V2': 1 });
  assert.ok(v.problems.some(p => /B: part "twig" is not valid/.test(p)));
  assert.ok(v.problems.some(p => /C: answered 2 times/.test(p)));
  assert.ok(v.problems.some(p => /unknown key Z/.test(p)));
});

test('a check job gives the self report and no answer', () => {
  const jobs = [{ label: 'check:sonnet', kind: 'check', model: 'sonnet', effort: 'high', variant: 'V1', keys: ['A'], result: { model_self_report: 'Sonnet 5.5', results: [ans('A')] } }];
  const v = buildViews(jobs, { 'check:sonnet': { tokens: 1, usd: 0.01 } });
  assert.deepEqual(v.checks, { 'check:sonnet': 'Sonnet 5.5' });
  assert.deepEqual(v.answers, {});
});

test('a ranking keeps each group order, drops keys of other groups, and adds the left-out keys to unread', () => {
  const jobs = [{
    label: 'rank:haiku:high:T-leaf', kind: 'rank', model: 'haiku', effort: 'high', cell: 'T-leaf', keys: ['a', 'b', 'c', 'd', 'e'], groups: { 1: ['a', 'b', 'c'], 3: ['d', 'e'] },
    result: { orders: { 1: ['c', 'a', 'c', 'd'], 3: ['e'] }, unread: ['q'], note: '' },
  }];
  const v = buildViews(jobs, { 'rank:haiku:high:T-leaf': { tokens: 900, usd: 0.9 } });
  assert.deepEqual(v.rank['haiku:high']['T-leaf'], { orders: { 1: ['c', 'a'], 3: ['e'] }, unread: ['b', 'd'] });
  assert.deepEqual(v.rankCost['haiku:high']['T-leaf'], { tokens: 900, usd: 0.9, n: 5 });
  assert.ok(v.problems.some(p => /2 keys unread or left out/.test(p)));
});

test('a job with no tokens entry logs a problem', () => {
  const v = buildViews([{ label: 'judge:x:high:V1:b01', kind: 'judge', model: 'x', effort: 'high', variant: 'V1', keys: ['A'], result: { results: [ans('A')] } }], {});
  assert.ok(v.problems.some(p => /judge:x:high:V1:b01: no tokens entry/.test(p)));
  assert.deepEqual(v.judgeCost['x:high:V1'].A, { tokens: 0, usd: 0 });
});
