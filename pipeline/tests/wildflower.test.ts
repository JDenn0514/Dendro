import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { SOURCE_NAMES } from '../lib/candidates.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
import { licenseAllowedAt } from '../lib/licenses.ts';
import {
  WILDFLOWER_LICENSE,
  WILDFLOWER_MAX_IMAGES,
  decodeWindows1252,
  parseWildflowerGallery,
  parseWildflowerImage,
  photographerName,
  wildflowerCandidate,
  wildflowerGalleryUrl,
  wildflowerImageUrl,
  wildflowerRows,
} from '../lib/wildflower.ts';

const NOW = '2026-09-25T12:00:00Z';
const QUGA_IDS = ['3424', '24045', '66070', '121699'];

function bytes(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(new URL(`./fixtures/wildflower/${name}`, import.meta.url)));
}

function page(name: string): string {
  return decodeWindows1252(bytes(name));
}

/**
 * An Http over a url-to-bytes map. `fallback` answers any other image page url. Every other
 * url fails with a 404. A text request is a bug, because getText decodes UTF-8.
 */
function fakeHttp(
  routes: Map<string, Uint8Array>,
  fallback: Uint8Array | null = null,
): Http & { urls: string[] } {
  const urls: string[] = [];
  const failures: HttpFailure[] = [];
  return {
    failures,
    urls,
    async getText(): Promise<TextResult> {
      throw new Error('wildflower reads pages as bytes');
    },
    async postJson(): Promise<TextResult> {
      throw new Error('wildflower never posts');
    },
    async getBytes(url: string): Promise<BytesResult> {
      urls.push(url);
      const found = routes.get(url) ?? (url.includes('/gallery/result.php?') ? fallback : null);
      if (found === null || found === undefined) {
        failures.push({ url, status: 404, message: 'status 404', at: NOW });
        return { ok: false, status: 404, bytes: null, fromCache: false, error: 'status 404' };
      }
      return { ok: true, status: 200, bytes: found, fromCache: false, error: null };
    },
  };
}

test('the urls use the PLANTS symbol and the image id', () => {
  assert.equal(
    wildflowerGalleryUrl('QUGA'),
    'https://www.wildflower.org/gallery/species.php?id_plant=QUGA',
  );
  assert.equal(
    wildflowerImageUrl('66070'),
    'https://www.wildflower.org/gallery/result.php?id_image=66070',
  );
});

test('decodeWindows1252 reads the bytes that UTF-8 breaks', () => {
  const raw = bytes('image_66070.html');
  assert.ok(decodeWindows1252(raw).includes('38°52'));
  assert.ok(
    !new TextDecoder('utf-8').decode(raw).includes('38°52'),
    'UTF-8 turns the 0xB0 byte into U+FFFD',
  );
});

test('parseWildflowerGallery lists the image ids in list order', () => {
  assert.deepEqual(parseWildflowerGallery(page('quga_gallery.html')), {
    ids: QUGA_IDS,
    empty: false,
  });
});

test('parseWildflowerGallery marks the no-image page', () => {
  assert.deepEqual(parseWildflowerGallery(page('plhi_gallery.html')), { ids: [], empty: true });
});

test('parseWildflowerImage reads the Image Information fields', () => {
  assert.deepEqual(parseWildflowerImage(page('image_66070.html')), {
    species: 'Quercus gambelii',
    photographer: 'Reveal, James L.',
    restrictions: 'Unrestricted',
    shot: 'Close-up of stem bearing leaves and a mature glans (acorn).',
    fileUrl: 'https://www.wildflower.org/image_archive/640x480/JLR/JLR_IMG8981.JPG',
  });
});

test('photographerName turns "Last, First" into "First Last"', () => {
  assert.equal(photographerName('Reveal, James L.'), 'James L. Reveal');
  assert.equal(photographerName('Wasowski, Sally and Andy'), 'Sally and Andy Wasowski');
  assert.equal(photographerName('Wildflower Center Staff'), 'Wildflower Center Staff');
});

test('wildflowerCandidate builds a row whose credit names the photographer and the Center', () => {
  const origin = wildflowerImageUrl('66070');
  const row = wildflowerCandidate(parseWildflowerImage(page('image_66070.html')), origin, 'QUGA', NOW);
  assert.ok(row !== null);
  assert.equal(row.target, 'QUGA');
  assert.equal(row.source_key, 'wildflower');
  assert.equal(row.source, SOURCE_NAMES.wildflower);
  assert.equal(row.origin, origin);
  assert.equal(row.file_url, 'https://www.wildflower.org/image_archive/640x480/JLR/JLR_IMG8981.JPG');
  assert.equal(row.author, 'James L. Reveal');
  assert.equal(row.license, WILDFLOWER_LICENSE);
  assert.equal(row.license_url, null);
  assert.equal(row.source_species, 'Quercus gambelii');
  assert.equal(row.channel_hint, 'leaf');
  assert.equal(row.fetched_at, NOW);
  // The app prints `<author>, <source>, <license>.` under the photo.
  assert.equal(
    `${row.author}, ${row.source}, ${row.license}.`,
    'James L. Reveal, Lady Bird Johnson Wildflower Center, used with permission, non-commercial.',
  );
  assert.equal(licenseAllowedAt(row.license, row.origin), true);
});

test('wildflowerCandidate skips a restricted image, a missing field, and another host', () => {
  const image = parseWildflowerImage(page('image_66070.html'));
  const origin = wildflowerImageUrl('66070');
  // Every saved page is Unrestricted, so each case changes one field of a parsed copy.
  assert.equal(wildflowerCandidate({ ...image, restrictions: 'Restricted' }, origin, 'QUGA', NOW), null);
  assert.equal(wildflowerCandidate({ ...image, restrictions: null }, origin, 'QUGA', NOW), null);
  assert.equal(wildflowerCandidate({ ...image, photographer: null }, origin, 'QUGA', NOW), null);
  assert.equal(wildflowerCandidate({ ...image, photographer: '  ' }, origin, 'QUGA', NOW), null);
  assert.equal(wildflowerCandidate({ ...image, fileUrl: null }, origin, 'QUGA', NOW), null);
  assert.equal(
    wildflowerCandidate(image, 'https://example.org/gallery/result.php?id_image=66070', 'QUGA', NOW),
    null,
    'the permission covers www.wildflower.org only',
  );
});

test('wildflowerRows reads the gallery and each image page as bytes', async () => {
  const routes = new Map<string, Uint8Array>([
    [wildflowerGalleryUrl('QUGA'), bytes('quga_gallery.html')],
  ]);
  for (const id of QUGA_IDS) routes.set(wildflowerImageUrl(id), bytes(`image_${id}.html`));
  const http = fakeHttp(routes);

  const rows = await wildflowerRows(http, 'QUGA', 'QUGA', NOW);

  assert.deepEqual(rows.map((row) => row.author), [
    'Norman G. Flaigg',
    'Sally and Andy Wasowski',
    'James L. Reveal',
    'Gene Sturla',
  ]);
  assert.deepEqual(rows.map((row) => row.origin), QUGA_IDS.map(wildflowerImageUrl));
  assert.deepEqual(http.urls, [wildflowerGalleryUrl('QUGA'), ...QUGA_IDS.map(wildflowerImageUrl)]);
  assert.deepEqual(http.failures, []);
});

test('wildflowerRows asks for no image page when the plant has no image', async () => {
  const http = fakeHttp(new Map([[wildflowerGalleryUrl('PLHI'), bytes('plhi_gallery.html')]]));
  assert.deepEqual(await wildflowerRows(http, 'PLHI', 'PLHI', NOW), []);
  assert.deepEqual(http.urls, [wildflowerGalleryUrl('PLHI')]);
});

test('wildflowerRows reads WILDFLOWER_MAX_IMAGES image pages at most, in list order', async () => {
  assert.equal(WILDFLOWER_MAX_IMAGES, 20);
  const ids = Array.from({ length: WILDFLOWER_MAX_IMAGES + 5 }, (_, index) => String(900000 + index));
  const links = ids.map((id) => `<a href="../gallery/result.php?id_image=${id}"></a>`).join('\n');
  const gallery = new TextEncoder().encode(`<div id="fullpage_content">\n${links}\n</div>`);
  const http = fakeHttp(new Map([[wildflowerGalleryUrl('QUGA'), gallery]]), bytes('image_66070.html'));

  const rows = await wildflowerRows(http, 'QUGA', 'QUGA', NOW);

  assert.equal(rows.length, WILDFLOWER_MAX_IMAGES);
  assert.deepEqual(
    http.urls,
    [wildflowerGalleryUrl('QUGA'), ...ids.slice(0, WILDFLOWER_MAX_IMAGES).map(wildflowerImageUrl)],
  );
});

test('wildflowerRows gives no rows when the gallery fetch fails', async () => {
  const http = fakeHttp(new Map());
  assert.deepEqual(await wildflowerRows(http, 'QUGA', 'QUGA', NOW), []);
  assert.equal(http.failures.length, 1);
});
