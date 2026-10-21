import { PARTS } from './schemas.mjs';

const zero = { tokens: 0, usd: 0 };

// jobs: results.json jobs. tokens: tokens.json.
// answers[<model>:<effort>:<variant>][key]: the judge's answer object, or null when there is none
// (a failed agent, a missing key, or an answer with no valid part). The replay counts null as a reject (plan choice 13).
// rank[<model>:<effort>][cell]: { orders: { <group>: [keys] }, unread: [keys] }. A key left out of its group is unread.
export function buildViews(jobs, tokens) {
  const v = { answers: {}, judgeCost: {}, noAnswer: {}, unread: {}, checks: {}, rank: {}, rankCost: {}, problems: [] };
  for (const j of jobs) {
    const r = j.result, t = tokens[j.label] ?? zero;
    if (!tokens[j.label]) v.problems.push(`${j.label}: no tokens entry`);
    if (r == null) v.problems.push(`${j.label}: no result`);
    if (j.kind === 'check') {
      v.checks[j.label] = r?.model_self_report ?? null;
    } else if (j.kind === 'judge') {
      const setup = `${j.model}:${j.effort}:${j.variant}`;
      v.answers[setup] ??= {}; v.judgeCost[setup] ??= {};
      const keys = new Set(j.keys), got = new Map();
      for (const a of r?.results ?? []) {
        if (!keys.has(a?.key)) { v.problems.push(`${j.label}: unknown key ${a?.key}`); continue; }
        if (got.has(a.key)) { v.problems.push(`${j.label}: ${a.key}: answered 2 times`); continue; }
        got.set(a.key, a);
      }
      for (const key of j.keys) {
        let a = got.get(key) ?? null;
        if (!got.has(key) && r != null) v.problems.push(`${j.label}: no answer for ${key}`);
        if (a && !PARTS.includes(a.part)) { v.problems.push(`${j.label}: ${key}: part ${JSON.stringify(a.part)} is not valid`); a = null; }
        if (a == null) v.noAnswer[setup] = (v.noAnswer[setup] ?? 0) + 1;
        else if ((a.reject ?? []).includes('unread')) v.unread[setup] = (v.unread[setup] ?? 0) + 1;
        v.answers[setup][key] = a;
        v.judgeCost[setup][key] = { tokens: t.tokens / j.keys.length, usd: t.usd / j.keys.length };
      }
    } else if (j.kind === 'rank') {
      const setup = `${j.model}:${j.effort}`;
      v.rank[setup] ??= {}; v.rankCost[setup] ??= {};
      const unreadSaid = new Set((r?.unread ?? []).filter(k => j.keys.includes(k)));
      const orders = {}, placed = new Set();
      for (const [g, keys] of Object.entries(j.groups)) {
        const mine = new Set(keys);
        orders[g] = [];
        for (const k of r?.orders?.[g] ?? []) {
          if (!mine.has(k) || placed.has(k) || unreadSaid.has(k)) continue;
          placed.add(k);
          orders[g].push(k);
        }
      }
      const unread = j.keys.filter(k => !placed.has(k));
      const left = unread.filter(k => !unreadSaid.has(k)).length;
      if (r != null && left) v.problems.push(`${j.label}: ${left} keys unread or left out`);
      v.rank[setup][j.cell] = { orders, unread };
      v.rankCost[setup][j.cell] = { tokens: t.tokens, usd: t.usd, n: j.keys.length };
    }
  }
  return v;
}
