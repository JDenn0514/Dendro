import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  numberWord, capitalize, plural, displayName, heightSpan, elevationSpan
} from '../app/logic/words.js';

test('a height range prints as today', () => {
  assert.deepEqual(heightSpan([30, 40]), { figure: '30–40', label: 'feet tall' });
});

test('a height with only a maximum prints as up to that figure', () => {
  assert.deepEqual(heightSpan([null, 40]), { figure: 'Up to 40', label: 'feet tall' });
});

test('an elevation range prints with thousands separators', () => {
  assert.deepEqual(elevationSpan([0, 2000]), { figure: '0–2,000', label: 'feet elevation' });
});

test('a single elevation prints as about that figure', () => {
  assert.deepEqual(elevationSpan(6600), { figure: 'About 6,600', label: 'feet elevation' });
});

test('an omitted or malformed height or elevation prints nothing', () => {
  for (const value of [undefined, null, 40, [30, null], [null, null], [40, 30], ['30', 40], [30]]) {
    assert.equal(heightSpan(value), null, JSON.stringify(value));
  }
  for (const value of [undefined, null, '6600', [null, 9000], [5000, null], [9000, 5000], [5000]]) {
    assert.equal(elevationSpan(value), null, JSON.stringify(value));
  }
});

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
