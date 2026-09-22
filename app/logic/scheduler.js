// SM-2 plus the tier ladder. Pure: no DOM, no fetch, no storage.

export const FORMAT_THRESHOLDS_MS = { mc4: 8000, mc8: 15000, inv: 20000, typed: 20000 };
export const TIME_CEILING_MS = 60000;
export const PROMOTION_GATES = { mc8: 7, inv: 21, typed: 21 };
// A promotion needs this many good passes as well as the interval gate above.
const PROMOTION_PASSES = 2;
const EASE_START = 2.5;
const EASE_FLOOR = 1.3;
// A hard answer multiplies the interval by this instead of by the ease.
const HARD_MULTIPLIER = 1.2;
const EASE_PENALTY_HARD = -0.15;
const EASE_PENALTY_AGAIN = -0.2;
// The card keeps this many of the most recent grades.
const RECENT_LIMIT = 3;

export function deriveGrade({ correct, guess, elapsed_ms, format }) {
  if (!correct) return 'again';
  if (guess) return 'hard';
  if (elapsed_ms > TIME_CEILING_MS) return 'good';
  return elapsed_ms > FORMAT_THRESHOLDS_MS[format] ? 'hard' : 'good';
}

export function newCardState() {
  return {
    interval: 0, ease: EASE_START, due: null, reps: 0, lapses: 0,
    recent: [], tier: 'mc4', tier_passes: 0
  };
}

export function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const base = Date.UTC(year, month - 1, day) + days * 86400000;
  return new Date(base).toISOString().slice(0, 10);
}

export function isDue(state, today) {
  if (!state || !state.due) return false;
  return state.due <= today;
}

export function nextTier(tier, invAvailable) {
  if (tier === 'mc4') return 'mc8';
  if (tier === 'mc8') return invAvailable ? 'inv' : 'typed';
  if (tier === 'inv') return 'typed';
  return null;
}

export function previousTier(tier, invAvailable) {
  if (tier === 'typed') return invAvailable ? 'inv' : 'mc8';
  if (tier === 'inv') return 'mc8';
  return 'mc4';
}

// The learning step 1 to 4 belongs to a card that has never lapsed. Every other
// card follows the spec formula for its grade.
function nextInterval(state, grade) {
  if (grade === 'again') return 1;
  if (state.interval < 1) return 1;
  const learning = state.interval === 1 && state.reps === 1 && state.lapses === 0;
  if (grade === 'good' && learning) return 4;
  if (grade === 'hard') return Math.round(state.interval * HARD_MULTIPLIER);
  return Math.round(state.interval * state.ease);
}

function nextEase(state, grade, firstReview) {
  if (grade === 'good') return state.ease;
  if (grade === 'again' && firstReview) return state.ease;
  const delta = grade === 'hard' ? EASE_PENALTY_HARD : EASE_PENALTY_AGAIN;
  return Math.max(EASE_FLOOR, Math.round((state.ease + delta) * 100) / 100);
}

export function scheduleCard(state, grade, today, options = {}) {
  const invAvailable = options.inv_available !== false;
  const firstReview = !state;
  const prior = state ? { ...state, recent: [...(state.recent ?? [])] } : newCardState();

  const interval = nextInterval(prior, grade);
  const ease = nextEase(prior, grade, firstReview);
  const recent = [...prior.recent, grade].slice(-RECENT_LIMIT);
  // The first review of a card can not be a lapse: the card was never learned.
  const lapsed = grade === 'again' && !firstReview;

  let tier = prior.tier;
  let passes = prior.tier_passes;

  if (grade === 'again') {
    tier = previousTier(prior.tier, invAvailable);
    passes = 0;
  } else if (grade === 'good') {
    passes += 1;
    const upper = nextTier(tier, invAvailable);
    if (upper && passes >= PROMOTION_PASSES && interval >= PROMOTION_GATES[upper]) {
      tier = upper;
      passes = 0;
    }
  }

  return {
    interval,
    ease,
    due: addDays(today, interval),
    reps: prior.reps + 1,
    lapses: prior.lapses + (lapsed ? 1 : 0),
    recent,
    tier,
    tier_passes: passes
  };
}
