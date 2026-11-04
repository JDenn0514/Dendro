import { test } from 'node:test';
import assert from 'node:assert/strict';
import { featurePage } from '../pages/feature-page.mjs';
import { QUESTIONS } from '../lib/features.mjs';

// Items as the build gives them: the feature set row with the credit. Markers the page must never show:
// the key, the judge code, the target, the species, and the credit's source URL.
const item = (id, target, part, features) => ({
  id, key: `${target}-${part}-07`, code: `p9${id.slice(1)}`, target, species: 'Quercus secretname', part, features,
  source: 'iNaturalist', author: `(c) Person ${id}`, license: 'CC BY 4.0', origin: `https://www.inaturalist.org/observations/77${id}`,
});
const ITEMS = [
  item('f03', 'QUAL', 'fruit', ['kind', 'shape', 'hang', 'cap']),
  item('f01', 'ACRU', 'leaf', ['shape', 'margin', 'venation', 'arrangement', 'size']),
  item('f02', 'PLOC', 'bark', ['texture', 'pattern', 'colour']),
  item('f04', 'PLHI', 'fruit', ['kind', 'shape', 'hang', 'two_heads']),
];
const html = featurePage(ITEMS);

test('the feature page shows no key, no judge code, no species, no source URL, and no judge word', () => {
  // Whole words, so that clearTimeout in the script does not count as the judge's value `clear`.
  for (const it of ITEMS) for (const secret of [it.key, it.code, it.target, it.species, it.origin]) assert.equal(html.includes(secret), false, secret);
  for (const word of ['judge', 'Judge', 'opus', 'Opus', 'sonnet', 'Sonnet', 'haiku', 'Haiku', 'model', 'suggest', 'clear', 'search']) assert.doesNotMatch(html, new RegExp(`\\b${word}\\b`), word);
});

test('the feature page has each photo by its id, its credit, and one learner question per photo feature', () => {
  for (const it of ITEMS) {
    assert.ok(html.includes(`img/${it.id}.jpg`), it.id);
    assert.ok(html.includes(it.author), it.author);
    for (const f of it.features) assert.ok(html.includes(`id="${it.id}-${f}-yes"`) && html.includes(`id="${it.id}-${f}-no"`), `${it.id} ${f}`);
  }
  assert.ok(html.includes(QUESTIONS['leaf:arrangement']));
  assert.equal(QUESTIONS['leaf:arrangement'], 'Can you see where the leaf stalks join the twig?');
  assert.ok(html.includes(QUESTIONS['fruit:cap']) && html.includes(QUESTIONS['fruit:two_heads']));
  assert.equal(html.includes(QUESTIONS['fruit:wing']), false, 'no photo here asks about a wing');
});

test('the feature page has one section per part, leaf, bark, then fruit, with the photos in id order', () => {
  assert.equal((html.match(/<section /g) ?? []).length, 3);
  assert.deepEqual([...html.matchAll(/<h2>(\w+)/g)].map(m => m[1]), ['Leaf', 'Bark', 'Fruit']);
  assert.deepEqual([...html.matchAll(/img\/(f\d\d)\.jpg/g)].map(m => m[1]), ['f01', 'f02', 'f03', 'f04']);
});

test('the feature page saves to features/<id>', () => {
  assert.ok(html.includes("db.doc('features/' + "));
  assert.ok(html.includes("db.collection('features')"));
});

test('every question has learner words for each part and feature that the feature set asks', () => {
  for (const k of ['leaf:shape', 'leaf:margin', 'leaf:venation', 'leaf:arrangement', 'leaf:size', 'bark:texture', 'bark:pattern', 'bark:colour',
    'fruit:kind', 'fruit:shape', 'fruit:hang', 'fruit:wing', 'fruit:cap', 'fruit:two_heads']) assert.match(QUESTIONS[k] ?? '', /^(Can|Is) .+\?$/, k);
});
