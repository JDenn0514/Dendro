import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repeatSet, ownerRepeat, REPEAT_N } from '../lib/repeat.mjs';
import { importLabels } from '../lib/answers.mjs';
import { readExport } from '../lib/data.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A pool of 3 species, 30 photos each, with the label page's blind names and the judge codes.
const photo = (t, n, i) => ({ key: `${t}-${String(n).padStart(2, '0')}`, code: `h${String(i).padStart(3, '0')}`, blind: `o${String(i).padStart(3, '0')}` });
const POOL = { set: 'heldout', cells: ['PLRA', 'QULA', 'QUAU'].map((t, ti) => ({ cell: t, target: t, species: `Species ${t}`, photos: Array.from({ length: 30 }, (_, i) => photo(t, i + 1, ti * 30 + i + 1)) })) };

test('the repeat set is 40 different photos, named r01 to r40 in order', () => {
  const set = repeatSet(POOL, { seed: 7 });
  assert.equal(REPEAT_N, 40);
  assert.equal(set.length, 40);
  assert.deepEqual(set.map(p => p.id), Array.from({ length: 40 }, (_, i) => `r${String(i + 1).padStart(2, '0')}`));
  assert.equal(new Set(set.map(p => p.key)).size, 40);
  const all = new Set(POOL.cells.flatMap(c => c.photos.map(p => p.key)));
  for (const p of set) assert.ok(all.has(p.key), p.key);
});

test('the draw is fixed by the seed and changes with it', () => {
  assert.deepEqual(repeatSet(POOL, { seed: 7 }), repeatSet(POOL, { seed: 7 }));
  assert.notDeepEqual(repeatSet(POOL, { seed: 7 }).map(p => p.key), repeatSet(POOL, { seed: 8 }).map(p => p.key));
});

test('a repeat name is no blind name and no judge code, and the order is not the blind order or the fetch order', () => {
  const set = repeatSet(POOL, { seed: 7 });
  const taken = new Set(POOL.cells.flatMap(c => c.photos.flatMap(p => [p.blind, p.code])));
  for (const p of set) assert.equal(taken.has(p.id), false, p.id);
  const blind = [...set].sort((a, b) => a.blind.localeCompare(b.blind)).map(p => p.key);
  assert.notDeepEqual(set.map(p => p.key), blind);
});

test('each repeat photo keeps its species, for the sections of the page', () => {
  for (const p of repeatSet(POOL, { seed: 7 })) {
    assert.equal(p.target, p.key.split('-')[0]);
    assert.equal(p.species, `Species ${p.target}`);
  }
});

test('the draw stops when the pool has fewer than 40 photos', () => {
  const small = { set: 'heldout', cells: [POOL.cells[0], { ...POOL.cells[1], photos: POOL.cells[1].photos.slice(0, 9) }] };
  assert.throws(() => repeatSet(small, { seed: 7 }), /39 photos/);
});

const AT = '2026-11-11T10:00:00.000Z';
const KEY = { r01: 'PLRA-01', r02: 'QULA-07', r03: 'QUAU-03', r04: 'PLRA-02' };

test('repeat labels import to the key, and the import refuses a missing label, no part, a keep with no step, or an unknown name', () => {
  const ok = { r02: { part: 'bark', keep: true, step: 2, at: AT }, r03: { part: 'other', keep: false, step: 1, at: AT }, r04: { part: 'leaf', keep: false, step: null, at: AT } };
  assert.deepEqual(importLabels({ ...ok, r01: { part: 'leaf', keep: true, step: 1, at: AT } }, KEY), {
    'PLRA-01': { part: 'leaf', keep: true, step: 1, at: AT }, 'PLRA-02': { part: 'leaf', keep: false, step: null, at: AT },
    'QUAU-03': { part: 'other', keep: false, step: null, at: AT }, 'QULA-07': { part: 'bark', keep: true, step: 2, at: AT },
  });
  assert.throws(() => importLabels(ok, KEY), /r01: no label/);
  assert.throws(() => importLabels({ ...ok, r01: { part: null, keep: false, at: AT } }, KEY), /r01: no part/);
  assert.throws(() => importLabels({ ...ok, r01: { part: 'leaf', keep: true, step: null, at: AT } }, KEY), /r01: a keep with no difficulty step/);
  assert.throws(() => importLabels({ ...ok, r01: { part: 'leaf', keep: false, at: AT }, o001: { part: 'leaf', keep: false, at: AT } }, KEY), /o001: unknown/);
});

test('the owner repeat agreement: part and keep on all photos, the difficulty step on the photos kept both times', () => {
  const first = {
    A: { part: 'leaf', keep: true, step: 1 }, B: { part: 'bark', keep: true, step: 2 }, C: { part: 'fruit', keep: true, step: 3 },
    D: { part: 'other', keep: false, step: null }, E: { part: 'leaf', keep: true, step: 1 }, X: { part: 'leaf', keep: true, step: 3 },
  };
  const second = {
    A: { part: 'leaf', keep: true, step: 1 }, B: { part: 'bark', keep: true, step: 3 }, C: { part: 'leaf', keep: false, step: null },
    D: { part: 'other', keep: false, step: null }, E: { part: 'leaf', keep: true, step: 3 },
  };
  assert.deepEqual(ownerRepeat(first, second), { n: 5, part: 0.8, keep: 0.8, both: 3, exact: 1 / 3, within1: 2 / 3 });
});

test('the owner repeat agreement stops when a repeat photo has no first label', () => {
  assert.throws(() => ownerRepeat({}, { A: { part: 'leaf', keep: false, step: null } }), /A: no first label/);
});

test('an ArtifactData export reads as { <doc id>: body }, from the .json files only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-'));
  fs.writeFileSync(path.join(dir, 'r01.json'), JSON.stringify({ part: 'leaf', keep: false, step: null }));
  fs.writeFileSync(path.join(dir, 'r02.json'), JSON.stringify({ part: 'bark', keep: true, step: 2 }));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a document');
  assert.deepEqual(readExport(dir), { r01: { part: 'leaf', keep: false, step: null }, r02: { part: 'bark', keep: true, step: 2 } });
  fs.rmSync(dir, { recursive: true });
});
