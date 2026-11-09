// node heldout-pools.mjs  ->  heldout/pools.json, heldout/blind-key.json, heldout/dropped.json
// Builds the held-out pools (Task 8) from the candidates of run simple_lobed_us, read-only.
// Exits 1 when a species count differs from the plan: PLRA 82, QULA 70, QUAU 56.
import path from 'node:path';
import { ROOT, EVAL } from './lib/paths.mjs';
import { readJson, readJsonl, writeJson, buildHeldoutPool } from './lib/data.mjs';

const EXPECTED = { PLRA: 82, QULA: 70, QUAU: 56 };
const config = readJson(path.join(EVAL, 'config.json'));
const rows = readJsonl(path.join(ROOT, 'pipeline', 'runs', 'simple_lobed_us', 'candidates.jsonl'));
const species = readJson(path.join(ROOT, 'content', 'species.json'));
const plantsNames = Object.fromEntries(Object.entries(species).map(([sym, s]) => [sym, s.scientific]));

// The codes take config.seed + 2, apart from the key's config.seed + 1. The blind names take config.pick_seed.
const { pool, blindKey, dropped } = buildHeldoutPool(rows, plantsNames, { targets: Object.keys(EXPECTED), thumbPx: config.wikimedia_thumb_px, seed: config.seed + 2, pickSeed: config.pick_seed });
writeJson(path.join(EVAL, 'heldout', 'pools.json'), pool);
writeJson(path.join(EVAL, 'heldout', 'blind-key.json'), blindKey);
writeJson(path.join(EVAL, 'heldout', 'dropped.json'), dropped);
const photos = pool.cells.flatMap(c => c.photos);
const hosts = {};
for (const p of photos) { const h = new URL(p.fetch_url).hostname; hosts[h] = (hosts[h] ?? 0) + 1; }
console.log(`photos ${photos.length} | ${pool.cells.map(c => `${c.target} ${c.photos.length}`).join(', ')} | manual ${photos.filter(p => p.source_key === 'manual').length} | dropped ${dropped.length}: ${dropped.map(d => `${d.id.slice(0, 8)} ${d.reason}`).join(', ') || '-'}`);
console.log('hosts:', JSON.stringify(hosts));
const wrong = pool.cells.filter(c => c.photos.length !== EXPECTED[c.target]);
for (const c of wrong) console.log(`problem: ${c.target} has ${c.photos.length} photos, the plan expects ${EXPECTED[c.target]}`);
if (wrong.length) process.exit(1);
