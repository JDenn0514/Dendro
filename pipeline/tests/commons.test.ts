import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  COMMONS_PAGE_SIZE,
  THUMB_WIDTH,
  categoryUrl,
  stripHtml,
  parseCategoryListing,
  commonsCandidates,
  type CommonsFile,
} from '../lib/commons.ts';
import { SOURCE_NAMES } from '../lib/candidates.ts';

const page1Fixture = new URL('./fixtures/commons_category_quga.json', import.meta.url);
const page2Fixture = new URL('./fixtures/commons_category_quga_page2.json', import.meta.url);
const errorFixture = new URL('./fixtures/commons_category_error.json', import.meta.url);

function readFixture(url: URL): unknown {
  return JSON.parse(fs.readFileSync(url, 'utf8'));
}

function page1(): { files: CommonsFile[]; next: string | null; error: string | null } {
  return parseCategoryListing(readFixture(page1Fixture));
}

function fileNamed(files: CommonsFile[], title: string): CommonsFile {
  const found = files.find((file) => file.title === title);
  assert.ok(found, `the fixture holds ${title}`);
  return found;
}

const NOW = '2026-09-22T15:04:00Z';
const SCIENTIFIC = 'Quercus gambelii';

test('parseCategoryListing reads page 1 sorted by title and returns the continue token', () => {
  const { files, next, error } = page1();
  assert.equal(error, null);
  assert.equal(files.length, 6);
  assert.deepEqual(
    files.map((file) => file.title),
    [
      'File:Autumn Gambel Oak Leaf.jpg',
      'File:Economic considerations in use and management of Gambel oak for fuelwood (IA CAT31118970).pdf',
      'File:Gambel oak bark.jpg',
      'File:Quercus gambelii - Flickr - aspidoscelis.jpg',
      'File:Quercus gambelii Grand Canyon 1.jpg',
      'File:Quercus gambelii kz02.jpg',
    ],
  );
  assert.equal(next, 'file|515545524355532047414d42454c4949204b5a31392e4a5047|75963421');

  const kz = fileNamed(files, 'File:Quercus gambelii kz02.jpg');
  assert.equal(kz.mime, 'image/jpeg');
  assert.equal(kz.width, 2878);
  assert.equal(kz.height, 3837);
  assert.equal(kz.license, 'CC BY-SA 4.0');
  // Commons sends the license url with no trailing slash. The pipeline adds one.
  assert.equal(kz.license_url, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(kz.artist, 'Kenraiz');
  assert.equal(kz.description, 'Quercus gambelii at Cape Royal in Grand Canyon NP, Arizona USA');
  assert.equal(
    kz.description_url,
    'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_kz02.jpg',
  );
});

// The recorded listing carries neither a page without imageinfo nor a file
// without a description page, so a built body covers those two rules.
test('parseCategoryListing skips a page with no imageinfo and a file with no description page', () => {
  const { files } = parseCategoryListing({
    query: {
      pages: {
        '1': { pageid: 1, ns: 6, title: 'File:Quercus gambelii wind.ogg' },
        '2': {
          pageid: 2,
          ns: 6,
          title: 'File:Quercus gambelii winter.jpg',
          imageinfo: [
            {
              url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Quercus_gambelii_winter.jpg',
              width: 3000,
              height: 2000,
              mime: 'image/jpeg',
              extmetadata: {
                LicenseShortName: { value: 'CC0' },
                Artist: { value: 'Ada Lovelace' },
              },
            },
          ],
        },
      },
    },
  });
  // A candidate id is the sha1 of `<target>|<origin>`, so two rows of one target
  // with no origin would carry one id.
  assert.deepEqual(files, []);
});

test('parseCategoryListing reads page 2 and reports no continuation', () => {
  const { files, next, error } = parseCategoryListing(readFixture(page2Fixture));
  assert.equal(error, null);
  assert.equal(files.length, 1);
  assert.equal(files[0].title, 'File:Quercus gambelii leaves.jpg');
  assert.equal(files[0].description, 'Quercus gambelii leaves. Zion National Park, Utah.');
  assert.equal(next, null);
});

test('parseCategoryListing reports an API error instead of an empty listing', () => {
  const failed = parseCategoryListing(readFixture(errorFixture));
  assert.equal(failed.error, 'The category name you entered is not valid.');
  assert.deepEqual(failed.files, []);
  assert.equal(failed.next, null);

  // A body that is not an object is a failure too.
  assert.equal(
    parseCategoryListing('<html>').error,
    'the response body is not an object',
  );
});

test('an empty category gives no files, no token, and no error', () => {
  const empty = parseCategoryListing({ batchcomplete: '', query: { pages: {} } });
  assert.deepEqual(empty, { files: [], next: null, error: null });
});

test('stripHtml strips the tags, then decodes the entities once', () => {
  assert.equal(stripHtml('<a href="x">Jane Doe</a>'), 'Jane Doe');
  assert.equal(stripHtml('Leaves &amp; twigs'), 'Leaves & twigs');
  assert.equal(stripHtml('a &quot;quoted&quot; word'), 'a "quoted" word');
  assert.equal(stripHtml('Jane&#39;s photo'), "Jane's photo");
  assert.equal(stripHtml('one&nbsp;two'), 'one two');
  assert.equal(stripHtml('  spaced\n\n out  '), 'spaced out');

  // Tags are removed from the raw HTML before any decoding, so an entity-encoded tag
  // becomes literal text and never markup.
  assert.equal(
    stripHtml('&lt;script&gt;alert(1)&lt;/script&gt;'),
    '<script>alert(1)</script>',
  );
  assert.equal(stripHtml('&lt;i&gt;'), '<i>');

  // A tag encoded twice is the text a browser would show for it, decoded once.
  assert.equal(stripHtml('&amp;lt;i&amp;gt;'), '&lt;i&gt;');
});

test('stripHtml strips tags before decoding, so an encoded angle bracket cannot eat text', () => {
  assert.equal(stripHtml('5 &lt; 7 &amp;&amp; 8 &gt; 2'), '5 < 7 && 8 > 2');
});

test('stripHtml decodes numeric character references, decimal and hex', () => {
  assert.equal(stripHtml('Jane&#160;Doe'), 'Jane Doe');
  assert.equal(stripHtml('A&#8211;B'), 'A–B');
  assert.equal(stripHtml('<span>&#160;</span>'), '');
  assert.equal(stripHtml('&#x41;&#X42;'), 'AB');
});

// The live category holds no NC file. The PDF stands for the non-JPEG rule, and
// `licenseAllowed` covers NC on its own.
test('commonsCandidates drops the non-JPEG file and the file with no artist', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
  assert.equal(candidates.length, 4);
  // The live file url carries a utm query, which the pipeline passes through.
  assert.deepEqual(
    candidates.map((row) => row.file_url.split('/').pop()?.split('?')[0]),
    [
      'Autumn_Gambel_Oak_Leaf.jpg',
      '1280px-Quercus_gambelii_-_Flickr_-_aspidoscelis.jpg',
      '1280px-Quercus_gambelii_Grand_Canyon_1.jpg',
      '1280px-Quercus_gambelii_kz02.jpg',
    ],
  );
  assert.equal(
    candidates.some((row) => row.file_url.includes('.pdf')),
    false,
  );
  for (const row of candidates) {
    assert.equal(row.source_key, 'commons');
    assert.equal(row.source, SOURCE_NAMES.commons);
    assert.equal(row.target, 'QUGA');
    assert.equal(row.source_species, SCIENTIFIC);
    assert.equal(row.fetched_at, NOW);
    assert.equal(row.fetch_error, null);
    assert.equal(row.identity_match, null);
    assert.deepEqual(row.tags_hint, []);
  }
});

test('commonsCandidates excludes a file with an empty artist', () => {
  const { files } = page1();
  const twig = fileNamed(files, 'File:Gambel oak bark.jpg');
  assert.equal(twig.artist, '');
  assert.equal(twig.mime, 'image/jpeg');
  assert.equal(twig.license, 'CC BY-SA 3.0');

  // The app prints the credit verbatim, so a row with no author can never publish.
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
  assert.equal(
    candidates.some((row) => row.origin === twig.description_url),
    false,
  );
});

test('the hint comes from the title and the description', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
  const byOrigin = new Map(candidates.map((row) => [row.origin, row]));

  const leaf = byOrigin.get('https://commons.wikimedia.org/wiki/File:Autumn_Gambel_Oak_Leaf.jpg');
  assert.equal(leaf?.channel_hint, 'leaf');

  const second = parseCategoryListing(readFixture(page2Fixture));
  const leaves = commonsCandidates(second.files, 'QUGA', SCIENTIFIC, NOW)[0];
  assert.equal(leaves.channel_hint, 'leaf');
});

test('a file with no keyword gets a null hint', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
  const canyon = candidates.find(
    (row) =>
      row.origin ===
      'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_Grand_Canyon_1.jpg',
  );
  assert.equal(canyon?.channel_hint, null);
});

test('thumb_url is the thumbnail for a wide original and the original when it is smaller', () => {
  const { files } = page1();

  const kz = fileNamed(files, 'File:Quercus gambelii kz02.jpg');
  assert.ok(kz.width > THUMB_WIDTH);
  assert.ok(kz.thumb_url.includes('/thumb/'));
  assert.ok(kz.thumb_url.includes(`${THUMB_WIDTH}px-Quercus_gambelii_kz02.jpg`));

  // Commons sends the original as the thumbnail when the original is narrower
  // than the width asked for, and the two urls are then the same.
  const leaf = fileNamed(files, 'File:Autumn Gambel Oak Leaf.jpg');
  assert.ok(leaf.width < THUMB_WIDTH);
  assert.equal(leaf.thumb_url, leaf.url);
});

test('categoryUrl builds the documented parameters and leaves gcmcontinue out', () => {
  assert.equal(
    categoryUrl(SCIENTIFIC, null),
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
      '&generator=categorymembers&gcmtitle=Category:Quercus%20gambelii' +
      `&gcmtype=file&gcmlimit=${COMMONS_PAGE_SIZE}&prop=imageinfo` +
      `&iiprop=url|extmetadata|mime|size&iiurlwidth=${THUMB_WIDTH}` +
      '&iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|LicenseUrl',
  );
});

test('categoryUrl adds the continuation token url-encoded', () => {
  const url = categoryUrl(SCIENTIFIC, 'file|QUGA.JPG|60113541');
  assert.equal(
    url,
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
      '&generator=categorymembers&gcmtitle=Category:Quercus%20gambelii' +
      `&gcmtype=file&gcmlimit=${COMMONS_PAGE_SIZE}&prop=imageinfo` +
      `&iiprop=url|extmetadata|mime|size&iiurlwidth=${THUMB_WIDTH}` +
      '&iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|LicenseUrl' +
      '&gcmcontinue=file%7CQUGA.JPG%7C60113541',
  );
});

test('the origin is the description page, not the file url', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
  const kz = candidates.find((row) => row.author === 'Kenraiz');
  assert.equal(
    kz?.origin,
    'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_kz02.jpg',
  );
  assert.ok(kz?.origin.startsWith('https://commons.wikimedia.org/wiki/File:'));
  assert.notEqual(kz?.origin, kz?.file_url);
  assert.equal(kz?.license, 'CC BY-SA 4.0');
  assert.equal(kz?.license_url, 'https://creativecommons.org/licenses/by-sa/4.0/');
});
