// node review-examples.mjs [--runs key-batch20]  ->  images/pages/examples/ (git-ignored)
// The review sheet of the failing gates (plan Task 7): the key photos where the 3 leading set-ups agree
// with each other and not with the owner, rule P. The page and its photo copies go under images/, so that
// git ignores the photos; the Artifact tool publishes the folder.
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { EVAL } from './lib/paths.mjs';
import { readJson } from './lib/data.mjs';
import { buildViews } from './lib/views.mjs';
import { judgeSteps } from './lib/replay.mjs';
import { KEY_FEATURES } from './lib/step.mjs';
import { leadingSetup } from './lib/setups.mjs';
import { gateExamples } from './lib/examples.mjs';
import { reviewSheet } from './pages/review-sheet.mjs';

const { values: args } = parseArgs({ options: { runs: { type: 'string', default: 'key-batch20' } } });
const config = readJson(path.join(EVAL, 'config.json'));
const pools = readJson(path.join(EVAL, 'key', 'pools.json'));
const runs = args.runs.split(',').map(r => path.join(EVAL, 'runs', r));
const v = buildViews(runs.flatMap(d => readJson(path.join(d, 'results.json')).jobs), Object.assign({}, ...runs.map(d => readJson(path.join(d, 'tokens.json')))));
const MODELS = ['opus', 'sonnet', 'haiku'];
const setups = MODELS.map(m => leadingSetup(config, m));
for (const s of setups) if (!v.answers[s]) throw new Error(`no answers of ${s} in ${args.runs}`);

// The species pools in key order, as analyze.mjs builds them.
const byTarget = new Map(), photo = new Map();
for (const c of pools.cells) for (const p of c.photos) {
  const x = { ...p, part: p.part ?? c.part, cell: c.cell };
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
const ex = gateExamples(keys, owner, steps);

// Why the code gave its result, from one set-up's answers (lib/step.mjs, rule P).
const yn = x => (x === true ? 'yes' : x === false ? 'no' : '-');
function why(a, r) {
  if (!r.keep) return { reject_list: `rejected: ${(a?.reject ?? []).join(', ')}`, key_no: 'rejected: a key photo feature at no', key_search_cause: 'rejected: a key photo feature at search, with a cause', part_other: 'rejected: part other', part_error: 'rejected: the judge set another part', no_answer: 'no answer' }[r.line] ?? `rejected: ${r.line}`;
  if (r.step === 3) return 'step 3: a key photo feature at search, or a cause';
  if (r.step === 1) return 'step 1: both key features clear, whole, alone' + (a.part === 'bark' ? ', not too close' : '');
  const miss = [];
  if (!(KEY_FEATURES[a.part] ?? []).every(f => a.photo_features?.[f] === 'clear')) miss.push('a key feature not clear');
  if (a.whole !== true) miss.push('not whole');
  if (a.alone !== true) miss.push('not alone');
  if (a.part === 'bark' && a.too_close !== false) miss.push('too close');
  return `step 2: ${miss.join(', ')}`;
}
const label = r => (r.keep ? `step ${r.step}` : 'reject');
function item(key, chips) {
  const p = photo.get(key), as = setups.map(s => v.answers[s][key]), rs = steps.map(m => m.get(key));
  const feats = KEY_FEATURES[p.part] ?? [];
  const rows = [
    ['result', ...rs.map(label)],
    ['part', ...as.map(a => a?.part ?? '-')],
    ...feats.map(f => [f, ...as.map(a => a?.photo_features?.[f] ?? '-')]),
    ['whole', ...as.map(a => yn(a?.whole))],
    ['alone', ...as.map(a => yn(a?.alone))],
    ...(p.part === 'bark' ? [['too close', ...as.map(a => yn(a?.too_close))]] : []),
    ['causes', ...as.map(a => (a?.causes ?? []).join(', ') || '-')],
    ['reject', ...as.map(a => (a?.reject ?? []).join(', ') || '-')],
  ];
  return {
    id: key, img: `img/${p.code}.jpg`, key, chips,
    table: { cols: ['Opus', 'Sonnet', 'Haiku'], rows },
    lines: [`Code, Opus answers: ${why(as[0], rs[0])}.`],
    notes: MODELS.map((m, i) => [m[0].toUpperCase() + m.slice(1), as[i]?.note ?? '-']),
    source: p.source_species,
  };
}
const ownerChip = o => (o.keep ? `You: step ${o.step}` : 'You: drop');
const groups = [];
for (const [o, j] of [[2, 1], [1, 2], [2, 3], [1, 3], [3, 1], [3, 2]]) {
  const items = ex.step.filter(e => e.owner === o && e.judged === j);
  if (items.length) groups.push({
    id: `step-${o}-${j}`, heading: `You said step ${o}, all 3 judges give step ${j}`,
    text: 'You and all 3 judges keep the photo. The judges agree on one difficulty step, and it is not yours.',
    items: items.map(e => item(e.key, [`You: step ${o}`, `Judges: step ${j}`, photo.get(e.key).part])),
  });
}
if (ex.dropped.length) groups.push({ id: 'keep-dropped', heading: 'You kept it, all 3 judges reject it', text: 'These count against keep agreement.', items: ex.dropped.map(e => item(e.key, [ownerChip(owner[e.key]), 'Judges: reject', photo.get(e.key).part])) });
if (ex.kept.length) groups.push({ id: 'keep-kept', heading: 'You dropped it, all 3 judges keep it', text: 'These count against drop recall.', items: ex.kept.map(e => item(e.key, ['You: drop', ...[...new Set(steps.map(m => label(m.get(e.key))))].map(s => `Judges: ${s}`), photo.get(e.key).part])) });

const both = keys.filter(k => owner[k]?.keep && steps.every(m => m.get(k)?.keep)).length;
const sheet = {
  title: 'Key gate examples',
  collection: 'examples',
  intro: [
    `No judge set-up passes the gates on the key. The best exact difficulty step is about 55%, and the gate is 80%. These are the key photos where the 3 leading set-ups (V1, high, calls of 20, rule P) agree with each other and not with you: ${ex.step.length} of the ${both} photos that all 4 of you keep differ on the difficulty step, and ${ex.dropped.length + ex.kept.length} photos differ on keep.`,
    'When the 3 models agree, a better model will not fix it. The fix is in the brief, in the rule, or in the key itself. For each photo, tap the call you agree with now. The table shows what each judge answered, and the code line shows why the code gave its result.',
    'You see the judge answers for key photos only. The held-out set stays blind.',
  ],
  choices: [{ value: 'judges', label: 'Judges are right' }, { value: 'mine', label: 'My call stands' }, { value: 'either', label: 'Could be either' }],
  groups,
};
const out = path.join(EVAL, 'images', 'pages', 'examples');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'img'), { recursive: true });
for (const g of groups) for (const it of g.items) fs.copyFileSync(path.join(EVAL, 'images', 'app', 'key', `${photo.get(it.key).code}.jpg`), path.join(out, it.img));
fs.writeFileSync(path.join(out, 'index.html'), reviewSheet(sheet));
console.log(`examples: step ${ex.step.length} of ${both}, owner keeps and judges reject ${ex.dropped.length}, owner drops and judges keep ${ex.kept.length} | ${out}`);
for (const g of groups) console.log(`  ${g.id}: ${g.items.length}`);
