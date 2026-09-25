import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXT_SIZE_STEPS, TEXT_SIZE_DEFAULT, stepFor, isTextSize
} from '../app/ui/textsize.js';
import { TEXT_SIZES } from '../app/logic/store.js';

test('there are five steps, named and in order', () => {
  assert.deepEqual(TEXT_SIZE_STEPS.map((s) => s.name),
    ['smaller', 'small', 'standard', 'large', 'largest']);
  assert.deepEqual(TEXT_SIZE_STEPS.map((s) => s.root),
    ['80%', '90%', '', '115%', '130%']);
  assert.deepEqual(TEXT_SIZE_STEPS.map((s) => s.sample_px), [14, 15, 17, 20, 22]);
});

test('the store floor and the UI steps agree on the step names', () => {
  assert.deepEqual(TEXT_SIZES, TEXT_SIZE_STEPS.map((s) => s.name));
});

test('the standard step leaves the root alone, so it follows the phone', () => {
  assert.equal(TEXT_SIZE_DEFAULT, 'standard');
  assert.equal(stepFor('standard').root, '');
});

test('an unknown step name falls back to standard', () => {
  assert.equal(stepFor('enormous').name, 'standard');
  assert.equal(stepFor(undefined).name, 'standard');
  assert.equal(isTextSize('large'), true);
  assert.equal(isTextSize('enormous'), false);
});
