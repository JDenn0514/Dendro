import { LABELS } from './prompts.mjs';

const zero = { tokens: 0, usd: 0 };

// jobs: results.json jobs. tokens: tokens.json. A missing verdict or rank place counts as unread.
// A ranked photo keeps the tag of its first place in the list. A missing or wrong tag counts as hard.
export function buildViews(jobs, tokens) {
  const v = { p1: {}, p1Cost: {}, p2: {}, p2Cost: {}, p3: {}, p3Cost: {}, unread: { P1: {}, P2: {}, P3: {} }, tags: { P2: {}, P3: {} }, problems: [] };
  for (const j of jobs) {
    const r = j.result, t = tokens[j.label] ?? zero, m = j.model;
    if (!tokens[j.label] && ['P1', 'P2', 'P3'].includes(j.pass)) v.problems.push(`${j.label}: no tokens entry`);
    if (j.pass === 'P1') {
      v.p1[m] ??= {}; v.p1Cost[m] ??= {};
      const got = new Map((r?.results ?? []).map(x => [x.key, x.label]));
      for (const key of j.keys) {
        const lab = LABELS.includes(got.get(key)) ? got.get(key) : 'unread';
        if (!got.has(key)) v.problems.push(`${j.label}: no verdict for ${key}`);
        else if (!LABELS.includes(got.get(key))) v.problems.push(`${j.label}: ${key}: label ${JSON.stringify(got.get(key))} is not valid`);
        if (lab === 'unread') v.unread.P1[m] = (v.unread.P1[m] ?? 0) + 1;
        v.p1[m][key] = lab;
        v.p1Cost[m][key] = { tokens: t.tokens / j.keys.length, usd: t.usd / j.keys.length };
      }
    } else if (j.pass === 'P2' || j.pass === 'P3') {
      const keys = new Set(j.keys);
      const ranked = [], tags = {};
      for (const item of r?.ranked ?? []) {
        const key = item?.key;
        if (!keys.has(key) || key in tags) continue;
        if (item.tag !== 'good' && item.tag !== 'hard') v.problems.push(`${j.label}: ${key}: no valid tag`);
        tags[key] = item.tag === 'good' ? 'good' : 'hard';
        ranked.push(key);
      }
      const inRanked = new Set(ranked);
      const rejects = [...new Set((r?.rejects ?? []).filter(key => keys.has(key)))];
      for (const key of rejects) if (inRanked.has(key)) v.problems.push(`${j.label}: ${key}: ranked and rejected`);
      const missing = j.keys.filter(key => !inRanked.has(key) && !rejects.includes(key));
      const unread = missing.length;
      if (r == null) v.problems.push(`${j.label}: no result`);
      else if (missing.length) v.problems.push(`${j.label}: ${missing.length} keys unread or left out`);
      const P = j.pass === 'P2' ? 'p2' : 'p3';
      v[P][m] ??= {}; v[`${P}Cost`][m] ??= {};
      v[P][m][j.target] = { ranked, tags, rejects: [...rejects, ...missing] };
      v[`${P}Cost`][m][j.target] = { tokens: t.tokens, usd: t.usd, n: j.keys.length };
      v.unread[j.pass][m] = (v.unread[j.pass][m] ?? 0) + unread;
      v.tags[j.pass][m] ??= { good: 0, hard: 0 };
      for (const tag of Object.values(tags)) v.tags[j.pass][m][tag]++;
    }
  }
  return v;
}
