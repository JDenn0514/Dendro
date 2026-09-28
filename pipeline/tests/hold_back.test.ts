import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HELD_BACK, isHeldBack, type HoldBackInput } from '../lib/hold_back.ts';

function input(extra: Partial<HoldBackInput> = {}): HoldBackInput {
  return {
    symbol: 'QUAL',
    targets: new Set(['QUAL', 'QUALA']),
    published: false,
    manifest: [{ target: 'QUGA' }],
    confusion: [{ a: 'QUGA', b: 'QURU' }],
    units: [{ key: 'u', include: ['QUGA'], exclude: [] }],
    ...extra,
  };
}

test('a new species that no other file names is held back', () => {
  assert.equal(isHeldBack(input()), true);
  assert.equal(HELD_BACK, 'held back: no photo and no confusion edge');
});

test('a published species is never held back', () => {
  assert.equal(isHeldBack(input({ published: true })), false);
});

test('a manifest row on the species or one of its varieties keeps it in, whatever the row status', () => {
  assert.equal(isHeldBack(input({ manifest: [{ target: 'QUAL' }] })), false);
  assert.equal(isHeldBack(input({ manifest: [{ target: 'QUALA' }] })), false);
});

test('a confusion edge on either side keeps it in', () => {
  assert.equal(isHeldBack(input({ confusion: [{ a: 'QUAL', b: 'QUGA' }] })), false);
  assert.equal(isHeldBack(input({ confusion: [{ a: 'QUGA', b: 'QUAL' }] })), false);
});

test('a unit include or exclude that names it keeps it in', () => {
  assert.equal(isHeldBack(input({ units: [{ key: 'u', include: ['QUAL'] }] })), false);
  assert.equal(isHeldBack(input({ units: [{ key: 'u', exclude: ['QUAL'] }] })), false);
  assert.equal(isHeldBack(input({ units: [{ key: 'u' }] })), true);
});
