import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import type { Candidate } from '../lib/candidates.ts';
import { SOURCE_NAMES } from '../lib/candidates.ts';
import type { Verdict } from '../lib/verdicts.ts';
import { JPEG_QUALITY, MAX_SIDE, objectKey, reviewKey } from '../lib/images.ts';
import type { Resize } from '../lib/images.ts';
import { memoryStorage } from '../lib/storage.ts';
import { publishApproved, retireRows, setDifficulty, shownRows } from '../lib/manifest.ts';
import type { ManifestRow } from '../lib/manifest.ts';
import type { ManifestRow } from '../lib/manifest.ts';

const ROW_FIELDS = [
  'hash', 'target', 'channel', 'source', 'author',
  'license', 'origin', 'tags',
  'checked_by', 'checked_at', 'note',
];

const CREDIT_FIELDS: ('author' | 'source' | 'license')[] = ['author', 'source', 'license'];

const CACHE_1 = 'pipeline/cache/commons/c1.jpg';
const CACHE_2 = 'pipeline/cache/commons/c2.jpg';

// A candidate id is the sha1 of the target and the origin, so two rows on one
// target need two origins. Two Commons files hold the same bytes often enough.
const ORIGIN_1 = 'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark.jpg';
const ORIGIN_2 = 'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark_2.jpg';

// A JPEG starts with these two bytes. The fake resizer writes them, so the
// bytes it returns look like the file the real resizer returns.
const JPEG_MARKER = new Uint8Array([0xff, 0xd8]);

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// The marker plus the sha256 of the input. The output is 66 bytes, so the hash
// of it is a real 64 hex digest of bytes that differ per input.
function fakeResize(bytes: Uint8Array): Uint8Array {
  const digest = encode(createHash('sha256').update(bytes).digest('hex'));
  const out = new Uint8Array(JPEG_MARKER.length + digest.length);
  out.set(JPEG_MARKER, 0);
  out.set(digest, JPEG_MARKER.length);
  return out;
}

function resizedHash(text: string): string {
  return createHash('sha256').update(fakeResize(encode(text))).digest('hex');
}

function cand(over: Partial<Candidate>): Candidate {
  return {
    id: 'c1',
    target: 'QUGA',
    source_key: 'commons',
    source: SOURCE_NAMES.commons,
    origin: ORIGIN_1,
    file_url: 'https://upload.wikimedia.org/quercus_gambelii_bark.jpg',
    author: 'A Photographer',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    source_species: 'Quercus gambelii',
    identity_match: true,
    channel_hint: 'bark',
    tags_hint: [],
    local: CACHE_1,
    file_hash: null,
    fetched_at: '2026-09-22T00:00:00Z',
    fetch_error: null,
    ...over,
  };
}

function verd(over: Partial<Verdict>): Verdict {
  return {
    candidate_id: 'c1',
    verdict: 'approve',
    channel: 'bark',
    tags: ['winter'],
    case: null,
    note: 'Bark fills the frame.',
    checked_by: 'photo_check_agent',
    checked_at: '2026-09-22',
    ...over,
  };
}

function harness(files: Record<string, string>) {
  const storage = memoryStorage();
  const resizeCalls: { text: string; maxSide: number; quality: number }[] = [];
  const resize: Resize = async (bytes, maxSide, quality) => {
    resizeCalls.push({ text: decode(bytes), maxSide, quality });
    return fakeResize(bytes);
  };
  const readLocal = (file: string): Uint8Array => {
    const text = files[file];
    if (text === undefined) throw new Error(`no cached file at ${file}`);
    return encode(text);
  };
  return { storage, resizeCalls, deps: { storage, resize, readLocal } };
}

test('the key is img/<sha256 of the resized bytes>.jpg and the put names image/jpeg', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const hash = resizedHash('alpha');
  assert.deepEqual(result.uploaded, [`img/${hash}.jpg`]);
  assert.deepEqual(h.storage.puts, [{ key: `img/${hash}.jpg`, contentType: 'image/jpeg' }]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].hash, hash);
  assert.match(result.rows[0].hash, /^[0-9a-f]{64}$/);
  assert.match(result.uploaded[0], /^img\/[0-9a-f]{64}\.jpg$/);
  assert.equal(objectKey(hash), `img/${hash}.jpg`);
});

test('a second run over the same verdicts uploads nothing and adds no row', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  const first = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const putsAfterFirst = h.storage.puts.length;
  const second = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: first.rows,
  });
  assert.equal(putsAfterFirst, 1);
  assert.equal(h.storage.puts.length, putsAfterFirst);
  assert.equal(second.rows.length, first.rows.length);
  assert.deepEqual(second.uploaded, []);
  assert.equal(second.skipped.length, 1);
});

test('two candidates with the same bytes and different targets give one object and two rows', async () => {
  const h = harness({ [CACHE_1]: 'alpha', [CACHE_2]: 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [
      cand({}),
      cand({ id: 'c2', target: 'PIPO', local: CACHE_2 }),
    ],
    verdicts: [verd({}), verd({ candidate_id: 'c2' })],
    rows: [],
  });
  assert.equal(h.storage.objects.size, 1);
  assert.equal(h.storage.puts.length, 1);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map((r) => r.target), ['QUGA', 'PIPO']);
  assert.equal(result.rows[0].hash, result.rows[1].hash);
});

test('two candidates with the same bytes, target, and channel give one object and one row', async () => {
  const h = harness({ [CACHE_1]: 'alpha', [CACHE_2]: 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({}), cand({ id: 'c2', origin: ORIGIN_2, local: CACHE_2 })],
    verdicts: [verd({}), verd({ candidate_id: 'c2' })],
    rows: [],
  });
  assert.equal(h.storage.objects.size, 1);
  assert.equal(h.storage.puts.length, 1);
  assert.equal(result.rows.length, 1);
});

test('the row shape matches the app manifest, with the source display name', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const row = result.rows[0];
  assert.deepEqual(Object.keys(row), ROW_FIELDS);
  assert.equal(row.target, 'QUGA');
  assert.equal(row.channel, 'bark');
  assert.equal(row.source, SOURCE_NAMES.commons);
  assert.equal(row.source, 'Wikimedia Commons');
  assert.equal(row.author, 'A Photographer');
  assert.equal(row.license, 'CC BY 4.0');
  assert.equal(row.origin, ORIGIN_1);
  assert.deepEqual(row.tags, ['winter']);
  assert.equal(row.checked_by, 'photo_check_agent');
  assert.equal(row.checked_at, '2026-09-22');
  assert.equal(row.note, 'Bark fills the frame.');
});

test('a rejected candidate and an escalated candidate upload nothing and get no row', async () => {
  const h = harness({ [CACHE_1]: 'alpha', [CACHE_2]: 'beta' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({}), cand({ id: 'c2', origin: ORIGIN_2, local: CACHE_2 })],
    verdicts: [
      verd({ verdict: 'reject', channel: null, tags: [] }),
      verd({ candidate_id: 'c2', verdict: 'escalate', case: 'quality', channel: null, tags: [] }),
    ],
    rows: [],
  });
  assert.equal(h.storage.puts.length, 0);
  assert.equal(h.storage.objects.size, 0);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.uploaded, []);
});

test('an approve followed by a reject for one candidate uploads nothing', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [
      verd({}),
      verd({ verdict: 'reject', channel: null, tags: [], note: 'The owner said no.' }),
    ],
    rows: [],
  });
  assert.deepEqual(h.storage.puts, []);
  assert.deepEqual(result.uploaded, []);
  assert.deepEqual(result.rows, []);
});

test('the resizer receives the cached bytes, MAX_SIDE, and JPEG_QUALITY', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  assert.deepEqual(h.resizeCalls, [{ text: 'alpha', maxSide: MAX_SIDE, quality: JPEG_QUALITY }]);
});

test('a verdict whose candidate is missing throws and names the candidate id', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  await assert.rejects(
    () => publishApproved({
      deps: h.deps,
      candidates: [],
      verdicts: [verd({ candidate_id: 'ghost9' })],
      rows: [],
    }),
    /ghost9/,
  );
});

test('an empty author, source, or license throws and uploads nothing', async () => {
  for (const field of CREDIT_FIELDS) {
    const h = harness({ [CACHE_1]: 'alpha' });
    const over: Partial<Candidate> = { [field]: '   ' };
    await assert.rejects(
      () => publishApproved({
        deps: h.deps,
        candidates: [cand(over)],
        verdicts: [verd({})],
        rows: [],
      }),
      new Error(`candidate c1 has an empty ${field}`),
    );
    assert.deepEqual(h.storage.puts, []);
  }
});

test('an approved verdict with a null channel throws and uploads nothing', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  await assert.rejects(
    () => publishApproved({
      deps: h.deps,
      candidates: [cand({})],
      verdicts: [verd({ channel: null })],
      rows: [],
    }),
    new Error('candidate c1 has no channel'),
  );
  assert.deepEqual(h.storage.puts, []);
});

test('a retired row for the hash blocks the upload and adds no row', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  const first = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const hash = first.rows[0].hash;
  const retired = retireRows(first.rows, hash, 'takedown request', '2026-09-23').rows;
  // images retire removed the object. The approved verdict is still in the run.
  await h.storage.remove(objectKey(hash));

  const second = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: retired,
  });

  assert.equal(h.storage.objects.has(objectKey(hash)), false);
  assert.equal(h.storage.puts.length, 1);
  assert.deepEqual(second.uploaded, []);
  assert.deepEqual(second.skipped, [objectKey(hash)]);
  assert.deepEqual(second.rows, retired);
});

test('retireRows marks the row, keeps the object, and leaves the input alone', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  const published = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const hash = published.rows[0].hash;
  const result = retireRows(
    published.rows,
    hash,
    'takedown request from the photographer',
    '2026-09-23',
  );
  assert.equal(result.retired, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].hash, hash);
  assert.equal(result.rows[0].retired, true);
  assert.equal(result.rows[0].retired_reason, 'takedown request from the photographer');
  assert.equal(result.rows[0].retired_at, '2026-09-23');
  assert.equal(published.rows[0].retired, undefined);
  assert.equal(h.storage.objects.has(objectKey(hash)), true);
});

test('two rows that share a hash both retire in one call', async () => {
  const h = harness({ [CACHE_1]: 'alpha', [CACHE_2]: 'alpha' });
  const published = await publishApproved({
    deps: h.deps,
    candidates: [cand({}), cand({ id: 'c2', target: 'PIPO', local: CACHE_2 })],
    verdicts: [verd({}), verd({ candidate_id: 'c2' })],
    rows: [],
  });
  const result = retireRows(published.rows, published.rows[0].hash, 'takedown', '2026-09-23');
  assert.equal(result.retired, 2);
  assert.deepEqual(result.rows.map((r) => r.retired), [true, true]);
});

test('retireRows on a hash no row carries returns 0 and changes no row', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  const published = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const absent = '0'.repeat(64);
  const result = retireRows(published.rows, absent, 'takedown', '2026-09-23');
  assert.equal(result.retired, 0);
  assert.deepEqual(result.rows, published.rows);
  assert.equal(h.storage.objects.has(objectKey(published.rows[0].hash)), true);
});

test('reviewKey builds the review prefix', () => {
  assert.equal(reviewKey('abc'), 'review/abc.jpg');
});

test('memoryStorage head follows put and remove, and puts records the content type', async () => {
  const storage = memoryStorage();
  assert.equal(await storage.head('img/x.jpg'), false);
  await storage.put('img/x.jpg', encode('x'), 'image/jpeg');
  assert.equal(await storage.head('img/x.jpg'), true);
  assert.deepEqual(storage.puts, [{ key: 'img/x.jpg', contentType: 'image/jpeg' }]);
  await storage.remove('img/x.jpg');
  assert.equal(await storage.head('img/x.jpg'), false);
});

function plainRow(hash: string, target: string): ManifestRow {
  return {
    hash,
    target,
    channel: 'leaf',
    source: 'x',
    author: 'x',
    license: 'x',
    origin: 'x',
    tags: [],
    checked_by: 'x',
    checked_at: '2026-09-25',
    note: '',
  };
}

test('setDifficulty marks every row with the hash and leaves the input alone', () => {
  const hash = 'e'.repeat(64);
  const rows = [plainRow(hash, 'QUGA'), plainRow(hash, 'leaf/simple_lobed'), plainRow('f'.repeat(64), 'QUGA')];
  const result = setDifficulty(rows, hash, 'hard');
  assert.equal(result.matched, 2);
  assert.equal(result.changed, 2);
  assert.equal(result.rows[0].difficulty, 'hard');
  assert.equal(result.rows[1].difficulty, 'hard');
  assert.equal(result.rows[2].difficulty, undefined);
  assert.equal(rows[0].difficulty, undefined);
  assert.equal(setDifficulty(result.rows, hash, 'hard').changed, 0);
});

test('setDifficulty with null takes the field off', () => {
  const hash = 'e'.repeat(64);
  const marked = setDifficulty([plainRow(hash, 'QUGA')], hash, 'hard').rows;
  const result = setDifficulty(marked, hash, null);
  assert.equal(result.changed, 1);
  assert.equal('difficulty' in result.rows[0], false);
  assert.equal(setDifficulty([plainRow(hash, 'QUGA')], 'a'.repeat(64), null).matched, 0);
});

test('shownRows keeps the rows of one target the app shows', () => {
  const rows = [
    plainRow('a'.repeat(64), 'QUGA'),
    { ...plainRow('b'.repeat(64), 'QUGA'), difficulty: 'hard' as const },
    { ...plainRow('c'.repeat(64), 'QUGA'), retired: true },
    plainRow('d'.repeat(64), 'QURU'),
  ];
  assert.deepEqual(shownRows(rows, 'QUGA').map((row) => row.hash), ['a'.repeat(64)]);
  assert.deepEqual(shownRows(rows, 'QUAL'), []);
});
