import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from './paths.mjs';

export const RUNS = ['simple_lobed_us', 'simple_lobed_us_add'];

export const readJsonl = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
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
