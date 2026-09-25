# Pipeline Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the photo fetch rank PLANTS last, drop monochrome candidates at fetch and at `photos add`, add a `photos audit` command, and make `photos add` refuse a candidate id that the run already holds.

**Architecture:** One new module, `pipeline/lib/chroma.ts`, measures colour with `sharp`. The command handlers in `pipeline/lib/commands.ts` receive the measure through a new `CliDeps.chroma` field, and `pipeline/cli.ts` loads `chroma.ts` on first use, the same way it loads `sharp_resizer.ts`. So `commands.ts` still imports nothing from `node_modules`, and CI can run `ids check` with no install. The run scope in `pipeline/lib/run.ts` gains one counter, `mono_dropped`.

**Tech Stack:** Node 24 with TypeScript through Node's built-in type stripping. `sharp` (root dev dependency, `^0.35.4`). Tests run with `node --test`.

Spec: `docs/superpowers/specs/2026-09-24-pipeline-batch-design.md`.

## Global Constraints

- Node 24 or later. TypeScript runs through Node's built-in type stripping. There is no build step.
- Erasable TypeScript syntax only: no enums, no parameter properties, no namespaces. A relative import inside `pipeline/` carries the `.ts` extension.
- The machine is Windows 11. Build every file path with `path.join` or `path.resolve`. Never join path parts with a `/` in a string. A path stored in a JSON row (`local`) stays root-relative with forward slashes, as `relative()` in `commands.ts` writes it today.
- Write file content with the Write tool. Edit files with the Edit tool. Never use heredocs, `cat > file`, `echo >`, or `sed -i` for file content.
- Keep every Bash command under 5,000 bytes.
- `pipeline/lib/commands.ts` imports nothing that needs `node_modules`. Only `pipeline/lib/chroma.ts` and `pipeline/lib/sharp_resizer.ts` import `sharp`, and `pipeline/cli.ts` loads both with a dynamic `import()`.
- A field that lands in JSON is snake_case (`mono_dropped`). A TypeScript-only name is camelCase (`monoDropped`, `chromaOf`).
- `MONO_THRESHOLD = 12`, in `pipeline/lib/candidates.ts` next to `MAX_PER_SPECIES`.
- No command in this plan retires an image. `photos audit` reports and always exits 0 after it measures.
- Prose, comments, and messages follow ASD-STE100: short sentences, active voice, one word for one meaning. Spell the word "colour" in prose and in printed messages, to match the spec. TypeScript identifiers keep the spec's names (`chromaOf`, `MONO_THRESHOLD`).
- Plan-listed exports stay even if unused (run ledger ruling R7).
- The live suite (`pipeline/tests_live/`) does not change.
- Commit with two `-m` flags. The second one is the trailer, so the commit body ends with it on its own line after a blank line:
  `git commit -m "feat: subject line" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

## Execution notes

- Work in a git worktree off branch `pipeline-batch`. A new worktree has no `node_modules`, so run `npm install` in the worktree before Task 2. The new tests in Tasks 2 to 5 load `sharp`.
- After each task, run `npm run test:pipeline`. Every test passes before the commit.
- At the end of Task 5, run `npm run test:all`. Report the pass count of each of the three suites (app, pipeline, live). The live suite count must be the same as before Task 1.
- Before Task 1, run `npm run test:all` once and write down the three counts, so the end report can compare.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `pipeline/lib/commands.ts` | Modify | Source order in `photosFetch`; the colour check in `photosFetch` and `photosAdd`; the duplicate refusal; the new `photosAudit` handler; `CliDeps.chroma`. |
| `pipeline/lib/chroma.ts` | Create | `chromaOf(bytes)`: the mean of `max(r,g,b) - min(r,g,b)` over a copy with a 200 px long side. The only new importer of `sharp`. |
| `pipeline/lib/candidates.ts` | Modify | `MONO_THRESHOLD`. |
| `pipeline/lib/images.ts` | Modify | The `Chroma` function type, next to `Resize`. |
| `pipeline/lib/run.ts` | Modify | `RunScope.mono_dropped` (type, default, validation); `manifest` joins `BOOLEAN_FLAGS`. |
| `pipeline/cli.ts` | Modify | `lazyChroma`, which loads `chroma.ts` on first use. |
| `pipeline/tests/fixtures/images.ts` | Create | `greyJpeg()` and `redJpeg()`: two 64x64 JPEGs built in memory with `sharp`. |
| `pipeline/tests/chroma.test.ts` | Create | The measure on grey, red, and bytes that are not an image. |
| `pipeline/tests/cli_fetch.test.ts` | Modify | Source order, the fetch drop, the decode failure, the add refusals. |
| `pipeline/tests/cli_audit.test.ts` | Create | `photos audit` in run mode, in manifest mode, and with `--threshold 0`. |
| `pipeline/tests/run.test.ts` | Modify | `mono_dropped` default, round trip, and validation. |
| `pipeline/tests/cli_build.test.ts` | Modify | The `CliDeps` fixture gains `chroma`. |
| `docs/superpowers/specs/2026-09-22-content-pipeline-design.md` | Modify | A short note on source order and the colour drop. |
| `.claude/skills/content-run/SKILL.md` | Modify | The Step 4 fetch summary line gains the monochrome clause (Task 3). One line after the build step about `photos audit` (Task 5). |
| `pipeline/runs/simple_lobed_co/run.json`, `pipeline/runs/concepts_v0/run.json` | Modify | Each gains `"mono_dropped": 0`, so `readRun` still loads the two merged runs (Task 3). |

## Choices made where the spec is silent

1. **The measure arrives through `CliDeps.chroma`.** CI runs `node pipeline/cli.ts ids check` with no `npm install`. A static import of `chroma.ts` in `commands.ts` would load `sharp` and stop that step. `cli.ts` wires `lazyChroma`, which imports `chroma.ts` on first use. The type `Chroma` sits in `images.ts` next to `Resize`, so `chroma.ts` keeps its one export.
2. **The test fixtures default `chroma` to `async () => 100`.** The existing fetch and add tests serve five-byte stand-ins, not real JPEGs. A fake that always says "colour" keeps them as they are. Each new colour test sets `deps.chroma = chromaOf`, so it measures real JPEGs.
3. **The pipeline suite now needs `node_modules`.** The spec puts `chroma.test.ts` under `pipeline/tests/` and has it build JPEGs with `sharp`. CI does not run the pipeline suite, so CI does not change.
4. **A decode failure at fetch goes into `deps.http.failures`** through the existing `recordFailure`, with status 200 and the message `the image does not decode: <sharp message>`. `fetch_failures` is `deps.http.failures.length` today, so the count and the printed `fetch failed:` line both come for free.
5. **`mono_dropped` holds the count of the last fetch**, as `fetch_failures` does. It is set, not added to.
6. **A failed download at fetch keeps its row**, as today. The colour check runs only on a row that has a cached file.
7. **The score prints with one decimal place** (`score.toFixed(1)`), in the refusal and in the audit lines.
8. **`photos add` with a `--local` path that does not exist exits 1** with `photos add --local file is missing: <local>`. The spec measures the `--local` file, and a missing file cannot be measured. `build` already throws on a manual row with no cached file. Two existing tests pass a `--local` path that does not exist. Task 4 makes them write the file first.
9. **`photos add` exits 1 when the file does not decode**, with `photos add could not read <local> as an image: <sharp message>`.
10. **The duplicate check runs after the flag checks and the license check**, and before the download. It reads `candidates.jsonl` with `readJsonl`.
11. **`photos audit` in run mode does not call `readRun`.** It needs only `candidates.jsonl`. It throws `run <name> does not exist.` when the run directory is absent.
12. **In `photos audit`, a row that cannot be measured is skipped** and named on stderr. In manifest mode that covers a failed CDN fetch. In both modes it covers bytes that do not decode. A retired manifest row is not counted as skipped, because spec section 6 expects `0 skipped` with one retired row.
13. **A score is under the threshold when `score < threshold`.** With `--threshold 0` no row is under.
14. **A `--threshold` value that is not a number exits 1** with `photos audit --threshold needs a number: <value>`. This is a usage error, not a result.
15. **`manifest` joins `BOOLEAN_FLAGS`.** `parseFlags` throws on a bare flag outside that list.
16. **Commit prefixes are `feat:` and `docs:`**, the two the repo log uses most. Each task is one commit with its tests.

---

### Task 1: Source order

**Files:**
- Modify: `pipeline/lib/commands.ts:337-339`
- Modify: `docs/superpowers/specs/2026-09-22-content-pipeline-design.md:354-355`
- Test: `pipeline/tests/cli_fetch.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `photosFetch` pushes the rows of one exemplar in the order Commons, iNaturalist, PLANTS. No signature changes.

`collect` in `pipeline/lib/candidates.ts` takes rows in order until `MAX_PER_SPECIES` (60). Today PLANTS rows come first, and most of them are monochrome herbarium plates. This task moves PLANTS last. `collect`, `mergeFound`, and the caps do not change.

The test cannot lower the cap, because `MAX_PER_SPECIES` is a constant. It seeds manual rows until the room left is the count of Commons and iNaturalist rows. The PLANTS rows then meet the cap.

- [ ] **Step 1: Write the failing test**

In `pipeline/tests/cli_fetch.test.ts`, add `MAX_PER_SPECIES` to the import from `../lib/candidates.ts`. Replace:

```ts
import {
  CHANNEL_TARGET,
  SOURCE_NAMES,
  makeCandidate,
  type Candidate,
} from '../lib/candidates.ts';
```

with:

```ts
import {
  CHANNEL_TARGET,
  MAX_PER_SPECIES,
  SOURCE_NAMES,
  makeCandidate,
  type Candidate,
} from '../lib/candidates.ts';
```

Add this test directly after the test `'photos fetch pages the Commons listing'`:

```ts
test('photos fetch ranks Commons and iNaturalist ahead of PLANTS under the cap', async (t) => {
  const { root, deps, out } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });
  // The seeded rows leave room for the Commons and iNaturalist rows only, so every PLANTS
  // row meets the cap.
  const room = commonsRowsOf('QUGA').length + inatRowsOf('QUGA').length;
  assert.ok(plantsRowsOf('QUGA').length > 0, 'the fixture holds PLANTS rows for the cap to stop');
  assert.ok(room < MAX_PER_SPECIES, 'the fixture rows fit under the cap');
  for (let index = 0; index < MAX_PER_SPECIES - room; index += 1) {
    seedCandidate(root, 'QUGA', index);
  }

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const rows = fetchedOf(root);
  assert.equal(rows.length, room);
  assert.deepEqual(
    [...new Set(rows.map((row) => row.source_key))].sort(),
    ['commons', 'inat'],
    'no PLANTS row reaches the queue ahead of Commons and iNaturalist',
  );
  assert.deepEqual(out, [appendedLine(room, 0)]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: FAIL in `photos fetch ranks Commons and iNaturalist ahead of PLANTS under the cap`, at the `deepEqual` on the source keys. The actual list holds `'plants'`, because PLANTS rows come first today. Every other test passes.

- [ ] **Step 3: Change the order**

In `pipeline/lib/commands.ts`, in `photosFetch`, replace:

```ts
      const fromSources: Candidate[] = [];
      fromSources.push(...(await plantsRows(context)));
      fromSources.push(...(await commonsRows(context)));
      fromSources.push(...(await inatRows(context, passes)));
```

with:

```ts
      // Commons and iNaturalist come first. `collect` takes rows in order up to the cap, and
      // PLANTS images are mostly monochrome herbarium plates, so PLANTS takes the room left.
      const fromSources: Candidate[] = [];
      fromSources.push(...(await commonsRows(context)));
      fromSources.push(...(await inatRows(context, passes)));
      fromSources.push(...(await plantsRows(context)));
```

- [ ] **Step 4: Add the note to the pipeline design spec**

In `docs/superpowers/specs/2026-09-22-content-pipeline-design.md`, replace:

```markdown
`cli photos fetch <run>` finds candidates per species and per source and appends rows to
`runs/<run>/candidates.jsonl`. It skips any origin URL already in the file.
```

with:

```markdown
`cli photos fetch <run>` finds candidates per species and per source and appends rows to
`runs/<run>/candidates.jsonl`. It skips any origin URL already in the file.

The source order is Commons, iNaturalist, PLANTS. The cap takes rows in that order, so
PLANTS plates enter only when the cap has room. After each download the fetch measures
the colour of the image and drops a row that scores under `MONO_THRESHOLD` (12, in
`pipeline/lib/candidates.ts`). Owner ruling 2026-09-24: colour photographs only. See
`docs/superpowers/specs/2026-09-24-pipeline-batch-design.md`.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:pipeline`
Expected: PASS, every test, including the new one.

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/commands.ts pipeline/tests/cli_fetch.test.ts docs/superpowers/specs/2026-09-22-content-pipeline-design.md
git commit -m "feat: rank PLANTS last in the photo fetch" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The colour measure

**Files:**
- Create: `pipeline/lib/chroma.ts`
- Modify: `pipeline/lib/candidates.ts:176-177` (after `CHANNEL_TARGET`)
- Create: `pipeline/tests/fixtures/images.ts`
- Test: `pipeline/tests/chroma.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `chromaOf(bytes: Uint8Array): Promise<number>` in `pipeline/lib/chroma.ts`. Throws when `sharp` cannot decode the bytes.
  - `MONO_THRESHOLD: number` (`12`) in `pipeline/lib/candidates.ts`.
  - `greyJpeg(): Promise<Uint8Array>` and `redJpeg(): Promise<Uint8Array>` in `pipeline/tests/fixtures/images.ts`. Tasks 3, 4, and 5 import them from `./fixtures/images.ts`.

The measure, from spec section 4.1:

1. Resize so the long side is 200 px, and keep the aspect.
2. Read raw RGB pixels.
3. For each pixel, take `max(r, g, b) - min(r, g, b)`.
4. Return the mean over all pixels.

A true greyscale JPEG decodes to one channel. `toColourspace('srgb')` makes it three, so step 3 always reads r, g, and b. `removeAlpha()` drops a fourth channel from a PNG or a WebP.

The test glob is `pipeline/tests/**/*.test.ts`, so `pipeline/tests/fixtures/images.ts` never runs as a test.

- [ ] **Step 1: Write the fixture helper**

`pipeline/tests/fixtures/images.ts`:

```ts
import sharp from 'sharp';

/** Each side of a fixture image, in pixels. */
const SIDE = 64;

async function flatJpeg(background: { r: number; g: number; b: number }): Promise<Uint8Array> {
  const out = await sharp({ create: { width: SIDE, height: SIDE, channels: 3, background } })
    .jpeg()
    .toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/** A flat mid-grey 64x64 JPEG. It scores near 0. */
export function greyJpeg(): Promise<Uint8Array> {
  return flatJpeg({ r: 128, g: 128, b: 128 });
}

/** A flat red 64x64 JPEG. It scores far above MONO_THRESHOLD. */
export function redJpeg(): Promise<Uint8Array> {
  return flatJpeg({ r: 200, g: 30, b: 30 });
}
```

- [ ] **Step 2: Write the failing test**

`pipeline/tests/chroma.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MONO_THRESHOLD } from '../lib/candidates.ts';
import { chromaOf } from '../lib/chroma.ts';
import { greyJpeg, redJpeg } from './fixtures/images.ts';

test('MONO_THRESHOLD is 12', () => {
  assert.equal(MONO_THRESHOLD, 12);
});

test('a flat grey image scores under the threshold', async () => {
  const score = await chromaOf(await greyJpeg());
  assert.ok(score < MONO_THRESHOLD, `grey scored ${score}`);
});

test('a red image scores above the threshold', async () => {
  const score = await chromaOf(await redJpeg());
  assert.ok(score > MONO_THRESHOLD, `red scored ${score}`);
});

test('bytes that are not an image make chromaOf throw', async () => {
  await assert.rejects(chromaOf(new Uint8Array([1, 2, 3, 4])));
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test pipeline/tests/chroma.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `pipeline/lib/chroma.ts`.

- [ ] **Step 4: Add the threshold**

In `pipeline/lib/candidates.ts`, replace:

```ts
/** 8 approved images stop collection for one channel of one target. */
export const CHANNEL_TARGET = 8;
```

with:

```ts
/** 8 approved images stop collection for one channel of one target. */
export const CHANNEL_TARGET = 8;

/**
 * A chroma score under this value marks an image as monochrome. Owner ruling 2026-09-24:
 * colour photographs only. `mono-check.cjs` used this cut on the concept run.
 */
export const MONO_THRESHOLD = 12;
```

- [ ] **Step 5: Write the measure**

`pipeline/lib/chroma.ts`:

```ts
import sharp from 'sharp';

/** The long side, in pixels, of the copy the measure reads. */
const SAMPLE_SIDE = 200;

/**
 * The mean over all pixels of max(r, g, b) - min(r, g, b), read from a copy whose long side
 * is 200 px. A grey plate scores near 0. A colour photograph scores well above
 * MONO_THRESHOLD. Throws when sharp cannot decode the bytes, and the caller decides what
 * that means.
 */
export async function chromaOf(bytes: Uint8Array): Promise<number> {
  const { data, info } = await sharp(bytes)
    .resize({ width: SAMPLE_SIDE, height: SAMPLE_SIDE, fit: 'inside' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  if (pixels === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sum += Math.max(r, g, b) - Math.min(r, g, b);
  }
  return sum / pixels;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test pipeline/tests/chroma.test.ts`
Expected: PASS, 4 tests.

Run: `npm run test:pipeline`
Expected: PASS, every test.

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/chroma.ts pipeline/lib/candidates.ts pipeline/tests/fixtures/images.ts pipeline/tests/chroma.test.ts
git commit -m "feat: add the chroma measure and MONO_THRESHOLD" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The monochrome drop in `photos fetch`

**Files:**
- Modify: `pipeline/lib/run.ts:20-21` (type), `:137` (default), `:157` (validation)
- Modify: `pipeline/lib/images.ts:5` (the `Chroma` type)
- Modify: `pipeline/lib/commands.ts` (imports, `CliDeps`, `photosFetch` lines 310-370)
- Modify: `pipeline/cli.ts` (imports, `lazyChroma`, `deps`)
- Modify: `pipeline/tests/cli_build.test.ts:383-392` (the `CliDeps` fixture)
- Modify: `pipeline/runs/simple_lobed_co/run.json:1065`, `pipeline/runs/concepts_v0/run.json:149` (add `mono_dropped`)
- Modify: `.claude/skills/content-run/SKILL.md:70` (the quoted fetch summary line in Step 4)
- Test: `pipeline/tests/cli_fetch.test.ts`, `pipeline/tests/run.test.ts`

**Interfaces:**
- Consumes: `chromaOf(bytes: Uint8Array): Promise<number>` and `MONO_THRESHOLD` (Task 2); `greyJpeg()` and `redJpeg()` (Task 2).
- Produces:
  - `type Chroma = (bytes: Uint8Array) => Promise<number>` in `pipeline/lib/images.ts`.
  - `CliDeps.chroma: Chroma`. Tasks 4 and 5 call `deps.chroma(bytes)`.
  - `RunScope.mono_dropped: number`, default `0`. `validateScope` pushes `'mono_dropped is not a number.'` when the field is not a number.
  - The `photos fetch` summary line: `<n> candidates appended to <path>, <m> download failures, <k> monochrome dropped`.
  - The per-target stderr line `<target>: <n> monochrome dropped`, printed only when n > 0.

`run.json` is written by `writeRun`, which serializes the whole scope with `JSON.stringify`. So the new field needs no serialization code. The round-trip test in `run.test.ts` proves it.

The two committed runs (`pipeline/runs/simple_lobed_co/run.json` and `pipeline/runs/concepts_v0/run.json`) have no `mono_dropped`. `validateScope` checks `mono_dropped` as strictly as `fetch_failures`, so `readRun` would reject both files. Step 10 adds the field to both, and Step 11 checks that both files load.

- [ ] **Step 1: Write the failing run scope tests**

In `pipeline/tests/run.test.ts`, in the test `'newScope splits every csv list and trims each part'`, replace:

```ts
  assert.equal(scope.fetch_failures, 0);
  assert.deepEqual(scope.capped, []);
});
```

with:

```ts
  assert.equal(scope.fetch_failures, 0);
  assert.equal(scope.mono_dropped, 0);
  assert.deepEqual(scope.capped, []);
});
```

In the test `'writeRun then readRun round-trips the scope'`, replace:

```ts
  scope.fetch_failures = 2;
  scope.capped = ['QUGA: commons listing capped at 4 pages'];
```

with:

```ts
  scope.fetch_failures = 2;
  scope.mono_dropped = 3;
  scope.capped = ['QUGA: commons listing capped at 4 pages'];
```

In the test `'readRun lists every field validateScope rejects'`, replace:

```ts
  scope.fetch_failures = 'two';
  scope.dropped = [{ symbol: 'QUUN' }];
```

with:

```ts
  scope.fetch_failures = 'two';
  scope.mono_dropped = 'three';
  scope.dropped = [{ symbol: 'QUUN' }];
```

and replace:

```ts
    assert.ok(error.message.includes('fetch_failures is not a number'));
```

with:

```ts
    assert.ok(error.message.includes('fetch_failures is not a number'));
    assert.ok(error.message.includes('mono_dropped is not a number'));
```

- [ ] **Step 2: Write the failing fetch tests**

In `pipeline/tests/cli_fetch.test.ts`, add three imports. Replace:

```ts
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
```

with:

```ts
import { chromaOf } from '../lib/chroma.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
import { sha256Hex } from '../lib/images.ts';
```

Replace:

```ts
import { captureConsole, fakeExec } from './helpers.ts';
```

with:

```ts
import { greyJpeg, redJpeg } from './fixtures/images.ts';
import { captureConsole, fakeExec } from './helpers.ts';
```

Add this constant directly after `const REPO_ROOT = …;`:

```ts
/** Bytes that sharp cannot decode. */
const NOT_AN_IMAGE = new Uint8Array([1, 2, 3, 4]);
```

In `setup`, replace:

```ts
    resize: async (bytes) => bytes,
    validate: validateContent,
```

with:

```ts
    resize: async (bytes) => bytes,
    // The fixture bytes are five-byte stand-ins, not JPEGs. Every row scores as colour here.
    // A colour test sets `deps.chroma = chromaOf` and serves real JPEGs.
    chroma: async () => 100,
    validate: validateContent,
```

Replace `appendedLine`:

```ts
/** The line `photos fetch` prints last. The count comes from the rows, never from a literal. */
function appendedLine(appended: number, failures: number): string {
  return `${appended} candidates appended to pipeline/runs/demo/candidates.jsonl, ${failures} download failures`;
}
```

with:

```ts
/** The line `photos fetch` prints last. The count comes from the rows, never from a literal. */
function appendedLine(appended: number, failures: number, mono = 0): string {
  return `${appended} candidates appended to pipeline/runs/demo/candidates.jsonl, ${failures} download failures, ${mono} monochrome dropped`;
}
```

Add these two tests directly after the test `'photos fetch records a failed download and keeps the row'`:

```ts
test('photos fetch drops a monochrome row and counts it', async (t) => {
  const routes = photoRoutes();
  const red = await redJpeg();
  const grey = await greyJpeg();
  for (const url of fileUrls('QUGA')) routes.set(url, { bytes: red });
  const greyUrl = commonsRowsOf('QUGA')[0].file_url;
  routes.set(greyUrl, { bytes: grey });
  const { root, deps, out, err } = setup(t, routes);
  deps.chroma = chromaOf;
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const rows = fetchedOf(root);
  const expected = expectedRows('QUGA');
  assert.equal(rows.length, expected.length - 1);
  assert.ok(!rows.some((row) => row.file_url === greyUrl), 'the grey row is not appended');
  const scope = readRun(root, 'demo');
  assert.equal(scope.mono_dropped, 1);
  assert.equal(scope.fetch_failures, 0);
  assert.ok(err.includes('QUGA: 1 monochrome dropped'));
  assert.deepEqual(out, [appendedLine(expected.length - 1, 0, 1)]);
  const cached = path.join(root, 'pipeline', 'cache', 'commons', `${sha256Hex(grey)}.jpg`);
  assert.ok(fs.existsSync(cached), 'the cache keeps the grey file for a rerun');
});

test('photos fetch counts an image that does not decode as a download failure', async (t) => {
  const routes = photoRoutes();
  const red = await redJpeg();
  for (const url of fileUrls('QUGA')) routes.set(url, { bytes: red });
  const brokenUrl = commonsRowsOf('QUGA')[0].file_url;
  routes.set(brokenUrl, { bytes: NOT_AN_IMAGE });
  const { root, deps, out, err } = setup(t, routes);
  deps.chroma = chromaOf;
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const rows = fetchedOf(root);
  const expected = expectedRows('QUGA');
  assert.equal(rows.length, expected.length - 1);
  assert.ok(!rows.some((row) => row.file_url === brokenUrl), 'the broken row is not appended');
  const scope = readRun(root, 'demo');
  assert.equal(scope.fetch_failures, 1);
  assert.equal(scope.mono_dropped, 0);
  assert.ok(
    err.some((line) => line.startsWith(`fetch failed: 200 ${brokenUrl}: the image does not decode:`)),
    'the failure line names the url',
  );
  assert.deepEqual(out, [appendedLine(expected.length - 1, 1, 0)]);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test pipeline/tests/run.test.ts`
Expected: FAIL in `newScope splits every csv list and trims each part` (`undefined !== 0`) and in `readRun lists every field validateScope rejects` (no `mono_dropped is not a number` in the message).

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: FAIL in every test that compares `out` with `appendedLine(...)`, because the printed line has no `monochrome dropped` clause yet. FAIL in `photos fetch drops a monochrome row and counts it` at `rows.length`. FAIL in `photos fetch counts an image that does not decode as a download failure` at `rows.length`.

- [ ] **Step 4: Add `mono_dropped` to the run scope**

In `pipeline/lib/run.ts`, replace:

```ts
  /** How many urls this run gave up on. The report prints it. */
  fetch_failures: number;
```

with:

```ts
  /** How many urls this run gave up on. The report prints it. */
  fetch_failures: number;
  /** How many fetched rows the last `photos fetch` dropped as monochrome. */
  mono_dropped: number;
```

Replace:

```ts
    fetch_failures: 0,
    capped: [],
```

with:

```ts
    fetch_failures: 0,
    mono_dropped: 0,
    capped: [],
```

Replace:

```ts
  if (asNumber(scope.fetch_failures) === null) errors.push('fetch_failures is not a number.');
```

with:

```ts
  if (asNumber(scope.fetch_failures) === null) errors.push('fetch_failures is not a number.');
  if (asNumber(scope.mono_dropped) === null) errors.push('mono_dropped is not a number.');
```

- [ ] **Step 5: Add the `Chroma` type**

In `pipeline/lib/images.ts`, replace:

```ts
export type Resize = (bytes: Uint8Array, maxSide: number, quality: number) => Promise<Uint8Array>;
```

with:

```ts
export type Resize = (bytes: Uint8Array, maxSide: number, quality: number) => Promise<Uint8Array>;

// The real Chroma is `chromaOf` in chroma.ts. A test passes a fake or the real one.
export type Chroma = (bytes: Uint8Array) => Promise<number>;
```

- [ ] **Step 6: Add `chroma` to `CliDeps` and the imports of `commands.ts`**

In `pipeline/lib/commands.ts`, replace:

```ts
import {
  collect,
  interleave,
  licenseAllowed,
  makeCandidate,
  mergeFound,
  type Candidate,
} from './candidates.ts';
```

with:

```ts
import {
  MONO_THRESHOLD,
  collect,
  interleave,
  licenseAllowed,
  makeCandidate,
  mergeFound,
  type Candidate,
} from './candidates.ts';
```

Replace:

```ts
  sha256Hex,
  type Resize,
} from './images.ts';
```

with:

```ts
  sha256Hex,
  type Chroma,
  type Resize,
} from './images.ts';
```

Replace:

```ts
  resize: Resize;
  validate: (raw: RawContent) => ValidationResult;
```

with:

```ts
  resize: Resize;
  /** The colour measure. `pipeline/cli.ts` loads `chromaOf` on first use, so `ids check` needs no sharp. */
  chroma: Chroma;
  validate: (raw: RawContent) => ValidationResult;
```

- [ ] **Step 7: Drop monochrome rows in `photosFetch`**

In `pipeline/lib/commands.ts`, in `photosFetch`, replace:

```ts
  const noProfile: string[] = [];
  let appended = 0;
```

with:

```ts
  const noProfile: string[] = [];
  let appended = 0;
  let monoDropped = 0;
```

Replace:

```ts
    for (const row of collected.added) await download(deps, row);
    // The append happens per target, so a run that stops on the third target keeps the
    // rows of the first two.
    if (collected.added.length > 0) appendJsonl(candidatesPath, collected.added);
    existing = existing.concat(collected.added);
    appended += collected.added.length;
  }
```

with:

```ts
    // The colour check runs after the download and before the append. A dropped row keeps
    // its cache file, so a rerun measures it again with no new download.
    const kept: Candidate[] = [];
    let mono = 0;
    for (const row of collected.added) {
      await download(deps, row);
      const bytes = localBytes(deps.root, row);
      // A failed download has no cached file. Its row is still appended, as before.
      if (bytes === null) {
        kept.push(row);
        continue;
      }
      let score: number;
      try {
        score = await deps.chroma(bytes);
      } catch (error) {
        // The bytes arrived but do not decode. That counts as a download failure.
        recordFailure(
          deps.http,
          row.file_url,
          200,
          `the image does not decode: ${errorMessage(error)}`,
          now,
        );
        continue;
      }
      if (score < MONO_THRESHOLD) {
        mono += 1;
        continue;
      }
      kept.push(row);
    }
    if (mono > 0) console.error(`${target.key}: ${mono} monochrome dropped`);
    // The append happens per target, so a run that stops on the third target keeps the
    // rows of the first two.
    if (kept.length > 0) appendJsonl(candidatesPath, kept);
    existing = existing.concat(kept);
    appended += kept.length;
    monoDropped += mono;
  }
```

Replace:

```ts
  scope.fetch_failures = deps.http.failures.length;
  writeRun(deps.root, scope);
  gitCommitAll(deps.exec, `content(${name}): photo candidates`);
  printFailures(deps);
  console.log(
    `${appended} candidates appended to ${relative(deps.root, candidatesPath)}, ${scope.fetch_failures} download failures`,
  );
  return 0;
}
```

with:

```ts
  scope.fetch_failures = deps.http.failures.length;
  scope.mono_dropped = monoDropped;
  writeRun(deps.root, scope);
  gitCommitAll(deps.exec, `content(${name}): photo candidates`);
  printFailures(deps);
  console.log(
    `${appended} candidates appended to ${relative(deps.root, candidatesPath)}, ${scope.fetch_failures} download failures, ${scope.mono_dropped} monochrome dropped`,
  );
  return 0;
}
```

`speciesList` also holds the line `scope.fetch_failures = deps.http.failures.length;`, but there `writeRun` is followed by `writePlantsIds`. So the last block above matches `photosFetch` only.

- [ ] **Step 8: Wire the real measure in `cli.ts`**

In `pipeline/cli.ts`, replace:

```ts
import type { Resize } from './lib/images.ts';
```

with:

```ts
import type { Chroma, Resize } from './lib/images.ts';
```

Replace:

```ts
const lazyResize: Resize = async (bytes, maxSide, quality) => {
  const { sharpResize } = await import('./lib/sharp_resizer.ts');
  return sharpResize(bytes, maxSide, quality);
};
```

with:

```ts
const lazyResize: Resize = async (bytes, maxSide, quality) => {
  const { sharpResize } = await import('./lib/sharp_resizer.ts');
  return sharpResize(bytes, maxSide, quality);
};

// chroma.ts imports sharp too, so it also loads on first use.
const lazyChroma: Chroma = async (bytes) => {
  const { chromaOf } = await import('./lib/chroma.ts');
  return chromaOf(bytes);
};
```

Replace:

```ts
    resize: lazyResize,
    validate: validateContent,
```

with:

```ts
    resize: lazyResize,
    chroma: lazyChroma,
    validate: validateContent,
```

- [ ] **Step 9: Add `chroma` to the build test fixture**

In `pipeline/tests/cli_build.test.ts`, in `setup`, replace:

```ts
    resize,
    cdnBase: CDN,
```

with:

```ts
    resize,
    // No build test measures colour. Every row scores as colour here.
    chroma: async () => 100,
    cdnBase: CDN,
```

- [ ] **Step 10: Add `mono_dropped` to the two merged runs**

`validateScope` checks `mono_dropped` as strictly as it checks `fetch_failures`. So both merged runs need the field, or `readRun` rejects them. Each file holds the line `"fetch_failures": 0,` once.

In `pipeline/runs/simple_lobed_co/run.json`, replace:

```json
  "fetch_failures": 0,
  "capped": [
    "ACER: inat any listing capped at 4 pages",
```

with:

```json
  "fetch_failures": 0,
  "mono_dropped": 0,
  "capped": [
    "ACER: inat any listing capped at 4 pages",
```

In `pipeline/runs/concepts_v0/run.json`, replace:

```json
  "fetch_failures": 0,
  "capped": [
    "leaf/needles: inat any listing capped at 4 pages",
```

with:

```json
  "fetch_failures": 0,
  "mono_dropped": 0,
  "capped": [
    "leaf/needles: inat any listing capped at 4 pages",
```

Change nothing else in either file.

- [ ] **Step 11: Check that both merged runs load**

The CLI has no read-only run command (`COMMANDS` holds none). Write this script with the Write tool as `check_runs.mjs` in your scratchpad directory:

```js
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const { readRun } = await import(pathToFileURL(path.join(process.cwd(), 'pipeline', 'lib', 'run.ts')).href);
for (const name of ['simple_lobed_co', 'concepts_v0']) readRun(process.cwd(), name); console.log('ok');
```

Run it from the worktree root: `node <scratchpad>/check_runs.mjs`
Expected: `ok`. A missing field makes `readRun` throw `… is not a run scope: mono_dropped is not a number.`

- [ ] **Step 12: Update the fetch summary line in the content-run skill**

In `.claude/skills/content-run/SKILL.md`, in Step 4, replace:

```markdown
`<n> candidates appended to pipeline/runs/<name>/candidates.jsonl, <m> download failures`,
```

with:

```markdown
`<n> candidates appended to pipeline/runs/<name>/candidates.jsonl, <m> download failures, <k> monochrome dropped`,
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `node --test pipeline/tests/run.test.ts pipeline/tests/cli_fetch.test.ts`
Expected: PASS, every test.

Run: `npm run test:pipeline`
Expected: PASS, every test.

Check that `commands.ts` still loads no `sharp`:

Run: `grep -n "chroma.ts\|from 'sharp'" pipeline/lib/commands.ts`
Expected: no output.

- [ ] **Step 14: Commit**

```bash
git add pipeline/lib/run.ts pipeline/lib/images.ts pipeline/lib/commands.ts pipeline/cli.ts pipeline/tests/run.test.ts pipeline/tests/cli_fetch.test.ts pipeline/tests/cli_build.test.ts pipeline/runs/simple_lobed_co/run.json pipeline/runs/concepts_v0/run.json .claude/skills/content-run/SKILL.md
git commit -m "feat: drop monochrome candidates in photos fetch" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The refusals in `photos add`

**Files:**
- Modify: `pipeline/lib/commands.ts` (imports; `photosAdd` lines 373-419; a new `chromaText` helper after `isoNow`)
- Test: `pipeline/tests/cli_fetch.test.ts`

**Interfaces:**
- Consumes: `CliDeps.chroma` and `MONO_THRESHOLD` (Task 3); `greyJpeg()` (Task 2); `candidateId(origin: string, target: string): string` (existing, `candidates.ts`).
- Produces:
  - `chromaText(score: number): string` in `commands.ts`, not exported. It returns `score.toFixed(1)`. Task 5 uses it.
  - `photosAdd` exits 1 on a duplicate id, before any download, with three stderr lines:
    ```
    refused: candidate <id> already exists for <target>
      existing origin: <origin of the existing row>
      add a fragment to the origin URL (for example #img2) to distinguish a second image on the same page
    ```
  - `photosAdd` exits 1 on a monochrome image, after the download or on the `--local` file, with one stderr line:
    ```
    refused: <id> for <target> is monochrome (chroma <score>, threshold 12). Colour photographs only (owner ruling 2026-09-24).
    ```

The candidate id is `sha1(target|origin)`. Two images from one origin page collide. The refusal tells the harvester to add a fragment to the origin URL (ledger, Step 15 follow-ups).

Two existing tests pass a `--local` path that does not exist. The colour check reads that file, so this task makes both tests write it first.

- [ ] **Step 1: Write the failing tests**

In `pipeline/tests/cli_fetch.test.ts`, add `candidateId` to the import from `../lib/candidates.ts`. Replace:

```ts
  SOURCE_NAMES,
  makeCandidate,
  type Candidate,
} from '../lib/candidates.ts';
```

with:

```ts
  SOURCE_NAMES,
  candidateId,
  makeCandidate,
  type Candidate,
} from '../lib/candidates.ts';
```

Add this helper directly after `manualAdd`:

```ts
/** Writes a stand-in image where the `--local` tests point, and returns its absolute path. */
function seedLocalFile(root: string): string {
  const file = path.join(root, 'pipeline', 'cache', 'manual', 'quga_bark.jpg');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, jpeg(1));
  return file;
}
```

In the test `'photos add appends one manual row and names a missing flag'`, replace:

```ts
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});

  const full = [
```

with:

```ts
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});
  seedLocalFile(root);

  const full = [
```

In the test `'photos add stores an absolute --local path root-relative with forward slashes'`, replace:

```ts
  const absolute = path.join(root, 'pipeline', 'cache', 'manual', 'quga_bark.jpg');
```

with:

```ts
  const absolute = seedLocalFile(root);
```

Add these two tests directly after the test `'photos add refuses a license the allowlist rejects'`:

```ts
test('photos add refuses a monochrome image and writes nothing', async (t) => {
  const fileUrl = 'https://www.fs.usda.gov/images/quga_bark.jpg';
  const grey = await greyJpeg();
  const { root, deps, err } = setup(t, new Map([[fileUrl, { bytes: grey }]]));
  deps.chroma = chromaOf;
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});
  const seeded = seedCandidate(root, 'QUGA', 0);

  assert.equal(await runCommand(manualAdd(fileUrl), deps), 1);

  const id = candidateId('https://www.fs.usda.gov/database/feis/quga.html', 'QUGA');
  const score = (await chromaOf(grey)).toFixed(1);
  assert.deepEqual(err, [
    `refused: ${id} for QUGA is monochrome (chroma ${score}, threshold 12). Colour photographs only (owner ruling 2026-09-24).`,
  ]);
  assert.deepEqual(candidatesOf(root), [seeded], 'candidates.jsonl is unchanged');
});

test('photos add refuses an id the run already holds and downloads nothing', async (t) => {
  const { root, deps, http, err } = setup(t);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});
  const origin = 'https://www.fs.usda.gov/database/feis/quga.html';
  const first = makeCandidate({
    target: 'QUGA',
    source_key: 'manual',
    source: 'USDA Forest Service',
    origin,
    file_url: 'https://www.fs.usda.gov/images/quga_first.jpg',
    author: 'US Forest Service',
    license: 'US government work',
    fetched_at: NOW,
  });
  appendJsonl(path.join(runDir(root, 'demo'), 'candidates.jsonl'), [first]);

  const code = await runCommand(manualAdd('https://www.fs.usda.gov/images/quga_second.jpg'), deps);

  assert.equal(code, 1);
  assert.deepEqual(err, [
    `refused: candidate ${first.id} already exists for QUGA`,
    `  existing origin: ${origin}`,
    '  add a fragment to the origin URL (for example #img2) to distinguish a second image on the same page',
  ]);
  assert.deepEqual(http.urls, [], 'the fake HTTP saw no request');
  assert.deepEqual(candidatesOf(root), [first], 'candidates.jsonl is unchanged');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: FAIL in `photos add refuses a monochrome image and writes nothing`: the code is 0, not 1, because the grey row is appended. FAIL in `photos add refuses an id the run already holds and downloads nothing`: the code is 1, but `err` holds `photos add could not download …`, and `http.urls` holds the file url. The two edited `--local` tests pass.

- [ ] **Step 3: Import `candidateId`**

In `pipeline/lib/commands.ts`, replace:

```ts
import {
  MONO_THRESHOLD,
  collect,
```

with:

```ts
import {
  MONO_THRESHOLD,
  candidateId,
  collect,
```

- [ ] **Step 4: Add the `chromaText` helper**

In `pipeline/lib/commands.ts`, replace:

```ts
function isoNow(deps: CliDeps): string {
  return deps.now().toISOString().replace(/\.\d+Z$/, 'Z');
}
```

with:

```ts
function isoNow(deps: CliDeps): string {
  return deps.now().toISOString().replace(/\.\d+Z$/, 'Z');
}

/** A chroma score with one decimal place, as the refusal and the audit lines print it. */
function chromaText(score: number): string {
  return score.toFixed(1);
}
```

- [ ] **Step 5: Add both refusals to `photosAdd`**

In `pipeline/lib/commands.ts`, in `photosAdd`, replace:

```ts
  if (!licenseAllowed(flags.license)) {
    console.error(`photos add license is not allowed: ${flags.license}`);
    return 1;
  }
  const row = makeCandidate({
```

with:

```ts
  if (!licenseAllowed(flags.license)) {
    console.error(`photos add license is not allowed: ${flags.license}`);
    return 1;
  }
  // The id is sha1(target|origin), so a second image from one origin page collides. The
  // check runs before the download, so a duplicate costs no request.
  const candidatesPath = path.join(runDir(deps.root, name), 'candidates.jsonl');
  const id = candidateId(flags.origin, flags.target);
  const existing = readJsonl<Candidate>(candidatesPath).find((one) => one.id === id);
  if (existing !== undefined) {
    console.error(`refused: candidate ${id} already exists for ${flags.target}`);
    console.error(`  existing origin: ${existing.origin}`);
    console.error(
      '  add a fragment to the origin URL (for example #img2) to distinguish a second image on the same page',
    );
    return 1;
  }
  const row = makeCandidate({
```

Replace:

```ts
    await download(deps, row);
    if (row.fetch_error !== null) {
      console.error(`photos add could not download ${row.file_url}: ${row.fetch_error}`);
      return 1;
    }
  }
  appendJsonl(path.join(runDir(deps.root, name), 'candidates.jsonl'), [row]);
  console.log(`manual candidate ${row.id} added for ${row.target}`);
  return 0;
}
```

with:

```ts
    await download(deps, row);
    if (row.fetch_error !== null) {
      console.error(`photos add could not download ${row.file_url}: ${row.fetch_error}`);
      return 1;
    }
  }
  // The colour check reads the downloaded file, or the --local file.
  const bytes = localBytes(deps.root, row);
  if (bytes === null) {
    console.error(`photos add --local file is missing: ${row.local}`);
    return 1;
  }
  let score: number;
  try {
    score = await deps.chroma(bytes);
  } catch (error) {
    console.error(`photos add could not read ${row.local} as an image: ${errorMessage(error)}`);
    return 1;
  }
  if (score < MONO_THRESHOLD) {
    console.error(
      `refused: ${row.id} for ${row.target} is monochrome (chroma ${chromaText(score)}, threshold ${MONO_THRESHOLD}). Colour photographs only (owner ruling 2026-09-24).`,
    );
    return 1;
  }
  appendJsonl(candidatesPath, [row]);
  console.log(`manual candidate ${row.id} added for ${row.target}`);
  return 0;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: PASS, every test.

Run: `npm run test:pipeline`
Expected: PASS, every test.

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/commands.ts pipeline/tests/cli_fetch.test.ts
git commit -m "feat: refuse a duplicate id and a monochrome image in photos add" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The `photos audit` command

**Files:**
- Modify: `pipeline/lib/commands.ts` (`USAGE`, `COMMANDS`, a new `photosAudit` handler and its helpers after `photosVerdict`)
- Modify: `pipeline/lib/run.ts:30-31` (`BOOLEAN_FLAGS`)
- Modify: `.claude/skills/content-run/SKILL.md:99-101` (one line after Step 6)
- Test: `pipeline/tests/cli_audit.test.ts` (new), `pipeline/tests/cli_fetch.test.ts` (usage list)

**Interfaces:**
- Consumes: `CliDeps.chroma` and `MONO_THRESHOLD` (Task 3); `chromaText(score)` (Task 4); `chromaOf`, `greyJpeg()`, `redJpeg()` (Task 2); existing `objectKey(hash)`, `readManifest(root)`, `localBytes(root, candidate)`, `readJsonl`, `runDir`, `parseFlags`, `positional`, `errorMessage`.
- Produces:
  - `'photos audit': photosAudit` in `COMMANDS`.
  - `BOOLEAN_FLAGS` is `['refresh', 'manifest']`.
  - Run mode `cli photos audit <run> [--threshold <n>]` prints `<id> <target> <channel_hint or -> <score> <origin>` per row under the threshold.
  - Manifest mode `cli photos audit --manifest [--threshold <n>]` prints `<hash> <target> <channel> <score> <origin>` per row under the threshold.
  - Both end with `<total> measured, <skipped> skipped, <under> under threshold <t>` and exit 0.

Run mode reads `pipeline/runs/<run>/candidates.jsonl`. A row with no `local`, or with a `local` file that is missing, counts as skipped. It does not call `readRun`, so it works on a run whose `run.json` has no `mono_dropped`.

Manifest mode reads `content/images/manifest.json` and skips each row with `retired: true`. A retired row is not counted. For each other row it fetches `${deps.cdnBase}${objectKey(hash)}` through `deps.http.getBytes`, which caches the bytes. A failed fetch counts as skipped.

In both modes, bytes that do not decode count as skipped, and a stderr line names the row.

- [ ] **Step 1: Write the failing tests**

`pipeline/tests/cli_audit.test.ts`:

```ts
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateContent } from '../../app/logic/content.js';
import { makeCandidate, type Candidate } from '../lib/candidates.ts';
import { chromaOf } from '../lib/chroma.ts';
import { runCommand, type CliDeps } from '../lib/commands.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
import { objectKey } from '../lib/images.ts';
import { appendJsonl } from '../lib/jsonl.ts';
import type { ManifestRow } from '../lib/manifest.ts';
import { runDir } from '../lib/run.ts';
import { memoryStorage } from '../lib/storage.ts';
import { greyJpeg, redJpeg } from './fixtures/images.ts';
import { captureConsole, fakeExec } from './helpers.ts';

const NOW = '2026-09-24T12:00:00Z';
const CDN_BASE = 'https://images.dendro.test/';
const GREY_HASH = 'a'.repeat(64);
const RED_HASH = 'b'.repeat(64);
const RETIRED_HASH = 'c'.repeat(64);

/** A bytes-only Http over a route map. It records every url it is asked for. */
function fakeHttp(routes: Map<string, Uint8Array>): Http & { urls: string[] } {
  const urls: string[] = [];
  const failures: HttpFailure[] = [];
  const noText = async (url: string): Promise<TextResult> => {
    urls.push(url);
    failures.push({ url, status: 0, message: 'the audit fake serves bytes only', at: NOW });
    return { ok: false, status: 0, body: '', fromCache: false, error: 'no route' };
  };
  return {
    failures,
    urls,
    getText: noText,
    postJson: (url: string) => noText(url),
    async getBytes(url: string): Promise<BytesResult> {
      urls.push(url);
      const bytes = routes.get(url);
      if (bytes === undefined) {
        failures.push({ url, status: 0, message: 'no route', at: NOW });
        return { ok: false, status: 0, bytes: null, fromCache: false, error: 'no route' };
      }
      return { ok: true, status: 200, bytes, fromCache: false, error: null };
    },
  };
}

function setup(t: TestContext, routes: Map<string, Uint8Array> = new Map()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { out, err } = captureConsole(t);
  const http = fakeHttp(routes);
  const deps: CliDeps = {
    root,
    exec: fakeExec(),
    http,
    storage: memoryStorage(),
    resize: async (bytes) => bytes,
    chroma: chromaOf,
    validate: validateContent,
    cdnBase: CDN_BASE,
    now: () => new Date(NOW),
  };
  return { root, deps, http, out, err };
}

/** Writes the bytes into the manual cache and returns the root-relative POSIX path. */
function cache(root: string, name: string, bytes: Uint8Array): string {
  const file = path.join(root, 'pipeline', 'cache', 'manual', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return `pipeline/cache/manual/${name}`;
}

function candidate(index: number, local: string | null): Candidate {
  return makeCandidate({
    target: 'QUGA',
    source_key: 'manual',
    source: 'a field notebook',
    origin: `https://example.org/audit/${index}`,
    file_url: `https://example.org/audit/${index}.jpg`,
    author: 'A Seeder',
    license: 'public domain',
    channel_hint: index === 0 ? 'bark' : null,
    local,
    fetched_at: NOW,
  });
}

/** One grey row, one red row, and one row with no cached file. Returns the grey row. */
async function seedRunRows(root: string): Promise<Candidate> {
  const grey = candidate(0, cache(root, 'grey.jpg', await greyJpeg()));
  const red = candidate(1, cache(root, 'red.jpg', await redJpeg()));
  const missing = candidate(2, null);
  appendJsonl(path.join(runDir(root, 'demo'), 'candidates.jsonl'), [grey, red, missing]);
  return grey;
}

function manifestRow(hash: string, retired: boolean): ManifestRow {
  const row: ManifestRow = {
    hash,
    target: 'QUGA',
    channel: 'leaf',
    source: 'Wikimedia Commons',
    author: 'A Photographer',
    license: 'CC BY 4.0',
    origin: `https://commons.wikimedia.org/wiki/File:${hash.slice(0, 4)}.jpg`,
    tags: [],
    checked_by: 'photo_check_agent',
    checked_at: NOW,
    note: '',
  };
  if (retired) {
    row.retired = true;
    row.retired_reason = 'a test row';
    row.retired_at = '2026-09-24';
  }
  return row;
}

function writeManifest(root: string, rows: ManifestRow[]): void {
  const file = path.join(root, 'content', 'images', 'manifest.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
}

async function scoreText(bytes: Uint8Array): Promise<string> {
  return (await chromaOf(bytes)).toFixed(1);
}

test('photos audit <run> prints each row under the threshold and a summary', async (t) => {
  const { root, deps, out } = setup(t);
  const grey = await seedRunRows(root);

  assert.equal(await runCommand(['photos', 'audit', 'demo'], deps), 0);

  assert.deepEqual(out, [
    `${grey.id} QUGA bark ${await scoreText(await greyJpeg())} ${grey.origin}`,
    '2 measured, 1 skipped, 1 under threshold 12',
  ]);
});

test('photos audit --manifest measures the live rows and never requests a retired one', async (t) => {
  const grey = await greyJpeg();
  const retiredUrl = `${CDN_BASE}${objectKey(RETIRED_HASH)}`;
  const routes = new Map<string, Uint8Array>([
    [`${CDN_BASE}${objectKey(GREY_HASH)}`, grey],
    [`${CDN_BASE}${objectKey(RED_HASH)}`, await redJpeg()],
    [retiredUrl, grey],
  ]);
  const { root, deps, http, out } = setup(t, routes);
  const rows = [
    manifestRow(GREY_HASH, false),
    manifestRow(RED_HASH, false),
    manifestRow(RETIRED_HASH, true),
  ];
  writeManifest(root, rows);

  assert.equal(await runCommand(['photos', 'audit', '--manifest'], deps), 0);

  assert.deepEqual(out, [
    `${GREY_HASH} QUGA leaf ${await scoreText(grey)} ${rows[0].origin}`,
    '2 measured, 0 skipped, 1 under threshold 12',
  ]);
  assert.ok(!http.urls.includes(retiredUrl), 'the retired hash was never requested');
});

test('photos audit --threshold 0 prints no row lines', async (t) => {
  const { root, deps, out } = setup(t);
  await seedRunRows(root);

  assert.equal(await runCommand(['photos', 'audit', 'demo', '--threshold', '0'], deps), 0);

  assert.deepEqual(out, ['2 measured, 1 skipped, 0 under threshold 0']);
});
```

In `pipeline/tests/cli_fetch.test.ts`, in the test `'no argument prints the usage block and fails'`, replace:

```ts
    'photos verdict',
    'build',
```

with:

```ts
    'photos verdict',
    'photos audit',
    'build',
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test pipeline/tests/cli_audit.test.ts`
Expected: FAIL in all three tests: `runCommand` returns 1, not 0, because `photos audit` is not in `COMMANDS` and the usage block prints.

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: FAIL in `no argument prints the usage block and fails` with `the usage block names photos audit`.

- [ ] **Step 3: Make `--manifest` a flag with no value**

In `pipeline/lib/run.ts`, replace:

```ts
/** The only flag that takes no value. Every other flag needs one. */
export const BOOLEAN_FLAGS: string[] = ['refresh'];
```

with:

```ts
/** The flags that take no value. Every other flag needs one. */
export const BOOLEAN_FLAGS: string[] = ['refresh', 'manifest'];
```

- [ ] **Step 4: Add the usage lines**

In `pipeline/lib/commands.ts`, in `USAGE`, replace:

```ts
  photos verdict <name> --candidate <id> --verdict <${VERDICT_KINDS.join('|')}> [--channel <c>] [--tags a,b] [--case <case>] --note "<text>"
```

with:

```ts
  photos verdict <name> --candidate <id> --verdict <${VERDICT_KINDS.join('|')}> [--channel <c>] [--tags a,b] [--case <case>] --note "<text>"
  photos audit <name> [--threshold <n>]
  photos audit --manifest [--threshold <n>]
```

- [ ] **Step 5: Write the handler**

In `pipeline/lib/commands.ts`, directly before the line `async function dataSections(_rest: string[], deps: CliDeps): Promise<number> {`, add:

```ts
interface AuditTally {
  measured: number;
  skipped: number;
  under: number;
}

/**
 * Lists every row under the colour threshold, in a run or in the published manifest. It
 * reports only. Retiring an image is the owner's decision, through `images retire`.
 */
async function photosAudit(rest: string[], deps: CliDeps): Promise<number> {
  const flags = parseFlags(rest);
  const threshold = thresholdOf(flags);
  if (threshold === null) {
    console.error(`photos audit --threshold needs a number: ${flags.threshold}`);
    return 1;
  }
  const tally: AuditTally = { measured: 0, skipped: 0, under: 0 };
  if (flags.manifest === 'true') {
    await auditManifest(deps, threshold, tally);
  } else {
    const name = positional(rest, 'photos audit <name> [--threshold <n>]');
    await auditRun(deps, name, threshold, tally);
  }
  console.log(
    `${tally.measured} measured, ${tally.skipped} skipped, ${tally.under} under threshold ${threshold}`,
  );
  return 0;
}

/** MONO_THRESHOLD when --threshold is absent. Null when the value is not a number. */
function thresholdOf(flags: Record<string, string>): number | null {
  const value = flags.threshold;
  if (value === undefined) return MONO_THRESHOLD;
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) ? number : null;
}

/** Measures each row of the run that has a cached file. It does not read run.json. */
async function auditRun(
  deps: CliDeps,
  name: string,
  threshold: number,
  tally: AuditTally,
): Promise<void> {
  const dir = runDir(deps.root, name);
  if (!fs.existsSync(dir)) throw new Error(`run ${name} does not exist.`);
  for (const row of readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'))) {
    const bytes = localBytes(deps.root, row);
    const score = bytes === null ? null : await auditScore(deps, row.id, bytes);
    if (score === null) {
      tally.skipped += 1;
      continue;
    }
    tally.measured += 1;
    if (score < threshold) {
      tally.under += 1;
      console.log(
        `${row.id} ${row.target} ${row.channel_hint ?? '-'} ${chromaText(score)} ${row.origin}`,
      );
    }
  }
}

/** Measures each live manifest row through the CDN. A retired row is not read and not counted. */
async function auditManifest(deps: CliDeps, threshold: number, tally: AuditTally): Promise<void> {
  for (const row of readManifest(deps.root)) {
    if (row.retired === true) continue;
    const result = await deps.http.getBytes(`${deps.cdnBase}${objectKey(row.hash)}`);
    if (!result.ok || result.bytes === null) {
      console.error(`${row.hash}: fetch failed: ${result.error ?? `status ${result.status}`}`);
      tally.skipped += 1;
      continue;
    }
    const score = await auditScore(deps, row.hash, result.bytes);
    if (score === null) {
      tally.skipped += 1;
      continue;
    }
    tally.measured += 1;
    if (score < threshold) {
      tally.under += 1;
      console.log(`${row.hash} ${row.target} ${row.channel} ${chromaText(score)} ${row.origin}`);
    }
  }
}

/** The chroma of the bytes. Null, with a line that names the row, when they do not decode. */
async function auditScore(deps: CliDeps, label: string, bytes: Uint8Array): Promise<number | null> {
  try {
    return await deps.chroma(bytes);
  } catch (error) {
    console.error(`${label}: the image does not decode: ${errorMessage(error)}`);
    return null;
  }
}

```

- [ ] **Step 6: Register the command**

In `pipeline/lib/commands.ts`, replace:

```ts
  'photos verdict': photosVerdict,
  'data sections': dataSections,
```

with:

```ts
  'photos verdict': photosVerdict,
  'photos audit': photosAudit,
  'data sections': dataSections,
```

- [ ] **Step 7: Add the line to the content-run skill**

In `.claude/skills/content-run/SKILL.md`, replace:

```markdown
- `<id> is in the published … and is gone from the new content` — a published ID left the
  content. Never delete a published ID. Retire it instead.

- [ ] **Step 7: Hunt for the thin channels (agent)**
```

with:

```markdown
- `<id> is in the published … and is gone from the new content` — a published ID left the
  content. Never delete a published ID. Retire it instead.

Run `node pipeline/cli.ts photos audit <name>` to list any candidate under the colour threshold. The fetch already drops these, so the list is normally empty.

- [ ] **Step 7: Hunt for the thin channels (agent)**
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test pipeline/tests/cli_audit.test.ts pipeline/tests/cli_fetch.test.ts`
Expected: PASS, every test.

Run: `npm run test:pipeline`
Expected: PASS, every test.

- [ ] **Step 9: Run the full suite**

Run: `npm run test:all`
Expected: PASS in all three suites. Report the pass count of the app suite, the pipeline suite, and the live suite. The live count is the same as the count before Task 1.

- [ ] **Step 10: Commit**

```bash
git add pipeline/lib/commands.ts pipeline/lib/run.ts pipeline/tests/cli_audit.test.ts pipeline/tests/cli_fetch.test.ts .claude/skills/content-run/SKILL.md
git commit -m "feat: add photos audit for runs and the published manifest" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## After the merge

Spec section 8 is an owner step, not a task of this plan. On `main`, run `node pipeline/cli.ts photos audit --manifest`. Give the owner the list of rows under the threshold. The owner decides which to retire with `images retire`.
