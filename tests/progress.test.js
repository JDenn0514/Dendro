import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { loadContent } from '../app/logic/content.js';
import {
  LEVEL_NAMES, cardLevel, speciesLevel, unitNumber, gateStatus, progressGrid, unseenCount
} from '../app/logic/progress.js';

const { content } = loadContent(loadFixture());

test('the card level comes from the tier table', () => {
  assert.equal(cardLevel(undefined), 0);
  assert.equal(cardLevel({ tier: 'mc4', tier_passes: 1 }), 1);
  assert.equal(cardLevel({ tier: 'mc8', tier_passes: 0 }), 2);
  assert.equal(cardLevel({ tier: 'inv', tier_passes: 1 }), 3);
  assert.equal(cardLevel({ tier: 'typed', tier_passes: 0 }), 3);
  assert.equal(cardLevel({ tier: 'typed', tier_passes: 1 }), 4);
  assert.equal(LEVEL_NAMES[4], 'expert');
});

test('the species level is the lowest of its cards', () => {
  const states = {
    'species:QUGA:leaf': { tier: 'typed', tier_passes: 2 },
    'species:QUGA:bark': { tier: 'mc8', tier_passes: 0 }
  };
  assert.equal(speciesLevel('QUGA', content, states), 0);
  states['species:QUGA:fruit'] = { tier: 'mc4', tier_passes: 0 };
  assert.equal(speciesLevel('QUGA', content, states), 1);
  assert.equal(speciesLevel('QUVE', content, states), 0);
});

test('the unit number is the mean level over four as a percent', () => {
  const states = {
    'species:ACPL:leaf': { tier: 'typed', tier_passes: 3 },
    'species:ACSA2:leaf': { tier: 'mc8', tier_passes: 0 }
  };
  const number = unitNumber('simple_lobed_maples_co', content, states);
  assert.equal(number.card_count, 2);
  assert.equal(number.percent, 75);
  assert.equal(number.expert_count, 1);
  assert.equal(number.label, '75%, 1 of 2 expert');
});

test('an unknown unit key throws instead of returning a number', () => {
  assert.throws(() => unitNumber('no_such_unit', content, {}), /unknown unit no_such_unit/);
  assert.throws(() => gateStatus('no_such_unit', content, {}), /unknown unit no_such_unit/);
});

test('the unseen count is the number of ids with no state', () => {
  const states = { 'species:QUGA:leaf': { tier: 'mc4', tier_passes: 0 } };
  assert.equal(unseenCount(['species:QUGA:leaf', 'species:QURU:leaf'], states), 1);
  assert.equal(unseenCount([], states), 0);
});

test('a unit with no parent is always open', () => {
  const status = gateStatus('leaf_types', content, {});
  assert.equal(status.open, true);
  assert.equal(status.parent_key, null);
});

test('the gate opens at 80 percent of the parent cards at level 2 or higher', () => {
  const closed = gateStatus('simple_lobed_genus', content, {});
  assert.equal(closed.open, false);
  assert.equal(closed.parent_key, 'leaf_types');
  assert.equal(closed.parent_card_count, 1);
  assert.equal(closed.at_level_2, 0);
  assert.equal(closed.needed_cards, 1);

  const states = { 'concept:leaf:simple_lobed': { tier: 'mc8', tier_passes: 0 } };
  const open = gateStatus('simple_lobed_genus', content, states);
  assert.equal(open.open, true);
  assert.equal(open.fraction, 1);
  assert.equal(open.needed_cards, 0);
});

test('a level-4 unit gates on its level-3 parent', () => {
  const closed = gateStatus('quga_varieties', content, {});
  assert.equal(closed.parent_key, 'simple_lobed_white_oaks_co');
  assert.equal(closed.parent_card_count, 1);
  assert.equal(closed.open, false);
  const open = gateStatus('quga_varieties', content,
    { 'species:QUGA:leaf': { tier: 'inv', tier_passes: 0 } });
  assert.equal(open.open, true);
});

test('a parent with no cards counts as open', () => {
  const stub = {
    units: [
      { key: 'p', name: 'P', channel: 'leaf', level: 1, parent: null },
      { key: 'c', name: 'C', channel: 'leaf', level: 2, parent: 'p' }
    ],
    unit_cards: { p: [], c: ['group:leaf:Quercus'] }
  };
  const status = gateStatus('c', stub, {});
  assert.equal(status.open, true);
  assert.equal(status.parent_card_count, 0);
  assert.equal(status.needed_cards, 0);
});

test('the grid groups species rows by unit with one cell per channel', () => {
  const states = { 'species:ACPL:leaf': { tier: 'mc8', tier_passes: 0 } };
  const grid = progressGrid(content, states);
  assert.deepEqual(grid.channels, ['leaf', 'bark', 'fruit']);
  const maples = grid.units.find((u) => u.key === 'simple_lobed_maples_co');
  assert.equal(maples.number.card_count, 2);
  const acpl = maples.rows.find((r) => r.symbol === 'ACPL');
  assert.equal(acpl.common, 'Norway maple');
  assert.deepEqual(acpl.cells, [
    { channel: 'leaf', level: 2, has_card: true },
    { channel: 'bark', level: 0, has_card: false },
    { channel: 'fruit', level: 0, has_card: true }
  ]);
  const genus = grid.units.find((u) => u.key === 'simple_lobed_genus');
  assert.deepEqual(genus.rows.map((r) => r.symbol),
    ['QUGA', 'QURU', 'ACPL', 'ACSA2', 'PLOC']);
});
