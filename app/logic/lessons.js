// The lessons tree, the fold defaults, and the per-channel unit summary. Pure.
import { cardLevel, rollupLevel, gateStatus, unseenCount } from './progress.js';
import { recommendUnit } from './session.js';

const DEPTH_NAMES = { 1: 'shapes', 2: 'genera', 3: 'species' };

export function channelUnits(content, channel) {
  return content.units.filter((unit) => unit.channel === channel);
}

function unitOr(content, unitKey) {
  const unit = content.units.find((item) => item.key === unitKey);
  if (!unit) throw new Error(`unknown unit ${unitKey}`);
  return unit;
}

// The place of a unit in its channel, counting from one. The home screen
// prints it as "Unit 5". It is not `unitNumber`, which is a percent.
export function unitOrdinal(unitKey, content) {
  const unit = unitOr(content, unitKey);
  return channelUnits(content, unit.channel).findIndex((item) => item.key === unitKey) + 1;
}

export function unitLevel(unitKey, content, states) {
  unitOr(content, unitKey);
  const ids = content.unit_cards[unitKey] ?? [];
  return rollupLevel(ids.map((id) => cardLevel(states[id])));
}

// One unit is next in the whole app, not one per channel. Home, the lessons
// doors, and the channel page all mark the same unit, and the fold opens the
// one branch that holds it. With nothing open anywhere, no unit is next.
function nextUnitKey(content, states) {
  return recommendUnit({ content, states, focus: 'all' }).unit_key;
}

function buildNode(content, states, unit, nextUpKey) {
  const ids = content.unit_cards[unit.key] ?? [];
  const gate = gateStatus(unit.key, content, states);
  const children = content.units
    .filter((item) => item.parent === unit.key)
    .map((child) => buildNode(content, states, child, nextUpKey));
  const parent = gate.parent_key
    ? content.units.find((item) => item.key === gate.parent_key)
    : null;
  return {
    key: unit.key,
    name: unit.name,
    level: unit.level,
    channel: unit.channel,
    card_count: ids.length,
    new_count: unseenCount(ids, states),
    rollup: unitLevel(unit.key, content, states),
    open: gate.open,
    opens_with: gate.open ? null : (parent?.name ?? null),
    needed_cards: gate.needed_cards,
    next_up: unit.key === nextUpKey,
    holds_next: children.some((child) => child.next_up || child.holds_next),
    inside_count: children.length,
    children
  };
}

export function unitTree(content, states, channel) {
  const nextKey = nextUnitKey(content, states);
  return channelUnits(content, channel)
    .filter((unit) => unit.parent === null)
    .map((unit) => buildNode(content, states, unit, nextKey));
}

// The fold the app opens with. A level-1 row shows its children, so the
// level-2 units are visible. A level-2 row stays folded unless the next-up
// unit sits inside it. A row with no children is never in the list. A row
// that is itself next up does not open: the branch above it does, which is
// what puts it on screen.
function defaultOpenFromTree(tree) {
  const open = [];
  const walk = (node) => {
    if (node.children.length > 0 && (node.level <= 1 || node.holds_next)) {
      open.push(node.key);
    }
    node.children.forEach(walk);
  };
  tree.forEach(walk);
  return open;
}

export function defaultOpenUnits(content, states, channel) {
  return defaultOpenFromTree(unitTree(content, states, channel));
}

// The channel a unit key belongs to, or null when the content has no such
// unit. A stored key with no unit comes from an older content set.
function channelOfKey(content, key) {
  return content.units.find((item) => item.key === key)?.channel ?? null;
}

// The open list in settings is one list for the whole app, so one channel page
// must read only its own part of it. A stored list that holds no key from this
// channel has never been written for this channel, so the default rule still
// decides. `stored` is null before the user folds anything at all.
export function openUnitsFor(stored, channel, tree, content) {
  if (stored === null) return defaultOpenFromTree(tree);
  const mine = stored.filter((key) => channelOfKey(content, key) === channel);
  return mine.length > 0 ? mine : defaultOpenFromTree(tree);
}

// The stored list after a fold on this channel. Every key from another channel
// stays where it is, this channel's keys become the open set, and a key that
// names no unit in the content drops out.
export function mergeOpenUnits(stored, channel, openKeys, content) {
  const other = (stored ?? []).filter((key) => {
    const owner = channelOfKey(content, key);
    return owner !== null && owner !== channel;
  });
  const mine = [...openKeys].filter(
    (key) => channelOfKey(content, key) === channel
  );
  return [...other, ...mine];
}

// One block on the lessons page: three rows of unit squares, one row per
// depth. A level-4 variety unit has no depth of its own, so it joins the
// species row rather than disappearing.
// How deep the printed stem runs: the greatest level any unit on the tree
// carries. A level-4 variety unit counts, so the channel page never says three
// deep over a stem that runs four.
function treeDepth(tree) {
  let deepest = 0;
  const walk = (node) => {
    if (node.level > deepest) deepest = node.level;
    node.children.forEach(walk);
  };
  tree.forEach(walk);
  return deepest;
}

export function channelLessons(content, states, channel) {
  const units = channelUnits(content, channel);
  const nextKey = nextUnitKey(content, states);
  const depthOf = (unit) => Math.min(unit.level, 3);
  const depths = [1, 2, 3].map((level) => ({
    level,
    name: DEPTH_NAMES[level],
    units: units.filter((unit) => depthOf(unit) === level).map((unit) => ({
      key: unit.key,
      name: unit.name,
      open: gateStatus(unit.key, content, states).open,
      next_up: unit.key === nextKey
    }))
  }));
  const openCount = depths
    .flatMap((depth) => depth.units)
    .filter((unit) => unit.open).length;
  // The next unit belongs to one channel. Every other channel reads null, so
  // only one door on the lessons page carries the tick.
  const mine = units.some((unit) => unit.key === nextKey);
  return {
    channel,
    next_up_key: mine ? nextKey : null,
    open_count: openCount,
    total_count: units.length,
    depth: treeDepth(unitTree(content, states, channel)),
    depths
  };
}

// The small print beside a unit: the first card in the unit that has a photo.
export function unitThumb(content, unitKey) {
  for (const id of content.unit_cards[unitKey] ?? []) {
    const card = content.cards[id];
    if (card && card.photos.length > 0) {
      return {
        card_id: id,
        kind: card.kind,
        key: card.key,
        channel: card.channel,
        photo: card.photos[0]
      };
    }
  }
  return null;
}
