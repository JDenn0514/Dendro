// node tracer-row.mjs  ->  one report row per method for the tracer target (test data only)
import path from 'node:path';
import { EVAL, readJson } from './lib/data.mjs';
import { buildViews } from './lib/views.mjs';
import { replayA, replayB, replayC } from './lib/replay.mjs';
import { quality } from './lib/score.mjs';

const config = readJson(path.join(EVAL, 'config.json'));
const R = readJson(path.join(EVAL, 'runs/selection-eval-tracer/results.json'));
const T = readJson(path.join(EVAL, 'runs/selection-eval-tracer/tokens.json'));
const pools = readJson(path.join(EVAL, 'tracer/pools.json'));
const picks = readJson(path.join(EVAL, 'tracer/picks.json'));
const v = buildViews(R.jobs.filter(j => j.pass !== 'P0'), T);
const m = config.tracer_model, t = pools.targets[0], pool = t.photos.map(p => p.key);
const c2 = v.p2Cost[m][t.target];
// Tracer only: no P3 point, so the line goes through 0.
const line = { tokens: { a: 0, b: c2.tokens / c2.n }, usd: { a: 0, b: c2.usd / c2.n } };
const best = picks.targets[t.target]?.picks ?? [];
console.log('| method | model | kept | seen | quality | hard above last kept | tokens | USD |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [id, r] of [['A', replayA(pool, v.p1[m], v.p1Cost[m])], ['B(all)', replayB(pool, 'all', v.p2[m][t.target], line)], ['C', replayC(pool, v.p2[m][t.target], line)]]) {
  console.log(`| ${id} | ${m} | ${r.picks.length} | ${r.seen} | ${quality(r.picks, best)?.toFixed(2)} | ${r.hardAbove ?? 'n/a'} | ${Math.round(r.cost.tokens)} | ${r.cost.usd.toFixed(4)} |`);
}
console.log(`unread: P1 ${v.unread.P1[m] ?? 0}, P2 ${v.unread.P2[m] ?? 0} | P2 tags: ${JSON.stringify(v.tags.P2[m])} | problems: ${v.problems.length}`);
