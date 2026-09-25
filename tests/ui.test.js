import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rampClasses } from '../app/ui/chrome.js';
import { PRINT_THRESHOLD, plateTreatment } from '../app/ui/plate.js';

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

test('a manifest ground flag decides the treatment on its own', () => {
  assert.equal(plateTreatment({ hash: 'a', ground: 'bright' }), 'print');
  assert.equal(plateTreatment({ hash: 'b', ground: 'own' }), 'field');
});

test('a photo with nothing measured yet starts as a field plate', () => {
  assert.equal(plateTreatment({ hash: 'c' }), 'field');
  assert.equal(PRINT_THRESHOLD, 0.86);
});
