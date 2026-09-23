import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLicenseUrl } from '../lib/licenses.ts';

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
