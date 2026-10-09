import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HELD_BACK,
  heldBackRows,
  isHeldBack,
  type HoldBackInput,
  type HoldBackRow,
} from '../lib/hold_back.ts';

function row(target: string, extra: Partial<HoldBackRow> = {}): HoldBackRow {
  return { hash: 'a'.repeat(64), target, channel: 'leaf', ...extra };
}

function input(extra: Partial<HoldBackInput> = {}): HoldBackInput {
  return {
    symbol: 'QUAL',
    published: false,
    manifest: [row('QUGA')],
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

test('a live row on the species keeps it in', () => {
  assert.equal(isHeldBack(input({ manifest: [row('QUAL')] })), false);
});

test('a hard row or a row on a variety key does not keep it in', () => {
  assert.equal(isHeldBack(input({ manifest: [row('QUAL', { difficulty: 'hard' })] })), true);
  assert.equal(isHeldBack(input({ manifest: [row('QUALA')] })), true);
});

test('a species whose every row is retired stays in, so the build retires it', () => {
  assert.equal(isHeldBack(input({ manifest: [row('QUAL', { retired: true })] })), false);
  const mixed = [row('QUAL', { retired: true }), row('QUAL', { difficulty: 'hard' })];
  assert.equal(isHeldBack(input({ manifest: mixed })), true);
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

test('heldBackRows takes the rows on the species and its varieties, but not a retired or published row', () => {
  const hard = row('QUAL', { difficulty: 'hard' });
  const variety = row('QUALA', { hash: 'b'.repeat(64) });
  const retired = row('QUAL', { hash: 'c'.repeat(64), retired: true });
  const published = row('QUAL', { hash: 'd'.repeat(64) });
  const other = row('QUGA');
  const rows = heldBackRows(
    [hard, variety, retired, published, other],
    new Set(['QUAL', 'QUALA']),
    [{ ...published }],
  );
  assert.deepEqual(rows, [hard, variety]);
});
