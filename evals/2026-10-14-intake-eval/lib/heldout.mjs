// The species pools that the replay plays on, and the owner's held-out labels as the scores read them. Pure.

// The cells of a held-out species (plan Task 9, judgeCells in lib/rank-jobs.mjs): the judge's part sets the cell.
export const CELL_PARTS = ['leaf', 'bark', 'fruit'];

// pools: key/pools.json or heldout/pools.json. Returns [{ target, parts, photos }] with photos in fetch order.
// On the key, each cell has its part, and the cells of a species interleave by the key number n.
// On the held-out set, a cell has no part, so the species has the parts leaf, bark, and fruit, and the
// replay puts each photo in the cell of the judge's part (judgeSteps in lib/replay.mjs).
export function speciesPools(pools) {
  const order = new Map(pools.cells.map((c, i) => [c.cell, i]));
  const species = [];
  for (const c of pools.cells) {
    let s = species.find(x => x.target === c.target);
    if (!s) species.push(s = { target: c.target, parts: [], photos: [] });
    for (const part of c.part ? [c.part] : CELL_PARTS) if (!s.parts.includes(part)) s.parts.push(part);
    for (const p of c.photos) s.photos.push({ key: p.key, n: p.n, part: p.part ?? null, cell: c.cell, source: p.source, source_species: p.source_species });
  }
  for (const s of species) s.photos.sort((a, b) => a.n - b.n || order.get(a.cell) - order.get(b.cell));
  return species;
}

// labels: heldout/labels.json, { <key>: { part, keep, step, at } }. Returns { <key>: { part, keep, step } }.
// A photo of the part other is a drop for keep: it is in no cell.
export function heldoutOwner(labels) {
  return Object.fromEntries(Object.entries(labels).map(([key, l]) => {
    const keep = l.keep === true && l.part !== 'other';
    return [key, { part: l.part, keep, step: keep ? l.step : null }];
  }));
}
