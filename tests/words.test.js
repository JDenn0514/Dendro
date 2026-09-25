import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberWord, capitalize, plural, displayName } from '../app/logic/words.js';

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

test('a common name prints with a capital wherever it is displayed', () => {
  // The content set holds the botanical form.
  assert.equal(displayName({ common: ['silver maple'] }), 'Silver maple');
  // A name that already starts with a capital is left as it stands, and so is
  // the proper noun inside one.
  assert.equal(displayName({ common: ['Northern red oak'] }), 'Northern red oak');
  assert.equal(displayName({ common: ['London plane'] }), 'London plane');
});

test('displayName prints nothing for a record it cannot read', () => {
  assert.equal(displayName(undefined), '');
  assert.equal(displayName({}), '');
  assert.equal(displayName({ common: [] }), '');
});

test('plural adds the ending a common name needs', () => {
  assert.equal(plural('oak'), 'oaks');
  assert.equal(plural('maple'), 'maples');
  assert.equal(plural('birch'), 'birches');
  assert.equal(plural('cherry'), 'cherries');
  assert.equal(plural('oak', 1), 'oak');
});
