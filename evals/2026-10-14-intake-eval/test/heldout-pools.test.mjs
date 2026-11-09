import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeldoutPool } from '../lib/data.mjs';

const row = (id, target, x = {}) => ({
  id, target, source_key: 'inat', source: 'iNaturalist', origin: `https://o/${id}`, file_url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/medium.jpg`,
  author: `A ${id}`, license: 'CC BY 4.0', source_species: 'Platanus racemosa', channel_hint: 'bark', tags_hint: ['far'],
  identity_match: true, local: `pipeline/cache/${id}.jpg`, file_hash: `h-${id}`, fetch_error: null, ...x,
});
const ROWS = [
  row('a', 'PLRA'),
  row('x', 'ACRU'),
  row('b', 'PLRA', { fetch_error: 'timeout' }),
  row('b', 'PLRA'), // the last row of an id counts
  row('c', 'PLRA', { file_hash: 'h-a' }), // a repeat of a's file
  row('d', 'PLRA', { file_hash: null }),
  row('e', 'PLRA', { source_key: 'manual', file_url: 'https://upload.wikimedia.org/wikipedia/commons/6/66/P.jpg' }),
  row('f', 'QULA', { fetch_error: 'http 404' }),
  row('g', 'QULA'),
];
const NAMES = { PLRA: 'Platanus racemosa', QULA: 'Quercus laurifolia' };
const OPTS = { targets: ['PLRA', 'QULA'], thumbPx: 1280, seed: 7, pickSeed: 9 };

test('the held-out pool keeps the last row of each id in file order, and drops errors, no hash, and repeats', () => {
  const { pool, dropped } = buildHeldoutPool(ROWS, NAMES, OPTS);
  assert.deepEqual(pool.cells.map(c => [c.cell, c.photos.map(p => [p.key, p.id, p.n])]), [
    ['PLRA', [['PLRA-01', 'a', 1], ['PLRA-02', 'b', 2], ['PLRA-03', 'e', 3]]],
    ['QULA', [['QULA-01', 'g', 1]]],
  ]);
  assert.deepEqual(dropped, [
    { id: 'c', target: 'PLRA', reason: 'duplicate_hash', kept_id: 'a' },
    { id: 'd', target: 'PLRA', reason: 'no_hash' },
    { id: 'f', target: 'QULA', reason: 'fetch_error' },
  ]);
});

test('a held-out photo has no part, no hint, and the Wikimedia thumbnail URL', () => {
  const { pool } = buildHeldoutPool(ROWS, NAMES, OPTS);
  const e = pool.cells[0].photos[2];
  assert.equal(e.part, null);
  assert.equal(e.species, undefined);
  for (const k of ['channel_hint', 'tags_hint', 'local', 'identity_match']) assert.equal(k in e, false, k);
  assert.match(e.fetch_url, /^https:\/\/thumb\.wikimedia\.org\/.*1280px-P\.jpg$/);
  assert.deepEqual(e.credit, { author: 'A e', license: 'CC BY 4.0', origin: 'https://o/e' });
  assert.equal(e.source_species, 'Platanus racemosa');
  assert.equal(pool.cells[0].species, 'Platanus racemosa');
});

test('codes and blind ids are opaque, unique, and the blind key maps each blind id back to its key', () => {
  const { pool, blindKey } = buildHeldoutPool(ROWS, NAMES, OPTS);
  const photos = pool.cells.flatMap(c => c.photos);
  assert.deepEqual(photos.map(p => p.code).sort(), ['h001', 'h002', 'h003', 'h004']);
  assert.equal(Object.keys(blindKey).length, 4);
  for (const [id, key] of Object.entries(blindKey)) {
    assert.match(id, /^o\d{3}$/);
    assert.equal(photos.find(p => p.key === key).blind, id);
  }
  assert.deepEqual(buildHeldoutPool(ROWS, NAMES, OPTS), buildHeldoutPool(ROWS, NAMES, OPTS));
});
