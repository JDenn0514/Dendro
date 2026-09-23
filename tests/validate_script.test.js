import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function run(...args) {
  try {
    const out = execFileSync(process.execPath, ['scripts/validate_content.js', ...args],
      { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status, out: `${error.stdout}${error.stderr}` };
  }
}

// A throwaway copy of the fixture, so one test may delete an image from it.
function fixtureCopy(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dendro-content-'));
  cpSync(join(ROOT, 'content_dev'), dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function manifestOf(dir) {
  return JSON.parse(readFileSync(join(dir, 'images', 'manifest.json'), 'utf8'));
}

test('the script passes on the live content set', () => {
  const result = run('content');
  assert.equal(result.code, 0);
  assert.match(result.out, /content is valid/);
});

test('the script passes on the fixture with the local image check', () => {
  const result = run('content_dev', '--local-images', 'content_dev/images');
  assert.equal(result.code, 0);
  assert.match(result.out, /warning/);
  assert.match(result.out, /outside the range 5 to 25/);
});

test('the script fails on a missing directory', () => {
  const result = run('content_missing');
  assert.equal(result.code, 1);
  assert.match(result.out, /cannot read/);
});

// The live images sit in object storage, so without the flag the script must
// never look on disk. This is the case CI runs against content/.
test('without the flag a missing image is not an error', (t) => {
  const dir = fixtureCopy(t);
  const row = manifestOf(dir).find((r) => !r.retired);
  rmSync(join(dir, 'images', 'img', `${row.hash}.jpg`));
  const result = run(dir);
  assert.equal(result.code, 0);
});

test('with the flag a missing image is an error', (t) => {
  const dir = fixtureCopy(t);
  const row = manifestOf(dir).find((r) => !r.retired);
  rmSync(join(dir, 'images', 'img', `${row.hash}.jpg`));
  const result = run(dir, '--local-images', join(dir, 'images'));
  assert.equal(result.code, 1);
  assert.match(result.out, /is not on disk/);
  assert.ok(result.out.includes(row.hash));
  assert.match(result.out, /1 error\(s\)/);
});

// A retired image is deleted from the bucket on purpose. Its row stays.
test('the disk check skips a retired row', (t) => {
  const dir = fixtureCopy(t);
  const row = manifestOf(dir).find((r) => r.retired);
  const path = join(dir, 'images', 'img', `${row.hash}.jpg`);
  if (existsSync(path)) rmSync(path);
  const result = run(dir, '--local-images', join(dir, 'images'));
  assert.equal(result.code, 0);
});
