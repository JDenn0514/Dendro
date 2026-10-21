// node key-pools.mjs  ->  key/pools.json
// Builds the key's photo pool from prototype/photo-review/data.js, the owner's picks, and the run
// candidates of the 41 photos that are not published. Reads those files read-only.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, EVAL } from './lib/paths.mjs';
import { readJson, readJsonl, writeJson, buildKeyPool } from './lib/data.mjs';

const REVIEW = path.join(ROOT, 'prototype', 'photo-review');
const config = readJson(path.join(EVAL, 'config.json'));

// data.js assigns window.REVIEW_SECTIONS. Run it in a context with its own window.
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(REVIEW, 'data.js'), 'utf8'), ctx);
const sections = ctx.window.REVIEW_SECTIONS;
const picks = readJson(path.join(REVIEW, 'photo-picks-2026-10-11.json')).photos;
const runs = [...new Set(sections.flatMap(s => s.photos.map(p => p.run)).filter(Boolean))];
const candidates = Object.fromEntries(runs.map(r => [r, readJsonl(path.join(ROOT, 'pipeline', 'runs', r, 'candidates.jsonl'))]));
const species = readJson(path.join(ROOT, 'content', 'species.json'));
const plantsNames = Object.fromEntries(Object.entries(species).map(([sym, s]) => [sym, s.scientific]));

// The cell order and the codes take their own seed, so that they do not follow the tracer draw of config.seed.
const pool = buildKeyPool(sections, picks, candidates, plantsNames, { thumbPx: config.wikimedia_thumb_px, seed: config.seed + 1 });
writeJson(path.join(EVAL, 'key', 'pools.json'), pool);
const sizes = pool.cells.map(c => c.photos.length);
const photos = pool.cells.flatMap(c => c.photos);
console.log(`photos ${photos.length} | cells ${pool.cells.length} | cell sizes ${Math.min(...sizes)} to ${Math.max(...sizes)} | published ${photos.filter(p => p.published).length}`);
const hosts = {};
for (const p of photos) { const h = new URL(p.fetch_url).hostname; hosts[h] = (hosts[h] ?? 0) + 1; }
console.log('hosts:', JSON.stringify(hosts));
