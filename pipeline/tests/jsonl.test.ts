import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readJsonl, appendJsonl, writeJsonl } from '../lib/jsonl.ts';

/** A temporary directory that the test removes when it ends. */
function tempDir(t: { after: (fn: () => void) => void }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-jsonl-'));
  t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}

test('writeJsonl then readJsonl round-trips an array of objects', (t) => {
  const file = path.join(tempDir(t), 'rows.jsonl');
  const rows = [
    { id: 'a', n: 1, tags: ['leaf'] },
    { id: 'b', n: 2, tags: [] },
    { id: 'c', n: 3, tags: ['bark', 'winter'] },
  ];
  writeJsonl(file, rows);
  assert.deepEqual(readJsonl(file), rows);
});

test('writeJsonl replaces the rows a file already has', (t) => {
  const file = path.join(tempDir(t), 'rows.jsonl');
  writeJsonl(file, [{ id: 'a' }, { id: 'b' }]);
  writeJsonl(file, [{ id: 'c' }]);
  assert.deepEqual(readJsonl(file), [{ id: 'c' }]);
});

test('appendJsonl adds rows to a file that already has some', (t) => {
  const file = path.join(tempDir(t), 'rows.jsonl');
  writeJsonl(file, [{ id: 'a' }]);
  appendJsonl(file, [{ id: 'b' }, { id: 'c' }]);
  assert.deepEqual(readJsonl(file), [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
});

test('appendJsonl creates the file and its directory when they are absent', (t) => {
  const file = path.join(tempDir(t), 'runs', 'v0-oaks', 'candidates.jsonl');
  appendJsonl(file, [{ id: 'a' }]);
  assert.equal(fs.existsSync(file), true);
  assert.deepEqual(readJsonl(file), [{ id: 'a' }]);
});

test('readJsonl on a missing file returns an empty array', (t) => {
  assert.deepEqual(readJsonl(path.join(tempDir(t), 'absent.jsonl')), []);
});

test('readJsonl skips a blank line', (t) => {
  const file = path.join(tempDir(t), 'rows.jsonl');
  fs.writeFileSync(file, '{"id":"a"}\n\n   \n{"id":"b"}\n', 'utf8');
  assert.deepEqual(readJsonl(file), [{ id: 'a' }, { id: 'b' }]);
});

test('every row ends with a newline, so a later append never joins two rows', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'rows.jsonl');

  writeJsonl(file, [{ id: 'a' }, { id: 'b' }]);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"id":"a"}\n{"id":"b"}\n');

  appendJsonl(file, [{ id: 'c' }]);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"id":"a"}\n{"id":"b"}\n{"id":"c"}\n');

  // A file another tool wrote can lack the last newline. The append still keeps the rows apart.
  const ragged = path.join(dir, 'ragged.jsonl');
  fs.writeFileSync(ragged, '{"id":"a"}', 'utf8');
  appendJsonl(ragged, [{ id: 'b' }]);
  assert.deepEqual(readJsonl(ragged), [{ id: 'a' }, { id: 'b' }]);
});
