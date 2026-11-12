import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from './paths.mjs';
import { fetchUrlOf } from './fetch.mjs';
import { mulberry32, shuffle, pickOrder } from './seed.mjs';

export const RUNS = ['simple_lobed_us', 'simple_lobed_us_add'];

export const readJsonl = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
// An ArtifactData export: <dir>/<doc id>.json for each document. Returns { <doc id>: body }.
export const readExport = dir => Object.fromEntries(fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f.slice(0, -5), readJson(path.join(dir, f))]));
export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

export const keyOf = (target, n) => `${target}-${String(n).padStart(2, '0')}`;

export const fetchedLeaf = r => r.source_key !== 'manual' && (r.channel_hint === 'leaf' || r.channel_hint == null);
export const inPool = r => fetchedLeaf(r) && !!r.local && !r.fetch_error;

const RANKS = new Set(['var.', 'var', 'subsp.', 'subsp', 'ssp.', 'ssp']);
const nameTokens = s => (s || '').normalize('NFC').replace(/×/g, ' ').toLowerCase().split(/\s+/).filter(t => t && !RANKS.has(t));

// True when `source` is a variety or subspecies of the PLANTS binomial, with or without the rank word
// ("Quercus sinuata breviloba", "Quercus sinuata var. breviloba").
export function isInfraOf(source, plantsName) {
  const s = nameTokens(source), p = nameTokens(plantsName);
  return p.length === 2 && s.length === 3 && s[0] === p[0] && s[1] === p[1];
}

// rows: one target, file order. plantsName: the target's PLANTS name.
// sameNames: other spellings of the same species (config.json same_species), such as iNaturalist's.
// Keeps the first row of each file_hash; records every other drop with its reason.
// Owner ruling 2026-10-08: a row whose identity_match is false leaves the pool unless it names a variety
// or subspecies, or a name in sameNames.
export function splitPool(rows, plantsName, sameNames = []) {
  const same = new Set(sameNames.map(n => nameTokens(n).join(' ')));
  const isTarget = src => isInfraOf(src, plantsName) || same.has(nameTokens(src).join(' '));
  const kept = [], dropped = [], first = new Map();
  for (const r of rows.filter(fetchedLeaf)) {
    let reason = null;
    if (r.fetch_error) reason = 'fetch_error';
    else if (!r.file_hash) reason = 'no_hash';
    else if (!r.local) reason = 'no_local';
    else if (r.identity_match === false && !isTarget(r.source_species)) reason = 'wrong_species';
    else if (first.has(r.file_hash)) reason = 'duplicate_hash';
    if (!reason) { first.set(r.file_hash, r.id); kept.push(r); continue; }
    dropped.push(reason === 'duplicate_hash' ? { id: r.id, target: r.target, reason, kept_id: first.get(r.file_hash) } : { id: r.id, target: r.target, reason });
  }
  return { kept, dropped };
}

export const isGoodLeaf = v => !!v && v.verdict === 'approve' && v.channel === 'leaf' && !(v.tags || []).includes('hard');

export function lastVerdicts(verdicts) {
  const last = new Map();
  for (const v of verdicts) last.set(v.candidate_id, v);
  return last;
}

// File order within a target is fetch order. A target can have several blocks in the file.
// plantsNames: { <symbol>: PLANTS scientific name }, from content/species.json. It is also the display name.
// sameSpecies: { <symbol>: [other spelling] }, from config.json same_species.
export function buildTargets(run, candidates, verdicts, plantsNames, sameSpecies = {}) {
  const last = lastVerdicts(verdicts);
  const by = new Map();
  for (const r of candidates) {
    if (!by.has(r.target)) by.set(r.target, []);
    by.get(r.target).push(r);
  }
  const out = [];
  for (const [target, rows] of by) {
    const species = plantsNames[target] ?? null;
    const { kept: pool, dropped } = splitPool(rows, species, sameSpecies[target] ?? []);
    out.push({
      target, run, species,
      good_old: pool.filter(r => isGoodLeaf(last.get(r.id))).length,
      photos: pool.map((r, i) => ({ key: keyOf(target, i + 1), n: i + 1, id: r.id, run, target, source_key: r.source_key, local: r.local, abs: path.join(ROOT, r.local) })),
      dropped,
    });
  }
  return out;
}

// The key (Task 2). sections: REVIEW_SECTIONS of prototype/photo-review/data.js, in key order.
// picks: the rows of photo-picks-2026-10-11.json. candidates: { <run>: candidates.jsonl rows }.
// plantsNames: { <symbol>: PLANTS name }, from content/species.json.
// Each photo keeps only what the judge prompt and the scores need. No agent suggestion of data.js
// (step, features, stage, season, scale, reason, usualLook) and no owner note goes into the pool.
// The review prototype lists each cell by the agent's suggested difficulty step. So the photos of a cell
// take a shuffle fixed by the seed and the cell, and that order stands in for fetch order (owner ruling
// 2026-10-21, a change to plan choice 2). n is the place in that order, and the key number; order is the
// place in the key.
// code: an opaque name (p001, p002, ...) in an order fixed by the seed. The judge sees only the code,
// so the key cannot tell it the part or the place in the cell.
export function buildKeyPool(sections, picks, candidates, plantsNames, { thumbPx, seed }) {
  const pick = new Map(picks.map(r => [r.key, r]));
  const cand = new Map(Object.entries(candidates).flatMap(([run, rows]) => rows.map(r => [`${run}:${r.id}`, r])));
  let order = 0;
  const cells = sections.map(s => ({
    cell: `${s.symbol}-${s.part}`, target: s.symbol, part: s.part, species: plantsNames[s.symbol] ?? null,
    photos: pickOrder(s.photos, seed, `${s.symbol}-${s.part}`).map((p, i) => {
      const owner = pick.get(p.key);
      if (!owner) throw new Error(`no pick row for ${p.key}`);
      let url = p.src, sourceSpecies = plantsNames[s.symbol] ?? null;
      if (p.key.startsWith('cand:')) {
        const id = p.key.slice('cand:'.length), c = cand.get(`${p.run}:${id}`);
        if (!c) throw new Error(`no candidate ${id} in ${p.run}`);
        url = c.file_url;
        sourceSpecies = c.source_species;
      }
      return {
        key: `${s.symbol}-${s.part}-${String(i + 1).padStart(2, '0')}`, n: i + 1, order: ++order,
        review_key: p.key, id: p.id, target: s.symbol, part: s.part, run: p.run ?? null,
        url, fetch_url: fetchUrlOf(url, thumbPx), source: p.credit.source,
        credit: { author: p.credit.author, license: p.credit.license, origin: p.credit.origin },
        source_species: sourceSpecies, published: p.published, owner: { keep: owner.keep, step: owner.step },
      };
    }),
  }));
  assignCodes(cells, seed);
  return { set: 'key', cells };
}

function assignCodes(cells, seed) {
  const all = shuffle(cells.flatMap(c => c.photos), mulberry32(seed));
  all.forEach((p, i) => { p.code = `p${String(i + 1).padStart(3, '0')}`; });
}

// The held-out set (Task 8). rows: candidates.jsonl of the run, in file order (fetch order).
// plantsNames: { <symbol>: PLANTS name }. opts.targets: the species, in pool order.
// The last row of each id counts. A row with fetch_error, no file_hash, or a file_hash already in its species
// pool drops out, with its reason. Manual rows stay in (the spec counts them). The judge sets the part, so a
// photo has no part and no hint: no channel_hint, no tags_hint, no file name.
// code: the judge's opaque name (h001, ...), in an order fixed by opts.seed. blind: the owner's opaque name on
// the label page (o001, ...), in an order fixed by opts.pickSeed. blindKey maps each blind name to its key.
export function buildHeldoutPool(rows, plantsNames, { targets, thumbPx, seed, pickSeed }) {
  const last = new Map();
  for (const r of rows) if (targets.includes(r.target)) last.set(r.id, r);
  const dropped = [], cells = targets.map(t => ({ cell: t, target: t, part: null, species: plantsNames[t] ?? null, photos: [] }));
  const seen = new Map(targets.map(t => [t, new Map()]));
  for (const r of last.values()) {
    const hashes = seen.get(r.target);
    let reason = null;
    if (r.fetch_error) reason = 'fetch_error';
    else if (!r.file_hash) reason = 'no_hash';
    else if (hashes.has(r.file_hash)) reason = 'duplicate_hash';
    if (reason) { dropped.push(reason === 'duplicate_hash' ? { id: r.id, target: r.target, reason, kept_id: hashes.get(r.file_hash) } : { id: r.id, target: r.target, reason }); continue; }
    hashes.set(r.file_hash, r.id);
    const cell = cells.find(c => c.target === r.target), n = cell.photos.length + 1;
    cell.photos.push({
      key: keyOf(r.target, n), n, id: r.id, target: r.target, part: null, source_key: r.source_key,
      url: r.file_url, fetch_url: fetchUrlOf(r.file_url, thumbPx), source: r.source,
      credit: { author: r.author, license: r.license, origin: r.origin }, source_species: r.source_species,
    });
  }
  const all = cells.flatMap(c => c.photos);
  shuffle(all, mulberry32(seed)).forEach((p, i) => { p.code = `h${String(i + 1).padStart(3, '0')}`; });
  const blindKey = {};
  shuffle(all, mulberry32(pickSeed)).forEach((p, i) => { p.blind = `o${String(i + 1).padStart(3, '0')}`; blindKey[p.blind] = p.key; });
  return { pool: { set: 'heldout', cells }, blindKey: Object.fromEntries(Object.entries(blindKey).sort()), dropped };
}
