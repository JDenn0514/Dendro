import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LICENSE_URLS, licenseUrl, creditParts } from '../app/logic/licenses.js';

test('each Creative Commons name the manifest uses links to its deed', () => {
  const cc = 'https://creativecommons.org/';
  assert.equal(licenseUrl('CC0'), `${cc}publicdomain/zero/1.0/`);
  assert.equal(licenseUrl('CC0 1.0'), `${cc}publicdomain/zero/1.0/`);
  assert.equal(licenseUrl('CC BY 2.0'), `${cc}licenses/by/2.0/`);
  assert.equal(licenseUrl('CC BY 2.5'), `${cc}licenses/by/2.5/`);
  assert.equal(licenseUrl('CC BY 3.0'), `${cc}licenses/by/3.0/`);
  assert.equal(licenseUrl('CC BY 3.0 us'), `${cc}licenses/by/3.0/us/`);
  assert.equal(licenseUrl('CC BY 4.0'), `${cc}licenses/by/4.0/`);
  assert.equal(licenseUrl('CC BY-SA 2.0'), `${cc}licenses/by-sa/2.0/`);
  assert.equal(licenseUrl('CC BY-SA 2.5'), `${cc}licenses/by-sa/2.5/`);
  assert.equal(licenseUrl('CC BY-SA 3.0'), `${cc}licenses/by-sa/3.0/`);
  assert.equal(licenseUrl('CC BY-SA 4.0'), `${cc}licenses/by-sa/4.0/`);
  assert.equal(Object.keys(LICENSE_URLS).length, 11);
});

test('a license with no deed page prints as text', () => {
  assert.equal(licenseUrl('Public domain'), null);
  assert.equal(licenseUrl('public domain (US government work)'), null);
  assert.equal(licenseUrl('CC BY-NC 4.0'), null);
  assert.equal(licenseUrl('toString'), null);
  assert.equal(licenseUrl(undefined), null);
});

// The credit text as it printed before the VT Dendrology rule: commas only.
const commaCredit = (photo) => `${photo.author}, ${photo.source}, ${photo.license}.`;

test('a credit keeps commas when the author is one name', () => {
  assert.deepEqual(creditParts({
    author: 'Jane Doe',
    source: 'Lady Bird Johnson Wildflower Center',
    license: 'used with permission, non-commercial'
  }), ['Jane Doe', ', Lady Bird Johnson Wildflower Center, ', 'used with permission, non-commercial', '.']);
  assert.deepEqual(creditParts({ author: 'A B', source: 'Wikimedia Commons', license: 'CC BY 4.0' }),
    ['A B', ', Wikimedia Commons, ', 'CC BY 4.0', '.']);
});

test('a credit from another source keeps commas when the author holds a comma', () => {
  const inat = {
    author: '(c) Abby Bez, some rights reserved (CC BY)',
    source: 'iNaturalist',
    license: 'CC BY 4.0'
  };
  assert.deepEqual(creditParts(inat), [
    '(c) Abby Bez, some rights reserved (CC BY)', ', iNaturalist, ', 'CC BY 4.0', '.'
  ]);
  assert.equal(creditParts(inat).join(''),
    '(c) Abby Bez, some rights reserved (CC BY), iNaturalist, CC BY 4.0.');
  const commons = {
    author: 'Bruce Kirchoff from Greensboro, NC, USA',
    source: 'Wikimedia Commons',
    license: 'CC BY 2.0'
  };
  assert.equal(creditParts(commons).join(''), commaCredit(commons));
});

test('every credit in the manifest prints as it did before, unless it is VT Dendrology', () => {
  const rows = JSON.parse(readFileSync(new URL('../content/images/manifest.json', import.meta.url), 'utf8'));
  let checked = 0;
  for (const row of rows) {
    if (row.source === 'VT Dendrology' || typeof row.author !== 'string') continue;
    assert.equal(creditParts(row).join(''), commaCredit(row), `${row.target} ${row.hash}`);
    checked += 1;
  }
  assert.ok(checked > 1000, `${checked} rows checked`);
});

test('a VT Dendrology credit puts semicolons between the parts', () => {
  const photo = {
    author: 'John Seiler, Edward Jensen, Alex Niemiera, and John Peterson',
    source: 'VT Dendrology',
    license: 'used with permission, non-commercial'
  };
  const parts = creditParts(photo);
  assert.deepEqual(parts, [
    'John Seiler, Edward Jensen, Alex Niemiera, and John Peterson',
    '; VT Dendrology; ',
    'used with permission, non-commercial',
    '.'
  ]);
  assert.equal(parts.join(''),
    'John Seiler, Edward Jensen, Alex Niemiera, and John Peterson; VT Dendrology; '
    + 'used with permission, non-commercial.');
  // One photographer from the image page takes the semicolons too, so every
  // VT Dendrology credit has one shape.
  assert.equal(creditParts({ ...photo, author: 'John Seiler' }).join(''),
    'John Seiler; VT Dendrology; used with permission, non-commercial.');
});
