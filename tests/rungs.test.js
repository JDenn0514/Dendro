import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { loadContent } from '../app/logic/content.js';
import {
  LEVEL_NAMES, RUNG_KINDS, RUNG_NAMES, FAMILIAR,
  rollupLevel, channelRung, channelRungs, leadingConcept,
  channelClaim, overallTally, overallFinding,
  speciesByGenus, conceptBreakdown
} from '../app/logic/progress.js';

const { content } = loadContent(loadFixture());

test('the level names are the five words the spec fixes', () => {
  assert.deepEqual(LEVEL_NAMES, ['new', 'seen', 'familiar', 'strong', 'expert']);
  assert.equal(FAMILIAR, 2);
  assert.deepEqual(RUNG_KINDS, ['concept', 'group', 'species']);
  assert.equal(RUNG_NAMES.concept, 'shapes');
});

test('the rollup level is the mean level rounded', () => {
  assert.equal(rollupLevel([]), 0);
  assert.equal(rollupLevel([0, 0, 1, 1, 2, 2, 3, 4]), 2);
  assert.equal(rollupLevel([1, 3, 4]), 3);
  assert.equal(rollupLevel([2, 1, 2, 1, 1, 0, 0, 0]), 1);
});

test('a concept rung keeps the concept order of the channel', () => {
  const rung = channelRung(content, {}, 'leaf', 'concept');
  assert.equal(rung.kind, 'concept');
  assert.equal(rung.name, 'shapes');
  assert.deepEqual(rung.cards.map((r) => r.key), ['simple_lobed']);
  assert.equal(rung.total, 1);
  assert.equal(rung.level, 0);
  assert.equal(rung.at_familiar, 0);
  assert.equal(rung.share, 0);
  assert.deepEqual(rung.counts, [1, 0, 0, 0, 0]);
});

test('a species rung groups by genus and then by symbol', () => {
  const rung = channelRung(content, {}, 'leaf', 'species');
  assert.deepEqual(rung.cards.map((r) => r.key),
    ['ACPL', 'ACSA2', 'PLOC', 'QUGA', 'QURU']);
  assert.deepEqual(rung.cards.map((r) => r.genus),
    ['Acer', 'Acer', 'Platanus', 'Quercus', 'Quercus']);
  assert.equal(rung.cards[0].bucket, 'simple_lobed');
});

test('a bark rung keeps only the species that hold a bark card', () => {
  const rung = channelRung(content, {}, 'bark', 'concept');
  assert.deepEqual(rung.cards.map((r) => r.key), ['furrowed', 'plated', 'papery']);
  const species = channelRung(content, {}, 'bark', 'species');
  assert.deepEqual(species.cards.map((r) => r.key), ['PLOC', 'QUGA', 'QURU']);
});

test('a rung counts levels, the familiar share, and its own rollup', () => {
  const states = {
    'species:ACPL:leaf': { tier: 'mc8', tier_passes: 0 },
    'species:ACSA2:leaf': { tier: 'typed', tier_passes: 1 },
    'species:PLOC:leaf': { tier: 'mc4', tier_passes: 0 }
  };
  const rung = channelRung(content, states, 'leaf', 'species');
  assert.deepEqual(rung.counts, [2, 1, 1, 0, 1]);
  assert.equal(rung.at_familiar, 2);
  assert.equal(rung.total, 5);
  assert.equal(rung.share, 0.4);
  assert.equal(rung.level, 1);
});

test('the three rungs come back in one channel in kind order', () => {
  const rungs = channelRungs(content, {}, 'leaf');
  assert.deepEqual(rungs.map((r) => r.kind), ['concept', 'group', 'species']);
});

test('the leading concept is the highest-level concept card of the channel', () => {
  const states = { 'concept:leaf:simple_lobed': { tier: 'typed', tier_passes: 1 } };
  const leading = leadingConcept(content, states, 'leaf');
  assert.equal(leading.key, 'simple_lobed');
  assert.equal(leading.name, 'Simple, lobed');
  assert.equal(leading.level, 4);
  assert.equal(leading.index, 0);
  assert.equal(leading.total, 1);
});

test('the channel claim names the leading shape and the species behind it', () => {
  const states = { 'concept:leaf:simple_lobed': { tier: 'typed', tier_passes: 1 } };
  assert.equal(channelClaim(content, states, 'leaf'),
    'Simple, lobed sits at expert. The five species behind it do not.');
  const keeping = { ...states };
  for (const symbol of ['ACPL', 'ACSA2', 'PLOC', 'QUGA', 'QURU']) {
    keeping[`species:${symbol}:leaf`] = { tier: 'typed', tier_passes: 1 };
  }
  assert.equal(channelClaim(content, keeping, 'leaf'),
    'Simple, lobed sits at expert. The five species behind it keep up.');
});

test('the tally adds the three rungs over every channel', () => {
  const tally = overallTally(content, {});
  assert.equal(tally.shapes.at, 0);
  assert.equal(tally.shapes.total, 6);
  assert.equal(tally.genera.total, 7);
  assert.equal(tally.species.total, 10);
});

test('the finding reads the gap between the shapes and the species', () => {
  assert.equal(overallFinding(content, {}),
    'Nothing is started yet. The shapes come first.');
  const shapesOnly = {
    'concept:leaf:simple_lobed': { tier: 'mc8', tier_passes: 0 },
    'concept:bark:furrowed': { tier: 'mc8', tier_passes: 0 },
    'concept:fruit:acorn': { tier: 'mc8', tier_passes: 0 }
  };
  assert.equal(overallFinding(content, shapesOnly),
    'You know the shapes. Not the trees inside them.');
});

test('the species of a channel group under their genus', () => {
  const states = { 'species:QURU:leaf': { tier: 'mc8', tier_passes: 0 } };
  const groups = speciesByGenus(content, states, 'leaf');
  assert.deepEqual(groups.map((g) => g.genus), ['Acer', 'Platanus', 'Quercus']);
  const oaks = groups.find((g) => g.genus === 'Quercus');
  assert.equal(oaks.genus_common, 'oak');
  assert.equal(oaks.has_card, true);
  assert.deepEqual(oaks.species.map((s) => s.symbol), ['QUGA', 'QURU']);
  const quru = oaks.species.find((s) => s.symbol === 'QURU');
  assert.equal(quru.common, 'Northern red oak');
  assert.equal(quru.scientific, 'Quercus rubra');
  assert.equal(quru.section, 'Lobatae');
  assert.equal(quru.level, 2);
});

test('a genus with no common name in the content falls back to the genus', () => {
  const maples = speciesByGenus(content, {}, 'leaf').find((g) => g.genus === 'Acer');
  assert.equal(maples.genus_common, 'Acer');
});

test('one concept breaks down into its genera and species', () => {
  const states = { 'concept:leaf:simple_lobed': { tier: 'inv', tier_passes: 0 } };
  const shape = conceptBreakdown(content, states, 'leaf', 'simple_lobed');
  assert.equal(shape.concept.name, 'Simple, lobed');
  assert.equal(shape.has_card, true);
  assert.equal(shape.level, 3);
  assert.deepEqual(shape.genera.map((g) => g.genus), ['Acer', 'Platanus', 'Quercus']);
});

test('the breakdown of a bark concept holds only the species in that bucket', () => {
  const papery = conceptBreakdown(content, {}, 'bark', 'papery');
  assert.deepEqual(papery.genera.map((g) => g.genus), ['Platanus']);
  const furrowed = conceptBreakdown(content, {}, 'bark', 'furrowed');
  assert.deepEqual(furrowed.genera[0].species.map((s) => s.symbol), ['QUGA', 'QURU']);
});

test('an unknown concept key gives back null', () => {
  assert.equal(conceptBreakdown(content, {}, 'leaf', 'no_such_shape'), null);
});
