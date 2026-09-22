import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadFixture, FIXTURE_DIR } from './helpers/fixture.js';
import { makeRng } from './helpers/rng.js';

test('the fixture parses and holds seven species', () => {
  const raw = loadFixture();
  assert.equal(Object.keys(raw.species).length, 7);
  assert.equal(raw.concepts.length, 21);
  assert.equal(raw.confusion.length, 3);
  assert.equal(raw.units.length, 9);
  assert.equal(raw.manifest.length, 17);
  assert.equal(raw.manifest.filter((m) => m.retired).length, 2);
  assert.equal(raw.species.LIST2.retired, true);
});

test('every live manifest image exists on disk under images/img', () => {
  const raw = loadFixture();
  for (const record of raw.manifest) {
    assert.match(record.hash, /^[0-9a-f]{64}$/);
    assert.equal(record.file, undefined);
    const path = join(FIXTURE_DIR, 'images', 'img', `${record.hash}.jpg`);
    if (record.retired) {
      assert.ok(!existsSync(path), `retired ${record.hash} is still on disk`);
    } else {
      assert.ok(existsSync(path), `missing ${record.hash}`);
    }
  }
});

test('the rng helper is deterministic', () => {
  const a = makeRng(7);
  const b = makeRng(7);
  assert.equal(a(), b());
  assert.equal(a(), b());
});
