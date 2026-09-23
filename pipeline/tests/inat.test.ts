import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PHENOLOGY_TERM_ID,
  FRUITING_VALUE_ID,
  PER_PAGE,
  inatPasses,
  taxaUrl,
  observationsUrl,
  phenologyProbeUrl,
  parseTaxon,
  photoUrlSize,
  licenseLabel,
  licenseUrlFor,
  parseObservations,
  inatCandidates,
  loadInatTerms,
} from '../lib/inat.ts';
import type { InatPhoto } from '../lib/inat.ts';
import { SOURCE_NAMES } from '../lib/candidates.ts';

const taxaFixture = new URL('./fixtures/inat_taxa_quga.json', import.meta.url);
const taxaEmptyFixture = new URL('./fixtures/inat_taxa_empty.json', import.meta.url);
const observationsFixture = new URL('./fixtures/inat_observations_quga.json', import.meta.url);
const unfilteredFixture = new URL(
  './fixtures/inat_observations_unfiltered.json',
  import.meta.url,
);
const errorFixture = new URL('./fixtures/inat_observations_error.json', import.meta.url);
const termsPath = fileURLToPath(new URL('./fixtures/inat_terms_sample.json', import.meta.url));

function readFixture(url: URL): unknown {
  return JSON.parse(fs.readFileSync(url, 'utf8'));
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-inat-'));
}

const NOW = '2026-09-22T15:04:00Z';
const TAXON_ID = 47851;
// One name for the flowering value, read from the committed data file.
const FLOWERING_VALUE_ID = loadInatTerms(termsPath).flowering_value_id;
// A value no pass hard-codes, so a test can prove where the argument lands.
const PROBE_VALUE_ID = 99;

test('parseTaxon reads the id and the name, and gives null on no result', () => {
  const taxon = parseTaxon(readFixture(taxaFixture));
  assert.equal(taxon?.id, TAXON_ID);
  assert.equal(taxon?.name, 'Quercus gambelii');
  assert.equal(parseTaxon(readFixture(taxaEmptyFixture)), null);
  assert.equal(parseTaxon('not an object'), null);
});

test('photoUrlSize swaps the size and keeps the extension', () => {
  const square = 'https://static.inaturalist.org/photos/999001/square.jpg';
  assert.equal(
    photoUrlSize(square, 'original'),
    'https://static.inaturalist.org/photos/999001/original.jpg',
  );
  assert.equal(
    photoUrlSize(square, 'medium'),
    'https://static.inaturalist.org/photos/999001/medium.jpg',
  );
  assert.equal(
    photoUrlSize(square, 'large'),
    'https://static.inaturalist.org/photos/999001/large.jpg',
  );
  const jpeg = 'https://static.inaturalist.org/photos/999004/square.jpeg';
  assert.equal(
    photoUrlSize(jpeg, 'original'),
    'https://static.inaturalist.org/photos/999004/original.jpeg',
  );
});

test('observationsUrl carries every parameter and the fruiting pass adds the phenology filter', () => {
  const fruiting = inatPasses(FLOWERING_VALUE_ID)[2];
  assert.equal(
    observationsUrl(TAXON_ID, 1, fruiting),
    'https://api.inaturalist.org/v1/observations' +
      '?taxon_id=47851&quality_grade=research&photo_license=cc0,cc-by,cc-by-sa' +
      `&photos=true&order_by=votes&per_page=${PER_PAGE}&page=1` +
      `&term_id=${PHENOLOGY_TERM_ID}&term_value_id=${FRUITING_VALUE_ID}`,
  );

  const url = observationsUrl(TAXON_ID, 3, fruiting);
  for (const part of [
    'taxon_id=47851',
    'quality_grade=research',
    'photo_license=cc0,cc-by,cc-by-sa',
    'photos=true',
    'order_by=votes',
    `per_page=${PER_PAGE}`,
    'page=3',
    `term_id=${PHENOLOGY_TERM_ID}`,
    `term_value_id=${FRUITING_VALUE_ID}`,
  ]) {
    assert.ok(url.includes(part), `missing ${part}`);
  }
});

test('the any pass adds no term_id', () => {
  const any = inatPasses(FLOWERING_VALUE_ID)[0];
  const url = observationsUrl(TAXON_ID, 1, any);
  assert.equal(url.includes('term_id'), false);
  assert.equal(url.includes('term_value_id'), false);
  assert.equal(
    url,
    'https://api.inaturalist.org/v1/observations' +
      '?taxon_id=47851&quality_grade=research&photo_license=cc0,cc-by,cc-by-sa' +
      `&photos=true&order_by=votes&per_page=${PER_PAGE}&page=1`,
  );
});

test('phenologyProbeUrl asks for phenology-annotated photos and names no value', () => {
  const url = phenologyProbeUrl(PER_PAGE);
  assert.equal(
    url,
    'https://api.inaturalist.org/v1/observations' +
      `?term_id=${PHENOLOGY_TERM_ID}&quality_grade=research&photos=true&per_page=${PER_PAGE}`,
  );
  // `cli data inat-terms` reads the value ids out of the answer, so it sends none.
  assert.equal(url.includes('term_value_id'), false);
  assert.ok(phenologyProbeUrl(1).endsWith('per_page=1'));
});

test('inatPasses returns the three passes with their hints and tags', () => {
  assert.deepEqual(inatPasses(FLOWERING_VALUE_ID), [
    { name: 'any', termValueId: null, channelHint: null, tagsHint: [] },
    {
      name: 'flowering',
      termValueId: FLOWERING_VALUE_ID,
      channelHint: 'flower',
      tagsHint: ['flowering'],
    },
    {
      name: 'fruiting',
      termValueId: FRUITING_VALUE_ID,
      channelHint: 'fruit',
      tagsHint: ['fruiting'],
    },
  ]);

  // The argument reaches the flowering pass and nothing else.
  const passes = inatPasses(PROBE_VALUE_ID);
  assert.equal(passes[1].termValueId, PROBE_VALUE_ID);
  assert.equal(passes[2].termValueId, FRUITING_VALUE_ID);
});

test('parseObservations flattens every photo of every observation', () => {
  const { photos, error } = parseObservations(readFixture(observationsFixture));
  assert.equal(error, null);
  assert.equal(photos.length, 4);
  assert.deepEqual(
    photos.map((photo) => photo.photo_id),
    [999001, 999002, 999003, 999004],
  );
  assert.deepEqual(
    photos.map((photo) => photo.observation_id),
    [121001, 121001, 121002, 121003],
  );
  assert.equal(photos[0].license_code, 'cc-by');
  assert.equal(photos[0].attribution, '(c) Lyrae, some rights reserved (CC BY)');
  assert.equal(photos[0].taxon_name, 'Quercus gambelii');
  assert.equal(photos[3].taxon_name, 'Quercus gambelii var. gambelii');
  assert.equal(photos[3].url, 'https://static.inaturalist.org/photos/999004/square.jpeg');
});

test('parseObservations reports an API error instead of an empty listing', () => {
  const failed = parseObservations(readFixture(errorFixture));
  assert.equal(failed.error, 'Internal Server Error');
  assert.deepEqual(failed.photos, []);

  // A body that is not an object is a failure too, not an empty page.
  assert.equal(parseObservations('<html>').error, 'the response body is not an object');

  // A real empty page stays an empty page, with no error.
  const empty = parseObservations({ total_results: 0, page: 1, per_page: PER_PAGE, results: [] });
  assert.deepEqual(empty, { photos: [], error: null });
});

test('the parser guards the license on its own, so a server that ignores the filter cannot slip a row through', () => {
  const { photos, error } = parseObservations(readFixture(unfilteredFixture));
  assert.equal(error, null);

  // parseObservations drops the photo with no license code.
  assert.deepEqual(
    photos.map((photo) => photo.photo_id),
    [999102, 999103],
  );

  // inatCandidates drops the CC BY-NC photo.
  const rows = inatCandidates(photos, 'QUGA', inatPasses(FLOWERING_VALUE_ID)[0], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].license, 'CC BY 4.0');
  assert.equal(
    rows.some((row) => row.license.includes('NC')),
    false,
  );
});

test('inatCandidates gives each photo of an observation its own id', () => {
  const { photos } = parseObservations(readFixture(observationsFixture));
  const rows = inatCandidates(photos, 'QUGA', inatPasses(FLOWERING_VALUE_ID)[0], NOW);

  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.license),
    ['CC BY 4.0', 'CC BY 4.0', 'CC BY-SA 4.0', 'CC0 1.0'],
  );

  // The origin carries the photo id, so two photos of one observation are two rows.
  assert.equal(rows[0].origin, 'https://www.inaturalist.org/observations/121001#photo=999001');
  assert.equal(rows[1].origin, 'https://www.inaturalist.org/observations/121001#photo=999002');
  assert.notEqual(rows[0].id, rows[1].id);
  assert.notEqual(rows[0].file_url, rows[1].file_url);
});

test('a candidate points at the observation photo and the original photo size', () => {
  const { photos } = parseObservations(readFixture(observationsFixture));
  const fruiting = inatPasses(FLOWERING_VALUE_ID)[2];
  const row = inatCandidates(photos, 'QUGA', fruiting, NOW)[3];

  assert.equal(row.source_key, 'inat');
  assert.equal(row.source, SOURCE_NAMES.inat);
  assert.equal(row.source, 'iNaturalist');
  assert.equal(row.target, 'QUGA');
  assert.equal(row.origin, 'https://www.inaturalist.org/observations/121003#photo=999004');
  assert.equal(row.file_url, 'https://static.inaturalist.org/photos/999004/original.jpeg');
  assert.equal(row.author, 'Marta Olsen, no rights reserved (CC0)');
  assert.equal(row.license, 'CC0 1.0');
  assert.equal(row.license_url, 'https://creativecommons.org/publicdomain/zero/1.0/');
  assert.equal(row.source_species, 'Quercus gambelii var. gambelii');
  assert.equal(row.channel_hint, 'fruit');
  assert.deepEqual(row.tags_hint, ['fruiting']);
  assert.equal(row.fetched_at, NOW);
  assert.equal(row.local, null);
  assert.equal(row.file_hash, null);
  assert.equal(row.identity_match, null);
  assert.equal(row.fetch_error, null);
});

test('inatCandidates excludes a photo with an empty attribution', () => {
  const photos: InatPhoto[] = [
    {
      observation_id: 7,
      photo_id: 8,
      url: 'https://static.inaturalist.org/photos/8/square.jpg',
      license_code: 'cc0',
      attribution: '   ',
      taxon_name: 'Quercus gambelii',
    },
    {
      observation_id: 7,
      photo_id: 9,
      url: 'https://static.inaturalist.org/photos/9/square.jpg',
      license_code: 'cc0',
      attribution: 'Marta Olsen, no rights reserved (CC0)',
      taxon_name: 'Quercus gambelii',
    },
  ];
  // The app prints author, source, and license verbatim, so a row with no author is
  // no use to the pipeline.
  const rows = inatCandidates(photos, 'QUGA', inatPasses(FLOWERING_VALUE_ID)[0], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].author, 'Marta Olsen, no rights reserved (CC0)');
});

test('licenseLabel and licenseUrlFor map every code and give a trailing slash', () => {
  assert.equal(licenseLabel('cc0'), 'CC0 1.0');
  assert.equal(licenseLabel('cc-by'), 'CC BY 4.0');
  assert.equal(licenseLabel('cc-by-sa'), 'CC BY-SA 4.0');
  assert.equal(licenseLabel('cc-by-nc'), 'CC BY-NC 4.0');
  assert.equal(licenseLabel('cc-by-nc-sa'), 'CC BY-NC-SA 4.0');
  assert.equal(licenseLabel('cc-by-nd'), 'CC BY-ND 4.0');
  assert.equal(licenseLabel('cc-by-nc-nd'), 'CC BY-NC-ND 4.0');
  assert.equal(licenseLabel('gfdl'), 'All rights reserved');

  assert.equal(licenseUrlFor('cc0'), 'https://creativecommons.org/publicdomain/zero/1.0/');
  assert.equal(licenseUrlFor('cc-by'), 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(licenseUrlFor('cc-by-sa'), 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(licenseUrlFor('cc-by-nc'), 'https://creativecommons.org/licenses/by-nc/4.0/');
  assert.equal(
    licenseUrlFor('cc-by-nc-sa'),
    'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  );
  assert.equal(licenseUrlFor('cc-by-nd'), 'https://creativecommons.org/licenses/by-nd/4.0/');
  assert.equal(
    licenseUrlFor('cc-by-nc-nd'),
    'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  );
  assert.equal(licenseUrlFor('gfdl'), null);
});

test('loadInatTerms reads the flowering value and reports an absent file', () => {
  assert.deepEqual(loadInatTerms(termsPath), { flowering_value_id: 13 });
  assert.throws(
    () => loadInatTerms(path.join(tempDir(), 'no_such_terms.json')),
    /data inat-terms/,
  );
});

test('loadInatTerms reports a file with no flowering_value_id', () => {
  const file = path.join(tempDir(), 'inat_terms.json');
  fs.writeFileSync(file, JSON.stringify({ note: 'nobody filled this in' }));
  assert.throws(() => loadInatTerms(file), /flowering_value_id/);

  const wrongType = path.join(tempDir(), 'inat_terms.json');
  fs.writeFileSync(wrongType, JSON.stringify({ flowering_value_id: '13' }));
  assert.throws(() => loadInatTerms(wrongType), /flowering_value_id/);
});

test('taxaUrl url-encodes the space in a scientific name', () => {
  assert.equal(
    taxaUrl('Quercus gambelii'),
    'https://api.inaturalist.org/v1/taxa?q=Quercus%20gambelii&rank=species&per_page=1',
  );
});

test('a pass writes its channel hint and tags onto every row', () => {
  const photos: InatPhoto[] = [
    {
      observation_id: 5,
      photo_id: 6,
      url: 'https://static.inaturalist.org/photos/6/square.jpg',
      license_code: 'cc-by-sa',
      attribution: '(c) Pat Ruiz, some rights reserved (CC BY-SA)',
      taxon_name: 'Quercus gambelii',
    },
  ];
  const rows = inatCandidates(photos, 'bark/plated', inatPasses(FLOWERING_VALUE_ID)[1], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].target, 'bark/plated');
  assert.equal(rows[0].license, 'CC BY-SA 4.0');
  assert.equal(rows[0].channel_hint, 'flower');
  assert.deepEqual(rows[0].tags_hint, ['flowering']);
});
