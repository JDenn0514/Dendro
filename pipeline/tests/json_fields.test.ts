import { test } from 'node:test';
import assert from 'node:assert/strict';

import { asRecord, asString, asNumber, asArray, parseJson } from '../lib/json_fields.ts';

test('asRecord admits a plain object and rejects an array, null, and a scalar', () => {
  assert.deepEqual(asRecord({ a: 1 }), { a: 1 });
  assert.equal(asRecord([1, 2]), null);
  assert.equal(asRecord(null), null);
  assert.equal(asRecord('a'), null);
  assert.equal(asRecord(undefined), null);
});

test('asString admits a non-empty string and counts an empty string as absent', () => {
  assert.equal(asString('leaf'), 'leaf');
  assert.equal(asString(''), null);
  assert.equal(asString(' '), ' ');
  assert.equal(asString(5), null);
  assert.equal(asString(null), null);
});

test('asNumber admits a finite number and rejects NaN, Infinity, and a numeric string', () => {
  assert.equal(asNumber(0), 0);
  assert.equal(asNumber(-12.5), -12.5);
  assert.equal(asNumber(Number.NaN), null);
  assert.equal(asNumber(Number.POSITIVE_INFINITY), null);
  assert.equal(asNumber('12'), null);
  assert.equal(asNumber(null), null);
});

test('asArray admits an array and rejects an object and a string', () => {
  assert.deepEqual(asArray([1, 'a']), [1, 'a']);
  assert.deepEqual(asArray([]), []);
  assert.equal(asArray({ length: 2 }), null);
  assert.equal(asArray('ab'), null);
  assert.equal(asArray(null), null);
});

test('parseJson admits valid JSON and rejects a truncated body', () => {
  assert.deepEqual(parseJson('{"a":1}'), { ok: true, value: { a: 1 } });
  assert.deepEqual(parseJson('{"a":'), { ok: false, value: null });
});
