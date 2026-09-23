import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PER_SPECIES,
  CHANNEL_TARGET,
  makeCandidate,
  mergeFound,
  underCap,
  channelFull,
  collect,
} from '../lib/candidates.ts';
import type { Candidate } from '../lib/candidates.ts';

function row(fields: Partial<Candidate> & { origin: string }): Candidate {
  return makeCandidate({
    target: fields.target ?? 'QUGA',
    source_key: fields.source_key ?? 'inat',
    file_url: fields.file_url ?? `${fields.origin}/original.jpg`,
    ...fields,
  });
}

function manyRows(target: string, count: number): Candidate[] {
  const rows: Candidate[] = [];
  for (let i = 0; i < count; i += 1) {
    rows.push(row({ target, origin: `https://example.org/${target}/${i}` }));
  }
  return rows;
}

/** A full channel table, so only the null-hint rule can let a row through. */
function allFull(): Record<string, number> {
  return {
    leaf: CHANNEL_TARGET,
    bark: CHANNEL_TARGET,
    fruit: CHANNEL_TARGET,
    flower: CHANNEL_TARGET,
    twig: CHANNEL_TARGET,
  };
}

test('collect drops a row whose origin an existing row carries for the same target', () => {
  const existing = [row({ origin: 'https://www.inaturalist.org/observations/1#photo=11' })];
  const found = [
    row({ origin: 'https://www.inaturalist.org/observations/1#photo=11' }),
    row({ origin: 'https://www.inaturalist.org/observations/2#photo=22' }),
  ];
  const result = collect({ existing, found, target: 'QUGA', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://www.inaturalist.org/observations/2#photo=22'],
  );
  assert.deepEqual(result.skipped, [{ id: found[0].id, reason: 'duplicate' }]);
});

test('collect keeps one photo for a second target, on the same origin and file_hash', () => {
  const origin = 'https://commons.wikimedia.org/wiki/File:Needles.jpg';
  const existing = [
    row({ origin, target: 'PIED', source_key: 'commons', file_hash: 'aaa' }),
  ];
  const found = [
    row({ origin, target: 'leaf/needles', source_key: 'commons', file_hash: 'aaa', channel_hint: 'leaf' }),
  ];
  const result = collect({ existing, found, target: 'leaf/needles', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.target),
    ['leaf/needles'],
  );
  assert.deepEqual(result.skipped, []);
  assert.notEqual(found[0].id, existing[0].id);
});

test('collect drops a row whose file_hash an existing row carries for the same target, whatever the source', () => {
  const existing = [
    row({
      origin: 'https://commons.wikimedia.org/wiki/File:A.jpg',
      source_key: 'commons',
      file_hash: 'aaa',
    }),
  ];
  const found = [
    row({
      origin: 'https://www.inaturalist.org/observations/9#photo=91',
      source_key: 'inat',
      file_hash: 'aaa',
    }),
    row({
      origin: 'https://www.inaturalist.org/observations/10#photo=101',
      source_key: 'inat',
      file_hash: 'bbb',
    }),
  ];
  const result = collect({ existing, found, target: 'QUGA', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.file_hash),
    ['bbb'],
  );
  assert.deepEqual(result.skipped, [{ id: found[0].id, reason: 'duplicate' }]);
});

test('collect drops the second of two found rows that share an id', () => {
  const found = [
    row({ origin: 'https://example.org/a' }),
    row({ origin: 'https://example.org/a' }),
    row({ origin: 'https://example.org/b' }),
  ];
  const result = collect({ existing: [], found, target: 'QUGA', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://example.org/a', 'https://example.org/b'],
  );
  assert.deepEqual(
    result.skipped.map((entry) => entry.reason),
    ['duplicate'],
  );
});

test('collect keeps a row whose file_hash is null when an existing row also carries null', () => {
  const existing = [row({ origin: 'https://example.org/a', file_hash: null })];
  const found = [row({ origin: 'https://example.org/b', file_hash: null })];
  const result = collect({ existing, found, target: 'QUGA', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://example.org/b'],
  );
  assert.deepEqual(result.skipped, []);
});

test('underCap returns the room left for a target', () => {
  const existing = manyRows('QUGA', MAX_PER_SPECIES - 2);
  assert.equal(underCap(existing, 'QUGA'), 2);
  assert.equal(underCap(existing, 'QUAL'), MAX_PER_SPECIES);
});

test('underCap floors at 0 when the target is over the cap', () => {
  const existing = manyRows('QUGA', MAX_PER_SPECIES + 5);
  assert.equal(underCap(existing, 'QUGA'), 0);
});

test('channelFull is true once the channel holds CHANNEL_TARGET approved images', () => {
  assert.equal(channelFull({ bark: CHANNEL_TARGET }, 'bark'), true);
  assert.equal(channelFull({ bark: CHANNEL_TARGET + 1 }, 'bark'), true);
  assert.equal(channelFull({ bark: CHANNEL_TARGET - 1 }, 'bark'), false);
  assert.equal(channelFull({}, 'leaf'), false);
});

test('collect stops at the per-species cap', () => {
  const existing = manyRows('QUGA', MAX_PER_SPECIES - 2);
  const found = [
    row({ origin: 'https://example.org/new/1' }),
    row({ origin: 'https://example.org/new/2' }),
    row({ origin: 'https://example.org/new/3' }),
    row({ origin: 'https://example.org/new/4' }),
    row({ origin: 'https://example.org/new/5' }),
  ];
  const result = collect({ existing, found, target: 'QUGA', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://example.org/new/1', 'https://example.org/new/2'],
  );
  assert.deepEqual(
    result.skipped.map((entry) => entry.reason),
    ['cap', 'cap', 'cap'],
  );
});

test('collect skips a hinted row whose channel is full and keeps one that is not', () => {
  const found = [
    row({ origin: 'https://example.org/bark/1', channel_hint: 'bark' }),
    row({ origin: 'https://example.org/leaf/1', channel_hint: 'leaf' }),
  ];
  const result = collect({
    existing: [],
    found,
    target: 'QUGA',
    approvedByChannel: { bark: CHANNEL_TARGET, leaf: CHANNEL_TARGET - 5 },
  });
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://example.org/leaf/1'],
  );
  assert.deepEqual(result.skipped, [{ id: found[0].id, reason: 'channel_full' }]);
});

test('collect adds a row with a null hint even when every channel is full', () => {
  const found = [row({ origin: 'https://example.org/unknown/1', channel_hint: null })];
  const result = collect({
    existing: [],
    found,
    target: 'QUGA',
    approvedByChannel: allFull(),
  });
  assert.equal(result.added.length, 1);
  assert.deepEqual(result.skipped, []);
});

test('collect reports one skipped entry per skipped row, in walk order', () => {
  const existing = [row({ origin: 'https://example.org/old/1' })];
  const found = [
    row({ origin: 'https://example.org/old/1' }),
    row({ origin: 'https://example.org/bark/1', channel_hint: 'bark' }),
    row({ origin: 'https://example.org/leaf/1', channel_hint: 'leaf' }),
  ];
  const result = collect({
    existing,
    found,
    target: 'QUGA',
    approvedByChannel: { bark: CHANNEL_TARGET },
  });
  assert.deepEqual(
    result.skipped.map((entry) => entry.reason),
    ['duplicate', 'channel_full'],
  );
  assert.equal(result.skipped[0].id, found[0].id);
  assert.equal(result.skipped[1].id, found[1].id);
  assert.equal(result.added.length + result.skipped.length, found.length);
});

test('collect does not change the arrays it is given', () => {
  const existing = [row({ origin: 'https://example.org/old/1' })];
  const found = [
    row({ origin: 'https://example.org/old/1' }),
    row({ origin: 'https://example.org/new/1', channel_hint: 'bark' }),
  ];
  const existingBefore = structuredClone(existing);
  const foundBefore = structuredClone(found);
  collect({ existing, found, target: 'QUGA', approvedByChannel: { bark: CHANNEL_TARGET } });
  assert.deepEqual(existing, existingBefore);
  assert.deepEqual(found, foundBefore);
});

test('mergeFound unions tags_hint in first-seen order for rows that share an id', () => {
  const origin = 'https://www.inaturalist.org/observations/7#photo=71';
  const found = [
    row({ origin, tags_hint: ['fall_color', 'winter'] }),
    row({ origin, tags_hint: ['winter', 'fruit_present'] }),
  ];
  const merged = mergeFound(found);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].tags_hint, ['fall_color', 'winter', 'fruit_present']);
});

test('mergeFound takes the first channel_hint that is not null', () => {
  const origin = 'https://www.inaturalist.org/observations/8#photo=81';
  const first = mergeFound([
    row({ origin, channel_hint: null }),
    row({ origin, channel_hint: 'fruit' }),
    row({ origin, channel_hint: 'leaf' }),
  ]);
  assert.equal(first[0].channel_hint, 'fruit');

  const already = mergeFound([
    row({ origin, channel_hint: 'leaf' }),
    row({ origin, channel_hint: 'fruit' }),
  ]);
  assert.equal(already[0].channel_hint, 'leaf');
});

test('mergeFound keeps the input order, keeps a unique row, and changes no input row', () => {
  const found = [
    row({ origin: 'https://example.org/a', tags_hint: ['winter'] }),
    row({ origin: 'https://example.org/b', tags_hint: [] }),
    row({ origin: 'https://example.org/a', tags_hint: ['fall_color'] }),
  ];
  const before = structuredClone(found);
  const merged = mergeFound(found);
  assert.deepEqual(
    merged.map((candidate) => candidate.origin),
    ['https://example.org/a', 'https://example.org/b'],
  );
  assert.deepEqual(merged[1], found[1]);
  assert.deepEqual(found, before);
});
