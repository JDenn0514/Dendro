import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateContent } from '../../app/logic/content.js';
import { makeCandidate, type Candidate } from '../lib/candidates.ts';
import { CHECK_AGENT, runCommand, type CliDeps } from '../lib/commands.ts';
import type { Http } from '../lib/http.ts';
import { readJsonl, writeJsonl } from '../lib/jsonl.ts';
import { newScope, runDir, writeRun } from '../lib/run.ts';
import { memoryStorage } from '../lib/storage.ts';
import { stagedPath, type StagedVerdict } from '../lib/verdict_apply.ts';
import type { Verdict } from '../lib/verdicts.ts';
import { captureConsole, changes, fakeExec } from './helpers.ts';

const NOW = '2026-09-28T10:00:00Z';

/** No verdict command reads the network. A call fails the test. */
const noHttp: Http = {
  failures: [],
  async getText() {
    throw new Error('no network in this test');
  },
  async postJson() {
    throw new Error('no network in this test');
  },
  async getBytes() {
    throw new Error('no network in this test');
  },
};

function candidate(target: string, index: number): Candidate {
  return makeCandidate({
    target,
    source_key: 'manual',
    origin: `https://example.org/${target}/${index}`,
    file_url: `https://example.org/${target}/${index}.jpg`,
    author: 'A Seeder',
    license: 'public domain',
    fetched_at: NOW,
  });
}

const QUGA_1 = candidate('QUGA', 1);
const QUGA_2 = candidate('QUGA', 2);
const QUGA_3 = candidate('QUGA', 3);
const QUAL_1 = candidate('QUAL', 1);

function setup(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-verdicts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { out, err } = captureConsole(t);
  const exec = fakeExec();
  const deps: CliDeps = {
    root,
    exec,
    http: noHttp,
    storage: memoryStorage(),
    resize: async (bytes) => bytes,
    chroma: async () => 100,
    validate: validateContent,
    cdnBase: 'https://images.dendro.test/',
    now: () => new Date(NOW),
  };
  const scope = newScope('demo', { bucket: 'simple_lobed', channels: 'leaf,bark' }, NOW);
  scope.species = ['QUAL', 'QUGA'];
  writeRun(root, scope);
  writeJsonl(path.join(runDir(root, 'demo'), 'candidates.jsonl'), [QUGA_1, QUGA_2, QUGA_3, QUAL_1]);
  return { root, deps, exec, out, err };
}

function staged(id: string, kind: StagedVerdict['verdict'], extra: Partial<StagedVerdict> = {}): StagedVerdict {
  return { candidate_id: id, verdict: kind, channel: null, tags: [], case: null, note: 'a note', ...extra };
}

function stageFile(root: string, target: string, rows: StagedVerdict[]): void {
  writeJsonl(stagedPath(runDir(root, 'demo'), target), rows);
}

function verdictsPath(root: string): string {
  return path.join(runDir(root, 'demo'), 'verdicts.jsonl');
}

function verdictsOf(root: string): Verdict[] {
  return readJsonl<Verdict>(verdictsPath(root));
}

function seedVerdicts(root: string, rows: Verdict[]): void {
  writeJsonl(verdictsPath(root), rows);
}

function stageArgs(id: string, kind: string, extra: string[] = []): string[] {
  return ['photos', 'stage', 'demo', '--candidate', id, '--verdict', kind, ...extra, '--note', 'a clear lobed leaf'];
}

test('photos stage appends one row to the target file and prints the target counts', async (t) => {
  const { root, deps, out, err } = setup(t);

  assert.equal(await runCommand(stageArgs(QUGA_1.id, 'approve', ['--channel', 'leaf']), deps), 0, err.join(' | '));

  assert.deepEqual(readJsonl(stagedPath(runDir(root, 'demo'), 'QUGA')), [
    staged(QUGA_1.id, 'approve', { channel: 'leaf', note: 'a clear lobed leaf' }),
  ]);
  assert.equal(fs.existsSync(verdictsPath(root)), false);
  assert.deepEqual(out, [
    `approve staged for candidate ${QUGA_1.id} in pipeline/runs/demo/staged/QUGA.jsonl`,
    'QUGA: approved leaf 1, bark 0; hard 0',
  ]);
});

test('photos stage of the same verdict again adds nothing, and of another verdict is refused', async (t) => {
  const { root, deps, out, err } = setup(t);
  assert.equal(await runCommand(stageArgs(QUGA_1.id, 'approve', ['--channel', 'leaf']), deps), 0);

  assert.equal(await runCommand(stageArgs(QUGA_1.id, 'approve', ['--channel', 'leaf']), deps), 0);
  assert.ok(out.includes(`${QUGA_1.id} is already staged`));

  assert.equal(await runCommand(stageArgs(QUGA_1.id, 'reject'), deps), 1);
  assert.match(
    err.join('\n'),
    /refused: .* is already staged as approve leaf in pipeline\/runs\/demo\/staged\/QUGA\.jsonl\. To change it, remove its row from that file, then stage again\./,
  );
  assert.equal(readJsonl(stagedPath(runDir(root, 'demo'), 'QUGA')).length, 1);
});

test('photos stage refuses an unknown candidate and a channel off the run, and writes no file', async (t) => {
  const { root, deps, err } = setup(t);

  assert.equal(await runCommand(stageArgs('deadbeef', 'approve', ['--channel', 'leaf']), deps), 1);
  assert.equal(await runCommand(stageArgs(QUGA_1.id, 'approve', ['--channel', 'twig']), deps), 1);

  assert.match(err.join('\n'), /deadbeef names no candidate/);
  assert.match(err.join('\n'), /twig/);
  assert.equal(fs.existsSync(path.join(runDir(root, 'demo'), 'staged')), false);
});

test('photos stage and photos apply on main write nothing', async (t) => {
  const { root, deps, exec, err } = setup(t);
  stageFile(root, 'QUGA', [staged(QUGA_1.id, 'reject')]);
  exec.branch = 'main';

  assert.equal(await runCommand(stageArgs(QUGA_2.id, 'reject'), deps), 1);
  assert.equal(await runCommand(['photos', 'apply', 'demo'], deps), 1);

  assert.match(err.join('\n'), /HEAD is on main/);
  assert.equal(readJsonl(stagedPath(runDir(root, 'demo'), 'QUGA')).length, 1);
  assert.equal(fs.existsSync(verdictsPath(root)), false);
  assert.deepEqual(changes(exec), []);
});

test('photos apply applies every staged file in one pass and prints the counts', async (t) => {
  const { root, deps, exec, out, err } = setup(t);
  stageFile(root, 'QUGA', [
    staged(QUGA_1.id, 'approve', { channel: 'leaf' }),
    staged(QUGA_2.id, 'approve', { channel: 'bark', tags: ['hard'] }),
    staged(QUGA_3.id, 'reject'),
  ]);
  stageFile(root, 'QUAL', [staged(QUAL_1.id, 'approve', { channel: 'leaf' })]);

  assert.equal(await runCommand(['photos', 'apply', 'demo'], deps), 0, err.join(' | '));

  const rows = verdictsOf(root);
  assert.deepEqual(rows.map((one) => one.candidate_id), [QUAL_1.id, QUGA_1.id, QUGA_2.id, QUGA_3.id]);
  for (const one of rows) {
    assert.equal(one.checked_by, CHECK_AGENT);
    assert.equal(one.checked_at, NOW);
  }
  assert.deepEqual(out, [
    'QUAL: 1 applied, 0 unchanged; approved leaf 1, bark 0; hard 0',
    'QUGA: 3 applied, 0 unchanged; approved leaf 1, bark 0; hard 1',
    'total: 4 applied, 0 unchanged; judged 4, escalated 0 (0.0%), stop rule not fired',
  ]);
  // One process: the command runs no child process.
  assert.deepEqual(changes(exec), []);
});

test('photos apply twice gives the same verdicts.jsonl', async (t) => {
  const { root, deps, out } = setup(t);
  stageFile(root, 'QUGA', [staged(QUGA_1.id, 'approve', { channel: 'leaf' }), staged(QUGA_3.id, 'reject')]);

  assert.equal(await runCommand(['photos', 'apply', 'demo'], deps), 0);
  const first = fs.readFileSync(verdictsPath(root), 'utf8');
  out.length = 0;
  assert.equal(await runCommand(['photos', 'apply', 'demo'], deps), 0);

  assert.equal(fs.readFileSync(verdictsPath(root), 'utf8'), first);
  assert.deepEqual(out, [
    'QUGA: 0 applied, 2 unchanged; approved leaf 1, bark 0; hard 0',
    'total: 0 applied, 2 unchanged; judged 2, escalated 0 (0.0%), stop rule not fired',
  ]);
});

test('a changed verdict is a conflict, and --replace records it', async (t) => {
  const { root, deps, err } = setup(t);
  seedVerdicts(root, [{ ...staged(QUGA_1.id, 'reject'), checked_by: CHECK_AGENT, checked_at: NOW }]);
  stageFile(root, 'QUGA', [staged(QUGA_1.id, 'approve', { channel: 'leaf' }), staged(QUGA_3.id, 'reject')]);

  assert.equal(await runCommand(['photos', 'apply', 'demo'], deps), 1);
  assert.deepEqual(err, [
    `conflict: ${QUGA_1.id} is recorded as reject and staged as approve leaf. Run again with --replace to record the staged verdict.`,
    'nothing applied: 1 conflict',
  ]);
  assert.equal(verdictsOf(root).length, 1);

  assert.equal(await runCommand(['photos', 'apply', 'demo', '--replace'], deps), 0);
  const rows = verdictsOf(root);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].candidate_id, QUGA_1.id);
  assert.equal(rows[1].verdict, 'approve');
});

test('--replace does not change an owner decision', async (t) => {
  const { root, deps, err } = setup(t);
  seedVerdicts(root, [{ ...staged(QUGA_1.id, 'reject'), checked_by: 'owner', checked_at: '2026-09-27' }]);
  stageFile(root, 'QUGA', [staged(QUGA_1.id, 'approve', { channel: 'leaf' })]);

  assert.equal(await runCommand(['photos', 'apply', 'demo', '--replace'], deps), 1);

  assert.match(
    err.join('\n'),
    /is an owner decision\. --replace does not change it\. Remove the staged row or change it to match\./,
  );
  assert.equal(verdictsOf(root).length, 1);
});

test('photos apply reads the manifest once for all its targets', async (t) => {
  const { root, deps, err } = setup(t);
  fs.mkdirSync(path.join(root, 'content', 'images'), { recursive: true });
  fs.writeFileSync(path.join(root, 'content', 'images', 'manifest.json'), '[]\n', 'utf8');
  stageFile(root, 'QUGA', [staged(QUGA_1.id, 'reject')]);
  stageFile(root, 'QUAL', [staged(QUAL_1.id, 'reject')]);
  const read = t.mock.method(fs, 'readFileSync');

  assert.equal(await runCommand(['photos', 'apply', 'demo'], deps), 0, err.join(' | '));

  const manifestReads = read.mock.calls.filter((call) => String(call.arguments[0]).endsWith('manifest.json'));
  read.mock.restore();
  assert.equal(manifestReads.length, 1);
});

test('one bad row stops the whole apply, and the message names the file and the line', async (t) => {
  const { root, deps, err } = setup(t);
  const file = stagedPath(runDir(root, 'demo'), 'QUGA');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    JSON.stringify(staged(QUGA_1.id, 'reject')),
    JSON.stringify({ candidate: QUGA_2.id, verdict: 'reject', note: 'old format' }),
    JSON.stringify(staged('deadbeef', 'reject')),
  ];
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');

  assert.equal(await runCommand(['photos', 'apply', 'demo'], deps), 1);

  assert.ok(err.includes('pipeline/runs/demo/staged/QUGA.jsonl:2: unknown field candidate'), err.join(' | '));
  assert.ok(err.includes('pipeline/runs/demo/staged/QUGA.jsonl: deadbeef names no candidate'), err.join(' | '));
  assert.equal(err[err.length - 1], 'nothing applied');
  assert.equal(fs.existsSync(verdictsPath(root)), false);
});

test('good rows and one bad row write nothing, and verdicts.jsonl does not change', async (t) => {
  const { root, deps, err } = setup(t);
  seedVerdicts(root, [{ ...staged(QUAL_1.id, 'reject'), checked_by: CHECK_AGENT, checked_at: NOW }]);
  const before = fs.readFileSync(verdictsPath(root), 'utf8');
  stageFile(root, 'QUGA', [
    staged(QUGA_1.id, 'approve', { channel: 'leaf' }),
    staged(QUGA_2.id, 'approve', { channel: 'twig' }),
    staged(QUGA_3.id, 'reject'),
  ]);

  assert.equal(await runCommand(['photos', 'apply', 'demo'], deps), 1);

  assert.match(err.join('\n'), /twig/);
  assert.equal(err[err.length - 1], 'nothing applied');
  assert.equal(fs.readFileSync(verdictsPath(root), 'utf8'), before);
});

test('a candidate staged twice with two verdicts writes nothing', async (t) => {
  const { root, deps, err } = setup(t);
  stageFile(root, 'QUGA', [staged(QUGA_1.id, 'reject'), staged(QUGA_3.id, 'reject')]);
  stageFile(root, 'QUAL', [staged(QUGA_1.id, 'approve', { channel: 'leaf' })]);

  assert.equal(await runCommand(['photos', 'apply', 'demo'], deps), 1);

  assert.ok(err.includes(`${QUGA_1.id} is staged twice with two different verdicts`), err.join(' | '));
  assert.equal(err[err.length - 1], 'nothing applied');
  assert.equal(fs.existsSync(verdictsPath(root)), false);
});

test('photos apply --file applies one named file', async (t) => {
  const { root, deps, err } = setup(t);
  writeJsonl(path.join(root, 'judge', 'QUGA.jsonl'), [staged(QUGA_1.id, 'reject')]);

  assert.equal(await runCommand(['photos', 'apply', 'demo', '--file', 'judge/QUGA.jsonl'], deps), 0, err.join(' | '));

  assert.deepEqual(verdictsOf(root).map((one) => one.candidate_id), [QUGA_1.id]);
});

test('photos apply with a missing --file exits 1, and with no staged file exits 0', async (t) => {
  const { deps, out, err } = setup(t);

  assert.equal(await runCommand(['photos', 'apply', 'demo', '--file', 'judge/none.jsonl'], deps), 1);
  assert.ok(err.includes('judge/none.jsonl: the file does not exist'), err.join(' | '));

  assert.equal(await runCommand(['photos', 'apply', 'demo'], deps), 0);
  assert.deepEqual(out, ['no staged verdicts in pipeline/runs/demo/staged']);
});
