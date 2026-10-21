import { KEEP, topOf } from './replay.mjs';

// Share of the owner's best picks that the method kept. Null when the owner picked none.
export function quality(picks, best) {
  if (!best.length) return null;
  const b = new Set(best);
  return picks.filter(key => b.has(key)).length / Math.min(KEEP, best.length);
}

// Owner ruling 2026-10-08: when the owner picked fewer than 6 and marked the target done, the picks are
// every photo the owner would show. Extras = kept photos not in the picks. A target with 0 picks counts.
// Null for a target with 6 picks, or with fewer than 6 and not done.
export function extras(picks, best, done) {
  if (best.length >= KEEP || done !== true) return null;
  const b = new Set(best);
  return picks.filter(key => !b.has(key)).length;
}

export const P3_LIMIT = 1;

const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

// points: one per P3 target: { n3, c3: { tokens, usd }, n2, c2: { tokens, usd } }.
export function costLine(points) {
  const fit = f => {
    const ls = points.filter(p => p.n2 !== p.n3).map(p => {
      const b = (p.c2[f] - p.c3[f]) / (p.n2 - p.n3);
      return { a: p.c3[f] - p.n3 * b, b };
    });
    return { a: mean(ls.map(l => l.a)), b: mean(ls.map(l => l.b)) };
  };
  return { tokens: fit('tokens'), usd: fit('usd') };
}

export function p3Diff(p3Rank, p2Rank, first12) {
  const set = new Set(first12);
  const a = topOf(set, p3Rank), b = topOf(set, p2Rank);
  return (a.filter(k => !b.includes(k)).length + b.filter(k => !a.includes(k)).length) / 2;
}

export function summarizeRow(id, per, unreliable = false) {
  const scored = per.filter(p => p.q != null);
  const q = scored.map(p => p.q);
  const m = mean(q);
  const xs = kind => per.filter(p => p.x != null && (!kind || p.kind === kind)).map(p => p.x);
  return {
    id, unreliable,
    q_mean: m,
    q_rich: mean(scored.filter(p => p.kind === 'rich').map(p => p.q)),
    q_thin: mean(scored.filter(p => p.kind === 'thin').map(p => p.q)),
    q_min: q.length ? Math.min(...q) : null,
    q_max: q.length ? Math.max(...q) : null,
    q_sd: q.length ? Math.sqrt(mean(q.map(x => (x - m) ** 2))) : null,
    // Extras: mean over the targets with an extras score (null x is skipped).
    x_mean: mean(xs()),
    x_rich: mean(xs('rich')),
    x_thin: mean(xs('thin')),
    short: per.filter(p => p.picks.length < KEEP).length,
    usd_mean: mean(per.map(p => p.cost.usd)),
    tokens_mean: mean(per.map(p => p.cost.tokens)),
    seen_mean: mean(per.map(p => p.seen)),
    // A null hard_above (method A) is skipped. When every target is null, both values are null.
    hard_above_mean: mean(per.filter(p => p.hard_above != null).map(p => p.hard_above)),
    hard_above_total: per.some(p => p.hard_above != null) ? per.reduce((s, p) => s + (p.hard_above ?? 0), 0) : null,
    per,
  };
}

// Q* = best mean quality; E* = lowest mean extras, both over the reliable rows.
// Shortlist: quality >= Q* - 1/6 (one photo) and extras <= E* + 1 (one photo per target).
// When no row has an extras score, E* is null and the extras test is skipped.
// best = the blind-check opponent: the cheapest row with quality Q*, or opts.opponent when it is set
// (owner ruling 2026-10-09, config.json blind_opponent). best_quality is always the cheapest row with Q*.
export function pickWinner(rows, opts = {}) {
  const ok = rows.filter(r => !r.unreliable && r.q_mean != null);
  const byCost = (a, b) => a.usd_mean - b.usd_mean || a.tokens_mean - b.tokens_mean || a.id.localeCompare(b.id);
  const qStar = Math.max(...ok.map(r => r.q_mean));
  const withX = ok.filter(r => r.x_mean != null);
  const eStar = withX.length ? Math.min(...withX.map(r => r.x_mean)) : null;
  const xOk = r => eStar == null || (r.x_mean != null && r.x_mean <= eStar + 1 + 1e-9);
  const short = ok.filter(r => r.q_mean >= qStar - 1 / 6 - 1e-9 && xOk(r)).sort(byCost);
  const bestQ = ok.filter(r => Math.abs(r.q_mean - qStar) < 1e-9).sort(byCost)[0];
  const best = opts.opponent ? rows.find(r => r.id === opts.opponent) : bestQ;
  if (!best) throw new Error(`blind opponent ${opts.opponent} is not a row`);
  // The two tests can leave the shortlist empty; then there is no candidate.
  const candidate = short[0] ?? null;
  // Next: skip rows that show the same sets as the candidate or the best row on every target
  // (for example C, when it sees the whole pool, keeps the same photos as B(all)).
  const isDup = (r, s) => r.id === s.id || samePicks(r, s);
  const next = short.find(r => !(candidate && isDup(r, candidate)) && !isDup(r, best)) ?? null;
  // No blind check when there is no candidate, or when the candidate shows the same sets as the best row.
  const blind_needed = candidate != null && !isDup(candidate, best);
  return {
    qStar, eStar, shortlist: short.map(r => r.id), excluded: rows.filter(r => r.unreliable).map(r => r.id),
    candidate: candidate ? candidate.id : null, best: best.id, best_quality: bestQ.id, next: next ? next.id : null, blind_needed,
  };
}

// True when two rows keep the same set of photos on every target. False when a row has no per-target picks.
function samePicks(a, b) {
  if (!a.per || !b.per || a.per.length !== b.per.length) return false;
  const of = r => new Map(r.per.map(p => [p.target, [...p.picks].sort().join('\n')]));
  const pa = of(a), pb = of(b);
  return [...pa].every(([t, k]) => pb.get(t) === k);
}

// answers: { target: 'L' | 'R' | 'same' }. key.sides: { target: { L: rowId, R: rowId } }.
export function blindOutcome(answers, key) {
  let cand = 0, other = 0, same = (key.auto_same ?? []).length;
  for (const t of Object.keys(key.sides)) {
    const a = answers[t];
    if (a === 'same') same++;
    else if (key.sides[t][a] === key.candidate) cand++;
    else if (a === 'L' || a === 'R') other++;
  }
  return { cand, other, same, candidateWins: !(other > cand) };
}
