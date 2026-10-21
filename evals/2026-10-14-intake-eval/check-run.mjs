// node check-run.mjs <plan name>  ->  agents, failures, tokens, USD, and minutes per kind, model, effort, and variant;
// answers missing and unread per set-up; ranking keys unread.
import path from 'node:path';
import { EVAL } from './lib/paths.mjs';
import { readJson } from './lib/data.mjs';
import { buildViews } from './lib/views.mjs';
import { stepOf } from './lib/step.mjs';

const name = process.argv[2];
if (!name) throw new Error('usage: node check-run.mjs <plan name>');
const dir = path.join(EVAL, 'runs', name);
const R = readJson(path.join(dir, 'results.json'));
const T = readJson(path.join(dir, 'tokens.json'));
const W = readJson(path.join(dir, 'times.json'));
const v = buildViews(R.jobs, T);
const agg = {};
for (const j of R.jobs) {
  const k = [j.kind, j.model, j.effort, j.variant].filter(Boolean).join(' '), s = T[j.label];
  agg[k] ??= { agents: 0, failed: 0, photos: 0, input: 0, cw5m: 0, cw1h: 0, cread: 0, output: 0, usd: 0, minutes: 0 };
  agg[k].agents++;
  agg[k].photos += j.keys.length;
  if (j.result == null) agg[k].failed++;
  for (const f of ['input', 'cw5m', 'cw1h', 'cread', 'output', 'usd']) agg[k][f] += s?.[f] ?? 0;
  agg[k].minutes += (W[j.label]?.seconds ?? 0) / 60;
}
for (const a of Object.values(agg)) { a.usd = Number(a.usd.toFixed(4)); a.minutes = Number(a.minutes.toFixed(1)); }
console.table(agg);
console.log('answers missing per set-up:', JSON.stringify(v.noAnswer));
console.log('unread photos per set-up:', JSON.stringify(v.unread));
console.log('model checks:', JSON.stringify(v.checks));
// stepOf must run on every stored answer.
let stepped = 0;
for (const a of Object.values(v.answers)) for (const x of Object.values(a)) { stepOf(x); stepped++; }
console.log(`stepOf ran on ${stepped} answers | view problems: ${v.problems.length}`);
if (v.problems.length) console.log(v.problems.slice(0, 20).join('\n'));
