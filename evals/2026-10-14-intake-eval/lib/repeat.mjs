// The owner's repeat labels (plan Task 10): 40 held-out photos, labelled again a week after the label page.
// Pure: no file and no network.
import { pickOrder } from './seed.mjs';
import { repeatAgreement, share } from './score.mjs';

export const REPEAT_N = 40;

// pool: heldout/pools.json. Returns [{ id, key, blind, code, target, species }] in id order.
// The draw: all photos of the pool in pool order, put in an order fixed by the seed (target 'repeat'),
// and the first 40 of it. The names r01 to r40 take a second order fixed by the seed ('repeat:ids'), so a
// name tells nothing of the key, the blind name, or the judge code.
export function repeatSet(pool, { seed }) {
  const photos = pool.cells.flatMap(c => c.photos.map(p => ({ key: p.key, blind: p.blind, code: p.code, target: c.target, species: c.species })));
  if (photos.length < REPEAT_N) throw new Error(`the pool has ${photos.length} photos, the repeat needs ${REPEAT_N}`);
  const chosen = pickOrder(photos, seed, 'repeat').slice(0, REPEAT_N);
  return pickOrder(chosen, seed, 'repeat:ids').map((p, i) => ({ id: `r${String(i + 1).padStart(2, '0')}`, ...p }));
}

// pool: heldout/pools.json. set: repeatSet's result. Returns a pool for pages/label-page.mjs: one cell per
// species of the set, in pool order, and per photo only its repeat name (as `blind`), its source, and its
// credit. So the page cannot show a key, a judge code, a blind name of the label page, or an earlier label.
export function repeatPool(pool, set) {
  const byKey = new Map(pool.cells.flatMap(c => c.photos.map(p => [p.key, p])));
  const cells = pool.cells.map(c => ({
    target: c.target, species: c.species,
    photos: set.filter(r => r.target === c.target).map(r => {
      const p = byKey.get(r.key);
      return { blind: r.id, source: p.source, credit: { author: p.credit.author, license: p.credit.license } };
    }),
  }));
  return { set: 'repeat', cells: cells.filter(c => c.photos.length) };
}

// first: heldout/labels.json, second: heldout/repeat.json, both { <key>: { part, keep, step } }.
// The owner's repeat agreement on the photos of second: part and keep on every photo, and the difficulty
// step (exact and within one) on the photos kept both times. Shares from 0 to 1, as lib/score.mjs gives them.
export function ownerRepeat(first, second) {
  const keys = Object.keys(second);
  for (const k of keys) if (!first[k]) throw new Error(`${k}: no first label`);
  const firstByKey = new Map(keys.map(k => [k, first[k]])), secondByKey = new Map(keys.map(k => [k, second[k]]));
  const { n, keep, both, exact, within1 } = repeatAgreement(keys, firstByKey, secondByKey);
  return { n, part: share(keys.filter(k => first[k].part === second[k].part).length, keys.length), keep, both, exact, within1 };
}
