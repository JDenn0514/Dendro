import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  CHANNELS,
  HINT_KEYWORDS,
  LICENSE_ALLOWLIST,
  SOURCE_KEYS,
  SOURCE_NAMES,
  candidateId,
  channelHint,
  licenseAllowed,
  makeCandidate,
} from '../lib/candidates.ts';

const COMMONS_ORIGIN = 'https://commons.wikimedia.org/wiki/File:Quercus_alba_bark.jpg';
const COMMONS_FILE = 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Quercus_alba_bark.jpg';
const INAT_ORIGIN = 'https://www.inaturalist.org/observations/12345#photo=678';
const INAT_FILE = 'https://static.inaturalist.org/photos/678/original.jpg';

test('CHANNELS lists the five channels and every hint channel is one of them', () => {
  assert.deepEqual(CHANNELS, ['leaf', 'bark', 'fruit', 'flower', 'twig']);
  for (const channel of Object.values(HINT_KEYWORDS)) {
    assert.ok(CHANNELS.includes(channel), `${channel} must be a channel`);
  }
});

test('SOURCE_NAMES holds one display name per source key, and manual has none', () => {
  assert.deepEqual(Object.keys(SOURCE_NAMES), [...SOURCE_KEYS]);
  // A manual row carries the name the collector passes with --source.
  assert.equal(SOURCE_NAMES.manual, '');
  for (const key of SOURCE_KEYS) {
    if (key === 'manual') continue;
    assert.notEqual(SOURCE_NAMES[key].trim(), '', `${key} needs a display name`);
  }
});

test('SOURCE_KEYS holds the three new fetch sources with the manifest display names', () => {
  assert.deepEqual(
    [...SOURCE_KEYS],
    ['plants', 'inat', 'commons', 'bioimages', 'tso', 'wildflower', 'manual'],
  );
  assert.equal(SOURCE_NAMES.bioimages, 'Bioimages');
  assert.equal(SOURCE_NAMES.tso, 'Trees and Shrubs Online');
  assert.equal(SOURCE_NAMES.wildflower, 'Lady Bird Johnson Wildflower Center');
});

test('every LICENSE_ALLOWLIST label names a license licenseAllowed admits', () => {
  // The report prints the labels. licenseAllowed holds the machine rule. This ties them.
  const sample: Record<string, string> = {
    'public domain': 'Public domain',
    'US government work': 'United States Government Work',
    'CC0, any version': 'CC0 1.0',
    'CC BY, any version': 'CC BY 4.0',
    'CC BY-SA, any version': 'CC BY-SA 3.0',
  };
  assert.deepEqual(Object.keys(sample), LICENSE_ALLOWLIST);
  for (const [label, text] of Object.entries(sample)) {
    assert.equal(licenseAllowed(text), true, `${label} must be allowed`);
  }
});

test('licenseAllowed admits every allowed license whatever its version', () => {
  const allowed = [
    'Public domain',
    'public domain',
    'CC0 1.0',
    'CC0',
    'United States Government Work',
    'public domain (US government work)',
    'CC BY 2.0',
    'CC BY 4.0',
  ];
  for (const text of allowed) {
    assert.equal(licenseAllowed(text), true, `${text} must be allowed`);
  }
});

test('the cc by phrase already covers CC BY-SA, so the allowlist needs no sa phrase', () => {
  assert.equal(licenseAllowed('CC BY-SA 4.0'), true);
});

test('licenseAllowed admits the U.S. spelling of the government work license', () => {
  assert.equal(licenseAllowed('U.S. Government Work'), true);
  assert.equal(licenseAllowed('U. S. Government Work'), true);
  // The NC token still rejects the text, whichever spelling of U.S. it carries.
  assert.equal(licenseAllowed('U.S. Government Work, CC BY-NC'), false);
});

test('licenseAllowed rejects a license whose words carry an NC or ND token', () => {
  const rejected = [
    'CC BY-NC 4.0',
    'CC BY-NC-SA 4.0',
    'CC BY-NC-SA 2.0',
    'CC BY-ND 4.0',
    'CC BY-NC-ND 4.0',
    'Attribution-NonCommercial 4.0',
    'CC BY-NoDerivatives 4.0',
    'Attribution-NoDerivs 3.0',
    'CC BY-NonDerivative 4.0',
  ];
  for (const text of rejected) {
    assert.equal(licenseAllowed(text), false, `${text} must be rejected`);
  }
});

test('licenseAllowed rejects an unfree license and an empty text', () => {
  for (const text of ['All rights reserved', 'GFDL', '']) {
    assert.equal(licenseAllowed(text), false, `${text} must be rejected`);
  }
});

test('candidateId is the sha1 hex of the target and the origin url', () => {
  const expected = crypto.createHash('sha1').update(`QUGA|${INAT_ORIGIN}`).digest('hex');
  assert.equal(candidateId(INAT_ORIGIN, 'QUGA'), expected);
  assert.match(candidateId(INAT_ORIGIN, 'QUGA'), /^[0-9a-f]+$/);
});

test('one origin under two targets gives two ids', () => {
  // The same photo judged for a species and for a concept is two rows.
  const species = candidateId(INAT_ORIGIN, 'QUGA');
  const concept = candidateId(INAT_ORIGIN, 'leaf/lobed');
  assert.notEqual(species, concept);
});

test('one target and one origin give one id, whatever source found it', () => {
  // Two sources that name the same origin for the same target collapse to one row.
  assert.equal(candidateId(INAT_ORIGIN, 'QUGA'), candidateId(INAT_ORIGIN, 'QUGA'));
});

test('two different origin urls under one target give two different ids', () => {
  const one = candidateId('https://www.inaturalist.org/observations/12345#photo=1', 'QUGA');
  const two = candidateId('https://www.inaturalist.org/observations/12345#photo=2', 'QUGA');
  assert.notEqual(one, two);
});

test('HINT_KEYWORDS keeps its keys in match order', () => {
  // channelHint walks the keys in insertion order and the first hit wins, so the
  // order is behaviour. deepEqual on the object would not see it.
  assert.deepEqual(Object.keys(HINT_KEYWORDS), [
    'bark',
    'trunk',
    'leaf',
    'leaves',
    'foliage',
    'acorn',
    'fruit',
    'samara',
    'cone',
    'flower',
    'catkin',
    'bud',
    'twig',
  ]);
});

test('channelHint maps every keyword in HINT_KEYWORDS to its channel', () => {
  for (const [keyword, channel] of Object.entries(HINT_KEYWORDS)) {
    assert.equal(channelHint(keyword), channel, `${keyword} maps to ${channel}`);
  }
});

test('channelHint is case-insensitive and matches inside a longer word', () => {
  assert.equal(channelHint('Quercus alba bark.jpg'), 'bark');
  assert.equal(channelHint('BARK'), 'bark');
  assert.equal(channelHint('Staminate catkins in April'), 'flower');
  assert.equal(channelHint('Young leaves and buds'), 'leaf');
});

test('channelHint returns the first keyword in HINT_KEYWORDS order', () => {
  // 'bark' comes before 'leaves', so the bark hit wins whatever the word order in the text.
  assert.equal(channelHint('leaves and bark'), 'bark');
  assert.equal(channelHint('bark and leaves'), 'bark');
});

test('channelHint returns null for text with no keyword', () => {
  assert.equal(channelHint('Quercus alba habit.jpg'), null);
  assert.equal(channelHint('whole tree in a field'), null);
  assert.equal(channelHint(''), null);
});

test('makeCandidate fills the id from the origin and sets every default', () => {
  const candidate = makeCandidate({
    target: 'QUAL',
    source_key: 'commons',
    origin: COMMONS_ORIGIN,
    file_url: COMMONS_FILE,
  });
  assert.deepEqual(candidate, {
    id: candidateId(COMMONS_ORIGIN, 'QUAL'),
    target: 'QUAL',
    source_key: 'commons',
    source: 'Wikimedia Commons',
    origin: COMMONS_ORIGIN,
    file_url: COMMONS_FILE,
    author: '',
    license: '',
    license_url: null,
    source_species: null,
    channel_hint: null,
    tags_hint: [],
    identity_match: null,
    local: null,
    file_hash: null,
    fetched_at: '',
    fetch_error: null,
  });
});

test('makeCandidate takes the display name from the source key', () => {
  const plants = makeCandidate({
    target: 'QUAL',
    source_key: 'plants',
    origin: 'https://plants.usda.gov/plant-profile/QUAL#image=quercus_alba_bark.jpg',
    file_url: 'https://plants.sc.egov.usda.gov/ImageLibrary/quercus_alba_bark.jpg',
  });
  assert.equal(plants.source, 'USDA PLANTS Database');
  const inat = makeCandidate({
    target: 'QUGA',
    source_key: 'inat',
    origin: INAT_ORIGIN,
    file_url: INAT_FILE,
  });
  assert.equal(inat.source, 'iNaturalist');
});

test('makeCandidate keeps a source the caller passed', () => {
  const origin = 'https://www.fs.usda.gov/quercus-alba';
  const candidate = makeCandidate({
    target: 'QUAL',
    source_key: 'manual',
    source: 'US Forest Service',
    origin,
    file_url: 'https://www.fs.usda.gov/quercus-alba.jpg',
  });
  assert.equal(candidate.source, 'US Forest Service');
  // The id always comes from the target and the origin. No caller sets it.
  assert.equal(candidate.id, candidateId(origin, 'QUAL'));
});

test('makeCandidate keeps every field the caller passed', () => {
  const candidate = makeCandidate({
    target: 'QUGA',
    source_key: 'inat',
    origin: INAT_ORIGIN,
    file_url: INAT_FILE,
    author: '(c) Lyrae, some rights reserved (CC BY)',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    source_species: 'Quercus gambelii',
    channel_hint: 'fruit',
    tags_hint: ['fruiting'],
    identity_match: true,
    local: 'pipeline/cache/inat/abc.jpg',
    file_hash: 'deadbeef',
    fetched_at: '2026-09-22T15:04:00Z',
    fetch_error: 'timeout',
  });
  assert.equal(candidate.id, candidateId(INAT_ORIGIN, 'QUGA'));
  assert.equal(candidate.author, '(c) Lyrae, some rights reserved (CC BY)');
  assert.equal(candidate.license, 'CC BY 4.0');
  assert.equal(candidate.license_url, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(candidate.source_species, 'Quercus gambelii');
  assert.equal(candidate.channel_hint, 'fruit');
  assert.deepEqual(candidate.tags_hint, ['fruiting']);
  assert.equal(candidate.identity_match, true);
  assert.equal(candidate.local, 'pipeline/cache/inat/abc.jpg');
  assert.equal(candidate.file_hash, 'deadbeef');
  assert.equal(candidate.fetched_at, '2026-09-22T15:04:00Z');
  assert.equal(candidate.fetch_error, 'timeout');
});

test('makeCandidate copies tags_hint, so two rows from one pass never share one array', () => {
  const passTags = ['flowering'];
  const first = makeCandidate({
    target: 'QUGA',
    source_key: 'inat',
    origin: 'https://www.inaturalist.org/observations/1#photo=1',
    file_url: 'https://static.inaturalist.org/photos/1/original.jpg',
    tags_hint: passTags,
  });
  const second = makeCandidate({
    target: 'QUGA',
    source_key: 'inat',
    origin: 'https://www.inaturalist.org/observations/2#photo=2',
    file_url: 'https://static.inaturalist.org/photos/2/original.jpg',
    tags_hint: passTags,
  });

  first.tags_hint.push('extra');

  assert.deepEqual(first.tags_hint, ['flowering', 'extra']);
  assert.deepEqual(second.tags_hint, ['flowering']);
  assert.deepEqual(passTags, ['flowering']);
});
