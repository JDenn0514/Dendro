import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('a credit keeps commas when the author is one name', () => {
  assert.deepEqual(creditParts({
    author: 'Jane Doe',
    source: 'Lady Bird Johnson Wildflower Center',
    license: 'used with permission, non-commercial'
  }), ['Jane Doe', ', Lady Bird Johnson Wildflower Center, ', 'used with permission, non-commercial', '.']);
  assert.deepEqual(creditParts({ author: 'A B', source: 'Wikimedia Commons', license: 'CC BY 4.0' }),
    ['A B', ', Wikimedia Commons, ', 'CC BY 4.0', '.']);
});

test('a credit puts semicolons between the parts when the author holds a comma', () => {
  const photo = {
    author: 'John Seiler, Edward Jensen, Alex Niemiera, and John Peterson',
    source: 'Virginia Tech Dendrology',
    license: 'used with permission, non-commercial'
  };
  const parts = creditParts(photo);
  assert.deepEqual(parts, [
    'John Seiler, Edward Jensen, Alex Niemiera, and John Peterson',
    '; Virginia Tech Dendrology; ',
    'used with permission, non-commercial',
    '.'
  ]);
  assert.equal(parts.join(''),
    'John Seiler, Edward Jensen, Alex Niemiera, and John Peterson; Virginia Tech Dendrology; '
    + 'used with permission, non-commercial.');
});
