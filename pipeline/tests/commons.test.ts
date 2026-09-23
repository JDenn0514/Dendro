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
  assert.equal(files.length, 7);
  assert.deepEqual(
    files.map((file) => file.title),
    [
      'File:Quercus gambelii acorn.jpg',
      'File:Quercus gambelii bark.jpg',
      'File:Quercus gambelii habit.jpg',
      'File:Quercus gambelii in autumn.jpg',
      'File:Quercus gambelii range map.svg',
      'File:Quercus gambelii sapling.jpg',
      'File:Quercus gambelii twig.jpg',
    ],
  );
  assert.equal(next, 'file|515545524355532047414d42454c49492e6a7067|60113541');

  const bark = fileNamed(files, 'File:Quercus gambelii bark.jpg');
  assert.equal(bark.mime, 'image/jpeg');
  assert.equal(bark.width, 4000);
  assert.equal(bark.height, 2667);
  assert.equal(bark.license, 'CC BY-SA 4.0');
  // Commons sends the license url with no trailing slash. The pipeline adds one.
  assert.equal(bark.license_url, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(bark.artist, 'Jane Doe');
  assert.equal(bark.description, 'Bark of Quercus gambelii in autumn');
  assert.equal(
    bark.description_url,
    'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark.jpg',
  );
});

test('parseCategoryListing skips a page with no imageinfo and a file with no description page', () => {
  const { files } = page1();
  // The audio file carries no imageinfo.
  assert.equal(
    files.some((file) => file.title === 'File:Quercus gambelii wind.ogg'),
    false,
  );
  // The winter JPEG carries no descriptionurl. A candidate id is the sha1 of
  // `<target>|<origin>`, so two rows of one target with no origin carry one id.
  assert.equal(
    files.some((file) => file.title === 'File:Quercus gambelii winter.jpg'),
    false,
  );
});

test('parseCategoryListing reads page 2 and reports no continuation', () => {
  const { files, next, error } = parseCategoryListing(readFixture(page2Fixture));
  assert.equal(error, null);
  assert.equal(files.length, 1);
  assert.equal(files[0].title, 'File:Quercus gambelii leaf detail.jpg');
  assert.equal(files[0].description, 'One leaf, upper surface');
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

test('commonsCandidates drops the NC file and the non-JPEG file', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
  assert.equal(candidates.length, 4);
  assert.deepEqual(
    candidates.map((row) => row.file_url.split('/').pop()),
    [
      '1280px-Quercus_gambelii_acorn.jpg',
      '1280px-Quercus_gambelii_bark.jpg',
      'Quercus_gambelii_habit.jpg',
      '1280px-Quercus_gambelii_in_autumn.jpg',
    ],
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
  const twig = fileNamed(files, 'File:Quercus gambelii twig.jpg');
  assert.equal(twig.artist, '');
  assert.equal(twig.mime, 'image/jpeg');
  assert.equal(twig.license, 'CC0');

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

  const bark = byOrigin.get('https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark.jpg');
  assert.equal(bark?.channel_hint, 'bark');

  const leaves = byOrigin.get(
    'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_in_autumn.jpg',
  );
  assert.equal(leaves?.channel_hint, 'leaf');

  const acorn = byOrigin.get('https://commons.wikimedia.org/wiki/File:Quercus_gambelii_acorn.jpg');
  assert.equal(acorn?.channel_hint, 'fruit');
});

test('a file with no keyword gets a null hint', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
  const habit = candidates.find(
    (row) => row.origin === 'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_habit.jpg',
  );
  assert.equal(habit?.channel_hint, null);
});

test('thumb_url is the thumbnail for a wide original and the original when it is smaller', () => {
  const { files } = page1();

  const bark = fileNamed(files, 'File:Quercus gambelii bark.jpg');
  assert.ok(bark.width > THUMB_WIDTH);
  assert.equal(
    bark.thumb_url,
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Quercus_gambelii_bark.jpg/1280px-Quercus_gambelii_bark.jpg',
  );

  const habit = fileNamed(files, 'File:Quercus gambelii habit.jpg');
  assert.ok(habit.width < THUMB_WIDTH);
  assert.equal(
    habit.thumb_url,
    'https://upload.wikimedia.org/wikipedia/commons/4/44/Quercus_gambelii_habit.jpg',
  );
  assert.equal(habit.thumb_url, habit.url);
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
  const bark = candidates.find((row) => row.channel_hint === 'bark');
  assert.equal(
    bark?.origin,
    'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark.jpg',
  );
  assert.ok(bark?.origin.startsWith('https://commons.wikimedia.org/wiki/File:'));
  assert.notEqual(bark?.origin, bark?.file_url);
  assert.equal(bark?.author, 'Jane Doe');
  assert.equal(bark?.license, 'CC BY-SA 4.0');
  assert.equal(bark?.license_url, 'https://creativecommons.org/licenses/by-sa/4.0/');
});
