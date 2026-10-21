export const KEEP = 6, BATCH_A = 10, BATCH_C = 12;
export const NOT_KEPT = new Set(['reject', 'escalate', 'unread']);

const zero = () => ({ tokens: 0, usd: 0 });
const add = (x, y) => ({ tokens: x.tokens + y.tokens, usd: x.usd + y.usd });
const sumCost = (keys, costOf) => keys.reduce((c, key) => add(c, costOf[key] ?? zero()), zero());
const sameSet = (a, b) => a.length === b.length && a.every(key => b.includes(key));

export const lineAt = (line, n) => ({ tokens: line.tokens.a + line.tokens.b * n, usd: line.usd.a + line.usd.b * n });

// The ranker's order, cut to the photos it saw, without its rejects.
export function cutOf(candidates, rank) {
  const rej = new Set(rank.rejects);
  return rank.ranked.filter(key => candidates.has(key) && !rej.has(key));
}

// Every method keeps good photos only: the validator does not count a hard photo.
export const topOf = (candidates, rank) => cutOf(candidates, rank).filter(key => rank.tags[key] === 'good').slice(0, KEEP);

// Hard photos placed above the last kept photo (the sixth, or the last one when fewer are kept).
export function hardAbove(order, isHard, picks) {
  if (!picks.length) return 0;
  return order.slice(0, order.indexOf(picks[picks.length - 1])).filter(isHard).length;
}

const rankedHard = (candidates, rank, picks) => hardAbove(cutOf(candidates, rank), key => rank.tags[key] === 'hard', picks);

// A: stop at 6 good. Walk in batches of 10, stop after the batch that brings good to 6.
// A has no ranking, so hardAbove is null (not applicable).
export function replayA(pool, p1, p1Cost) {
  const good = [];
  let seen = 0;
  for (let i = 0; i < pool.length; i += BATCH_A) {
    const batch = pool.slice(i, i + BATCH_A);
    seen += batch.length;
    for (const key of batch) if (p1[key] === 'good') good.push(key);
    if (good.length >= KEEP) break;
  }
  const picks = good.slice(0, KEEP);
  return { picks, seen, cost: sumCost(pool.slice(0, seen), p1Cost), hardAbove: null };
}

// B(K): first K photos, ranked by the cut-down P2 ranking.
export function replayB(pool, K, rank, line) {
  const n = K === 'all' ? pool.length : Math.min(K, pool.length);
  const set = new Set(pool.slice(0, n));
  const picks = topOf(set, rank);
  return { picks, seen: n, cost: lineAt(line, n), hardAbove: rankedHard(set, rank, picks) };
}

// C: add 12 at a time. Stop when it holds 6 good photos and a new batch leaves that top 6 the same (as a set),
// or at the end of the pool. While it holds fewer than 6, it goes on (owner ruling 2026-10-08).
export function replayC(pool, rank, line) {
  let seen = 0, top = null;
  while (seen < pool.length) {
    seen = Math.min(seen + BATCH_C, pool.length);
    const next = topOf(new Set(pool.slice(0, seen)), rank);
    const stop = top !== null && next.length === KEEP && sameSet(next, top);
    top = next;
    if (stop) break;
  }
  const picks = top ?? [];
  return { picks, seen, cost: lineAt(line, seen), hardAbove: rankedHard(new Set(pool.slice(0, seen)), rank, picks) };
}

export const survivors = (pool, p1) => pool.filter(key => !NOT_KEPT.has(p1[key] ?? 'unread'));

// The filter judges in batches of 10, so it pays for the whole batch that holds its last needed photo.
const roundUp = (n, len) => Math.min(len, Math.ceil(n / BATCH_A) * BATCH_A);

export function replayFilterB(pool, K, fP1, fCost, rank, line) {
  const surv = survivors(pool, fP1);
  const whole = K === 'all' || K > surv.length;
  const m = whole ? surv.length : K;
  const seen = whole || m === 0 ? pool.length : roundUp(pool.indexOf(surv[m - 1]) + 1, pool.length);
  const cost = add(sumCost(pool.slice(0, seen), fCost), m ? lineAt(line, m) : zero());
  const set = new Set(surv.slice(0, m));
  const picks = topOf(set, rank);
  return { picks, seen, ranked: m, cost, hardAbove: rankedHard(set, rank, picks) };
}

export function replayFilterC(pool, fP1, fCost, rank, line) {
  const surv = survivors(pool, fP1);
  if (!surv.length) return { picks: [], seen: pool.length, ranked: 0, cost: sumCost(pool, fCost), hardAbove: 0 };
  const r = replayC(surv, rank, line);
  const seen = r.seen >= surv.length ? pool.length : roundUp(pool.indexOf(surv[r.seen - 1]) + 1, pool.length);
  return { picks: r.picks, seen, ranked: r.seen, cost: add(sumCost(pool.slice(0, seen), fCost), r.cost), hardAbove: r.hardAbove };
}
