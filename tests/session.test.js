import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { makeRng } from './helpers/rng.js';
import { loadContent } from '../app/logic/content.js';
import { scheduleCard } from '../app/logic/scheduler.js';
import {
  dueCardIds, newCardCountToday, recommendUnit, buildSession,
  requeueCard, buildPlacementDeck, placementState, answerEffects,
  todayString, unitsForFocus, dueTomorrowCount, sessionPosition,
  emptyResults, accumulateAnswer, newCardCapDone, sessionPlace, sessionTotal
} from '../app/logic/session.js';

const { content } = loadContent(loadFixture());
const SETTINGS = { session_size: 20, new_per_day: 10 };
const TODAY = '2026-03-10';

function reviewed(due) {
  return { interval: 5, ease: 2.5, due, reps: 2, lapses: 0, recent: ['good'], tier: 'mc4', tier_passes: 1 };
}

function logRow(card, at, day) {
  return {
    card, at, day, grade: 'good', format: 'mc4', options: 4, elapsed_ms: 1000, answer: 'x'
  };
}

test('due cards come back most overdue first and only in the focus', () => {
  const states = {
    'species:QUGA:leaf': reviewed('2026-03-10'),
    'species:QURU:leaf': reviewed('2026-03-01'),
    'species:QUGA:bark': reviewed('2026-03-05'),
    'species:ACSA2:leaf': reviewed('2026-03-20')
  };
  assert.deepEqual(dueCardIds({ content, states, focus: 'all', today: TODAY }),
    ['species:QURU:leaf', 'species:QUGA:bark', 'species:QUGA:leaf']);
  assert.deepEqual(dueCardIds({ content, states, focus: 'leaf', today: TODAY }),
    ['species:QURU:leaf', 'species:QUGA:leaf']);
});

test('the deck fills from level-0 cards in the target unit', () => {
  const states = {};
  const result = buildSession({
    content, states, log: [], settings: SETTINGS, today: TODAY,
    focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(31)
  });
  assert.equal(result.unit_key, 'simple_lobed_maples_co');
  assert.deepEqual(result.new_card_ids.sort(), ['species:ACPL:leaf', 'species:ACSA2:leaf']);
  assert.deepEqual(result.card_ids.sort(), ['species:ACPL:leaf', 'species:ACSA2:leaf']);
});

// R4 deletes capped: no screen ever reads the distinction it drew.
test('buildSession returns four fields and no capped flag', () => {
  const result = buildSession({
    content, states: {}, log: [], settings: SETTINGS, today: TODAY,
    focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(30)
  });
  assert.deepEqual(Object.keys(result).sort(),
    ['card_ids', 'due_card_ids', 'new_card_ids', 'unit_key']);
});

test('the daily cap is counted from the log and stops the fill', () => {
  const log = [
    logRow('species:QUGA:leaf', '2026-03-10T09:00:00Z', '2026-03-10'),
    logRow('species:QURU:leaf', '2026-03-10T09:01:00Z', '2026-03-10'),
    logRow('species:QURU:leaf', '2026-03-10T09:02:00Z', '2026-03-10'),
    logRow('species:PLOC:leaf', '2026-03-09T09:00:00Z', '2026-03-09')
  ];
  assert.equal(newCardCountToday(log, '2026-03-10'), 2);
  const result = buildSession({
    content, states: {}, log, settings: { session_size: 20, new_per_day: 2 },
    today: '2026-03-10', focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(32)
  });
  assert.deepEqual(result.card_ids, []);
});

test('the day field decides the daily count, and at is the fallback', () => {
  const late = [logRow('species:QUGA:leaf', '2026-03-11T02:00:00Z', '2026-03-10')];
  assert.equal(newCardCountToday(late, '2026-03-10'), 1);
  assert.equal(newCardCountToday(late, '2026-03-11'), 0);
  const older = [{ card: 'species:QURU:leaf', at: '2026-03-10T09:00:00Z', grade: 'good' }];
  assert.equal(newCardCountToday(older, '2026-03-10'), 1);
});

test('the session never exceeds session_size', () => {
  const result = buildSession({
    content, states: {}, log: [], settings: { session_size: 1, new_per_day: 10 },
    today: TODAY, focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(33)
  });
  assert.equal(result.card_ids.length, 1);
});

test('a zero allowance and no due card leave the deck empty', () => {
  const result = buildSession({
    content, states: {}, log: [], settings: { session_size: 20, new_per_day: 0 },
    today: TODAY, focus: 'bark', chosen_unit: null, rng: makeRng(34)
  });
  assert.deepEqual(result.card_ids, []);
});

test('a due card fills the session, and an exhausted unit adds nothing', () => {
  const states = { 'species:QUGA:leaf': reviewed('2026-03-01') };
  const full = buildSession({
    content, states, log: [], settings: { session_size: 1, new_per_day: 0 },
    today: TODAY, focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(35)
  });
  assert.deepEqual(full.card_ids, ['species:QUGA:leaf']);

  const done = {
    'species:ACPL:leaf': reviewed('2026-03-20'),
    'species:ACSA2:leaf': reviewed('2026-03-20')
  };
  const empty = buildSession({
    content, states: done, log: [], settings: SETTINGS, today: TODAY,
    focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(36)
  });
  assert.deepEqual(empty.card_ids, []);
});

test('the recommendation skips a unit whose parent is under 80 percent at level 2', () => {
  const result = recommendUnit({ content, states: {}, focus: 'leaf' });
  assert.equal(result.unit_key, 'leaf_types');
  const learned = { 'concept:leaf:simple_lobed': { tier: 'mc8', tier_passes: 0 } };
  assert.equal(recommendUnit({ content, states: learned, focus: 'leaf' }).unit_key,
    'simple_lobed_genus');
});

test('the recommendation is empty when every open unit is exhausted, and names the next one', () => {
  const learned = { 'concept:leaf:simple_lobed': { tier: 'mc4', tier_passes: 0 } };
  const result = recommendUnit({ content, states: learned, focus: 'leaf' });
  assert.equal(result.unit_key, null);
  assert.equal(result.next_closed.unit_key, 'simple_lobed_genus');
  assert.equal(result.next_closed.parent_key, 'leaf_types');
  assert.equal(result.next_closed.needed_cards, 1);
});

test('a chosen unit bypasses the gate', () => {
  const result = buildSession({
    content, states: {}, log: [], settings: SETTINGS, today: TODAY,
    focus: 'leaf', chosen_unit: 'simple_lobed_other_co', rng: makeRng(41)
  });
  assert.deepEqual(result.card_ids, ['species:PLOC:leaf']);
});

test('a chosen unit overrides the recommended unit', () => {
  const result = buildSession({
    content, states: {}, log: [], settings: SETTINGS, today: TODAY,
    focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(42)
  });
  assert.equal(result.unit_key, 'simple_lobed_maples_co');
  assert.ok(!result.card_ids.includes('concept:leaf:simple_lobed'));
});

test('a deck that due cards fill carries no unit key', () => {
  const states = { 'species:QUGA:leaf': reviewed('2026-03-01') };
  const result = buildSession({
    content, states, log: [], settings: { session_size: 1, new_per_day: 10 },
    today: TODAY, focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(43)
  });
  assert.deepEqual(result.card_ids, ['species:QUGA:leaf']);
  assert.deepEqual(result.new_card_ids, []);
  assert.equal(result.unit_key, null);
});

test('the header names the unit only for a card in that unit', () => {
  const unitKey = 'simple_lobed_maples_co';
  const place = (cardId, mode = 'review', key = unitKey) =>
    sessionPlace({ content, mode, unit_key: key, card_id: cardId });
  assert.equal(place('species:ACPL:leaf'), 'Maples');
  assert.equal(place('species:QUGA:leaf'), 'Review');
  assert.equal(place('species:ACPL:leaf', 'review', null), 'Review');
  assert.equal(place('concept:leaf:simple_lobed', 'placement', null), 'Placement test');
});

test('an again card re-queues once at the back', () => {
  const deck = ['a', 'b', 'c'];
  assert.deepEqual(requeueCard(deck, 0, 'a'), ['b', 'c', 'a']);
  assert.deepEqual(requeueCard(deck, 2, 'c'), ['a', 'b', 'c']);
  assert.deepEqual(deck, ['a', 'b', 'c']);
});

test('the placement deck holds one card per level-1 concept in channel order', () => {
  const deck = buildPlacementDeck(content);
  assert.deepEqual(deck, [
    'concept:leaf:simple_lobed',
    'concept:bark:furrowed',
    'concept:bark:papery',
    'concept:bark:plated',
    'concept:fruit:acorn',
    'concept:fruit:samara'
  ]);
});

test('a right placement answer writes the 21 day state and a wrong one writes nothing', () => {
  const state = placementState(true, '2026-03-10');
  assert.equal(state.tier, 'mc8');
  assert.equal(state.tier_passes, 0);
  assert.equal(state.interval, 21);
  assert.equal(state.ease, 2.5);
  assert.equal(state.reps, 1);
  assert.equal(state.due, '2026-03-31');
  assert.equal(placementState(false, '2026-03-10'), null);
});

test('placement never overwrites a card that already has a state', () => {
  const before = { interval: 4, ease: 2.5, due: '2026-03-14', reps: 2, lapses: 0, recent: [], tier: 'mc4', tier_passes: 1 };
  assert.equal(placementState(true, '2026-03-10', before), null);
  assert.equal(placementState(true, '2026-03-10', null).interval, 21);
});

test('todayString reads the local calendar date', () => {
  assert.equal(todayString(new Date(2026, 2, 10, 2, 0, 0)), '2026-03-10');
  assert.equal(todayString(new Date(2026, 11, 31, 23, 30, 0)), '2026-12-31');
});

test('unitsForFocus keeps content order and answers all', () => {
  assert.deepEqual(unitsForFocus(content, 'bark').map((u) => u.key), ['bark_types']);
  assert.equal(unitsForFocus(content, 'all').length, content.units.length);
  assert.equal(unitsForFocus(content, 'leaf')[0].key, 'leaf_types');
});

test('dueTomorrowCount counts the states due the next day', () => {
  const states = {
    a: { due: '2026-03-11' },
    b: { due: '2026-03-11' },
    c: { due: '2026-03-12' },
    d: { due: '2026-03-10' }
  };
  assert.equal(dueTomorrowCount(states, TODAY), 2);
  assert.equal(dueTomorrowCount({}, TODAY), 0);
});

test('the session position stays inside the deck', () => {
  assert.deepEqual(sessionPosition(0, 5), { position: 1, total: 5, percent: 20 });
  assert.deepEqual(sessionPosition(3, 5), { position: 3, total: 5, percent: 60 });
  assert.deepEqual(sessionPosition(9, 5), { position: 5, total: 5, percent: 100 });
  assert.deepEqual(sessionPosition(1, 0), { position: 0, total: 0, percent: 0 });
});

test('a card that comes back after a miss counts in the total', () => {
  assert.equal(sessionTotal(8, 0), 8);
  assert.equal(sessionTotal(8, 1), 9);
  // An eight-card deck with one repeat asks nine questions, and the last
  // one reads 9 of 9.
  assert.deepEqual(sessionPosition(9, sessionTotal(8, 1)),
    { position: 9, total: 9, percent: 100 });
});

test('a repeat answer writes nothing', () => {
  const effects = answerEffects({
    mode: 'review', repeat: true, correct: true, grade: 'good', before: undefined,
    today: TODAY, inv_available: true, requeued: true
  });
  assert.deepEqual(effects, { state: null, log: false, requeue: false });
});

test('a placement answer writes state and no log row', () => {
  const right = answerEffects({
    mode: 'placement', repeat: false, correct: true, grade: 'good', before: undefined,
    today: TODAY, inv_available: true, requeued: false
  });
  assert.equal(right.state.tier, 'mc8');
  assert.equal(right.log, false);
  assert.equal(right.requeue, false);

  const wrong = answerEffects({
    mode: 'placement', repeat: false, correct: false, grade: 'again', before: undefined,
    today: TODAY, inv_available: true, requeued: false
  });
  assert.equal(wrong.state, null);
  assert.equal(wrong.log, false);
  assert.equal(wrong.requeue, false);
});

test('a review answer writes the scheduled state and a log row', () => {
  const before = { interval: 25, ease: 2.5, due: TODAY, reps: 5, lapses: 0, recent: ['good'], tier: 'mc8', tier_passes: 1 };
  const withInv = answerEffects({
    mode: 'review', repeat: false, correct: true, grade: 'good', before,
    today: TODAY, inv_available: true, requeued: false
  });
  assert.deepEqual(withInv.state, scheduleCard(before, 'good', TODAY, { inv_available: true }));
  assert.equal(withInv.log, true);
  assert.equal(withInv.requeue, false);

  const noInv = answerEffects({
    mode: 'review', repeat: false, correct: true, grade: 'good', before,
    today: TODAY, inv_available: false, requeued: false
  });
  assert.deepEqual(noInv.state, scheduleCard(before, 'good', TODAY, { inv_available: false }));
  assert.notEqual(withInv.state.tier, noInv.state.tier);
});

test('an again answer re-queues once and not twice', () => {
  const first = answerEffects({
    mode: 'review', repeat: false, correct: false, grade: 'again', before: undefined,
    today: TODAY, inv_available: true, requeued: false
  });
  assert.equal(first.requeue, true);
  assert.equal(first.log, true);

  const second = answerEffects({
    mode: 'review', repeat: false, correct: false, grade: 'again', before: undefined,
    today: TODAY, inv_available: true, requeued: true
  });
  assert.equal(second.requeue, false);
  assert.equal(second.log, true);
});

// R2: the session summary is counted here, so the summary screen computes nothing.
const AT_LEVEL_1 = { interval: 1, ease: 2.5, due: TODAY, reps: 1, lapses: 0, recent: ['good'], tier: 'mc4', tier_passes: 1 };
const AT_LEVEL_2 = { interval: 8, ease: 2.5, due: TODAY, reps: 3, lapses: 0, recent: ['good'], tier: 'mc8', tier_passes: 0 };
const A_MISS = { label: 'Gambel oak', chosen: 'Bur oak', diagnostic: 'The lobes are rounded.' };

function answered(extra) {
  return {
    card_id: 'species:QUGA:leaf',
    repeat: false,
    correct: true,
    before: AT_LEVEL_1,
    after: AT_LEVEL_1,
    miss: null,
    ...extra
  };
}

test('emptyResults starts every tally at zero and hands out its own lists', () => {
  assert.deepEqual(emptyResults(), { right: 0, missed: 0, promoted: [], demoted: [], misses: [] });
  const first = emptyResults();
  first.promoted.push('species:QUGA:leaf');
  assert.deepEqual(emptyResults().promoted, []);
});

test('accumulateAnswer counts a right answer and leaves the input untouched', () => {
  const start = emptyResults();
  const next = accumulateAnswer(start, answered({}));
  assert.equal(next.right, 1);
  assert.equal(next.missed, 0);
  assert.notEqual(next, start);
  assert.deepEqual(start, emptyResults());
});

test('accumulateAnswer counts a wrong answer and keeps its miss entry', () => {
  const start = emptyResults();
  const next = accumulateAnswer(start,
    answered({ correct: false, after: AT_LEVEL_1, miss: A_MISS }));
  assert.equal(next.right, 0);
  assert.equal(next.missed, 1);
  assert.deepEqual(next.misses, [A_MISS]);
  // The new miss goes into a new list, not into the list handed in.
  assert.deepEqual(start.misses, []);
});

test('a card that gains a level lands under promoted, by card id', () => {
  const start = emptyResults();
  const next = accumulateAnswer(start,
    answered({ before: AT_LEVEL_1, after: AT_LEVEL_2 }));
  assert.deepEqual(next.promoted, ['species:QUGA:leaf']);
  assert.deepEqual(next.demoted, []);
  assert.deepEqual(start.promoted, []);
});

test('a card that loses a level lands under demoted', () => {
  const start = emptyResults();
  const next = accumulateAnswer(start,
    answered({ correct: false, before: AT_LEVEL_2, after: AT_LEVEL_1, miss: A_MISS }));
  assert.deepEqual(next.demoted, ['species:QUGA:leaf']);
  assert.deepEqual(next.promoted, []);
  assert.deepEqual(start.demoted, []);
});

test('a first-ever answer is new, not promoted', () => {
  const next = accumulateAnswer(emptyResults(),
    answered({ before: undefined, after: AT_LEVEL_1 }));
  assert.deepEqual(next.promoted, []);
  assert.deepEqual(next.demoted, []);
  assert.equal(next.right, 1);
});

test('an answer that writes no state changes no level list', () => {
  const next = accumulateAnswer(emptyResults(),
    answered({ correct: false, before: AT_LEVEL_2, after: null, miss: A_MISS }));
  assert.deepEqual(next.promoted, []);
  assert.deepEqual(next.demoted, []);
  assert.equal(next.missed, 1);
});

test('a repeat answer changes nothing at all', () => {
  const next = accumulateAnswer(emptyResults(),
    answered({ repeat: true, correct: false, after: null, miss: A_MISS }));
  assert.deepEqual(next, emptyResults());
});

test('accumulateAnswer adds up over a whole session', () => {
  let results = emptyResults();
  results = accumulateAnswer(results, answered({ before: AT_LEVEL_1, after: AT_LEVEL_2 }));
  results = accumulateAnswer(results, answered({
    card_id: 'species:QURU:leaf', correct: false, before: AT_LEVEL_2, after: AT_LEVEL_1, miss: A_MISS
  }));
  results = accumulateAnswer(results, answered({ card_id: 'species:ACPL:leaf' }));
  assert.equal(results.right, 2);
  assert.equal(results.missed, 1);
  assert.deepEqual(results.promoted, ['species:QUGA:leaf']);
  assert.deepEqual(results.demoted, ['species:QURU:leaf']);
  assert.equal(results.misses.length, 1);
});

// R2: the home screen reads this boolean and works out nothing itself.
test('the cap notice needs an empty due queue and the day of new cards done', () => {
  const log = [
    logRow('species:QUGA:leaf', '2026-03-10T09:00:00Z', '2026-03-10'),
    logRow('species:QURU:leaf', '2026-03-10T09:01:00Z', '2026-03-10')
  ];
  assert.equal(newCardCapDone({
    content, states: {}, log, settings: { session_size: 20, new_per_day: 2 },
    focus: 'all', today: TODAY
  }), true);
  assert.equal(newCardCapDone({
    content, states: {}, log, settings: { session_size: 20, new_per_day: 3 },
    focus: 'all', today: TODAY
  }), false);
});

test('a due card in the focus clears the cap notice', () => {
  const log = [logRow('species:QUGA:leaf', '2026-03-10T09:00:00Z', '2026-03-10')];
  const settings = { session_size: 20, new_per_day: 1 };
  const states = { 'species:QUGA:bark': reviewed('2026-03-01') };
  assert.equal(newCardCapDone({ content, states, log, settings, focus: 'bark', today: TODAY }), false);
  assert.equal(newCardCapDone({ content, states, log, settings, focus: 'leaf', today: TODAY }), true);
});

test('yesterdays new cards do not count against today', () => {
  const log = [logRow('species:QUGA:leaf', '2026-03-09T09:00:00Z', '2026-03-09')];
  assert.equal(newCardCapDone({
    content, states: {}, log, settings: { session_size: 20, new_per_day: 1 },
    focus: 'all', today: TODAY
  }), false);
});
