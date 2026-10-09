# Run safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the content pipeline from writing on the wrong branch, from reading a failed `git show` as a first run, from applying verdicts one process at a time, and from failing a build on a new species that has no photo yet.

**Architecture:** Four changes to the CLI under `pipeline/`. New git helpers in `pipeline/lib/run.ts` read the branch and commit named paths. `gitShowOf` moves to `pipeline/lib/ids.ts` and throws on every failure except a missing path. A new pure module `pipeline/lib/verdict_apply.ts` parses, checks, and plans a batch of verdicts, and two new commands, `photos stage` and `photos apply`, use it. A new pure module `pipeline/lib/hold_back.ts` decides which new species the build holds back. `pipeline/lib/commands.ts` wires all four.

**Tech Stack:** Node 24 with TypeScript through Node's built-in type stripping. No new dependency. Tests run with `node --test`.

Source: the review brief of 2026-09-28 (four changes). The incident: another session switched the shared checkout to `main` mid-run on 2026-09-26. `images difficulty` then committed `pipeline/sources/` to `main` (commit `2e88ff7`), because `gitCommitAll` runs `git add -A` and `pipeline/sources/` was not git-ignored yet (`af0e7dd` added the ignore line later). 207 verdicts failed to apply in the same window.

## Global Constraints

- Prose in docs, skills, comments, and commit messages follows ASD-STE100 Simplified Technical English: short sentences, active voice, one word one meaning, plain words.
- TypeScript-only names are camelCase. Fields that land in JSON are snake_case.
- Node 24 or later. Erasable TypeScript syntax only: no enums, no parameter properties, no namespaces. A relative import inside `pipeline/` carries the `.ts` extension.
- `pipeline/lib/commands.ts` imports nothing that needs `node_modules`. The new modules import only Node built-ins and other `pipeline/lib/` files.
- The machine is Windows 11. Build file paths with `path.join` or `path.resolve`. A path that goes to git is POSIX, with `/`.
- Write file content with the Write and Edit tools, not shell heredocs. Keep every Bash command under 5,000 bytes.
- Tests never touch the network and never run a real `git`. They use a fake `exec`.
- Out of scope: a worktree per run, a shared cache, and the rest of the `photo-check` rewrite. A later PR does them.
- Commit each task with named paths only. Stage new files first, then commit the same paths:
  `git add -- <paths>` and then
  `git commit -m "<type>: <subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <paths>`
- Test commands. One file: `node --test pipeline/tests/<file>.test.ts`. The pipeline suite: `npm run test:pipeline`. The app suite: `npm test`. Everything: `npm run test:all` (the live suite needs the network). Before this work the counts are app 259 and pipeline 476.
- The repo has no typecheck script and no lint script. `package.json` has no `tsc`, and there is no `tsconfig.json`. Do not add one.

---

## Execution notes

- All tasks run in one worktree: `C:\Users\jdennen\Dendro\.claude\worktrees\fix-run-safety`, branch `fix/run-safety`. Run `npm ci` there once before the first test.
- **Wave A: Tasks 1, 2, 3, 4, 5, and 6 run in parallel.** Their files are disjoint (see the table below). Each implementer runs only its own test file. Two commits at the same moment can meet a `.git/index.lock` error. Wait five seconds and run the commit again.
- After wave A, the orchestrator runs `npm run test:pipeline` once.
- **Wave B: Tasks 7, 8, 9, and 10 run one at a time, in that order.** Each one edits `pipeline/lib/commands.ts`, and Tasks 7, 8, and 10 edit `pipeline/tests/cli_build.test.ts`.
- **Task 11** is verification. The orchestrator runs it.
- At the end of each wave B task, `npm run test:pipeline` passes before the commit.

## File structure

| File | Task | Change | Responsibility |
|---|---|---|---|
| `pipeline/lib/run.ts` | 1, 7 | Modify | `currentBranch`, `runBranch`, `runPaths`, `CONTENT_PATHS`, `requireRunBranch`, `requireContentBranch`, `gitCommitPaths`, `replace` flag. Task 7 deletes `gitCommitAll`. |
| `pipeline/tests/helpers.ts` | 1 | Modify | `fakeExec` answers `git symbolic-ref` from a `branch` field. New `changes(exec)`. |
| `pipeline/tests/run.test.ts` | 1, 7 | Modify | Tests of the new helpers. Task 7 deletes the `gitCommitAll` tests. |
| `pipeline/lib/ids.ts` | 2 | Modify | `gitShowOf(exec, base)`: null for a missing path only. |
| `pipeline/tests/ids.test.ts` | 2 | Modify | Tests of `gitShowOf`. |
| `pipeline/lib/jsonl.ts` | 3 | Modify | `appendJsonl` reads the last byte, not the whole file. |
| `pipeline/tests/jsonl.test.ts` | 3 | Modify | A test that `appendJsonl` calls no `readFileSync`. |
| `pipeline/lib/verdict_apply.ts` | 4 | Create | Staged paths, line parser, row checks, the apply plan, counts, and output text. |
| `pipeline/tests/verdict_apply.test.ts` | 4 | Create | Tests of the module. |
| `pipeline/lib/hold_back.ts` | 5 | Create | `HELD_BACK` and `isHeldBack`. |
| `pipeline/tests/hold_back.test.ts` | 5 | Create | Tests of the rule. |
| `.claude/skills/photo-check/SKILL.md` | 6 | Modify | The stage and apply steps only. |
| `.claude/skills/content-run/SKILL.md` | 6 | Modify | Commits, the branch check, step 5, the hold-back in step 6 and step 8. |
| `.claude/skills/species-draft/SKILL.md` | 6 | Modify | One paragraph: draft every species, the build holds back a species with no photo. |
| `pipeline/lib/commands.ts` | 7, 8, 9, 10 | Modify | The guard and the commits (7), `gitShowOf` (8), `photos stage` and `photos apply` (9), the hold-back (10). |
| `pipeline/tests/cli_fetch.test.ts` | 7 | Modify | The guard, and the exec call lists that the guard changes. |
| `pipeline/tests/cli_build.test.ts` | 7, 8, 10 | Modify | The fake exec, the guard, the commit paths, `git show` failures, the hold-back. |
| `pipeline/tests/cli_verdicts.test.ts` | 9 | Create | `photos stage` and `photos apply` end to end. |
| `.gitignore` | 9 | Modify | Ignore `pipeline/runs/*/staged/`. |

## Choices made where the brief is silent

1. **The branch read is `git symbolic-ref --short -q HEAD`.** It exits 0 with the branch name, 1 on a detached HEAD, and 128 outside a repository. The last case throws.
2. **Every run command checks the branch first, before it reads `run.json`.** On `main` the run directory is absent, and `readRun` would say "run does not exist". That message hides the real cause. `run finish` checks first too, because on `main` it would print `no decisions to apply` and exit 0.
3. **A run command checks the branch again right before its commit.** `photos fetch` can run for an hour. The second check stops the commit when the branch changed during the run. Files that the command wrote before the switch stay on disk. A worktree per run (a later PR) removes that gap.
4. **`run init` has no guard.** It is the command that checks out `content/<name>`.
5. **The run paths are `pipeline/runs/<name>`, `content`, `content_src`, and `pipeline/data`.** `species list` writes `pipeline/data/plants_ids.json`. `build` writes `content/species.json`, `content/images/manifest.json`, and `build.json`. The skills write `content_src/species/`, `look_for.json`, and `content/confusion.json`, and today the next CLI commit carries them. A path that does not exist on disk is left out of the command, because `git add` fails on a pathspec that matches nothing.
6. **Staging is `git add -A -- <paths>`, and the commit is `git commit -m … -m … -- <paths>`.** `-A` with a pathspec stages new, changed, and deleted files under those paths only. The pathspec on the commit keeps out any file that another session staged.
7. **A clean commit stays a success.** Git prints `nothing to commit`, `no changes added to commit`, or `nothing added to commit`, and exits 1. All three are success.
8. **`gitShowOf` matches git's own words for a missing path.** Git 2.52 prints `fatal: path '<p>' does not exist in '<ref>'`, or `fatal: path '<p>' exists on disk, but not in '<ref>'`, with exit code 128. Both give null. A bad ref gives `fatal: invalid object name '<ref>'.` with code 128, and that throws. A missing git or a cut-off read gives code 1 from `nodeExec`, and that throws. A git that prints its messages in another language throws too. That failure is loud, which is the safe side.
9. **The batch command is `photos apply`, not `photos verdict --file`.** `photos verdict` takes one row from flags and appends it with no conflict check. `photos apply` takes files, checks every row first, refuses a changed verdict, and prints counts. Two commands with two sets of flags are clearer than one command with two modes. `photos apply` and `photos stage` also read as a pair. `photos verdict` stays for a one-off fix.
10. **`photos stage` finds the target from the candidate row.** The brief suggests `photos stage <run> <target> …`. The candidate already names its target, so a second argument can only disagree with it.
11. **A staged file holds one target: `pipeline/runs/<name>/staged/<target>.jsonl`.** A concept key such as `bark/plated` has a slash, so its file is `bark.plated.jsonl`. One file per target lets parallel judges write with no shared file.
12. **A staged row is a verdict row without `checked_by` and `checked_at`.** `photos apply` adds the two fields. A line that carries them still parses, so a copy of `verdicts.jsonl` also applies. Any other unknown field is an error. The old scratch format used `candidate`, and the parser names that field.
13. **Two verdicts agree when the kind, the channel, the case, and the set of tags agree.** The note does not count. `apply.cjs` compared the same four fields.
14. **`photos apply` writes all or nothing.** One bad row, one row staged twice with two different verdicts, or one conflict stops the whole apply, and it writes no row. The same files applied twice give the same `verdicts.jsonl`.
15. **`photos apply` with no `--file` applies every file in `staged/`, in name order.** The staged files stay on disk after the apply. A second apply skips them as unchanged.
16. **The staged files are git-ignored.** `verdicts.jsonl` stays the record. An ignored file also survives a branch switch.
17. **`appendJsonl` reads one byte.** It opens the file, reads the last byte, and closes it. The change is five lines.
18. **The hold-back rule looks for any other file that names the species.** A new species is held back when no manifest row (of any status) targets it or one of its varieties, no confusion edge names it, and no unit `include` or `exclude` names it. When one of them names it, the build writes it and the validator decides, as today. Changed on 2026-10-09 (open question 3): only a row on the symbol that is not retired and not `hard` keeps a new species in, as in the validator. The build drops every row of a held-back species that the base manifest does not hold, and does not upload their files. It never drops a retired row: a held-back species that has a retired row the base manifest does not hold still stops the build, and the run owner fixes it by hand. One gap stays: a unit whose `genera` or `section` names a genus that only the held-back species has fails with `genera names unknown <genus>`. The message is clear, and the real units name large genera, so the rule does not check it.
19. **"Published" means the base ref's `content/species.json` holds the symbol.** The build already reads that file through `readPublished` for the append-only check. The build reads it once, before the species loop.
20. **A held-back species gets status `no_photos` and the reason `held back: no photo and no confusion edge`.** `statusOf` (`commands.ts:1476-1488`) already gives `no_photos` to a written species with no live photo. The reason tells the two apart. The report's species table prints the status and the reason, so the report lists it with no change to `report.ts`. The gap list keeps it, because `GAP_STATUSES` holds `no_photos`.

---

### Task 1: Git helpers for the branch guard and named-path commits

**Files:**
- Modify: `pipeline/lib/run.ts:34` (`BOOLEAN_FLAGS`), and append after `gitCommitAll` (`:241-248`)
- Modify: `pipeline/tests/helpers.ts:10-19`
- Test: `pipeline/tests/run.test.ts`

**Interfaces:**
- Consumes: `Exec` from `pipeline/lib/run.ts`; the private `mustRun` and `CO_AUTHOR` in the same file.
- Produces, in `pipeline/lib/run.ts`:
  - `BOOLEAN_FLAGS` gains `'replace'`.
  - `runBranch(name: string): string` gives `content/<name>`.
  - `runPaths(name: string): string[]` gives `['pipeline/runs/<name>', 'content', 'content_src', 'pipeline/data']`.
  - `CONTENT_PATHS: string[]` is `['content/species.json', 'content/images/manifest.json']`.
  - `currentBranch(exec: Exec): string | null`.
  - `requireRunBranch(exec: Exec, name: string): void` throws unless HEAD is `content/<name>`.
  - `requireContentBranch(exec: Exec): string` throws unless HEAD is a `content/` branch, and returns the branch.
  - `gitCommitPaths(exec: Exec, message: string, paths: string[]): void`.
- Produces, in `pipeline/tests/helpers.ts`:
  - `type FakeExec = Exec & { calls: ExecCall[]; queue: { code: number; out: string }[]; branch: string | null }`.
  - `fakeExec(branch?: string | null): FakeExec`. The default branch is `content/demo`.
  - `changes(exec: { calls: ExecCall[] }): ExecCall[]`: every call except `git symbolic-ref`.

- [ ] **Step 1: Write the failing tests**

In `pipeline/tests/run.test.ts`, add `BOOLEAN_FLAGS`, `CONTENT_PATHS`, `currentBranch`, `gitCommitPaths`, `requireContentBranch`, `requireRunBranch`, `runBranch`, and `runPaths` to the import from `../lib/run.ts`. Change the helpers import to `import { changes, fakeExec } from './helpers.ts';`. Append these tests at the end of the file:

```ts
/** An exec that gives one answer to every call. */
function answering(code: number, out: string): Exec {
  return () => ({ code, out });
}

test('parseFlags takes --replace as a flag with no value', () => {
  assert.ok(BOOLEAN_FLAGS.includes('replace'));
  assert.deepEqual(parseFlags(['--replace']), { replace: 'true' });
});

test('runBranch and runPaths name the branch and the paths of a run', () => {
  assert.equal(runBranch('simple_lobed_us'), 'content/simple_lobed_us');
  assert.deepEqual(runPaths('simple_lobed_us'), [
    'pipeline/runs/simple_lobed_us',
    'content',
    'content_src',
    'pipeline/data',
  ]);
  assert.deepEqual(CONTENT_PATHS, ['content/species.json', 'content/images/manifest.json']);
});

test('currentBranch reads the branch, gives null on a detached HEAD, and throws outside a repo', () => {
  const exec = fakeExec('content/demo');
  assert.equal(currentBranch(exec), 'content/demo');
  assert.deepEqual(exec.calls, [
    { command: 'git', args: ['symbolic-ref', '--short', '-q', 'HEAD'] },
  ]);
  assert.equal(currentBranch(fakeExec(null)), null);
  assert.throws(
    () => currentBranch(answering(128, 'fatal: not a git repository')),
    /not a git repository/,
  );
});

test('requireRunBranch passes on content/<name> and names both branches otherwise', () => {
  assert.doesNotThrow(() => requireRunBranch(fakeExec('content/demo'), 'demo'));
  assert.throws(
    () => requireRunBranch(fakeExec('main'), 'demo'),
    /run demo needs branch content\/demo, and HEAD is on main/,
  );
  assert.throws(
    () => requireRunBranch(fakeExec('content/other'), 'demo'),
    /HEAD is on content\/other/,
  );
  assert.throws(() => requireRunBranch(fakeExec(null), 'demo'), /HEAD is detached/);
});

test('requireContentBranch passes on any content/ branch and stops on main', () => {
  assert.equal(requireContentBranch(fakeExec('content/fixes')), 'content/fixes');
  assert.throws(
    () => requireContentBranch(fakeExec('main')),
    /only on a content\/ branch, and HEAD is on main/,
  );
  assert.throws(() => requireContentBranch(fakeExec(null)), /HEAD is detached/);
});

test('gitCommitPaths stages and commits the named paths only', () => {
  const exec = fakeExec();
  gitCommitPaths(exec, 'content(demo): report', ['pipeline/runs/demo', 'content']);
  assert.deepEqual(exec.calls, [
    { command: 'git', args: ['add', '-A', '--', 'pipeline/runs/demo', 'content'] },
    {
      command: 'git',
      args: [
        'commit',
        '-m',
        'content(demo): report',
        '-m',
        'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>',
        '--',
        'pipeline/runs/demo',
        'content',
      ],
    },
  ]);
});

test('gitCommitPaths accepts each of the three clean-tree answers', () => {
  const answers = [
    'nothing to commit, working tree clean',
    'no changes added to commit (use "git add" and/or "git commit -a")',
    'nothing added to commit but untracked files present',
  ];
  for (const answer of answers) {
    const exec = fakeExec();
    exec.queue.push({ code: 0, out: '' });
    exec.queue.push({ code: 1, out: answer });
    assert.doesNotThrow(() => gitCommitPaths(exec, 'content(demo): nothing', ['content']), answer);
  }
});

test('gitCommitPaths throws on no paths and on a failed commit', () => {
  assert.throws(() => gitCommitPaths(fakeExec(), 'm', []), /at least one path/);
  const exec = fakeExec();
  exec.queue.push({ code: 0, out: '' });
  exec.queue.push({ code: 128, out: 'fatal: unable to write new index file' });
  assert.throws(() => gitCommitPaths(exec, 'm', ['content']), /unable to write new index file/);
});

test('fakeExec answers symbolic-ref from its branch field, and changes() leaves that call out', () => {
  const exec = fakeExec();
  exec.branch = 'main';
  assert.deepEqual(exec('git', ['symbolic-ref', '--short', '-q', 'HEAD']), { code: 0, out: 'main' });
  exec('git', ['status']);
  assert.deepEqual(changes(exec), [{ command: 'git', args: ['status'] }]);
});
```

The trailer in `CO_AUTHOR` (`run.ts:31`) stays as it is. The test copies it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test pipeline/tests/run.test.ts`
Expected: FAIL. The import of `currentBranch` and the other new names fails with a `SyntaxError` that names a missing export.

- [ ] **Step 3: Extend the fake exec**

Replace lines 10-19 of `pipeline/tests/helpers.ts` (the `fakeExec` function and its comment) with:

```ts
export type FakeExec = Exec & {
  calls: ExecCall[];
  queue: { code: number; out: string }[];
  /** What `git symbolic-ref` answers. Null is a detached HEAD. */
  branch: string | null;
};

/**
 * Records every call. `queue` holds the results the next calls return, in order. A
 * `git symbolic-ref` call reads `branch` and takes nothing from the queue, so the run
 * guard does not shift the answers a test queued.
 */
export function fakeExec(branch: string | null = 'content/demo'): FakeExec {
  const calls: ExecCall[] = [];
  const queue: { code: number; out: string }[] = [];
  const exec = (command: string, args: string[]): { code: number; out: string } => {
    calls.push({ command, args });
    if (command === 'git' && args[0] === 'symbolic-ref') {
      return fake.branch === null ? { code: 1, out: '' } : { code: 0, out: fake.branch };
    }
    return queue.shift() ?? { code: 0, out: '' };
  };
  const fake: FakeExec = Object.assign(exec, { calls, queue, branch });
  return fake;
}

/** Every call except the branch reads of the run guard. A test of what a command changes reads these. */
export function changes(exec: { calls: ExecCall[] }): ExecCall[] {
  return exec.calls.filter((call) => !(call.command === 'git' && call.args[0] === 'symbolic-ref'));
}
```

- [ ] **Step 4: Write the helpers in `run.ts`**

In `pipeline/lib/run.ts`, change line 34 to:

```ts
export const BOOLEAN_FLAGS: string[] = ['refresh', 'manifest', 'clear', 'replace'];
```

Append after `gitCommitAll` (after line 248):

```ts
/** The branch that every command of run <name> writes on. `run init` creates it. */
export function runBranch(name: string): string {
  return `content/${name}`;
}

/**
 * The paths a run commit stages. `git add -A -- <paths>` stages new, changed, and deleted
 * files under these paths only, so no file outside them reaches a run commit.
 */
export function runPaths(name: string): string[] {
  return [`pipeline/runs/${name}`, 'content', 'content_src', 'pipeline/data'];
}

/** The two files that `images retire`, `images difficulty`, and `species retire` write. */
export const CONTENT_PATHS: string[] = ['content/species.json', 'content/images/manifest.json'];

/** Git's words for a commit with nothing staged under its paths. Git exits 1 on each. */
const NOTHING_TO_COMMIT = /nothing to commit|no changes added to commit|nothing added to commit/;

/** The branch that HEAD names, or null on a detached HEAD. */
export function currentBranch(exec: Exec): string | null {
  const result = exec('git', ['symbolic-ref', '--short', '-q', 'HEAD']);
  if (result.code === 0) return result.out.trim();
  // `-q` makes git exit 1 with no message on a detached HEAD.
  if (result.code === 1) return null;
  throw new Error(`git symbolic-ref failed with code ${result.code}: ${result.out}`);
}

function headText(branch: string | null): string {
  return branch === null ? 'detached' : `on ${branch}`;
}

/**
 * Another session can switch a shared checkout. A run command that then writes or commits
 * puts run files on the wrong branch, so each one calls this first.
 */
export function requireRunBranch(exec: Exec, name: string): void {
  const branch = currentBranch(exec);
  const wanted = runBranch(name);
  if (branch === wanted) return;
  throw new Error(
    `run ${name} needs branch ${wanted}, and HEAD is ${headText(branch)}. The command stopped. Check out ${wanted}, and check that no other session uses this checkout.`,
  );
}

/** The images and species commands edit content/ outside a run. They never commit on main. */
export function requireContentBranch(exec: Exec): string {
  const branch = currentBranch(exec);
  if (branch !== null && branch.startsWith('content/')) return branch;
  throw new Error(
    `this command commits content/ only on a content/ branch, and HEAD is ${headText(branch)}. The command stopped. Check out or create a content/<name> branch first.`,
  );
}

/**
 * Stages and commits the named paths only. The pathspec on the commit also keeps out a file
 * that another session staged.
 */
export function gitCommitPaths(exec: Exec, message: string, paths: string[]): void {
  if (paths.length === 0) throw new Error('gitCommitPaths needs at least one path.');
  mustRun(exec, 'git', ['add', '-A', '--', ...paths]);
  const result = exec('git', ['commit', '-m', message, '-m', CO_AUTHOR, '--', ...paths]);
  if (result.code === 0) return;
  // A step that changed nothing under its paths is not a failure.
  if (NOTHING_TO_COMMIT.test(result.out)) return;
  throw new Error(`git commit failed with code ${result.code}: ${result.out}`);
}
```

Leave `gitCommitAll` in place. `commands.ts` still calls it until Task 7.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test pipeline/tests/run.test.ts`
Expected: PASS, every test.

- [ ] **Step 6: Commit**

```bash
git add -- pipeline/lib/run.ts pipeline/tests/run.test.ts pipeline/tests/helpers.ts
git commit -m "feat(cli): git helpers for the branch guard and named-path commits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- pipeline/lib/run.ts pipeline/tests/run.test.ts pipeline/tests/helpers.ts
```

---

### Task 2: `gitShowOf` tells a missing path from a failure

**Files:**
- Modify: `pipeline/lib/ids.ts` (add an import at the top and a function after `appendOnlyErrors`, before `readPublished` at `:65`)
- Test: `pipeline/tests/ids.test.ts`

**Interfaces:**
- Consumes: `type Exec` from `pipeline/lib/run.ts` (a type-only import).
- Produces: `gitShowOf(exec: Exec, base: string): (file: string) => string | null` in `pipeline/lib/ids.ts`. It gives the file text, or null when git says the ref does not hold the path. It throws on every other failure. Task 8 wires it in.

- [ ] **Step 1: Write the failing tests**

In `pipeline/tests/ids.test.ts`, change the import line to:

```ts
import { collectIds, appendOnlyErrors, gitShowOf, readPublished } from '../lib/ids.ts';
import type { Exec } from '../lib/run.ts';
```

Append:

```ts
/** An exec that gives one answer to every call and records the arguments. */
function execAnswering(code: number, out: string): Exec & { calls: string[][] } {
  const calls: string[][] = [];
  const exec = (_command: string, args: string[]): { code: number; out: string } => {
    calls.push(args);
    return { code, out };
  };
  return Object.assign(exec, { calls });
}

test('gitShowOf gives the file text and asks git for <base>:<file>', () => {
  const exec = execAnswering(0, '{"QUGA":{}}');
  assert.equal(gitShowOf(exec, 'origin/main')('content/species.json'), '{"QUGA":{}}');
  assert.deepEqual(exec.calls, [['show', 'origin/main:content/species.json']]);
});

test('gitShowOf gives null when git says the ref does not hold the path', () => {
  const missing = execAnswering(128, "fatal: path 'content/species.json' does not exist in 'main'");
  assert.equal(gitShowOf(missing, 'main')('content/species.json'), null);
  const onDisk = execAnswering(
    128,
    "fatal: path 'content/species.json' exists on disk, but not in 'main'",
  );
  assert.equal(gitShowOf(onDisk, 'main')('content/species.json'), null);
});

test('gitShowOf throws on a bad ref, a missing git, and a cut-off read', () => {
  const cases: [number, string][] = [
    [128, "fatal: invalid object name 'mian'."],
    [1, 'spawnSync git ENOENT'],
    [1, 'spawnSync git ENOBUFS'],
  ];
  for (const [code, out] of cases) {
    assert.throws(
      () => gitShowOf(execAnswering(code, out), 'mian')('content/species.json'),
      (error: Error) => error.message.includes(out) && error.message.includes('mian:content/species.json'),
      out,
    );
  }
});

test('readPublished through gitShowOf is a first run only when every file is missing', () => {
  const missing = execAnswering(128, "fatal: path 'x' does not exist in 'main'");
  assert.equal(readPublished(gitShowOf(missing, 'main')), null);
  const badRef = execAnswering(128, "fatal: invalid object name 'main'.");
  assert.throws(() => readPublished(gitShowOf(badRef, 'main')), /invalid object name/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test pipeline/tests/ids.test.ts`
Expected: FAIL with a `SyntaxError` that names the missing export `gitShowOf`.

- [ ] **Step 3: Write `gitShowOf`**

At the top of `pipeline/lib/ids.ts`, add:

```ts
import type { Exec } from './run.ts';
```

Insert before `export function readPublished` (line 65):

```ts
/** Git's two answers for a path that the ref does not hold. Git exits 128 on both. */
const NOT_IN_REF = /fatal: path '[^']*' (does not exist in|exists on disk, but not in) '/;
const GIT_FATAL = 128;

/**
 * Reads one file of a ref. Null means git said the ref does not hold the path. Every other
 * failure throws: a bad ref, a missing git, or a cut-off read would otherwise look like a
 * first run to `readPublished`, and the append-only check would pass on no content.
 */
export function gitShowOf(exec: Exec, base: string): (file: string) => string | null {
  return (file) => {
    const result = exec('git', ['show', `${base}:${file}`]);
    if (result.code === 0) return result.out;
    if (result.code === GIT_FATAL && NOT_IN_REF.test(result.out)) return null;
    throw new Error(`git show ${base}:${file} failed with code ${result.code}: ${result.out}`);
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test pipeline/tests/ids.test.ts`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add -- pipeline/lib/ids.ts pipeline/tests/ids.test.ts
git commit -m "fix(cli): git show fails loud unless the path is missing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- pipeline/lib/ids.ts pipeline/tests/ids.test.ts
```

---

### Task 3: `appendJsonl` reads one byte

**Files:**
- Modify: `pipeline/lib/jsonl.ts:18-29`
- Test: `pipeline/tests/jsonl.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `appendJsonl(filePath: string, rows: unknown[]): void` keeps its signature and its behaviour. It no longer reads the whole file.

- [ ] **Step 1: Write the failing test**

Append to `pipeline/tests/jsonl.test.ts`:

```ts
test('appendJsonl reads no whole file to find the last newline', (t) => {
  const file = path.join(tempDir(t), 'rows.jsonl');
  writeJsonl(file, [{ id: 'a' }]);
  const read = t.mock.method(fs, 'readFileSync');
  appendJsonl(file, [{ id: 'b' }]);
  assert.equal(read.mock.callCount(), 0);
  read.mock.restore();
  assert.deepEqual(readJsonl(file), [{ id: 'a' }, { id: 'b' }]);
});

test('appendJsonl adds the missing newline of a file with no last newline, and of an empty file none', (t) => {
  const dir = tempDir(t);
  const joined = path.join(dir, 'joined.jsonl');
  fs.writeFileSync(joined, '{"id":"a"}', 'utf8');
  appendJsonl(joined, [{ id: 'b' }]);
  assert.equal(fs.readFileSync(joined, 'utf8'), '{"id":"a"}\n{"id":"b"}\n');

  const empty = path.join(dir, 'empty.jsonl');
  fs.writeFileSync(empty, '', 'utf8');
  appendJsonl(empty, [{ id: 'c' }]);
  assert.equal(fs.readFileSync(empty, 'utf8'), '{"id":"c"}\n');
});
```

- [ ] **Step 2: Run the tests to verify the first one fails**

Run: `node --test pipeline/tests/jsonl.test.ts`
Expected: FAIL on `appendJsonl reads no whole file`: the call count is 1, not 0. The second new test passes already.

- [ ] **Step 3: Read the last byte only**

Replace lines 18-29 of `pipeline/lib/jsonl.ts` (`appendJsonl`) with:

```ts
/** Appends rows. It creates the parent directory and the file when they are absent. */
export function appendJsonl(filePath: string, rows: unknown[]): void {
  if (rows.length === 0) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // A file another tool wrote can lack the last newline. Add one so no two rows join.
  const text = (lacksLastNewline(filePath) ? '\n' : '') + serialize(rows);
  fs.appendFileSync(filePath, text, 'utf8');
}

/** Reads the last byte only. A verdicts file of a big run holds thousands of rows. */
function lacksLastNewline(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const size = fs.statSync(filePath).size;
  if (size === 0) return false;
  const fd = fs.openSync(filePath, 'r');
  try {
    const last = Buffer.alloc(1);
    fs.readSync(fd, last, 0, 1, size - 1);
    return last[0] !== 0x0a;
  } finally {
    fs.closeSync(fd);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test pipeline/tests/jsonl.test.ts`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add -- pipeline/lib/jsonl.ts pipeline/tests/jsonl.test.ts
git commit -m "perf(cli): appendJsonl reads the last byte only" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- pipeline/lib/jsonl.ts pipeline/tests/jsonl.test.ts
```

---

### Task 4: The staged verdict module

**Files:**
- Create: `pipeline/lib/verdict_apply.ts`
- Test: `pipeline/tests/verdict_apply.test.ts` (create)

**Interfaces:**
- Consumes: `type Candidate` from `pipeline/lib/candidates.ts`; `stopRule`, `validateVerdicts`, and `type Verdict` from `pipeline/lib/verdicts.ts`.
- Produces, in `pipeline/lib/verdict_apply.ts` (Task 9 uses every one):
  - `type StagedVerdict = Omit<Verdict, 'checked_by' | 'checked_at'>`
  - `OWNER = 'owner'`
  - `stagedDir(runDirectory: string): string`
  - `stagedPath(runDirectory: string, target: string): string`
  - `parseStagedLines(text: string, label: string): { rows: StagedVerdict[]; errors: string[] }`
  - `stagedErrors(rows: StagedVerdict[], candidates: Candidate[], channels: string[], label: string): string[]`
  - `stamp(row: StagedVerdict, by: string, at: string): Verdict`
  - `sameVerdict(a: StagedVerdict, b: StagedVerdict): boolean`
  - `interface Conflict { candidate_id: string; recorded: Verdict; staged: StagedVerdict; owner: boolean }`
  - `interface ApplyPlan { append: StagedVerdict[]; unchanged: string[]; conflicts: Conflict[]; errors: string[] }`
  - `planApply(recorded: Verdict[], input: StagedVerdict[], replace: boolean): ApplyPlan`
  - `targetChannels(target: string, runChannels: string[], concepts: string[]): string[]`
  - `interface TargetCounts { approved: Record<string, number>; hard: number }`
  - `targetCounts(target: string, verdicts: Verdict[], candidates: Candidate[], hard: Set<string>): TargetCounts`
  - `countsText(counts: TargetCounts, channels: string[]): string`
  - `stopText(verdicts: Verdict[]): string`
  - `verdictText(row: StagedVerdict): string`
  - `conflictText(conflict: Conflict): string`

- [ ] **Step 1: Write the failing tests**

Create `pipeline/tests/verdict_apply.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { makeCandidate, type Candidate } from '../lib/candidates.ts';
import type { Verdict } from '../lib/verdicts.ts';
import {
  OWNER,
  conflictText,
  countsText,
  parseStagedLines,
  planApply,
  sameVerdict,
  stagedDir,
  stagedErrors,
  stagedPath,
  stamp,
  stopText,
  targetChannels,
  targetCounts,
  type StagedVerdict,
} from '../lib/verdict_apply.ts';

function candidate(target: string, index: number): Candidate {
  return makeCandidate({
    target,
    source_key: 'manual',
    origin: `https://example.org/${target}/${index}`,
    file_url: `https://example.org/${target}/${index}.jpg`,
  });
}

const A = candidate('QUGA', 1);
const B = candidate('QUGA', 2);
const C = candidate('QUAL', 1);
const PLATED = candidate('bark/plated', 1);
const CANDIDATES = [A, B, C, PLATED];

function row(id: string, verdict: StagedVerdict['verdict'], extra: Partial<StagedVerdict> = {}): StagedVerdict {
  return { candidate_id: id, verdict, channel: null, tags: [], case: null, note: 'a note', ...extra };
}

function recorded(one: StagedVerdict, by = 'photo_check_agent'): Verdict {
  return stamp(one, by, '2026-09-28T10:00:00Z');
}

test('stagedPath puts one file per target under staged/, with a dot for the slash of a concept key', () => {
  const dir = path.join('pipeline', 'runs', 'demo');
  assert.equal(stagedDir(dir), path.join(dir, 'staged'));
  assert.equal(stagedPath(dir, 'QUGA'), path.join(dir, 'staged', 'QUGA.jsonl'));
  assert.equal(stagedPath(dir, 'bark/plated'), path.join(dir, 'staged', 'bark.plated.jsonl'));
});

test('parseStagedLines reads each line, fills the optional fields, and skips blank lines', () => {
  const text = [
    JSON.stringify({ candidate_id: A.id, verdict: 'approve', channel: 'leaf', tags: ['winter'], note: 'Leaf.' }),
    '',
    JSON.stringify({ candidate_id: B.id, verdict: 'reject', note: 'Blurred.' }),
    JSON.stringify({ ...row(C.id, 'reject'), checked_by: 'owner', checked_at: '2026-09-01' }),
  ].join('\n');
  const parsed = parseStagedLines(text, 'QUGA.jsonl');
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows, [
    row(A.id, 'approve', { channel: 'leaf', tags: ['winter'], note: 'Leaf.' }),
    row(B.id, 'reject', { note: 'Blurred.' }),
    row(C.id, 'reject'),
  ]);
});

test('parseStagedLines names the file, the line, and the fault of each bad line', () => {
  const text = [
    'not json',
    '[1,2]',
    JSON.stringify({ candidate: A.id, verdict: 'approve', note: 'old format' }),
    JSON.stringify({ candidate_id: A.id, verdict: 'approve', tags: 'leaf', note: 'x' }),
    JSON.stringify({ candidate_id: A.id, verdict: 'approve', note: '  ' }),
  ].join('\n');
  const parsed = parseStagedLines(text, 'staged/QUGA.jsonl');
  assert.deepEqual(parsed.rows, []);
  assert.equal(parsed.errors.length, 5);
  assert.match(parsed.errors[0], /^staged\/QUGA\.jsonl:1: not JSON/);
  assert.equal(parsed.errors[1], 'staged/QUGA.jsonl:2: the line is not a JSON object');
  assert.equal(parsed.errors[2], 'staged/QUGA.jsonl:3: unknown field candidate');
  assert.equal(parsed.errors[3], 'staged/QUGA.jsonl:4: tags is not an array of strings');
  assert.equal(parsed.errors[4], 'staged/QUGA.jsonl:5: note is empty');
});

test('stagedErrors runs validateVerdicts and names the staged file', () => {
  const errors = stagedErrors(
    [row('deadbeef', 'approve', { channel: 'leaf' }), row(A.id, 'approve', { channel: 'twig' })],
    CANDIDATES,
    ['leaf', 'bark'],
    'staged/QUGA.jsonl',
  );
  assert.equal(errors.length, 2);
  assert.equal(errors[0], 'staged/QUGA.jsonl: deadbeef names no candidate');
  assert.match(errors[1], /^staged\/QUGA\.jsonl: .* channel twig, which this run does not cover/);
});

test('sameVerdict compares the kind, the channel, the case, and the tags as a set, not the note', () => {
  const one = row(A.id, 'approve', { channel: 'leaf', tags: ['a', 'b'], note: 'first' });
  assert.equal(sameVerdict(one, { ...one, tags: ['b', 'a'], note: 'second' }), true);
  assert.equal(sameVerdict(one, { ...one, channel: 'bark' }), false);
  assert.equal(sameVerdict(one, { ...one, verdict: 'reject' }), false);
  assert.equal(sameVerdict(one, { ...one, tags: ['a'] }), false);
  assert.equal(sameVerdict(row(A.id, 'escalate', { case: 'license' }), row(A.id, 'escalate', { case: 'quality' })), false);
});

test('planApply appends new rows, skips agreeing rows, and reports a changed verdict as a conflict', () => {
  const past = [recorded(row(A.id, 'reject')), recorded(row(B.id, 'approve', { channel: 'leaf' }))];
  const input = [
    row(A.id, 'approve', { channel: 'leaf' }),
    row(B.id, 'approve', { channel: 'leaf', note: 'new words' }),
    row(C.id, 'reject'),
  ];
  const plan = planApply(past, input, false);
  assert.deepEqual(plan.append, [row(C.id, 'reject')]);
  assert.deepEqual(plan.unchanged, [B.id]);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].candidate_id, A.id);
  assert.equal(plan.conflicts[0].owner, false);
  assert.deepEqual(plan.errors, []);
});

test('planApply --replace appends the changed row, but never over an owner decision', () => {
  const past = [recorded(row(A.id, 'reject')), recorded(row(B.id, 'reject'), OWNER)];
  const input = [row(A.id, 'approve', { channel: 'leaf' }), row(B.id, 'approve', { channel: 'leaf' })];
  const plan = planApply(past, input, true);
  assert.deepEqual(plan.append, [input[0]]);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].candidate_id, B.id);
  assert.equal(plan.conflicts[0].owner, true);
});

test('planApply reads the last recorded row per candidate', () => {
  const past = [recorded(row(A.id, 'escalate', { case: 'quality' })), recorded(row(A.id, 'reject'), OWNER)];
  assert.deepEqual(planApply(past, [row(A.id, 'reject')], false).unchanged, [A.id]);
});

test('planApply takes a row staged twice once, and names a row staged twice with two verdicts', () => {
  const same = planApply([], [row(A.id, 'reject'), row(A.id, 'reject', { note: 'again' })], false);
  assert.deepEqual(same.append, [row(A.id, 'reject')]);
  assert.deepEqual(same.errors, []);
  const split = planApply([], [row(A.id, 'reject'), row(A.id, 'approve', { channel: 'leaf' })], false);
  assert.deepEqual(split.errors, [`${A.id} is staged twice with two different verdicts`]);
});

test('planApply over its own output changes nothing', () => {
  const input = [row(A.id, 'approve', { channel: 'leaf' }), row(C.id, 'reject')];
  const first = planApply([], input, false);
  const after = first.append.map((one) => recorded(one));
  const second = planApply(after, input, false);
  assert.deepEqual(second.append, []);
  assert.deepEqual(second.unchanged, [A.id, C.id]);
});

test('targetChannels gives a concept target its prefix and a species target every run channel', () => {
  assert.deepEqual(targetChannels('QUGA', ['leaf', 'bark'], []), ['leaf', 'bark']);
  assert.deepEqual(targetChannels('bark/plated', ['bark', 'leaf'], ['bark/plated', 'leaf/simple_lobed']), ['bark']);
});

test('targetCounts counts the last approve per candidate of one target, and a hard photo apart', () => {
  const verdicts = [
    recorded(row(A.id, 'reject')),
    recorded(row(A.id, 'approve', { channel: 'leaf' })),
    recorded(row(B.id, 'approve', { channel: 'bark', tags: ['hard'] })),
    recorded(row(C.id, 'approve', { channel: 'leaf' })),
  ];
  const counts = targetCounts('QUGA', verdicts, CANDIDATES, new Set([B.id]));
  assert.deepEqual(counts, { approved: { leaf: 1 }, hard: 1 });
  assert.equal(countsText(counts, ['leaf', 'bark', 'fruit']), 'approved leaf 1, bark 0, fruit 0; hard 1');
});

test('stopText gives the stop-rule numbers with one decimal place', () => {
  const verdicts = [recorded(row(A.id, 'escalate', { case: 'quality' })), recorded(row(B.id, 'reject')), recorded(row(C.id, 'reject'))];
  assert.equal(stopText(verdicts), 'judged 3, escalated 1 (33.3%), stop rule not fired');
  assert.equal(stopText([]), 'judged 0, escalated 0 (0.0%), stop rule not fired');
});

test('conflictText names both verdicts and the way out', () => {
  const agent = { candidate_id: A.id, recorded: recorded(row(A.id, 'reject')), staged: row(A.id, 'approve', { channel: 'leaf', tags: ['hard'] }), owner: false };
  assert.equal(
    conflictText(agent),
    `conflict: ${A.id} is recorded as reject and staged as approve leaf [hard]. Run again with --replace to record the staged verdict.`,
  );
  const owner = { ...agent, owner: true };
  assert.match(conflictText(owner), /is an owner decision\. --replace does not change it\.$/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test pipeline/tests/verdict_apply.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../lib/verdict_apply.ts`.

- [ ] **Step 3: Write the module**

Create `pipeline/lib/verdict_apply.ts`:

```ts
import path from 'node:path';

import type { Candidate } from './candidates.ts';
import { stopRule, validateVerdicts, type Verdict } from './verdicts.ts';

/** A verdict as a judge stages it. `photos apply` adds `checked_by` and `checked_at`. */
export type StagedVerdict = Omit<Verdict, 'checked_by' | 'checked_at'>;

/** The `checked_by` of a row that `run finish` wrote from decisions.json. */
export const OWNER = 'owner';

const STAGED_FIELDS = new Set(['candidate_id', 'verdict', 'channel', 'tags', 'case', 'note']);
/** Read and dropped, so a line copied from verdicts.jsonl also parses. */
const STAMP_FIELDS = new Set(['checked_by', 'checked_at']);

export function stagedDir(runDirectory: string): string {
  return path.join(runDirectory, 'staged');
}

/** One file per target. A concept key such as bark/plated has a slash, so its file is bark.plated.jsonl. */
export function stagedPath(runDirectory: string, target: string): string {
  return path.join(stagedDir(runDirectory), `${target.replace(/\//g, '.')}.jsonl`);
}

/** Parses a staged file. Each message names the label, the line number, and the fault. */
export function parseStagedLines(
  text: string,
  label: string,
): { rows: StagedVerdict[]; errors: string[] } {
  const rows: StagedVerdict[] = [];
  const errors: string[] = [];
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') return;
    const where = `${label}:${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch (error) {
      errors.push(`${where}: not JSON: ${(error as Error).message}`);
      return;
    }
    const fault = shapeFault(value);
    if (fault !== null) {
      errors.push(`${where}: ${fault}`);
      return;
    }
    const one = value as Record<string, unknown>;
    rows.push({
      candidate_id: one.candidate_id as string,
      verdict: one.verdict as StagedVerdict['verdict'],
      channel: (one.channel ?? null) as string | null,
      tags: (one.tags ?? []) as string[],
      case: (one.case ?? null) as StagedVerdict['case'],
      note: one.note as string,
    });
  });
  return { rows, errors };
}

/** The shape only. `stagedErrors` checks the kind, the case, and the channel. */
function shapeFault(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'the line is not a JSON object';
  }
  const one = value as Record<string, unknown>;
  for (const key of Object.keys(one)) {
    if (!STAGED_FIELDS.has(key) && !STAMP_FIELDS.has(key)) return `unknown field ${key}`;
  }
  if (typeof one.candidate_id !== 'string' || one.candidate_id === '') {
    return 'candidate_id is not a string';
  }
  if (typeof one.verdict !== 'string') return 'verdict is not a string';
  if (one.channel !== undefined && one.channel !== null && typeof one.channel !== 'string') {
    return 'channel is not a string or null';
  }
  const tags = one.tags;
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))) {
    return 'tags is not an array of strings';
  }
  if (one.case !== undefined && one.case !== null && typeof one.case !== 'string') {
    return 'case is not a string or null';
  }
  if (typeof one.note !== 'string' || one.note.trim() === '') return 'note is empty';
  return null;
}

/** `validateVerdicts` on staged rows. Its messages name verdicts.jsonl, so each one names the label instead. */
export function stagedErrors(
  rows: StagedVerdict[],
  candidates: Candidate[],
  channels: string[],
  label: string,
): string[] {
  const stamped = rows.map((one) => stamp(one, '', ''));
  return validateVerdicts(stamped, candidates, channels).map((message) =>
    message.replace(/^verdicts\.jsonl: /, `${label}: `),
  );
}

export function stamp(row: StagedVerdict, by: string, at: string): Verdict {
  return { ...row, checked_by: by, checked_at: at };
}

/** Two rows agree when the kind, the channel, the case, and the set of tags agree. The note does not count. */
export function sameVerdict(a: StagedVerdict, b: StagedVerdict): boolean {
  const tags = (one: StagedVerdict): string => [...one.tags].sort().join(',');
  return a.verdict === b.verdict && a.channel === b.channel && a.case === b.case && tags(a) === tags(b);
}

export interface Conflict {
  candidate_id: string;
  recorded: Verdict;
  staged: StagedVerdict;
  /** An owner row. `--replace` does not change it. */
  owner: boolean;
}

export interface ApplyPlan {
  /** The rows to append, in input order. */
  append: StagedVerdict[];
  /** The candidates whose last recorded row agrees with the staged row. */
  unchanged: string[];
  conflicts: Conflict[];
  /** A candidate staged twice with two different verdicts. */
  errors: string[];
}

/**
 * Pure. Decides what one apply writes. The last recorded row of a candidate is its verdict.
 * `replace` lets a staged row win over an agent row, and never over an owner row.
 */
export function planApply(recorded: Verdict[], input: StagedVerdict[], replace: boolean): ApplyPlan {
  const last = new Map<string, Verdict>();
  for (const one of recorded) last.set(one.candidate_id, one);
  const seen = new Map<string, StagedVerdict>();
  const plan: ApplyPlan = { append: [], unchanged: [], conflicts: [], errors: [] };
  for (const one of input) {
    const earlier = seen.get(one.candidate_id);
    if (earlier !== undefined) {
      if (!sameVerdict(earlier, one)) {
        plan.errors.push(`${one.candidate_id} is staged twice with two different verdicts`);
      }
      continue;
    }
    seen.set(one.candidate_id, one);
    const prior = last.get(one.candidate_id);
    if (prior === undefined) {
      plan.append.push(one);
      continue;
    }
    if (sameVerdict(prior, one)) {
      plan.unchanged.push(one.candidate_id);
      continue;
    }
    const owner = prior.checked_by === OWNER;
    if (replace && !owner) {
      plan.append.push(one);
      continue;
    }
    plan.conflicts.push({ candidate_id: one.candidate_id, recorded: prior, staged: one, owner });
  }
  return plan;
}

/** A concept target fills its own prefix. A species target fills every run channel. */
export function targetChannels(target: string, runChannels: string[], concepts: string[]): string[] {
  if (!concepts.includes(target)) return runChannels;
  return [target.slice(0, target.indexOf('/'))];
}

export interface TargetCounts {
  approved: Record<string, number>;
  hard: number;
}

/** The approved photos of one target per channel, from the last row per candidate. A hard photo counts in `hard` only. */
export function targetCounts(
  target: string,
  verdicts: Verdict[],
  candidates: Candidate[],
  hard: Set<string>,
): TargetCounts {
  const own = new Set(candidates.filter((one) => one.target === target).map((one) => one.id));
  const last = new Map<string, Verdict>();
  for (const one of verdicts) {
    if (own.has(one.candidate_id)) last.set(one.candidate_id, one);
  }
  const approved: Record<string, number> = {};
  let hardCount = 0;
  for (const one of last.values()) {
    if (one.verdict !== 'approve' || one.channel === null) continue;
    if (hard.has(one.candidate_id)) {
      hardCount += 1;
      continue;
    }
    approved[one.channel] = (approved[one.channel] ?? 0) + 1;
  }
  return { approved, hard: hardCount };
}

/** `approved leaf 6, bark 4, fruit 0; hard 1`. Every channel prints, with 0 for an empty one. */
export function countsText(counts: TargetCounts, channels: string[]): string {
  const parts = channels.map((channel) => `${channel} ${counts.approved[channel] ?? 0}`);
  return `approved ${parts.join(', ')}; hard ${counts.hard}`;
}

/** The run-wide stop-rule numbers. */
export function stopText(verdicts: Verdict[]): string {
  const rule = stopRule(verdicts);
  const percent = rule.judged === 0 ? 0 : (100 * rule.escalated) / rule.judged;
  const fired = rule.fired ? 'fired' : 'not fired';
  return `judged ${rule.judged}, escalated ${rule.escalated} (${percent.toFixed(1)}%), stop rule ${fired}`;
}

/** `approve leaf [hard]`, `escalate license`, or `reject`. */
export function verdictText(row: StagedVerdict): string {
  const parts: string[] = [row.verdict];
  if (row.channel !== null) parts.push(row.channel);
  if (row.case !== null) parts.push(row.case);
  if (row.tags.length > 0) parts.push(`[${row.tags.join(',')}]`);
  return parts.join(' ');
}

export function conflictText(conflict: Conflict): string {
  const fix = conflict.owner
    ? 'The recorded row is an owner decision. --replace does not change it.'
    : 'Run again with --replace to record the staged verdict.';
  return `conflict: ${conflict.candidate_id} is recorded as ${verdictText(conflict.recorded)} and staged as ${verdictText(conflict.staged)}. ${fix}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test pipeline/tests/verdict_apply.test.ts`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add -- pipeline/lib/verdict_apply.ts pipeline/tests/verdict_apply.test.ts
git commit -m "feat(cli): parse, check, and plan a batch of staged verdicts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- pipeline/lib/verdict_apply.ts pipeline/tests/verdict_apply.test.ts
```

---

### Task 5: The hold-back rule

**Files:**
- Create: `pipeline/lib/hold_back.ts`
- Test: `pipeline/tests/hold_back.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces, in `pipeline/lib/hold_back.ts` (Task 10 uses both):
  - `HELD_BACK = 'held back: no photo and no confusion edge'`
  - `interface HoldBackInput { symbol: string; targets: Set<string>; published: boolean; manifest: { target: string }[]; confusion: { a: string; b: string }[]; units: Record<string, unknown>[] }`
  - `isHeldBack(input: HoldBackInput): boolean`

- [ ] **Step 1: Write the failing tests**

Create `pipeline/tests/hold_back.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HELD_BACK, isHeldBack, type HoldBackInput } from '../lib/hold_back.ts';

function input(extra: Partial<HoldBackInput> = {}): HoldBackInput {
  return {
    symbol: 'QUAL',
    targets: new Set(['QUAL', 'QUALA']),
    published: false,
    manifest: [{ target: 'QUGA' }],
    confusion: [{ a: 'QUGA', b: 'QURU' }],
    units: [{ key: 'u', include: ['QUGA'], exclude: [] }],
    ...extra,
  };
}

test('a new species that no other file names is held back', () => {
  assert.equal(isHeldBack(input()), true);
  assert.equal(HELD_BACK, 'held back: no photo and no confusion edge');
});

test('a published species is never held back', () => {
  assert.equal(isHeldBack(input({ published: true })), false);
});

test('a manifest row on the species or one of its varieties keeps it in, whatever the row status', () => {
  assert.equal(isHeldBack(input({ manifest: [{ target: 'QUAL' }] })), false);
  assert.equal(isHeldBack(input({ manifest: [{ target: 'QUALA' }] })), false);
});

test('a confusion edge on either side keeps it in', () => {
  assert.equal(isHeldBack(input({ confusion: [{ a: 'QUAL', b: 'QUGA' }] })), false);
  assert.equal(isHeldBack(input({ confusion: [{ a: 'QUGA', b: 'QUAL' }] })), false);
});

test('a unit include or exclude that names it keeps it in', () => {
  assert.equal(isHeldBack(input({ units: [{ key: 'u', include: ['QUAL'] }] })), false);
  assert.equal(isHeldBack(input({ units: [{ key: 'u', exclude: ['QUAL'] }] })), false);
  assert.equal(isHeldBack(input({ units: [{ key: 'u' }] })), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test pipeline/tests/hold_back.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../lib/hold_back.ts`.

- [ ] **Step 3: Write the rule**

Create `pipeline/lib/hold_back.ts`:

```ts
/**
 * The reason a held-back species carries in build.json and in the report. Its status is
 * `no_photos`, the status of any species with no live photo.
 */
export const HELD_BACK = 'held back: no photo and no confusion edge';

export interface HoldBackInput {
  symbol: string;
  /** The symbol and its variety keys. A manifest row on any of them names the species. */
  targets: Set<string>;
  /** True when the base ref's content/species.json holds the symbol. */
  published: boolean;
  manifest: { target: string }[];
  confusion: { a: string; b: string }[];
  units: Record<string, unknown>[];
}

/**
 * The app validator fails a live species with no live photo and no confusion edge. A new
 * species that no other file names stays out of species.json instead, so one thin species
 * does not stop the build. A published species never stays out: species.json never loses a
 * published record, so the validator decides. When another file names the species, the
 * build writes it and the validator decides too, because leaving it out would break that file.
 */
export function isHeldBack(input: HoldBackInput): boolean {
  if (input.published) return false;
  if (input.manifest.some((row) => input.targets.has(row.target))) return false;
  if (input.confusion.some((edge) => edge.a === input.symbol || edge.b === input.symbol)) {
    return false;
  }
  return !input.units.some(
    (unit) => names(unit.include, input.symbol) || names(unit.exclude, input.symbol),
  );
}

function names(list: unknown, symbol: string): boolean {
  return Array.isArray(list) && list.includes(symbol);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test pipeline/tests/hold_back.test.ts`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add -- pipeline/lib/hold_back.ts pipeline/tests/hold_back.test.ts
git commit -m "feat(cli): the rule that holds back a new species with no photo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- pipeline/lib/hold_back.ts pipeline/tests/hold_back.test.ts
```

---

### Task 6: Skill updates

**Files:**
- Modify: `.claude/skills/photo-check/SKILL.md:3`, `:29-42`, `:190`, `:262`
- Modify: `.claude/skills/content-run/SKILL.md:15-18`, `:27`, `:94-100`, `:111`, `:232`, `:296-311`, `:322-323`
- Modify: `.claude/skills/species-draft/SKILL.md:15` (after step 3)

**Interfaces:**
- Consumes: the command names and output lines that Tasks 7, 9, and 10 produce: `photos stage`, `photos apply`, `--replace`, the counts line `<target>: approved leaf 6, bark 4; hard 1`, the reason `held back: no photo and no confusion edge`, and the branch errors.
- Produces: nothing that code reads.

The `photo-check` skill changes only where it names the apply step. A later PR rewrites the rest of it. Use the Edit tool for each change. Keep the STE rules of this plan.

- [ ] **Step 1: `photo-check`, the description (line 3)**

Replace `one verdict per candidate, through \`cli photos verdict\`.` with `one verdict per candidate, through \`cli photos stage\` and \`cli photos apply\`.`

- [ ] **Step 2: `photo-check`, steps 5 to 7 (lines 29-42)**

Replace lines 29-42 (from `5. **Each subagent returns its verdict` to `skip the targets that are now full.`) with:

~~~markdown
5. **Each subagent returns its verdict as its result.** It does not touch `verdicts.jsonl`,
   and it never writes a staged file by hand.
6. Stage each returned verdict with one command:

   ```bash
   node pipeline/cli.ts photos stage <name> --candidate <id> --verdict <kind> [--channel <c>] [--tags a,b] [--case <case>] --note "<text>"
   ```

   The six flags above are the whole surface. The command checks the row and appends it to
   `pipeline/runs/<name>/staged/<target>.jsonl`. It prints the approved counts of that
   target per channel, without the `hard` photos, for example
   `QUAL: approved leaf 3, bark 1, fruit 0; hard 1`. A judge that works on one target can
   run it for its own verdicts. A second stage of the same verdict changes nothing. A stage
   of a different verdict for the same candidate is refused.
7. After each batch, apply every staged verdict in one command:

   ```bash
   node pipeline/cli.ts photos apply <name>
   ```

   It checks every staged row first. When one row is bad, it writes nothing and exits 1.
   A candidate that already has a different verdict is a conflict: the command names it,
   writes nothing, and exits 1. Add `--replace` only when the new verdict must win.
   `--replace` never changes an owner decision. A second apply of the same rows changes
   nothing. The command sets `checked_by` to `photo_check_agent`, which is `CHECK_AGENT` in
   the CLI, and `checked_at` to the time of the apply. You never set those two. It prints
   one line per target with the approved counts per channel, then a `total:` line with the
   stop-rule numbers. Use those lines for the stop rule below, and skip the targets that are
   now full.
~~~

- [ ] **Step 3: `photo-check`, the missing POWO file (line 190)**

Replace `3. Run no \`photos verdict\` command for the row.` with `3. Run no \`photos stage\` command for the row.`

- [ ] **Step 4: `photo-check`, the last list (line 262)**

Replace `- It does not write \`verdicts.jsonl\`. \`cli photos verdict\` writes it.` with `- It does not write \`verdicts.jsonl\`. \`cli photos apply\` writes it.`

- [ ] **Step 5: `content-run`, the commit paragraph (lines 15-18)**

Replace the paragraph that starts `**The CLI commits. You do not.**` with:

```markdown
**The CLI commits. You do not.** The CLI commits at the end of `species list`,
`photos fetch`, `build`, `report`, `run pr`, and `run finish`. Each commit stages only the
run's paths: `pipeline/runs/<name>/`, `content/`, `content_src/`, and `pipeline/data/`. So
the commit also carries the verdict rows and the files you edited under those paths since
the last commit. A file outside those paths stays out. Do not run `git commit` yourself.

**Every run command that writes checks the branch.** Each command that writes a run file or
commits stops with an error unless HEAD is `content/<name>`, and it writes nothing then.
`run init` is the exception: it checks out that branch. A command that commits also checks
again just before its commit. Do not switch the branch of a checkout that a run uses.
```

- [ ] **Step 6: `content-run`, the file table (line 27)**

Replace the `verdicts.jsonl` row with these two rows:

```markdown
| `pipeline/runs/<name>/staged/<target>.jsonl` | `photos stage` (git-ignored) |
| `pipeline/runs/<name>/verdicts.jsonl` | `photos apply`, `photos verdict`, `run finish` |
```

- [ ] **Step 7: `content-run`, step 5 (lines 96-97)**

Replace `and records each\nverdict with \`node pipeline/cli.ts photos verdict …\`.` with `stages each verdict with\n\`node pipeline/cli.ts photos stage …\`, and applies each batch with\n\`node pipeline/cli.ts photos apply <name>\`.` Reflow the paragraph to lines of about 90 characters.

- [ ] **Step 8: `content-run`, step 6 (after line 111)**

After the line that ends `` `content built: <n> species, <m> manifest rows, <k> images uploaded`. ``, add:

```markdown

A new species with no photo and no confusion edge does not stop the build. The build holds
it back: it writes no record for it, prints `<SYMBOL>: held back: no photo and no confusion
edge`, and lists it in `build.json` and in the report with status `no_photos` and that
reason. Step 7 can find photos for it, and step 8 can give it an edge. The next build then
writes it. A species that `main` already publishes is never held back: with no photo and no
edge it still fails the build. So draft every species file in step 3, before the photos.
Do not leave a species file out to get past the build.
```

- [ ] **Step 9: `content-run`, step 8 (after line 238)**

After the paragraph that ends `Fix the edge\nand build again.`, add:

```markdown

A held-back species has no record in `content/species.json` yet, but its authored file
exists. An edge that names it brings it into the next build.
```

- [ ] **Step 10: `content-run`, the images and species commands (lines 296-311)**

After the `species retire` bullet (it ends `Run it only\n  when the owner asks.`), add one bullet:

```markdown
- `images retire`, `images difficulty`, and `species retire` commit only on a `content/`
  branch, and they commit only `content/species.json` and `content/images/manifest.json`.
  On `main` or on a detached HEAD they stop and write nothing.
```

- [ ] **Step 11: `content-run`, the last list (lines 322-323)**

Replace `\`photos add\` and\n  \`photos verdict\` do that.` with `\`photos add\`,\n  \`photos apply\`, and \`photos verdict\` do that.`

- [ ] **Step 12: `species-draft`, after step 3 (line 15)**

After the line `3. Draft one file for each symbol that has no file. Leave the existing files alone.`, add:

```markdown
   Draft a file for every symbol, also for a species that may get no photo. The build
   holds back a new species that has no photo and no confusion edge, and the report lists
   it. The build does not fail on it.
```

- [ ] **Step 13: Check the prose**

Read each changed paragraph once against the STE rules in Global Constraints. Check that each command name matches Tasks 7, 9, and 10: `photos stage`, `photos apply`, `--replace`.

- [ ] **Step 14: Commit**

```bash
git add -- .claude/skills/photo-check/SKILL.md .claude/skills/content-run/SKILL.md .claude/skills/species-draft/SKILL.md
git commit -m "docs(skills): stage and apply verdicts, the branch check, the hold-back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- .claude/skills/photo-check/SKILL.md .claude/skills/content-run/SKILL.md .claude/skills/species-draft/SKILL.md
```

---

### Task 7: Wire the branch guard and the named-path commits

**Files:**
- Modify: `pipeline/lib/commands.ts:84-100` (imports), `:184-208` (`USAGE`), `:262-264` (`speciesList`), `:312`, `:318-320` (`photosFetch`), `:445`, `:454-456` (`photosAdd`), `:535-540` (`photosVerdict`), `:1081-1143` (`build`, `report`, `runPr`, `runFinish`), `:1618-1640` (`commitContent`), `:1725` (add `commitRun` before `pushBranch`)
- Modify: `pipeline/lib/run.ts:241-248` (delete `gitCommitAll`)
- Modify: `pipeline/tests/run.test.ts` (delete the two `gitCommitAll` tests and the import)
- Modify: `pipeline/tests/cli_fetch.test.ts:72`, `:668-669`, `:683`, `:757`, `:1141`, and add tests
- Modify: `pipeline/tests/cli_build.test.ts:209-214`, `:267-283`, `:1079-1087`, and add tests

**Interfaces:**
- Consumes (Task 1): `requireRunBranch(exec, name)`, `requireContentBranch(exec)`, `gitCommitPaths(exec, message, paths)`, `runPaths(name)`, `CONTENT_PATHS`; `fakeExec`, `changes`, and `FakeExec` from `pipeline/tests/helpers.ts`.
- Produces: `commitRun(deps: CliDeps, name: string, message: string): void`, private to `commands.ts`. Task 9 does not need it, because `photos stage` and `photos apply` do not commit. The guard error lines that Task 6 names.

- [ ] **Step 1: Write the failing tests in `cli_fetch.test.ts`**

Change line 72 to `import { captureConsole, changes, fakeExec } from './helpers.ts';`.

Then add these tests after the test `species list stops on an unknown symbol in include` (line 673):

```ts
test('species list on the wrong branch stops before it reads or writes', async (t) => {
  const { root, deps, exec, http, err } = setup(t, checklistRoutes());
  seedRun(root, { bucket: 'simple_lobed', states: 'CO', genera: 'Quercus', channels: 'leaf' }, () => {});
  exec.branch = 'main';

  assert.equal(await runCommand(['species', 'list', 'demo'], deps), 1);

  assert.equal(err.length, 1);
  assert.match(err[0], /run demo needs branch content\/demo, and HEAD is on main/);
  assert.deepEqual(readRun(root, 'demo').species, []);
  assert.deepEqual(changes(exec), []);
  assert.deepEqual(http.urls, []);
});

test('photos verdict on a detached HEAD writes no row', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, () => {});
  const target = seedCandidate(root, 'QUGA', 0);
  exec.branch = null;

  const argv = ['photos', 'verdict', 'demo', '--candidate', target.id, '--verdict', 'reject', '--note', 'blurred'];
  assert.equal(await runCommand(argv, deps), 1);

  assert.match(err.join('\n'), /HEAD is detached/);
  assert.equal(fs.existsSync(path.join(runDir(root, 'demo'), 'verdicts.jsonl')), false);
});

test('photos add on main adds no candidate', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});
  exec.branch = 'main';

  assert.equal(await runCommand(['photos', 'add', 'demo', '--target', 'QUGA'], deps), 1);

  assert.match(err.join('\n'), /HEAD is on main/);
  assert.equal(fs.existsSync(path.join(runDir(root, 'demo'), 'candidates.jsonl')), false);
});
```

Change the existing lines that the guard moves:

- Lines 668-669 (in `species list enumerates the checklist and commits the result`) become:

  ```ts
  const calls = changes(exec);
  assert.deepEqual(calls[0], {
    command: 'git',
    args: ['add', '-A', '--', 'pipeline/runs/demo', 'pipeline/data'],
  });
  assert.equal(calls[1].args[2], 'content(demo): species list');
  ```

  `commitRun` leaves out a run path that does not exist on disk. This test root holds only `pipeline/runs/demo` and `pipeline/data`. When the root of the test holds more, add those paths in the order of `runPaths`.
- Line 683 becomes `assert.deepEqual(changes(exec), []);`.
- Line 757 becomes `assert.equal(changes(exec)[1].args[2], 'content(demo): photo candidates');`.
- Line 1141 becomes `assert.deepEqual(changes(exec), [], 'a run that threw commits nothing');`.

- [ ] **Step 2: Write the failing tests in `cli_build.test.ts`**

Replace the `FakeExec` type (lines 209-214) with:

```ts
type FakeExec = Exec & {
  calls: ExecCall[];
  /** Keyed by the first argument, so a test makes one subcommand fail. */
  codes: Map<string, { code: number; out: string }>;
  shows: Map<string, string>;
  /** What `git symbolic-ref` answers. Null is a detached HEAD. */
  branch: string | null;
};
```

In `fakeExec` (lines 267-283), add the branch answer as the first check after `calls.push`, and build the object with the field:

```ts
function fakeExec(): FakeExec {
  const calls: ExecCall[] = [];
  const codes = new Map<string, { code: number; out: string }>();
  const shows = new Map<string, string>();
  const exec = (command: string, args: string[]): { code: number; out: string } => {
    calls.push({ command, args });
    if (command === 'git' && args[0] === 'symbolic-ref') {
      return fake.branch === null ? { code: 1, out: '' } : { code: 0, out: fake.branch };
    }
    if (command === 'git' && args[0] === 'show') {
      const text = shows.get(args[1]);
      if (text === undefined) {
        return { code: GIT_BAD_REVISION, out: `fatal: path ${args[1]} does not exist` };
      }
      return { code: 0, out: text };
    }
    return codes.get(args[0]) ?? { code: 0, out: '' };
  };
  const fake: FakeExec = Object.assign(exec, {
    calls,
    codes,
    shows,
    branch: 'content/demo' as string | null,
  });
  return fake;
}
```

Change the test at lines 1079-1087 to:

```ts
test('run finish with no decisions.json returns 0 and changes nothing in git', async (t) => {
  const { root, deps, exec, out } = setup(t);
  seed(root);

  assert.equal(await runCommand(['run', 'finish', 'demo'], deps), 0);

  assert.deepEqual(out, ['no decisions to apply']);
  // The branch read is the only git call.
  assert.deepEqual(exec.calls.map((call) => call.args[0]), ['symbolic-ref']);
});
```

Add these tests after the test `build writes species.json and the manifest, uploads the resized bytes, and commits` (it ends at line 546):

```ts
test('build commits the run paths and no other path', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const paths = ['pipeline/runs/demo', 'content', 'content_src', 'pipeline/data'];
  assert.deepEqual(called(exec, 'git', 'add')?.args, ['add', '-A', '--', ...paths]);
  assert.deepEqual(called(exec, 'git', 'commit')?.args.slice(-5), ['--', ...paths]);
});

test('build on main writes nothing, uploads nothing, and commits nothing', async (t) => {
  const { root, deps, exec, storage, err } = setup(t);
  seed(root);
  exec.branch = 'main';

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.match(err.join('\n'), /run demo needs branch content\/demo, and HEAD is on main/);
  assert.equal(exists(root, 'content/species.json'), false);
  assert.equal(exists(root, 'pipeline/runs/demo/build.json'), false);
  assert.deepEqual(storage.puts, []);
  assert.equal(called(exec, 'git', 'commit'), undefined);
});
```

Add these tests after the test `images difficulty will not hide the last photo of a species no edge names`:

```ts
test('images difficulty on a content/ branch commits only the two content files', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root, {
    manifest: [
      row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' }),
      row({ hash: HASH_D, target: 'QUGA', channel: 'leaf' }),
    ],
  });
  writeJson(root, 'content/species.json', { QUGA: record() });
  exec.branch = 'content/fixes';

  assert.equal(await runCommand(['images', 'difficulty', HASH_C, '--set', 'hard'], deps), 0, err.join(' | '));

  const paths = ['content/species.json', 'content/images/manifest.json'];
  assert.deepEqual(called(exec, 'git', 'add')?.args, ['add', '-A', '--', ...paths]);
  assert.deepEqual(called(exec, 'git', 'commit')?.args.slice(-3), ['--', ...paths]);
});

test('images difficulty on main writes nothing and commits nothing', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root, {
    manifest: [
      row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' }),
      row({ hash: HASH_D, target: 'QUGA', channel: 'leaf' }),
    ],
  });
  writeJson(root, 'content/species.json', { QUGA: record() });
  exec.branch = 'main';

  assert.equal(await runCommand(['images', 'difficulty', HASH_C, '--set', 'hard'], deps), 1);

  assert.match(err.join('\n'), /only on a content\/ branch, and HEAD is on main/);
  assert.equal(manifestOf(root)[0].difficulty, undefined);
  assert.equal(called(exec, 'git', 'commit'), undefined);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test pipeline/tests/cli_fetch.test.ts pipeline/tests/cli_build.test.ts`
Expected: FAIL. The new guard tests exit 0 or write files, and the add calls still read `['add', '-A']`.

- [ ] **Step 4: Wire the guard and the commits in `commands.ts`**

1. In the import from `./run.ts` (lines 84-100), replace `gitCommitAll,` with `gitCommitPaths,`, and add `CONTENT_PATHS,`, `requireContentBranch,`, `requireRunBranch,`, and `runPaths,` in alphabetical order.
2. Add this helper just before `function pushBranch` (line 1725):

   ```ts
   /**
    * Commits the paths a run writes, only on the run's branch. `photos fetch` can run for an
    * hour, so the branch is read again here. A path that is not on disk is left out, because
    * git fails on a pathspec that matches nothing.
    */
   function commitRun(deps: CliDeps, name: string, message: string): void {
     requireRunBranch(deps.exec, name);
     const paths = runPaths(name).filter((one) => fs.existsSync(path.join(deps.root, ...one.split('/'))));
     gitCommitPaths(deps.exec, message, paths);
   }
   ```

3. Replace each run commit:
   - line 312: `commitRun(deps, name, \`content(${name}): species list\`);`
   - line 445: `commitRun(deps, name, \`content(${name}): photo candidates\`);`
   - line 1085: `commitRun(deps, name, \`content: build ${name}\`);`
   - line 1092: `commitRun(deps, name, \`content(${name}): report\`);`
   - line 1103: `commitRun(deps, name, \`content(${name}): pull request\`);`
   - line 1139: `commitRun(deps, name, \`content: build ${name}\`);`
   - line 1141: `commitRun(deps, name, \`content(${name}): report\`);`
4. Add `requireRunBranch(deps.exec, name);` as the line right after `const name = positional(…)` in `speciesList`, `photosFetch`, `photosAdd`, `photosVerdict`, `build`, `report`, `runPr`, and `runFinish`. In each one it comes before `readRun` and before any file check. In `runFinish` it comes before the `decisions.json` check, so that `main` does not print `no decisions to apply`.
5. In `commitContent`, add `requireContentBranch(deps.exec);` as the first line of the body, before `baseResolved`. Replace line 1638 with `gitCommitPaths(deps.exec, \`content: ${subject}\`, CONTENT_PATHS);`. Change the comment above `commitContent` (lines 1613-1617) to end with: `It commits only on a content/ branch, and only the two files.`
6. In `USAGE`, after the line `--base names the ref …`, add:

   ```
   A run command that writes needs HEAD on content/<name>. run init checks it out.
   images retire, images difficulty, and species retire need a content/ branch.
   ```

- [ ] **Step 5: Delete `gitCommitAll`**

Delete `gitCommitAll` from `pipeline/lib/run.ts` (lines 241-248). In `pipeline/tests/run.test.ts`, delete the import of `gitCommitAll` and the two tests `gitCommitAll stages everything and commits with the co-author trailer` and `gitCommitAll accepts a clean tree`. Then check that no caller is left:

Run: `grep -rn "gitCommitAll" pipeline`
Expected: no output.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:pipeline`
Expected: PASS, every test. When an older test asserts an exact list of exec calls and now sees a `symbolic-ref` call, change that assertion to read `changes(exec)` (in `cli_fetch.test.ts`) or to filter out `symbolic-ref` (in `cli_build.test.ts`). Do not remove the guard to make a test pass.

- [ ] **Step 7: Commit**

```bash
git add -- pipeline/lib/commands.ts pipeline/lib/run.ts pipeline/tests/run.test.ts pipeline/tests/cli_fetch.test.ts pipeline/tests/cli_build.test.ts
git commit -m "fix(cli): run commands need their branch and commit named paths" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- pipeline/lib/commands.ts pipeline/lib/run.ts pipeline/tests/run.test.ts pipeline/tests/cli_fetch.test.ts pipeline/tests/cli_build.test.ts
```

---

### Task 8: Wire the new `gitShowOf`

**Files:**
- Modify: `pipeline/lib/commands.ts:19` (import), `:1242`, `:1361`, `:1629` (the three callers), `:1732-1750` (delete the local `gitShowOf`, and fix the comment of `baseResolved`)
- Modify: `pipeline/tests/cli_build.test.ts` (the `git show` branch of `fakeExec`, and add tests)

Line numbers are the ones before Task 7. Task 7 moves them by a few lines. Find each caller with `grep -n "gitShowOf" pipeline/lib/commands.ts`.

**Interfaces:**
- Consumes (Task 2): `gitShowOf(exec: Exec, base: string): (file: string) => string | null` from `pipeline/lib/ids.ts`.
- Produces: `build`, `ids check`, and `commitContent` exit 1 with git's message when `git show` fails for any reason except a missing path.

- [ ] **Step 1: Write the failing tests**

In `fakeExec` of `pipeline/tests/cli_build.test.ts`, replace the `git show` branch with this one. It lets a test force a failure, and it prints git's real words for a missing path:

```ts
    if (command === 'git' && args[0] === 'show') {
      const forced = codes.get('show');
      if (forced !== undefined) return forced;
      const text = shows.get(args[1]);
      if (text === undefined) {
        const colon = args[1].indexOf(':');
        const ref = args[1].slice(0, colon);
        const file = args[1].slice(colon + 1);
        return { code: GIT_BAD_REVISION, out: `fatal: path '${file}' does not exist in '${ref}'` };
      }
      return { code: 0, out: text };
    }
```

Add these tests after the test `build --base reads the published content from that ref`:

```ts
test('build stops when git show fails for a reason other than a missing path', async (t) => {
  const { root, deps, exec, storage, err } = setup(t);
  seed(root);
  exec.codes.set('show', { code: 1, out: 'spawnSync git ENOBUFS' });

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.match(err.join('\n'), /git show main:content\/species\.json failed with code 1: spawnSync git ENOBUFS/);
  assert.equal(exists(root, 'content/species.json'), false);
  assert.deepEqual(storage.puts, []);
  assert.equal(called(exec, 'git', 'commit'), undefined);
});

test('ids check exits 1 when git show names a bad ref', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);
  exec.codes.set('show', { code: 128, out: "fatal: invalid object name 'main'." });

  assert.equal(await runCommand(['ids', 'check'], deps), 1);

  assert.match(err.join('\n'), /invalid object name 'main'/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test pipeline/tests/cli_build.test.ts`
Expected: FAIL on the two new tests. The local `gitShowOf` reads every failure as a first run, so `build` exits 0 and `ids check` prints `content ids are append-only`.

- [ ] **Step 3: Use the new `gitShowOf`**

1. Change the import at line 19 to `import { appendOnlyErrors, gitShowOf, readPublished, type ContentSet } from './ids.ts';`.
2. Delete the local `gitShowOf` (lines 1745-1750).
3. Change the three callers from `gitShowOf(deps, <base>)` to `gitShowOf(deps.exec, <base>)`.
4. In the comment of `baseResolved` (lines 1732-1737), replace the text with:

   ```ts
   /**
    * `readPublished` reads four absent files as a first run. `gitShowOf` gives null only when
    * git says the ref does not hold a path, and it throws on a bad ref. A ref that does not
    * resolve still gets its own line here, before any read. Prints the line and returns false
    * when the ref is not a commit.
    */
   ```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:pipeline`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add -- pipeline/lib/commands.ts pipeline/tests/cli_build.test.ts
git commit -m "fix(cli): a failed git show stops build and ids check" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- pipeline/lib/commands.ts pipeline/tests/cli_build.test.ts
```

---

### Task 9: `photos stage` and `photos apply`

**Files:**
- Modify: `pipeline/lib/commands.ts` (imports; `USAGE` at `:192`; new handlers after `photosVerdict`, which ends at `:571`; `COMMANDS` at `:750-767`)
- Modify: `.gitignore`
- Test: `pipeline/tests/cli_verdicts.test.ts` (create)

**Interfaces:**
- Consumes (Task 1): `requireRunBranch`, `parseFlags` with `replace` in `BOOLEAN_FLAGS`, `fakeExec`, `changes`. (Task 3): `appendJsonl`. (Task 4): every export of `pipeline/lib/verdict_apply.ts`. Existing: `hardCandidateIds` from `manifest.ts`, `readManifest`, `readJsonl`, `csvList`, `flagValue`, `relative`, `isoNow`, `CHECK_AGENT`, `VERDICT_REQUIRED`, `VERDICT_KINDS`.
- Produces:
  - `node pipeline/cli.ts photos stage <name> --candidate <id> --verdict <kind> [--channel <c>] [--tags a,b] [--case <case>] --note "<text>"`. It appends one `StagedVerdict` line to `pipeline/runs/<name>/staged/<target>.jsonl`. It prints `<verdict> staged for candidate <id> in <file>` (or `<id> is already staged`), then `<target>: approved <channel> <n>, …; hard <n>`.
  - `node pipeline/cli.ts photos apply <name> [--file <path>] [--replace]`. It prints `<target>: <a> applied, <u> unchanged; approved …; hard <n>` per target, sorted, then `total: <a> applied, <u> unchanged; judged <n>, escalated <n> (<p>%), stop rule <fired|not fired>`. On any error or conflict it prints each message, then `nothing applied` or `nothing applied: <n> conflict(s)`, and exits 1.

- [ ] **Step 1: Write the failing tests**

Create `pipeline/tests/cli_verdicts.test.ts`:

```ts
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
  assert.match(err.join('\n'), /refused: .* is already staged as approve leaf/);
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

  assert.match(err.join('\n'), /is an owner decision\. --replace does not change it\./);
  assert.equal(verdictsOf(root).length, 1);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test pipeline/tests/cli_verdicts.test.ts`
Expected: FAIL. `runCommand` prints the usage for `photos stage` and `photos apply` and returns 1.

- [ ] **Step 3: Write the two handlers**

In `pipeline/lib/commands.ts`:

1. `hardCandidateIds` is already imported from `./manifest.ts`. Add this import after the import from `./verdicts.ts`:

   ```ts
   import {
     conflictText,
     countsText,
     parseStagedLines,
     planApply,
     sameVerdict,
     stagedDir,
     stagedErrors,
     stagedPath,
     stamp,
     stopText,
     targetChannels,
     targetCounts,
     verdictText,
     type StagedVerdict,
   } from './verdict_apply.ts';
   ```

2. In `USAGE`, after the `photos verdict` line (line 192), add:

   ```
     photos stage <name> --candidate <id> --verdict <${VERDICT_KINDS.join('|')}> [--channel <c>] [--tags a,b] [--case <case>] --note "<text>"
     photos apply <name> [--file <path>] [--replace]
   ```

3. After `photosVerdict` (it ends at line 571), add:

   ```ts
   /**
    * Checks one verdict and appends it to the staged file of its target. A judge runs it once
    * per verdict, so no agent rewrites a whole file. `photos apply` writes verdicts.jsonl.
    */
   async function photosStage(rest: string[], deps: CliDeps): Promise<number> {
     const name = positional(
       rest,
       'photos stage <name> --candidate <id> --verdict <kind> --note "<text>"',
     );
     requireRunBranch(deps.exec, name);
     const scope = readRun(deps.root, name);
     const flags = parseFlags(rest.slice(1));
     for (const key of VERDICT_REQUIRED) {
       const value = flags[key];
       if (value === undefined || value.trim() === '') {
         console.error(`photos stage needs --${key}`);
         return 1;
       }
     }
     const dir = runDir(deps.root, name);
     const candidates = readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'));
     // The two casts hold because `stagedErrors` rejects a kind or a case outside the lists.
     const row: StagedVerdict = {
       candidate_id: flags.candidate,
       verdict: flags.verdict as VerdictKind,
       channel: flags.channel ?? null,
       tags: csvList(flags.tags),
       case: (flags.case ?? null) as EscalationCase | null,
       note: flags.note,
     };
     const errors = stagedErrors([row], candidates, scope.channels, 'photos stage');
     if (errors.length > 0) {
       for (const message of errors) console.error(message);
       return 1;
     }
     // `stagedErrors` passed, so the candidate is there.
     const candidate = candidates.find((one) => one.id === row.candidate_id) as Candidate;
     const file = stagedPath(dir, candidate.target);
     const label = relative(deps.root, file);
     const rows = readStaged(file, label);
     const prior = rows.find((one) => one.candidate_id === row.candidate_id);
     if (prior !== undefined && !sameVerdict(prior, row)) {
       console.error(`refused: ${row.candidate_id} is already staged as ${verdictText(prior)} in ${label}`);
       return 1;
     }
     if (prior === undefined) {
       appendJsonl(file, [row]);
       rows.push(row);
       console.log(`${row.verdict} staged for candidate ${row.candidate_id} in ${label}`);
     } else {
       console.log(`${row.candidate_id} is already staged`);
     }
     // The counts read the applied rows, then the staged rows, so a staged row wins.
     const verdicts = [
       ...readJsonl<Verdict>(path.join(dir, 'verdicts.jsonl')),
       ...rows.map((one) => stamp(one, CHECK_AGENT, '')),
     ];
     const counts = targetCountsText(deps, scope, candidate.target, candidates, verdicts);
     console.log(`${candidate.target}: ${counts}`);
     return 0;
   }

   /**
    * Applies staged verdicts in one process. Every row is checked first, and one bad row or
    * one conflict writes nothing. The same files applied twice give the same verdicts.jsonl.
    */
   async function photosApply(rest: string[], deps: CliDeps): Promise<number> {
     const name = positional(rest, 'photos apply <name> [--file <path>] [--replace]');
     requireRunBranch(deps.exec, name);
     const scope = readRun(deps.root, name);
     const flags = parseFlags(rest.slice(1));
     const dir = runDir(deps.root, name);
     const files = applyFiles(deps.root, dir, flagValue(flags, 'file'));
     if (files.length === 0) {
       console.log(`no staged verdicts in ${relative(deps.root, stagedDir(dir))}`);
       return 0;
     }

     const candidates = readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'));
     const verdictsPath = path.join(dir, 'verdicts.jsonl');
     const recorded = readJsonl<Verdict>(verdictsPath);
     const input: StagedVerdict[] = [];
     const errors: string[] = [];
     for (const file of files) {
       const label = relative(deps.root, file);
       if (!fs.existsSync(file)) {
         errors.push(`${label}: the file does not exist`);
         continue;
       }
       const parsed = parseStagedLines(fs.readFileSync(file, 'utf8'), label);
       errors.push(...parsed.errors, ...stagedErrors(parsed.rows, candidates, scope.channels, label));
       input.push(...parsed.rows);
     }
     const plan = planApply(recorded, input, flags.replace === 'true');
     errors.push(...plan.errors);
     if (errors.length > 0) {
       for (const message of errors) console.error(message);
       console.error('nothing applied');
       return 1;
     }
     if (plan.conflicts.length > 0) {
       for (const conflict of plan.conflicts) console.error(conflictText(conflict));
       const count = plan.conflicts.length;
       console.error(`nothing applied: ${count} conflict${count === 1 ? '' : 's'}`);
       return 1;
     }

     const at = isoNow(deps);
     const appended = plan.append.map((one) => stamp(one, CHECK_AGENT, at));
     appendJsonl(verdictsPath, appended);
     const all = [...recorded, ...appended];

     const targetOf = new Map(candidates.map((one) => [one.id, one.target]));
     const tally = new Map<string, { applied: number; unchanged: number }>();
     const bump = (id: string, field: 'applied' | 'unchanged'): void => {
       const target = targetOf.get(id) as string;
       const counts = tally.get(target) ?? { applied: 0, unchanged: 0 };
       counts[field] += 1;
       tally.set(target, counts);
     };
     for (const one of plan.append) bump(one.candidate_id, 'applied');
     for (const id of plan.unchanged) bump(id, 'unchanged');
     for (const target of [...tally.keys()].sort()) {
       const counts = tally.get(target) as { applied: number; unchanged: number };
       const text = targetCountsText(deps, scope, target, candidates, all);
       console.log(`${target}: ${counts.applied} applied, ${counts.unchanged} unchanged; ${text}`);
     }
     console.log(
       `total: ${plan.append.length} applied, ${plan.unchanged.length} unchanged; ${stopText(all)}`,
     );
     return 0;
   }

   /** `--file`, or every staged file of the run in name order. */
   function applyFiles(root: string, dir: string, file: string | null): string[] {
     if (file !== null) return [path.resolve(root, file)];
     const staged = stagedDir(dir);
     if (!fs.existsSync(staged)) return [];
     return fs
       .readdirSync(staged)
       .filter((one) => one.endsWith('.jsonl'))
       .sort()
       .map((one) => path.join(staged, one));
   }

   /** The rows of a staged file. A bad line throws with every message, because the judge must fix it. */
   function readStaged(file: string, label: string): StagedVerdict[] {
     if (!fs.existsSync(file)) return [];
     const parsed = parseStagedLines(fs.readFileSync(file, 'utf8'), label);
     if (parsed.errors.length > 0) throw new Error(parsed.errors.join('\n'));
     return parsed.rows;
   }

   /** `approved leaf 6, bark 4; hard 1` for one target. A hard photo is held back from the app. */
   function targetCountsText(
     deps: CliDeps,
     scope: RunScope,
     target: string,
     candidates: Candidate[],
     verdicts: Verdict[],
   ): string {
     const hard = hardCandidateIds(readManifest(deps.root), candidates, verdicts);
     const counts = targetCounts(target, verdicts, candidates, hard);
     return countsText(counts, targetChannels(target, scope.channels, scope.concepts));
   }
   ```

4. In `COMMANDS`, after `'photos verdict': photosVerdict,` add:

   ```ts
     'photos stage': photosStage,
     'photos apply': photosApply,
   ```

- [ ] **Step 4: Ignore the staged files**

In `.gitignore`, after the line `pipeline/sources/`, add:

```
pipeline/runs/*/staged/
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test pipeline/tests/cli_verdicts.test.ts`
Expected: PASS, every test.

Run: `npm run test:pipeline`
Expected: PASS, every test.

- [ ] **Step 6: Check the ignore line**

Run: `mkdir -p pipeline/runs/zz_check/staged && touch pipeline/runs/zz_check/staged/QUGA.jsonl && git check-ignore -v pipeline/runs/zz_check/staged/QUGA.jsonl; rm -r pipeline/runs/zz_check`
Expected: one line that names `.gitignore` and `pipeline/runs/*/staged/`.

- [ ] **Step 7: Commit**

```bash
git add -- pipeline/lib/commands.ts pipeline/tests/cli_verdicts.test.ts .gitignore
git commit -m "feat(cli): photos stage and photos apply" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- pipeline/lib/commands.ts pipeline/tests/cli_verdicts.test.ts .gitignore
```

---

### Task 10: The build holds back a new species with no photo

**Files:**
- Modify: `pipeline/lib/commands.ts` (import; `buildContent` at `:1296-1365`, line numbers before Task 7)
- Test: `pipeline/tests/cli_build.test.ts`

**Interfaces:**
- Consumes (Task 5): `HELD_BACK` and `isHeldBack(input: HoldBackInput): boolean` from `pipeline/lib/hold_back.ts`. (Task 8): `gitShowOf(deps.exec, base)`. Existing: `ownTargets(symbol, record)`, `readJsonOr`, `readContentList`, `contentFile`, `mergeSpecies`.
- Produces: a held-back species has no key in `content/species.json`. Its `build.json` row is `{ symbol, status: 'no_photos', reason: 'held back: no photo and no confusion edge', counts }`. The build prints `<SYMBOL>: held back: no photo and no confusion edge`. The report's species table shows the row.

- [ ] **Step 1: Write the failing tests**

In `pipeline/tests/cli_build.test.ts`, add `import { HELD_BACK } from '../lib/hold_back.ts';` after the import from `../lib/jsonl.ts`. Add these tests after the test `a build whose every photo of a species is tagged hard fails on the validator`:

```ts
test('a new species with no photo and no edge is held back and listed as no_photos', async (t) => {
  const { root, deps, out, err } = setup(t);
  // The level-3 unit names the genus Quercus. With no species that fails the validator, so
  // this test keeps the three level-1 units only.
  seed(root, {
    units: LEVEL_ONE_UNITS,
    verdicts: [verdict(MYSTERY.id, 'escalate', { case: 'mismatch', note: 'Another oak.' })],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  assert.deepEqual(speciesOf(root), {});
  const row = buildOf(root).species.find((one) => one.symbol === 'QUGA');
  assert.deepEqual(row, { symbol: 'QUGA', status: 'no_photos', reason: HELD_BACK, counts: {} });
  assert.ok(out.includes(`QUGA: ${HELD_BACK}`), out.join(' | '));

  assert.equal(await runCommand(['report', 'demo'], deps), 0, err.join(' | '));
  assert.ok(readText(root, 'pipeline/runs/demo/report.md').includes(`| QUGA | no_photos | ${HELD_BACK} |`));
});

test('a published species with no photo and no edge still fails the build', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root, {
    verdicts: [verdict(MYSTERY.id, 'escalate', { case: 'mismatch', note: 'Another oak.' })],
  });
  fakeGitShow(exec, 'main', { species: { QUGA: record() } });

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.ok(
    err.includes('error species.json: QUGA has no manifest image and no confusion edge'),
    err.join(' | '),
  );
  assert.equal(exists(root, 'content/species.json'), false);
});

test('a confusion edge brings a new species with no photo into the build', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root, {
    verdicts: [verdict(MYSTERY.id, 'escalate', { case: 'mismatch', note: 'Another oak.' })],
    confusion: [
      {
        a: 'QUAL',
        b: 'QUGA',
        channel: 'leaf',
        a_not_b: 'White oak has rounded lobes.',
        b_not_a: 'Gambel oak has deeper sinuses.',
        ref: 'FNA vol. 3',
      },
    ],
  });
  fakeGitShow(exec, 'main', {
    species: { QUAL: record({ scientific: 'Quercus alba', common: ['white oak'] }) },
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  assert.deepEqual(Object.keys(speciesOf(root)), ['QUAL', 'QUGA']);
  const row = buildOf(root).species.find((one) => one.symbol === 'QUGA');
  assert.equal(row?.status, 'no_photos');
  assert.equal(row?.reason, null);
});
```

The test `a build whose every photo of a species is tagged hard fails on the validator` stays as it is. Its manifest rows name QUGA, so the build does not hold QUGA back. Add this comment above it:

```ts
// Hard rows still name the species, so the hold-back rule leaves it in and the validator
// fails it. See the open question in docs/superpowers/plans/2026-09-28-run-safety.md.
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test pipeline/tests/cli_build.test.ts`
Expected: FAIL on `a new species with no photo and no edge is held back`: the build exits 1 with `QUGA has no manifest image and no confusion edge`. The other two new tests pass already.

- [ ] **Step 3: Hold the species back in `buildContent`**

1. Add `import { HELD_BACK, isHeldBack } from './hold_back.ts';` after the import from `./fna.ts`.
2. In `buildContent`, just before `for (const symbol of scope.species) {`, add:

   ```ts
     // The hold-back rule needs the published species and every file that can name one.
     const previous = readPublished(gitShowOf(deps.exec, base));
     const confusion = readJsonOr<RawContent['confusion']>(contentFile(deps.root, 'confusion.json'), []);
     const units = readContentList<Record<string, unknown>>(deps.root, 'units.json');
   ```

3. Replace the three lines that write the species (before Task 7 they are lines 1351-1353):

   ```ts
       // A species with no photo is still written. The app validator owns the rule that a
       // live species needs a live image or a confusion edge.
       species[symbol] = mergeSpecies(fetched, authored);
   ```

   with:

   ```ts
       const merged = mergeSpecies(fetched, authored);
       // The app validator fails a live species with no live image and no confusion edge. A
       // new species that nothing names waits outside species.json for a photo or an edge.
       const heldBack = isHeldBack({
         symbol,
         targets: ownTargets(symbol, merged),
         published: previous !== null && previous.species[symbol] !== undefined,
         manifest,
         confusion,
         units,
       });
       if (heldBack) {
         statuses[symbol] = { status: 'no_photos', reason: HELD_BACK };
         console.log(`${symbol}: ${HELD_BACK}`);
         continue;
       }
       species[symbol] = merged;
   ```

4. Delete the later line `const previous = readPublished(gitShowOf(deps.exec, base));` (before Task 7 it is line 1361). `carryPublished`, `carryRetired`, and `appendOnlyErrors` read the `previous` from step 2.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:pipeline`
Expected: PASS, every test. `a missing content/units.json is an error that names the file` still passes: the units read moved earlier and prints the same one line.

- [ ] **Step 5: Commit**

```bash
git add -- pipeline/lib/commands.ts pipeline/tests/cli_build.test.ts
git commit -m "feat(cli): build holds back a new species with no photo and no edge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- pipeline/lib/commands.ts pipeline/tests/cli_build.test.ts
```

---

### Task 11: Verification (the orchestrator runs this)

**Files:** none changed.

- [ ] **Step 1: Run the app suite**

Run: `npm test`
Expected: PASS, 259 tests.

- [ ] **Step 2: Run the pipeline suite**

Run: `npm run test:pipeline`
Expected: PASS. The count is 476, minus the 2 deleted `gitCommitAll` tests, plus the new tests of Tasks 1 to 10.

- [ ] **Step 3: Run the live suite**

Run: `npm run test:live`
Expected: PASS. This suite needs the network. When the network is not there, record that, and do not count it as a failure of this work.

- [ ] **Step 4: Run the checks that CI runs**

Run: `npm run validate && npm run validate:dev && node pipeline/cli.ts ids check`
Expected: `content is valid`, twice, then `content ids are append-only`.

- [ ] **Step 5: Check that the guard runs against the real git**

Run: `node pipeline/cli.ts photos apply no_such_run`
Expected: exit 1 and `run no_such_run needs branch content/no_such_run, and HEAD is on fix/run-safety. The command stopped. …`. Nothing is written.

- [ ] **Step 6: Check that no old name is left**

Run: `grep -rn "gitCommitAll" pipeline; grep -rn "add -A" .claude/skills`
Expected: no output from either command.

- [ ] **Step 7: Check the tree**

Run: `git status --short`
Expected: no output. Every task committed its own paths.

---

## Open questions for the owner

1. **Which branch do `images retire`, `images difficulty`, and `species retire` need?** This plan requires any `content/` branch. Today they commit on any branch, `main` too. After this change you create a branch such as `content/fixes` before a retire outside a run. The other choice is "any branch except `main`".
2. **May `--replace` change an owner decision?** This plan says no: a row with `checked_by: owner` stays, and `photos apply --replace` reports it as a conflict. To change an owner decision you write `decisions.json` again.
3. **Should the build also hold back a new species whose only photos are `hard`?** Its manifest rows name it, so this plan writes it and the validator fails the build, as today. To hold it back, the build must also drop its new manifest rows and cancel their uploads.
   **Answered 2026-10-09:** yes. The build holds the species back, drops its new rows (variety keys too), and does not upload their files.
4. **May `edges-draft` pair a held-back species?** Its rule says both symbols must be in `content/species.json`, and a held-back species is not there. An edge that names it does bring it into the next build. This plan changes only `content-run`. A later PR rewrites the skills.
5. **Should the staged files be committed?** This plan git-ignores `pipeline/runs/*/staged/`. `verdicts.jsonl` stays the record, and an ignored file survives a branch switch. A committed file would keep the judge's rows in the pull request too.

## Spec coverage

| Brief item | Task |
|---|---|
| 1. Guard on every run command that writes or commits, `photos verdict` and `photos add` included | 1, 7 |
| 1. Named-path staging in place of `git add -A` | 1, 7 |
| 1. Images and species commands never commit on `main` | 1, 7, open question 1 |
| 2. `gitShowOf` null only for a missing path, throws otherwise, both cases tested | 2, 8 |
| 3. Batch apply in one process, check first, idempotent, conflicts, `--replace`, non-zero exit, counts without `hard` | 4, 9 |
| 3. Append one staged row through the CLI | 4, 9 |
| 3. `appendJsonl` reads the whole file | 3 |
| 3. `photo-check` names the apply step | 6 |
| 4. Hold back an unpublished species with no photo and no edge, `no_photos` in `build.json`, listed in the report; a published one still fails | 5, 10 |
| 4. `content-run` and `species-draft` drafting order | 6 |
