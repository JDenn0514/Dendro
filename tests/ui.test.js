import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rampClasses } from '../app/ui/chrome.js';

test('the ramp fills one square per level', () => {
  assert.deepEqual(rampClasses(0), ['', '', '', '', '']);
  assert.deepEqual(rampClasses(1), ['f1', '', '', '', '']);
  assert.deepEqual(rampClasses(2), ['f1', 'f2', '', '', '']);
  assert.deepEqual(rampClasses(3), ['f1', 'f2', 'f3', '', '']);
});

test('expert fills the fifth square too, so it reads as full', () => {
  assert.deepEqual(rampClasses(4), ['f1', 'f2', 'f3', 'f4', 'f4']);
});

test('a lost square marks the level the card fell from', () => {
  assert.deepEqual(rampClasses(1, true), ['f1', 'lost', '', '', '']);
  assert.deepEqual(rampClasses(3, true), ['f1', 'f2', 'f3', 'lost', '']);
  assert.deepEqual(rampClasses(4, true), ['f1', 'f2', 'f3', 'f4', 'f4']);
});
