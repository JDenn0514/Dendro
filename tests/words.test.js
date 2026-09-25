import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberWord, capitalize, plural } from '../app/logic/words.js';

test('a count under one hundred prints as words', () => {
  assert.equal(numberWord(0), 'zero');
  assert.equal(numberWord(1), 'one');
  assert.equal(numberWord(14), 'fourteen');
  assert.equal(numberWord(20), 'twenty');
  assert.equal(numberWord(22), 'twenty-two');
  assert.equal(numberWord(99), 'ninety-nine');
});

test('a count of one hundred or more prints as figures', () => {
  assert.equal(numberWord(100), '100');
  assert.equal(numberWord(390), '390');
  assert.equal(numberWord(-1), '-1');
  assert.equal(numberWord(2.5), '2.5');
});

test('capitalize raises only the first letter', () => {
  assert.equal(capitalize('simple, lobed'), 'Simple, lobed');
  assert.equal(capitalize(''), '');
});

test('plural adds the ending a common name needs', () => {
  assert.equal(plural('oak'), 'oaks');
  assert.equal(plural('maple'), 'maples');
  assert.equal(plural('birch'), 'birches');
  assert.equal(plural('cherry'), 'cherries');
  assert.equal(plural('oak', 1), 'oak');
});
