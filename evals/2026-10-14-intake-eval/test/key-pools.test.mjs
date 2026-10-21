import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKeyPool } from '../lib/data.mjs';

// Three photos of data.js: two published ACRU leaf photos and one candidate (PLOC fruit) from a run.
const suggestion = { step: 2, features: ['shape'], stage: 'mature', season: 'summer', scale: null, reason: 'One whole leaf stands alone.', usualLook: true, usualLookReason: null };
const photo = (key, id, src, published, run, source) => ({
  key, id, src, published, status: published ? 'published' : 'unjudged', statusText: 'x', run,
  credit: { author: `A ${id}`, source, license: 'CC BY 4.0', origin: `https://o/${id}` }, ...suggestion,
});
const SECTIONS = [
  { symbol: 'ACRU', common: 'red maple', scientific: 'Acer rubrum', part: 'leaf', photos: [
    photo('aaa1', 'aaa1', 'https://img.learndendro.com/img/aaa1.jpg', true, null, 'iNaturalist'),
    photo('bbb2', 'bbb2', 'https://img.learndendro.com/img/bbb2.jpg', true, null, 'Bioimages'),
  ] },
  { symbol: 'PLOC', common: 'sycamore', scientific: 'Platanus occidentalis', part: 'fruit', photos: [
    photo('cand:c1c1', 'cc1c1', 'img/cc1c1.jpg', false, 'leaf_topup', 'Wikimedia Commons'),
  ] },
];
const PICKS = [
  { key: 'aaa1', id: 'aaa1', species: 'ACRU', part: 'leaf', published: true, keep: true, step: 1, suggested_step: 1, usual_look: true, note: '' },
  { key: 'bbb2', id: 'bbb2', species: 'ACRU', part: 'leaf', published: true, keep: false, step: null, suggested_step: 3, usual_look: true, note: 'Looks upside down' },
  { key: 'cand:c1c1', id: 'cc1c1', species: 'PLOC', part: 'fruit', published: false, keep: true, step: 3, suggested_step: 3, usual_look: false, note: '' },
];
const CANDIDATES = { leaf_topup: [{ id: 'c1c1', target: 'PLOC', file_url: 'https://upload.wikimedia.org/wikipedia/commons/6/66/P.jpg', source_species: 'Platanus occidentalis var. glabrata' }] };
const NAMES = { ACRU: 'Acer rubrum', PLOC: 'Platanus occidentalis' };
const OPTS = { thumbPx: 1280, seed: 20261014 };

test('the key pool has one cell per section, with keys in key order', () => {
  const P = buildKeyPool(SECTIONS, PICKS, CANDIDATES, NAMES, OPTS);
  assert.equal(P.set, 'key');
  assert.deepEqual(P.cells.map(c => [c.cell, c.target, c.part, c.species]), [['ACRU-leaf', 'ACRU', 'leaf', 'Acer rubrum'], ['PLOC-fruit', 'PLOC', 'fruit', 'Platanus occidentalis']]);
  assert.deepEqual(P.cells[0].photos.map(p => [p.key, p.n, p.order]), [['ACRU-leaf-01', 1, 1], ['ACRU-leaf-02', 2, 2]]);
  assert.equal(P.cells[1].photos[0].key, 'PLOC-fruit-01');
  assert.equal(P.cells[1].photos[0].order, 3);
});

test('a published photo takes the CDN src, the PLANTS name, and the owner call from the picks', () => {
  const p = buildKeyPool(SECTIONS, PICKS, CANDIDATES, NAMES, OPTS).cells[0].photos[1];
  assert.equal(p.review_key, 'bbb2');
  assert.equal(p.url, 'https://img.learndendro.com/img/bbb2.jpg');
  assert.equal(p.fetch_url, p.url);
  assert.equal(p.source, 'Bioimages');
  assert.deepEqual(p.credit, { author: 'A bbb2', license: 'CC BY 4.0', origin: 'https://o/bbb2' });
  assert.equal(p.source_species, 'Acer rubrum');
  assert.equal(p.published, true);
  assert.deepEqual(p.owner, { keep: false, step: null });
});

test('a cand: photo takes the candidate file_url and source name, and a Wikimedia file goes through the thumbnail', () => {
  const p = buildKeyPool(SECTIONS, PICKS, CANDIDATES, NAMES, OPTS).cells[1].photos[0];
  assert.equal(p.url, 'https://upload.wikimedia.org/wikipedia/commons/6/66/P.jpg');
  assert.equal(p.fetch_url, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/66/P.jpg/1280px-P.jpg');
  assert.equal(p.source_species, 'Platanus occidentalis var. glabrata');
  assert.equal(p.run, 'leaf_topup');
  assert.equal(p.published, false);
  assert.deepEqual(p.owner, { keep: true, step: 3 });
});

test('no agent suggestion reaches the pool', () => {
  const text = JSON.stringify(buildKeyPool(SECTIONS, PICKS, CANDIDATES, NAMES, OPTS));
  for (const word of ['reason', 'features', 'stage', 'season', 'scale', 'usualLook', 'usual_look', 'suggested_step', 'statusText', 'One whole leaf stands alone', 'Looks upside down']) {
    assert.ok(!text.includes(word), `the pool holds ${word}`);
  }
});

test('a photo with no pick row or no candidate row throws', () => {
  assert.throws(() => buildKeyPool(SECTIONS, PICKS.slice(1), CANDIDATES, NAMES, OPTS), /no pick row for aaa1/);
  assert.throws(() => buildKeyPool(SECTIONS, PICKS, { leaf_topup: [] }, NAMES, OPTS), /no candidate c1c1 in leaf_topup/);
});

test('each photo gets an opaque code, unique and fixed by the seed', () => {
  const codes = P => P.cells.flatMap(c => c.photos.map(p => p.code));
  const a = codes(buildKeyPool(SECTIONS, PICKS, CANDIDATES, NAMES, OPTS));
  assert.ok(a.every(c => /^p\d{3}$/.test(c)), a.join(' '));
  assert.equal(new Set(a).size, 3);
  assert.deepEqual(a, codes(buildKeyPool(SECTIONS, PICKS, CANDIDATES, NAMES, OPTS)));
  assert.notDeepEqual(a, codes(buildKeyPool(SECTIONS, PICKS, CANDIDATES, NAMES, { ...OPTS, seed: 5 })));
});
