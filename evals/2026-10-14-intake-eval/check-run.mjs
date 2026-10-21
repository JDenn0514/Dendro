// node check-run.mjs [name]  ->  agents, failures, tokens, and USD per pass and model; unread counts.
import path from 'node:path';
import { EVAL } from './lib/paths.mjs';
import { readJson } from './lib/data.mjs';
import { buildViews } from './lib/views.mjs';

const name = process.argv[2] ?? 'selection-eval-full';
const R = readJson(path.join(EVAL, 'runs', name, 'results.json'));
const T = readJson(path.join(EVAL, 'runs', name, 'tokens.json'));
const v = buildViews(R.jobs, T);
const agg = {};
for (const j of R.jobs) {
  const k = `${j.pass} ${j.model}`, s = T[j.label];
  agg[k] ??= { agents: 0, failed: 0, input: 0, cw5m: 0, cw1h: 0, cread: 0, output: 0, usd: 0 };
  agg[k].agents++;
  if (j.result == null) agg[k].failed++;
  for (const f of ['input', 'cw5m', 'cw1h', 'cread', 'output', 'usd']) agg[k][f] += s?.[f] ?? 0;
}
for (const a of Object.values(agg)) a.usd = Number(a.usd.toFixed(2));
console.table(agg);
console.log('unread photos per pass and model:', JSON.stringify(v.unread));
console.log('ranked photo tags per pass and model:', JSON.stringify(v.tags));
console.log(`view problems: ${v.problems.length} (untagged ranked photos: ${v.problems.filter(p => p.includes('no valid tag')).length})`);
