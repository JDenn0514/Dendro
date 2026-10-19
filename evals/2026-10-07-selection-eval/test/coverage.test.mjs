import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyProblems } from '../lib/coverage.mjs';

const item = key => ({ key, label: 'good', note: '' });

test('P1 and P0: a complete result has no problem', () => {
  const job = { label: 'P1:x', pass: 'P1', keys: ['a', 'b'] };
  assert.deepEqual(keyProblems(job, { results: [item('b'), item('a')] }), []);
  assert.deepEqual(keyProblems({ ...job, pass: 'P0' }, { results: [item('a'), item('b')] }), []);
});

test('P1: a missing key, a repeated key, and an unknown key are each a problem', () => {
  const job = { label: 'P1:x', pass: 'P1', keys: ['a', 'b', 'c'] };
  const p = keyProblems(job, { results: [item('a'), item('a'), item('z')] });
  assert.deepEqual(p, ['P1:x: key a returned 2 times', 'P1:x: key b missing', 'P1:x: key c missing', 'P1:x: unknown key z']);
});

test('P2 and P3: ranked plus rejects cover the keys; a key in both is a problem', () => {
  const job = { label: 'P2:x', pass: 'P2', keys: ['a', 'b', 'c'] };
  const ok = { ranked: [{ key: 'b', tag: 'good' }, { key: 'a', tag: 'hard' }], rejects: ['c'], unread: [] };
  assert.deepEqual(keyProblems(job, ok), []);
  assert.deepEqual(keyProblems({ ...job, pass: 'P3' }, ok), []);
  const bad = { ranked: [{ key: 'a', tag: 'good' }], rejects: ['a', 'q'], unread: [] };
  assert.deepEqual(keyProblems(job, bad), ['P2:x: key a returned 2 times', 'P2:x: key b missing', 'P2:x: key c missing', 'P2:x: unknown key q']);
});

test('P2: a key in unread counts as covered', () => {
  const job = { label: 'P2:x', pass: 'P2', keys: ['a', 'b'] };
  assert.deepEqual(keyProblems(job, { ranked: [{ key: 'a', tag: 'good' }], rejects: [], unread: ['b'] }), []);
});

test('a job with no result returns no key problem', () => {
  assert.deepEqual(keyProblems({ label: 'x', pass: 'P1', keys: ['a'] }, null), []);
});
