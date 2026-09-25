import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { licenseAllowed } from '../lib/candidates.ts';
import {
  LICENSE_PERMISSIONS,
  licenseAllowedAt,
  licenseLabelFromUrl,
  normalizeLicenseUrl,
} from '../lib/licenses.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PERMISSION = 'used with permission, non-commercial';
const WILDFLOWER_ORIGIN = 'https://www.wildflower.org/gallery/result.php?id_image=66070';

test('normalizeLicenseUrl gives every license url one trailing slash', () => {
  // Commons sends the url without the slash. iNat's table carries it.
  assert.equal(
    normalizeLicenseUrl('https://creativecommons.org/licenses/by-sa/4.0'),
    'https://creativecommons.org/licenses/by-sa/4.0/',
  );
  assert.equal(
    normalizeLicenseUrl('https://creativecommons.org/licenses/by-sa/4.0/'),
    'https://creativecommons.org/licenses/by-sa/4.0/',
  );
  assert.equal(
    normalizeLicenseUrl('  https://creativecommons.org/publicdomain/zero/1.0  '),
    'https://creativecommons.org/publicdomain/zero/1.0/',
  );
  assert.equal(normalizeLicenseUrl(null), null);
  assert.equal(normalizeLicenseUrl(''), null);
  assert.equal(normalizeLicenseUrl('   '), null);
});

test('licenseLabelFromUrl names the Creative Commons licence of a url', () => {
  const cases: [string, string][] = [
    ['https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0'],
    ['https://creativecommons.org/licenses/by-nc/3.0/', 'CC BY-NC 3.0'],
    ['https://creativecommons.org/licenses/by/3.0/', 'CC BY 3.0'],
    ['http://creativecommons.org/licenses/by/3.0', 'CC BY 3.0'],
    ['https://creativecommons.org/licenses/by/3.0/us/', 'CC BY 3.0 US'],
    ['https://creativecommons.org/publicdomain/zero/1.0/', 'CC0 1.0'],
    ['https://creativecommons.org/publicdomain/mark/1.0/', 'Public Domain Mark 1.0'],
  ];
  for (const [url, label] of cases) assert.equal(licenseLabelFromUrl(url), label, url);
});

test('licenseLabelFromUrl gives null for any other url', () => {
  const others = [
    null,
    '',
    'https://www.gnu.org/licenses/fdl-1.3.html',
    'https://creativecommons.org/about/',
    'https://creativecommons.org/licenses/by/4.0/legalcode',
    'https://example.org/licenses/by/4.0/',
  ];
  for (const url of others) assert.equal(licenseLabelFromUrl(url), null, String(url));
});

test('a label from licenseLabelFromUrl still goes through licenseAllowed', () => {
  const label = (url: string): string => licenseLabelFromUrl(url) ?? '';
  assert.equal(licenseAllowed(label('https://creativecommons.org/licenses/by-sa/4.0/')), true);
  assert.equal(licenseAllowed(label('https://creativecommons.org/publicdomain/mark/1.0/')), true);
  assert.equal(licenseAllowed(label('https://creativecommons.org/licenses/by-nc/3.0/')), false);
  assert.equal(licenseAllowed(label('https://creativecommons.org/licenses/by-nd/4.0/')), false);
});

test('LICENSE_PERMISSIONS holds the one wildflower.org permission', () => {
  assert.deepEqual(LICENSE_PERMISSIONS, [
    {
      label: PERMISSION,
      hosts: ['www.wildflower.org'],
      granted: '2026-09-25',
      scope: 'non-commercial',
      record: 'docs/decisions/2026-09-25-wildflower-permission.md',
    },
  ]);
});

test('every permission record is a file in the repo', () => {
  for (const permission of LICENSE_PERMISSIONS) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, permission.record)), permission.record);
  }
});

test('licenseAllowedAt admits what the allowlist admits, on any host', () => {
  assert.equal(
    licenseAllowedAt('CC BY-SA 4.0', 'https://www.treesandshrubsonline.org/articles/quercus/quercus-gambelii/'),
    true,
  );
  assert.equal(licenseAllowedAt('CC BY-NC 4.0', WILDFLOWER_ORIGIN), false);
});

test('licenseAllowedAt admits the permission label for www.wildflower.org only', () => {
  assert.equal(licenseAllowedAt(PERMISSION, WILDFLOWER_ORIGIN), true);
  assert.equal(licenseAllowedAt(PERMISSION, 'http://www.wildflower.org/gallery/result.php?id_image=3424'), true);
  const others = [
    'https://wildflower.org/gallery/result.php?id_image=66070',
    'https://commons.wikimedia.org/wiki/File:A.jpg',
    'https://www.wildflower.org.example.com/gallery/',
    'not a url',
  ];
  for (const origin of others) assert.equal(licenseAllowedAt(PERMISSION, origin), false, origin);
});

test('licenseAllowedAt needs the permission label word for word', () => {
  const near = [
    'Used with permission, non-commercial',
    'used with permission',
    'used with permission, non-commercial.',
    ' used with permission, non-commercial',
  ];
  for (const text of near) assert.equal(licenseAllowedAt(text, WILDFLOWER_ORIGIN), false, text);
});
