import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTargets, keyOf, inPool, splitPool, isInfraOf, isGoodLeaf } from '../lib/data.mjs';
import { mulberry32, shuffle, pickOrder } from '../lib/seed.mjs';
import { sheetGroups, sheetPaths } from '../lib/sheet.mjs';

const row = (id, target, extra = {}) => ({ id, target, source_key: 'inat', channel_hint: null, local: `pipeline/cache/inat/${id}.jpg`, file_hash: `h-${id}`, fetch_error: null, source_species: 'Quercus alba', ...extra });

test('keyOf pads the place to two digits', () => {
  assert.equal(keyOf('QUAC2', 7), 'QUAC2-07');
  assert.equal(keyOf('QUAC2', 43), 'QUAC2-43');
});

test('inPool keeps leaf and unhinted fetched rows only', () => {
  assert.equal(inPool(row('a', 'T')), true);
  assert.equal(inPool(row('a', 'T', { channel_hint: 'leaf' })), true);
  assert.equal(inPool(row('a', 'T', { channel_hint: 'bark' })), false);
  assert.equal(inPool(row('a', 'T', { source_key: 'manual' })), false);
  assert.equal(inPool(row('a', 'T', { local: null })), false);
  assert.equal(inPool(row('a', 'T', { fetch_error: 'http 404' })), false);
});

test('isGoodLeaf needs approve, leaf, and no hard tag', () => {
  assert.equal(isGoodLeaf({ verdict: 'approve', channel: 'leaf', tags: [] }), true);
  assert.equal(isGoodLeaf({ verdict: 'approve', channel: 'leaf', tags: ['hard'] }), false);
  assert.equal(isGoodLeaf({ verdict: 'approve', channel: 'bark', tags: [] }), false);
  assert.equal(isGoodLeaf({ verdict: 'reject', channel: null, tags: [] }), false);
  assert.equal(isGoodLeaf(undefined), false);
});

test('buildTargets groups blocks by target in file order and counts old good leaves', () => {
  const cands = [
    row('a1', 'A'), row('b1', 'B'), row('a2', 'A', { channel_hint: 'fruit' }),
    row('a3', 'A', { source_key: 'manual' }), row('b2', 'B'), row('a4', 'A', { channel_hint: 'leaf' }),
  ];
  const verdicts = [
    { candidate_id: 'a1', verdict: 'approve', channel: 'leaf', tags: ['hard'] },
    { candidate_id: 'a1', verdict: 'approve', channel: 'leaf', tags: [] },
    { candidate_id: 'a4', verdict: 'approve', channel: 'leaf', tags: [] },
    { candidate_id: 'b1', verdict: 'approve', channel: 'leaf', tags: [] },
    { candidate_id: 'b1', verdict: 'reject', channel: null, tags: [] },
  ];
  const [A, B] = buildTargets('run1', cands, verdicts, { A: 'Quercus montana', B: 'Quercus rubra' });
  assert.equal(A.target, 'A');
  assert.deepEqual(A.photos.map(p => [p.key, p.id]), [['A-01', 'a1'], ['A-02', 'a4']]);
  assert.equal(A.good_old, 2);
  assert.equal(A.species, 'Quercus montana');
  assert.equal(A.photos[0].abs, 'C:/Users/jdennen/Dendro/pipeline/cache/inat/a1.jpg');
  assert.deepEqual(B.photos.map(p => p.id), ['b1', 'b2']);
  assert.equal(B.good_old, 0);
  assert.deepEqual(A.dropped, []);
});

test('splitPool keeps the first row of a file_hash and drops the second', () => {
  const rows = [row('d1', 'A', { file_hash: 'same' }), row('x', 'A'), row('d2', 'A', { file_hash: 'same' })];
  const { kept, dropped } = splitPool(rows, 'Quercus alba');
  assert.deepEqual(kept.map(r => r.id), ['d1', 'x']);
  assert.deepEqual(dropped, [{ id: 'd2', target: 'A', reason: 'duplicate_hash', kept_id: 'd1' }]);
  const [A] = buildTargets('run1', rows, [], { A: 'Quercus alba' });
  assert.deepEqual(A.photos.map(p => p.key), ['A-01', 'A-02']);
  assert.equal(A.dropped.length, 1);
});

test('splitPool drops a row with no hash or with a fetch error, and ignores manual and other-hint rows', () => {
  const rows = [
    row('n1', 'A', { file_hash: null }), row('e1', 'A', { fetch_error: 'http 404' }), row('ok', 'A'),
    row('m1', 'A', { source_key: 'manual', file_hash: null }), row('f1', 'A', { channel_hint: 'fruit' }),
  ];
  const { kept, dropped } = splitPool(rows, 'Quercus alba');
  assert.deepEqual(kept.map(r => r.id), ['ok']);
  assert.deepEqual(dropped.map(d => [d.id, d.reason]), [['n1', 'no_hash'], ['e1', 'fetch_error']]);
});

test('splitPool drops a row of a different species (owner ruling 2026-10-08)', () => {
  const rows = [
    row('s1', 'QUSI2', { source_species: 'Quercus similis', identity_match: true }),
    row('s2', 'QUSI2', { source_species: 'Quercus stellata', identity_match: false }),
    row('p1', 'QUSI2', { source_species: 'Platanus orientalis', identity_match: false }),
  ];
  const { kept, dropped } = splitPool(rows, 'Quercus similis');
  assert.deepEqual(kept.map(r => r.id), ['s1']);
  assert.deepEqual(dropped.map(d => [d.id, d.reason]), [['s2', 'wrong_species'], ['p1', 'wrong_species']]);
});

test('splitPool keeps a subspecies or variety row of the target', () => {
  const rows = [
    row('v1', 'QUSI', { source_species: 'Quercus sinuata breviloba', identity_match: false }),
    row('v2', 'QUSI', { source_species: 'Quercus sinuata var. breviloba', identity_match: false }),
    row('v3', 'QUSI', { source_species: 'Quercus sinuata subsp. sinuata', identity_match: false }),
    row('x1', 'QUSI', { source_species: 'Quercus similis breviloba', identity_match: false }),
  ];
  const { kept, dropped } = splitPool(rows, 'Quercus sinuata');
  assert.deepEqual(kept.map(r => r.id), ['v1', 'v2', 'v3']);
  assert.deepEqual(dropped.map(d => [d.id, d.reason]), [['x1', 'wrong_species']]);
  assert.equal(isInfraOf('Platanus orientalis', 'Platanus ×hispanica'), false);
});

test('splitPool keeps a row whose name is in same_species, and still drops another species', () => {
  const rows = [
    row('m1', 'QUMA13', { source_species: 'Quercus margaretiae', identity_match: false }),
    row('m2', 'QUMA13', { source_species: 'Quercus stellata', identity_match: false }),
    row('m3', 'QUMA13', { source_species: 'Quercus margaretta', identity_match: true }),
  ];
  const { kept, dropped } = splitPool(rows, 'Quercus margaretta', ['Quercus margaretiae']);
  assert.deepEqual(kept.map(r => r.id), ['m1', 'm3']);
  assert.deepEqual(dropped.map(d => [d.id, d.reason]), [['m2', 'wrong_species']]);
  assert.deepEqual(splitPool(rows, 'Quercus margaretta').kept.map(r => r.id), ['m3']);
  const [T] = buildTargets('run1', rows, [], { QUMA13: 'Quercus margaretta' }, { QUMA13: ['Quercus margaretiae'] });
  assert.equal(T.photos.length, 2);
});

test('mulberry32 and shuffle are fixed for a fixed seed', () => {
  const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(42));
  const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(42));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('pickOrder is a permutation of the photos and stable for a seed and target', () => {
  const photos = Array.from({ length: 40 }, (_, i) => ({ key: keyOf('QUAC2', i + 1), n: i + 1 }));
  const a = pickOrder(photos, 20261008, 'QUAC2');
  assert.deepEqual(a, pickOrder(photos, 20261008, 'QUAC2'));
  assert.deepEqual([...a].sort((x, y) => x.n - y.n), photos);
  assert.notDeepEqual(a.map(p => p.n), photos.map(p => p.n));
  assert.notDeepEqual(pickOrder(photos, 20261008, 'QUAL').map(p => p.n), a.map(p => p.n));
  assert.equal(a.find(p => p.n === 7).key, 'QUAC2-07');
});

test('sheetGroups cuts 9 per sheet and sheetPaths names them', () => {
  const keys = Array.from({ length: 20 }, (_, i) => `T-${i + 1}`);
  assert.deepEqual(sheetGroups(keys).map(g => g.length), [9, 9, 2]);
  assert.deepEqual(sheetPaths('E', 'T', 12, 'first12'), ['E/sheets/T/first12-1.jpg', 'E/sheets/T/first12-2.jpg']);
});
