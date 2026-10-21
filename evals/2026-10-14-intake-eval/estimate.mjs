// node estimate.mjs --plan <plan name> [--from <run name>]
// The USD estimate of a job list. With no run, a photo costs the old eval's per-photo USD
// (pass P1, 440 px, calls of 10, effort high) plus 30% for the new schema. With --from, it costs what the
// photos of the same model, effort, and variant cost in that run (the tracer), then the same model and effort.
// A ranking photo uses the judge price of its model: a rough figure until the ranking cost line of Task 4.
// The range is half to twice the point estimate.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EVAL } from './lib/paths.mjs';
import { readJson } from './lib/data.mjs';

export const OLD_PER_PHOTO = { opus: 0.0177, sonnet: 0.0096, haiku: 0.00074 };
const SCHEMA_EXTRA = 1.3;

// run: the jobs of a collected run. tokens: its tokens.json. Judge jobs only.
// Returns { '<model>:<effort>:<variant>': usd per photo, '<model>:<effort>': usd per photo }.
export function perPhotoFromRun(run, tokens) {
  const sums = {};
  const add = (k, usd, n) => { sums[k] ??= { usd: 0, n: 0 }; sums[k].usd += usd; sums[k].n += n; };
  for (const j of run.filter(x => x.kind === 'judge' && tokens[x.label])) {
    add(`${j.model}:${j.effort}:${j.variant}`, tokens[j.label].usd, j.keys.length);
    add(`${j.model}:${j.effort}`, tokens[j.label].usd, j.keys.length);
  }
  return Object.fromEntries(Object.entries(sums).map(([k, s]) => [k, s.usd / s.n]));
}

export function estimateJobs(jobs, perPhoto = {}) {
  const rows = {};
  let total = 0;
  for (const j of jobs) {
    const exact = perPhoto[`${j.model}:${j.effort}:${j.variant}`] ?? perPhoto[`${j.model}:${j.effort}`];
    const price = exact ?? OLD_PER_PHOTO[j.model] * SCHEMA_EXTRA;
    const usd = j.keys.length * price;
    const k = `${j.kind} ${j.model} ${j.effort}`;
    rows[k] ??= { agents: 0, photos: 0, usd: 0, source: exact == null ? 'old + 30%' : 'run' };
    rows[k].agents++; rows[k].photos += j.keys.length; rows[k].usd += usd;
    if ((exact == null) !== (rows[k].source === 'old + 30%')) rows[k].source = 'mixed';
    total += usd;
  }
  return { rows, total, low: total / 2, high: total * 2 };
}

export function printEstimate(e) {
  const table = Object.fromEntries(Object.entries(e.rows).map(([k, r]) => [k, { ...r, usd: Number(r.usd.toFixed(3)) }]));
  console.table(table);
  console.log(`estimate: about USD ${e.total.toFixed(2)} (${e.low.toFixed(2)} to ${e.high.toFixed(2)})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const jobs = readJson(path.join(EVAL, 'wf', `intake-eval-${opt('--plan')}.jobs.json`));
  const from = opt('--from');
  const per = from ? perPhotoFromRun(readJson(path.join(EVAL, 'wf', `${from}.jobs.json`)), readJson(path.join(EVAL, 'runs', from, 'tokens.json'))) : {};
  if (from) console.log('USD per photo from the run:', JSON.stringify(per));
  printEstimate(estimateJobs(jobs, per));
}
