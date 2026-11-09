// The feature check (plan Task 8; owner ruling 2026-10-21): 60 key photos, 20 per part, with one yes or no
// question per photo feature in learner words. The owner's answers are compared with the stored key answers
// of the three leading set-ups, where a photo feature at `clear` is a yes. Pure: no file and no network.
import { pickOrder } from './seed.mjs';
import { KEY_FEATURES, OTHER_FEATURES } from './step.mjs';

export const PER_PART = 20;

// One yes or no question per part and photo feature, in learner words (spec, "The sample"). A yes stands for
// `clear` in the judge brief: the learner reads it at a glance. The page tells the owner to answer no when
// the learner must look closely or hunt for it.
export const QUESTIONS = {
  'leaf:shape': 'Can you read the outline of the leaf: its shape, lobes, and tips?',
  'leaf:margin': 'Can you see the leaf edge well enough to tell if it is smooth or toothed?',
  'leaf:venation': 'Can you see the pattern of the veins?',
  'leaf:arrangement': 'Can you see where the leaf stalks join the twig?',
  'leaf:size': 'Is there a hand, a ruler, a coin, or something else that shows how big the leaf is?',
  'bark:texture': 'Can you read the bark texture: rough, smooth, or flaky?',
  'bark:pattern': 'Can you see the bark pattern: ridges, plates, grooves, peeling, or a smooth trunk?',
  'bark:colour': 'Can you see the true colour of the bark?',
  'fruit:kind': 'Can you tell what kind of fruit it is?',
  'fruit:shape': 'Can you see the outline of the fruit?',
  'fruit:hang': 'Can you see how the fruit hangs or sits on the twig?',
  'fruit:wing': 'Can you see the wing of the seed?',
  'fruit:cap': 'Can you see the cap of the acorn?',
  'fruit:two_heads': 'Can you count how many seed balls hang from one stalk?',
};
const PARTS = ['leaf', 'bark', 'fruit'];

// The brief asks for `wing` only on a samara and `cap` only on an acorn. The genus tells which fruit it is.
const FRUIT_EXTRA = { Acer: 'wing', Liriodendron: 'wing', Quercus: 'cap' };

// The photo features to ask about on a photo of this species and part, in the brief's order.
export function featuresOf(target, species, part, depthFeatures = {}) {
  const out = [...KEY_FEATURES[part], ...OTHER_FEATURES[part].filter(f => f !== 'wing' && f !== 'cap')];
  const genus = species.split(' ')[0];
  if (part === 'fruit' && FRUIT_EXTRA[genus]) out.push(FRUIT_EXTRA[genus]);
  const depth = depthFeatures[target]?.[part];
  if (depth) out.push(depth);
  return out;
}

// pools: key/pools.json. Returns [{ id, key, code, target, species, part, features }] in id order.
// For each part, the first 20 photos in an order fixed by the seed. The ids f01 to f60 take a second
// order fixed by the seed, so an id tells nothing of the key, the cell, or the key number.
export function featureSet(pools, { seed, depthFeatures = {} }) {
  const chosen = [];
  for (const part of PARTS) {
    const photos = pools.cells.filter(c => c.part === part).flatMap(c => c.photos.map(p => ({ key: p.key, code: p.code, target: c.target, species: c.species, part })));
    if (photos.length < PER_PART) throw new Error(`${part}: ${photos.length} photos, the check needs ${PER_PART}`);
    chosen.push(...pickOrder(photos, seed, `features:${part}`).slice(0, PER_PART));
  }
  return pickOrder(chosen, seed, 'features:ids').map((p, i) => ({
    id: `f${String(i + 1).padStart(2, '0')}`, ...p, features: featuresOf(p.target, p.species, p.part, depthFeatures),
  }));
}

// docs: an ArtifactData export of the page, { <id>: { answers: { <feature>: true | false }, at } }.
// set: featureSet's result. Returns one row per photo, in id order, with the owner's answers as `owner`.
// Throws on the first bad or missing answer, naming it, so nothing half-checked is written.
export function importFeatures(docs, set) {
  const byId = new Map(set.map(p => [p.id, p]));
  for (const id of Object.keys(docs)) if (!byId.has(id)) throw new Error(`${id}: unknown id`);
  return set.map(p => {
    const a = docs[p.id]?.answers;
    if (!a) throw new Error(`${p.id}: no answers`);
    for (const f of Object.keys(a)) if (!p.features.includes(f)) throw new Error(`${p.id}: ${f} was not asked`);
    for (const f of p.features) {
      if (!(f in a)) throw new Error(`${p.id}: no answer to ${f}`);
      if (typeof a[f] !== 'boolean') throw new Error(`${p.id}: ${f} is not yes or no`);
    }
    return { ...p, owner: Object.fromEntries(p.features.map(f => [f, a[f]])), at: docs[p.id].at ?? null };
  });
}

const yes = (answer, f) => answer?.photo_features?.[f] === 'clear';
const newCount = () => ({ n: 0, agree: 0, owner_yes: 0, model_yes: 0 });
const countAnswer = (count, ownerYes, modelYes) => {
  count.n++; if (ownerYes === modelYes) count.agree++; if (ownerYes) count.owner_yes++; if (modelYes) count.model_yes++;
};

// rows: importFeatures' result. answers: { <set-up>: { <key>: judge answer | null } }, the stored key answers.
// A photo feature at `clear` is a yes. `search`, `no`, a feature left out, and no answer are a no.
// no_answer counts the photos with no judge answer; left_out counts the questions that a judge who answered
// the photo left with no value (such as a photo it gave another part). Both count as a no, and the report shows them.
// Returns, per set-up, the agreement with the owner over all questions, per part, and per part and feature;
// and the agreement of each pair of set-ups, and of all set-ups at once, on the same questions.
export function compareFeatures(rows, answers) {
  const names = Object.keys(answers);
  const setups = Object.fromEntries(names.map(s => [s, { all: newCount(), by_part: {}, by_feature: {}, no_answer: 0, left_out: 0 }]));
  const pairs = {};
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) pairs[`${names[i]} | ${names[j]}`] = { n: 0, agree: 0 };
  const allModels = { n: 0, agree: 0 };
  for (const r of rows) {
    for (const s of names) if (answers[s][r.key] == null) setups[s].no_answer++;
    for (const f of r.features) {
      const m = names.map(s => yes(answers[s][r.key], f));
      names.forEach((s, i) => {
        const t = setups[s], a = answers[s][r.key];
        if (a != null && a.photo_features?.[f] == null) t.left_out++;
        countAnswer(t.all, r.owner[f], m[i]);
        countAnswer(t.by_part[r.part] ??= newCount(), r.owner[f], m[i]);
        countAnswer(t.by_feature[`${r.part}:${f}`] ??= newCount(), r.owner[f], m[i]);
      });
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const p = pairs[`${names[i]} | ${names[j]}`];
        p.n++; if (m[i] === m[j]) p.agree++;
      }
      allModels.n++; if (m.every(x => x === m[0])) allModels.agree++;
    }
  }
  return { setups, pairs, all_models: allModels };
}
