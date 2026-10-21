// node analyze.mjs  ->  out/table.json, out/table.md, out/shortlist.json
import path from 'node:path';
import fs from 'node:fs';
import { EVAL } from './lib/paths.mjs';
import { readJson, writeJson } from './lib/data.mjs';
import { buildViews } from './lib/views.mjs';
import { replayA, replayB, replayC, replayFilterB, replayFilterC } from './lib/replay.mjs';
import { quality, extras, costLine, p3Diff, summarizeRow, pickWinner, P3_LIMIT } from './lib/score.mjs';

const MODELS = ['opus', 'sonnet', 'haiku'], FILTERS = ['haiku', 'sonnet'], KS = [12, 20, 30, 'all'];
const config = readJson(path.join(EVAL, 'config.json'));
const pools = readJson(path.join(EVAL, 'pools.json'));
const picks = readJson(path.join(EVAL, 'picks.json'));
const R = readJson(path.join(EVAL, 'runs/selection-eval-full/results.json'));
const T = readJson(path.join(EVAL, 'runs/selection-eval-full/tokens.json'));
const v = buildViews(R.jobs, T);
const tOf = name => pools.targets.find(t => t.target === name);

const lines = {}, p3 = {};
for (const m of MODELS) {
  lines[m] = costLine(pools.p3.map(t => ({ n3: v.p3Cost[m][t].n, c3: v.p3Cost[m][t], n2: v.p2Cost[m][t].n, c2: v.p2Cost[m][t] })));
  const diffs = pools.p3.map(t => p3Diff(v.p3[m][t], v.p2[m][t], tOf(t).photos.slice(0, 12).map(p => p.key)));
  const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  p3[m] = { diffs, mean, unreliable: mean > P3_LIMIT };
  if (lines[m].tokens.a < 0 || lines[m].usd.a < 0) console.log(`note: the cost line of ${m} has a negative a`);
}

const small = K => K !== 'all' && K <= 20;
const methods = [];
for (const m of MODELS) {
  methods.push({ id: `A|${m}`, unreliable: false, run: (pool, t) => replayA(pool, v.p1[m], v.p1Cost[m]) });
  for (const K of KS) methods.push({ id: `B${K}|${m}`, unreliable: p3[m].unreliable && small(K), run: (pool, t) => replayB(pool, K, v.p2[m][t], lines[m]) });
  methods.push({ id: `C|${m}`, unreliable: p3[m].unreliable, run: (pool, t) => replayC(pool, v.p2[m][t], lines[m]) });
}
for (const f of FILTERS) for (const m of MODELS) {
  for (const K of KS) methods.push({ id: `F${f}>B${K}|${m}`, unreliable: p3[m].unreliable && small(K), run: (pool, t) => replayFilterB(pool, K, v.p1[f], v.p1Cost[f], v.p2[m][t], lines[m]) });
  methods.push({ id: `F${f}>C|${m}`, unreliable: p3[m].unreliable, run: (pool, t) => replayFilterC(pool, v.p1[f], v.p1Cost[f], v.p2[m][t], lines[m]) });
}

const rows = methods.map(meth => summarizeRow(meth.id, pools.targets.map(t => {
  const r = meth.run(t.photos.map(p => p.key), t.target);
  const own = picks.targets[t.target];
  return { target: t.target, kind: t.kind, picks: r.picks, seen: r.seen, cost: r.cost, q: quality(r.picks, own.picks), x: extras(r.picks, own.picks, own.done), hard_above: r.hardAbove };
}), meth.unreliable));
// Owner ruling 2026-10-09: config.json blind_opponent sets the blind-check opponent (shortlist.json best).
const win = pickWinner(rows, { opponent: config.blind_opponent });

// Report data only (the winner rule does not use it).
// B(all): the real P2 USD per target, next to the cost-line USD. The line is fitted from 3 P3 targets.
const p2Real = m => pools.targets.reduce((s, t) => s + v.p2Cost[m][t.target].usd, 0) / pools.targets.length;
const costLineVsP2 = {};
for (const r of rows) {
  const m = r.id.split('|')[1];
  if (r.id === `Ball|${m}`) {
    r.usd_p2_real = p2Real(m);
    costLineVsP2[m] = { line_usd: r.usd_mean, p2_usd: r.usd_p2_real, over: r.usd_mean / r.usd_p2_real - 1 };
  }
  // A real C run calls the ranker once per batch of 12, so the cost line at the photos seen is a lower bound.
  if (/(^|>)C\|/.test(r.id)) r.cost_lower_bound = true;
}

writeJson(path.join(EVAL, 'out/table.json'), { lines, p3, cost_line_vs_p2: costLineVsP2, unread: v.unread, problems: v.problems, rows });
writeJson(path.join(EVAL, 'out/shortlist.json'), win);

const f = (x, d = 2) => (x == null ? '-' : x.toFixed(d));
const pct = x => `${Math.round(x * 100)}%`;
const tags = r => [r.unreliable ? 'P3: unreliable' : '', win.shortlist.includes(r.id) ? 'shortlist' : '', r.id === win.candidate ? 'candidate' : '', r.id === win.best_quality ? 'best quality' : '', r.id === win.best ? 'blind opponent' : '', r.cost_lower_bound ? 'cost is a lower bound' : ''].filter(Boolean).join(', ');
const md = [
  'Row IDs: `A` stop at 6 good; `B<K>` rank the first K; `C` adaptive batches of 12; `F<filter>>` the filter model drops its P1 rejects first. After `|`: the judge or ranker model. Every method keeps `good` photos only. "Q" is the share of the owner\'s picks kept, over the targets with at least 1 pick. "E" (extras) is the number of kept photos not in the picks, over the targets where the owner picked fewer than 6 and marked done (a target with 0 picks counts). "Hard above" is the number of `hard` photos placed above the sixth kept photo (or the last kept photo when fewer than 6), summed over the 10 targets. It is `n/a` for method A, which has no ranking.',
  '',
  `Q* ${f(win.qStar)}, E* ${f(win.eStar)}. Shortlist: Q >= Q* - 1/6 and E <= E* + 1, P3-reliable rows only. Blind check needed: ${win.blind_needed ? 'yes' : 'no'}. Blind opponent: ${win.best}${config.blind_opponent ? ' (set in config.json)' : ''}. Best quality: ${win.best_quality}.`,
  '',
  `Cost line against the real P2 cost (B(all), USD per target): ${Object.entries(costLineVsP2).map(([m, c]) => `${m} ${f(c.line_usd, 4)} against ${f(c.p2_usd, 4)} (${pct(c.over)} above)`).join('; ')}. The line is fitted from the 3 P3 targets, so it runs above the real P2 cost. C's cost is a lower bound: a real C run calls the ranker once per batch of 12, and the line prices one call at the photos seen.`,
  '',
  '| method | Q | E | Q rich | Q thin | E rich | E thin | under 6 | Q min-max (sd) | hard above | photos seen | tokens per target | USD per target | real P2 USD per target | note |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...[...rows].sort((a, b) => (b.q_mean ?? -1) - (a.q_mean ?? -1) || a.usd_mean - b.usd_mean)
    .map(r => `| ${r.id} | ${f(r.q_mean)} | ${f(r.x_mean)} | ${f(r.q_rich)} | ${f(r.q_thin)} | ${f(r.x_rich)} | ${f(r.x_thin)} | ${r.short} | ${f(r.q_min)}-${f(r.q_max)} (${f(r.q_sd)}) | ${r.hard_above_total ?? 'n/a'} | ${f(r.seen_mean, 1)} | ${Math.round(r.tokens_mean)} | ${f(r.usd_mean, 4)} | ${f(r.usd_p2_real, 4)} | ${tags(r)} |`),
  '',
];
fs.writeFileSync(path.join(EVAL, 'out/table.md'), md.join('\n'));
console.log(`rows ${rows.length} | Q* ${f(win.qStar)} | E* ${f(win.eStar)} | shortlist ${win.shortlist.length} | candidate ${win.candidate} | best_quality ${win.best_quality} | opponent ${win.best} | next ${win.next} | blind_needed ${win.blind_needed}`);
console.log('cost line above real P2 (B(all)):', Object.entries(costLineVsP2).map(([m, c]) => `${m} ${pct(c.over)}`).join(', '));
console.log('P3 mean difference:', MODELS.map(m => `${m} ${f(p3[m].mean)}${p3[m].unreliable ? ' (unreliable)' : ''}`).join(', '));
