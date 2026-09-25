import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  BIOIMAGES_CATALOGUE_URL,
  BIOIMAGES_LICENSES,
  bioimagesAuthor,
  bioimagesCandidates,
  bioimagesName,
  bioimagesRows,
  normalizeBioimagesName,
  parseBioimagesCatalogue,
  type BioimagesRow,
} from '../lib/bioimages.ts';
import { SOURCE_NAMES, licenseAllowed } from '../lib/candidates.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';

const NOW = '2026-09-25T12:00:00Z';
const CATALOGUE = fs.readFileSync(
  new URL('./fixtures/bioimages/images_sample.csv', import.meta.url),
  'utf8',
);
const BASKAUF = 'http://bioimages.vanderbilt.edu/baskauf';

function catalogue(): BioimagesRow[] {
  return parseBioimagesCatalogue(CATALOGUE);
}

function rowNamed(fileName: string): BioimagesRow {
  const row = catalogue().find((one) => one.fileName === fileName);
  assert.ok(row !== undefined, `the fixture holds ${fileName}`);
  return row;
}

/** An Http that answers the catalogue url with `body`, or fails when `body` is null. */
function fakeHttp(body: string | null): Http & { urls: string[] } {
  const urls: string[] = [];
  const failures: HttpFailure[] = [];
  return {
    failures,
    urls,
    async getText(url: string): Promise<TextResult> {
      urls.push(url);
      if (body === null) {
        failures.push({ url, status: 500, message: 'status 500', at: NOW });
        return { ok: false, status: 500, body: '', fromCache: false, error: 'status 500' };
      }
      return { ok: true, status: 200, body, fromCache: false, error: null };
    },
    async postJson(): Promise<TextResult> {
      throw new Error('bioimages never posts');
    },
    async getBytes(): Promise<BytesResult> {
      throw new Error('bioimages reads no bytes');
    },
  };
}

test('BIOIMAGES_CATALOGUE_URL names the catalogue in the Bioimages repository', () => {
  assert.equal(
    BIOIMAGES_CATALOGUE_URL,
    'https://raw.githubusercontent.com/baskaufs/Bioimages/master/images.csv',
  );
});

test('parseBioimagesCatalogue reads each row by header name', () => {
  const rows = catalogue();
  assert.equal(rows.length, 6);
  const fruit = rowNamed('qugag-fr14133.jpg');
  assert.equal(Object.keys(fruit).length, 40);
  assert.equal(fruit.dcterms_title, 'Quercus gambelii (Fagaceae) - fruit - as borne on the plant');
  assert.equal(fruit.usageTermsIndex, '1');
  assert.equal(fruit.suppress, '');
  assert.equal(fruit.ac_attributionLinkURL, `${BASKAUF}/14133.htm`);
  assert.equal(
    fruit.ac_hasServiceAccessPoint,
    'https://zenodo.org/records/11021527/files/qugag-fr14133.jpg',
  );
});

test('bioimagesName takes the title text before the first " ("', () => {
  assert.equal(
    bioimagesName('Quercus gambelii (Fagaceae) - fruit - as borne on the plant'),
    'Quercus gambelii',
  );
  assert.equal(
    bioimagesName('Berlandiera x betonicifolia  (Asteraceae) - whole plant'),
    'Berlandiera x betonicifolia',
  );
  assert.equal(bioimagesName('Quercus alba'), 'Quercus alba');
});

test('normalizeBioimagesName writes one form for one name', () => {
  assert.equal(normalizeBioimagesName('Platanus ×hispanica'), 'platanus x hispanica');
  assert.equal(normalizeBioimagesName('Platanus × hispanica'), 'platanus x hispanica');
  assert.equal(normalizeBioimagesName('  Quercus   Gambelii '), 'quercus gambelii');
  assert.equal(normalizeBioimagesName('José'), 'josé', 'NFC composes the accent');
});

test('bioimagesAuthor reads the credit before its url, then the rights owner', () => {
  assert.equal(
    bioimagesAuthor({ photoshop_Credit: 'Steven J. Baskauf http://bioimages.vanderbilt.edu/', xmpRights_Owner: 'Other' }),
    'Steven J. Baskauf',
  );
  assert.equal(bioimagesAuthor({ photoshop_Credit: '', xmpRights_Owner: 'Darel Hess' }), 'Darel Hess');
  assert.equal(bioimagesAuthor({ photoshop_Credit: ' ', xmpRights_Owner: ' ' }), '');
});

test('BIOIMAGES_LICENSES maps the five codes, and the NC codes fail the allowlist', () => {
  const labels = Object.fromEntries(
    Object.entries(BIOIMAGES_LICENSES).map(([code, license]) => [code, license.label]),
  );
  assert.deepEqual(labels, {
    '0': 'CC0 1.0',
    '1': 'CC BY 4.0',
    '2': 'CC BY-SA 4.0',
    '3': 'CC BY-NC 4.0',
    '4': 'CC BY-NC-SA 4.0',
  });
  assert.deepEqual(
    Object.keys(BIOIMAGES_LICENSES).filter((code) => licenseAllowed(BIOIMAGES_LICENSES[code].label)),
    ['0', '1', '2'],
  );
  assert.equal(BIOIMAGES_LICENSES['1'].url, 'https://creativecommons.org/licenses/by/4.0/');
});

test('bioimagesCandidates builds the three Quercus gambelii rows', () => {
  const rows = bioimagesCandidates(catalogue(), ['Quercus gambelii'], 'QUGA', NOW);
  assert.deepEqual(
    rows.map((row) => row.origin),
    [`${BASKAUF}/14133.htm`, `${BASKAUF}/14140.htm`, `${BASKAUF}/14144.htm`],
  );
  assert.deepEqual(rows.map((row) => row.channel_hint), ['fruit', 'leaf', 'bark']);
  const first = rows[0];
  assert.equal(first.target, 'QUGA');
  assert.equal(first.source_key, 'bioimages');
  assert.equal(first.source, SOURCE_NAMES.bioimages);
  assert.equal(first.author, 'Steven J. Baskauf');
  assert.equal(first.license, 'CC BY 4.0');
  assert.equal(first.license_url, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(first.file_url, 'https://zenodo.org/records/11021527/files/qugag-fr14133.jpg');
  assert.equal(first.source_species, 'Quercus gambelii');
  assert.equal(first.fetched_at, NOW);
  assert.equal(first.identity_match, null);
  assert.deepEqual(first.tags_hint, []);
});

test('bioimagesCandidates compares names after it normalises both', () => {
  assert.equal(bioimagesCandidates(catalogue(), ['quercus  GAMBELII'], 'QUGA', NOW).length, 3);
  assert.deepEqual(
    bioimagesCandidates(catalogue(), ['Quercus gambelii Nutt.'], 'QUGA', NOW),
    [],
    'an author makes a different name',
  );
});

test('bioimagesCandidates drops the NC row and every suppressed row', () => {
  assert.equal(rowNamed('trco--fr040529-17e5384.jpg').usageTermsIndex, '4');
  assert.deepEqual(
    bioimagesCandidates(catalogue(), ['Tragia cordata'], 'TRCO', NOW),
    [],
    'CC BY-NC-SA 4.0 is not on the allowlist',
  );
  assert.equal(rowNamed('qubi--fr16299.jpg').suppress, '2');
  assert.deepEqual(bioimagesCandidates(catalogue(), ['Quercus bicolor'], 'QUBI', NOW), []);
  assert.equal(rowNamed('11652.jpg').suppress, '1');
  assert.deepEqual(
    bioimagesCandidates(catalogue(), ['Quercus falcata'], 'QUFA', NOW),
    [],
    'a suppressed CC0 row is skipped too',
  );
});

test('bioimagesCandidates keeps suppress 0 and skips a row with no file, author, or known code', () => {
  const base = rowNamed('qugag-fr14133.jpg');
  const count = (row: BioimagesRow): number =>
    bioimagesCandidates([row], ['Quercus gambelii'], 'QUGA', NOW).length;
  assert.equal(count({ ...base, suppress: '0' }), 1);
  assert.equal(count({ ...base, ac_hasServiceAccessPoint: '' }), 0);
  assert.equal(count({ ...base, photoshop_Credit: '', xmpRights_Owner: '' }), 0);
  assert.equal(count({ ...base, usageTermsIndex: '9' }), 0);
  assert.equal(count({ ...base, ac_attributionLinkURL: '' }), 0);
});

test('bioimagesRows reads the catalogue once for each Http', async () => {
  const http = fakeHttp(CATALOGUE);
  const quga = await bioimagesRows(http, ['Quercus gambelii'], 'QUGA', NOW);
  const other = await bioimagesRows(http, ['Tragia cordata'], 'TRCO', NOW);
  assert.equal(quga.length, 3);
  assert.equal(other.length, 0);
  assert.deepEqual(http.urls, [BIOIMAGES_CATALOGUE_URL], 'the second call reads no url');

  const second = fakeHttp(CATALOGUE);
  await bioimagesRows(second, ['Quercus gambelii'], 'QUGA', NOW);
  assert.deepEqual(second.urls, [BIOIMAGES_CATALOGUE_URL], 'a new Http reads the catalogue again');
});

test('bioimagesRows gives no rows when the catalogue fetch fails', async () => {
  const http = fakeHttp(null);
  assert.deepEqual(await bioimagesRows(http, ['Quercus gambelii'], 'QUGA', NOW), []);
  assert.equal(http.failures.length, 1);
});
