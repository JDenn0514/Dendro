// node pools.mjs --tracer QUAC2 --out tracer/pools.json
// node pools.mjs --out pools.json            (seeded choice, Task 2)
import fs from 'node:fs';
import path from 'node:path';
import { MAIN, EVAL, RUNS, readJsonl, readJson, writeJson, buildTargets } from './lib/data.mjs';
import { MIN_POOL, pickOrder } from './lib/seed.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const config = readJson(path.join(EVAL, 'config.json'));
// The PLANTS name of each symbol, as the build wrote it into content/species.json (`scientific`).
const species = readJson(path.join(MAIN, 'content/species.json'));
const plantsNames = Object.fromEntries(Object.entries(species).map(([symbol, s]) => [symbol, s.scientific]));

const all = RUNS.flatMap(run => buildTargets(run,
  readJsonl(path.join(MAIN, 'pipeline/runs', run, 'candidates.jsonl')),
  readJsonl(path.join(MAIN, 'pipeline/runs', run, 'verdicts.jsonl')),
  plantsNames, config.same_species ?? {}));
const noName = all.filter(t => t.photos.length && !t.species).map(t => t.target);
if (noName.length) throw new Error(`no PLANTS name for: ${noName.join(', ')}`);
const eligible = all.filter(t => t.photos.length >= MIN_POOL)
  .map(t => ({ target: t.target, run: t.run, pool: t.photos.length, good_old: t.good_old }));

let targets, p3;
const tracer = opt('--tracer');
if (tracer) {
  const t = all.find(x => x.target === tracer);
  if (!t) throw new Error(`no target ${tracer}`);
  targets = [{ ...t, kind: 'tracer' }];
  p3 = [];
} else {
  const { chooseTargets } = await import('./lib/seed.mjs');
  ({ chosen: targets, p3 } = chooseTargets(all, config.seed));
}

const missing = targets.flatMap(t => t.photos).filter(p => !fs.existsSync(p.abs));
if (missing.length) throw new Error(`${missing.length} files missing, first: ${missing[0].abs}`);

const dropped_counts = {};
for (const d of all.flatMap(t => t.dropped)) dropped_counts[d.reason] = (dropped_counts[d.reason] || 0) + 1;

const out = path.join(EVAL, opt('--out') ?? 'pools.json');
writeJson(out, { seed: config.seed, runs: RUNS, p3, eligible, dropped_counts, targets });
writeJson(path.join(path.dirname(out), 'pick-public.json'), {
  targets: targets.map(t => ({ target: t.target, species: t.species, photos: pickOrder(t.photos.map(p => ({ key: p.key, n: p.n })), config.pick_seed, t.target) })),
});
for (const t of targets) console.log(`${t.target} ${t.kind} pool=${t.photos.length} good_old=${t.good_old} dropped=${t.dropped.length}`);
console.log(`p3: ${p3.join(', ') || 'none'} | photos: ${targets.reduce((s, t) => s + t.photos.length, 0)} | eligible targets: ${eligible.length}`);
console.log(`dropped from all pools: ${JSON.stringify(dropped_counts)}`);
