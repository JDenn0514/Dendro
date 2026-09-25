import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { SOURCE_NAMES } from '../lib/candidates.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
import {
  TSO_LICENSE,
  TSO_LICENSE_URL,
  TSO_SITEMAP_URL,
  ownImages,
  parseSitemapPaths,
  parseTsoPage,
  tsoCandidates,
  tsoCredit,
  tsoPath,
  tsoRows,
} from '../lib/tso.ts';

const NOW = '2026-09-25T12:00:00Z';
const QUGA_URL = 'https://www.treesandshrubsonline.org/articles/quercus/quercus-gambelii/';
const PLHI_URL = 'https://www.treesandshrubsonline.org/articles/platanus/platanus-x-hispanica/';

function fixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/tso/${name}`, import.meta.url), 'utf8');
}

const SITEMAP = fixture('sitemap_sample.xml');
const QUGA_PAGE = fixture('quercus_gambelii.html');
const PLHI_PAGE = fixture('platanus_x_hispanica.html');

function fileNames(images: { href: string }[]): string[] {
  return images.map((image) => image.href.split('/').pop() ?? '');
}

/** An Http over a url-to-body map. A url with no body fails with a 404. */
function fakeHttp(routes: Map<string, string>): Http & { urls: string[] } {
  const urls: string[] = [];
  const failures: HttpFailure[] = [];
  return {
    failures,
    urls,
    async getText(url: string): Promise<TextResult> {
      urls.push(url);
      const body = routes.get(url);
      if (body === undefined) {
        failures.push({ url, status: 404, message: 'status 404', at: NOW });
        return { ok: false, status: 404, body: '', fromCache: false, error: 'status 404' };
      }
      return { ok: true, status: 200, body, fromCache: false, error: null };
    },
    async postJson(): Promise<TextResult> {
      throw new Error('tso never posts');
    },
    async getBytes(): Promise<BytesResult> {
      throw new Error('tso reads pages as text');
    },
  };
}

test('tsoPath builds the article path of a name', () => {
  assert.equal(tsoPath('Quercus gambelii'), '/articles/quercus/quercus-gambelii/');
  assert.equal(tsoPath('Platanus ×hispanica'), '/articles/platanus/platanus-x-hispanica/');
  assert.equal(tsoPath('Platanus × hispanica'), '/articles/platanus/platanus-x-hispanica/');
  assert.equal(tsoPath('Quercus utahensis (A. DC.) Rydb.'), '/articles/quercus/quercus-utahensis/');
  assert.equal(tsoPath('Quercus'), null);
  assert.equal(tsoPath(''), null);
});

test('parseSitemapPaths lists the paths on the TSO host', () => {
  const paths = parseSitemapPaths(SITEMAP);
  assert.equal(paths.size, 6);
  assert.ok(paths.has('/articles/quercus/quercus-gambelii/'));
  assert.ok(paths.has('/articles/platanus/platanus-x-hispanica/'));
  assert.ok(!paths.has('/articles/quercus/quercus-alba/'));
});

test('parseTsoPage reads the heading, the gallery, and the section ids', () => {
  const page = parseTsoPage(QUGA_PAGE);
  assert.equal(page.species, 'Quercus gambelii', 'the author span is not part of the name');
  assert.deepEqual(fileNames(page.images), [
    'quercus-gambelii-6.jpg',
    'quercus-gambelii-4.jpg',
    'quercus-gambelii-5.jpg',
    'quercus-gambelii-3.jpg',
    'quercus-gambelii-2.jpg',
  ]);
  assert.deepEqual(page.sectionIds, ['11114']);
});

test('parseTsoPage keeps one image for each href', () => {
  const card =
    '<a class="uk-inline" href="/site/assets/files/1/a.jpg" data-caption="<p>A. Image X Y.</p>"></a>';
  assert.equal(parseTsoPage(card + card).images.length, 1);
});

test('ownImages drops the images in the folder of an h3 section', () => {
  const page = parseTsoPage(PLHI_PAGE);
  assert.equal(page.species, 'Platanus × hispanica');
  assert.equal(page.images.length, 6);
  assert.deepEqual(page.sectionIds, ['33571', '32676']);
  assert.deepEqual(fileNames(ownImages(page)), [
    'platanus-x-hispanica-13.jpg',
    'platanus-x-hispanica-15.jpg',
    'platanus-x-hispanica-12.jpg',
    'platanus-x-hispanica-6.jpg',
  ]);
});

test('tsoCredit reads the name after the last "Image " and refuses rights text', () => {
  assert.equal(tsoCredit('New Mexico, August 2017. Image Charles Snyers.'), 'Charles Snyers');
  assert.equal(tsoCredit('Xian, China on 9 September 2011. Image Paul W. Meyer.'), 'Paul W. Meyer');
  assert.equal(tsoCredit('Eeklo, Belgium. Image © Jan De Langhe - Arboretum Wespelaar.'), null);
  assert.equal(
    tsoCredit('Reproduced by kind permission of the British Library. Image The British Library.'),
    null,
  );
  assert.equal(tsoCredit('A view (c) 2019. Image A. Person.'), null);
  assert.equal(tsoCredit("Foliage and fruit of the 'Acerifolia' at Kew. June 2025."), null);
});

test('tsoCandidates builds one CC BY-SA row for each credited image of the species', () => {
  const rows = tsoCandidates(parseTsoPage(QUGA_PAGE), QUGA_URL, 'QUGA', NOW);
  assert.deepEqual(
    rows.map((row) => row.origin),
    [6, 4, 5, 3, 2].map((n) => `${QUGA_URL}#image=quercus-gambelii-${n}.jpg`),
  );
  assert.equal(
    rows[0].file_url,
    'https://www.treesandshrubsonline.org/site/assets/files/7054/quercus-gambelii-6.jpg',
  );
  for (const row of rows) {
    assert.equal(row.target, 'QUGA');
    assert.equal(row.source_key, 'tso');
    assert.equal(row.source, SOURCE_NAMES.tso);
    assert.equal(row.author, 'Charles Snyers');
    assert.equal(row.license, TSO_LICENSE);
    assert.equal(row.license_url, TSO_LICENSE_URL);
    assert.equal(row.source_species, 'Quercus gambelii');
    assert.equal(row.fetched_at, NOW);
  }
});

test('tsoCandidates drops the © caption, the permission caption, and the cultivar images', () => {
  const rows = tsoCandidates(parseTsoPage(PLHI_PAGE), PLHI_URL, 'PLHI', NOW);
  assert.deepEqual(
    rows.map((row) => [row.origin, row.author]),
    [
      [`${PLHI_URL}#image=platanus-x-hispanica-13.jpg`, 'John Grimshaw'],
      [`${PLHI_URL}#image=platanus-x-hispanica-12.jpg`, 'Paul W. Meyer'],
    ],
  );
  assert.equal(rows[0].source_species, 'Platanus × hispanica');
});

test('tsoRows fetches a page only when the sitemap lists its path', async () => {
  const http = fakeHttp(new Map([[TSO_SITEMAP_URL, SITEMAP], [QUGA_URL, QUGA_PAGE]]));
  const rows = await tsoRows(http, ['Quercus gambelii', 'Quercus alba'], 'QUGA', NOW);
  assert.equal(rows.length, 5);
  assert.deepEqual(http.urls, [TSO_SITEMAP_URL, QUGA_URL], 'Quercus alba costs no request');
  assert.deepEqual(http.failures, []);
});

test('tsoRows asks for one path once when two names give it', async () => {
  const http = fakeHttp(new Map([[TSO_SITEMAP_URL, SITEMAP], [QUGA_URL, QUGA_PAGE]]));
  const rows = await tsoRows(http, ['Quercus gambelii', 'Quercus gambelii Nutt.'], 'QUGA', NOW);
  assert.equal(rows.length, 5);
  assert.deepEqual(http.urls, [TSO_SITEMAP_URL, QUGA_URL]);
});

test('tsoRows gives no rows when the heading names another species', async () => {
  const http = fakeHttp(new Map([[TSO_SITEMAP_URL, SITEMAP], [QUGA_URL, PLHI_PAGE]]));
  assert.deepEqual(await tsoRows(http, ['Quercus gambelii'], 'QUGA', NOW), []);
});

test('tsoRows gives no rows when the sitemap fetch fails', async () => {
  const http = fakeHttp(new Map());
  assert.deepEqual(await tsoRows(http, ['Quercus gambelii'], 'QUGA', NOW), []);
  assert.deepEqual(http.urls, [TSO_SITEMAP_URL]);
});
