// Property tests: each one states a rule that must hold for every input, and
// checks it on a few hundred seeded random inputs. A failure names its seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forEachSeed, intIn, pick } from './helpers/rng.js';
import {
  scheduleCard, addDays, daysBetween, newCardState
} from '../app/logic/scheduler.js';
import {
  createStore, memoryStorage, KEYS, TEXT_SIZES, STORE_VERSION
} from '../app/logic/store.js';

const CASES = 300;
const GRADES = ['again', 'hard', 'good'];
const TIERS = ['mc4', 'mc8', 'inv', 'typed'];
const TIER_RANK = { mc4: 0, mc8: 1, inv: 2, typed: 3 };

function randomDay(rng) {
  return addDays('2024-01-01', intIn(rng, 0, 3 * 365));
}

// A card state that a run of answers could reach, or null for a new card.
function randomState(rng) {
  if (rng() < 0.15) return null;
  return {
    ...newCardState(),
    interval: intIn(rng, 0, 400),
    ease: Math.round((1.3 + rng() * 1.7) * 100) / 100,
    due: randomDay(rng),
    reps: intIn(rng, 0, 50),
    lapses: intIn(rng, 0, 10),
    recent: Array.from({ length: intIn(rng, 0, 3) }, () => pick(rng, GRADES)),
    tier: pick(rng, TIERS),
    tier_passes: intIn(rng, 0, 3)
  };
}

test('addDays and daysBetween are a round trip', () => {
  forEachSeed(CASES, (rng) => {
    const day = randomDay(rng);
    const days = intIn(rng, -1000, 1000);
    assert.equal(daysBetween(day, addDays(day, days)), days);
  });
});

test('scheduleCard never sets a due date on or before today', () => {
  forEachSeed(CASES, (rng) => {
    const today = randomDay(rng);
    const next = scheduleCard(randomState(rng), pick(rng, GRADES), today, { inv_available: rng() < 0.5 });
    assert.ok(next.interval >= 1, `interval ${next.interval}`);
    assert.ok(next.due > today, `due ${next.due} for today ${today}`);
  });
});

test('a right answer never lowers the tier, and a wrong one lowers it', () => {
  forEachSeed(CASES, (rng) => {
    const state = randomState(rng);
    const grade = pick(rng, GRADES);
    const before = TIER_RANK[(state ?? newCardState()).tier];
    const after = TIER_RANK[scheduleCard(state, grade, randomDay(rng), { inv_available: rng() < 0.5 }).tier];
    if (grade === 'again') {
      // A wrong answer drops a card one tier or more, down to mc4 at the floor.
      assert.ok(before === 0 ? after === 0 : after < before, `${grade}: ${before} to ${after}`);
    } else {
      assert.ok(after >= before, `${grade}: ${before} to ${after}`);
    }
  });
});

test('the ease never goes up and never falls under 1.3', () => {
  forEachSeed(CASES, (rng) => {
    const state = randomState(rng);
    const next = scheduleCard(state, pick(rng, GRADES), randomDay(rng));
    assert.ok(next.ease >= 1.3, `ease ${next.ease}`);
    assert.ok(next.ease <= (state ?? newCardState()).ease, `ease rose to ${next.ease}`);
  });
});

test('a long run of answers keeps every card state valid', () => {
  forEachSeed(100, (rng) => {
    let state = null;
    let today = randomDay(rng);
    for (let i = 0; i < 40; i += 1) {
      state = scheduleCard(state, pick(rng, GRADES), today, { inv_available: rng() < 0.7 });
      assert.ok(TIERS.includes(state.tier), `tier ${state.tier}`);
      assert.ok(state.recent.length <= 3);
      assert.equal(state.reps, i + 1);
      assert.ok(state.lapses <= state.reps);
      today = addDays(today, intIn(rng, 0, state.interval + 5));
    }
  });
});

// Progress a learner could have: cards, log rows, settings, and missing pairs.
function fillStore(rng, store) {
  const cards = intIn(rng, 0, 12);
  for (let i = 0; i < cards; i += 1) {
    const state = randomState(rng) ?? newCardState();
    store.writeCard(`card:${i}`, state);
    store.appendLog({ card: `card:${i}`, day: randomDay(rng), grade: pick(rng, GRADES) });
  }
  store.writeSettings({
    session_size: intIn(rng, 1, 40),
    new_per_day: intIn(rng, 1, 20),
    text_size: pick(rng, TEXT_SIZES),
    open_units: rng() < 0.5 ? null : ['leaf_types', 'oaks'].slice(0, intIn(rng, 0, 2))
  });
  const edges = intIn(rng, 0, 4);
  for (let i = 0; i < edges; i += 1) {
    store.recordMissingEdge({ a: pick(rng, ['QURU', 'QUAL', 'ACRU']), b: pick(rng, ['QUVE', 'ACSA']), channel: pick(rng, ['leaf', 'bark']) });
  }
}

test('progress survives export and import unchanged', () => {
  forEachSeed(CASES, (rng) => {
    const first = createStore(memoryStorage());
    fillStore(rng, first);
    const today = randomDay(rng);
    const blob = first.exportBlob(today);

    const second = createStore(memoryStorage());
    assert.deepEqual(second.importBlob(blob.json), { ok: true, errors: [] });
    assert.deepEqual(second.readCards(), first.readCards());
    assert.deepEqual(second.readLog(), first.readLog());
    assert.deepEqual(second.readMissingEdges(), first.readMissingEdges());
    assert.deepEqual(second.readSettings(), { ...first.readSettings(), last_export: today });
  });
});

test('a version 0 cards section loads with each card at the first tier and nothing lost', () => {
  // This test covers the one migration there is. A new STORE_VERSION needs a
  // property test of its own migration.
  assert.equal(STORE_VERSION, 1);
  forEachSeed(CASES, (rng) => {
    const old = {};
    const count = intIn(rng, 0, 8);
    for (let i = 0; i < count; i += 1) {
      const { tier, tier_passes, ...rest } = randomState(rng) ?? newCardState();
      old[`card:${i}`] = rest;
    }
    const store = createStore(memoryStorage({ [KEYS.cards]: JSON.stringify({ cards: old }) }));
    const cards = store.readCards();
    assert.deepEqual(Object.keys(cards), Object.keys(old));
    for (const [id, state] of Object.entries(cards)) {
      assert.deepEqual(state, { tier: 'mc4', tier_passes: 0, ...old[id] });
    }
  });
});
