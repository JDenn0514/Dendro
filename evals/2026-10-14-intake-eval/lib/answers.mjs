// The owner's answers from the label page (Task 8), as an ArtifactData export gives them: { <doc id>: body }.
// blindKey: { <blind name>: <key> } from heldout/blind-key.json. Pure. Each function throws on the first
// bad answer, naming it, so nothing half-checked is written.
import { PARTS } from './schemas.mjs';

const STEPS = [1, 2, 3];

// labels/<blind name>: { part, keep, step, at }. Returns { <key>: { part, keep, step, at } } in key order.
// Every photo needs a label: a part, a keep or a drop, and on a keep a difficulty step. A drop keeps no step.
export function importLabels(docs, blindKey) {
  for (const id of Object.keys(docs)) if (!(id in blindKey)) throw new Error(`${id}: unknown blind name`);
  const out = {};
  for (const [id, key] of Object.entries(blindKey)) {
    const d = docs[id];
    if (!d) throw new Error(`${id}: no label`);
    if (!PARTS.includes(d.part)) throw new Error(`${id}: no part`);
    if (typeof d.keep !== 'boolean') throw new Error(`${id}: no keep or drop`);
    if (d.keep && !STEPS.includes(d.step)) throw new Error(`${id}: a keep with no difficulty step`);
    out[key] = { part: d.part, keep: d.keep, step: d.keep ? d.step : null, at: d.at ?? null };
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

// best/<target>-<part>: { id: <blind name>, at }. labels: importLabels' result. Returns { <target>-<part>: { key, at } }.
// Each cell where the owner kept a photo (part other aside) needs a best photo, and it must be one of those photos.
export function importBest(docs, blindKey, labels) {
  const out = {};
  for (const [cell, d] of Object.entries(docs)) {
    const key = blindKey[d.id], l = labels[key];
    if (!l || !l.keep || `${key.split('-')[0]}-${l.part}` !== cell) throw new Error(`${cell}: ${d.id} is not a kept photo of the cell`);
    out[cell] = { key, at: d.at ?? null };
  }
  const cells = new Set(Object.entries(labels).filter(([, l]) => l.keep && l.part !== 'other').map(([k, l]) => `${k.split('-')[0]}-${l.part}`));
  for (const cell of [...cells].sort()) if (!out[cell]) throw new Error(`${cell}: no best photo`);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
