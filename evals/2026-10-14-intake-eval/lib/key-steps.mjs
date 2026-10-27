// The key photos and the difficulty steps of the leading set-ups (rule P), for the owner's review sheets.
// runs: run names in runs/ that hold the answers of each leading set-up.
import path from 'node:path';
import { EVAL } from './paths.mjs';
import { readJson } from './data.mjs';
import { buildViews } from './views.mjs';
import { judgeSteps } from './replay.mjs';
import { leadingSetup } from './setups.mjs';

export const MODELS = ['opus', 'sonnet', 'haiku'];

// Returns { config, pools, v, setups, photo: Map key -> photo with part, cell, species, keys (key order),
// owner: { [key]: owner call }, steps: [Map key -> judgeSteps result], one per set-up in MODELS order }.
export function loadKeySteps(runs) {
  const config = readJson(path.join(EVAL, 'config.json'));
  const pools = readJson(path.join(EVAL, 'key', 'pools.json'));
  const dirs = runs.map(r => path.join(EVAL, 'runs', r));
  const v = buildViews(dirs.flatMap(d => readJson(path.join(d, 'results.json')).jobs), Object.assign({}, ...dirs.map(d => readJson(path.join(d, 'tokens.json')))));
  const setups = MODELS.map(m => leadingSetup(config, m));
  for (const s of setups) if (!v.answers[s]) throw new Error(`no answers of ${s} in ${runs.join(', ')}`);
  // The species pools in key order, as analyze.mjs builds them.
  const byTarget = new Map(), photo = new Map();
  for (const c of pools.cells) for (const p of c.photos) {
    const x = { ...p, part: p.part ?? c.part, cell: c.cell, species: c.species };
    if (!byTarget.has(c.target)) byTarget.set(c.target, []);
    byTarget.get(c.target).push(x);
    photo.set(p.key, x);
  }
  const steps = setups.map(s => {
    const out = new Map();
    for (const [t, ps] of byTarget) for (const [k, r] of judgeSteps(t, [...ps].sort((a, b) => a.n - b.n), v.answers[s], 'P')) out.set(k, r);
    return out;
  });
  const keys = pools.cells.flatMap(c => c.photos.map(p => p.key));
  const owner = Object.fromEntries(keys.map(k => [k, photo.get(k).owner]));
  return { config, pools, v, setups, photo, keys, owner, steps };
}
