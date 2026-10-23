// Methods S, F, R, FR, and CR (intake spec Part 2), replayed from stored answers. No tokens.
// A species pool: { target, parts, photos }, with photos in fetch order. A photo: { key, n, part, source }.
// part is the key's part (plan choice 1), or null on the held-out set, where the judge's part sets the cell.
// answers: { [key]: answer or null } of one set-up. cost: { [key]: { tokens, usd } } of the same set-up.
// quota: { 1, 2, 3, usual_look_min }. Every method returns, per cell, the kept keys of each difficulty step in order.
import { cellSteps, codeOrder } from './step.mjs';

export const BATCH = 10;
const STEPS = [1, 2, 3];
const zero = () => ({ tokens: 0, usd: 0 });
const add = (x, y) => ({ tokens: x.tokens + y.tokens, usd: x.usd + y.usd });
const sumCost = (keys, costOf) => keys.reduce((c, key) => add(c, costOf[key] ?? zero()), zero());
const cellOf = (target, part) => `${target}-${part}`;

export const lineAt = (line, n) => ({ tokens: line.tokens.a + line.tokens.b * n, usd: line.usd.a + line.usd.b * n });

// Keep and the difficulty step of each photo, with the thin-cell rule run on each cell of the photos given.
// Returns Map key -> { cell, keep, step, line, thin_cell }. A key photo that the judge puts in another part
// is a reject with line part_error. A photo with no cell (no answer on the held-out set, or part other) has cell null.
export function judgeSteps(target, photos, answers, rule) {
  const out = new Map(), byPart = new Map();
  for (const p of photos) {
    const a = answers[p.key] ?? null;
    const part = p.part ?? a?.part ?? null;
    if (p.part && a && a.part !== p.part) {
      out.set(p.key, { cell: cellOf(target, p.part), keep: false, step: null, line: 'part_error', thin_cell: false });
    } else if (part == null || part === 'other') {
      out.set(p.key, { cell: null, keep: false, step: null, line: a ? 'part_other' : 'no_answer', thin_cell: false });
    } else {
      if (!byPart.has(part)) byPart.set(part, []);
      byPart.get(part).push({ key: p.key, n: p.n, answers: a });
    }
  }
  for (const [part, ps] of byPart) {
    for (const r of cellSteps(ps, part, { rule })) {
      out.set(r.key, { cell: cellOf(target, part), keep: r.keep, step: r.step, line: r.line, thin_cell: r.thin_cell });
    }
  }
  return out;
}

// The ranking agent's orders of one cell joined into one list: difficulty step 1, then 2, then 3 (plan choice 8).
export function joinedOrder(rank) {
  if (!rank) return [];
  const groups = Object.keys(rank.orders).sort((a, b) => (STEPS.includes(+a) ? +a : 9) - (STEPS.includes(+b) ? +b : 9));
  return groups.flatMap(g => rank.orders[g]);
}

// Fill the quota of one difficulty step from the photos in the method's order. At difficulty step 1, swap the
// next usual-look photos in for the last other photos until usual_look_min of them are the usual look (choice 12).
function fill(list, step, quota, answers) {
  const usual = key => answers[key]?.usual_look === true;
  const sel = list.slice(0, quota[step]);
  const need = step === 1 ? Math.min(quota.usual_look_min ?? 0, quota[step]) : 0;
  const extra = list.slice(quota[step]).filter(usual);
  while (sel.filter(usual).length < need && extra.length) {
    const i = sel.findLastIndex(key => !usual(key));
    if (i < 0) break;
    sel.splice(i, 1);
    sel.push(extra.shift());
  }
  sel.sort((a, b) => list.indexOf(a) - list.indexOf(b));
  return { kept: sel, full: sel.length >= quota[step] && sel.filter(usual).length >= need };
}

// orderCell(cell, part, keys) gives the method's order of a cell's kept photos.
function select(pool, steps, answers, quota, orderCell) {
  const cells = {}, filled = {};
  for (const part of pool.parts) {
    const cell = cellOf(pool.target, part);
    const keys = pool.photos.filter(p => steps.get(p.key)?.cell === cell && steps.get(p.key).keep).map(p => p.key);
    const order = orderCell(cell, part, keys);
    cells[cell] = {}; filled[cell] = {};
    for (const s of STEPS) {
      const f = fill(order.filter(key => steps.get(key).step === s), s, quota, answers);
      cells[cell][s] = f.kept;
      filled[cell][s] = f.full;
    }
  }
  return { cells, filled };
}

const fetchOrder = (cell, part, keys) => keys;
const allFull = filled => Object.values(filled).every(c => STEPS.every(s => c[s]));

// Walk the photos in calls of 10 and stop after the call that fills every quota of the species.
function walk(pool, photos, answers, rule, quota) {
  let seen = 0, sel;
  do {
    seen = Math.min(seen + BATCH, photos.length);
    sel = select(pool, judgeSteps(pool.target, photos.slice(0, seen), answers, rule), answers, quota, fetchOrder);
  } while (seen < photos.length && !allFull(sel.filled));
  return { ...sel, seen: photos.slice(0, seen) };
}

const kept = (target, photos, answers, rule) => {
  const steps = judgeSteps(target, photos, answers, rule);
  return photos.filter(p => steps.get(p.key).keep);
};

export function replayS(pool, { answers, cost, rule, quota }) {
  const w = walk(pool, pool.photos, answers, rule, quota);
  const keys = w.seen.map(p => p.key);
  return { cells: w.cells, filled: w.filled, judged: keys.length, filtered: 0, ranked: 0, unranked: 0, cost: sumCost(keys, cost) };
}

// filter: Haiku's { answers, cost }. Haiku answers for every photo; its rejects drop out (rule-aware).
export function replayF(pool, { filter, answers, cost, rule, quota }) {
  const rest = kept(pool.target, pool.photos, filter.answers, rule);
  const w = walk(pool, rest, answers, rule, quota);
  const keys = w.seen.map(p => p.key);
  const c = add(sumCost(pool.photos.map(p => p.key), filter.cost), sumCost(keys, cost));
  return { cells: w.cells, filled: w.filled, judged: keys.length, filtered: pool.photos.length, ranked: 0, unranked: 0, cost: c };
}

// The ranked methods on the photos judged. The ranker sees, per cell, the photos that rule K3 keeps; a cell
// with fewer than 2 of them needs no agent. A ranked method with no ranking of a cell keeps fetch order there.
function ranked(pool, judged, { answers, rule, quota, rank, line }) {
  const steps = judgeSteps(pool.target, judged, answers, rule);
  const k3 = judgeSteps(pool.target, judged, answers, 'K3');
  const calls = [];
  let unranked = 0;
  const sel = select(pool, steps, answers, quota, (cell, part, keys) => {
    const m = judged.filter(p => k3.get(p.key).cell === cell && k3.get(p.key).keep).length;
    if (m >= 2) { calls.push(m); if (!rank[cell]) unranked++; }
    const pos = new Map(joinedOrder(rank[cell]).map((key, i) => [key, i]));
    const at = key => pos.get(key) ?? Infinity;
    return [...keys].sort((a, b) => at(a) - at(b) || keys.indexOf(a) - keys.indexOf(b));
  });
  const rankCost = !calls.length ? zero() : line ? calls.reduce((c, m) => add(c, lineAt(line, m)), zero()) : null;
  return { ...sel, ranked: calls.reduce((s, m) => s + m, 0), unranked, rankCost };
}

const firstK = (pool, K) => (K === 'all' ? pool.photos : pool.photos.slice(0, K));

// rank: { [cell]: { orders, unread } }. line: the ranking cost line { tokens: { a, b }, usd: { a, b } } or null.
// With no line, the cost is null.
export function replayR(pool, { K, answers, cost, rule, quota, rank, line }) {
  const judged = firstK(pool, K);
  const r = ranked(pool, judged, { answers, rule, quota, rank, line });
  const c = r.rankCost && add(sumCost(judged.map(p => p.key), cost), r.rankCost);
  return { cells: r.cells, filled: r.filled, judged: judged.length, filtered: 0, ranked: r.ranked, unranked: r.unranked, cost: c };
}

export function replayFR(pool, { filter, answers, cost, rule, quota, rank, line }) {
  const judged = kept(pool.target, pool.photos, filter.answers, rule);
  const r = ranked(pool, judged, { answers, rule, quota, rank, line });
  const c = r.rankCost && add(add(sumCost(pool.photos.map(p => p.key), filter.cost), sumCost(judged.map(p => p.key), cost)), r.rankCost);
  return { cells: r.cells, filled: r.filled, judged: judged.length, filtered: pool.photos.length, ranked: r.ranked, unranked: r.unranked, cost: c };
}

export function replayCR(pool, { K, answers, cost, rule, quota }) {
  const judged = firstK(pool, K);
  const steps = judgeSteps(pool.target, judged, answers, rule);
  const sel = select(pool, steps, answers, quota, (cell, part, keys) =>
    codeOrder(judged.filter(p => keys.includes(p.key)).map(p => ({ key: p.key, n: p.n, answers: answers[p.key] })), part).map(p => p.key));
  return { cells: sel.cells, filled: sel.filled, judged: judged.length, filtered: 0, ranked: 0, unranked: 0, cost: sumCost(judged.map(p => p.key), cost) };
}
