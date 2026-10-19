// node estimate.mjs  ->  rough USD for the full run, from the Haiku tracer token mix.
// It assumes every model uses the same tokens per photo. Opus and Sonnet often write more output, so read it as a floor.
import path from 'node:path';
import { EVAL, readJson } from './lib/data.mjs';
import { RATES, MODEL_IDS } from './lib/tokens.mjs';

const T = readJson(path.join(EVAL, 'runs/selection-eval-tracer/tokens.json'));
const tracer = readJson(path.join(EVAL, 'wf/selection-eval-tracer.jobs.json'));
const full = readJson(path.join(EVAL, 'wf/selection-eval-full.jobs.json'));
const FIELDS = ['input', 'cw5m', 'cw1h', 'cread', 'output'];
const perPhoto = pass => {
  const js = tracer.filter(j => j.pass === pass);
  const n = js.reduce((s, j) => s + j.keys.length, 0);
  return Object.fromEntries(FIELDS.map(f => [f, js.reduce((s, j) => s + T[j.label][f], 0) / n]));
};
const mix = { P1: perPhoto('P1'), P2: perPhoto('P2'), P3: perPhoto('P2') };
const rows = {};
let total = 0;
for (const j of full) {
  const r = RATES[MODEL_IDS[j.model]][0], m = mix[j.pass];
  const usd = j.keys.length * FIELDS.reduce((s, f) => s + m[f] * r[f], 0) / 1e6;
  const k = `${j.pass} ${j.model}`;
  rows[k] ??= { agents: 0, photos: 0, usd: 0 };
  rows[k].agents++; rows[k].photos += j.keys.length; rows[k].usd += usd;
  total += usd;
}
for (const r of Object.values(rows)) r.usd = Number(r.usd.toFixed(2));
console.table(rows);
console.log(`estimate: about ${total.toFixed(2)} USD for ${full.length} agents (a floor; see the note at the top of this file)`);

// Cross-check, not part of the estimate line: the same token mix, plus the tracer cost of an agent with no work in it.
// P0 (2 photos, 3 messages) is the closest tracer record of the fixed part. This is for reading only.
const p0 = { opus: T['P0:opus'].usd, sonnet: T['P0:sonnet'].usd, haiku: T['P0:haiku'].usd };
const floor = {};
for (const j of full) floor[j.model] = (floor[j.model] ?? 0) + p0[j.model];
console.log('cross-check: agents x tracer P0 cost per model (USD):', JSON.stringify(Object.fromEntries(Object.entries(floor).map(([k, v]) => [k, Number(v.toFixed(2))]))));
