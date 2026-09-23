import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHANNELS } from '../lib/candidates.ts';
import {
  csvList,
  gitCheckoutBranch,
  gitCheckoutExisting,
  gitCommitAll,
  newScope,
  openPullRequest,
  parseFlags,
  readConceptKeys,
  readRun,
  runDir,
  validateScope,
  writeRun,
  type Exec,
  type RunScope,
} from '../lib/run.ts';
import { fakeExec } from './helpers.ts';

const CREATED_AT = '2026-09-22T15:04:00Z';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-run-'));
}

function scopeFlags(): Record<string, string> {
  return {
    bucket: 'simple_lobed',
    states: 'CO, UT ,NM ',
    genera: ' Quercus,Acer ',
    include: 'QUGA',
    channels: 'leaf, bark',
  };
}

function writeScopeFile(root: string, name: string, value: unknown): void {
  const dir = runDir(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const text = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(path.join(dir, 'run.json'), text, 'utf8');
}

test('parseFlags reads a value flag and keeps a kebab-case key', () => {
  const flags = parseFlags([
    '--target',
    'QUGA',
    '--file-url',
    'https://example.org/a.jpg',
    '--note',
    'a clear leaf',
  ]);
  assert.deepEqual(flags, {
    target: 'QUGA',
    'file-url': 'https://example.org/a.jpg',
    note: 'a clear leaf',
  });
});

test('parseFlags throws when a value flag has no value', () => {
  assert.throws(() => parseFlags(['--target']), /the flag --target needs a value/);
  assert.throws(() => parseFlags(['--target', '--origin', 'x']), /the flag --target needs a value/);
});

test('parseFlags reads --refresh as the one boolean flag', () => {
  assert.deepEqual(parseFlags(['--refresh']), { refresh: 'true' });
  assert.deepEqual(parseFlags(['--refresh', '--target', 'QUGA']), {
    refresh: 'true',
    target: 'QUGA',
  });
});

test('csvList trims each part and drops an empty one', () => {
  assert.deepEqual(csvList(' shape , margin ,, '), ['shape', 'margin']);
  assert.deepEqual(csvList(undefined), []);
});

test('newScope splits every csv list and trims each part', () => {
  const scope = newScope('simple_lobed_co', scopeFlags(), CREATED_AT);
  assert.equal(scope.name, 'simple_lobed_co');
  assert.equal(scope.bucket, 'simple_lobed');
  assert.deepEqual(scope.concepts, []);
  assert.deepEqual(scope.concept_exemplars, {});
  assert.deepEqual(scope.states, ['CO', 'UT', 'NM']);
  assert.deepEqual(scope.genera, ['Quercus', 'Acer']);
  assert.deepEqual(scope.include, ['QUGA']);
  assert.deepEqual(scope.channels, ['leaf', 'bark']);
  assert.equal(scope.created_at, CREATED_AT);
  assert.deepEqual(scope.species, []);
  assert.deepEqual(scope.dropped, []);
  assert.equal(scope.fetch_failures, 0);
  assert.deepEqual(scope.capped, []);
});

test('newScope rejects both --bucket and --concepts, and neither', () => {
  assert.throws(
    () => newScope('both', { bucket: 'simple_lobed', concepts: 'bark/plated' }, CREATED_AT),
    (error: Error) => error.message.includes('--bucket') && error.message.includes('--concepts'),
  );
  assert.throws(
    () => newScope('neither', { channels: 'bark' }, CREATED_AT),
    (error: Error) => error.message.includes('--bucket') && error.message.includes('--concepts'),
  );
});

test('newScope requires --channels on a bucket run', () => {
  assert.throws(() => newScope('no_channels', { bucket: 'simple_lobed' }, CREATED_AT), /--channels/);
});

test('newScope rejects a channel that CHANNELS does not hold', () => {
  assert.throws(
    () => newScope('bad', { bucket: 'simple_lobed', channels: 'leaf,trunk' }, CREATED_AT),
    (error: Error) => error.message.includes('trunk') && error.message.includes(CHANNELS[0]),
  );
});

test('newScope rejects an unqualified concept value', () => {
  assert.throws(
    () => newScope('bare', { concepts: 'plated' }, CREATED_AT),
    /the concept plated needs the form <channel>\/<key>/,
  );
});

test("newScope takes a concept run's channels from the prefixes and refuses --channels", () => {
  const scope = newScope('concepts', { concepts: 'bark/plated, leaf/simple_lobed' }, CREATED_AT);
  assert.equal(scope.bucket, null);
  assert.deepEqual(scope.concepts, ['bark/plated', 'leaf/simple_lobed']);
  assert.deepEqual(scope.channels, ['bark', 'leaf']);
  assert.throws(
    () => newScope('both_ways', { concepts: 'bark/plated', channels: 'bark' }, CREATED_AT),
    /Drop --channels/,
  );
});

test('writeRun then readRun round-trips the scope', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const scope = newScope('simple_lobed_co', scopeFlags(), CREATED_AT);
  scope.species = ['QUGA'];
  scope.dropped = [{ symbol: 'QUUN', reason: 'hybrid' }];
  scope.concept_exemplars = { 'leaf/simple_lobed': ['QUGA'] };
  scope.fetch_failures = 2;
  scope.capped = ['QUGA: commons listing capped at 4 pages'];
  writeRun(root, scope);

  const file = path.join(runDir(root, 'simple_lobed_co'), 'run.json');
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.includes('\n  "name": "simple_lobed_co",'));
  assert.deepEqual(readRun(root, 'simple_lobed_co'), scope);
});

test('readRun on a missing run names the init command', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.throws(
    () => readRun(root, 'absent'),
    /run absent does not exist\. Run "cli run init absent" first\./,
  );
});

test('readRun lists every field validateScope rejects', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const scope = newScope('broken', scopeFlags(), CREATED_AT) as unknown as Record<string, unknown>;
  delete scope.channels;
  scope.fetch_failures = 'two';
  scope.dropped = [{ symbol: 'QUUN' }];
  writeScopeFile(root, 'broken', scope);

  assert.throws(() => readRun(root, 'broken'), (error: Error) => {
    assert.ok(error.message.includes('run.json'));
    assert.ok(error.message.includes('channels is not an array of strings'));
    assert.ok(error.message.includes('fetch_failures is not a number'));
    assert.ok(error.message.includes('a dropped row needs a symbol and a reason'));
    return true;
  });
});

test("readRun keeps the JSON parser's message", (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeScopeFile(root, 'torn', '{ "name": "torn",');
  assert.throws(() => readRun(root, 'torn'), (error: Error) => {
    assert.ok(error.message.includes('cannot parse'));
    assert.ok(error.message.includes('run.json'));
    assert.ok(error.message.toLowerCase().includes('json'));
    return true;
  });
});

test('validateScope accepts a fresh scope', () => {
  assert.deepEqual(validateScope(newScope('fresh', scopeFlags(), CREATED_AT)), []);
  assert.deepEqual(validateScope('a string'), ['run.json does not hold an object.']);
});

test('gitCheckoutBranch branches content/<name> off main', () => {
  const exec = fakeExec();
  gitCheckoutBranch(exec, 'simple_lobed_co');
  assert.deepEqual(exec.calls, [
    { command: 'git', args: ['checkout', '-b', 'content/simple_lobed_co', 'main'] },
  ]);
});

test('gitCheckoutExisting checks out the branch a resumed run already has', () => {
  const exec = fakeExec();
  gitCheckoutExisting(exec, 'simple_lobed_co');
  assert.deepEqual(exec.calls, [
    { command: 'git', args: ['checkout', 'content/simple_lobed_co'] },
  ]);
});

test('gitCommitAll stages everything and commits with the co-author trailer', () => {
  const exec = fakeExec();
  gitCommitAll(exec, 'content(simple_lobed_co): species list');
  assert.equal(exec.calls.length, 2);
  assert.deepEqual(exec.calls[0], { command: 'git', args: ['add', '-A'] });
  const commit = exec.calls[1];
  assert.equal(commit.command, 'git');
  assert.equal(commit.args[0], 'commit');
  assert.equal(commit.args[1], '-m');
  assert.equal(commit.args[2], 'content(simple_lobed_co): species list');
  assert.equal(commit.args[3], '-m');
  assert.equal(commit.args[4], 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>');
});

test('gitCommitAll accepts a clean tree', () => {
  const exec = fakeExec();
  exec.queue.push({ code: 0, out: '' });
  exec.queue.push({ code: 1, out: 'nothing to commit, working tree clean' });
  assert.doesNotThrow(() => gitCommitAll(exec, 'content(run): nothing changed'));
  assert.equal(exec.calls.length, 2);
});

test('gitCheckoutBranch throws with the command output', () => {
  const exec = fakeExec();
  exec.queue.push({ code: 128, out: "fatal: a branch named 'content/x' already exists" });
  assert.throws(() => gitCheckoutBranch(exec, 'x'), /already exists/);
});

test('openPullRequest opens a draft with the report as the body', () => {
  const exec = fakeExec();
  openPullRequest(exec, 'simple_lobed_co', 'pipeline/runs/simple_lobed_co/report.md');
  assert.deepEqual(exec.calls, [
    {
      command: 'gh',
      args: [
        'pr',
        'create',
        '--draft',
        '--title',
        'content: simple_lobed_co',
        '--body-file',
        'pipeline/runs/simple_lobed_co/report.md',
      ],
    },
  ]);
});

test('readConceptKeys qualifies every key in the real concepts file', () => {
  const keys = readConceptKeys(path.join(REPO_ROOT, 'content', 'concepts.json'));
  assert.ok(keys.includes('leaf/simple_lobed'));
  assert.ok(keys.includes('bark/plated'));
  assert.ok(keys.length > 0);
  assert.equal(keys.length, new Set(keys).size);
  for (const key of keys) {
    assert.equal(key.split('/').length, 2);
    assert.ok(CHANNELS.includes(key.split('/')[0]), `${key} names a known channel`);
  }
  assert.deepEqual(keys, [...keys].sort());
});
