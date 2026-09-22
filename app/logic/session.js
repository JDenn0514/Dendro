// Builds a session deck from due and level-0 cards. Pure.
import { isDue, addDays, scheduleCard } from './scheduler.js';
import { shuffle } from './question.js';
import { gateStatus, cardLevel } from './progress.js';

// A right placement answer parks the card this many days out.
const PLACEMENT_INTERVAL_DAYS = 21;

function inFocus(card, focus) {
  return focus === 'all' || card.channel === focus;
}

// The local calendar date. Every date in the app is a local date, never a UTC one.
export function todayString(now = new Date()) {
  return now.toLocaleDateString('en-CA');
}

export function unitsForFocus(content, focus) {
  return content.units.filter((unit) => focus === 'all' || unit.channel === focus);
}

export function dueTomorrowCount(states, today) {
  const tomorrow = addDays(today, 1);
  return Object.values(states).filter((state) => state && state.due === tomorrow).length;
}

// The progress bar: card n of N. An empty deck reads 0 of 0.
export function sessionPosition(shown, total) {
  if (total <= 0) return { position: 0, total, percent: 0 };
  const position = Math.min(Math.max(shown, 1), total);
  return { position, total, percent: Math.round((position / total) * 100) };
}

export function dueCardIds({ content, states, focus, today }) {
  return Object.values(content.cards)
    .filter((card) => inFocus(card, focus))
    .filter((card) => isDue(states[card.id], today))
    .sort((a, b) => {
      const byDue = states[a.id].due.localeCompare(states[b.id].due);
      return byDue !== 0 ? byDue : a.id.localeCompare(b.id);
    })
    .map((card) => card.id);
}

export function newCardCountToday(log, today) {
  const firstSeen = new Map();
  for (const row of log) {
    const day = row.day ?? row.at.slice(0, 10);
    if (!firstSeen.has(row.card)) firstSeen.set(row.card, day);
  }
  let count = 0;
  for (const day of firstSeen.values()) if (day === today) count += 1;
  return count;
}

export function recommendUnit({ content, states, focus }) {
  let nextClosed = null;
  for (const unit of unitsForFocus(content, focus)) {
    const ids = content.unit_cards[unit.key] ?? [];
    const hasNew = ids.some((id) => !states[id]);
    if (!hasNew) continue;
    const gate = gateStatus(unit.key, content, states);
    if (gate.open) return { unit_key: unit.key, next_closed: null };
    if (!nextClosed) {
      nextClosed = {
        unit_key: unit.key,
        unit_name: unit.name,
        parent_key: gate.parent_key,
        fraction: gate.fraction,
        needed_cards: gate.needed_cards
      };
    }
  }
  return { unit_key: null, next_closed: nextClosed };
}

export function buildSession({
  content, states, log, settings, today, focus, chosen_unit = null, rng = Math.random
}) {
  const due = dueCardIds({ content, states, focus, today });
  const picked = due.slice(0, settings.session_size);

  let unitKey = chosen_unit;
  if (!unitKey) unitKey = recommendUnit({ content, states, focus }).unit_key;

  const allowance = Math.max(0, settings.new_per_day - newCardCountToday(log, today));
  const unseen = (unitKey ? content.unit_cards[unitKey] ?? [] : [])
    .filter((id) => !states[id])
    .filter((id) => inFocus(content.cards[id], focus));

  const newIds = [];
  for (const id of unseen) {
    if (picked.length + newIds.length >= settings.session_size) break;
    if (newIds.length >= allowance) break;
    newIds.push(id);
  }

  return {
    card_ids: shuffle([...picked, ...newIds], rng),
    unit_key: unitKey,
    due_card_ids: picked,
    new_card_ids: newIds
  };
}

// True when nothing is due in the focus and today's new cards are all done.
// The home screen shows its notice on this, and works out nothing itself.
export function newCardCapDone({ content, states, log, settings, focus, today }) {
  if (dueCardIds({ content, states, focus, today }).length > 0) return false;
  return newCardCountToday(log, today) >= settings.new_per_day;
}

// Re-queues a card graded again, once, at the back of the deck.
// The caller runs this only when answerEffects returns requeue true.
// On the repeat, answerEffects returns state null and log false.
// Placement mode never re-queues.
export function requeueCard(cardIds, index, cardId) {
  const rest = cardIds.filter((_, i) => i !== index);
  return [...rest, cardId];
}

export function buildPlacementDeck(content) {
  return Object.values(content.cards)
    .filter((card) => card.kind === 'concept')
    .sort((a, b) => {
      const byChannel = content.channels.indexOf(a.channel) - content.channels.indexOf(b.channel);
      return byChannel !== 0 ? byChannel : a.key.localeCompare(b.key);
    })
    .map((card) => card.id);
}

export function placementState(correct, today, before) {
  if (before !== undefined && before !== null) return null;
  if (!correct) return null;
  return {
    interval: PLACEMENT_INTERVAL_DAYS,
    ease: 2.5,
    due: addDays(today, PLACEMENT_INTERVAL_DAYS),
    reps: 1,
    lapses: 0,
    recent: [],
    tier: 'mc8',
    tier_passes: 0
  };
}

// One answer, one decision. The screen writes the state, appends the log row, and
// re-queues the card exactly as this function says, and decides nothing else.
// The caller always passes inv_available: scheduleCard allows the inv tier when it is absent.
export function answerEffects({
  mode, repeat, correct, grade, before, today, inv_available, requeued
}) {
  if (repeat) return { state: null, log: false, requeue: false };
  if (mode === 'placement') {
    return { state: placementState(correct, today, before), log: false, requeue: false };
  }
  return {
    state: scheduleCard(before, grade, today, { inv_available }),
    log: true,
    requeue: grade === 'again' && !requeued
  };
}

// The session summary. The screen shows these numbers and lists, and counts nothing.
export function emptyResults() {
  return { right: 0, missed: 0, promoted: [], demoted: [], misses: [] };
}

// Adds one answer to the summary and returns a new summary. It never changes the old one.
// A card with no earlier state is new, not promoted, so the summary skips it.
export function accumulateAnswer(results, { card_id, repeat, correct, before, after, miss }) {
  const next = {
    right: results.right,
    missed: results.missed,
    promoted: [...results.promoted],
    demoted: [...results.demoted],
    misses: [...results.misses]
  };
  if (after && before) {
    if (cardLevel(after) > cardLevel(before)) next.promoted.push(card_id);
    if (cardLevel(after) < cardLevel(before)) next.demoted.push(card_id);
  }
  if (!repeat) {
    if (correct) next.right += 1;
    else next.missed += 1;
    if (!correct && miss) next.misses.push(miss);
  }
  return next;
}
