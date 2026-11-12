import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repeatSet, repeatPool } from '../lib/repeat.mjs';
import { labelPage } from '../pages/label-page.mjs';
import { STEP_LEGEND, PART_LEGEND } from '../pages/legend.mjs';
import { pageLeaks } from '../pages/style.mjs';
import { readJson } from '../lib/data.mjs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// A pool with markers the page must never show: the key, the judge code, the blind name of the label page,
// the candidate id, the URLs, the hints, and an earlier answer of the owner.
const photo = (t, n, i) => ({
  key: `${t}-${String(n).padStart(2, '0')}`, n, id: `cand${t}${n}secret`, target: t, part: 'markerpart', source_key: 'inat',
  url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${t}${n}/original.jpg`, fetch_url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${t}${n}/original.jpg`,
  source: 'iNaturalist', credit: { author: `(c) Person ${t}${n}`, license: 'CC BY 4.0', origin: `https://www.inaturalist.org/observations/${t}${n}` },
  source_species: 'Platanus racemosa', code: `h${String(i).padStart(3, '0')}`, blind: `o${String(i).padStart(3, '0')}`,
  channel_hint: 'bark', tags_hint: ['hintword'], label: { part: 'markerpart', keep: true, step: 2, at: '2026-11-04T09:09:09.000Z' },
});
const NAMES = { PLRA: 'Platanus racemosa', QULA: 'Quercus laurifolia', QUAU: 'Quercus austrina' };
const POOL = { set: 'heldout', cells: Object.keys(NAMES).map((t, ti) => ({ cell: t, target: t, part: null, species: NAMES[t], photos: Array.from({ length: 30 }, (_, i) => photo(t, i + 1, ti * 30 + i + 1)) })) };
const SET = repeatSet(POOL, { seed: 7 });
const html = labelPage(repeatPool(POOL, SET), { seed: 9, best: false, collection: 'repeat' });
const all = POOL.cells.flatMap(c => c.photos);

test('the repeat page shows no key, judge code, blind name, candidate id, URL, hint, or earlier answer', () => {
  const word = s => new RegExp(`\\b${s}\\b`).test(html);
  for (const p of all) {
    for (const secret of [p.key, p.id, p.url, p.credit.origin, 'original.jpg']) assert.equal(html.includes(secret), false, secret);
    assert.equal(word(p.code), false, p.code);
    assert.equal(word(p.blind), false, p.blind);
  }
  for (const w of ['hintword', 'channel', 'tags_hint', 'markerpart', '2026-11-04', 'judge', 'Judge', 'opus', 'Opus', 'sonnet', 'Sonnet', 'haiku', 'Haiku', 'suggest']) assert.equal(html.includes(w), false, w);
});

test('the repeat page has the 40 photos by their repeat names, their credits, the legend, and one section per species', () => {
  for (const p of SET) assert.ok(html.includes(`img/${p.id}.jpg`), p.id);
  assert.equal((html.match(/class="card"/g) ?? []).length, 40);
  for (const p of SET) assert.ok(html.includes(all.find(x => x.key === p.key).credit.author));
  assert.equal((html.match(/<section /g) ?? []).length, new Set(SET.map(p => p.target)).size);
  assert.ok(html.includes('What the steps mean'));
  for (const [t] of [...STEP_LEGEND, PART_LEGEND]) assert.ok(html.includes(t), t);
  assert.ok(html.includes(PART_LEGEND[1]));
});

test('the repeat page saves to repeat/ and has no best-photo view', () => {
  assert.ok(html.includes(`db.doc('repeat/'`));
  assert.ok(html.includes(`collection('repeat')`));
  assert.equal(html.includes(`'labels`), false);
  for (const w of ['Best photo', 'best-view', `'best`, 'v-best']) assert.equal(html.includes(w), false, w);
});

test('the label page keeps its best-photo view and its labels collection', () => {
  const page = labelPage(POOL, { seed: 9 });
  assert.ok(page.includes('Best photo') && page.includes(`db.doc('labels/'`) && page.includes(`collection('best')`));
});

test('with the default options, the label page builds byte for byte as before Task 10', () => {
  const at = f => fileURLToPath(new URL(`../${f}`, import.meta.url));
  const page = labelPage(readJson(at('heldout/pools.json')), { seed: readJson(at('config.json')).pick_seed });
  assert.equal(createHash('sha256').update(page).digest('hex'), '0facda9bd1defe1332662bff8e9f8ad8e3516719465e6a237f95e3548057272d');
});

test('the leak check finds a text anywhere, a word only as a whole word, and skips an empty value', () => {
  const page = '<p>(c) Awinch1001, see https://x.org/1 and o017.</p>';
  assert.deepEqual(pageLeaks(page, { text: ['https://x.org/1', 'PLRA-01', null, ''], words: ['h100', 'o017', 'o018', undefined] }), ['https://x.org/1', 'o017']);
  assert.deepEqual(pageLeaks(page, { text: [], words: [] }), []);
});
