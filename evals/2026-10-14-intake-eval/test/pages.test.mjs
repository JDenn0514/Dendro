import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelPage } from '../pages/label-page.mjs';

// A pool with markers the page must never show: the key, the judge code, the candidate id, the URLs, and the hints.
const photo = (t, n, x = {}) => ({
  key: `${t}-${String(n).padStart(2, '0')}`, n, id: `cand${t}${n}secret`, target: t, part: null, source_key: 'inat',
  url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${t}${n}/original.jpg`, fetch_url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${t}${n}/original.jpg`,
  source: 'iNaturalist', credit: { author: `(c) Person ${t}${n}`, license: 'CC BY 4.0', origin: `https://www.inaturalist.org/observations/${t}${n}` },
  source_species: 'Platanus racemosa', code: `h9${t}${n}`, blind: `o${t === 'PLRA' ? 1 : 2}${String(n).padStart(2, '0')}`,
  channel_hint: 'bark', tags_hint: ['hintword'], ...x,
});
const POOL = { set: 'heldout', cells: [
  { cell: 'PLRA', target: 'PLRA', part: null, species: 'Platanus racemosa', photos: Array.from({ length: 12 }, (_, i) => photo('PLRA', i + 1)) },
  { cell: 'QULA', target: 'QULA', part: null, species: 'Quercus laurifolia', photos: Array.from({ length: 5 }, (_, i) => photo('QULA', i + 1)) },
] };
const html = labelPage(POOL, { seed: 11 });

test('the label page shows no key, no judge code, no candidate id, no file name or URL, and no hint', () => {
  for (const p of POOL.cells.flatMap(c => c.photos)) {
    for (const secret of [p.key, p.code, p.id, p.url, p.credit.origin, 'original.jpg']) assert.equal(html.includes(secret), false, secret);
  }
  for (const word of ['hintword', 'channel', 'tags_hint', 'judge', 'Judge', 'opus', 'Opus', 'sonnet', 'Sonnet', 'haiku', 'Haiku', 'suggest']) assert.equal(html.includes(word), false, word);
});

test('the label page has every photo by its blind name, its credit, and one section per species', () => {
  for (const p of POOL.cells.flatMap(c => c.photos)) {
    assert.ok(html.includes(`img/${p.blind}.jpg`), p.blind);
    assert.ok(html.includes(p.credit.author), p.credit.author);
  }
  assert.equal((html.match(/<section /g) ?? []).length, 2);
  assert.ok(html.includes('Platanus racemosa') && html.includes('Quercus laurifolia'));
  assert.ok(html.includes('What the steps mean'));
});

test('the photos of a species are not in fetch order', () => {
  const order = [...html.matchAll(/img\/(o1\d\d)\.jpg/g)].map(m => m[1]);
  const fetch = POOL.cells[0].photos.map(p => p.blind);
  assert.deepEqual([...order].sort(), [...fetch].sort());
  assert.notDeepEqual(order, fetch);
});
