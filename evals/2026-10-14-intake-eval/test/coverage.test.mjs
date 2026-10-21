import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyProblems, decodeResult } from '../lib/coverage.mjs';

const item = key => ({ key, part: 'leaf' });

test('check and judge: a complete result has no problem', () => {
  const job = { label: 'judge:x', kind: 'judge', keys: ['a', 'b'] };
  assert.deepEqual(keyProblems(job, { results: [item('b'), item('a')] }), []);
  assert.deepEqual(keyProblems({ ...job, kind: 'check' }, { model_self_report: 'm', results: [item('a'), item('b')] }), []);
});

test('judge: a missing key, a repeated key, and an unknown key are each a problem', () => {
  const job = { label: 'judge:x', kind: 'judge', keys: ['a', 'b', 'c'] };
  const p = keyProblems(job, { results: [item('a'), item('a'), item('z')] });
  assert.deepEqual(p, ['judge:x: key a returned 2 times', 'judge:x: key b missing', 'judge:x: key c missing', 'judge:x: unknown key z']);
});

test('rank: the orders plus unread cover the keys; a key in two places is a problem', () => {
  const job = { label: 'rank:x', kind: 'rank', keys: ['a', 'b', 'c'], groups: { 1: ['a', 'b'], 3: ['c'] } };
  assert.deepEqual(keyProblems(job, { orders: { 1: ['b', 'a'], 3: ['c'] }, unread: [], note: '' }), []);
  assert.deepEqual(keyProblems(job, { orders: { 1: ['a'] }, unread: ['b', 'c'], note: '' }), []);
  const bad = { orders: { 1: ['a', 'q'], 3: ['a'] }, unread: [], note: '' };
  assert.deepEqual(keyProblems(job, bad), ['rank:x: key a returned 2 times', 'rank:x: key b missing', 'rank:x: key c missing', 'rank:x: unknown key q', 'rank:x: key a in group 3, want group 1']);
});

test('rank: a key in the order of another group is a problem', () => {
  const job = { label: 'rank:x', kind: 'rank', keys: ['a', 'b'], groups: { 1: ['a'], 2: ['b'] } };
  assert.deepEqual(keyProblems(job, { orders: { 1: ['a', 'b'] }, unread: [], note: '' }), ['rank:x: key b in group 1, want group 2']);
  assert.deepEqual(keyProblems(job, { orders: { 1: ['a'], 9: ['b'] }, unread: [], note: '' }), ['rank:x: key b in group 9, want group 2']);
});

test('a job with no result returns no key problem', () => {
  assert.deepEqual(keyProblems({ label: 'x', kind: 'judge', keys: ['a'] }, null), []);
});

test('decodeResult turns the codes of a judge result back into keys, and leaves an unknown code as it is', () => {
  const job = { kind: 'judge', codes: { p007: 'ACRU-leaf-02', p031: 'QUAL-bark-01' } };
  const r = decodeResult(job, { results: [item('p031'), item('p007'), item('p999')] });
  assert.deepEqual(r.results.map(x => x.key), ['QUAL-bark-01', 'ACRU-leaf-02', 'p999']);
  assert.equal(decodeResult(job, null), null);
  const rank = { kind: 'rank', orders: { 1: ['a'] } };
  const same = { orders: { 1: ['a'] }, unread: [], note: '' };
  assert.equal(decodeResult(rank, same), same);
});
