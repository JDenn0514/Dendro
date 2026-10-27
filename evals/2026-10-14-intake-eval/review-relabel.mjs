// node review-relabel.mjs [--runs key-batch20]  ->  images/pages/relabel/ (git-ignored)
// node review-relabel.mjs --answers <dir>        ->  key/relabel.json, from an ArtifactData export of `relabel` (<dir>/<code>.json)
// The owner's blind relabel (owner ruling 2026-10-27, Task 7): every key photo where any leading set-up
// differs from the owner under rule P, less the photos of the gate examples sheet. The page shows the photo
// code, the part, and the source name only: no earlier call, no judge answer, and a shuffled order.
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { EVAL } from './lib/paths.mjs';
import { readJson, writeJson } from './lib/data.mjs';
import { buildViews } from './lib/views.mjs';
import { judgeSteps } from './lib/replay.mjs';
import { pickOrder } from './lib/seed.mjs';
import { leadingSetup } from './lib/setups.mjs';
import { relabelSet } from './lib/examples.mjs';
import { reviewSheet } from './pages/review-sheet.mjs';

const { values: args } = parseArgs({ options: { runs: { type: 'string', default: 'key-batch20' }, answers: { type: 'string' } } });
const config = readJson(path.join(EVAL, 'config.json'));
const pools = readJson(path.join(EVAL, 'key', 'pools.json'));
const runs = args.runs.split(',').map(r => path.join(EVAL, 'runs', r));
const v = buildViews(runs.flatMap(d => readJson(path.join(d, 'results.json')).jobs), Object.assign({}, ...runs.map(d => readJson(path.join(d, 'tokens.json')))));
const setups = ['opus', 'sonnet', 'haiku'].map(m => leadingSetup(config, m));
for (const s of setups) if (!v.answers[s]) throw new Error(`no answers of ${s} in ${args.runs}`);

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
const reviewed = new Set(readJson(path.join(EVAL, 'key', 'gate-examples.json')).photos.map(r => r.key));
const set = new Set(relabelSet(keys, owner, steps, reviewed));

// One section per cell, in key order; the photos of a cell in an order fixed by the pick seed.
const groups = pools.cells.map(c => ({
  id: c.cell, heading: `${c.species}, ${c.part}`, text: 'Label each photo as you would a new one.',
  items: pickOrder(c.photos.filter(p => set.has(p.key)), config.pick_seed, `${c.cell}:relabel`).map(p => ({
    id: p.code, img: `img/${p.code}.jpg`, key: p.code, chips: [photo.get(p.key).part], table: null, lines: [], notes: [], source: p.source_species,
  })),
})).filter(g => g.items.length);
const sheet = {
  title: 'Key relabel',
  collection: 'relabel',
  intro: [
    `${set.size} key photos, blind. Label each one as you would a new photo: keep it at difficulty step 1, 2, or 3, or drop it. The page shows no earlier label and no judge answer.`,
    'Your answers go into a key v2. The key keeps your labels of 2026-10-11, so both can be scored.',
  ],
  // The legend says in plain words what lib/step.mjs computes (rule P), so the owner labels by the same definitions.
  legend: [
    ['Key features', 'Leaf: the outline (shape, blade, lobe tips) and the edge. Bark: the surface and the ridges, plates, grooves, or peeling. Fruit: the kind of fruit and its outline.'],
    ['Step 1', 'The key features are clear, and the leaf, fruit, or bark is whole and the main thing in the frame. For bark, the photo also shows a trunk edge, a branch, or something for scale, not texture only.'],
    ['Step 2', 'You can still read the key features, but the framing is not ideal: part of the subject is cut off, something competes with it, or the bark is a texture-only close-up.'],
    ['Step 3', 'You must search or look closely to read a key feature, or the subject is not typical: young, damaged, an odd angle, or odd light.'],
    ['Drop', 'A key feature does not show at all, or the photo has a reject problem, such as blur, a name label, dead leaves, or flowers or buds instead of the part.'],
  ],
  choices: [{ value: '1', label: 'Step 1' }, { value: '2', label: 'Step 2' }, { value: '3', label: 'Step 3' }, { value: 'drop', label: 'Drop' }],
  groups,
};

if (args.answers) {
  const byCode = new Map([...photo.values()].map(p => [p.code, p])), rows = [];
  const files = new Set(fs.readdirSync(args.answers).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)));
  for (const g of groups) for (const it of g.items) {
    if (!files.delete(it.id)) throw new Error(`no answer for ${it.id}`);
    const a = readJson(path.join(args.answers, `${it.id}.json`)), p = byCode.get(it.id);
    if (!sheet.choices.some(c => c.value === a.verdict)) throw new Error(`${it.id}: answer ${JSON.stringify(a.verdict)} is not one of ${sheet.choices.map(c => c.value).join(', ')}`);
    rows.push({ key: p.key, code: it.id, before: owner[p.key], label: a.verdict === 'drop' ? { keep: false, step: null } : { keep: true, step: +a.verdict }, note: a.note || null, at: a.at });
  }
  if (files.size) throw new Error(`answers for photos not on the sheet: ${[...files].join(', ')}`);
  writeJson(path.join(EVAL, 'key', 'relabel.json'), { setups, rule: 'P', photos: rows.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key)) });
  console.log(`relabel: ${rows.length} answers | same as before ${rows.filter(r => r.label.keep === r.before.keep && (!r.label.keep || r.label.step === r.before.step)).length}`);
  process.exit(0);
}

const out = path.join(EVAL, 'images', 'pages', 'relabel');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'img'), { recursive: true });
for (const g of groups) for (const it of g.items) fs.copyFileSync(path.join(EVAL, 'images', 'app', 'key', `${it.id}.jpg`), path.join(out, it.img));
fs.writeFileSync(path.join(out, 'index.html'), reviewSheet(sheet));
console.log(`relabel: ${set.size} photos in ${groups.length} cells | ${out}`);
