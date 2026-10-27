// What a ranking agent sees (plan choices 8 to 10): the photos of each cell to rank, grouped by difficulty
// step, and the group line. Pure: make-workflow.mjs builds the rank jobs from these.
import { judgeSteps } from './replay.mjs';

const genus = species => species.split(' ')[0];

// The judge's answers of each species, in key order: judgeSteps runs the thin-cell rule per cell.
function stepsBySpecies(pool, answers, rule, keep = () => true) {
  const out = new Map();
  for (const target of [...new Set(pool.cells.map(c => c.target))]) {
    const photos = pool.cells.filter(c => c.target === target).flatMap(c => c.photos.map(p => ({ ...p, part: p.part ?? c.part }))).filter(keep);
    for (const [key, r] of judgeSteps(target, photos, answers, rule)) out.set(key, r);
  }
  return out;
}

// The view of a photo (v1 spec section 3.7), from the judge's answers.
export function viewOf(a) {
  if (!a) return null;
  const f = a.photo_features ?? {};
  if (a.part === 'leaf') return `${f.arrangement === 'clear' ? 'a leaf on a twig' : 'one leaf'}, ${a.side ?? 'unknown'} side`;
  if (a.part === 'fruit') return f.hang === 'clear' ? 'fruit on the twig' : 'picked fruit';
  if (a.part === 'bark') return f.texture === 'clear' ? 'close bark' : 'far bark';
  return null;
}

// Plan choice 9: the most common view among the kept difficulty step 1 photos (rule P) of the same part of
// the other species of the same genus in the set. A tie goes to the view met first in key order. null: no line.
export function groupLine(pool, cellName, answers) {
  const cell = pool.cells.find(c => c.cell === cellName);
  const mates = pool.cells.filter(c => c.part === cell.part && c.target !== cell.target && genus(c.species) === genus(cell.species));
  if (!mates.length) return null;
  const steps = stepsBySpecies(pool, answers, 'P');
  const count = new Map();
  for (const c of mates) for (const p of c.photos) {
    const r = steps.get(p.key);
    if (r?.keep && r.step === 1) count.set(viewOf(answers[p.key]), (count.get(viewOf(answers[p.key])) ?? 0) + 1);
  }
  let best = null;
  for (const [view, n] of count) if (best == null || n > count.get(best)) best = view;
  return best;
}

// Plan choice 8: per cell, the photos that rule K3 keeps, grouped by the difficulty step of rule P. A photo
// that only rule P's last line rejects sits with step 3. With filter (Haiku's answers, method FR), the photos
// that Haiku rejects under rule K3 drop out first. A cell with fewer than 2 photos to rank is left out.
// Returns { [cell]: { [step]: [keys in key order] } }.
export function rankSets(pool, answers, filter = null) {
  const pass = filter ? stepsBySpecies(pool, filter, 'K3') : null;
  const keep = p => !pass || pass.get(p.key)?.keep;
  const k3 = stepsBySpecies(pool, answers, 'K3', keep), p = stepsBySpecies(pool, answers, 'P', keep);
  const out = {};
  for (const c of pool.cells) {
    const groups = {};
    let n = 0;
    for (const ph of c.photos) {
      const r = k3.get(ph.key);
      if (!r?.keep || r.cell !== c.cell) continue;
      const q = p.get(ph.key);
      const g = q.keep ? q.step : 3;
      (groups[g] ??= []).push(ph.key);
      n++;
    }
    if (n >= 2) out[c.cell] = Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a - b));
  }
  return out;
}
