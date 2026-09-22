import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveGrade, newCardState, addDays, isDue,
  FORMAT_THRESHOLDS_MS, TIME_CEILING_MS, PROMOTION_GATES,
  scheduleCard, nextTier, previousTier
} from '../app/logic/scheduler.js';

test('a wrong answer is again at any time', () => {
  assert.equal(deriveGrade({ correct: false, guess: false, elapsed_ms: 500, format: 'mc4' }), 'again');
  assert.equal(deriveGrade({ correct: false, guess: true, elapsed_ms: 90000, format: 'typed' }), 'again');
});

test('a checked guess box makes a right answer hard', () => {
  assert.equal(deriveGrade({ correct: true, guess: true, elapsed_ms: 900, format: 'mc4' }), 'hard');
});

test('an elapsed time over the format threshold makes a right answer hard', () => {
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 8001, format: 'mc4' }), 'hard');
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 7999, format: 'mc4' }), 'good');
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 15001, format: 'mc8' }), 'hard');
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 20001, format: 'inv' }), 'hard');
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 20001, format: 'typed' }), 'hard');
});

test('above 60 seconds the time signal is discarded', () => {
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 61000, format: 'mc4' }), 'good');
  assert.equal(deriveGrade({ correct: true, guess: true, elapsed_ms: 61000, format: 'mc4' }), 'hard');
  assert.equal(TIME_CEILING_MS, 60000);
  assert.equal(FORMAT_THRESHOLDS_MS.mc8, 15000);
});

const OPTS = { inv_available: true };

test('a new card runs the 1, 4, 10, 25 chain on good', () => {
  let state = scheduleCard(null, 'good', '2026-01-01', OPTS);
  assert.equal(state.interval, 1);
  assert.equal(state.due, '2026-01-02');
  assert.equal(state.reps, 1);
  state = scheduleCard(state, 'good', '2026-01-02', OPTS);
  assert.equal(state.interval, 4);
  state = scheduleCard(state, 'good', '2026-01-06', OPTS);
  assert.equal(state.interval, 10);
  state = scheduleCard(state, 'good', '2026-01-16', OPTS);
  assert.equal(state.interval, 25);
});

test('hard multiplies by 1.2 and drops ease by 0.15', () => {
  const start = { ...newCardState(), interval: 10, reps: 3, tier: 'mc8', ease: 2.5 };
  const state = scheduleCard(start, 'hard', '2026-01-01', OPTS);
  assert.equal(state.interval, 12);
  assert.equal(state.ease, 2.35);
});

test('again resets the interval to 1, adds a lapse, drops ease, and demotes one tier', () => {
  const start = { ...newCardState(), interval: 25, reps: 5, lapses: 1, tier: 'inv', ease: 2.5 };
  const state = scheduleCard(start, 'again', '2026-01-01', OPTS);
  assert.equal(state.interval, 1);
  assert.equal(state.lapses, 2);
  assert.equal(state.ease, 2.3);
  assert.equal(state.due, '2026-01-02');
  assert.equal(state.tier, 'mc8');
});

test('ease has a floor of 1.3', () => {
  let state = { ...newCardState(), interval: 4, reps: 2, ease: 1.4 };
  state = scheduleCard(state, 'again', '2026-01-01', OPTS);
  assert.equal(state.ease, 1.3);
  state = scheduleCard(state, 'again', '2026-01-02', OPTS);
  assert.equal(state.ease, 1.3);
});

test('recent holds the last three grades and reps counts every review', () => {
  let state = null;
  for (const grade of ['good', 'hard', 'good', 'again']) {
    state = scheduleCard(state, grade, '2026-01-01', OPTS);
  }
  assert.deepEqual(state.recent, ['hard', 'good', 'again']);
  assert.equal(state.reps, 4);
});

test('scheduleCard does not mutate its input', () => {
  const start = { ...newCardState(), interval: 10, reps: 3, tier: 'mc8' };
  const copy = JSON.parse(JSON.stringify(start));
  scheduleCard(start, 'good', '2026-01-01', OPTS);
  assert.deepEqual(start, copy);
});

test('a card that lapsed does not repeat the learning step', () => {
  const lapsed = { ...newCardState(), interval: 1, reps: 6, lapses: 1, tier: 'mc8', ease: 2.5 };
  const state = scheduleCard(lapsed, 'good', '2026-01-01', OPTS);
  assert.equal(state.interval, 3);
  assert.equal(state.due, '2026-01-04');
});

test('hard at interval 1 follows the formula and does not jump to 4', () => {
  const learning = { ...newCardState(), interval: 1, reps: 1, ease: 2.5 };
  assert.equal(scheduleCard(learning, 'hard', '2026-01-01', OPTS).interval, 1);
  const lapsed = { ...newCardState(), interval: 1, reps: 6, lapses: 1, ease: 2.3 };
  assert.equal(scheduleCard(lapsed, 'hard', '2026-01-01', OPTS).interval, 1);
});

test('a first answer of again starts the card in learning and records no lapse', () => {
  const state = scheduleCard(null, 'again', '2026-01-01', OPTS);
  assert.equal(state.interval, 1);
  assert.equal(state.lapses, 0);
  assert.equal(state.ease, 2.5);
  assert.equal(state.reps, 1);
  assert.equal(state.tier, 'mc4');
  assert.equal(state.tier_passes, 0);
  assert.equal(scheduleCard(state, 'good', '2026-01-02', OPTS).interval, 4);
});

test('promotion needs two good passes and the interval gate', () => {
  let state = { ...newCardState(), interval: 10, reps: 3, tier: 'mc4', tier_passes: 0 };
  state = scheduleCard(state, 'good', '2026-01-01', OPTS);
  assert.equal(state.tier, 'mc4');
  assert.equal(state.tier_passes, 1);
  state = scheduleCard(state, 'good', '2026-01-02', OPTS);
  assert.equal(state.tier, 'mc8');
  assert.equal(state.tier_passes, 0);
});

test('the interval gate blocks a promotion that has the passes', () => {
  let state = { ...newCardState(), interval: 1, reps: 1, tier: 'mc4', tier_passes: 1 };
  state = scheduleCard(state, 'good', '2026-01-01', OPTS);
  assert.equal(state.interval, 4);
  assert.equal(state.tier_passes, 2);
  assert.equal(state.tier, 'mc4');
  assert.equal(PROMOTION_GATES.mc8, 7);
});

test('a hard grade is not a pass', () => {
  let state = { ...newCardState(), interval: 10, reps: 3, tier: 'mc4', tier_passes: 1 };
  state = scheduleCard(state, 'hard', '2026-01-01', OPTS);
  assert.equal(state.tier_passes, 1);
  assert.equal(state.tier, 'mc4');
});

test('a hard grade never promotes, even when it crosses the gate', () => {
  const start = { ...newCardState(), interval: 10, reps: 3, tier: 'mc4', tier_passes: 2 };
  const state = scheduleCard(start, 'hard', '2026-01-01', OPTS);
  assert.equal(state.interval, 12);
  assert.equal(state.tier, 'mc4');
  assert.equal(state.tier_passes, 2);
});

test('demotion drops one tier and resets tier_passes, with no exception at level 4', () => {
  const expert = { ...newCardState(), interval: 60, reps: 9, tier: 'typed', tier_passes: 3 };
  const after = scheduleCard(expert, 'again', '2026-01-01', OPTS);
  assert.equal(after.tier, 'inv');
  assert.equal(after.tier_passes, 0);
  const floor = scheduleCard({ ...newCardState(), tier: 'mc4', tier_passes: 2 }, 'again', '2026-01-01', OPTS);
  assert.equal(floor.tier, 'mc4');
  assert.equal(floor.tier_passes, 0);
});

test('typed keeps counting passes and never promotes further', () => {
  let state = { ...newCardState(), interval: 40, reps: 8, tier: 'typed', tier_passes: 0 };
  state = scheduleCard(state, 'good', '2026-01-01', OPTS);
  assert.equal(state.tier, 'typed');
  assert.equal(state.tier_passes, 1);
  assert.equal(nextTier('typed', true), null);
});

test('the inv tier is skipped when the channel has fewer than four photo options', () => {
  const noInv = { inv_available: false };
  assert.equal(nextTier('mc8', false), 'typed');
  assert.equal(previousTier('typed', false), 'mc8');
  let state = { ...newCardState(), interval: 25, reps: 5, tier: 'mc8', tier_passes: 1 };
  state = scheduleCard(state, 'good', '2026-01-01', noInv);
  assert.equal(state.tier, 'typed');
  const demoted = scheduleCard({ ...newCardState(), interval: 40, reps: 9, tier: 'typed', tier_passes: 2 }, 'again', '2026-01-01', noInv);
  assert.equal(demoted.tier, 'mc8');
});

test('isDue compares the due date against today', () => {
  assert.equal(isDue({ due: '2026-01-01' }, '2026-01-01'), true);
  assert.equal(isDue({ due: '2025-12-31' }, '2026-01-01'), true);
  assert.equal(isDue({ due: '2026-01-02' }, '2026-01-01'), false);
  assert.equal(isDue(null, '2026-01-01'), false);
});

test('addDays crosses a month and a year boundary', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});
