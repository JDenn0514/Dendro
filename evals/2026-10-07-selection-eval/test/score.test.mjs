import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quality } from '../lib/score.mjs';

test('quality counts the overlap against min(6, best)', () => {
  assert.equal(quality(['a', 'b', 'c', 'd', 'e', 'f'], ['a', 'b', 'x', 'y', 'z', 'w']), 2 / 6);
  assert.equal(quality(['a', 'b', 'q'], ['a', 'b', 'c']), 2 / 3);
  assert.equal(quality([], ['a']), 0);
  assert.equal(quality(['a'], []), null);
});
