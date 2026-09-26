import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LICENSE_URLS, licenseUrl } from '../app/logic/licenses.js';

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
