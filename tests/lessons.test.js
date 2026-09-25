import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { loadContent } from '../app/logic/content.js';
import {
  channelUnits, unitOrdinal, unitLevel, unitTree,
  defaultOpenUnits, openUnitsFor, mergeOpenUnits, channelMark,
  channelLessons, unitThumb
} from '../app/logic/lessons.js';

const { content } = loadContent(loadFixture());

// The gate on the fixture opens the level-2 unit once the one leaf concept
// card reaches level 2, so this state opens the tree below it.
const OPEN_LEAF = { 'concept:leaf:simple_lobed': { tier: 'mc8', tier_passes: 0 } };

const SEEN = { tier: 'mc8', tier_passes: 0 };

// One unit is next in the whole content. Bark and fruit come before the leaf
// genus in the content order, so the leaf branch holds the next unit only
// once every bark and fruit card is seen.
const LEAF_NEXT = {
  ...OPEN_LEAF,
  'concept:bark:furrowed': SEEN,
  'concept:bark:plated': SEEN,
  'concept:bark:papery': SEEN,
  'concept:fruit:samara': SEEN,
  'concept:fruit:acorn': SEEN
};

test('a channel keeps its units in the order of units.json', () => {
  assert.deepEqual(channelUnits(content, 'leaf').map((u) => u.key), [
    'leaf_types', 'simple_lobed_genus', 'simple_lobed_white_oaks_co',
    'simple_lobed_red_oaks_co', 'simple_lobed_maples_co',
    'simple_lobed_other_co', 'quga_varieties'
  ]);
  assert.deepEqual(channelUnits(content, 'bark').map((u) => u.key), ['bark_types']);
});

test('the unit ordinal is the place in the channel, counting from one', () => {
  assert.equal(unitOrdinal('leaf_types', content), 1);
  assert.equal(unitOrdinal('simple_lobed_red_oaks_co', content), 4);
  assert.throws(() => unitOrdinal('no_such_unit', content), /unknown unit no_such_unit/);
});

test('the unit level is the mean level of its cards, rounded', () => {
  assert.equal(unitLevel('leaf_types', content, {}), 0);
  assert.equal(unitLevel('leaf_types', content, OPEN_LEAF), 2);
  assert.throws(() => unitLevel('no_such_unit', content, {}), /unknown unit no_such_unit/);
});

test('the tree nests every unit under its parent', () => {
  const tree = unitTree(content, {}, 'leaf');
  assert.equal(tree.length, 1);
  assert.equal(tree[0].key, 'leaf_types');
  assert.equal(tree[0].level, 1);
  assert.equal(tree[0].inside_count, 1);
  const genus = tree[0].children[0];
  assert.equal(genus.key, 'simple_lobed_genus');
  assert.equal(genus.inside_count, 4);
  assert.deepEqual(genus.children.map((n) => n.key), [
    'simple_lobed_white_oaks_co', 'simple_lobed_red_oaks_co',
    'simple_lobed_maples_co', 'simple_lobed_other_co'
  ]);
});

test('a closed unit says which unit opens it and how many cards are left', () => {
  const tree = unitTree(content, {}, 'leaf');
  const genus = tree[0].children[0];
  assert.equal(genus.open, false);
  assert.equal(genus.opens_with, 'Leaf types');
  assert.equal(genus.needed_cards, 1);
  const open = unitTree(content, OPEN_LEAF, 'leaf')[0].children[0];
  assert.equal(open.open, true);
  assert.equal(open.opens_with, null);
});

test('the next-up unit is marked, and so is every branch above it', () => {
  const tree = unitTree(content, LEAF_NEXT, 'leaf');
  assert.equal(tree[0].next_up, false);
  assert.equal(tree[0].holds_next, true);
  const genus = tree[0].children[0];
  assert.equal(genus.next_up, true);
  assert.equal(genus.holds_next, false);
});

test('the next unit is one unit in the whole content, not one per channel', () => {
  // With only the leaf concept seen, bark is the next unit, so the leaf tree
  // carries no mark at all.
  const tree = unitTree(content, OPEN_LEAF, 'leaf');
  assert.equal(tree[0].next_up, false);
  assert.equal(tree[0].holds_next, false);
  assert.equal(tree[0].children[0].next_up, false);
  assert.equal(unitTree(content, OPEN_LEAF, 'bark')[0].next_up, true);
});

test('the new count and the card count come off the unit cards', () => {
  const tree = unitTree(content, OPEN_LEAF, 'leaf');
  assert.equal(tree[0].card_count, 1);
  assert.equal(tree[0].new_count, 0);
  assert.equal(tree[0].children[0].new_count, tree[0].children[0].card_count);
});

test('level 1 opens by default, and so does the branch holding the next unit', () => {
  assert.deepEqual(defaultOpenUnits(content, LEAF_NEXT, 'leaf'), ['leaf_types']);
  const deeper = {
    ...LEAF_NEXT,
    'group:leaf:Quercus': { tier: 'mc8', tier_passes: 0 },
    'group:leaf:Acer': { tier: 'mc8', tier_passes: 0 },
    'group:leaf:Platanus': { tier: 'mc8', tier_passes: 0 }
  };
  assert.deepEqual(defaultOpenUnits(content, deeper, 'leaf'),
    ['leaf_types', 'simple_lobed_genus']);
});

test('the channel depth is the deepest unit on the stem, not capped at three', () => {
  // The leaf stem runs to a level-4 variety unit, so the channel page must not
  // say three deep over it. Bark and fruit hold one level-1 unit each.
  assert.equal(channelLessons(content, LEAF_NEXT, 'leaf').depth, 4);
  assert.equal(channelLessons(content, LEAF_NEXT, 'bark').depth, 1);
  assert.equal(channelLessons(content, LEAF_NEXT, 'fruit').depth, 1);
});

test('a channel page reads only its own keys out of the stored fold list', () => {
  const tree = unitTree(content, LEAF_NEXT, 'leaf');
  // Nothing stored at all: the default rule decides.
  assert.deepEqual(openUnitsFor(null, 'leaf', tree, content), ['leaf_types']);
  // A list written by another channel carries no leaf mark, so leaf still
  // reads its defaults rather than starting with every branch folded.
  assert.deepEqual(
    openUnitsFor([channelMark('bark'), 'bark_types'], 'leaf', tree, content),
    ['leaf_types']);
  // A list with the leaf mark is the user's own fold, so it stands.
  assert.deepEqual(openUnitsFor(
    [channelMark('bark'), 'bark_types', channelMark('leaf'), 'simple_lobed_genus'],
    'leaf', tree, content
  ), ['simple_lobed_genus']);
  // A key that names no unit in this content is from an older set.
  assert.deepEqual(
    openUnitsFor([channelMark('leaf'), 'gone_away'], 'leaf', tree, content), []);
});

test('a channel with every branch folded reads back as every branch folded', () => {
  const tree = unitTree(content, LEAF_NEXT, 'leaf');
  // The mark says the channel was written, so the empty set is the user's own
  // fold and not a channel the default rule has yet to reach.
  const stored = mergeOpenUnits(null, 'leaf', new Set(), content);
  assert.deepEqual(stored, [channelMark('leaf')]);
  assert.deepEqual(openUnitsFor(stored, 'leaf', tree, content), []);
});

test('a fold on one channel keeps the other channels their keys and marks', () => {
  const stored = [channelMark('bark'), 'bark_types', 'gone_away',
    channelMark('gone_channel'), channelMark('leaf'), 'leaf_types'];
  assert.deepEqual(
    mergeOpenUnits(stored, 'leaf',
      new Set(['leaf_types', 'simple_lobed_genus']), content),
    [channelMark('bark'), 'bark_types', channelMark('leaf'),
      'leaf_types', 'simple_lobed_genus']);
  // Folding every leaf branch leaves bark its mark and its key.
  assert.deepEqual(mergeOpenUnits(stored, 'leaf', new Set(), content),
    [channelMark('bark'), 'bark_types', channelMark('leaf')]);
  // A key from another channel cannot enter through this channel's set.
  assert.deepEqual(
    mergeOpenUnits(null, 'leaf', new Set(['bark_types']), content),
    [channelMark('leaf')]);
});

test('one channel summarises as three depths of unit squares', () => {
  const summary = channelLessons(content, LEAF_NEXT, 'leaf');
  assert.equal(summary.channel, 'leaf');
  assert.equal(summary.next_up_key, 'simple_lobed_genus');
  assert.equal(summary.total_count, 7);
  assert.equal(summary.open_count, 2);
  assert.deepEqual(summary.depths.map((d) => d.name), ['shapes', 'genera', 'species']);
  assert.deepEqual(summary.depths[0].units.map((u) => u.key), ['leaf_types']);
  assert.equal(summary.depths[1].units[0].next_up, true);
  // A level-4 variety unit has no depth of its own, so it joins the species row.
  assert.deepEqual(summary.depths[2].units.map((u) => u.key), [
    'simple_lobed_white_oaks_co', 'simple_lobed_red_oaks_co',
    'simple_lobed_maples_co', 'simple_lobed_other_co', 'quga_varieties'
  ]);
});

test('one channel carries the next unit and the others carry none', () => {
  const summaries = content.channels
    .map((channel) => channelLessons(content, LEAF_NEXT, channel));
  const carrying = summaries.filter((summary) => summary.next_up_key !== null);
  assert.deepEqual(carrying.map((summary) => summary.channel), ['leaf']);
  assert.equal(carrying[0].next_up_key, 'simple_lobed_genus');
  const marked = summaries
    .flatMap((summary) => summary.depths)
    .flatMap((depth) => depth.units)
    .filter((unit) => unit.next_up);
  assert.deepEqual(marked.map((unit) => unit.key), ['simple_lobed_genus']);
});

test('with the leaf concept alone the bark door carries the next unit', () => {
  const summaries = content.channels
    .map((channel) => channelLessons(content, OPEN_LEAF, channel));
  const carrying = summaries.filter((summary) => summary.next_up_key !== null);
  assert.deepEqual(carrying.map((summary) => summary.channel), ['bark']);
  assert.equal(carrying[0].next_up_key, 'bark_types');
});

test('the unit thumbnail is the first card in the unit that carries a photo', () => {
  const thumb = unitThumb(content, 'simple_lobed_red_oaks_co');
  assert.equal(thumb.kind, 'species');
  assert.equal(thumb.key, 'QURU');
  assert.equal(thumb.channel, 'leaf');
  assert.match(thumb.photo.hash, /^[0-9a-f]{64}$/);
});
