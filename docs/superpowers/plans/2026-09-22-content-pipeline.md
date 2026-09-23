# Dendro Content Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the content pipeline that fills `content/` for the Dendro app: it fetches species facts and photos from USDA PLANTS, Flora of North America, iNaturalist, and Wikimedia Commons, has agents approve the photos, uploads the approved ones to object storage, and opens a draft pull request with a report.

**Architecture:** One CLI, `pipeline/cli.ts`, runs each step of a content run. Pure modules under `pipeline/lib/` parse a response, merge a record, or render a table. Disk, network, the clock, object storage, and image resizing arrive as parameters, so every test runs offline against fakes and recorded fixtures. A run's records live under `pipeline/runs/<name>/` and are committed as the audit trail. Approved images leave the repo: the pipeline uploads them to object storage behind a CDN, keyed by the sha256 of the resized bytes.

**Tech Stack:** Node 24 with TypeScript, run through Node's built-in type stripping. No compile step. Dev dependencies only: `sharp` for resizing, `@aws-sdk/client-s3` for the uploads, and `@types/node`. Tests run with `node --test`. `git` and `gh` do the branch and the pull request.

## Global Constraints

- Node 24 or later. TypeScript runs through Node's built-in type stripping. There is no build step.
- Erasable TypeScript syntax only: no enums, no parameter properties, no namespaces. A relative import inside `pipeline/` carries the `.ts` extension.
- Dev dependencies only, and three of them: `sharp`, `@aws-sdk/client-s3`, `@types/node`. The app imports none of them and keeps zero runtime dependencies.
- Pipeline tests live in `pipeline/tests/` and run with `node --test "pipeline/tests/**/*.test.ts"`. The app keeps its own `node --test "tests/**/*.test.js"`.
- No test calls a live API. Every network call goes through `pipeline/lib/http.ts`, which takes `fetch` as an injected option. Tests feed it recorded fixtures under `pipeline/tests/fixtures/`.
- No test needs `sharp` or an S3 client. Image resizing is the `Resize` function type and object storage is the `Storage` interface. Tests pass fakes.
- Every data name is snake_case: JSON fields, file names, directory names, CLI flags. TypeScript identifiers are camelCase and types are PascalCase.
- Timestamps are ISO 8601 with a `Z`. Dates are `YYYY-MM-DD`.
- The manifest row shape, the `retired` fields, the `img/<hash>.jpg` object key, the 1200 px quality 82 EXIF-stripped JPEG, and the append-only rule are fixed by both specs. Do not redesign them.
- The pipeline never runs in the app, never in CI, and never on the server. CI runs the validator and the append-only check only.
- The fixture under `content_dev/` belongs to the app plan. The pipeline never writes it.
- `pipeline/runs/` is committed. `pipeline/cache/` and `node_modules/` are ignored by git.
- Commit messages end with the line: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

## For agentic workers

- The machine is Windows 11 with Git Bash. Any single shell command must stay under 5,000 bytes.
- Write file contents with the Write tool. Edit files with the Edit tool. Never use heredocs, `cat > file`, `echo >`, or `sed -i` for file content.
- Run one test file with `node --test pipeline/tests/<name>.test.ts`. Run the pipeline suite with `node --test "pipeline/tests/**/*.test.ts"`.
- Commit with two `-m` flags so the command stays short:
  `git commit -m "feat: subject line" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`
- **Two branches are open at once.** The app plan runs in its own worktree on its own branch. This plan runs in a second worktree on branch `pipeline`. Neither has merged to `main`. Tasks 1 to 15 touch only `pipeline/`, `content_src/`, and `.claude/skills/`, so they never collide with the app branch. Tasks 16 to 19 edit files the app plan writes first. Each of them starts only after the app branch has merged to `main` and this branch has been rebased onto `main`.
- Until that rebase there is no `package.json` and no `app/logic/content.js` on this branch. Node detects module syntax on its own, so the tests run without a `package.json`. A test that needs the content validator uses the local stub in `pipeline/lib/stub_validator.ts` and says so.

## File Structure

| File | Responsibility |
|---|---|
| `pipeline/cli.ts` | Entry point. `node pipeline/cli.ts <command> [flags]`. Dispatch only. |
| `pipeline/lib/http.ts` | Per-host limiter, disk cache, User-Agent, 429 and 5xx retry. |
| `pipeline/lib/jsonl.ts` | Read, write, and append a JSON-lines file. |
| `pipeline/lib/candidates.ts` | The candidate row, the license allowlist, the channel hints, the queue, the dedupe, and the caps. |
| `pipeline/lib/plants.ts` | PLANTS profile, subordinate taxa, distribution, checklist, and image parsing. |
| `pipeline/lib/fna.ts` | The oak section table from Flora of North America. |
| `pipeline/lib/inat.ts` | iNaturalist taxon lookup and observation photos. |
| `pipeline/lib/commons.ts` | Wikimedia Commons category listing and image info. |
| `pipeline/lib/species.ts` | The fetched layer, the authored layer, and the merge. |
| `pipeline/lib/verdicts.ts` | Verdict rows, the identity check, the stop rule, and owner decisions. |
| `pipeline/lib/images.ts` | The sha256, the object key, and the `Resize` type. |
| `pipeline/lib/storage.ts` | The `Storage` interface and the in-memory fake. |
| `pipeline/lib/manifest.ts` | Approved verdicts to uploads and manifest rows, and the retire command. |
| `pipeline/lib/ids.ts` | The append-only check over the last published content. |
| `pipeline/lib/report.ts` | `report.md` from the run's data. |
| `pipeline/lib/run.ts` | Run scope, flag parsing, branch, commit, and the draft pull request. |
| `pipeline/lib/stub_validator.ts` | A stand-in for the app validator until the app branch merges. Task 17 moves it into `pipeline/tests/`. |
| `pipeline/lib/sharp_resizer.ts` | The real `Resize`, built on `sharp`. Task 16 creates it. |
| `pipeline/lib/s3_storage.ts` | The real `Storage`, built on `@aws-sdk/client-s3`. Task 16 creates it. |
| `pipeline/data/quercus_sections.json` | Committed table, scientific name to oak section. |
| `pipeline/data/inat_terms.json` | Committed `flowering_value_id`. |
| `pipeline/data/plants_ids.json` | Committed map, PLANTS symbol to PLANTS id. |
| `pipeline/tests/*.test.ts` | The suite. No network. |
| `pipeline/tests/fixtures/` | Recorded responses. |
| `pipeline/runs/<name>/` | `run.json`, `candidates.jsonl`, `verdicts.jsonl`, `decisions.json`, `report.md`. |
| `pipeline/cache/` | Raw responses and original images. Ignored by git. |
| `content_src/species/<SYMBOL>.json` | Authored species fields with `ref`. |
| `.claude/skills/content-run/` | The orchestrating skill, one step per CLI command. |
| `.claude/skills/photo-check/` | The approval agent. |
| `.claude/skills/species-draft/` | Authored species fields from named references. |
| `.claude/skills/edges-draft/` | Confusion edges from named references. |

Five files are shared with the app plan, which writes each of them first: `package.json`, `.gitignore`, `content/*.json`, `app/logic/content.js`, and `.github/workflows/check.yml`. Tasks 16 to 19 own every change to them.

## Choices made where the spec is silent

Each choice is the simplest option that satisfies the surrounding rules.

1. **Every side effect arrives as a parameter.** Network, disk, the clock, object storage, and image resizing are injected. No module reaches for a global. This is what lets the whole suite run offline and lets Tasks 1 to 15 finish before the dependencies exist.
2. **The license allowlist and the candidate row sit in `candidates.ts` from Task 2**, because every source module imports them. The queue, the dedupe, and the caps join the same file in Task 8. The spec names `candidates.ts` as the home of the allowlist, so this splits the file's build across two tasks rather than moving the constant.
3. **The channel list is `leaf`, `bark`, `fruit`, `flower`, `twig`.** v0 content covers the first three. The hint table maps keywords onto all five, because a Commons file name says `catkin` whether or not a flower unit exists yet.
4. **`licenseAllowed` matches normalized words, not an exact string.** It lower-cases the text, splits on non-letters, and admits `public domain`, `cc0`, `us government work`, `cc by`, and `cc by sa`. Any `nc` or `nd` word rejects the text. A version number never changes the verdict.
5. **The S3-compatible client is `@aws-sdk/client-s3`.** It talks to Cloudflare R2 and Backblaze B2 through an endpoint override, so the provider stays open.
6. **The object storage provider is Cloudflare R2.** Task 19 sets it up. The bucket name, the account id, and the key come from the environment.
7. **Fixtures are hand-built from the field shapes the spec documents.** No machine on this plan can reach the network. Task 19 replaces each fixture with a recorded response after the first live fetch and re-runs the suite.
8. **`pipeline/data/quercus_sections.json` ships seeded** with the oaks the v0 run names. `cli data sections` fills the full 90 rows on a machine with network. Task 19 runs it.
9. **`pipeline/data/inat_terms.json` holds `flowering_value_id`,** committed, because the `controlled_terms` endpoint did not answer. Task 19 confirms the value against a live observation.
10. **The contact URL in the User-Agent is `https://github.com/jdenn0514/dendro`.** Task 19 confirms it reaches a person before the first public run, as Wikimedia's policy expects.
11. **A candidate id is the sha1 hex of the origin URL,** as section 6 shows. Two sources that name the same origin collapse to one row.
12. **The last verdict row for a candidate id wins.** An owner decision is written after the agent verdict, so it overrides it without deleting anything. The file stays append-only.
13. **Escalated review copies use the key `review/<candidate_id>.jpg`,** so the lifecycle rule can target the whole prefix and a re-render overwrites rather than duplicates.
14. **Every command takes a root directory.** `runCommand(argv, deps)` reads `deps.root`, so a test runs a whole command against a temp directory.
15. **The append-only check reads `main` through an injected `gitShow(path)`** that returns `null` when the path is absent. A test passes a function, not a repository.
16. **The validator arrives through `CliDeps.validate`.** Before the app branch merges, `pipeline/lib/stub_validator.ts` supplies a stand-in that checks the shape the pipeline itself writes. Task 17 points the CLI at `validateContent` from `app/logic/content.js` and moves the stand-in into `pipeline/tests/` as a test double.
17. **A manual candidate is appended with `cli photos add`,** with one flag per field. The collector agent runs it. This keeps `candidates.jsonl` written by one code path.
18. **`plants_ids.json` is a plain object, symbol to id.** `cli species list` writes it and the run commits it, so a later run skips the profile call for a known symbol.
19. **`cli build` writes `content/` only after the validator and the append-only check both pass.** It builds the whole set in memory first.
20. **The report is rendered from one `ReportData` object.** `cli report` gathers the data and `renderReport` returns a string, so the test compares a string to a stored file.
21. **A PLANTS candidate's origin carries the image path as a URL fragment**, `https://plants.usda.gov/plant-profile/<SYMBOL>#image=<path>`. PLANTS has no page per image, and the profile page is the attribution page. Without the fragment every image of a species hashes to one candidate id and the dedupe drops all but the first, so PLANTS would contribute one photo per species. A fragment never reaches the server, so the link still opens the profile page. An iNaturalist observation keeps one origin for all its photos, which is the spec's rule and is intended.
22. **`cli build` uploads last.** Spec section 11 says a build that fails validation uploads nothing. So the build resizes and hashes in memory, wraps the storage client in `deferredStorage` to queue the puts, runs the validator and the append-only check, and flushes only when both pass.
23. **`cli build` is where a species retires.** No other module owns the species-level `retired` fields. The build reads the last published `species.json`, keeps every record it holds, and adds `retired: true` with a reason to a record that left the pool or whose every image was retired.
24. **`cli build` and `cli ids check` take `--base <ref>`, defaulting to `main`.** GitHub Actions checks out a pull request with no local `main`, so the CI step of Task 18 passes `origin/main`.
25. **`CliDeps` carries `cdn_base`.** The report links an escalated image through it. Task 17 wires it to the app's `CDN_BASE`, so the two never drift.
26. **A concept run's exemplar species live in `run.json` under `concept_exemplars`.** `cli run init --concepts` writes an empty object and the owner fills it before `photos fetch`, because the exemplars are a content judgment, not something a script can derive.
27. **The CDN host is `img.dendro.app`.** Task 17 writes it into `app/logic/content.js` and Task 19 binds it to the R2 bucket.

---

### Task 1: The HTTP layer

**Files:**
- Create: `pipeline/lib/http.ts`
- Test: `pipeline/tests/http.test.ts`

**Interfaces:**
- Consumes: nothing. This is the first module.
- Produces:
  - `VERSION: string` (`'0.1.0'`)
  - `CONTACT_URL: string` (`'https://github.com/jdenn0514/dendro'`)
  - `USER_AGENT: string` (`` `dendro-pipeline/${VERSION} (${CONTACT_URL})` ``)
  - `RATE_PER_SECOND: Record<string, number>`
  - `MAX_IN_FLIGHT: Record<string, number>`
  - `CACHE_DAYS: Record<string, number>`
  - `interface HttpFailure { url: string; status: number; message: string; at: string }`
  - `interface TextResult { ok: boolean; status: number; body: string; from_cache: boolean; error: string | null }`
  - `interface BytesResult { ok: boolean; status: number; bytes: Uint8Array | null; from_cache: boolean; error: string | null }`
  - `interface HttpOptions { cache_dir: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; refresh?: boolean }`
  - `interface Http { getText(url: string): Promise<TextResult>; postJson(url: string, body: unknown): Promise<TextResult>; getBytes(url: string): Promise<BytesResult>; failures: HttpFailure[] }`
  - `hostOf(url: string): string`
  - `cachePath(cacheDir: string, url: string, suffix: string): string`
  - `createHttp(options: HttpOptions): Http`

Every network call in the pipeline goes through this module. It holds one token bucket
per host, retries on 429 and 5xx, records a failure row for each url it gives up on, and
caches every good response on disk. The clock, the sleep, and the fetch all arrive as
options, so the tests run with a fake clock and no network.

`CONTACT_URL` points at the public repository. Wikimedia's policy expects the address in
the User-Agent to reach a person who can answer. Task 19 confirms the address before the
first public run.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/http.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CACHE_DAYS, USER_AGENT, cachePath, createHttp, hostOf } from '../lib/http.ts';

const INAT = 'https://api.inaturalist.org/v1/taxa?q=Quercus';
const COMMONS = 'https://commons.wikimedia.org/w/api.php?action=query';

interface Queued {
  status?: number;
  body?: string | Uint8Array;
  headers?: Record<string, string>;
  throws?: string;
}

interface Call {
  url: string;
  at: number;
  agent: string;
}

interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  sleeps: number[];
  advance: (ms: number) => void;
}

function makeClock(): Clock {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
    sleeps,
    advance: (ms: number) => { t += ms; },
  };
}

function makeFetch(clock: Clock, queue: Queued[]) {
  const calls: Call[] = [];
  const impl = async (url: string, init: RequestInit) => {
    const head = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(url), at: clock.now(), agent: head['User-Agent'] });
    const next = queue.shift();
    if (next === undefined) throw new Error(`no queued response for ${String(url)}`);
    if (next.throws !== undefined) throw new Error(next.throws);
    return new Response(next.body ?? 'ok', {
      status: next.status ?? 200,
      headers: next.headers ?? {},
    });
  };
  return { impl: impl as unknown as typeof fetch, calls };
}

function tmpCacheDir(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), 'dendro-http-'));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); });
  return dir;
}

test('the limiter spaces requests on one host and does not link hosts', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{}, {}, {}]);
  const http = createHttp({
    cache_dir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  await http.getText(`${INAT}&page=1`);
  await http.getText(`${INAT}&page=2`);
  assert.deepEqual(fake.calls.map((c) => c.at), [0, 1000]);
  assert.deepEqual(clock.sleeps, [1000]);
  await http.getText(COMMONS);
  assert.equal(fake.calls[2].at, 1000);
  assert.deepEqual(clock.sleeps, [1000]);
});

test('a 429 with Retry-After sleeps that many seconds and retries', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [
    { status: 429, headers: { 'Retry-After': '5' } },
    { status: 200, body: 'second try' },
  ]);
  const http = createHttp({
    cache_dir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  assert.deepEqual(clock.sleeps, [5000]);
  assert.equal(fake.calls.length, 2);
  assert.equal(res.ok, true);
  assert.equal(res.body, 'second try');
  assert.deepEqual(http.failures, []);
});

test('a 429 without Retry-After sleeps 30 seconds', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{ status: 429 }, { status: 200, body: 'late' }]);
  const http = createHttp({
    cache_dir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  assert.deepEqual(clock.sleeps, [30000]);
  assert.equal(res.body, 'late');
});

test('a 500 retries three times with doubling waits, then records one failure', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [
    { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 },
  ]);
  const http = createHttp({
    cache_dir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  assert.deepEqual(clock.sleeps, [2000, 4000, 8000]);
  assert.equal(fake.calls.length, 4);
  assert.equal(res.ok, false);
  assert.equal(res.status, 500);
  assert.equal(http.failures.length, 1);
  assert.equal(http.failures[0].url, INAT);
  assert.equal(http.failures[0].status, 500);
});

test('a 404 records one failure and does not retry', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{ status: 404 }]);
  const http = createHttp({
    cache_dir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(clock.sleeps, []);
  assert.equal(res.ok, false);
  assert.equal(res.status, 404);
  assert.equal(http.failures.length, 1);
  assert.equal(http.failures[0].status, 404);
});

test('the cache hits on a second getText for the same url', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{ body: 'cached body' }]);
  const dir = tmpCacheDir(t);
  const http = createHttp({
    cache_dir: dir, fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const first = await http.getText(INAT);
  const second = await http.getText(INAT);
  assert.equal(fake.calls.length, 1);
  assert.equal(first.from_cache, false);
  assert.equal(second.from_cache, true);
  assert.equal(second.body, 'cached body');
  assert.equal(cachePath(dir, INAT, '.json').startsWith(join(dir, hostOf(INAT))), true);
});

test('the cache expires after the host lifetime', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{ body: 'old' }, { body: 'new' }]);
  const http = createHttp({
    cache_dir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  await http.getText(INAT);
  clock.advance((CACHE_DAYS['api.inaturalist.org'] + 1) * 86400000);
  const res = await http.getText(INAT);
  assert.equal(fake.calls.length, 2);
  assert.equal(res.from_cache, false);
  assert.equal(res.body, 'new');
});

test('refresh bypasses a warm cache and rewrites it', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{ body: 'first' }, { body: 'second' }]);
  const dir = tmpCacheDir(t);
  const opts = { cache_dir: dir, fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep };
  await createHttp(opts).getText(INAT);
  const forced = await createHttp({ ...opts, refresh: true }).getText(INAT);
  assert.equal(forced.from_cache, false);
  assert.equal(forced.body, 'second');
  assert.equal(fake.calls.length, 2);
  const after = await createHttp(opts).getText(INAT);
  assert.equal(after.from_cache, true);
  assert.equal(after.body, 'second');
  assert.equal(fake.calls.length, 2);
});

test('getBytes caches the bytes and never expires them', async (t) => {
  const clock = makeClock();
  const url = 'https://commons.wikimedia.org/image.jpg';
  const fake = makeFetch(clock, [{ body: new Uint8Array([1, 2, 3, 4]) }]);
  const http = createHttp({
    cache_dir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const first = await http.getBytes(url);
  assert.deepEqual(Array.from(first.bytes ?? []), [1, 2, 3, 4]);
  clock.advance(400 * 86400000);
  const second = await http.getBytes(url);
  assert.equal(fake.calls.length, 1);
  assert.equal(second.from_cache, true);
  assert.deepEqual(Array.from(second.bytes ?? []), [1, 2, 3, 4]);
});

test('a POST caches under the url and the body', async (t) => {
  const clock = makeClock();
  const url = 'https://plantsservices.sc.egov.usda.gov/api/PlantProfile/getDownload';
  const fake = makeFetch(clock, [{ body: 'rows for 1' }, { body: 'rows for 2' }]);
  const http = createHttp({
    cache_dir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  await http.postJson(url, { MasterId: 1 });
  const repeat = await http.postJson(url, { MasterId: 1 });
  assert.equal(fake.calls.length, 1);
  assert.equal(repeat.from_cache, true);
  assert.equal(repeat.body, 'rows for 1');
  const other = await http.postJson(url, { MasterId: 2 });
  assert.equal(fake.calls.length, 2);
  assert.equal(other.from_cache, false);
  assert.equal(other.body, 'rows for 2');
});

test('every request carries the User-Agent', async (t) => {
  assert.match(USER_AGENT, /^dendro-pipeline\/\d+\.\d+\.\d+ \(https:\/\/[^ )]+\)$/);
  const clock = makeClock();
  const fake = makeFetch(clock, [{}, { body: new Uint8Array([9]) }, {}]);
  const http = createHttp({
    cache_dir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  await http.getText(INAT);
  await http.getBytes('https://commons.wikimedia.org/image.jpg');
  await http.postJson('https://plants.sc.egov.usda.gov/api/x', { a: 1 });
  assert.equal(fake.calls.length, 3);
  for (const call of fake.calls) assert.equal(call.agent, USER_AGENT);
});

test('a thrown fetch retries and records a failure with status 0', async (t) => {
  const clock = makeClock();
  const queue = [1, 2, 3, 4].map(() => ({ throws: 'socket hang up' }));
  const fake = makeFetch(clock, queue);
  const http = createHttp({
    cache_dir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  assert.equal(fake.calls.length, 4);
  assert.deepEqual(clock.sleeps, [2000, 4000, 8000]);
  assert.equal(res.ok, false);
  assert.equal(res.status, 0);
  assert.equal(http.failures.length, 1);
  assert.equal(http.failures[0].status, 0);
  assert.equal(http.failures[0].message, 'socket hang up');
  assert.match(http.failures[0].at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});
```

The test needs no fixture file. It queues its own responses, and the global `Response`
builds each one, so the module reads `res.status`, `res.headers.get`, `res.text()`, and
`res.arrayBuffer()` for real.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/http.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\http.ts' imported from <repo>\pipeline\tests\http.test.ts`

- [ ] **Step 3: Create `pipeline/lib/http.ts`**

```ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const VERSION = '0.1.0';
// Task 19 confirms this address reaches a person before the first public run.
export const CONTACT_URL = 'https://github.com/jdenn0514/dendro';
export const USER_AGENT = `dendro-pipeline/${VERSION} (${CONTACT_URL})`;

export const RATE_PER_SECOND: Record<string, number> = {
  'plantsservices.sc.egov.usda.gov': 1,
  'plants.sc.egov.usda.gov': 1,
  'www.efloras.org': 1,
  'api.inaturalist.org': 1,
  'commons.wikimedia.org': 2,
};

export const MAX_IN_FLIGHT: Record<string, number> = {
  'commons.wikimedia.org': 3,
};

export const CACHE_DAYS: Record<string, number> = {
  'plantsservices.sc.egov.usda.gov': 30,
  'plants.sc.egov.usda.gov': 30,
  'www.efloras.org': 30,
  'api.inaturalist.org': 7,
  'commons.wikimedia.org': 7,
};

const MAX_RETRIES = 3;
const NO_RETRY_AFTER_MS = 30000;
const DEFAULT_CACHE_DAYS = 7;
const DAY_MS = 86400000;

export interface HttpFailure {
  url: string;
  status: number;        // 0 on a network error
  message: string;
  at: string;
}
export interface TextResult {
  ok: boolean;
  status: number;
  body: string;
  from_cache: boolean;
  error: string | null;
}
export interface BytesResult {
  ok: boolean;
  status: number;
  bytes: Uint8Array | null;
  from_cache: boolean;
  error: string | null;
}
export interface HttpOptions {
  cache_dir: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  refresh?: boolean;
}
export interface Http {
  getText(url: string): Promise<TextResult>;
  postJson(url: string, body: unknown): Promise<TextResult>;
  getBytes(url: string): Promise<BytesResult>;
  failures: HttpFailure[];
}

export function hostOf(url: string): string {
  return new URL(url).hostname;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function keyPath(cacheDir: string, url: string, key: string, suffix: string): string {
  return join(cacheDir, hostOf(url), sha256Hex(key) + suffix);
}

export function cachePath(cacheDir: string, url: string, suffix: string): string {
  return keyPath(cacheDir, url, url, suffix);
}

function writeFile(file: string, data: string | Uint8Array): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

function lifetimeMs(host: string): number {
  return (CACHE_DAYS[host] ?? DEFAULT_CACHE_DAYS) * DAY_MS;
}

interface HostGate { nextAt: number; inFlight: number; queue: (() => void)[] }
interface Sent { res: Response | null; status: number; error: string | null }

export function createHttp(options: HttpOptions): Http {
  const cacheDir = options.cache_dir;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => { setTimeout(r, ms); }));
  const refresh = options.refresh === true;
  const failures: HttpFailure[] = [];
  const gates = new Map<string, HostGate>();

  function gateFor(host: string): HostGate {
    const gate = gates.get(host) ?? { nextAt: 0, inFlight: 0, queue: [] };
    gates.set(host, gate);
    return gate;
  }

  async function acquire(host: string): Promise<void> {
    const gate = gateFor(host);
    const limit = MAX_IN_FLIGHT[host] ?? 1;
    while (gate.inFlight >= limit) {
      await new Promise<void>((resolve) => { gate.queue.push(resolve); });
    }
    gate.inFlight += 1;
    const wait = gate.nextAt - now();
    if (wait > 0) await sleep(wait);
    gate.nextAt = now() + 1000 / (RATE_PER_SECOND[host] ?? 1);
  }

  function release(host: string): void {
    const gate = gateFor(host);
    gate.inFlight -= 1;
    const next = gate.queue.shift();
    if (next !== undefined) next();
  }

  function retryAfterMs(res: Response): number {
    const header = res.headers.get('retry-after');
    const seconds = header === null ? NaN : Number(header);
    return Number.isFinite(seconds) ? seconds * 1000 : NO_RETRY_AFTER_MS;
  }

  async function send(url: string, init: RequestInit): Promise<Sent> {
    const host = hostOf(url);
    let status = 0;
    let error: string | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let res: Response | null = null;
      await acquire(host);
      try {
        res = await fetchImpl(url, init);
      } catch (err) {
        status = 0;
        error = (err as Error).message;
      } finally {
        release(host);
      }
      if (res !== null) {
        status = res.status;
        if (status === 429) {
          error = 'http 429';
          if (attempt === MAX_RETRIES) break;
          await sleep(retryAfterMs(res));
          continue;
        }
        // Every other 4xx is final. A 404 records one failure and stops here.
        if (status < 400) return { res, status, error: null };
        if (status < 500) return { res: null, status, error: `http ${status}` };
        error = `http ${status}`;
      }
      if (attempt === MAX_RETRIES) break;
      await sleep(2000 * 2 ** attempt);
    }
    return { res: null, status, error: error ?? 'request failed' };
  }

  function recordFailure(url: string, sent: Sent): void {
    failures.push({
      url,
      status: sent.status,
      message: sent.error ?? 'request failed',
      at: new Date(now()).toISOString(),
    });
  }

  function headers(extra: Record<string, string>): Record<string, string> {
    return { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip', ...extra };
  }

  async function text(url: string, init: RequestInit, file: string): Promise<TextResult> {
    if (!refresh && existsSync(file)) {
      const row = JSON.parse(readFileSync(file, 'utf8'));
      if (now() - Date.parse(row.fetched_at) < lifetimeMs(hostOf(url))) {
        return { ok: true, status: row.status, body: row.body, from_cache: true, error: null };
      }
    }
    const sent = await send(url, init);
    if (sent.res === null) {
      recordFailure(url, sent);
      return { ok: false, status: sent.status, body: '', from_cache: false, error: sent.error };
    }
    const body = await sent.res.text();
    const row = { url, fetched_at: new Date(now()).toISOString(), status: sent.status, body };
    writeFile(file, JSON.stringify(row));
    return { ok: true, status: sent.status, body, from_cache: false, error: null };
  }

  return {
    failures,
    getText(url: string): Promise<TextResult> {
      return text(url, { method: 'GET', headers: headers({}) }, cachePath(cacheDir, url, '.json'));
    },
    postJson(url: string, body: unknown): Promise<TextResult> {
      const payload = JSON.stringify(body);
      const init = {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: payload,
      };
      return text(url, init, keyPath(cacheDir, url, `${url}\n${payload}`, '.json'));
    },
    async getBytes(url: string): Promise<BytesResult> {
      const head = cachePath(cacheDir, url, '.bin.json');
      const bin = cachePath(cacheDir, url, '.bin');
      if (!refresh && existsSync(head) && existsSync(bin)) {
        const row = JSON.parse(readFileSync(head, 'utf8'));
        const cached = new Uint8Array(readFileSync(bin));
        return { ok: true, status: row.status, bytes: cached, from_cache: true, error: null };
      }
      const sent = await send(url, { method: 'GET', headers: headers({}) });
      if (sent.res === null) {
        recordFailure(url, sent);
        return { ok: false, status: sent.status, bytes: null, from_cache: false, error: sent.error };
      }
      const bytes = new Uint8Array(await sent.res.arrayBuffer());
      const row = { url, fetched_at: new Date(now()).toISOString(), status: sent.status };
      writeFile(bin, bytes);
      writeFile(head, JSON.stringify(row));
      return { ok: true, status: sent.status, bytes, from_cache: false, error: null };
    },
  };
}
```

Two notes for the reader:

- The module caches a response only when its status is under 400. A failed request never
  poisons the cache.
- `getBytes` writes the header to `<hash>.bin.json` and the bytes to `<hash>.bin`, so a
  text response and a byte response for the same url never share a file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test pipeline/tests/http.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/http.ts pipeline/tests/http.test.ts && git commit -m "feat: add the http layer" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: The candidate row, the license allowlist, and JSONL files

**Files:**
- Create: `pipeline/lib/jsonl.ts`
- Create: `pipeline/lib/candidates.ts` (first half)
- Test: `pipeline/tests/jsonl.test.ts`
- Test: `pipeline/tests/candidates_core.test.ts`

**Interfaces:**
- Consumes: nothing. This task imports only the Node standard library.
- Produces:
  - `readJsonl<T>(filePath: string): T[]`
  - `appendJsonl(filePath: string, rows: unknown[]): void`
  - `writeJsonl(filePath: string, rows: unknown[]): void`
  - `CHANNELS: string[]`
  - `LICENSE_ALLOWLIST: string[]`
  - `HINT_KEYWORDS: Record<string, string>`
  - `interface Candidate`
  - `candidateId(origin: string): string`
  - `licenseAllowed(text: string): boolean`
  - `channelHint(text: string): string | null`
  - `makeCandidate(fields: Partial<Candidate> & { target: string; source: string; origin: string; file_url: string }): Candidate`

This task creates the first half of `candidates.ts`: the row shape, the license
allowlist, the hint keywords, `candidateId`, and `makeCandidate`. Task 8 adds the queue,
the dedupe, and the caps to the same file.

The spec does not say where the allowlist and the row shape live. This plan puts them in
`candidates.ts` early, because every source module imports them, and the queue and the
caps join the same file in Task 8.

- [ ] **Step 1: Write the failing test for `jsonl`**

`pipeline/tests/jsonl.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readJsonl, appendJsonl, writeJsonl } from '../lib/jsonl.ts';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-jsonl-'));
}

test('writeJsonl then readJsonl round-trips an array of objects', () => {
  const dir = tempDir();
  const file = path.join(dir, 'rows.jsonl');
  const rows = [
    { id: 'a', n: 1, tags: ['leaf'] },
    { id: 'b', n: 2, tags: [] },
    { id: 'c', n: 3, tags: ['bark', 'winter'] },
  ];
  writeJsonl(file, rows);
  assert.deepEqual(readJsonl(file), rows);
});

test('writeJsonl replaces the rows a file already has', () => {
  const dir = tempDir();
  const file = path.join(dir, 'rows.jsonl');
  writeJsonl(file, [{ id: 'a' }, { id: 'b' }]);
  writeJsonl(file, [{ id: 'c' }]);
  assert.deepEqual(readJsonl(file), [{ id: 'c' }]);
});

test('appendJsonl adds rows to a file that already has some', () => {
  const dir = tempDir();
  const file = path.join(dir, 'rows.jsonl');
  writeJsonl(file, [{ id: 'a' }]);
  appendJsonl(file, [{ id: 'b' }, { id: 'c' }]);
  assert.deepEqual(readJsonl(file), [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
});

test('appendJsonl creates the file and its directory when they are absent', () => {
  const dir = tempDir();
  const file = path.join(dir, 'runs', 'v0-oaks', 'candidates.jsonl');
  appendJsonl(file, [{ id: 'a' }]);
  assert.equal(fs.existsSync(file), true);
  assert.deepEqual(readJsonl(file), [{ id: 'a' }]);
});

test('readJsonl on a missing file returns an empty array', () => {
  const dir = tempDir();
  assert.deepEqual(readJsonl(path.join(dir, 'absent.jsonl')), []);
});

test('readJsonl skips a blank line', () => {
  const dir = tempDir();
  const file = path.join(dir, 'rows.jsonl');
  fs.writeFileSync(file, '{"id":"a"}\n\n   \n{"id":"b"}\n', 'utf8');
  assert.deepEqual(readJsonl(file), [{ id: 'a' }, { id: 'b' }]);
});

test('every row ends with a newline, so a later append never joins two rows', () => {
  const dir = tempDir();
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/jsonl.test.ts`

Expected: FAIL, 1 test, 1 fail. Node prints:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\jsonl.ts' imported from <repo>\pipeline\tests\jsonl.test.ts
```

- [ ] **Step 3: Create `pipeline/lib/jsonl.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';

/** Reads a JSONL file. A missing file gives an empty array. Blank lines are skipped. */
export function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const rows: T[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    rows.push(JSON.parse(trimmed) as T);
  }
  return rows;
}

/** Appends rows. It creates the parent directory and the file when they are absent. */
export function appendJsonl(filePath: string, rows: unknown[]): void {
  if (rows.length === 0) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let text = '';
  // A file another tool wrote can lack the last newline. Add one so no two rows join.
  if (fs.existsSync(filePath)) {
    const current = fs.readFileSync(filePath, 'utf8');
    if (current !== '' && !current.endsWith('\n')) text += '\n';
  }
  text += serialize(rows);
  fs.appendFileSync(filePath, text, 'utf8');
}

/** Writes rows and replaces whatever the file held. */
export function writeJsonl(filePath: string, rows: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serialize(rows), 'utf8');
}

function serialize(rows: unknown[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join('');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test pipeline/tests/jsonl.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Write the failing test for the candidate core**

`pipeline/tests/candidates_core.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  CHANNELS,
  LICENSE_ALLOWLIST,
  HINT_KEYWORDS,
  candidateId,
  licenseAllowed,
  channelHint,
  makeCandidate,
} from '../lib/candidates.ts';

test('CHANNELS holds the five channels in order', () => {
  assert.deepEqual(CHANNELS, ['leaf', 'bark', 'fruit', 'flower', 'twig']);
});

test('LICENSE_ALLOWLIST holds the human labels for the report', () => {
  assert.deepEqual(LICENSE_ALLOWLIST, [
    'public domain',
    'US government work',
    'CC0, any version',
    'CC BY, any version',
    'CC BY-SA, any version',
  ]);
});

test('licenseAllowed admits every allowed license', () => {
  const allowed = [
    'Public domain',
    'public domain',
    'CC0 1.0',
    'CC0',
    'United States Government Work',
    'CC BY 2.0',
    'CC BY 4.0',
    'CC BY-SA 3.0',
    'CC BY-SA 4.0',
  ];
  for (const text of allowed) {
    assert.equal(licenseAllowed(text), true, `${text} must be allowed`);
  }
});

test('licenseAllowed rejects the NC, the ND, and the unfree licenses', () => {
  const rejected = [
    'CC BY-NC 4.0',
    'CC BY-NC-SA 4.0',
    'CC BY-ND 4.0',
    'CC BY-NC-ND 4.0',
    'All rights reserved',
    'GFDL',
    '',
  ];
  for (const text of rejected) {
    assert.equal(licenseAllowed(text), false, `${text} must be rejected`);
  }
});

test('candidateId is the sha1 hex of the origin url', () => {
  const origin = 'https://www.inaturalist.org/observations/12345';
  const expected = crypto.createHash('sha1').update(origin).digest('hex');
  assert.equal(candidateId(origin), expected);
  assert.equal(candidateId(origin).length, 40);
});

test('two different origin urls give two different ids', () => {
  const one = candidateId('https://www.inaturalist.org/observations/12345');
  const two = candidateId('https://www.inaturalist.org/observations/12346');
  assert.notEqual(one, two);
});

test('channelHint maps every keyword in HINT_KEYWORDS to its channel', () => {
  const expected: Record<string, string> = {
    bark: 'bark',
    trunk: 'bark',
    leaf: 'leaf',
    leaves: 'leaf',
    foliage: 'leaf',
    acorn: 'fruit',
    fruit: 'fruit',
    samara: 'fruit',
    cone: 'fruit',
    flower: 'flower',
    catkin: 'flower',
    bud: 'twig',
    twig: 'twig',
  };
  assert.deepEqual(HINT_KEYWORDS, expected);
  for (const [keyword, channel] of Object.entries(expected)) {
    assert.equal(channelHint(keyword), channel, `${keyword} maps to ${channel}`);
    assert.ok(CHANNELS.includes(channel));
  }
});

test('channelHint is case-insensitive and matches inside a longer word', () => {
  assert.equal(channelHint('Quercus alba bark.jpg'), 'bark');
  assert.equal(channelHint('BARK'), 'bark');
  assert.equal(channelHint('Staminate catkins in April'), 'flower');
  assert.equal(channelHint('Young leaves and buds'), 'leaf');
});

test('channelHint returns the first keyword in HINT_KEYWORDS order', () => {
  // 'bark' comes before 'leaves', so the bark hit wins whatever the word order in the text.
  assert.equal(channelHint('leaves and bark'), 'bark');
  assert.equal(channelHint('bark and leaves'), 'bark');
});

test('channelHint returns null for text with no keyword', () => {
  assert.equal(channelHint('Quercus alba habit.jpg'), null);
  assert.equal(channelHint('whole tree in a field'), null);
  assert.equal(channelHint(''), null);
});

test('makeCandidate fills the id from the origin and sets the defaults', () => {
  const origin = 'https://commons.wikimedia.org/wiki/File:Quercus_alba_bark.jpg';
  const candidate = makeCandidate({
    target: 'QUAL',
    source: 'commons',
    origin,
    file_url: 'https://upload.wikimedia.org/quercus_alba_bark.jpg',
  });
  assert.deepEqual(candidate, {
    id: candidateId(origin),
    target: 'QUAL',
    source: 'commons',
    origin,
    file_url: 'https://upload.wikimedia.org/quercus_alba_bark.jpg',
    author: '',
    license: '',
    license_url: null,
    source_species: null,
    channel_hint: null,
    tags_hint: [],
    local: null,
    file_hash: null,
    fetched_at: '',
    fetch_error: null,
  });
});

test('makeCandidate keeps every field the caller passed', () => {
  const origin = 'https://www.inaturalist.org/observations/12345';
  const candidate = makeCandidate({
    target: 'QUGA',
    source: 'inat',
    origin,
    file_url: 'https://static.inaturalist.org/photos/1/original.jpg',
    author: '(c) Lyrae, some rights reserved (CC BY)',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    source_species: 'Quercus gambelii',
    channel_hint: 'fruit',
    tags_hint: ['fruiting'],
    local: 'pipeline/cache/inat/abc.jpg',
    file_hash: 'deadbeef',
    fetched_at: '2026-09-22T15:04:00Z',
    fetch_error: 'timeout',
  });
  assert.equal(candidate.id, candidateId(origin));
  assert.equal(candidate.author, '(c) Lyrae, some rights reserved (CC BY)');
  assert.equal(candidate.license, 'CC BY 4.0');
  assert.equal(candidate.license_url, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(candidate.source_species, 'Quercus gambelii');
  assert.equal(candidate.channel_hint, 'fruit');
  assert.deepEqual(candidate.tags_hint, ['fruiting']);
  assert.equal(candidate.local, 'pipeline/cache/inat/abc.jpg');
  assert.equal(candidate.file_hash, 'deadbeef');
  assert.equal(candidate.fetched_at, '2026-09-22T15:04:00Z');
  assert.equal(candidate.fetch_error, 'timeout');
});

test('makeCandidate keeps an id the caller passed', () => {
  const candidate = makeCandidate({
    id: 'kept',
    target: 'QUAL',
    source: 'manual',
    origin: 'https://www.fs.usda.gov/quercus-alba',
    file_url: 'https://www.fs.usda.gov/quercus-alba.jpg',
  });
  assert.equal(candidate.id, 'kept');
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `node --test pipeline/tests/candidates_core.test.ts`

Expected: FAIL, 1 test, 1 fail. Node prints:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\candidates.ts' imported from <repo>\pipeline\tests\candidates_core.test.ts
```

- [ ] **Step 7: Create `pipeline/lib/candidates.ts`**

```ts
import crypto from 'node:crypto';

export const CHANNELS: string[] = ['leaf', 'bark', 'fruit', 'flower', 'twig'];

/** The human labels, for the report. `licenseAllowed` holds the machine rule. */
export const LICENSE_ALLOWLIST: string[] = [
  'public domain',
  'US government work',
  'CC0, any version',
  'CC BY, any version',
  'CC BY-SA, any version',
];

// Insertion order is the match order and the first hit wins. A longer keyword goes
// before any shorter keyword inside it, so the shorter one never steals the match.
export const HINT_KEYWORDS: Record<string, string> = {
  bark: 'bark',
  trunk: 'bark',
  leaf: 'leaf',
  leaves: 'leaf',
  foliage: 'leaf',
  acorn: 'fruit',
  fruit: 'fruit',
  samara: 'fruit',
  cone: 'fruit',
  flower: 'flower',
  catkin: 'flower',
  bud: 'twig',
  twig: 'twig',
};

const ALLOWED_PHRASES: string[] = [
  'public domain',
  'cc0',
  'us government work',
  'cc by',
  'cc by sa',
];

export interface Candidate {
  id: string;
  target: string;
  source: string;
  origin: string;
  file_url: string;
  author: string;
  license: string;
  license_url: string | null;
  source_species: string | null;
  channel_hint: string | null;
  tags_hint: string[];
  local: string | null;
  file_hash: string | null;
  fetched_at: string;
  fetch_error: string | null;
}

/** The sha1 hex of the origin url. */
export function candidateId(origin: string): string {
  return crypto.createHash('sha1').update(origin).digest('hex');
}

/**
 * Admits public domain, CC0, US government work, CC BY, and CC BY-SA.
 * Any NC or ND word rejects the text.
 */
export function licenseAllowed(text: string): boolean {
  const words = licenseWords(text);
  if (words.length === 0) return false;
  if (words.includes('nc') || words.includes('nd')) return false;
  return ALLOWED_PHRASES.some((phrase) => hasPhrase(words, phrase.split(' ')));
}

/** The channel of the first HINT_KEYWORDS keyword the text carries. */
export function channelHint(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [keyword, channel] of Object.entries(HINT_KEYWORDS)) {
    if (lower.includes(keyword)) return channel;
  }
  return null;
}

/** Fills the id from the origin and every default the caller left out. */
export function makeCandidate(
  fields: Partial<Candidate> & {
    target: string;
    source: string;
    origin: string;
    file_url: string;
  },
): Candidate {
  return {
    id: fields.id ?? candidateId(fields.origin),
    target: fields.target,
    source: fields.source,
    origin: fields.origin,
    file_url: fields.file_url,
    author: fields.author ?? '',
    license: fields.license ?? '',
    license_url: fields.license_url ?? null,
    source_species: fields.source_species ?? null,
    channel_hint: fields.channel_hint ?? null,
    tags_hint: fields.tags_hint ?? [],
    local: fields.local ?? null,
    file_hash: fields.file_hash ?? null,
    // The caller passes the run's timestamp, so this function stays pure.
    fetched_at: fields.fetched_at ?? '',
    fetch_error: fields.fetch_error ?? null,
  };
}

function licenseWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/united states/g, 'us')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word !== '');
}

function hasPhrase(words: string[], phrase: string[]): boolean {
  for (let i = 0; i + phrase.length <= words.length; i += 1) {
    if (phrase.every((word, j) => words[i + j] === word)) return true;
  }
  return false;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test pipeline/tests/candidates_core.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 9: Run both test files together**

Run: `node --test pipeline/tests/jsonl.test.ts pipeline/tests/candidates_core.test.ts`
Expected: PASS, 20 tests

- [ ] **Step 10: Commit**

```bash
git add pipeline/lib/jsonl.ts pipeline/lib/candidates.ts pipeline/tests/jsonl.test.ts pipeline/tests/candidates_core.test.ts && git commit -m "feat: add the JSONL helpers, the candidate row, and the license allowlist" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: USDA PLANTS

**Files:**
- Create: `pipeline/tests/fixtures/plants_profile_quga.json`
- Create: `pipeline/tests/fixtures/plants_profile_purple_sage.json`
- Create: `pipeline/tests/fixtures/plants_subordinate_quga.json`
- Create: `pipeline/tests/fixtures/plants_distribution_quga.csv`
- Create: `pipeline/tests/fixtures/plants_images_quga.json`
- Create: `pipeline/tests/fixtures/plantlst_sample.txt`
- Create: `pipeline/lib/plants.ts`
- Test: `pipeline/tests/plants.test.ts`

**Interfaces:**
- Consumes:
  - `makeCandidate(fields: Partial<Candidate> & { target: string; source: string; origin: string; file_url: string }): Candidate` from `./candidates.ts` (Task 2)
  - `type Candidate` from `./candidates.ts` (Task 2)
  - `type Http` from `./http.ts` (Task 1). The import is a type import, so Node erases it and this task does not need `http.ts` on disk.
- Produces:
  - `PLANTS_API: string`
  - `PLANTS_FILES: string`
  - `PLANTS_PROFILE: string`
  - `CHECKLIST_URL: string`
  - `DISTRIBUTION_URL: string`
  - `PART_CODE_CHANNELS: Record<string, string>`
  - `interface PlantsProfile { symbol: string; plants_id: number; scientific: string; author: string; common: string | null; family: string | null; genus: string; rank: string; growth_habits: string[]; native_status: string | null }`
  - `interface ChecklistRow { symbol: string; synonym_symbol: string; scientific: string; common: string; family: string }`
  - `interface PlantsImage { path: string; copyright: boolean; photographer: string; part_code: string | null }`
  - `stripItalics(html: string): string`
  - `splitScientific(nameWithAuthor: string): { scientific: string; author: string }`
  - `parseProfile(json: unknown): PlantsProfile`
  - `isTree(profile: PlantsProfile): boolean`
  - `isHybrid(scientific: string): boolean`
  - `parseSubordinateTaxa(json: unknown): { key: string; name: string }[]`
  - `parseDistribution(csv: string): string[]`
  - `parseChecklist(body: string): ChecklistRow[]`
  - `acceptedSymbols(rows: ChecklistRow[], genera: string[]): string[]`
  - `synonymNames(rows: ChecklistRow[], symbol: string): string[]`
  - `partCodeOf(path: string): string | null`
  - `parseImages(json: unknown): PlantsImage[]`
  - `plantsCandidates(images: PlantsImage[], target: string, scientific: string, plantsId: number, now: string): Candidate[]`
  - `profileUrl(symbol: string): string`
  - `subordinateTaxaUrl(plantsId: number, offset?: number): string`
  - `imagesUrl(plantsId: number): string`
  - `fetchProfile(http: Http, symbol: string): Promise<PlantsProfile | null>`
  - `fetchSubordinateTaxa(http: Http, plantsId: number): Promise<{ key: string; name: string }[]>`
  - `fetchDistribution(http: Http, plantsId: number): Promise<string[]>`
  - `fetchImages(http: Http, plantsId: number): Promise<PlantsImage[]>`
  - `fetchChecklist(http: Http): Promise<ChecklistRow[]>`

This module reads the four PLANTS endpoints of spec section 3 and the checklist file. It
holds parsers and URL builders only. The HTTP client arrives as a parameter, so no test
touches the network.

Every fixture below is built by hand. It holds the fields section 3 documents, trimmed to
the rows the test reads. Task 19 replaces each one with a recorded response after the
first live fetch.

Three points the spec leaves open, decided here:

1. The part code table. A PLANTS image file name ends in a three letter code, as in
   `quga_001_lvp.jpg`. The table covers leaf, bark, fruit, flower, and twig codes. The
   habit code `hbp` is absent, so it gives a null hint. Task 19 checks the table against a
   real `PlantImages` response and widens it.
2. `ChecklistRow.scientific` holds the name with the author removed, through
   `splitScientific`. Task 9 matches photo captions against these names, and an author
   string would break the match.
3. `plantsCandidates` builds the origin from the species profile page, as section 6 states,
   plus a `#image=` fragment that holds the url-encoded image path. PLANTS has no page per
   image, so the profile page is the attribution page a person opens. A fragment never
   reaches the server, so the link still opens that page. The fragment makes the origin
   unique per image, and the candidate id is the sha1 of the origin, so each image of a
   species gets its own id. Without it Task 8 would drop every image of a species after
   the first as a duplicate origin.

- [ ] **Step 1: Create `pipeline/tests/fixtures/plants_profile_quga.json`**

The profile response of `GET /api/PlantProfile?symbol=QUGA`. `AncestorRanks` carries the
family. `ScientificName` carries the `<i>` tags and the author.

```json
{
  "Id": 25297,
  "Symbol": "QUGA",
  "ScientificName": "<i>Quercus</i> <i>gambelii</i> Nutt.",
  "CommonName": "Gambel oak",
  "Rank": "Species",
  "GrowthHabits": ["Tree", "Shrub"],
  "NativeStatuses": [
    { "Region": "L48", "NativeStatus": "N" },
    { "Region": "CAN", "NativeStatus": "I" }
  ],
  "AncestorRanks": [
    { "Rank": "Kingdom", "ScientificName": "Plantae" },
    { "Rank": "Order", "ScientificName": "Fagales" },
    { "Rank": "Family", "ScientificName": "Fagaceae" },
    { "Rank": "Genus", "ScientificName": "<i>Quercus</i>" }
  ]
}
```

- [ ] **Step 2: Create `pipeline/tests/fixtures/plants_profile_purple_sage.json`**

The same shape for a shrub. The growth habit gate drops it.

```json
{
  "Id": 30247,
  "Symbol": "SADO4",
  "ScientificName": "<i>Salvia</i> <i>dorrii</i> (Kellogg) Abrams",
  "CommonName": "purple sage",
  "Rank": "Species",
  "GrowthHabits": ["Shrub", "Subshrub"],
  "NativeStatuses": [{ "Region": "L48", "NativeStatus": "N" }],
  "AncestorRanks": [
    { "Rank": "Kingdom", "ScientificName": "Plantae" },
    { "Rank": "Order", "ScientificName": "Lamiales" },
    { "Rank": "Family", "ScientificName": "Lamiaceae" },
    { "Rank": "Genus", "ScientificName": "<i>Salvia</i>" }
  ]
}
```

- [ ] **Step 3: Create `pipeline/tests/fixtures/plants_subordinate_quga.json`**

The response of `GET /api/PlantSubordinateTaxa/25297?offset=0`.

```json
{
  "TotalResults": 2,
  "PlantResults": [
    {
      "Id": 25298,
      "Symbol": "QUGAG",
      "ScientificName": "<i>Quercus</i> <i>gambelii</i> Nutt. var. <i>gambelii</i>"
    },
    {
      "Id": 25299,
      "Symbol": "QUGAB",
      "ScientificName": "<i>Quercus</i> <i>gambelii</i> Nutt. var. <i>bakeri</i> (Kellogg) Cory"
    }
  ]
}
```

- [ ] **Step 4: Create `pipeline/tests/fixtures/plants_distribution_quga.csv`**

The CSV the distribution POST returns. Colorado repeats across two counties. The last row
is not a US row and the parser drops it.

```csv
Symbol,Country,State,State FIP,County,County FIP
QUGA,US,CO,08,Boulder,013
QUGA,US,CO,08,Larimer,069
QUGA,US,NM,35,Santa Fe,049
QUGA,US,AZ,04,Coconino,005
QUGA,US,UT,49,Utah,049
QUGA,CA,AB,,,
```

- [ ] **Step 5: Create `pipeline/tests/fixtures/plants_images_quga.json`**

The response of `GET /api/PlantImages?plantId=25297`. Each record holds four size paths,
the `Copyright` flag, and the photographer in `CommonName`. The last record is copyright
and the parser drops it from the candidates. The photographer names are made up.

```json
{
  "PlantImages": [
    {
      "Id": 501,
      "ThumbnailPath": "/ImageLibrary/thumbnail/quga_001_thp.jpg",
      "SmallImagePath": "/ImageLibrary/small/quga_001_svp.jpg",
      "MediumImagePath": "/ImageLibrary/medium/quga_001_mvp.jpg",
      "OriginalImagePath": "/ImageLibrary/original/quga_001_lvp.jpg",
      "Copyright": false,
      "CommonName": "R. Nichols"
    },
    {
      "Id": 502,
      "ThumbnailPath": "/ImageLibrary/thumbnail/quga_002_thp.jpg",
      "SmallImagePath": "/ImageLibrary/small/quga_002_svp.jpg",
      "MediumImagePath": "/ImageLibrary/medium/quga_002_mvp.jpg",
      "OriginalImagePath": "/ImageLibrary/original/quga_002_bkp.jpg",
      "Copyright": false,
      "CommonName": "T. Alvarez"
    },
    {
      "Id": 503,
      "ThumbnailPath": "/ImageLibrary/thumbnail/quga_003_thp.jpg",
      "SmallImagePath": "/ImageLibrary/small/quga_003_svp.jpg",
      "MediumImagePath": "/ImageLibrary/medium/quga_003_mvp.jpg",
      "OriginalImagePath": "/ImageLibrary/original/quga_003_hbp.jpg",
      "Copyright": false,
      "CommonName": "J. Park"
    },
    {
      "Id": 504,
      "ThumbnailPath": "/ImageLibrary/thumbnail/quga_004_thp.jpg",
      "SmallImagePath": "/ImageLibrary/small/quga_004_svp.jpg",
      "MediumImagePath": "/ImageLibrary/medium/quga_004_mvp.jpg",
      "OriginalImagePath": "/ImageLibrary/original/quga_004_frp.jpg",
      "Copyright": true,
      "CommonName": "M. Osei"
    }
  ]
}
```

- [ ] **Step 6: Create `pipeline/tests/fixtures/plantlst_sample.txt`**

Six lines of `plantlst.txt`: the header, an accepted `QUGA`, a synonym that points at
`QUGA`, an accepted `ACPL`, a hybrid, and a row from a genus no test asks for.

```text
"Symbol","Synonym Symbol","Scientific Name with Author","Common Name","Family"
"QUGA","","Quercus gambelii Nutt.","Gambel oak","Fagaceae"
"QUUT","QUGA","Quercus utahensis (A. DC.) Rydb.","Gambel oak","Fagaceae"
"ACPL","","Acer platanoides L.","Norway maple","Sapindaceae"
"QUUN","","Quercus ×undulata Torr.","wavyleaf oak","Fagaceae"
"PIPO","","Pinus ponderosa Douglas ex C. Lawson","ponderosa pine","Pinaceae"
```

- [ ] **Step 7: Write the failing test**

`pipeline/tests/plants.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { candidateId } from '../lib/candidates.ts';
import type { Http, TextResult, BytesResult } from '../lib/http.ts';
import {
  PLANTS_API,
  PLANTS_FILES,
  PLANTS_PROFILE,
  CHECKLIST_URL,
  DISTRIBUTION_URL,
  PART_CODE_CHANNELS,
  stripItalics,
  splitScientific,
  parseProfile,
  isTree,
  isHybrid,
  parseSubordinateTaxa,
  parseDistribution,
  parseChecklist,
  acceptedSymbols,
  synonymNames,
  partCodeOf,
  parseImages,
  plantsCandidates,
  profileUrl,
  subordinateTaxaUrl,
  imagesUrl,
  fetchProfile,
  fetchDistribution,
  fetchImages,
} from '../lib/plants.ts';

function fixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function fixtureJson(name: string): unknown {
  return JSON.parse(fixture(name));
}

const QUGA_PROFILE = 'https://plants.usda.gov/plant-profile/QUGA';

test('the profile parser strips the tags and splits the author off', () => {
  assert.equal(
    stripItalics('<i>Quercus</i> <i>gambelii</i> Nutt.'),
    'Quercus gambelii Nutt.',
  );
  assert.deepEqual(splitScientific('Quercus gambelii Nutt.'), {
    scientific: 'Quercus gambelii',
    author: 'Nutt.',
  });
  assert.deepEqual(parseProfile(fixtureJson('plants_profile_quga.json')), {
    symbol: 'QUGA',
    plants_id: 25297,
    scientific: 'Quercus gambelii',
    author: 'Nutt.',
    common: 'Gambel oak',
    family: 'Fagaceae',
    genus: 'Quercus',
    rank: 'Species',
    growth_habits: ['Tree', 'Shrub'],
    native_status: 'native',
  });
});

test('a shrub-only habit is not a tree', () => {
  const sage = parseProfile(fixtureJson('plants_profile_purple_sage.json'));
  assert.deepEqual(sage.growth_habits, ['Shrub', 'Subshrub']);
  assert.equal(isTree(sage), false);
  assert.equal(isTree(parseProfile(fixtureJson('plants_profile_quga.json'))), true);
});

test('a name with a multiplication sign is a hybrid', () => {
  assert.equal(isHybrid('Quercus ×undulata'), true);
  assert.equal(isHybrid('Quercus x undulata'), true);
  assert.equal(isHybrid('Quercus gambelii'), false);
  assert.equal(isHybrid('Quercus texana'), false);
});

test('the distribution CSV yields unique, sorted US states and drops the other country', () => {
  assert.deepEqual(parseDistribution(fixture('plants_distribution_quga.csv')), [
    'AZ',
    'CO',
    'NM',
    'UT',
  ]);
});

test('region L48 maps N to native and I to introduced, and no L48 row gives null', () => {
  const raw = fixtureJson('plants_profile_quga.json') as Record<string, unknown>;
  assert.equal(parseProfile(raw).native_status, 'native');
  const introduced = {
    ...raw,
    NativeStatuses: [{ Region: 'L48', NativeStatus: 'I' }],
  };
  assert.equal(parseProfile(introduced).native_status, 'introduced');
  const noL48 = {
    ...raw,
    NativeStatuses: [{ Region: 'PR', NativeStatus: 'N' }],
  };
  assert.equal(parseProfile(noL48).native_status, null);
  const waif = {
    ...raw,
    NativeStatuses: [{ Region: 'L48', NativeStatus: 'W' }],
  };
  assert.equal(parseProfile(waif).native_status, null);
});

test('parseSubordinateTaxa gives key and name rows with the italics stripped', () => {
  assert.deepEqual(parseSubordinateTaxa(fixtureJson('plants_subordinate_quga.json')), [
    { key: 'QUGAG', name: 'Quercus gambelii Nutt. var. gambelii' },
    { key: 'QUGAB', name: 'Quercus gambelii Nutt. var. bakeri (Kellogg) Cory' },
  ]);
});

test('the checklist parses, accepted symbols filter by genus, and synonyms resolve', () => {
  const rows = parseChecklist(fixture('plantlst_sample.txt'));
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], {
    symbol: 'QUGA',
    synonym_symbol: '',
    scientific: 'Quercus gambelii',
    common: 'Gambel oak',
    family: 'Fagaceae',
  });
  assert.deepEqual(acceptedSymbols(rows, ['Quercus', 'Acer']), ['ACPL', 'QUGA', 'QUUN']);
  assert.deepEqual(synonymNames(rows, 'QUGA'), ['Quercus utahensis']);
  assert.deepEqual(synonymNames(rows, 'ACPL'), []);
});

test('partCodeOf reads the code from a path and gives null when there is none', () => {
  assert.equal(partCodeOf('/ImageLibrary/original/quga_001_lvp.jpg'), 'lvp');
  assert.equal(partCodeOf('/ImageLibrary/original/qual_001_LHP.jpg'), 'lhp');
  assert.equal(partCodeOf('/ImageLibrary/original/quga_003_hbp.tif'), 'hbp');
  assert.equal(partCodeOf('/ImageLibrary/original/quga_001.jpg'), null);
  assert.equal(partCodeOf('/ImageLibrary/original/quga.jpg'), null);
  assert.equal(partCodeOf(''), null);
});

test('plantsCandidates drops the copyright row and fills the PLANTS fields', () => {
  const images = parseImages(fixtureJson('plants_images_quga.json'));
  assert.equal(images.length, 4);
  const rows = plantsCandidates(
    images,
    'QUGA',
    'Quercus gambelii',
    25297,
    '2026-09-22T15:04:00Z',
  );
  assert.equal(rows.length, 3);
  const firstOrigin = `${QUGA_PROFILE}#image=${encodeURIComponent('/ImageLibrary/original/quga_001_lvp.jpg')}`;
  assert.deepEqual(rows[0], {
    id: candidateId(firstOrigin),
    target: 'QUGA',
    source: 'plants',
    origin: firstOrigin,
    file_url: 'https://plants.sc.egov.usda.gov/ImageLibrary/original/quga_001_lvp.jpg',
    author: 'R. Nichols',
    license: 'US government work',
    license_url: null,
    source_species: 'Quercus gambelii',
    channel_hint: 'leaf',
    tags_hint: [],
    local: null,
    file_hash: null,
    fetched_at: '2026-09-22T15:04:00Z',
    fetch_error: null,
  });
  assert.deepEqual(
    rows.map((row) => row.channel_hint),
    ['leaf', 'bark', null],
  );
  assert.equal(
    rows.some((row) => row.file_url.includes('quga_004_frp')),
    false,
  );
  for (const row of rows) {
    assert.ok(row.origin.startsWith(`${QUGA_PROFILE}#image=`));
  }
  assert.deepEqual(
    rows.map((row) => row.origin.split('#image=')[1]),
    [
      encodeURIComponent('/ImageLibrary/original/quga_001_lvp.jpg'),
      encodeURIComponent('/ImageLibrary/original/quga_002_bkp.jpg'),
      encodeURIComponent('/ImageLibrary/original/quga_003_hbp.jpg'),
    ],
  );
  assert.equal(new Set(rows.map((row) => row.origin)).size, 3);
  assert.equal(new Set(rows.map((row) => row.id)).size, 3);
});

test('splitScientific keeps a variety name whole', () => {
  assert.deepEqual(splitScientific('Quercus gambelii var. gambelii Nutt.'), {
    scientific: 'Quercus gambelii var. gambelii',
    author: 'Nutt.',
  });
  assert.deepEqual(splitScientific('Quercus gambelii subsp. gambelii'), {
    scientific: 'Quercus gambelii subsp. gambelii',
    author: '',
  });
  assert.deepEqual(splitScientific('Quercus gambelii'), {
    scientific: 'Quercus gambelii',
    author: '',
  });
});

test('the constants hold the PLANTS hosts and the part code table', () => {
  assert.equal(PLANTS_API, 'https://plantsservices.sc.egov.usda.gov/api');
  assert.equal(PLANTS_FILES, 'https://plants.sc.egov.usda.gov');
  assert.equal(PLANTS_PROFILE, 'https://plants.usda.gov/plant-profile/');
  assert.equal(
    CHECKLIST_URL,
    'https://plants.sc.egov.usda.gov/DocumentLibrary/Txt/plantlst.txt',
  );
  assert.equal(PART_CODE_CHANNELS.lvp, 'leaf');
  assert.equal(PART_CODE_CHANNELS.bkp, 'bark');
  assert.equal(PART_CODE_CHANNELS.frp, 'fruit');
  assert.equal(PART_CODE_CHANNELS.flp, 'flower');
  assert.equal(PART_CODE_CHANNELS.twp, 'twig');
  assert.equal(PART_CODE_CHANNELS.hbp, undefined);
});

test('the fetch helpers read the fake HTTP client and parse the body', async () => {
  const bodies: Record<string, string> = {
    [profileUrl('QUGA')]: fixture('plants_profile_quga.json'),
    [imagesUrl(25297)]: fixture('plants_images_quga.json'),
    [DISTRIBUTION_URL]: fixture('plants_distribution_quga.csv'),
  };
  const asked: string[] = [];
  const http: Http = {
    failures: [],
    async getText(url: string): Promise<TextResult> {
      asked.push(url);
      const body = bodies[url];
      if (body === undefined) {
        return { ok: false, status: 404, body: '', from_cache: false, error: 'not found' };
      }
      return { ok: true, status: 200, body, from_cache: false, error: null };
    },
    async postJson(url: string): Promise<TextResult> {
      asked.push(url);
      const body = bodies[url];
      if (body === undefined) {
        return { ok: false, status: 404, body: '', from_cache: false, error: 'not found' };
      }
      return { ok: true, status: 200, body, from_cache: false, error: null };
    },
    async getBytes(): Promise<BytesResult> {
      return { ok: false, status: 0, bytes: null, from_cache: false, error: 'not used' };
    },
  };

  const profile = await fetchProfile(http, 'QUGA');
  assert.equal(profile?.plants_id, 25297);
  assert.deepEqual(await fetchDistribution(http, 25297), ['AZ', 'CO', 'NM', 'UT']);
  assert.equal((await fetchImages(http, 25297)).length, 4);
  assert.equal(await fetchProfile(http, 'NOPE'), null);
  assert.deepEqual(asked, [
    profileUrl('QUGA'),
    DISTRIBUTION_URL,
    imagesUrl(25297),
    profileUrl('NOPE'),
  ]);
  assert.equal(
    subordinateTaxaUrl(25297, 0),
    'https://plantsservices.sc.egov.usda.gov/api/PlantSubordinateTaxa/25297?offset=0',
  );
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `node --test pipeline/tests/plants.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>/pipeline/lib/plants.ts' imported from <repo>/pipeline/tests/plants.test.ts`. Node reports 1 test, 0 pass, 1 fail.

- [ ] **Step 9: Create `pipeline/lib/plants.ts`**

```ts
import { makeCandidate } from './candidates.ts';
import type { Candidate } from './candidates.ts';
import type { Http } from './http.ts';

export const PLANTS_API: string = 'https://plantsservices.sc.egov.usda.gov/api';
export const PLANTS_FILES: string = 'https://plants.sc.egov.usda.gov';
export const PLANTS_PROFILE: string = 'https://plants.usda.gov/plant-profile/';
export const CHECKLIST_URL: string = `${PLANTS_FILES}/DocumentLibrary/Txt/plantlst.txt`;
export const DISTRIBUTION_URL: string =
  `${PLANTS_API}/PlantProfile/getDownloadDistributionDocumentation`;

/**
 * A PLANTS image file name ends in a three letter part code, as in
 * `quga_001_lvp.jpg`. The codes below are the ones the file names justify.
 * A code that is absent here gives a null hint. Task 19 checks this table
 * against a real PlantImages response and widens it.
 */
export const PART_CODE_CHANNELS: Record<string, string> = {
  lvp: 'leaf',
  lvd: 'leaf',
  lhp: 'leaf',
  bkp: 'bark',
  brp: 'bark',
  frp: 'fruit',
  fvp: 'fruit',
  flp: 'flower',
  twp: 'twig',
};

const RANK_MARKERS: string[] = ['var.', 'subsp.', 'ssp.', 'f.'];

export interface PlantsProfile {
  symbol: string;
  plants_id: number;
  scientific: string;
  author: string;
  common: string | null;
  family: string | null;
  genus: string;
  rank: string;
  growth_habits: string[];
  native_status: string | null;
}

export interface ChecklistRow {
  symbol: string;
  synonym_symbol: string;
  scientific: string;
  common: string;
  family: string;
}

export interface PlantsImage {
  path: string;
  copyright: boolean;
  photographer: string;
  part_code: string | null;
}

/** Removes the `<i>` tags PLANTS wraps a name in and collapses the gaps. */
export function stripItalics(html: string): string {
  return html
    .replace(/<\/?i>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The scientific name is the first two words, or the first four when the third
 * word is a rank marker. Everything after it is the author.
 */
export function splitScientific(nameWithAuthor: string): { scientific: string; author: string } {
  const words = nameWithAuthor.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return { scientific: '', author: '' };
  const wanted = words.length > 2 && RANK_MARKERS.includes(words[2].toLowerCase()) ? 4 : 2;
  const count = Math.min(wanted, words.length);
  return {
    scientific: words.slice(0, count).join(' '),
    author: words.slice(count).join(' '),
  };
}

export function parseProfile(json: unknown): PlantsProfile {
  const row = asRecord(json);
  const split = splitScientific(stripItalics(str(row.ScientificName)));
  const common = str(row.CommonName);
  return {
    symbol: str(row.Symbol).toUpperCase(),
    plants_id: num(row.Id),
    scientific: split.scientific,
    author: split.author,
    common: common === '' ? null : common,
    family: familyOf(row.AncestorRanks),
    genus: split.scientific.split(' ')[0] ?? '',
    rank: str(row.Rank),
    growth_habits: strList(row.GrowthHabits),
    native_status: nativeStatusL48(row.NativeStatuses),
  };
}

export function isTree(profile: PlantsProfile): boolean {
  return profile.growth_habits.some((habit) => habit.trim().toLowerCase() === 'tree');
}

/** True when the name carries a multiplication sign or an `x` on its own. */
export function isHybrid(scientific: string): boolean {
  return /×/.test(scientific) || /(^|\s)x(\s|$)/.test(scientific);
}

export function parseSubordinateTaxa(json: unknown): { key: string; name: string }[] {
  return listOf(json, 'PlantResults')
    .map((raw) => {
      const row = asRecord(raw);
      return { key: str(row.Symbol), name: stripItalics(str(row.ScientificName)) };
    })
    .filter((row) => row.key !== '');
}

/** The unique US state codes in the distribution CSV, sorted. */
export function parseDistribution(csv: string): string[] {
  const states = new Set<string>();
  for (const cells of dataLines(csv)) {
    if ((cells[1] ?? '').trim().toUpperCase() !== 'US') continue;
    const state = (cells[2] ?? '').trim().toUpperCase();
    if (state !== '') states.add(state);
  }
  return [...states].sort();
}

/** One row per data line of `plantlst.txt`. The author is split off the name. */
export function parseChecklist(body: string): ChecklistRow[] {
  return dataLines(body).map((cells) => ({
    symbol: (cells[0] ?? '').trim(),
    synonym_symbol: (cells[1] ?? '').trim(),
    scientific: splitScientific((cells[2] ?? '').trim()).scientific,
    common: (cells[3] ?? '').trim(),
    family: (cells[4] ?? '').trim(),
  }));
}

/** The accepted symbols in the given genera, sorted. A synonym row is not accepted. */
export function acceptedSymbols(rows: ChecklistRow[], genera: string[]): string[] {
  const wanted = new Set(genera.map((genus) => genus.toLowerCase()));
  const symbols = rows
    .filter((row) => row.synonym_symbol === '' && row.symbol !== '')
    .filter((row) => wanted.has((row.scientific.split(' ')[0] ?? '').toLowerCase()))
    .map((row) => row.symbol);
  return [...new Set(symbols)].sort();
}

/** The names of the rows that point at this symbol. The identity check reads them. */
export function synonymNames(rows: ChecklistRow[], symbol: string): string[] {
  return rows.filter((row) => row.synonym_symbol === symbol).map((row) => row.scientific);
}

/** The three letter part code at the end of a PLANTS file name, lower cased. */
export function partCodeOf(path: string): string | null {
  const file = path.split('/').pop() ?? '';
  const base = file.replace(/\.[^.]+$/, '');
  const match = /_([A-Za-z]{3})$/.exec(base);
  return match === null ? null : match[1].toLowerCase();
}

export function parseImages(json: unknown): PlantsImage[] {
  return listOf(json, 'PlantImages')
    .map((raw) => {
      const row = asRecord(raw);
      const path = str(row.OriginalImagePath);
      return {
        path,
        copyright: row.Copyright === true,
        photographer: str(row.CommonName),
        part_code: partCodeOf(path),
      };
    })
    .filter((image) => image.path !== '');
}

/** One candidate per non-copyright image. */
export function plantsCandidates(
  images: PlantsImage[],
  target: string,
  scientific: string,
  plantsId: number,
  now: string,
): Candidate[] {
  const profile = `${PLANTS_PROFILE}${target}`;
  return images
    .filter((image) => !image.copyright)
    .map((image) =>
      makeCandidate({
        target,
        source: 'plants',
        // PLANTS has no page per image, so the profile page is the attribution page.
        // The fragment stays off the wire and gives each image its own id.
        origin: `${profile}#image=${encodeURIComponent(image.path)}`,
        file_url: `${PLANTS_FILES}${image.path}`,
        author: image.photographer,
        license: 'US government work',
        license_url: null,
        source_species: scientific,
        channel_hint: image.part_code === null ? null : PART_CODE_CHANNELS[image.part_code] ?? null,
        fetched_at: now,
      }),
    );
}

export function profileUrl(symbol: string): string {
  return `${PLANTS_API}/PlantProfile?symbol=${encodeURIComponent(symbol)}`;
}

export function subordinateTaxaUrl(plantsId: number, offset: number = 0): string {
  return `${PLANTS_API}/PlantSubordinateTaxa/${plantsId}?offset=${offset}`;
}

export function imagesUrl(plantsId: number): string {
  return `${PLANTS_API}/PlantImages?plantId=${plantsId}`;
}

export async function fetchProfile(http: Http, symbol: string): Promise<PlantsProfile | null> {
  const result = await http.getText(profileUrl(symbol));
  if (!result.ok) return null;
  return parseProfile(parseJson(result.body));
}

export async function fetchSubordinateTaxa(
  http: Http,
  plantsId: number,
): Promise<{ key: string; name: string }[]> {
  const result = await http.getText(subordinateTaxaUrl(plantsId, 0));
  if (!result.ok) return [];
  return parseSubordinateTaxa(parseJson(result.body));
}

export async function fetchDistribution(http: Http, plantsId: number): Promise<string[]> {
  const result = await http.postJson(DISTRIBUTION_URL, { MasterId: plantsId });
  if (!result.ok) return [];
  return parseDistribution(result.body);
}

export async function fetchImages(http: Http, plantsId: number): Promise<PlantsImage[]> {
  const result = await http.getText(imagesUrl(plantsId));
  if (!result.ok) return [];
  return parseImages(parseJson(result.body));
}

export async function fetchChecklist(http: Http): Promise<ChecklistRow[]> {
  const result = await http.getText(CHECKLIST_URL);
  if (!result.ok) return [];
  return parseChecklist(result.body);
}

function nativeStatusL48(value: unknown): string | null {
  for (const raw of asList(value)) {
    const row = asRecord(raw);
    if (str(row.Region).toUpperCase() !== 'L48') continue;
    const status = str(row.NativeStatus).toUpperCase();
    if (status === 'N') return 'native';
    if (status === 'I') return 'introduced';
    return null;
  }
  return null;
}

function familyOf(value: unknown): string | null {
  for (const raw of asList(value)) {
    const row = asRecord(raw);
    if (str(row.Rank).toLowerCase() !== 'family') continue;
    const name = stripItalics(str(row.ScientificName));
    return name === '' ? null : name;
  }
  return null;
}

/** The data lines of a comma separated file, with the header line dropped. */
function dataLines(body: string): string[][] {
  const lines = body.split(/\r?\n/).filter((line) => line.trim() !== '');
  return lines.slice(1).map(splitCsvLine);
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = false;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The array itself, or the array the named field holds. */
function listOf(json: unknown, field: string): unknown[] {
  if (Array.isArray(json)) return json;
  return asList(asRecord(json)[field]);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strList(value: unknown): string[] {
  return asList(value)
    .map((item) => str(item))
    .filter((item) => item !== '');
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `node --test pipeline/tests/plants.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 11: Commit**

```bash
git add pipeline/lib/plants.ts pipeline/tests/plants.test.ts pipeline/tests/fixtures/plants_profile_quga.json pipeline/tests/fixtures/plants_profile_purple_sage.json pipeline/tests/fixtures/plants_subordinate_quga.json pipeline/tests/fixtures/plants_distribution_quga.csv pipeline/tests/fixtures/plants_images_quga.json pipeline/tests/fixtures/plantlst_sample.txt && git commit -m "feat: add the USDA PLANTS parsers" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: The oak section table from Flora of North America

**Files:**
- Create: `pipeline/lib/fna.ts`
- Create: `pipeline/data/quercus_sections.json`
- Test: `pipeline/tests/fna.test.ts`
- Fixtures: `pipeline/tests/fixtures/fna_lobatae.html`, `pipeline/tests/fixtures/fna_quercus.html`, `pipeline/tests/fixtures/fna_protobalanus.html`

**Interfaces:**
- Consumes: nothing. This module imports no other pipeline module.
- Produces:
  - `interface SectionPage { section: string; taxon_id: string; url: string }`
  - `const SECTION_PAGES: SectionPage[]`
  - `function parseSectionPage(html: string): string[]`
  - `function buildSectionTable(pages: { section: string; html: string }[]): Record<string, string>`
  - `function sectionFor(table: Record<string, string>, scientific: string): string | null`
  - `function loadSectionTable(path: string): Record<string, string>`

PLANTS does not carry the oak section. Flora of North America does, on three
server-rendered browse pages at `www.efloras.org`. The site's certificate is
self-signed, so every url uses `http://`. Each page lists one section: `start_taxon_id`
302020 is Lobatae, the red oaks; 302027 is Quercus, the white oaks; 302029 is
Protobalanus, the golden-cup oaks. The spec names the three ids and the three sections
in that order but does not pair them. Task 19 confirms the pairing when it runs
`cli data sections` against the live pages, because a wrong pairing mislabels every oak.

A browse page lists each taxon as an anchor. The href carries
`flora_id=1&taxon_id=<n>`. The anchor text holds the scientific name in an `<i>`
element, and the author follows outside it. A `start_taxon_id` link is a browse link,
not a taxon, so the parser tests the `taxon_id` parameter and not the substring.

> Each fixture holds the page structure section 3 documents, trimmed to the rows the
> test reads: a little chrome, one table of links, and 4 to 6 real oak names.
> Task 19 replaces them with recorded pages after the first live fetch.

- [ ] **Step 1: Write the Lobatae fixture**

`pipeline/tests/fixtures/fna_lobatae.html`:

```html
<html>
<head><title>Quercus sect. Lobatae in Flora of North America</title></head>
<body>
<div id="header">
  <a href="http://www.efloras.org/index.aspx">Home</a>
  <a href="http://www.efloras.org/flora_page.aspx?flora_id=1">Flora of North America</a>
</div>
<h1>Quercus Linnaeus sect. Lobatae Loudon</h1>
<table id="ucFloraTaxonList_dgTaxonList">
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501234"><i>Quercus rubra</i></a> Linnaeus</td>
  </tr>
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501235"><i>Quercus velutina</i></a> Lamarck</td>
  </tr>
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501236"><i>Quercus palustris</i></a> Muenchhausen</td>
  </tr>
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501237"><i>Quercus coccinea</i></a> Muenchhausen</td>
  </tr>
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501238"><i>Quercus &#215; runcinata</i></a> (A.de Candolle) Engelmann</td>
  </tr>
  <tr>
    <td><a href="browse.aspx?flora_id=1&amp;start_taxon_id=302020&amp;page=2">Next page</a></td>
  </tr>
</table>
<div id="footer">
  <a href="http://www.efloras.org/about.aspx">About eFloras</a>
</div>
</body>
</html>
```

- [ ] **Step 2: Write the Quercus fixture**

The first row is the genus alone. The parser drops a one-word name.

`pipeline/tests/fixtures/fna_quercus.html`:

```html
<html>
<head><title>Quercus sect. Quercus in Flora of North America</title></head>
<body>
<div id="header">
  <a href="http://www.efloras.org/index.aspx">Home</a>
  <a href="http://www.efloras.org/flora_page.aspx?flora_id=1">Flora of North America</a>
</div>
<h1>Quercus Linnaeus sect. Quercus</h1>
<table id="ucFloraTaxonList_dgTaxonList">
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501301"><i>Quercus</i></a> Linnaeus</td>
  </tr>
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501302"><i>Quercus alba</i></a> Linnaeus</td>
  </tr>
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501303"><i>Quercus gambelii</i></a> Nuttall</td>
  </tr>
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501304"><i>Quercus macrocarpa</i></a> Michaux</td>
  </tr>
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501305"><i>Quercus bicolor</i></a> Willdenow</td>
  </tr>
  <tr>
    <td><a href="browse.aspx?flora_id=1&amp;start_taxon_id=302027&amp;page=2">Next page</a></td>
  </tr>
</table>
<div id="footer">
  <a href="http://www.efloras.org/about.aspx">About eFloras</a>
</div>
</body>
</html>
```

- [ ] **Step 3: Write the Protobalanus fixture**

`pipeline/tests/fixtures/fna_protobalanus.html`:

```html
<html>
<head><title>Quercus sect. Protobalanus in Flora of North America</title></head>
<body>
<div id="header">
  <a href="http://www.efloras.org/index.aspx">Home</a>
  <a href="http://www.efloras.org/flora_page.aspx?flora_id=1">Flora of North America</a>
</div>
<h1>Quercus Linnaeus sect. Protobalanus (Trelease) O. Schwarz</h1>
<table id="ucFloraTaxonList_dgTaxonList">
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501401"><i>Quercus chrysolepis</i></a> Liebmann</td>
  </tr>
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501402"><i>Quercus palmeri</i></a> Engelmann</td>
  </tr>
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501403"><i>Quercus vacciniifolia</i></a> Kellogg</td>
  </tr>
  <tr>
    <td><a href="help.aspx?flora_id=1">How to use this key</a></td>
  </tr>
</table>
<div id="footer">
  <a href="http://www.efloras.org/about.aspx">About eFloras</a>
</div>
</body>
</html>
```

- [ ] **Step 4: Write the committed table**

`cli data sections` fetches the three pages and fills the full 90 rows. Task 19 runs it
and commits the result. This seed holds the oaks the v0 runs name plus the oaks in the
fixtures, so the pipeline works before the first live fetch.

`pipeline/data/quercus_sections.json`:

```json
{
  "Quercus alba": "Quercus",
  "Quercus bicolor": "Quercus",
  "Quercus chrysolepis": "Protobalanus",
  "Quercus coccinea": "Lobatae",
  "Quercus gambelii": "Quercus",
  "Quercus macrocarpa": "Quercus",
  "Quercus palmeri": "Protobalanus",
  "Quercus palustris": "Lobatae",
  "Quercus rubra": "Lobatae",
  "Quercus shumardii": "Lobatae",
  "Quercus vacciniifolia": "Protobalanus",
  "Quercus velutina": "Lobatae"
}
```

- [ ] **Step 5: Write the failing test**

`pipeline/tests/fna.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SECTION_PAGES,
  parseSectionPage,
  buildSectionTable,
  sectionFor,
  loadSectionTable,
} from '../lib/fna.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures');
const dataFile = path.join(here, '..', 'data', 'quercus_sections.json');

function fixture(name: string): string {
  return fs.readFileSync(path.join(fixtures, name), 'utf8');
}

const lobatae = fixture('fna_lobatae.html');
const quercus = fixture('fna_quercus.html');
const protobalanus = fixture('fna_protobalanus.html');

test('the Lobatae page parses to its four species, in page order', () => {
  assert.deepEqual(parseSectionPage(lobatae), [
    'Quercus rubra',
    'Quercus velutina',
    'Quercus palustris',
    'Quercus coccinea',
  ]);
});

test('the Quercus page parses to its four species, in page order', () => {
  assert.deepEqual(parseSectionPage(quercus), [
    'Quercus alba',
    'Quercus gambelii',
    'Quercus macrocarpa',
    'Quercus bicolor',
  ]);
});

test('the Protobalanus page parses to its three species, in page order', () => {
  assert.deepEqual(parseSectionPage(protobalanus), [
    'Quercus chrysolepis',
    'Quercus palmeri',
    'Quercus vacciniifolia',
  ]);
});

test('a navigation anchor is not a species', () => {
  assert.match(protobalanus, /How to use this key/);
  assert.match(lobatae, /start_taxon_id=302020&amp;page=2/);
  const names = parseSectionPage(protobalanus).concat(parseSectionPage(lobatae));
  for (const name of names) {
    assert.doesNotMatch(name, /key|page|Home|eFloras/i);
  }
});

test('a genus-only name is dropped', () => {
  assert.match(quercus, /taxon_id=233501301"><i>Quercus<\/i>/);
  assert.equal(parseSectionPage(quercus).includes('Quercus'), false);
});

test('a hybrid name is dropped', () => {
  assert.match(lobatae, /runcinata/);
  const names = parseSectionPage(lobatae);
  assert.equal(names.some((name) => name.includes('runcinata')), false);
  assert.equal(names.some((name) => name.includes('×')), false);
});

test('buildSectionTable gives one section per name', () => {
  const table = buildSectionTable([
    { section: 'Lobatae', html: lobatae },
    { section: 'Quercus', html: quercus },
    { section: 'Protobalanus', html: protobalanus },
  ]);
  const total =
    parseSectionPage(lobatae).length +
    parseSectionPage(quercus).length +
    parseSectionPage(protobalanus).length;
  assert.equal(Object.keys(table).length, total);
  assert.equal(total, 11);
  assert.equal(table['Quercus rubra'], 'Lobatae');
  assert.equal(table['Quercus gambelii'], 'Quercus');
  assert.equal(table['Quercus palmeri'], 'Protobalanus');
});

test('a name on two pages throws, and the message names the species and both sections', () => {
  assert.throws(
    () =>
      buildSectionTable([
        { section: 'Lobatae', html: lobatae },
        { section: 'Protobalanus', html: lobatae },
      ]),
    (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /Quercus rubra/);
      assert.match(message, /Lobatae/);
      assert.match(message, /Protobalanus/);
      return true;
    },
  );
});

test('sectionFor finds a name, folds case and whitespace, and resolves a variety', () => {
  const table = buildSectionTable([
    { section: 'Lobatae', html: lobatae },
    { section: 'Quercus', html: quercus },
    { section: 'Protobalanus', html: protobalanus },
  ]);
  assert.equal(sectionFor(table, 'Quercus alba'), 'Quercus');
  assert.equal(sectionFor(table, '  quercus   RUBRA '), 'Lobatae');
  assert.equal(sectionFor(table, 'Quercus gambelii var. gambelii'), 'Quercus');
  assert.equal(sectionFor(table, 'Acer rubrum'), null);
});

test('loadSectionTable reads the committed table', () => {
  const table = loadSectionTable(dataFile);
  assert.equal(table['Quercus gambelii'], 'Quercus');
  assert.equal(table['Quercus rubra'], 'Lobatae');
});

test('loadSectionTable on a missing path names the command that builds the table', () => {
  const missing = path.join(fixtures, 'no_such_sections.json');
  assert.throws(
    () => loadSectionTable(missing),
    (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /no_such_sections\.json/);
      assert.match(message, /data sections/);
      return true;
    },
  );
});

test('SECTION_PAGES holds three http urls, each with its taxon id', () => {
  assert.equal(SECTION_PAGES.length, 3);
  const seen = new Set<string>();
  for (const page of SECTION_PAGES) {
    assert.ok(page.url.startsWith('http://'));
    assert.equal(page.url.includes(`start_taxon_id=${page.taxon_id}`), true);
    seen.add(page.section);
  }
  assert.deepEqual(
    SECTION_PAGES.map((page) => page.section),
    ['Lobatae', 'Quercus', 'Protobalanus'],
  );
  assert.deepEqual(
    SECTION_PAGES.map((page) => page.taxon_id),
    ['302020', '302027', '302029'],
  );
  assert.equal(seen.size, 3);
});

test('every value in the committed table is one of the three sections', () => {
  const table = loadSectionTable(dataFile);
  const sections = ['Lobatae', 'Quercus', 'Protobalanus'];
  const values = Object.values(table);
  assert.ok(values.length > 0);
  for (const value of values) {
    assert.ok(sections.includes(value), `unexpected section ${value}`);
  }
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `node --test pipeline/tests/fna.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\fna.ts' imported from <repo>\pipeline\tests\fna.test.ts`

- [ ] **Step 7: Create `pipeline/lib/fna.ts`**

```ts
import fs from 'node:fs';

export interface SectionPage {
  section: string;
  taxon_id: string;
  url: string;
}

const BROWSE = 'http://www.efloras.org/browse.aspx?flora_id=1&start_taxon_id=';

// The efloras certificate is self-signed, so the fetch uses http.
export const SECTION_PAGES: SectionPage[] = [
  { section: 'Lobatae', taxon_id: '302020', url: `${BROWSE}302020` },
  { section: 'Quercus', taxon_id: '302027', url: `${BROWSE}302027` },
  { section: 'Protobalanus', taxon_id: '302029', url: `${BROWSE}302029` },
];

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;
const ITALIC = /<i\b[^>]*>([\s\S]*?)<\/i>/i;
const TAG = /<[^>]*>/g;

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&times;/gi, '×')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function hrefOf(attributes: string): string | null {
  const found = HREF.exec(attributes);
  if (found === null) return null;
  return decodeEntities(found[2] ?? found[3] ?? found[4] ?? '');
}

/** A taxon link carries a taxon_id parameter. start_taxon_id is a browse link, not a taxon. */
function isTaxonLink(href: string): boolean {
  return /[?&]taxon_id=\d+/.test(href);
}

function isHybrid(name: string): boolean {
  if (name.includes('×')) return true;
  return /(^|\s)[xX](\s|$)/.test(name);
}

/** Reads the scientific names off one browse page, in page order. */
export function parseSectionPage(html: string): string[] {
  const names: string[] = [];
  ANCHOR.lastIndex = 0;
  let match: RegExpExecArray | null = ANCHOR.exec(html);
  while (match !== null) {
    const href = hrefOf(match[1]);
    const inner = match[2];
    match = ANCHOR.exec(html);
    if (href === null || !isTaxonLink(href)) continue;
    // The author sits outside the <i>, so the italic text alone is the name.
    const italic = ITALIC.exec(inner);
    const raw = italic === null ? inner : italic[1];
    const name = squash(decodeEntities(raw.replace(TAG, ' ')));
    if (name === '') continue;
    if (isHybrid(name)) continue;
    if (name.split(' ').length < 2) continue;
    names.push(name);
  }
  return names;
}

/** Maps every name on every page to its section. A name on two pages is an error. */
export function buildSectionTable(pages: { section: string; html: string }[]): Record<string, string> {
  const table: Record<string, string> = {};
  for (const page of pages) {
    for (const name of parseSectionPage(page.html)) {
      const seen = table[name];
      if (seen !== undefined && seen !== page.section) {
        throw new Error(
          `${name} is on two section pages: ${seen} and ${page.section}. Fix the FNA table before you build it.`,
        );
      }
      table[name] = page.section;
    }
  }
  return table;
}

function keyOf(scientific: string): string {
  return squash(scientific).toLowerCase();
}

/** Looks a name up. A variety falls back to its first two words. A miss gives null. */
export function sectionFor(table: Record<string, string>, scientific: string): string | null {
  const wanted = keyOf(scientific);
  if (wanted === '') return null;
  const byKey: Record<string, string> = {};
  for (const [name, section] of Object.entries(table)) byKey[keyOf(name)] = section;
  const direct = byKey[wanted];
  if (direct !== undefined) return direct;
  const words = wanted.split(' ');
  if (words.length > 2) {
    const species = byKey[`${words[0]} ${words[1]}`];
    if (species !== undefined) return species;
  }
  return null;
}

/** Reads the committed table. A missing file names the command that writes it. */
export function loadSectionTable(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `The oak section table is missing at ${filePath}. Run: node pipeline/cli.ts data sections`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`The oak section table at ${filePath} is not a JSON object.`);
  }
  const table: Record<string, string> = {};
  for (const [name, section] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof section !== 'string') {
      throw new Error(`The oak section table at ${filePath} holds a non-string section for ${name}.`);
    }
    table[name] = section;
  }
  return table;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test pipeline/tests/fna.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 9: Commit**

```bash
git add pipeline/lib/fna.ts pipeline/data/quercus_sections.json pipeline/tests/fna.test.ts pipeline/tests/fixtures/fna_lobatae.html pipeline/tests/fixtures/fna_quercus.html pipeline/tests/fixtures/fna_protobalanus.html && git commit -m "feat: add the oak section table from Flora of North America" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: iNaturalist

**Files:**
- Create: `pipeline/lib/inat.ts`
- Create: `pipeline/data/inat_terms.json`
- Test: `pipeline/tests/inat.test.ts`
- Fixture: `pipeline/tests/fixtures/inat_taxa_quga.json`
- Fixture: `pipeline/tests/fixtures/inat_taxa_empty.json`
- Fixture: `pipeline/tests/fixtures/inat_observations_quga.json`

**Interfaces:**
- Consumes, from `pipeline/lib/candidates.ts` (Task 2):
  - `function makeCandidate(fields: Partial<Candidate> & { target: string; source: string; origin: string; file_url: string }): Candidate`
  - `function licenseAllowed(text: string): boolean`
  - `interface Candidate`
- Produces:
  - `const INAT_API: string` is `'https://api.inaturalist.org/v1'`
  - `const PHENOLOGY_TERM_ID: number` is `12`
  - `const FRUITING_VALUE_ID: number` is `14`
  - `interface InatPass { name: string; term_value_id: number | null; channel_hint: string | null; tags_hint: string[] }`
  - `interface InatTaxon { id: number; name: string }`
  - `interface InatPhoto { observation_id: number; photo_id: number; url: string; license_code: string; attribution: string; taxon_name: string }`
  - `function inatPasses(floweringValueId: number): InatPass[]`
  - `function taxaUrl(scientific: string): string`
  - `function observationsUrl(taxonId: number, page: number, pass: InatPass): string`
  - `function parseTaxon(json: unknown): InatTaxon | null`
  - `function photoUrlSize(url: string, size: string): string`
  - `function licenseLabel(code: string): string`
  - `function licenseUrlFor(code: string): string | null`
  - `function parseObservations(json: unknown): InatPhoto[]`
  - `function inatCandidates(photos: InatPhoto[], target: string, pass: InatPass, now: string): Candidate[]`
  - `function loadInatTerms(path: string): { flowering_value_id: number }`

This module holds the url builders and the parsers for iNaturalist API v1. It does not
import `http.ts`. The caller fetches the url and hands the parsed JSON back, so every
function here is pure and every test runs without the network.

Section 6 runs three observation passes per species. The first pass takes no phenology
filter. The second and third filter with `term_id=12` and a value id. Fruiting is value
14. The flowering value is not in the code, because the `controlled_terms` endpoint did
not answer when the spec was written. It sits in `pipeline/data/inat_terms.json`.

The three fixtures hold the fields section 3 documents, trimmed to the rows the tests
read. Task 19 replaces each one with a recorded response after the first live fetch.

- [ ] **Step 1: Write the taxon fixture**

`pipeline/tests/fixtures/inat_taxa_quga.json`:

```json
{
  "total_results": 1,
  "page": 1,
  "per_page": 1,
  "results": [
    {
      "id": 47851,
      "name": "Quercus gambelii",
      "rank": "species"
    }
  ]
}
```

- [ ] **Step 2: Write the empty taxon fixture**

`pipeline/tests/fixtures/inat_taxa_empty.json`:

```json
{
  "total_results": 0,
  "page": 1,
  "per_page": 1,
  "results": []
}
```

- [ ] **Step 3: Write the observations fixture**

Four observations. The first carries two photos. The second carries a photo with
`license_code: null`, which `parseObservations` drops. The third carries a `cc-by-nc`
photo, which `inatCandidates` drops. The fourth carries a `cc0` photo whose url ends in
`.jpeg`, so the test can prove `photoUrlSize` keeps the extension.

`pipeline/tests/fixtures/inat_observations_quga.json`:

```json
{
  "total_results": 4,
  "page": 1,
  "per_page": 50,
  "results": [
    {
      "id": 121001,
      "quality_grade": "research",
      "taxon": { "id": 47851, "name": "Quercus gambelii", "rank": "species" },
      "photos": [
        {
          "id": 999001,
          "license_code": "cc-by",
          "attribution": "(c) Lyrae, some rights reserved (CC BY)",
          "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/999001/square.jpg"
        },
        {
          "id": 999002,
          "license_code": "cc-by",
          "attribution": "(c) Lyrae, some rights reserved (CC BY)",
          "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/999002/square.jpg"
        }
      ]
    },
    {
      "id": 121002,
      "quality_grade": "research",
      "taxon": { "id": 47851, "name": "Quercus gambelii", "rank": "species" },
      "photos": [
        {
          "id": 999003,
          "license_code": null,
          "attribution": "(c) Tam Nguyen, all rights reserved",
          "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/999003/square.jpg"
        }
      ]
    },
    {
      "id": 121003,
      "quality_grade": "research",
      "taxon": { "id": 47851, "name": "Quercus gambelii", "rank": "species" },
      "photos": [
        {
          "id": 999004,
          "license_code": "cc-by-nc",
          "attribution": "(c) Ravi Patel, some rights reserved (CC BY-NC)",
          "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/999004/square.jpg"
        }
      ]
    },
    {
      "id": 121004,
      "quality_grade": "research",
      "taxon": { "id": 1155222, "name": "Quercus gambelii var. gambelii", "rank": "variety" },
      "photos": [
        {
          "id": 999005,
          "license_code": "cc0",
          "attribution": "Marta Olsen, no rights reserved (CC0)",
          "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/999005/square.jpeg"
        }
      ]
    }
  ]
}
```

- [ ] **Step 4: Write the terms data file**

13 is the flowering value the pipeline assumes. The `controlled_terms` endpoint did not
answer when the spec was written, so nobody confirmed it. Task 19 checks it against a
live observation before the first public run.

`pipeline/data/inat_terms.json`:

```json
{
  "flowering_value_id": 13
}
```

- [ ] **Step 5: Write the failing test**

`pipeline/tests/inat.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  INAT_API,
  PHENOLOGY_TERM_ID,
  FRUITING_VALUE_ID,
  inatPasses,
  taxaUrl,
  observationsUrl,
  parseTaxon,
  photoUrlSize,
  licenseLabel,
  licenseUrlFor,
  parseObservations,
  inatCandidates,
  loadInatTerms,
} from '../lib/inat.ts';
import type { InatPhoto } from '../lib/inat.ts';

const taxaFixture = new URL('./fixtures/inat_taxa_quga.json', import.meta.url);
const taxaEmptyFixture = new URL('./fixtures/inat_taxa_empty.json', import.meta.url);
const observationsFixture = new URL('./fixtures/inat_observations_quga.json', import.meta.url);
const termsPath = fileURLToPath(new URL('../data/inat_terms.json', import.meta.url));

function readFixture(url: URL): unknown {
  return JSON.parse(fs.readFileSync(url, 'utf8'));
}

const NOW = '2026-09-22T15:04:00Z';

test('parseTaxon reads the id and the name, and gives null on no result', () => {
  const taxon = parseTaxon(readFixture(taxaFixture));
  assert.equal(taxon?.id, 47851);
  assert.equal(taxon?.name, 'Quercus gambelii');
  assert.equal(parseTaxon(readFixture(taxaEmptyFixture)), null);
});

test('photoUrlSize swaps the size and keeps the extension', () => {
  const square = 'https://inaturalist-open-data.s3.amazonaws.com/photos/999001/square.jpg';
  assert.equal(
    photoUrlSize(square, 'original'),
    'https://inaturalist-open-data.s3.amazonaws.com/photos/999001/original.jpg',
  );
  assert.equal(
    photoUrlSize(square, 'medium'),
    'https://inaturalist-open-data.s3.amazonaws.com/photos/999001/medium.jpg',
  );
  assert.equal(
    photoUrlSize(square, 'large'),
    'https://inaturalist-open-data.s3.amazonaws.com/photos/999001/large.jpg',
  );
  const jpeg = 'https://inaturalist-open-data.s3.amazonaws.com/photos/999005/square.jpeg';
  assert.equal(
    photoUrlSize(jpeg, 'original'),
    'https://inaturalist-open-data.s3.amazonaws.com/photos/999005/original.jpeg',
  );
});

test('observationsUrl carries every parameter and the fruiting pass adds the phenology filter', () => {
  assert.equal(INAT_API, 'https://api.inaturalist.org/v1');
  assert.equal(PHENOLOGY_TERM_ID, 12);
  assert.equal(FRUITING_VALUE_ID, 14);

  const fruiting = inatPasses(13)[2];
  assert.equal(
    observationsUrl(47851, 1, fruiting),
    'https://api.inaturalist.org/v1/observations' +
      '?taxon_id=47851&quality_grade=research&photo_license=cc0,cc-by,cc-by-sa' +
      '&photos=true&order_by=votes&per_page=50&page=1&term_id=12&term_value_id=14',
  );

  const url = observationsUrl(47851, 3, fruiting);
  for (const part of [
    'taxon_id=47851',
    'quality_grade=research',
    'photo_license=cc0,cc-by,cc-by-sa',
    'photos=true',
    'order_by=votes',
    'per_page=50',
    'page=3',
    'term_id=12',
    'term_value_id=14',
  ]) {
    assert.ok(url.includes(part), `missing ${part}`);
  }
});

test('the any pass adds no term_id', () => {
  const any = inatPasses(13)[0];
  const url = observationsUrl(47851, 1, any);
  assert.equal(url.includes('term_id'), false);
  assert.equal(url.includes('term_value_id'), false);
  assert.equal(
    url,
    'https://api.inaturalist.org/v1/observations' +
      '?taxon_id=47851&quality_grade=research&photo_license=cc0,cc-by,cc-by-sa' +
      '&photos=true&order_by=votes&per_page=50&page=1',
  );
});

test('inatPasses returns the three passes with their hints and tags', () => {
  assert.deepEqual(inatPasses(13), [
    { name: 'any', term_value_id: null, channel_hint: null, tags_hint: [] },
    { name: 'flowering', term_value_id: 13, channel_hint: 'flower', tags_hint: ['flowering'] },
    { name: 'fruiting', term_value_id: 14, channel_hint: 'fruit', tags_hint: ['fruiting'] },
  ]);
});

test('parseObservations flattens the photos and drops the one with no license', () => {
  const photos = parseObservations(readFixture(observationsFixture));
  assert.equal(photos.length, 4);
  assert.deepEqual(
    photos.map((photo) => photo.photo_id),
    [999001, 999002, 999004, 999005],
  );
  assert.deepEqual(
    photos.map((photo) => photo.observation_id),
    [121001, 121001, 121003, 121004],
  );
  assert.equal(photos[0].license_code, 'cc-by');
  assert.equal(photos[0].attribution, '(c) Lyrae, some rights reserved (CC BY)');
  assert.equal(photos[0].taxon_name, 'Quercus gambelii');
  assert.equal(photos[3].taxon_name, 'Quercus gambelii var. gambelii');
});

test('inatCandidates drops the CC BY-NC photo and keeps the CC BY and CC0 ones', () => {
  const photos = parseObservations(readFixture(observationsFixture));
  const rows = inatCandidates(photos, 'QUGA', inatPasses(13)[0], NOW);

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.license),
    ['CC BY 4.0', 'CC BY 4.0', 'CC0 1.0'],
  );
  assert.equal(
    rows.some((row) => row.license.includes('NC')),
    false,
  );

  // Two photos on one observation give two rows that share an id.
  assert.equal(rows[0].id, rows[1].id);
  assert.notEqual(rows[0].file_url, rows[1].file_url);
});

test('a candidate points at the observation page and the original photo size', () => {
  const photos = parseObservations(readFixture(observationsFixture));
  const fruiting = inatPasses(13)[2];
  const rows = inatCandidates(photos, 'QUGA', fruiting, NOW);
  const row = rows[2];

  assert.equal(row.source, 'inat');
  assert.equal(row.target, 'QUGA');
  assert.equal(row.origin, 'https://www.inaturalist.org/observations/121004');
  assert.equal(
    row.file_url,
    'https://inaturalist-open-data.s3.amazonaws.com/photos/999005/original.jpeg',
  );
  assert.equal(row.author, 'Marta Olsen, no rights reserved (CC0)');
  assert.equal(row.license, 'CC0 1.0');
  assert.equal(row.license_url, 'https://creativecommons.org/publicdomain/zero/1.0/');
  assert.equal(row.source_species, 'Quercus gambelii var. gambelii');
  assert.equal(row.channel_hint, 'fruit');
  assert.deepEqual(row.tags_hint, ['fruiting']);
  assert.equal(row.fetched_at, NOW);
  assert.equal(row.local, null);
  assert.equal(row.file_hash, null);
  assert.equal(row.fetch_error, null);
});

test('licenseLabel and licenseUrlFor map every code', () => {
  assert.equal(licenseLabel('cc0'), 'CC0 1.0');
  assert.equal(licenseLabel('cc-by'), 'CC BY 4.0');
  assert.equal(licenseLabel('cc-by-sa'), 'CC BY-SA 4.0');
  assert.equal(licenseLabel('cc-by-nc'), 'CC BY-NC 4.0');
  assert.equal(licenseLabel('cc-by-nc-sa'), 'CC BY-NC-SA 4.0');
  assert.equal(licenseLabel('cc-by-nd'), 'CC BY-ND 4.0');
  assert.equal(licenseLabel('cc-by-nc-nd'), 'CC BY-NC-ND 4.0');
  assert.equal(licenseLabel('gfdl'), 'All rights reserved');
  assert.equal(licenseLabel(null as unknown as string), 'All rights reserved');

  assert.equal(licenseUrlFor('cc0'), 'https://creativecommons.org/publicdomain/zero/1.0/');
  assert.equal(licenseUrlFor('cc-by'), 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(licenseUrlFor('cc-by-sa'), 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(licenseUrlFor('cc-by-nc'), 'https://creativecommons.org/licenses/by-nc/4.0/');
  assert.equal(
    licenseUrlFor('cc-by-nc-sa'),
    'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  );
  assert.equal(licenseUrlFor('cc-by-nd'), 'https://creativecommons.org/licenses/by-nd/4.0/');
  assert.equal(
    licenseUrlFor('cc-by-nc-nd'),
    'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  );
  assert.equal(licenseUrlFor('gfdl'), null);
  assert.equal(licenseUrlFor(null as unknown as string), null);
});

test('loadInatTerms reads the flowering value and reports an absent file', () => {
  assert.deepEqual(loadInatTerms(termsPath), { flowering_value_id: 13 });
  assert.throws(
    () => loadInatTerms(fileURLToPath(new URL('../data/no_such_terms.json', import.meta.url))),
    /data inat-terms/,
  );
});

test('taxaUrl url-encodes the space in a scientific name', () => {
  assert.equal(
    taxaUrl('Quercus gambelii'),
    'https://api.inaturalist.org/v1/taxa?q=Quercus%20gambelii&rank=species&per_page=1',
  );
});

test('parseObservations gives rows inatCandidates can read without a taxon', () => {
  const photos: InatPhoto[] = [
    {
      observation_id: 5,
      photo_id: 6,
      url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/6/square.jpg',
      license_code: 'cc-by-sa',
      attribution: '(c) Pat Ruiz, some rights reserved (CC BY-SA)',
      taxon_name: 'Quercus gambelii',
    },
  ];
  const rows = inatCandidates(photos, 'bark/plated', inatPasses(13)[1], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].target, 'bark/plated');
  assert.equal(rows[0].license, 'CC BY-SA 4.0');
  assert.equal(rows[0].channel_hint, 'flower');
  assert.deepEqual(rows[0].tags_hint, ['flowering']);
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `node --test pipeline/tests/inat.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\inat.ts' imported from <repo>\pipeline\tests\inat.test.ts`

- [ ] **Step 7: Create `pipeline/lib/inat.ts`**

```ts
import fs from 'node:fs';

import { makeCandidate, licenseAllowed } from './candidates.ts';
import type { Candidate } from './candidates.ts';

export const INAT_API: string = 'https://api.inaturalist.org/v1';
export const PHENOLOGY_TERM_ID: number = 12;
export const FRUITING_VALUE_ID: number = 14;

const PHOTO_LICENSES: string = 'cc0,cc-by,cc-by-sa';
const PER_PAGE: number = 50;

export interface InatPass {
  name: string;
  term_value_id: number | null;
  channel_hint: string | null;
  tags_hint: string[];
}

export interface InatTaxon {
  id: number;
  name: string;
}

export interface InatPhoto {
  observation_id: number;
  photo_id: number;
  url: string;
  license_code: string;
  attribution: string;
  taxon_name: string;
}

/** The three observation passes of section 6, in order. */
export function inatPasses(floweringValueId: number): InatPass[] {
  return [
    { name: 'any', term_value_id: null, channel_hint: null, tags_hint: [] },
    {
      name: 'flowering',
      term_value_id: floweringValueId,
      channel_hint: 'flower',
      tags_hint: ['flowering'],
    },
    {
      name: 'fruiting',
      term_value_id: FRUITING_VALUE_ID,
      channel_hint: 'fruit',
      tags_hint: ['fruiting'],
    },
  ];
}

export function taxaUrl(scientific: string): string {
  return `${INAT_API}/taxa?q=${encodeURIComponent(scientific)}&rank=species&per_page=1`;
}

export function observationsUrl(taxonId: number, page: number, pass: InatPass): string {
  // The parameter order is fixed, so the same request always gives the same cache key.
  const params = [
    `taxon_id=${taxonId}`,
    'quality_grade=research',
    `photo_license=${PHOTO_LICENSES}`,
    'photos=true',
    'order_by=votes',
    `per_page=${PER_PAGE}`,
    `page=${page}`,
  ];
  if (pass.term_value_id !== null) {
    params.push(`term_id=${PHENOLOGY_TERM_ID}`, `term_value_id=${pass.term_value_id}`);
  }
  return `${INAT_API}/observations?${params.join('&')}`;
}

export function parseTaxon(json: unknown): InatTaxon | null {
  const results = resultsOf(json);
  const first = results[0];
  if (first === undefined) return null;
  const id = asNumber(first.id);
  const name = asString(first.name);
  if (id === null || name === null) return null;
  return { id, name };
}

/** Replaces the base name of the last path segment and keeps the extension. */
export function photoUrlSize(url: string, size: string): string {
  const cut = url.lastIndexOf('/');
  if (cut === -1) return url;
  const segment = url.slice(cut + 1);
  const dot = segment.lastIndexOf('.');
  const extension = dot === -1 ? '' : segment.slice(dot);
  return `${url.slice(0, cut + 1)}${size}${extension}`;
}

const LICENSE_LABELS: Record<string, string> = {
  cc0: 'CC0 1.0',
  'cc-by': 'CC BY 4.0',
  'cc-by-sa': 'CC BY-SA 4.0',
  'cc-by-nc': 'CC BY-NC 4.0',
  'cc-by-nc-sa': 'CC BY-NC-SA 4.0',
  'cc-by-nd': 'CC BY-ND 4.0',
  'cc-by-nc-nd': 'CC BY-NC-ND 4.0',
};

const LICENSE_URLS: Record<string, string> = {
  cc0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'cc-by': 'https://creativecommons.org/licenses/by/4.0/',
  'cc-by-sa': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'cc-by-nc': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'cc-by-nc-sa': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'cc-by-nd': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'cc-by-nc-nd': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
};

/**
 * iNat reports the license family, not the version. 4.0 is the version iNat applies to
 * a new upload, so the label is the pipeline's reading and the agent checks it against
 * the source page.
 */
export function licenseLabel(code: string): string {
  if (typeof code !== 'string') return 'All rights reserved';
  return LICENSE_LABELS[code] ?? 'All rights reserved';
}

export function licenseUrlFor(code: string): string | null {
  if (typeof code !== 'string') return null;
  return LICENSE_URLS[code] ?? null;
}

/** Flattens the observations into photo rows. A photo with no license is dropped. */
export function parseObservations(json: unknown): InatPhoto[] {
  const photos: InatPhoto[] = [];
  for (const observation of resultsOf(json)) {
    const observationId = asNumber(observation.id);
    if (observationId === null) continue;
    const taxon = asRecord(observation.taxon);
    const taxonName = taxon === null ? null : asString(taxon.name);
    const rows = Array.isArray(observation.photos) ? observation.photos : [];
    for (const row of rows) {
      const photo = asRecord(row);
      if (photo === null) continue;
      const photoId = asNumber(photo.id);
      const url = asString(photo.url);
      const licenseCode = asString(photo.license_code);
      if (photoId === null || url === null || licenseCode === null) continue;
      photos.push({
        observation_id: observationId,
        photo_id: photoId,
        url,
        license_code: licenseCode,
        attribution: asString(photo.attribution) ?? '',
        taxon_name: taxonName ?? '',
      });
    }
  }
  return photos;
}

export function inatCandidates(
  photos: InatPhoto[],
  target: string,
  pass: InatPass,
  now: string,
): Candidate[] {
  const rows: Candidate[] = [];
  for (const photo of photos) {
    const license = licenseLabel(photo.license_code);
    if (!licenseAllowed(license)) continue;
    // Both photos of one observation hash the same origin, so they share an id. Task 8's
    // dedupe drops the second, and one observation contributes one photo to the pool.
    rows.push(
      makeCandidate({
        target,
        source: 'inat',
        origin: `https://www.inaturalist.org/observations/${photo.observation_id}`,
        file_url: photoUrlSize(photo.url, 'original'),
        author: photo.attribution,
        license,
        license_url: licenseUrlFor(photo.license_code),
        source_species: photo.taxon_name,
        channel_hint: pass.channel_hint,
        tags_hint: pass.tags_hint,
        fetched_at: now,
      }),
    );
  }
  return rows;
}

export function loadInatTerms(path: string): { flowering_value_id: number } {
  if (!fs.existsSync(path)) {
    throw new Error(`the iNat terms file is absent: ${path}. Run "cli data inat-terms".`);
  }
  const parsed = asRecord(JSON.parse(fs.readFileSync(path, 'utf8')));
  const value = parsed === null ? null : asNumber(parsed.flowering_value_id);
  if (value === null) {
    throw new Error(`the iNat terms file has no flowering_value_id: ${path}. Run "cli data inat-terms".`);
  }
  return { flowering_value_id: value };
}

function resultsOf(json: unknown): Record<string, unknown>[] {
  const root = asRecord(json);
  if (root === null || !Array.isArray(root.results)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const row of root.results) {
    const record = asRecord(row);
    if (record !== null) rows.push(record);
  }
  return rows;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test pipeline/tests/inat.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 9: Commit**

```bash
git add pipeline/lib/inat.ts pipeline/data/inat_terms.json pipeline/tests/inat.test.ts pipeline/tests/fixtures/inat_taxa_quga.json pipeline/tests/fixtures/inat_taxa_empty.json pipeline/tests/fixtures/inat_observations_quga.json && git commit -m "feat: add the iNaturalist url builders and parsers" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: Wikimedia Commons

**Files:**
- Create: `pipeline/lib/commons.ts`
- Test: `pipeline/tests/commons.test.ts`
- Fixture: `pipeline/tests/fixtures/commons_category_quga.json`
- Fixture: `pipeline/tests/fixtures/commons_category_quga_page2.json`

**Interfaces:**
- Consumes, from `pipeline/lib/candidates.ts` (Task 2):
  - `function licenseAllowed(text: string): boolean`
  - `function channelHint(text: string): string | null`
  - `function makeCandidate(fields: Partial<Candidate> & { target: string; source: string; origin: string; file_url: string }): Candidate`
  - `interface Candidate`
- Produces:
  - `const COMMONS_API: string` (`https://commons.wikimedia.org/w/api.php`)
  - `interface CommonsFile { title: string; mime: string; width: number; height: number; url: string; thumb_url: string; descriptionurl: string; license: string; license_url: string | null; artist: string; description: string }`
  - `function categoryUrl(category: string, continueToken: string | null): string`
  - `function stripHtml(html: string): string`
  - `function parseCategoryListing(json: unknown): { files: CommonsFile[]; next: string | null }`
  - `function commonsCandidates(files: CommonsFile[], target: string, scientific: string, now: string): Candidate[]`

This module is pure. It builds the URL and parses the response. It runs no fetch, so it does not import `http.ts`. The caller passes the parsed JSON in and the run's timestamp in.

One call lists a Commons category and returns the image info for every file on the page. The API is `action=query` with `generator=categorymembers`. The anonymous page size is 50 titles. A continuation adds `gcmcontinue`. `parseCategoryListing` reads the pages object, which the API keys by page id, so the module sorts the files by title. `Artist` and `ImageDescription` come back as HTML, so both go through `stripHtml`.

`commonsCandidates` keeps a file only when its MIME type is `image/jpeg` and `licenseAllowed` admits its `LicenseShortName`. The `file_url` is the 1280 px thumbnail, or the original when the original is not wider. The `origin` is the file's description page, not the file itself.

> Both fixtures hold the fields section 3 documents, trimmed to the rows the tests read.
> They are hand-built, not recorded. Task 19 replaces them with a recorded response after
> the first live fetch.

- [ ] **Step 1: Write the page 1 fixture**

`pipeline/tests/fixtures/commons_category_quga.json`:

Page 1 holds seven pages: six files and one page with no `imageinfo`, which the parser
skips. The page ids are out of order, so the sort has something to do.

```json
{
  "continue": {
    "gcmcontinue": "file|515545524355532047414d42454c49492e6a7067|60113541",
    "continue": "gcmcontinue||"
  },
  "query": {
    "pages": {
      "555": {
        "pageid": 555,
        "ns": 6,
        "title": "File:Quercus gambelii range map.svg",
        "imageinfo": [
          {
            "url": "https://upload.wikimedia.org/wikipedia/commons/5/55/Quercus_gambelii_range_map.svg",
            "descriptionurl": "https://commons.wikimedia.org/wiki/File:Quercus_gambelii_range_map.svg",
            "thumburl": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Quercus_gambelii_range_map.svg/1280px-Quercus_gambelii_range_map.svg.png",
            "thumbwidth": 1280,
            "thumbheight": 1024,
            "width": 1000,
            "height": 800,
            "mime": "image/svg+xml",
            "extmetadata": {
              "LicenseShortName": { "value": "CC0" },
              "LicenseUrl": { "value": "https://creativecommons.org/publicdomain/zero/1.0" },
              "Artist": { "value": "<a href=\"https://commons.wikimedia.org/wiki/User:Map_Maker\">Map Maker</a>" },
              "ImageDescription": { "value": "Range map of the species" }
            }
          }
        ]
      },
      "222": {
        "pageid": 222,
        "ns": 6,
        "title": "File:Quercus gambelii in autumn.jpg",
        "imageinfo": [
          {
            "url": "https://upload.wikimedia.org/wikipedia/commons/2/22/Quercus_gambelii_in_autumn.jpg",
            "descriptionurl": "https://commons.wikimedia.org/wiki/File:Quercus_gambelii_in_autumn.jpg",
            "thumburl": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Quercus_gambelii_in_autumn.jpg/1280px-Quercus_gambelii_in_autumn.jpg",
            "thumbwidth": 1280,
            "thumbheight": 960,
            "width": 3264,
            "height": 2448,
            "mime": "image/jpeg",
            "extmetadata": {
              "LicenseShortName": { "value": "CC BY 2.0" },
              "LicenseUrl": { "value": "https://creativecommons.org/licenses/by/2.0" },
              "Artist": { "value": "<a href=\"https://www.flickr.com/people/jsmith\">John Smith</a>" },
              "ImageDescription": { "value": "Green <b>leaves</b> &amp; a branch in summer" }
            }
          }
        ]
      },
      "666": {
        "pageid": 666,
        "ns": 6,
        "title": "File:Quercus gambelii sapling.jpg",
        "imageinfo": [
          {
            "url": "https://upload.wikimedia.org/wikipedia/commons/6/66/Quercus_gambelii_sapling.jpg",
            "descriptionurl": "https://commons.wikimedia.org/wiki/File:Quercus_gambelii_sapling.jpg",
            "thumburl": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Quercus_gambelii_sapling.jpg/1280px-Quercus_gambelii_sapling.jpg",
            "thumbwidth": 1280,
            "thumbheight": 853,
            "width": 3000,
            "height": 2000,
            "mime": "image/jpeg",
            "extmetadata": {
              "LicenseShortName": { "value": "CC BY-NC 4.0" },
              "LicenseUrl": { "value": "https://creativecommons.org/licenses/by-nc/4.0" },
              "Artist": { "value": "<a href=\"https://commons.wikimedia.org/wiki/User:Nadia_Ruiz\">Nadia Ruiz</a>" },
              "ImageDescription": { "value": "A young plant in a meadow" }
            }
          }
        ]
      },
      "111": {
        "pageid": 111,
        "ns": 6,
        "title": "File:Quercus gambelii bark.jpg",
        "imageinfo": [
          {
            "url": "https://upload.wikimedia.org/wikipedia/commons/1/11/Quercus_gambelii_bark.jpg",
            "descriptionurl": "https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark.jpg",
            "thumburl": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Quercus_gambelii_bark.jpg/1280px-Quercus_gambelii_bark.jpg",
            "thumbwidth": 1280,
            "thumbheight": 853,
            "width": 4000,
            "height": 2667,
            "mime": "image/jpeg",
            "extmetadata": {
              "LicenseShortName": { "value": "CC BY-SA 4.0" },
              "LicenseUrl": { "value": "https://creativecommons.org/licenses/by-sa/4.0" },
              "Artist": { "value": "<a href=\"https://commons.wikimedia.org/wiki/User:Jane_Doe\">Jane Doe</a>" },
              "ImageDescription": { "value": "Bark of <i>Quercus gambelii</i> in autumn" }
            }
          }
        ]
      },
      "777": {
        "pageid": 777,
        "ns": 6,
        "title": "File:Quercus gambelii wind.ogg"
      },
      "333": {
        "pageid": 333,
        "ns": 6,
        "title": "File:Quercus gambelii acorn.jpg",
        "imageinfo": [
          {
            "url": "https://upload.wikimedia.org/wikipedia/commons/3/33/Quercus_gambelii_acorn.jpg",
            "descriptionurl": "https://commons.wikimedia.org/wiki/File:Quercus_gambelii_acorn.jpg",
            "thumburl": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Quercus_gambelii_acorn.jpg/1280px-Quercus_gambelii_acorn.jpg",
            "thumbwidth": 1280,
            "thumbheight": 960,
            "width": 2048,
            "height": 1536,
            "mime": "image/jpeg",
            "extmetadata": {
              "LicenseShortName": { "value": "CC0" },
              "LicenseUrl": { "value": "https://creativecommons.org/publicdomain/zero/1.0" },
              "Artist": { "value": "Ada Lovelace" },
              "ImageDescription": { "value": "A ripe nut on a branch" }
            }
          }
        ]
      },
      "444": {
        "pageid": 444,
        "ns": 6,
        "title": "File:Quercus gambelii habit.jpg",
        "imageinfo": [
          {
            "url": "https://upload.wikimedia.org/wikipedia/commons/4/44/Quercus_gambelii_habit.jpg",
            "descriptionurl": "https://commons.wikimedia.org/wiki/File:Quercus_gambelii_habit.jpg",
            "thumburl": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Quercus_gambelii_habit.jpg/900px-Quercus_gambelii_habit.jpg",
            "thumbwidth": 900,
            "thumbheight": 600,
            "width": 900,
            "height": 600,
            "mime": "image/jpeg",
            "extmetadata": {
              "LicenseShortName": { "value": "CC BY-SA 4.0" },
              "LicenseUrl": { "value": "https://creativecommons.org/licenses/by-sa/4.0" },
              "Artist": { "value": "<a href=\"https://commons.wikimedia.org/wiki/User:Rosa_Vega\">Rosa Vega</a>" },
              "ImageDescription": { "value": "A whole tree on a hillside" }
            }
          }
        ]
      }
    }
  }
}
```

- [ ] **Step 2: Write the page 2 fixture**

`pipeline/tests/fixtures/commons_category_quga_page2.json`:

Page 2 holds one file and no `continue` key.

```json
{
  "query": {
    "pages": {
      "888": {
        "pageid": 888,
        "ns": 6,
        "title": "File:Quercus gambelii leaf detail.jpg",
        "imageinfo": [
          {
            "url": "https://upload.wikimedia.org/wikipedia/commons/8/88/Quercus_gambelii_leaf_detail.jpg",
            "descriptionurl": "https://commons.wikimedia.org/wiki/File:Quercus_gambelii_leaf_detail.jpg",
            "thumburl": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Quercus_gambelii_leaf_detail.jpg/1280px-Quercus_gambelii_leaf_detail.jpg",
            "thumbwidth": 1280,
            "thumbheight": 853,
            "width": 3000,
            "height": 2000,
            "mime": "image/jpeg",
            "extmetadata": {
              "LicenseShortName": { "value": "CC BY-SA 4.0" },
              "LicenseUrl": { "value": "https://creativecommons.org/licenses/by-sa/4.0" },
              "Artist": { "value": "<a href=\"https://commons.wikimedia.org/wiki/User:Jane_Doe\">Jane Doe</a>" },
              "ImageDescription": { "value": "One leaf, upper surface" }
            }
          }
        ]
      }
    }
  }
}
```

- [ ] **Step 3: Write the failing test**

`pipeline/tests/commons.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  COMMONS_API,
  categoryUrl,
  stripHtml,
  parseCategoryListing,
  commonsCandidates,
  type CommonsFile,
} from '../lib/commons.ts';

const page1Fixture = new URL('./fixtures/commons_category_quga.json', import.meta.url);
const page2Fixture = new URL('./fixtures/commons_category_quga_page2.json', import.meta.url);

function readFixture(url: URL): unknown {
  return JSON.parse(fs.readFileSync(url, 'utf8'));
}

function page1(): { files: CommonsFile[]; next: string | null } {
  return parseCategoryListing(readFixture(page1Fixture));
}

function fileNamed(files: CommonsFile[], title: string): CommonsFile {
  const found = files.find((file) => file.title === title);
  assert.ok(found, `the fixture holds ${title}`);
  return found;
}

const NOW = '2026-09-22T15:04:00Z';

test('parseCategoryListing reads page 1 sorted by title and returns the continue token', () => {
  const { files, next } = page1();
  assert.equal(files.length, 6);
  assert.deepEqual(
    files.map((file) => file.title),
    [
      'File:Quercus gambelii acorn.jpg',
      'File:Quercus gambelii bark.jpg',
      'File:Quercus gambelii habit.jpg',
      'File:Quercus gambelii in autumn.jpg',
      'File:Quercus gambelii range map.svg',
      'File:Quercus gambelii sapling.jpg',
    ],
  );
  assert.equal(next, 'file|515545524355532047414d42454c49492e6a7067|60113541');

  const bark = fileNamed(files, 'File:Quercus gambelii bark.jpg');
  assert.equal(bark.mime, 'image/jpeg');
  assert.equal(bark.width, 4000);
  assert.equal(bark.height, 2667);
  assert.equal(bark.license, 'CC BY-SA 4.0');
  assert.equal(bark.license_url, 'https://creativecommons.org/licenses/by-sa/4.0');
  assert.equal(bark.artist, 'Jane Doe');
  assert.equal(bark.description, 'Bark of Quercus gambelii in autumn');
  assert.equal(
    bark.descriptionurl,
    'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark.jpg',
  );
});

test('parseCategoryListing reads page 2 and reports no continuation', () => {
  const { files, next } = parseCategoryListing(readFixture(page2Fixture));
  assert.equal(files.length, 1);
  assert.equal(files[0].title, 'File:Quercus gambelii leaf detail.jpg');
  assert.equal(files[0].description, 'One leaf, upper surface');
  assert.equal(next, null);
});

test('stripHtml removes tags, decodes the entities, and collapses whitespace', () => {
  assert.equal(stripHtml('<a href="x">Jane Doe</a>'), 'Jane Doe');
  assert.equal(stripHtml('Leaves &amp; twigs'), 'Leaves & twigs');
  assert.equal(stripHtml('&lt;i&gt;'), '<i>');
  assert.equal(stripHtml('a &quot;quoted&quot; word'), 'a "quoted" word');
  assert.equal(stripHtml('Jane&#39;s photo'), "Jane's photo");
  assert.equal(stripHtml('one&nbsp;two'), 'one two');
  assert.equal(stripHtml('  spaced\n\n out  '), 'spaced out');
});

test('commonsCandidates drops the NC file and the non-JPEG file', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', 'Quercus gambelii', NOW);
  assert.equal(candidates.length, 4);
  assert.deepEqual(
    candidates.map((row) => row.file_url.split('/').pop()),
    [
      '1280px-Quercus_gambelii_acorn.jpg',
      '1280px-Quercus_gambelii_bark.jpg',
      'Quercus_gambelii_habit.jpg',
      '1280px-Quercus_gambelii_in_autumn.jpg',
    ],
  );
  for (const row of candidates) {
    assert.equal(row.source, 'commons');
    assert.equal(row.target, 'QUGA');
    assert.equal(row.source_species, 'Quercus gambelii');
    assert.equal(row.fetched_at, NOW);
    assert.equal(row.fetch_error, null);
    assert.deepEqual(row.tags_hint, []);
  }
});

test('the hint comes from the title and the description', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', 'Quercus gambelii', NOW);
  const byOrigin = new Map(candidates.map((row) => [row.origin, row]));

  const bark = byOrigin.get('https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark.jpg');
  assert.equal(bark?.channel_hint, 'bark');

  const leaves = byOrigin.get(
    'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_in_autumn.jpg',
  );
  assert.equal(leaves?.channel_hint, 'leaf');

  const acorn = byOrigin.get('https://commons.wikimedia.org/wiki/File:Quercus_gambelii_acorn.jpg');
  assert.equal(acorn?.channel_hint, 'fruit');
});

test('a file with no keyword gets a null hint', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', 'Quercus gambelii', NOW);
  const habit = candidates.find(
    (row) => row.origin === 'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_habit.jpg',
  );
  assert.equal(habit?.channel_hint, null);
});

test('thumb_url is the thumbnail for a wide original and the original when it is smaller', () => {
  const { files } = page1();

  const bark = fileNamed(files, 'File:Quercus gambelii bark.jpg');
  assert.equal(
    bark.thumb_url,
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Quercus_gambelii_bark.jpg/1280px-Quercus_gambelii_bark.jpg',
  );

  const habit = fileNamed(files, 'File:Quercus gambelii habit.jpg');
  assert.equal(habit.width, 900);
  assert.equal(
    habit.thumb_url,
    'https://upload.wikimedia.org/wikipedia/commons/4/44/Quercus_gambelii_habit.jpg',
  );
  assert.equal(habit.thumb_url, habit.url);
});

test('categoryUrl builds the documented parameters and leaves gcmcontinue out', () => {
  assert.equal(COMMONS_API, 'https://commons.wikimedia.org/w/api.php');
  assert.equal(
    categoryUrl('Quercus gambelii', null),
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
      '&generator=categorymembers&gcmtitle=Category:Quercus%20gambelii' +
      '&gcmtype=file&gcmlimit=50&prop=imageinfo' +
      '&iiprop=url|extmetadata|mime|size&iiurlwidth=1280' +
      '&iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|LicenseUrl',
  );
});

test('categoryUrl adds the continuation token url-encoded', () => {
  const url = categoryUrl('Quercus gambelii', 'file|QUGA.JPG|60113541');
  assert.equal(
    url,
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
      '&generator=categorymembers&gcmtitle=Category:Quercus%20gambelii' +
      '&gcmtype=file&gcmlimit=50&prop=imageinfo' +
      '&iiprop=url|extmetadata|mime|size&iiurlwidth=1280' +
      '&iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|LicenseUrl' +
      '&gcmcontinue=file%7CQUGA.JPG%7C60113541',
  );
});

test('the origin is the description page, not the file url', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', 'Quercus gambelii', NOW);
  const bark = candidates.find((row) => row.channel_hint === 'bark');
  assert.equal(
    bark?.origin,
    'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark.jpg',
  );
  assert.ok(bark?.origin.startsWith('https://commons.wikimedia.org/wiki/File:'));
  assert.notEqual(bark?.origin, bark?.file_url);
  assert.equal(bark?.author, 'Jane Doe');
  assert.equal(bark?.license, 'CC BY-SA 4.0');
  assert.equal(bark?.license_url, 'https://creativecommons.org/licenses/by-sa/4.0');
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test pipeline/tests/commons.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\commons.ts' imported from <repo>\pipeline\tests\commons.test.ts`, and `# fail 1`.

- [ ] **Step 5: Create `pipeline/lib/commons.ts`**

```ts
import { licenseAllowed, channelHint, makeCandidate } from './candidates.ts';
import type { Candidate } from './candidates.ts';

export const COMMONS_API: string = 'https://commons.wikimedia.org/w/api.php';

/** Commons rounds a thumbnail width to 960, 1280, 1920, or 3840. */
const THUMB_WIDTH = 1280;

export interface CommonsFile {
  title: string;
  mime: string;
  width: number;
  height: number;
  url: string;
  thumb_url: string;
  descriptionurl: string;
  license: string;
  license_url: string | null;
  artist: string;
  description: string;
}

// The parameter order is fixed, so one category always gives one cache key.
export function categoryUrl(category: string, continueToken: string | null): string {
  const parts = [
    'action=query',
    'format=json',
    'generator=categorymembers',
    `gcmtitle=Category:${encodeURIComponent(category)}`,
    'gcmtype=file',
    'gcmlimit=50',
    'prop=imageinfo',
    'iiprop=url|extmetadata|mime|size',
    `iiurlwidth=${THUMB_WIDTH}`,
    'iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|LicenseUrl',
  ];
  if (continueToken !== null) {
    parts.push(`gcmcontinue=${encodeURIComponent(continueToken)}`);
  }
  return `${COMMONS_API}?${parts.join('&')}`;
}

const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** `Artist` and `ImageDescription` come back as HTML, so every consumer runs this. */
export function stripHtml(html: string): string {
  let text = html.replace(/<[^>]*>/g, ' ');
  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char);
  }
  // `&amp;` goes last, so an escaped entity never decodes a second time.
  text = text.split('&amp;').join('&');
  return text.replace(/\s+/g, ' ').trim();
}

export function parseCategoryListing(json: unknown): {
  files: CommonsFile[];
  next: string | null;
} {
  const root = asRecord(json);
  const pages = asRecord(asRecord(root.query).pages);
  const files: CommonsFile[] = [];

  for (const page of Object.values(pages)) {
    const row = asRecord(page);
    const list = row.imageinfo;
    if (!Array.isArray(list) || list.length === 0) continue;
    const info = asRecord(list[0]);
    const meta = asRecord(info.extmetadata);

    const url = asString(info.url);
    const width = asNumber(info.width);
    const thumbUrl = typeof info.thumburl === 'string' ? info.thumburl : url;
    const thumbWidth = typeof info.thumbwidth === 'number' ? info.thumbwidth : THUMB_WIDTH;
    const licenseUrl = metaValue(meta, 'LicenseUrl');

    files.push({
      title: asString(row.title),
      mime: asString(info.mime),
      width,
      height: asNumber(info.height),
      url,
      thumb_url: width > thumbWidth ? thumbUrl : url,
      descriptionurl: asString(info.descriptionurl),
      license: metaValue(meta, 'LicenseShortName'),
      license_url: licenseUrl === '' ? null : licenseUrl,
      artist: stripHtml(metaValue(meta, 'Artist')),
      description: stripHtml(metaValue(meta, 'ImageDescription')),
    });
  }

  // The pages object is keyed by page id, so sort the titles for a stable order.
  files.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));

  const cont = asRecord(root.continue);
  const next = typeof cont.gcmcontinue === 'string' ? cont.gcmcontinue : null;
  return { files, next };
}

export function commonsCandidates(
  files: CommonsFile[],
  target: string,
  scientific: string,
  now: string,
): Candidate[] {
  const rows: Candidate[] = [];
  for (const file of files) {
    if (file.mime !== 'image/jpeg') continue;
    if (!licenseAllowed(file.license)) continue;
    const name = file.title.replace(/^File:/, '');
    rows.push(
      makeCandidate({
        target,
        source: 'commons',
        origin: file.descriptionurl,
        file_url: file.thumb_url,
        author: file.artist,
        license: file.license,
        license_url: file.license_url,
        source_species: scientific,
        channel_hint: channelHint(`${name} ${file.description}`),
        fetched_at: now,
      }),
    );
  }
  return rows;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function metaValue(meta: Record<string, unknown>, key: string): string {
  return asString(asRecord(meta[key]).value);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test pipeline/tests/commons.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/commons.ts pipeline/tests/commons.test.ts pipeline/tests/fixtures/commons_category_quga.json pipeline/tests/fixtures/commons_category_quga_page2.json && git commit -m "feat: add the Wikimedia Commons source" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: The species record build

**Files:**
- Create: `content_src/species/QUGA.json`
- Create: `pipeline/lib/species.ts`
- Test: `pipeline/tests/species.test.ts`

**Interfaces:**
- Consumes (type-only, from Task 3 and Task 5):
  - `import type { PlantsProfile, ChecklistRow } from './plants.ts';`
  - `import type { InatTaxon } from './inat.ts';`
- Produces:
  - `interface AuthoredSpecies` — `concepts: Record<string, string>; common_extra?: string[]; audubon_name?: string; range: { text: string }; planted_states?: string[]; elevation_ft: [number, number]; height_ft: [number, number]; habitat: string; variety_notes?: Record<string, string>; ref: string[]; genus_common?: string; arrangement?: string`
  - `interface FetchedSpecies` — `scientific: string; common: string[]; family: string | null; genus: string; native_status: string | null; section: string | null; varieties: { key: string; name: string }[]; range: { states: string[] }; inat_taxon_id: number | null; inat_name: string | null`
  - `interface SpeciesRecord { [field: string]: unknown }`
  - `const REQUIRED_AUTHORED: string[]`
  - `function validateAuthored(authored: unknown, symbol: string): string[]`
  - `function readAuthored(dir: string, symbol: string): AuthoredSpecies | null`
  - `function buildFetched(input: { profile: PlantsProfile; subordinate: { key: string; name: string }[]; states: string[]; section: string | null; inat: InatTaxon | null }): FetchedSpecies`
  - `function mergeSpecies(fetched: FetchedSpecies, authored: AuthoredSpecies): SpeciesRecord`
  - `function speciesStatus(symbol: string, input: { authored: AuthoredSpecies | null; imageCount: number; namedByEdge: boolean }): 'dropped' | 'not_authored' | 'no_photos' | 'included'`
  - `function enumerateRun(input: { rows: ChecklistRow[]; genera: string[]; states: string[]; include: string[]; profiles: Record<string, PlantsProfile>; distribution: Record<string, string[]> }): { kept: string[]; dropped: { symbol: string; reason: string }[] }`

A species record has two layers. The fetched layer comes from PLANTS, FNA, and iNat. The
authored layer comes from `content_src/species/<SYMBOL>.json`. `mergeSpecies` joins them,
and the authored value wins on any field both hold. The record's field order matches the
app's `content_dev/species.json` fixture, so a build output and a fixture read the same.

Both imports from `plants.ts` and `inat.ts` are `import type`, so Node erases them and this
module runs before those two tasks land.

`speciesStatus` never returns `'dropped'`. That status comes from `enumerateRun`, and the
return type keeps it so the report can use one union.

- [ ] **Step 1: Create `content_src/species/QUGA.json`**

This is the worked example, and the test reads it from disk. It is the exact file from
section 5 of the spec.

```json
{
  "concepts": { "leaf": "simple_lobed", "bark": "furrowed", "fruit": "acorn" },
  "common_extra": ["Rocky Mountain white oak"],
  "audubon_name": "Gambel Oak",
  "range": { "text": "Colorado Plateau and southern Rockies" },
  "planted_states": [],
  "elevation_ft": [5000, 9000],
  "height_ft": [15, 30],
  "habitat": "Dry slopes and foothills with pinyon and juniper",
  "variety_notes": { "QUGAG": "The widespread form." },
  "ref": ["Virginia Tech Dendrology fact sheet, Quercus gambelii",
          "FNA vol. 3, Quercus gambelii"]
}
```

- [ ] **Step 2: Write the failing test**

The test builds its `PlantsProfile`, `ChecklistRow`, and `InatTaxon` values by hand from
the field shapes section 3 documents. It reads no fixture file except the real
`content_src/species/QUGA.json`.

`pipeline/tests/species.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import type { PlantsProfile, ChecklistRow } from '../lib/plants.ts';
import type { InatTaxon } from '../lib/inat.ts';
import {
  REQUIRED_AUTHORED,
  validateAuthored,
  readAuthored,
  buildFetched,
  mergeSpecies,
  speciesStatus,
  enumerateRun,
} from '../lib/species.ts';
import type { AuthoredSpecies } from '../lib/species.ts';

const SPECIES_DIR = fileURLToPath(new URL('../../content_src/species', import.meta.url));

function profile(over: Partial<PlantsProfile> = {}): PlantsProfile {
  return {
    symbol: 'QUGA',
    plants_id: 32851,
    scientific: 'Quercus gambelii',
    author: 'Nutt.',
    common: 'Gambel oak',
    family: 'Fagaceae',
    genus: 'Quercus',
    rank: 'Species',
    growth_habits: ['Tree', 'Shrub'],
    native_status: 'native',
    ...over,
  };
}

function authored(over: Partial<AuthoredSpecies> = {}): AuthoredSpecies {
  return {
    concepts: { leaf: 'simple_lobed' },
    range: { text: 'Colorado Plateau and southern Rockies' },
    elevation_ft: [5000, 9000],
    height_ft: [15, 30],
    habitat: 'Dry slopes and foothills with pinyon and juniper',
    ref: ['FNA vol. 3, Quercus gambelii'],
    ...over,
  };
}

function row(symbol: string, scientific: string, synonym = ''): ChecklistRow {
  return { symbol, synonym_symbol: synonym, scientific, common: '', family: 'Fagaceae' };
}

const RUN_ROWS: ChecklistRow[] = [
  row('QUGA', 'Quercus gambelii Nutt.'),
  row('QUGAM', 'Quercus gambelii var. gambelii'),
  row('QUXBE', 'Quercus ×bebbiana C.K. Schneid.'),
  row('QURU', 'Quercus rubra L.'),
  row('QUVE', 'Quercus velutina Lam.'),
  row('QUNP', 'Quercus nigra L.'),
  row('QUGA2', 'Quercus gambelii Nutt.', 'QUGA'),
];

const RUN_PROFILES: Record<string, PlantsProfile> = {
  QUGA: profile(),
  QUGAM: profile({ symbol: 'QUGAM', growth_habits: ['Shrub'] }),
  QUXBE: profile({ symbol: 'QUXBE', scientific: 'Quercus ×bebbiana', growth_habits: ['Tree'] }),
  QURU: profile({ symbol: 'QURU', scientific: 'Quercus rubra', growth_habits: ['Tree'] }),
  QUVE: profile({ symbol: 'QUVE', scientific: 'Quercus velutina', growth_habits: ['Tree'] }),
};

const RUN_DISTRIBUTION: Record<string, string[]> = {
  QUGA: ['CO', 'UT'],
  QUGAM: ['CO'],
  QUXBE: ['CO'],
  QURU: ['NE', 'IA'],
  QUVE: ['MO', 'IA'],
};

function reasonFor(dropped: { symbol: string; reason: string }[], symbol: string): string | null {
  const hit = dropped.find((d) => d.symbol === symbol);
  return hit ? hit.reason : null;
}

test('the merge lets authored values win and keeps the fetched states', () => {
  const fetched = buildFetched({
    profile: profile(),
    subordinate: [],
    states: ['CO', 'UT', 'NM', 'AZ'],
    section: 'Quercus',
    inat: { id: 47851, name: 'Quercus gambelii' } as InatTaxon,
  });
  const record = mergeSpecies(fetched, authored({ audubon_name: 'Gambel Oak' }));
  assert.deepEqual(record.range, {
    text: 'Colorado Plateau and southern Rockies',
    states: ['CO', 'UT', 'NM', 'AZ'],
  });
  assert.equal(record.audubon_name, 'Gambel Oak');
  assert.equal(record.section, 'Quercus');
  assert.equal(record.native_status, 'native');
});

test('common is the PLANTS name then common_extra, with no duplicate', () => {
  const fetched = buildFetched({
    profile: profile(),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  const record = mergeSpecies(
    fetched,
    authored({ common_extra: ['Rocky Mountain white oak', 'Gambel oak'] }),
  );
  assert.deepEqual(record.common, ['Gambel oak', 'Rocky Mountain white oak']);
});

test('a variety takes its note from variety_notes, and one without a note carries none', () => {
  const fetched = buildFetched({
    profile: profile(),
    subordinate: [
      { key: 'QUGAG', name: 'var. gambelii' },
      { key: 'QUGAB', name: 'var. bakeri' },
    ],
    states: [],
    section: null,
    inat: null,
  });
  const record = mergeSpecies(
    fetched,
    authored({ variety_notes: { QUGAG: 'The widespread form.' } }),
  );
  assert.deepEqual(record.varieties, [
    { key: 'QUGAG', name: 'var. gambelii', note: 'The widespread form.' },
    { key: 'QUGAB', name: 'var. bakeri' },
  ]);
});

test('a missing required authored field fails, and the message names the symbol and the field', () => {
  assert.deepEqual(REQUIRED_AUTHORED, [
    'concepts',
    'range',
    'elevation_ft',
    'height_ft',
    'habitat',
    'ref',
  ]);
  const short = authored();
  delete (short as Record<string, unknown>).habitat;
  const errors = validateAuthored(short, 'QUGA');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /QUGA/);
  assert.match(errors[0], /habitat/);
});

test('each malformed field fails', () => {
  const cases: [unknown, RegExp][] = [
    [authored({ elevation_ft: [5000] as unknown as [number, number] }), /elevation_ft/],
    [authored({ height_ft: [30, 15] }), /height_ft/],
    [authored({ concepts: {} }), /concepts/],
    [authored({ ref: [] }), /ref/],
    ['not an object', /object/],
  ];
  for (const [value, pattern] of cases) {
    const errors = validateAuthored(value, 'QUGA');
    assert.ok(errors.length > 0, `expected an error for ${JSON.stringify(value)}`);
    assert.ok(errors.some((m) => pattern.test(m)), errors.join(' | '));
    assert.ok(errors.every((m) => m.includes('QUGA')), errors.join(' | '));
  }
});

test('an unknown top-level field fails and the message lists it', () => {
  const bad = { ...authored(), habitats: 'Dry slopes' };
  const errors = validateAuthored(bad, 'QUGA');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /habitats/);
  assert.match(errors[0], /variety_notes/);
});

test('the real content_src/species/QUGA.json passes validateAuthored', () => {
  const file = readAuthored(SPECIES_DIR, 'QUGA');
  assert.ok(file, 'QUGA.json is missing');
  assert.deepEqual(validateAuthored(file, 'QUGA'), []);
});

test('readAuthored returns null for a symbol with no file', () => {
  assert.equal(readAuthored(SPECIES_DIR, 'ZZZZ'), null);
});

test('buildFetched sets inat_name only when the iNat name differs', () => {
  const same = buildFetched({
    profile: profile(),
    subordinate: [],
    states: [],
    section: null,
    inat: { id: 47851, name: 'Quercus gambelii' },
  });
  assert.equal(same.inat_taxon_id, 47851);
  assert.equal(same.inat_name, null);

  const differs = buildFetched({
    profile: profile(),
    subordinate: [],
    states: [],
    section: null,
    inat: { id: 47851, name: 'Quercus undulata' },
  });
  assert.equal(differs.inat_name, 'Quercus undulata');

  const none = buildFetched({
    profile: profile(),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  assert.equal(none.inat_taxon_id, null);
  assert.equal(none.inat_name, null);
});

test('no image and no edge gives no_photos; an edge names it and gives included', () => {
  const file = authored();
  assert.equal(
    speciesStatus('QUGA', { authored: file, imageCount: 0, namedByEdge: false }),
    'no_photos',
  );
  assert.equal(
    speciesStatus('QUGA', { authored: file, imageCount: 0, namedByEdge: true }),
    'included',
  );
  assert.equal(
    speciesStatus('QUGA', { authored: file, imageCount: 3, namedByEdge: false }),
    'included',
  );
});

test('a species with no authored file gets not_authored, whatever its image count', () => {
  assert.equal(
    speciesStatus('QUVE', { authored: null, imageCount: 0, namedByEdge: false }),
    'not_authored',
  );
  assert.equal(
    speciesStatus('QUVE', { authored: null, imageCount: 9, namedByEdge: true }),
    'not_authored',
  );
});

test('enumerateRun drops a shrub, a hybrid, and an out-of-range species', () => {
  const out = enumerateRun({
    rows: RUN_ROWS,
    genera: ['Quercus'],
    states: ['CO'],
    include: ['QUVE'],
    profiles: RUN_PROFILES,
    distribution: RUN_DISTRIBUTION,
  });
  assert.deepEqual(out.kept, ['QUGA', 'QUVE']);
  assert.equal(reasonFor(out.dropped, 'QUGAM'), 'not a tree');
  assert.equal(reasonFor(out.dropped, 'QUXBE'), 'hybrid');
  assert.equal(reasonFor(out.dropped, 'QURU'), 'out of range');
  assert.equal(reasonFor(out.dropped, 'QUNP'), 'no profile');
  assert.equal(reasonFor(out.dropped, 'QUGA2'), null);
});

test('enumerateRun drops an include symbol that is a shrub', () => {
  const out = enumerateRun({
    rows: RUN_ROWS,
    genera: ['Quercus'],
    states: ['CO'],
    include: ['QUGAM'],
    profiles: RUN_PROFILES,
    distribution: RUN_DISTRIBUTION,
  });
  assert.equal(out.kept.includes('QUGAM'), false);
  assert.equal(reasonFor(out.dropped, 'QUGAM'), 'not a tree');
});

test('mergeSpecies emits the fields in the app fixture order', () => {
  const fetched = buildFetched({
    profile: profile(),
    subordinate: [{ key: 'QUGAG', name: 'var. gambelii' }],
    states: ['CO', 'UT'],
    section: 'Quercus',
    inat: { id: 47851, name: 'Quercus gambelii' },
  });
  const record = mergeSpecies(
    fetched,
    authored({
      audubon_name: 'Gambel Oak',
      genus_common: 'oak',
      arrangement: 'alternate',
      planted_states: ['NM'],
    }),
  );
  assert.deepEqual(Object.keys(record), [
    'scientific',
    'common',
    'audubon_name',
    'inat_taxon_id',
    'inat_name',
    'genus',
    'genus_common',
    'section',
    'family',
    'arrangement',
    'concepts',
    'range',
    'planted_states',
    'elevation_ft',
    'height_ft',
    'habitat',
    'native_status',
    'varieties',
  ]);
  assert.equal(record.ref, undefined);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test pipeline/tests/species.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../pipeline/lib/species.ts' imported from .../pipeline/tests/species.test.ts`

- [ ] **Step 4: Create `pipeline/lib/species.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PlantsProfile, ChecklistRow } from './plants.ts';
import type { InatTaxon } from './inat.ts';

export interface AuthoredSpecies {
  concepts: Record<string, string>;
  common_extra?: string[];
  audubon_name?: string;
  range: { text: string };
  planted_states?: string[];
  elevation_ft: [number, number];
  height_ft: [number, number];
  habitat: string;
  variety_notes?: Record<string, string>;
  ref: string[];
  genus_common?: string;
  arrangement?: string;
}

export interface FetchedSpecies {
  scientific: string;
  common: string[];
  family: string | null;
  genus: string;
  native_status: string | null;
  section: string | null;
  varieties: { key: string; name: string }[];
  range: { states: string[] };
  inat_taxon_id: number | null;
  inat_name: string | null;
}

export interface SpeciesRecord {
  [field: string]: unknown;
}

export const REQUIRED_AUTHORED: string[] = [
  'concepts',
  'range',
  'elevation_ft',
  'height_ft',
  'habitat',
  'ref',
];

const OPTIONAL_AUTHORED: string[] = [
  'common_extra',
  'audubon_name',
  'planted_states',
  'variety_notes',
  'genus_common',
  'arrangement',
];

const ALLOWED_AUTHORED: string[] = [...REQUIRED_AUTHORED, ...OPTIONAL_AUTHORED].sort();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkRange(errors: string[], symbol: string, field: string, value: unknown): void {
  if (!Array.isArray(value) || value.length !== 2) {
    errors.push(`${symbol}: ${field} must be an array of two numbers`);
    return;
  }
  const [low, high] = value;
  if (typeof low !== 'number' || typeof high !== 'number') {
    errors.push(`${symbol}: ${field} must be an array of two numbers`);
    return;
  }
  if (low > high) {
    errors.push(`${symbol}: ${field} has a first number greater than its second`);
  }
}

export function validateAuthored(authored: unknown, symbol: string): string[] {
  const errors: string[] = [];
  if (!isPlainObject(authored)) {
    return [`${symbol}: the authored file must be a JSON object`];
  }

  for (const field of Object.keys(authored)) {
    if (!ALLOWED_AUTHORED.includes(field)) {
      // A typo in an optional field is silent without this check.
      errors.push(`${symbol}: unknown field ${field}. Allowed: ${ALLOWED_AUTHORED.join(', ')}`);
    }
  }

  for (const field of REQUIRED_AUTHORED) {
    if (authored[field] === undefined) {
      errors.push(`${symbol}: missing required field ${field}`);
    }
  }

  const concepts = authored.concepts;
  if (concepts !== undefined) {
    if (!isPlainObject(concepts) || Object.keys(concepts).length === 0) {
      errors.push(`${symbol}: concepts must be an object with at least one channel`);
    } else {
      for (const [channel, value] of Object.entries(concepts)) {
        if (!nonEmptyString(value)) {
          errors.push(`${symbol}: concepts.${channel} must be a non-empty string`);
        }
      }
    }
  }

  const range = authored.range;
  if (range !== undefined) {
    if (!isPlainObject(range) || !nonEmptyString(range.text)) {
      errors.push(`${symbol}: range must be an object with a non-empty range.text`);
    }
  }

  if (authored.elevation_ft !== undefined) {
    checkRange(errors, symbol, 'elevation_ft', authored.elevation_ft);
  }
  if (authored.height_ft !== undefined) {
    checkRange(errors, symbol, 'height_ft', authored.height_ft);
  }

  if (authored.habitat !== undefined && !nonEmptyString(authored.habitat)) {
    errors.push(`${symbol}: habitat must be a non-empty string`);
  }

  const ref = authored.ref;
  if (ref !== undefined) {
    if (!Array.isArray(ref) || ref.length === 0 || !ref.every(nonEmptyString)) {
      errors.push(`${symbol}: ref must be a non-empty array of non-empty strings`);
    }
  }

  return errors;
}

export function readAuthored(dir: string, symbol: string): AuthoredSpecies | null {
  const path = join(dir, `${symbol}.json`);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(text) as AuthoredSpecies;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path} is not valid JSON: ${message}`);
  }
}

export function buildFetched(input: {
  profile: PlantsProfile;
  subordinate: { key: string; name: string }[];
  states: string[];
  section: string | null;
  inat: InatTaxon | null;
}): FetchedSpecies {
  const { profile, subordinate, states, section, inat } = input;
  return {
    scientific: profile.scientific,
    common: profile.common === null ? [] : [profile.common],
    family: profile.family,
    genus: profile.genus,
    native_status: profile.native_status,
    section,
    varieties: subordinate.map((row) => ({ key: row.key, name: row.name })),
    range: { states },
    inat_taxon_id: inat === null ? null : inat.id,
    inat_name: inat !== null && inat.name !== profile.scientific ? inat.name : null,
  };
}

export function mergeSpecies(fetched: FetchedSpecies, authored: AuthoredSpecies): SpeciesRecord {
  const common: string[] = [];
  for (const name of [...fetched.common, ...(authored.common_extra ?? [])]) {
    if (!common.includes(name)) common.push(name);
  }

  const notes = authored.variety_notes ?? {};
  const varieties = fetched.varieties.map((variety) => {
    const note = notes[variety.key];
    return note === undefined
      ? { key: variety.key, name: variety.name }
      : { key: variety.key, name: variety.name, note };
  });

  const record: SpeciesRecord = {};
  record.scientific = fetched.scientific;
  record.common = common;
  if (authored.audubon_name !== undefined) record.audubon_name = authored.audubon_name;
  record.inat_taxon_id = fetched.inat_taxon_id;
  record.inat_name = fetched.inat_name;
  record.genus = fetched.genus;
  if (authored.genus_common !== undefined) record.genus_common = authored.genus_common;
  record.section = fetched.section;
  record.family = fetched.family;
  if (authored.arrangement !== undefined) record.arrangement = authored.arrangement;
  record.concepts = authored.concepts;
  record.range = { text: authored.range.text, states: fetched.range.states };
  record.planted_states = authored.planted_states ?? [];
  record.elevation_ft = authored.elevation_ft;
  record.height_ft = authored.height_ft;
  record.habitat = authored.habitat;
  record.native_status = fetched.native_status;
  record.varieties = varieties;
  // ref stays in content_src. It never enters the published record.
  return record;
}

export function speciesStatus(
  symbol: string,
  input: { authored: AuthoredSpecies | null; imageCount: number; namedByEdge: boolean },
): 'dropped' | 'not_authored' | 'no_photos' | 'included' {
  void symbol;
  if (input.authored === null) return 'not_authored';
  if (input.imageCount === 0 && !input.namedByEdge) return 'no_photos';
  return 'included';
}

function genusOf(scientific: string): string {
  return scientific.trim().split(/\s+/)[0] ?? '';
}

export function enumerateRun(input: {
  rows: ChecklistRow[];
  genera: string[];
  states: string[];
  include: string[];
  profiles: Record<string, PlantsProfile>;
  distribution: Record<string, string[]>;
}): { kept: string[]; dropped: { symbol: string; reason: string }[] } {
  const { rows, genera, states, include, profiles, distribution } = input;

  const symbols: string[] = [];
  for (const row of rows) {
    if (row.synonym_symbol.trim() !== '') continue;
    if (!genera.includes(genusOf(row.scientific))) continue;
    if (!symbols.includes(row.symbol)) symbols.push(row.symbol);
  }

  const kept: string[] = [];
  const dropped: { symbol: string; reason: string }[] = [];

  for (const symbol of symbols) {
    const profile = profiles[symbol];
    if (profile === undefined) {
      dropped.push({ symbol, reason: 'no profile' });
      continue;
    }
    if (!profile.growth_habits.includes('Tree')) {
      dropped.push({ symbol, reason: 'not a tree' });
      continue;
    }
    if (profile.scientific.includes('×')) {
      dropped.push({ symbol, reason: 'hybrid' });
      continue;
    }
    // include bypasses the range gate only. The tree and hybrid gates still apply.
    const inRange = (distribution[symbol] ?? []).some((state) => states.includes(state));
    if (!inRange && !include.includes(symbol)) {
      dropped.push({ symbol, reason: 'out of range' });
      continue;
    }
    kept.push(symbol);
  }

  kept.sort();
  return { kept, dropped };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test pipeline/tests/species.test.ts`
Expected: PASS, 14 tests

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/species.ts pipeline/tests/species.test.ts content_src/species/QUGA.json && git commit -m "feat: add the species record build" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: Candidate collection, dedupe, and the caps

**Files:**
- Modify: `pipeline/lib/candidates.ts`
- Test: `pipeline/tests/candidates_collect.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `makeCandidate(fields: Partial<Candidate> & { target: string; source: string; origin: string; file_url: string }): Candidate` from `pipeline/lib/candidates.ts`
- Produces:
  - `MAX_PER_SPECIES: number` (60)
  - `CHANNEL_TARGET: number` (8)
  - `dedupe(existing: Candidate[], found: Candidate[]): Candidate[]`
  - `underCap(existing: Candidate[], target: string): number`
  - `channelFull(approvedByChannel: Record<string, number>, channel: string): boolean`
  - `collect(input: { existing: Candidate[]; found: Candidate[]; target: string; approvedByChannel: Record<string, number> }): { added: Candidate[]; skipped: { id: string; reason: string }[] }`

Task 2 wrote the first half of `pipeline/lib/candidates.ts`. This task appends the second half, and nothing above the append changes.

A run keeps at most 60 candidates per target. A channel stops once it holds 8 approved
images. `collect` applies both caps and the dedupe rule in one walk, and reports a reason
for every row it drops.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/candidates_collect.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PER_SPECIES,
  CHANNEL_TARGET,
  makeCandidate,
  dedupe,
  underCap,
  channelFull,
  collect,
} from '../lib/candidates.ts';
import type { Candidate } from '../lib/candidates.ts';

function row(fields: Partial<Candidate> & { origin: string }): Candidate {
  return makeCandidate({
    target: fields.target ?? 'QUGA',
    source: fields.source ?? 'inat',
    file_url: fields.file_url ?? `${fields.origin}/original.jpg`,
    ...fields,
  });
}

function manyRows(target: string, count: number): Candidate[] {
  const rows: Candidate[] = [];
  for (let i = 0; i < count; i += 1) {
    rows.push(row({ target, origin: `https://example.org/${target}/${i}` }));
  }
  return rows;
}

test('MAX_PER_SPECIES is 60 and CHANNEL_TARGET is 8', () => {
  assert.equal(MAX_PER_SPECIES, 60);
  assert.equal(CHANNEL_TARGET, 8);
});

test('dedupe drops a duplicate origin url', () => {
  const existing = [row({ origin: 'https://www.inaturalist.org/observations/1' })];
  const found = [
    row({ origin: 'https://www.inaturalist.org/observations/1' }),
    row({ origin: 'https://www.inaturalist.org/observations/2' }),
  ];
  const kept = dedupe(existing, found);
  assert.deepEqual(
    kept.map((candidate) => candidate.origin),
    ['https://www.inaturalist.org/observations/2'],
  );
});

test('dedupe drops a duplicate file_hash from any source', () => {
  const existing = [
    row({ origin: 'https://commons.wikimedia.org/wiki/File:A.jpg', source: 'commons', file_hash: 'aaa' }),
  ];
  const found = [
    row({ origin: 'https://www.inaturalist.org/observations/9', source: 'inat', file_hash: 'aaa' }),
    row({ origin: 'https://www.inaturalist.org/observations/10', source: 'inat', file_hash: 'bbb' }),
  ];
  const kept = dedupe(existing, found);
  assert.deepEqual(
    kept.map((candidate) => candidate.file_hash),
    ['bbb'],
  );
});

test('dedupe collapses two found rows with the same id', () => {
  const found = [
    row({ origin: 'https://example.org/a' }),
    row({ origin: 'https://example.org/a' }),
    row({ origin: 'https://example.org/b' }),
  ];
  const kept = dedupe([], found);
  assert.equal(kept.length, 2);
  assert.deepEqual(
    kept.map((candidate) => candidate.origin),
    ['https://example.org/a', 'https://example.org/b'],
  );
});

test('dedupe keeps two rows that both carry a null file_hash', () => {
  const existing = [row({ origin: 'https://example.org/a', file_hash: null })];
  const found = [row({ origin: 'https://example.org/b', file_hash: null })];
  const kept = dedupe(existing, found);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].origin, 'https://example.org/b');
});

test('underCap returns the room left for a target', () => {
  const existing = manyRows('QUGA', 58);
  assert.equal(underCap(existing, 'QUGA'), 2);
  assert.equal(underCap(existing, 'QUAL'), 60);
});

test('underCap floors at 0 when the target is over the cap', () => {
  const existing = manyRows('QUGA', 65);
  assert.equal(underCap(existing, 'QUGA'), 0);
});

test('channelFull is true at 8 approved images', () => {
  assert.equal(channelFull({ bark: 8 }, 'bark'), true);
  assert.equal(channelFull({ bark: 9 }, 'bark'), true);
  assert.equal(channelFull({ bark: 7 }, 'bark'), false);
  assert.equal(channelFull({}, 'leaf'), false);
});

test('collect stops at the per-species cap', () => {
  const existing = manyRows('QUGA', 58);
  const found = [
    row({ origin: 'https://example.org/new/1' }),
    row({ origin: 'https://example.org/new/2' }),
    row({ origin: 'https://example.org/new/3' }),
    row({ origin: 'https://example.org/new/4' }),
    row({ origin: 'https://example.org/new/5' }),
  ];
  const result = collect({ existing, found, target: 'QUGA', approvedByChannel: {} });
  assert.equal(result.added.length, 2);
  assert.equal(result.skipped.length, 3);
  assert.deepEqual(
    result.skipped.map((entry) => entry.reason),
    ['cap', 'cap', 'cap'],
  );
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://example.org/new/1', 'https://example.org/new/2'],
  );
});

test('collect skips a hinted row whose channel is full and keeps one that is not', () => {
  const found = [
    row({ origin: 'https://example.org/bark/1', channel_hint: 'bark' }),
    row({ origin: 'https://example.org/leaf/1', channel_hint: 'leaf' }),
  ];
  const result = collect({
    existing: [],
    found,
    target: 'QUGA',
    approvedByChannel: { bark: 8, leaf: 3 },
  });
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://example.org/leaf/1'],
  );
  assert.deepEqual(result.skipped, [
    { id: found[0].id, reason: 'channel_full' },
  ]);
});

test('collect adds a row with a null hint even when every channel is full', () => {
  const found = [row({ origin: 'https://example.org/unknown/1', channel_hint: null })];
  const result = collect({
    existing: [],
    found,
    target: 'QUGA',
    approvedByChannel: { leaf: 8, bark: 8, fruit: 8, flower: 8, twig: 8 },
  });
  assert.equal(result.added.length, 1);
  assert.deepEqual(result.skipped, []);
});

test('collect reports one skipped entry per skipped row, in walk order', () => {
  const existing = [row({ origin: 'https://example.org/old/1' })];
  const found = [
    row({ origin: 'https://example.org/old/1' }),
    row({ origin: 'https://example.org/bark/1', channel_hint: 'bark' }),
    row({ origin: 'https://example.org/leaf/1', channel_hint: 'leaf' }),
  ];
  const result = collect({
    existing,
    found,
    target: 'QUGA',
    approvedByChannel: { bark: 8 },
  });
  assert.deepEqual(
    result.skipped.map((entry) => entry.reason),
    ['duplicate', 'channel_full'],
  );
  assert.deepEqual(result.skipped[0].id, found[0].id);
  assert.deepEqual(result.skipped[1].id, found[1].id);
  assert.equal(result.added.length + result.skipped.length, found.length);
});

test('collect does not change the arrays it is given', () => {
  const existing = [row({ origin: 'https://example.org/old/1' })];
  const found = [
    row({ origin: 'https://example.org/old/1' }),
    row({ origin: 'https://example.org/new/1', channel_hint: 'bark' }),
  ];
  const existingBefore = structuredClone(existing);
  const foundBefore = structuredClone(found);
  collect({ existing, found, target: 'QUGA', approvedByChannel: { bark: 8 } });
  assert.deepEqual(existing, existingBefore);
  assert.deepEqual(found, foundBefore);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/candidates_collect.test.ts`
Expected: FAIL, `SyntaxError: The requested module '../lib/candidates.ts' does not provide an export named 'CHANNEL_TARGET'`

- [ ] **Step 3: Append to the bottom of `pipeline/lib/candidates.ts`**

Task 2 wrote the first half of this file. Add the lines below after the last line of the
file. Change nothing above the append.

```ts

/** At most 60 candidates per target per run, across every source. */
export const MAX_PER_SPECIES = 60;

/** 8 approved images stop collection for a channel. */
export const CHANNEL_TARGET = 8;

/** The rows of `found` that no row in `existing`, and no earlier row in `found`, matches. */
export function dedupe(existing: Candidate[], found: Candidate[]): Candidate[] {
  const seen = newSeen(existing);
  const kept: Candidate[] = [];
  for (const candidate of found) {
    if (isDuplicate(seen, candidate)) continue;
    addSeen(seen, candidate);
    kept.push(candidate);
  }
  return kept;
}

/** How many more rows the target may take before it reaches MAX_PER_SPECIES. */
export function underCap(existing: Candidate[], target: string): number {
  const count = existing.filter((candidate) => candidate.target === target).length;
  return Math.max(0, MAX_PER_SPECIES - count);
}

/** True once the channel holds CHANNEL_TARGET approved images. */
export function channelFull(
  approvedByChannel: Record<string, number>,
  channel: string,
): boolean {
  return (approvedByChannel[channel] ?? 0) >= CHANNEL_TARGET;
}

/** Walks `found` in order and splits it into the rows the run keeps and the rows it drops. */
export function collect(input: {
  existing: Candidate[];
  found: Candidate[];
  target: string;
  approvedByChannel: Record<string, number>;
}): { added: Candidate[]; skipped: { id: string; reason: string }[] } {
  const seen = newSeen(input.existing);
  const added: Candidate[] = [];
  const skipped: { id: string; reason: string }[] = [];
  let room = underCap(input.existing, input.target);

  for (const candidate of input.found) {
    if (isDuplicate(seen, candidate)) {
      skipped.push({ id: candidate.id, reason: 'duplicate' });
      continue;
    }
    // A null hint never stops a row, because the agent assigns the channel later.
    if (candidate.channel_hint !== null && channelFull(input.approvedByChannel, candidate.channel_hint)) {
      skipped.push({ id: candidate.id, reason: 'channel_full' });
      continue;
    }
    if (room <= 0) {
      skipped.push({ id: candidate.id, reason: 'cap' });
      continue;
    }
    addSeen(seen, candidate);
    added.push(candidate);
    room -= 1;
  }

  return { added, skipped };
}

interface Seen {
  ids: Set<string>;
  origins: Set<string>;
  hashes: Set<string>;
}

function newSeen(existing: Candidate[]): Seen {
  const seen: Seen = { ids: new Set(), origins: new Set(), hashes: new Set() };
  for (const candidate of existing) addSeen(seen, candidate);
  return seen;
}

function addSeen(seen: Seen, candidate: Candidate): void {
  seen.ids.add(candidate.id);
  seen.origins.add(candidate.origin);
  if (typeof candidate.file_hash === 'string') seen.hashes.add(candidate.file_hash);
}

function isDuplicate(seen: Seen, candidate: Candidate): boolean {
  if (seen.ids.has(candidate.id)) return true;
  if (seen.origins.has(candidate.origin)) return true;
  return typeof candidate.file_hash === 'string' && seen.hashes.has(candidate.file_hash);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test pipeline/tests/candidates_collect.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 5: Run the Task 2 test to verify the append broke nothing**

Run: `node --test pipeline/tests/candidates_core.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/candidates.ts pipeline/tests/candidates_collect.test.ts && git commit -m "feat: add candidate collection, dedupe, and the caps" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: Approval, the stop rule, and owner decisions

**Files:**
- Create: `pipeline/lib/verdicts.ts`
- Test: `pipeline/tests/verdicts.test.ts`

**Interfaces:**
- Consumes: `Candidate` from `pipeline/lib/candidates.ts`. The import is type-only, so Node's
  type stripping erases the line. Task 2 owns the type.
- Produces:
  - `type VerdictKind = 'approve' | 'reject' | 'escalate'`
  - `type EscalationCase = 'mismatch' | 'license' | 'quality'`
  - `interface Verdict { candidate_id: string; verdict: VerdictKind; channel: string | null; tags: string[]; case: EscalationCase | null; note: string; checked_by: string; checked_at: string }`
  - `interface Decision { decision: 'approve' | 'reject'; channel?: string; tags?: string[]; note?: string }`
  - `const STOP_MIN_JUDGED: number` (20)
  - `const STOP_RATIO: number` (0.25)
  - `function normalizeName(name: string): string`
  - `function identityMatches(sourceSpecies: string | null, names: string[]): boolean`
  - `function pendingCandidates(candidates: Candidate[], verdicts: Verdict[]): Candidate[]`
  - `function stopRule(verdicts: Verdict[]): { fired: boolean; judged: number; escalated: number }`
  - `function decisionsToVerdicts(decisions: Record<string, Decision>, at: string): Verdict[]`
  - `function approvedVerdicts(verdicts: Verdict[]): Verdict[]`
  - `function countByChannel(verdicts: Verdict[]): Record<string, number>`

This module holds the approval bookkeeping of spec section 7. It reads and writes no files.
The `photo-check` skill and the CLI pass rows in and take rows out.

Three rules run through the module:

- The last verdict row for a candidate id wins. An owner decision arrives after the agent
  rows, so it overrides them.
- `stopRule` de-duplicates by candidate id first, then compares the ratio. The test is
  strictly greater than `STOP_RATIO`, because the spec says "more than a quarter".
- `identityMatches` returns `false` on a `null` or empty `source_species`. The script
  cannot confirm the identity, so the agent reads the source page.

`normalizeName` lower-cases the name, drops a parenthesized author, drops the hybrid sign
`×`, collapses whitespace, drops the rank markers `subsp.`, `ssp.`, `var.`, and `f.`, and
keeps at most three epithets. An abbreviated author such as `Nutt.` carries a period, and
the epithet test drops it. The three-epithet cap drops a spelled-out author that follows
the genus and the two epithets.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/verdicts.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Candidate } from '../lib/candidates.ts';
import {
  STOP_MIN_JUDGED,
  STOP_RATIO,
  normalizeName,
  identityMatches,
  pendingCandidates,
  stopRule,
  decisionsToVerdicts,
  approvedVerdicts,
  countByChannel,
} from '../lib/verdicts.ts';
import type { Verdict, VerdictKind, Decision } from '../lib/verdicts.ts';

const AT = '2026-09-22';

function verdict(id: string, kind: VerdictKind, extra: Partial<Verdict> = {}): Verdict {
  return {
    candidate_id: id,
    verdict: kind,
    channel: kind === 'approve' ? 'bark' : null,
    tags: [],
    case: kind === 'escalate' ? 'quality' : null,
    note: '',
    checked_by: 'photo_check_agent',
    checked_at: AT,
    ...extra,
  };
}

function batch(prefix: string, kind: VerdictKind, count: number): Verdict[] {
  const rows: Verdict[] = [];
  for (let i = 0; i < count; i += 1) rows.push(verdict(`${prefix}${i}`, kind));
  return rows;
}

function candidate(id: string): Candidate {
  return {
    id,
    target: 'QUGA',
    source: 'commons',
    origin: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
    file_url: `https://upload.wikimedia.org/${id}.jpg`,
    author: 'A Photographer',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    source_species: 'Quercus gambelii',
    channel_hint: 'bark',
    tags_hint: [],
    local: null,
    file_hash: null,
    fetched_at: AT,
    fetch_error: null,
  };
}

test('the stop rule fires at 20 judged with 6 escalations', () => {
  const rows = [...batch('e', 'escalate', 6), ...batch('a', 'approve', 14)];
  assert.deepEqual(stopRule(rows), { fired: true, judged: 20, escalated: 6 });
});

test('the stop rule does not fire at 20 judged with 5 escalations', () => {
  const rows = [...batch('e', 'escalate', 5), ...batch('a', 'approve', 15)];
  assert.deepEqual(stopRule(rows), { fired: false, judged: 20, escalated: 5 });
});

test('the stop rule does not fire below 20 judged', () => {
  const rows = [...batch('e', 'escalate', 10), ...batch('a', 'approve', 9)];
  assert.deepEqual(stopRule(rows), { fired: false, judged: 19, escalated: 10 });
});

test('an owner decision becomes a verdict row with checked_by owner', () => {
  const decisions: Record<string, Decision> = {
    c1: { decision: 'approve', channel: 'bark', tags: ['winter'], note: 'Trunk of the tagged tree.' },
    c2: { decision: 'reject', note: 'Two species in frame.' },
  };
  const rows = decisionsToVerdicts(decisions, AT);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    candidate_id: 'c1',
    verdict: 'approve',
    channel: 'bark',
    tags: ['winter'],
    case: null,
    note: 'Trunk of the tagged tree.',
    checked_by: 'owner',
    checked_at: AT,
  });
  assert.deepEqual(rows[1], {
    candidate_id: 'c2',
    verdict: 'reject',
    channel: null,
    tags: [],
    case: null,
    note: 'Two species in frame.',
    checked_by: 'owner',
    checked_at: AT,
  });
});

test('an owner decision overrides an earlier escalate row', () => {
  const agent = [...batch('e', 'escalate', 6), ...batch('a', 'approve', 14)];
  const owner = decisionsToVerdicts({ e0: { decision: 'approve', channel: 'leaf' } }, AT);
  const rows = [...agent, ...owner];

  assert.deepEqual(stopRule(rows), { fired: false, judged: 20, escalated: 5 });

  const approved = approvedVerdicts(rows);
  assert.equal(approved.length, 15);
  const e0 = approved.find((row) => row.candidate_id === 'e0');
  assert.ok(e0);
  assert.equal(e0.checked_by, 'owner');
  assert.equal(e0.channel, 'leaf');
});

test('pendingCandidates returns only the candidates with no row', () => {
  const candidates = [candidate('c1'), candidate('c2'), candidate('c3')];
  const rows = [verdict('c1', 'approve'), verdict('c3', 'escalate'), verdict('c3', 'reject')];
  assert.deepEqual(
    pendingCandidates(candidates, rows).map((c) => c.id),
    ['c2'],
  );
});

test('identityMatches compares normalized names', () => {
  const names = ['Quercus gambelii', 'Quercus utahensis'];
  assert.equal(identityMatches('Quercus gambelii', names), true);
  assert.equal(identityMatches('quercus GAMBELII', names), true);
  assert.equal(identityMatches('Quercus utahensis Rydb.', names), true);
  assert.equal(identityMatches('Quercus rubra', names), false);
  assert.equal(identityMatches(null, names), false);
  assert.equal(identityMatches('', names), false);
});

test('normalizeName folds case, spacing, and the author', () => {
  assert.equal(normalizeName('Quercus gambelii Nutt.'), 'quercus gambelii');
  assert.equal(normalizeName('QUERCUS GAMBELII'), 'quercus gambelii');
  assert.equal(normalizeName('Quercus  gambelii'), 'quercus gambelii');
  assert.equal(normalizeName('×Quercus gambelii'), 'quercus gambelii');
  assert.equal(normalizeName('Quercus gambelii (Nuttall)'), 'quercus gambelii');
  assert.equal(normalizeName('Quercus gambelii var. bonina'), 'quercus gambelii bonina');
  assert.equal(normalizeName('Quercus gambelii subsp. bonina'), 'quercus gambelii bonina');
});

test('countByChannel counts approved rows per channel', () => {
  const rows: Verdict[] = [
    verdict('c1', 'approve', { channel: 'bark' }),
    verdict('c2', 'approve', { channel: 'bark' }),
    verdict('c3', 'approve', { channel: 'leaf' }),
    verdict('c4', 'reject', { channel: 'leaf' }),
    verdict('c5', 'approve', { channel: null }),
  ];
  assert.deepEqual(countByChannel(rows), { bark: 2, leaf: 1 });
});

test('the stop rule constants match the spec', () => {
  assert.equal(STOP_MIN_JUDGED, 20);
  assert.equal(STOP_RATIO, 0.25);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/verdicts.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<root>\pipeline\lib\verdicts.ts' imported from <root>\pipeline\tests\verdicts.test.ts`

- [ ] **Step 3: Create `pipeline/lib/verdicts.ts`**

```ts
import type { Candidate } from './candidates.ts';

export type VerdictKind = 'approve' | 'reject' | 'escalate';
export type EscalationCase = 'mismatch' | 'license' | 'quality';

export interface Verdict {
  candidate_id: string;
  verdict: VerdictKind;
  channel: string | null;
  tags: string[];
  case: EscalationCase | null;
  note: string;
  checked_by: string;
  checked_at: string;
}

export interface Decision {
  decision: 'approve' | 'reject';
  channel?: string;
  tags?: string[];
  note?: string;
}

export const STOP_MIN_JUDGED = 20;
export const STOP_RATIO = 0.25;

const RANK_MARKERS = new Set(['subsp.', 'subsp', 'ssp.', 'ssp', 'var.', 'var', 'f.']);
const EPITHET = /^[a-z][a-z-]*$/;
const MAX_EPITHETS = 3;

/**
 * An abbreviated author carries a period, so the EPITHET test drops it.
 * The cap drops a spelled-out author after the genus and the two epithets.
 */
export function normalizeName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/×/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !RANK_MARKERS.has(token) && EPITHET.test(token))
    .slice(0, MAX_EPITHETS)
    .join(' ');
}

export function identityMatches(sourceSpecies: string | null, names: string[]): boolean {
  if (sourceSpecies === null) return false;
  const source = normalizeName(sourceSpecies);
  if (source === '') return false;
  return names.some((name) => normalizeName(name) === source);
}

/** The last row for a candidate id wins. Insertion order is first appearance. */
function lastByCandidate(verdicts: Verdict[]): Map<string, Verdict> {
  const last = new Map<string, Verdict>();
  for (const row of verdicts) last.set(row.candidate_id, row);
  return last;
}

export function pendingCandidates(candidates: Candidate[], verdicts: Verdict[]): Candidate[] {
  const judged = new Set(verdicts.map((row) => row.candidate_id));
  return candidates.filter((candidate) => !judged.has(candidate.id));
}

export function stopRule(verdicts: Verdict[]): { fired: boolean; judged: number; escalated: number } {
  const last = lastByCandidate(verdicts);
  const judged = last.size;
  let escalated = 0;
  for (const row of last.values()) {
    if (row.verdict === 'escalate') escalated += 1;
  }
  const fired = judged >= STOP_MIN_JUDGED && escalated / judged > STOP_RATIO;
  return { fired, judged, escalated };
}

export function decisionsToVerdicts(decisions: Record<string, Decision>, at: string): Verdict[] {
  return Object.keys(decisions).map((candidateId) => {
    const decision = decisions[candidateId];
    return {
      candidate_id: candidateId,
      verdict: decision.decision,
      channel: decision.channel ?? null,
      tags: decision.tags ?? [],
      case: null,
      note: decision.note ?? '',
      checked_by: 'owner',
      checked_at: at,
    };
  });
}

export function approvedVerdicts(verdicts: Verdict[]): Verdict[] {
  return [...lastByCandidate(verdicts).values()].filter((row) => row.verdict === 'approve');
}

export function countByChannel(verdicts: Verdict[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of approvedVerdicts(verdicts)) {
    if (row.channel === null) continue;
    counts[row.channel] = (counts[row.channel] ?? 0) + 1;
  }
  return counts;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test pipeline/tests/verdicts.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/verdicts.ts pipeline/tests/verdicts.test.ts && git commit -m "feat: add the verdict rules and the stop rule" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: Images, object storage, and manifest rows

**Files:**
- Create: `pipeline/lib/images.ts`
- Create: `pipeline/lib/storage.ts`
- Create: `pipeline/lib/manifest.ts`
- Test: `pipeline/tests/manifest.test.ts`

**Interfaces:**
- Consumes: `Candidate` from `pipeline/lib/candidates.ts` (Task 2), `Verdict` from `pipeline/lib/verdicts.ts` (Task 9).
- Produces:
  - `images.ts`: `MAX_SIDE: number` (1200), `JPEG_QUALITY: number` (82), `type Resize = (bytes: Uint8Array, maxSide: number, quality: number) => Promise<Uint8Array>`, `sha256Hex(bytes: Uint8Array): string`, `objectKey(hash: string): string`, `reviewKey(candidateId: string): string`.
  - `storage.ts`: `interface Storage { head(key: string): Promise<boolean>; put(key: string, bytes: Uint8Array, contentType: string): Promise<void>; remove(key: string): Promise<void> }`, `memoryStorage(): Storage & { objects: Map<string, Uint8Array>; puts: string[] }`.
  - `manifest.ts`: `interface ManifestRow`, `interface PublishDeps`, `publishApproved(input: { deps: PublishDeps; candidates: Candidate[]; verdicts: Verdict[]; rows: ManifestRow[] }): Promise<{ rows: ManifestRow[]; uploaded: string[]; skipped: string[] }>`, `retireImage(input: { storage: Storage; rows: ManifestRow[]; hash: string; reason: string; at: string }): Promise<{ rows: ManifestRow[]; retired: number }>`.

Both imports in `manifest.ts` are type-only. Task 2 owns `Candidate` and Task 9 owns `Verdict`, and Node's type stripping erases an `import type` line, so this task's test runs before those modules exist.

Section 7 of the spec sets the behaviour. `publishApproved` resizes each approved candidate, hashes the resized bytes, and uploads the object under `img/<hash>.jpg`. The hash is the whole key, so two candidates with the same bytes share one object. A manifest row is unique on `hash` plus `target` plus `channel`, so the same bytes used for two targets give two rows. `retireImage` deletes the object and marks every row that carries the hash.

The test uses a fake resizer that marks the bytes, and `memoryStorage()` in place of the bucket. No test needs `sharp` or an S3 client. Task 16 tests the real `sharp` resizer against a real JPEG.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/manifest.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import type { Candidate } from '../lib/candidates.ts';
import type { Verdict } from '../lib/verdicts.ts';
import { JPEG_QUALITY, MAX_SIDE, objectKey, reviewKey } from '../lib/images.ts';
import type { Resize } from '../lib/images.ts';
import { memoryStorage } from '../lib/storage.ts';
import { publishApproved, retireImage } from '../lib/manifest.ts';
import type { ManifestRow } from '../lib/manifest.ts';

const ROW_FIELDS = [
  'hash', 'target', 'channel', 'source', 'author',
  'license', 'origin', 'tags',
  'checked_by', 'checked_at', 'note',
];

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// The fake resizer marks the bytes. The hash below follows the same rule.
function resizedHash(text: string): string {
  return createHash('sha256').update(encode('resized:' + text)).digest('hex');
}

function cand(over: Partial<Candidate>): Candidate {
  return {
    id: 'c1',
    target: 'QUGA',
    source: 'commons',
    origin: 'https://commons.example.test/c1',
    file_url: 'https://commons.example.test/c1.jpg',
    author: 'A Photographer',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    source_species: 'Quercus gambelii',
    channel_hint: 'bark',
    tags_hint: [],
    local: 'cache/c1.jpg',
    file_hash: null,
    fetched_at: '2026-09-22T00:00:00Z',
    fetch_error: null,
    ...over,
  };
}

function verd(over: Partial<Verdict>): Verdict {
  return {
    candidate_id: 'c1',
    verdict: 'approve',
    channel: 'bark',
    tags: ['winter'],
    case: null,
    note: 'Bark fills the frame.',
    checked_by: 'photo_check_agent',
    checked_at: '2026-09-22',
    ...over,
  };
}

function harness(files: Record<string, string>) {
  const storage = memoryStorage();
  const resizeCalls: { text: string; maxSide: number; quality: number }[] = [];
  const resize: Resize = async (bytes, maxSide, quality) => {
    resizeCalls.push({ text: decode(bytes), maxSide, quality });
    return encode('resized:' + decode(bytes));
  };
  const readLocal = (path: string): Uint8Array => {
    const text = files[path];
    if (text === undefined) throw new Error(`no cached file at ${path}`);
    return encode(text);
  };
  return { storage, resizeCalls, deps: { storage, resize, readLocal } };
}

test('the object key is img/<sha256 of the resized bytes>.jpg', async () => {
  const h = harness({ 'cache/c1.jpg': 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const hash = resizedHash('alpha');
  assert.deepEqual(result.uploaded, [`img/${hash}.jpg`]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].hash, hash);
  assert.equal(objectKey(hash), `img/${hash}.jpg`);
});

test('a second run over the same verdicts uploads nothing and adds no row', async () => {
  const h = harness({ 'cache/c1.jpg': 'alpha' });
  const first = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const putsAfterFirst = h.storage.puts.length;
  const second = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: first.rows,
  });
  assert.equal(putsAfterFirst, 1);
  assert.equal(h.storage.puts.length, putsAfterFirst);
  assert.equal(second.rows.length, first.rows.length);
  assert.deepEqual(second.uploaded, []);
  assert.equal(second.skipped.length, 1);
});

test('two candidates with the same bytes and different targets give one object and two rows', async () => {
  const h = harness({ 'cache/c1.jpg': 'alpha', 'cache/c2.jpg': 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [
      cand({}),
      cand({ id: 'c2', target: 'PIPO', local: 'cache/c2.jpg' }),
    ],
    verdicts: [verd({}), verd({ candidate_id: 'c2' })],
    rows: [],
  });
  assert.equal(h.storage.objects.size, 1);
  assert.equal(h.storage.puts.length, 1);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map((r) => r.target), ['QUGA', 'PIPO']);
  assert.equal(result.rows[0].hash, result.rows[1].hash);
});

test('two candidates with the same bytes, target, and channel give one object and one row', async () => {
  const h = harness({ 'cache/c1.jpg': 'alpha', 'cache/c2.jpg': 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({}), cand({ id: 'c2', local: 'cache/c2.jpg' })],
    verdicts: [verd({}), verd({ candidate_id: 'c2' })],
    rows: [],
  });
  assert.equal(h.storage.objects.size, 1);
  assert.equal(h.storage.puts.length, 1);
  assert.equal(result.rows.length, 1);
});

test('the row shape matches the app spec', async () => {
  const h = harness({ 'cache/c1.jpg': 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const row = result.rows[0];
  assert.deepEqual(Object.keys(row), ROW_FIELDS);
  assert.equal(row.target, 'QUGA');
  assert.equal(row.channel, 'bark');
  assert.equal(row.source, 'commons');
  assert.equal(row.author, 'A Photographer');
  assert.equal(row.license, 'CC BY 4.0');
  assert.equal(row.origin, 'https://commons.example.test/c1');
  assert.deepEqual(row.tags, ['winter']);
  assert.equal(row.checked_by, 'photo_check_agent');
  assert.equal(row.checked_at, '2026-09-22');
  assert.equal(row.note, 'Bark fills the frame.');
});

test('a rejected candidate and an escalated candidate upload nothing and get no row', async () => {
  const h = harness({ 'cache/c1.jpg': 'alpha', 'cache/c2.jpg': 'beta' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({}), cand({ id: 'c2', local: 'cache/c2.jpg' })],
    verdicts: [
      verd({ verdict: 'reject', channel: null, tags: [] }),
      verd({ candidate_id: 'c2', verdict: 'escalate', case: 'quality', channel: null, tags: [] }),
    ],
    rows: [],
  });
  assert.equal(h.storage.puts.length, 0);
  assert.equal(h.storage.objects.size, 0);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.uploaded, []);
});

test('the resizer runs with MAX_SIDE 1200 and JPEG_QUALITY 82', async () => {
  // The real sharp resizer strips EXIF and keeps an original under 1200 px at its size.
  // Task 16 tests that against a real JPEG. This test only checks the arguments.
  const h = harness({ 'cache/c1.jpg': 'alpha' });
  await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  assert.equal(MAX_SIDE, 1200);
  assert.equal(JPEG_QUALITY, 82);
  assert.deepEqual(h.resizeCalls, [{ text: 'alpha', maxSide: 1200, quality: 82 }]);
});

test('a verdict whose candidate is missing throws and names the candidate id', async () => {
  const h = harness({ 'cache/c1.jpg': 'alpha' });
  await assert.rejects(
    () => publishApproved({
      deps: h.deps,
      candidates: [],
      verdicts: [verd({ candidate_id: 'ghost9' })],
      rows: [],
    }),
    /ghost9/,
  );
});

test('retireImage removes the object, keeps the row, and writes the reason and the date', async () => {
  const h = harness({ 'cache/c1.jpg': 'alpha' });
  const published = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const hash = published.rows[0].hash;
  const result = await retireImage({
    storage: h.storage,
    rows: published.rows,
    hash,
    reason: 'takedown request from the photographer',
    at: '2026-09-23',
  });
  assert.equal(h.storage.objects.has(objectKey(hash)), false);
  assert.equal(result.retired, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].hash, hash);
  assert.equal(result.rows[0].retired, true);
  assert.equal(result.rows[0].retired_reason, 'takedown request from the photographer');
  assert.equal(result.rows[0].retired_at, '2026-09-23');
});

test('two rows that share a hash both retire in one call', async () => {
  const h = harness({ 'cache/c1.jpg': 'alpha', 'cache/c2.jpg': 'alpha' });
  const published = await publishApproved({
    deps: h.deps,
    candidates: [cand({}), cand({ id: 'c2', target: 'PIPO', local: 'cache/c2.jpg' })],
    verdicts: [verd({}), verd({ candidate_id: 'c2' })],
    rows: [],
  });
  const result = await retireImage({
    storage: h.storage,
    rows: published.rows,
    hash: published.rows[0].hash,
    reason: 'takedown',
    at: '2026-09-23',
  });
  assert.equal(result.retired, 2);
  assert.deepEqual(result.rows.map((r) => r.retired), [true, true]);
});

test('retireImage on a hash no row carries returns 0 and still removes the object', async () => {
  const storage = memoryStorage();
  const removed: string[] = [];
  const watched = {
    head: storage.head,
    put: storage.put,
    remove: async (key: string) => {
      removed.push(key);
      await storage.remove(key);
    },
  };
  const rows: ManifestRow[] = [];
  const result = await retireImage({
    storage: watched,
    rows,
    hash: 'ff00',
    reason: 'takedown',
    at: '2026-09-23',
  });
  assert.equal(result.retired, 0);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(removed, ['img/ff00.jpg']);
});

test('reviewKey builds the review prefix', () => {
  assert.equal(reviewKey('abc'), 'review/abc.jpg');
});

test('memoryStorage head is false before a put and true after', async () => {
  const storage = memoryStorage();
  assert.equal(await storage.head('img/x.jpg'), false);
  await storage.put('img/x.jpg', encode('x'), 'image/jpeg');
  assert.equal(await storage.head('img/x.jpg'), true);
  assert.deepEqual(storage.puts, ['img/x.jpg']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/manifest.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\images.ts' imported from <repo>\pipeline\tests\manifest.test.ts`

- [ ] **Step 3: Create `pipeline/lib/images.ts`**

```ts
import { createHash } from 'node:crypto';

export const MAX_SIDE = 1200;
export const JPEG_QUALITY = 82;

// The real implementation wraps sharp. A test passes a fake, so no test needs sharp.
export type Resize = (bytes: Uint8Array, maxSide: number, quality: number) => Promise<Uint8Array>;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function objectKey(hash: string): string {
  return `img/${hash}.jpg`;
}

export function reviewKey(candidateId: string): string {
  return `review/${candidateId}.jpg`;
}
```

- [ ] **Step 4: Create `pipeline/lib/storage.ts`**

```ts
export interface Storage {
  head(key: string): Promise<boolean>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function memoryStorage(): Storage & { objects: Map<string, Uint8Array>; puts: string[] } {
  const objects = new Map<string, Uint8Array>();
  const puts: string[] = [];

  return {
    objects,
    puts,
    async head(key: string): Promise<boolean> {
      return objects.has(key);
    },
    async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
      // contentType is part of the interface. The fake stores the bytes only.
      void contentType;
      objects.set(key, bytes);
      puts.push(key);
    },
    async remove(key: string): Promise<void> {
      objects.delete(key);
    },
  };
}
```

- [ ] **Step 5: Run the test again to see the next missing module**

Run: `node --test pipeline/tests/manifest.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\manifest.ts' imported from <repo>\pipeline\tests\manifest.test.ts`

- [ ] **Step 6: Create `pipeline/lib/manifest.ts`**

```ts
import type { Candidate } from './candidates.ts';
import type { Verdict } from './verdicts.ts';
import { JPEG_QUALITY, MAX_SIDE, objectKey, sha256Hex } from './images.ts';
import type { Resize } from './images.ts';
import type { Storage } from './storage.ts';

export interface ManifestRow {
  hash: string;
  target: string;
  channel: string;
  source: string;
  author: string;
  license: string;
  origin: string;
  tags: string[];
  checked_by: string;
  checked_at: string;
  note: string;
  retired?: boolean;
  retired_reason?: string;
  retired_at?: string;
}

export interface PublishDeps {
  storage: Storage;
  resize: Resize;
  readLocal: (path: string) => Uint8Array;
}

export async function publishApproved(input: {
  deps: PublishDeps;
  candidates: Candidate[];
  verdicts: Verdict[];
  rows: ManifestRow[];
}): Promise<{ rows: ManifestRow[]; uploaded: string[]; skipped: string[] }> {
  const { deps } = input;
  const byId = new Map<string, Candidate>();
  for (const candidate of input.candidates) byId.set(candidate.id, candidate);

  const rows = input.rows.slice();
  const uploaded: string[] = [];
  const skipped: string[] = [];

  for (const verdict of input.verdicts) {
    if (verdict.verdict !== 'approve') continue;

    const candidate = byId.get(verdict.candidate_id);
    if (candidate === undefined) {
      throw new Error(`no candidate for approved verdict ${verdict.candidate_id}`);
    }
    if (candidate.local === null) {
      throw new Error(`candidate ${candidate.id} has no cached file`);
    }

    const original = deps.readLocal(candidate.local);
    const resized = await deps.resize(original, MAX_SIDE, JPEG_QUALITY);
    const hash = sha256Hex(resized);
    const key = objectKey(hash);

    if (await deps.storage.head(key)) {
      skipped.push(key);
    } else {
      await deps.storage.put(key, resized, 'image/jpeg');
      uploaded.push(key);
    }

    const channel = verdict.channel ?? '';
    const present = rows.some(
      (row) => row.hash === hash && row.target === candidate.target && row.channel === channel,
    );
    if (present) continue;

    // Field order is the app spec's order. A person reads the JSON diff.
    rows.push({
      hash,
      target: candidate.target,
      channel,
      source: candidate.source,
      author: candidate.author,
      license: candidate.license,
      origin: candidate.origin,
      tags: verdict.tags.slice(),
      checked_by: verdict.checked_by,
      checked_at: verdict.checked_at,
      note: verdict.note,
    });
  }

  return { rows, uploaded, skipped };
}

export async function retireImage(input: {
  storage: Storage;
  rows: ManifestRow[];
  hash: string;
  reason: string;
  at: string;
}): Promise<{ rows: ManifestRow[]; retired: number }> {
  // The object can exist without a row, so the remove runs first and always.
  await input.storage.remove(objectKey(input.hash));

  let retired = 0;
  const rows = input.rows.map((row) => {
    if (row.hash !== input.hash) return row;
    retired += 1;
    return { ...row, retired: true, retired_reason: input.reason, retired_at: input.at };
  });

  return { rows, retired };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `node --test pipeline/tests/manifest.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 8: Commit**

```bash
git add pipeline/lib/images.ts pipeline/lib/storage.ts pipeline/lib/manifest.ts pipeline/tests/manifest.test.ts && git commit -m "feat: add image publishing, object storage, and manifest rows" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 11: The append-only ID check

**Files:**
- Create: `pipeline/lib/ids.ts`
- Test: `pipeline/tests/ids.test.ts`

**Interfaces:**
- Consumes: nothing. `ContentSet` declares its own structural types, so this task imports no other pipeline module.
- Produces:
  - `interface ContentSet { species: Record<string, Record<string, unknown>>; concepts: { key: string }[]; units: { key: string }[]; manifest: { hash: string; retired?: boolean }[] }`
  - `function collectIds(content: ContentSet): string[]` returns a sorted, de-duplicated array of prefixed ids
  - `function appendOnlyErrors(previous: ContentSet | null, next: ContentSet): string[]` returns one message per lost id
  - `function readPublished(gitShow: (path: string) => string | null): ContentSet | null` returns the last published content, or `null` on the first run

Section 4 of the spec makes every id append-only. A card id such as `species:QUGA:bark` sits in a stranger's review log for months, so an id that leaves the content orphans that history. Section 11 gives the check: read the last published content with `git show main:content/species.json` and the three other files, collect every id, and fail the build when one of them is gone. A record with `retired: true` counts as present. The check is skipped on the first run, when `main` holds no content.

The spec's append-only list names bucket keys. A bucket key is an authored field on a unit, not a separate file. The check covers the ids the four content files carry, and a bucket key reaches the check through the unit record that names it. So `unit:<key>` covers it.

The prefixes are `species:<symbol>`, `variety:<key>`, `concept:<key>`, `unit:<key>`, and `image:<hash>`. An error message names the id and the file it came from, so the reader knows which file to open.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/ids.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectIds, appendOnlyErrors, readPublished } from '../lib/ids.ts';
import type { ContentSet } from '../lib/ids.ts';

function sample(): ContentSet {
  return {
    species: {
      QUGA: {
        scientific: 'Quercus gambelii',
        varieties: [{ key: 'QUGAG', name: 'Quercus gambelii var. gambelii' }],
      },
      ACGL: { scientific: 'Acer glabrum' },
    },
    concepts: [{ key: 'plated' }, { key: 'simple_lobed' }],
    units: [{ key: 'leaf_types' }, { key: 'simple_lobed_oaks_co' }],
    manifest: [{ hash: 'aaa1' }, { hash: 'bbb2' }],
  };
}

function gitShowFrom(files: Record<string, string | null>): {
  gitShow: (path: string) => string | null;
  calls: string[];
} {
  const calls: string[] = [];
  const gitShow = (path: string): string | null => {
    calls.push(path);
    return path in files ? files[path] : null;
  };
  return { gitShow, calls };
}

test('collectIds returns every kind of id, sorted', () => {
  assert.deepEqual(collectIds(sample()), [
    'concept:plated',
    'concept:simple_lobed',
    'image:aaa1',
    'image:bbb2',
    'species:ACGL',
    'species:QUGA',
    'unit:leaf_types',
    'unit:simple_lobed_oaks_co',
    'variety:QUGAG',
  ]);
});

test('a retired species and a retired manifest row still contribute their ids', () => {
  const content = sample();
  content.species.ACGL.retired = true;
  content.species.ACGL.retired_reason = 'left the pool';
  content.manifest[0].retired = true;
  const ids = collectIds(content);
  assert.equal(ids.includes('species:ACGL'), true);
  assert.equal(ids.includes('image:aaa1'), true);
});

test('appendOnlyErrors fails when a published symbol is gone, and names the symbol', () => {
  const previous = sample();
  const next = sample();
  delete next.species.QUGA;
  const errors = appendOnlyErrors(previous, next);
  assert.deepEqual(errors, [
    'species:QUGA is in the published species.json and is gone from the new content',
    'variety:QUGAG is in the published species.json and is gone from the new content',
  ]);
});

test('appendOnlyErrors passes when the symbol is still there with retired: true', () => {
  const previous = sample();
  const next = sample();
  next.species.QUGA.retired = true;
  next.species.QUGA.retired_reason = 'left the pool';
  next.species.QUGA.retired_at = '2026-09-22';
  assert.deepEqual(appendOnlyErrors(previous, next), []);
});

test('appendOnlyErrors passes when previous is null', () => {
  assert.deepEqual(appendOnlyErrors(null, sample()), []);
});

test('appendOnlyErrors gives one message per missing variety, concept, unit, and hash', () => {
  const previous = sample();
  const next = sample();
  next.species.QUGA.varieties = [];
  next.concepts = [{ key: 'plated' }];
  next.units = [{ key: 'leaf_types' }];
  next.manifest = [{ hash: 'aaa1' }];
  const errors = appendOnlyErrors(previous, next);
  assert.deepEqual(errors, [
    'concept:simple_lobed is in the published concepts.json and is gone from the new content',
    'image:bbb2 is in the published images/manifest.json and is gone from the new content',
    'unit:simple_lobed_oaks_co is in the published units.json and is gone from the new content',
    'variety:QUGAG is in the published species.json and is gone from the new content',
  ]);
  assert.equal(errors.length, 4);
});

test('adding a species, a unit, or an image is never an error', () => {
  const previous = sample();
  const next = sample();
  next.species.PIPO = { scientific: 'Pinus ponderosa' };
  next.units.push({ key: 'needle_types' });
  next.manifest.push({ hash: 'ccc3' });
  assert.deepEqual(appendOnlyErrors(previous, next), []);
});

test('readPublished returns null when gitShow returns null for content/species.json', () => {
  const { gitShow } = gitShowFrom({});
  assert.equal(readPublished(gitShow), null);
});

test('readPublished parses four files and calls gitShow with those four paths in order', () => {
  const { gitShow, calls } = gitShowFrom({
    'content/species.json': JSON.stringify({
      QUGA: { varieties: [{ key: 'QUGAG', name: 'var. gambelii' }] },
    }),
    'content/concepts.json': JSON.stringify([{ key: 'plated' }]),
    'content/units.json': JSON.stringify([{ key: 'leaf_types' }]),
    'content/images/manifest.json': JSON.stringify([{ hash: 'aaa1', retired: true }]),
  });
  const content = readPublished(gitShow);
  assert.deepEqual(calls, [
    'content/species.json',
    'content/concepts.json',
    'content/units.json',
    'content/images/manifest.json',
  ]);
  assert.notEqual(content, null);
  assert.deepEqual(collectIds(content as ContentSet), [
    'concept:plated',
    'image:aaa1',
    'species:QUGA',
    'unit:leaf_types',
    'variety:QUGAG',
  ]);
});

test('readPublished throws when a file holds text that is not JSON', () => {
  const { gitShow } = gitShowFrom({
    'content/species.json': JSON.stringify({ QUGA: {} }),
    'content/concepts.json': 'not json at all',
    'content/units.json': JSON.stringify([]),
    'content/images/manifest.json': JSON.stringify([]),
  });
  assert.throws(
    () => readPublished(gitShow),
    { message: 'content/concepts.json does not hold valid JSON' },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/ids.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\ids.ts' imported from <repo>\pipeline\tests\ids.test.ts`

- [ ] **Step 3: Create `pipeline/lib/ids.ts`**

```ts
export interface ContentSet {
  species: Record<string, Record<string, unknown>>;
  concepts: { key: string }[];
  units: { key: string }[];
  manifest: { hash: string; retired?: boolean }[];
}

const SPECIES_PATH = 'content/species.json';
const CONCEPTS_PATH = 'content/concepts.json';
const UNITS_PATH = 'content/units.json';
const MANIFEST_PATH = 'content/images/manifest.json';

// The message names the file the reader opens, not the repository path.
const FILE_OF_PREFIX: Record<string, string> = {
  species: 'species.json',
  variety: 'species.json',
  concept: 'concepts.json',
  unit: 'units.json',
  image: 'images/manifest.json',
};

export function collectIds(content: ContentSet): string[] {
  const ids = new Set<string>();

  for (const symbol of Object.keys(content.species)) {
    ids.add(`species:${symbol}`);
    const varieties = content.species[symbol].varieties;
    if (Array.isArray(varieties)) {
      for (const variety of varieties) {
        const key = (variety as { key?: unknown }).key;
        if (typeof key === 'string') ids.add(`variety:${key}`);
      }
    }
  }
  for (const concept of content.concepts) ids.add(`concept:${concept.key}`);
  for (const unit of content.units) ids.add(`unit:${unit.key}`);
  for (const row of content.manifest) ids.add(`image:${row.hash}`);

  return [...ids].sort();
}

export function appendOnlyErrors(previous: ContentSet | null, next: ContentSet): string[] {
  if (previous === null) return [];

  const present = new Set(collectIds(next));
  const errors: string[] = [];
  for (const id of collectIds(previous)) {
    if (present.has(id)) continue;
    const file = FILE_OF_PREFIX[id.split(':')[0]];
    errors.push(`${id} is in the published ${file} and is gone from the new content`);
  }
  return errors;
}

export function readPublished(gitShow: (path: string) => string | null): ContentSet | null {
  const speciesText = gitShow(SPECIES_PATH);
  if (speciesText === null) return null;

  const conceptsText = gitShow(CONCEPTS_PATH);
  const unitsText = gitShow(UNITS_PATH);
  const manifestText = gitShow(MANIFEST_PATH);

  return {
    species: readRecordMap(SPECIES_PATH, speciesText),
    concepts: readKeyedRows(CONCEPTS_PATH, conceptsText, 'key') as { key: string }[],
    units: readKeyedRows(UNITS_PATH, unitsText, 'key') as { key: string }[],
    manifest: readKeyedRows(MANIFEST_PATH, manifestText, 'hash') as {
      hash: string;
      retired?: boolean;
    }[],
  };
}

function parseFile(path: string, text: string | null): unknown {
  if (text === null) throw new Error(`${path} is missing from the published content`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} does not hold valid JSON`);
  }
}

function readRecordMap(path: string, text: string | null): Record<string, Record<string, unknown>> {
  const parsed = parseFile(path, text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} does not hold a JSON object of records`);
  }
  return parsed as Record<string, Record<string, unknown>>;
}

function readKeyedRows(path: string, text: string | null, field: string): unknown[] {
  const parsed = parseFile(path, text);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path} does not hold a JSON array of rows`);
  }
  for (const row of parsed) {
    if (row === null || typeof row !== 'object') {
      throw new Error(`${path} holds a row that is not an object`);
    }
    if (typeof (row as Record<string, unknown>)[field] !== 'string') {
      throw new Error(`${path} holds a row with no ${field}`);
    }
  }
  return parsed;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test pipeline/tests/ids.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/ids.ts pipeline/tests/ids.test.ts && git commit -m "feat: add the append-only id check" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 12: The report

**Files:**
- Create: `pipeline/lib/report.ts`
- Test: `pipeline/tests/report.test.ts`
- Fixture: `pipeline/tests/fixtures/report_run.json`
- Fixture: `pipeline/tests/fixtures/report_expected.md`

**Interfaces:**
- Consumes: nothing. This module imports no other pipeline module.
- Produces:
  - `interface ReportSpeciesRow { symbol: string; status: string; reason: string | null; counts: Record<string, number> }`
  - `interface ReportGapRow { symbol: string; channel: string; count: number }`
  - `interface ReportUnitRow { key: string; cards: number; flag: boolean }`
  - `interface ReportEscalationRow { candidate_id: string; image_url: string; origin: string; case: string; note: string; target: string }`
  - `interface ReportData { run: string; channels: string[]; species: ReportSpeciesRow[]; gaps: ReportGapRow[]; units: ReportUnitRow[]; escalations: ReportEscalationRow[]; counts: { candidates_by_source: Record<string, number>; verdicts_by_kind: Record<string, number>; fetch_failures: number; stop_rule_fired: boolean } }`
  - `const GAP_THRESHOLD: number` (4)
  - `const UNIT_MIN: number` (5)
  - `const UNIT_MAX: number` (25)
  - `const UNIT_FLAG_TEXT: string` (`outside 5 to 25`)
  - `function buildGaps(species: ReportSpeciesRow[], channels: string[]): ReportGapRow[]`
  - `function unitFlagged(row: ReportUnitRow): boolean`
  - `function renderReport(data: ReportData): string`

`renderReport` is pure. It takes one `ReportData` and returns the whole of `report.md`. It reads no clock, no disk, and no network. `cli report` gathers the data; this module only formats it.

The document starts with `# Content run: <name>`. Five `## ` parts follow, in the order section 9 gives them: Species, Channel gaps, Units, Escalations, Run counts. Every part is a table. A cell escapes a pipe as `\|`, so a note with a pipe never breaks a row.

Three rules the section leaves to this task:
- The Source cell links to the origin URL and uses the escalation's `target` as its text.
- A run-counts label is snake_case: `candidates_<source>`, `verdicts_<kind>`, then `fetch_failures` and `stop_rule_fired`. Source keys and kind keys are sorted, so the order is stable.
- `unitFlagged` decides the Units flag cell from the card count. A caller that already set `flag: true` keeps its flag.

> The fixture holds the `ReportData` shape the contract documents, with five species, three
> channels, six gap rows, three units, and two escalations. It is hand-built, not recorded.
> `report_expected.md` is the renderer's own output, checked against section 9 by eye.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/report.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  GAP_THRESHOLD,
  buildGaps,
  renderReport,
  type ReportData,
  type ReportSpeciesRow,
} from '../lib/report.ts';

const runFixture = new URL('./fixtures/report_run.json', import.meta.url);
const expectedFixture = new URL('./fixtures/report_expected.md', import.meta.url);

function makeData(over: Partial<ReportData> = {}): ReportData {
  return {
    run: 'v0-oaks',
    channels: ['leaf'],
    species: [],
    gaps: [],
    units: [],
    escalations: [],
    counts: {
      candidates_by_source: {},
      verdicts_by_kind: {},
      fetch_failures: 0,
      stop_rule_fired: false,
    },
    ...over,
  };
}

function speciesRow(
  symbol: string,
  status: string,
  counts: Record<string, number>,
): ReportSpeciesRow {
  return { symbol, status, reason: null, counts };
}

test('the fixture run renders the stored report, byte for byte', () => {
  const data = JSON.parse(fs.readFileSync(runFixture, 'utf8')) as ReportData;
  const expected = fs.readFileSync(expectedFixture, 'utf8');
  assert.equal(renderReport(data), expected);
});

test('buildGaps sorts the lowest count first and skips a dropped species', () => {
  const species: ReportSpeciesRow[] = [
    speciesRow('QUAL', 'included', { leaf: 3, bark: 1 }),
    speciesRow('QURU', 'included', { leaf: 2, bark: GAP_THRESHOLD }),
    { symbol: 'QUST', status: 'dropped', reason: 'shrub habit only', counts: { leaf: 0, bark: 0 } },
  ];

  assert.deepEqual(buildGaps(species, ['leaf', 'bark']), [
    { symbol: 'QUAL', channel: 'bark', count: 1 },
    { symbol: 'QURU', channel: 'leaf', count: 2 },
    { symbol: 'QUAL', channel: 'leaf', count: 3 },
  ]);
});

test('buildGaps counts a channel the species has no entry for as 0', () => {
  const species: ReportSpeciesRow[] = [speciesRow('QUMA2', 'no_photos', { leaf: 9 })];

  assert.deepEqual(buildGaps(species, ['leaf', 'bark', 'fruit']), [
    { symbol: 'QUMA2', channel: 'bark', count: 0 },
    { symbol: 'QUMA2', channel: 'fruit', count: 0 },
  ]);
});

test('an empty escalation list renders a sentence and no table header', () => {
  const text = renderReport(makeData());

  assert.match(text, /## Escalations\n\nNo escalations\.\n/);
  assert.equal(text.includes('| Image | Source | Case | Note |'), false);
});

test('a pipe in a note is escaped and the row keeps four cells', () => {
  const text = renderReport(
    makeData({
      escalations: [
        {
          candidate_id: 'a1b2c3',
          image_url: 'https://cdn.example.org/review/a1b2c3.jpg',
          origin: 'https://www.inaturalist.org/observations/123456',
          case: 'mismatch',
          note: 'Leaf reads Quercus rubra | not Quercus alba.',
          target: 'QUAL',
        },
      ],
    }),
  );

  const line = text.split('\n').find((l) => l.includes('Leaf reads')) as string;
  assert.ok(line.includes('rubra \\| not'));
  // Four cells give five unescaped pipes, so the split yields six pieces.
  assert.equal(line.split(/(?<!\\)\|/).length, 6);
});

test('a unit at 5 or 25 cards carries no flag, and 4 or 26 carries one', () => {
  const text = renderReport(
    makeData({
      units: [
        { key: 'leaf/four', cards: 4, flag: false },
        { key: 'leaf/five', cards: 5, flag: false },
        { key: 'leaf/twenty_five', cards: 25, flag: false },
        { key: 'leaf/twenty_six', cards: 26, flag: false },
      ],
    }),
  );

  assert.ok(text.includes('| leaf/four | 4 | outside 5 to 25 |'));
  assert.ok(text.includes('| leaf/five | 5 |  |'));
  assert.ok(text.includes('| leaf/twenty_five | 25 |  |'));
  assert.ok(text.includes('| leaf/twenty_six | 26 | outside 5 to 25 |'));
});

test('the stop rule row reads yes when it fired and no when it did not', () => {
  const fired = makeData({
    counts: {
      candidates_by_source: {},
      verdicts_by_kind: {},
      fetch_failures: 0,
      stop_rule_fired: true,
    },
  });

  assert.ok(renderReport(fired).includes('| stop_rule_fired | yes |'));
  assert.ok(renderReport(makeData()).includes('| stop_rule_fired | no |'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/report.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\report.ts' imported from <repo>\pipeline\tests\report.test.ts`

- [ ] **Step 3: Create `pipeline/tests/fixtures/report_run.json`**

Five species cover the four statuses. `QURU` and both no-photo species leave a channel out of `counts`, so the renderer and `buildGaps` both meet a missing channel. The `gaps` array is what `buildGaps` returns for these species and channels.

```json
{
  "run": "v0-oaks",
  "channels": ["leaf", "bark", "fruit"],
  "species": [
    {
      "symbol": "QUAL",
      "status": "included",
      "reason": null,
      "counts": { "leaf": 9, "bark": 6, "fruit": 3 }
    },
    {
      "symbol": "QUMA2",
      "status": "no_photos",
      "reason": null,
      "counts": {}
    },
    {
      "symbol": "QURU",
      "status": "included",
      "reason": null,
      "counts": { "leaf": 5, "bark": 2 }
    },
    {
      "symbol": "QUST",
      "status": "dropped",
      "reason": "shrub habit only",
      "counts": {}
    },
    {
      "symbol": "QUVE",
      "status": "not_authored",
      "reason": null,
      "counts": { "leaf": 4, "bark": 1 }
    }
  ],
  "gaps": [
    { "symbol": "QUMA2", "channel": "bark", "count": 0 },
    { "symbol": "QUMA2", "channel": "fruit", "count": 0 },
    { "symbol": "QUMA2", "channel": "leaf", "count": 0 },
    { "symbol": "QURU", "channel": "fruit", "count": 0 },
    { "symbol": "QURU", "channel": "bark", "count": 2 },
    { "symbol": "QUAL", "channel": "fruit", "count": 3 }
  ],
  "units": [
    { "key": "bark/plated", "cards": 12, "flag": false },
    { "key": "fruit/acorn_cap", "cards": 27, "flag": true },
    { "key": "leaf/margin_toothed", "cards": 5, "flag": false }
  ],
  "escalations": [
    {
      "candidate_id": "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      "image_url": "https://cdn.example.org/review/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678.jpg",
      "origin": "https://www.inaturalist.org/observations/123456",
      "case": "mismatch",
      "note": "Leaf reads Quercus rubra | not Quercus alba.",
      "target": "QUAL"
    },
    {
      "candidate_id": "90abcdef1234567890abcdef1234567890abcdef",
      "image_url": "https://cdn.example.org/review/90abcdef1234567890abcdef1234567890abcdef.jpg",
      "origin": "https://commons.wikimedia.org/wiki/File:Quercus_velutina_bark.jpg",
      "case": "license",
      "note": "The file page names CC BY-NC.",
      "target": "QUVE"
    }
  ],
  "counts": {
    "candidates_by_source": { "commons": 41, "inat": 63, "manual": 5, "plants": 24 },
    "verdicts_by_kind": { "approve": 58, "escalate": 2, "reject": 61 },
    "fetch_failures": 3,
    "stop_rule_fired": false
  }
}
```

- [ ] **Step 4: Create `pipeline/lib/report.ts`**

```ts
export interface ReportSpeciesRow {
  symbol: string;
  status: string;
  reason: string | null;
  counts: Record<string, number>;
}

export interface ReportGapRow {
  symbol: string;
  channel: string;
  count: number;
}

export interface ReportUnitRow {
  key: string;
  cards: number;
  flag: boolean;
}

export interface ReportEscalationRow {
  candidate_id: string;
  image_url: string;
  origin: string;
  case: string;
  note: string;
  target: string;
}

export interface ReportData {
  run: string;
  channels: string[];
  species: ReportSpeciesRow[];
  gaps: ReportGapRow[];
  units: ReportUnitRow[];
  escalations: ReportEscalationRow[];
  counts: {
    candidates_by_source: Record<string, number>;
    verdicts_by_kind: Record<string, number>;
    fetch_failures: number;
    stop_rule_fired: boolean;
  };
}

export const GAP_THRESHOLD = 4;
export const UNIT_MIN = 5;
export const UNIT_MAX = 25;
export const UNIT_FLAG_TEXT = `outside ${UNIT_MIN} to ${UNIT_MAX}`;

// A species the run dropped, or one with no authored file, has no gap to fill.
const GAP_STATUSES = ['included', 'no_photos'];

function compare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function buildGaps(species: ReportSpeciesRow[], channels: string[]): ReportGapRow[] {
  const gaps: ReportGapRow[] = [];
  for (const row of species) {
    if (!GAP_STATUSES.includes(row.status)) continue;
    for (const channel of channels) {
      const count = row.counts[channel] ?? 0;
      if (count < GAP_THRESHOLD) gaps.push({ symbol: row.symbol, channel, count });
    }
  }
  gaps.sort(
    (a, b) =>
      a.count - b.count || compare(a.symbol, b.symbol) || compare(a.channel, b.channel),
  );
  return gaps;
}

export function unitFlagged(row: ReportUnitRow): boolean {
  return row.flag || row.cards < UNIT_MIN || row.cards > UNIT_MAX;
}

// A pipe inside a cell ends the cell, so a note with one breaks the table.
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function tableRow(cells: string[]): string {
  return `| ${cells.map(escapeCell).join(' | ')} |`;
}

function table(headers: string[], rows: string[][]): string[] {
  const lines = [tableRow(headers), `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(tableRow(row));
  return lines;
}

function speciesTable(data: ReportData): string[] {
  const headers = ['Symbol', 'Status', 'Reason', ...data.channels];
  const rows = data.species.map((row) => [
    row.symbol,
    row.status,
    row.reason ?? '',
    ...data.channels.map((channel) => String(row.counts[channel] ?? 0)),
  ]);
  return table(headers, rows);
}

function countRows(data: ReportData): string[][] {
  const rows: string[][] = [];
  const bySource = data.counts.candidates_by_source;
  for (const source of Object.keys(bySource).sort()) {
    rows.push([`candidates_${source}`, String(bySource[source])]);
  }
  const byKind = data.counts.verdicts_by_kind;
  for (const kind of Object.keys(byKind).sort()) {
    rows.push([`verdicts_${kind}`, String(byKind[kind])]);
  }
  rows.push(['fetch_failures', String(data.counts.fetch_failures)]);
  rows.push(['stop_rule_fired', data.counts.stop_rule_fired ? 'yes' : 'no']);
  return rows;
}

export function renderReport(data: ReportData): string {
  const out: string[] = [`# Content run: ${data.run}`, ''];

  out.push('## Species', '');
  out.push(...speciesTable(data));
  out.push('');

  out.push('## Channel gaps', '');
  out.push(
    ...table(
      ['Symbol', 'Channel', 'Approved'],
      data.gaps.map((gap) => [gap.symbol, gap.channel, String(gap.count)]),
    ),
  );
  out.push('');

  out.push('## Units', '');
  out.push(
    ...table(
      ['Unit', 'Cards', 'Flag'],
      data.units.map((unit) => [
        unit.key,
        String(unit.cards),
        unitFlagged(unit) ? UNIT_FLAG_TEXT : '',
      ]),
    ),
  );
  out.push('');

  out.push('## Escalations', '');
  if (data.escalations.length === 0) {
    out.push('No escalations.');
  } else {
    out.push(
      ...table(
        ['Image', 'Source', 'Case', 'Note'],
        data.escalations.map((row) => [
          `![](${row.image_url})`,
          `[${row.target}](${row.origin})`,
          row.case,
          row.note,
        ]),
      ),
    );
  }
  out.push('');

  out.push('## Run counts', '');
  out.push(...table(['Count', 'Value'], countRows(data)));

  return `${out.join('\n')}\n`;
}
```

- [ ] **Step 5: Create `pipeline/tests/fixtures/report_expected.md`**

This is the renderer's output for the fixture above. Test 1 compares it byte for byte, so
write it with the Write tool exactly as it stands. Every line ends with a single `\n`, the
file ends with one newline, and two cells are empty in the Units table, which gives `|  |`.

```markdown
# Content run: v0-oaks

## Species

| Symbol | Status | Reason | leaf | bark | fruit |
| --- | --- | --- | --- | --- | --- |
| QUAL | included |  | 9 | 6 | 3 |
| QUMA2 | no_photos |  | 0 | 0 | 0 |
| QURU | included |  | 5 | 2 | 0 |
| QUST | dropped | shrub habit only | 0 | 0 | 0 |
| QUVE | not_authored |  | 4 | 1 | 0 |

## Channel gaps

| Symbol | Channel | Approved |
| --- | --- | --- |
| QUMA2 | bark | 0 |
| QUMA2 | fruit | 0 |
| QUMA2 | leaf | 0 |
| QURU | fruit | 0 |
| QURU | bark | 2 |
| QUAL | fruit | 3 |

## Units

| Unit | Cards | Flag |
| --- | --- | --- |
| bark/plated | 12 |  |
| fruit/acorn_cap | 27 | outside 5 to 25 |
| leaf/margin_toothed | 5 |  |

## Escalations

| Image | Source | Case | Note |
| --- | --- | --- | --- |
| ![](https://cdn.example.org/review/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678.jpg) | [QUAL](https://www.inaturalist.org/observations/123456) | mismatch | Leaf reads Quercus rubra \| not Quercus alba. |
| ![](https://cdn.example.org/review/90abcdef1234567890abcdef1234567890abcdef.jpg) | [QUVE](https://commons.wikimedia.org/wiki/File:Quercus_velutina_bark.jpg) | license | The file page names CC BY-NC. |

## Run counts

| Count | Value |
| --- | --- |
| candidates_commons | 41 |
| candidates_inat | 63 |
| candidates_manual | 5 |
| candidates_plants | 24 |
| verdicts_approve | 58 |
| verdicts_escalate | 2 |
| verdicts_reject | 61 |
| fetch_failures | 3 |
| stop_rule_fired | no |
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test pipeline/tests/report.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/report.ts pipeline/tests/report.test.ts pipeline/tests/fixtures/report_run.json pipeline/tests/fixtures/report_expected.md && git commit -m "feat: render the run report" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 13: The run scope, the CLI skeleton, and the fetch commands

**Files:**
- Create: `pipeline/lib/run.ts`
- Create: `pipeline/lib/stub_validator.ts`
- Create: `pipeline/cli.ts`
- Create: `pipeline/tests/fixtures/plants_profile_quun.json`
- Test: `pipeline/tests/run.test.ts`
- Test: `pipeline/tests/cli_fetch.test.ts`

**Interfaces:**
- Consumes:
  - `pipeline/lib/jsonl.ts`: `readJsonl<T>(path)`, `appendJsonl(path, rows)`.
  - `pipeline/lib/candidates.ts`: `makeCandidate(fields)`, `collect({ existing, found, target, approvedByChannel })`, type `Candidate`.
  - `pipeline/lib/plants.ts`: `CHECKLIST_URL`, `DISTRIBUTION_URL`, `profileUrl(symbol)`, `imagesUrl(plantsId)`, `parseChecklist(body)`, `acceptedSymbols(rows, genera)`, `fetchProfile(http, symbol)`, `fetchDistribution(http, plantsId)`, `fetchImages(http, plantsId)`, `plantsCandidates(images, target, scientific, plantsId, now)`, type `PlantsProfile`.
  - `pipeline/lib/commons.ts`: `categoryUrl(category, token)`, `parseCategoryListing(json)`, `commonsCandidates(files, target, scientific, now)`.
  - `pipeline/lib/inat.ts`: `INAT_API`, `PHENOLOGY_TERM_ID`, `FRUITING_VALUE_ID`, `inatPasses(floweringValueId)`, `taxaUrl(scientific)`, `observationsUrl(taxonId, page, pass)`, `parseTaxon(json)`, `parseObservations(json)`, `inatCandidates(photos, target, pass, now)`, `loadInatTerms(path)`, type `InatPass`.
  - `pipeline/lib/fna.ts`: `SECTION_PAGES`, `buildSectionTable(pages)`.
  - `pipeline/lib/species.ts`: `enumerateRun({ rows, genera, states, include, profiles, distribution })`.
  - `pipeline/lib/verdicts.ts`: `approvedVerdicts(verdicts)`, `countByChannel(verdicts)`, type `Verdict`.
  - `pipeline/lib/images.ts`: `sha256Hex(bytes)`, type `Resize`.
  - `pipeline/lib/storage.ts`: type `Storage`, `memoryStorage()` in the test.
  - `pipeline/lib/http.ts`: type `Http`, and `createHttp` in the `main` guard only.
- Produces:
  - `pipeline/lib/run.ts`: `interface RunScope { name: string; bucket: string | null; concepts: string[]; concept_exemplars: Record<string, string[]>; states: string[]; genera: string[]; include: string[]; channels: string[]; created_at: string; species: string[]; dropped: { symbol: string; reason: string }[] }`, `type Exec = (command: string, args: string[]) => { code: number; out: string }`, `parseFlags(argv: string[]): Record<string, string>`, `newScope(name: string, flags: Record<string, string>, createdAt: string): RunScope`, `runDir(root: string, name: string): string`, `readRun(root: string, name: string): RunScope`, `writeRun(root: string, scope: RunScope): void`, `gitCheckoutBranch(exec: Exec, name: string): void`, `gitCommitAll(exec: Exec, message: string): void`, `openPullRequest(exec: Exec, name: string, bodyPath: string): void`.
  - `pipeline/lib/stub_validator.ts`: `interface ValidationMessage { file: string; message: string }`, `interface ValidationResult { errors: ValidationMessage[]; warnings: ValidationMessage[] }`, `stubValidate(raw: unknown): ValidationResult`.
  - `pipeline/cli.ts`: `interface CliDeps { root: string; exec: Exec; http: Http; storage: Storage; resize: Resize; validate: (raw: unknown) => { errors: { file: string; message: string }[]; warnings: { file: string; message: string }[] }; now: () => Date }`, `runCommand(argv: string[], deps: CliDeps): Promise<number>`.

Two changes to the contract, both small. `newScope` takes `createdAt` as a third parameter, so
it stays pure and the caller owns the clock. `RunScope` gains `concept_exemplars`, a map from a
concept key to the exemplar species that a concept run looks photos up by; section 8 of the spec
says a concept run's `run.json` lists them, and `photos fetch` reads them.

The dispatch table names every command of the surface. The six that Task 14 owns (`build`,
`report`, `run pr`, `run finish`, `images retire`, `ids check`) print `not implemented yet: <command>`
and return 1, so the usage text is complete from the first commit.

- [ ] **Step 1: Write the failing test for the run scope**

`pipeline/tests/run.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseFlags,
  newScope,
  runDir,
  readRun,
  writeRun,
  gitCheckoutBranch,
  gitCommitAll,
  openPullRequest,
  type Exec,
} from '../lib/run.ts';
import { stubValidate } from '../lib/stub_validator.ts';

const CREATED_AT = '2026-09-22T15:04:00Z';

interface ExecCall {
  command: string;
  args: string[];
}

/** Records every call. `queue` holds the results the next calls return, in order. */
function fakeExec(): Exec & { calls: ExecCall[]; queue: { code: number; out: string }[] } {
  const calls: ExecCall[] = [];
  const queue: { code: number; out: string }[] = [];
  const exec = (command: string, args: string[]): { code: number; out: string } => {
    calls.push({ command, args });
    return queue.shift() ?? { code: 0, out: '' };
  };
  return Object.assign(exec, { calls, queue });
}

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

test('parseFlags reads a value flag, a bare flag, and a hyphenated key', () => {
  const flags = parseFlags([
    '--target',
    'QUGA',
    '--refresh',
    '--file-url',
    'https://example.org/a.jpg',
    '--local',
  ]);
  assert.deepEqual(flags, {
    target: 'QUGA',
    refresh: 'true',
    'file-url': 'https://example.org/a.jpg',
    local: 'true',
  });
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
});

test('newScope rejects both --bucket and --concepts, and neither', () => {
  assert.throws(
    () => newScope('both', { bucket: 'simple_lobed', concepts: 'bark/plated', channels: 'bark' }, CREATED_AT),
    (error: Error) => error.message.includes('--bucket') && error.message.includes('--concepts'),
  );
  assert.throws(
    () => newScope('neither', { channels: 'bark' }, CREATED_AT),
    (error: Error) => error.message.includes('--bucket') && error.message.includes('--concepts'),
  );
});

test('newScope requires --channels', () => {
  assert.throws(
    () => newScope('no_channels', { bucket: 'simple_lobed' }, CREATED_AT),
    /--channels/,
  );
});

test('writeRun then readRun round-trips the scope', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const scope = newScope('simple_lobed_co', scopeFlags(), CREATED_AT);
  scope.species = ['QUGA'];
  scope.dropped = [{ symbol: 'QUUN', reason: 'hybrid' }];
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

  assert.throws(() => readRun(root, 'absent'), /run absent does not exist\. Run "cli run init absent" first\./);
});

test('gitCheckoutBranch branches content/<name> off main', () => {
  const exec = fakeExec();
  gitCheckoutBranch(exec, 'simple_lobed_co');
  assert.deepEqual(exec.calls, [
    { command: 'git', args: ['checkout', '-b', 'content/simple_lobed_co', 'main'] },
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

test('stubValidate errors on an unknown edge and warns on a small unit', () => {
  const result = stubValidate({
    species: { QUGA: { concepts: { leaf_shape: 'simple_lobed' } } },
    concepts: [{ key: 'simple_lobed' }],
    units: [{ key: 'simple_lobed' }],
    confusion: [{ a: 'QUGA', b: 'QUMA' }],
    manifest: [{ hash: 'a1', target: 'QUGA' }],
  });
  assert.ok(result.errors.some((row) => row.message.includes('QUMA')));
  assert.ok(result.errors.every((row) => !row.message.includes('QUGA')));
  assert.ok(result.warnings.some((row) => row.message.includes('simple_lobed')));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/run.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\pipeline\lib\run.ts' imported from ...\pipeline\tests\run.test.ts`

- [ ] **Step 3: Create `pipeline/lib/run.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';

export interface RunScope {
  name: string;
  bucket: string | null;
  concepts: string[];
  /** Concept key to the exemplar species the photo lookup uses. Empty on a bucket run. */
  concept_exemplars: Record<string, string[]>;
  states: string[];
  genera: string[];
  include: string[];
  channels: string[];
  created_at: string;
  species: string[];
  dropped: { symbol: string; reason: string }[];
}

export type Exec = (command: string, args: string[]) => { code: number; out: string };

const CO_AUTHOR = 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>';

/**
 * `--key value` gives `{ key: 'value' }`. A bare `--flag` gives `{ flag: 'true' }`.
 * A key keeps its hyphens, so `--file-url` is the key `file-url`.
 */
export function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === '') continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = 'true';
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return flags;
}

/** The caller passes `createdAt`, so this function stays pure. */
export function newScope(
  name: string,
  flags: Record<string, string>,
  createdAt: string,
): RunScope {
  const hasBucket = flags.bucket !== undefined;
  const hasConcepts = flags.concepts !== undefined;
  if (hasBucket && hasConcepts) {
    throw new Error('--bucket and --concepts are exclusive. Give one of them, not both.');
  }
  if (!hasBucket && !hasConcepts) {
    throw new Error('run init needs --bucket or --concepts. Give one of them.');
  }
  const channels = csv(flags.channels);
  if (channels.length === 0) {
    throw new Error('run init needs --channels with at least one channel.');
  }
  return {
    name,
    bucket: flags.bucket ?? null,
    concepts: csv(flags.concepts),
    concept_exemplars: {},
    states: csv(flags.states),
    genera: csv(flags.genera),
    include: csv(flags.include),
    channels,
    created_at: createdAt,
    species: [],
    dropped: [],
  };
}

export function runDir(root: string, name: string): string {
  return path.join(root, 'pipeline', 'runs', name);
}

export function readRun(root: string, name: string): RunScope {
  const file = path.join(runDir(root, name), 'run.json');
  if (!fs.existsSync(file)) {
    throw new Error(`run ${name} does not exist. Run "cli run init ${name}" first.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as RunScope;
}

export function writeRun(root: string, scope: RunScope): void {
  const dir = runDir(root, scope.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run.json'), `${JSON.stringify(scope, null, 2)}\n`, 'utf8');
}

export function gitCheckoutBranch(exec: Exec, name: string): void {
  mustRun(exec, 'git', ['checkout', '-b', `content/${name}`, 'main']);
}

export function gitCommitAll(exec: Exec, message: string): void {
  mustRun(exec, 'git', ['add', '-A']);
  const result = exec('git', ['commit', '-m', message, '-m', CO_AUTHOR]);
  if (result.code === 0) return;
  // git exits non-zero on a clean tree. A step that changed nothing is not a failure.
  if (result.out.includes('nothing to commit')) return;
  throw new Error(`git commit failed with code ${result.code}: ${result.out}`);
}

export function openPullRequest(exec: Exec, name: string, bodyPath: string): void {
  mustRun(exec, 'gh', [
    'pr',
    'create',
    '--draft',
    '--title',
    `content: ${name}`,
    '--body-file',
    bodyPath,
  ]);
}

function csv(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function mustRun(exec: Exec, command: string, args: string[]): string {
  const result = exec(command, args);
  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with code ${result.code}: ${result.out}`,
    );
  }
  return result.out;
}
```

- [ ] **Step 4: Create `pipeline/lib/stub_validator.ts`**

```ts
// A stand-in for the app's content validator until the app branch merges. It checks only
// the shape the pipeline itself writes. Task 17 deletes this file and imports
// validateContent from app/logic/content.js in its place.

export interface ValidationMessage {
  file: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
}

const SPECIES_FILE = 'content/species.json';
const CONCEPTS_FILE = 'content/concepts.json';
const UNITS_FILE = 'content/units.json';
const CONFUSION_FILE = 'content/confusion.json';
const MANIFEST_FILE = 'content/images/manifest.json';

const MIN_CARDS = 5;
const MAX_CARDS = 25;

export function stubValidate(raw: unknown): ValidationResult {
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];

  if (!isRecord(raw)) {
    errors.push({ file: 'content/', message: 'the content set is not an object.' });
    return { errors, warnings };
  }

  const species = isRecord(raw.species) ? raw.species : null;
  if (species === null) {
    errors.push({ file: SPECIES_FILE, message: 'species is not an object.' });
  }
  arrayOf(raw.concepts, CONCEPTS_FILE, 'concepts', errors);
  const units = arrayOf(raw.units, UNITS_FILE, 'units', errors);
  const confusion = arrayOf(raw.confusion, CONFUSION_FILE, 'confusion', errors);
  const manifest = arrayOf(raw.manifest, MANIFEST_FILE, 'manifest', errors);

  const named = new Set<string>();
  for (const edge of confusion) {
    for (const side of ['a', 'b']) {
      const symbol = edge[side];
      if (typeof symbol === 'string') named.add(symbol);
      if (species === null) continue;
      if (typeof symbol !== 'string' || !(symbol in species)) {
        errors.push({
          file: CONFUSION_FILE,
          message: `confusion edge ${side} is ${String(symbol)}, which species.json does not hold.`,
        });
      }
    }
  }

  if (species !== null) {
    for (const [symbol, record] of Object.entries(species)) {
      if (isRecord(record) && record.retired === true) continue;
      const hasImage = manifest.some(
        (row) => row.target === symbol && row.retired !== true,
      );
      if (hasImage || named.has(symbol)) continue;
      errors.push({
        file: SPECIES_FILE,
        message: `${symbol} has no manifest row and no confusion edge.`,
      });
    }
  }

  for (const unit of units) {
    const key = unit.key;
    if (typeof key !== 'string') {
      errors.push({ file: UNITS_FILE, message: 'a unit has no key.' });
      continue;
    }
    const cards = cardCount(species, key);
    if (cards === null) continue;
    if (cards < MIN_CARDS || cards > MAX_CARDS) {
      warnings.push({
        file: UNITS_FILE,
        message: `unit ${key} holds ${cards} cards, outside ${MIN_CARDS} to ${MAX_CARDS}.`,
      });
    }
  }

  return { errors, warnings };
}

/**
 * The count is the number of species whose `concepts` name the unit key. The app computes
 * membership from states, genera, section, include, and exclude, so this is an
 * approximation. When no species record carries a `concepts` object the count is not
 * computable here, and the caller warns nothing.
 */
function cardCount(species: Record<string, unknown> | null, key: string): number | null {
  if (species === null) return null;
  let sawConcepts = false;
  let count = 0;
  for (const record of Object.values(species)) {
    if (!isRecord(record)) continue;
    const concepts = record.concepts;
    if (!isRecord(concepts)) continue;
    sawConcepts = true;
    if (Object.values(concepts).includes(key)) count += 1;
  }
  return sawConcepts ? count : null;
}

function arrayOf(
  value: unknown,
  file: string,
  name: string,
  errors: ValidationMessage[],
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    errors.push({ file, message: `${name} is not an array.` });
    return [];
  }
  return value.filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test pipeline/tests/run.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 6: Create the hybrid profile fixture**

The fixture holds the fields section 3 documents, trimmed to the rows the test reads.
Task 19 replaces it with a recorded response after the first live fetch.

`pipeline/tests/fixtures/plants_profile_quun.json`:

```json
{
  "Id": 25298,
  "Symbol": "QUUN",
  "ScientificName": "<i>Quercus</i> <i>×undulata</i> Torr.",
  "CommonName": "wavyleaf oak",
  "Rank": "Species",
  "GrowthHabits": ["Tree", "Shrub"],
  "NativeStatuses": [{ "Region": "L48", "NativeStatus": "N" }],
  "AncestorRanks": [
    { "Rank": "Family", "ScientificName": "Fagaceae" },
    { "Rank": "Genus", "ScientificName": "<i>Quercus</i>" }
  ]
}
```

- [ ] **Step 7: Write the failing test for the commands**

`pipeline/tests/cli_fetch.test.ts`:

```ts
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCommand, type CliDeps } from '../cli.ts';
import type { Candidate } from '../lib/candidates.ts';
import { categoryUrl, parseCategoryListing } from '../lib/commons.ts';
import { SECTION_PAGES } from '../lib/fna.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
import { inatPasses, observationsUrl, taxaUrl } from '../lib/inat.ts';
import { readJsonl } from '../lib/jsonl.ts';
import { CHECKLIST_URL, DISTRIBUTION_URL, imagesUrl, profileUrl } from '../lib/plants.ts';
import { newScope, readRun, runDir, writeRun, type Exec, type RunScope } from '../lib/run.ts';
import { memoryStorage } from '../lib/storage.ts';
import { stubValidate } from '../lib/stub_validator.ts';

const NOW = '2026-09-22T15:04:00Z';
const SCIENTIFIC = 'Quercus gambelii';
const QUGA_ID = 25297;
const QUUN_ID = 25298;
const INAT_TAXON_ID = 47851;
const FLOWERING_VALUE_ID = 13;

interface Route {
  status?: number;
  body?: string;
  bytes?: Uint8Array;
}

interface ExecCall {
  command: string;
  args: string[];
}

function fixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function jpeg(seed: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, seed]);
}

function fakeExec(): Exec & { calls: ExecCall[]; queue: { code: number; out: string }[] } {
  const calls: ExecCall[] = [];
  const queue: { code: number; out: string }[] = [];
  const exec = (command: string, args: string[]): { code: number; out: string } => {
    calls.push({ command, args });
    return queue.shift() ?? { code: 0, out: '' };
  };
  return Object.assign(exec, { calls, queue });
}

/**
 * A hand-written Http over a route map. It skips the cache and the limiter, which the
 * http tests already cover. A POST keys on the url and the body together, because every
 * distribution call goes to one url.
 */
function fakeHttp(routes: Map<string, Route>): Http & { urls: string[] } {
  const urls: string[] = [];
  const failures: HttpFailure[] = [];

  function fail(url: string, status: number, message: string): void {
    failures.push({ url, status, message, at: NOW });
  }

  function text(key: string, url: string): TextResult {
    const route = routes.get(key);
    if (route === undefined || route.body === undefined) {
      fail(url, 0, 'the fake has no route for this url');
      return { ok: false, status: 0, body: '', from_cache: false, error: 'no route' };
    }
    const status = route.status ?? 200;
    if (status >= 400) {
      fail(url, status, `status ${status}`);
      return { ok: false, status, body: '', from_cache: false, error: `status ${status}` };
    }
    return { ok: true, status, body: route.body, from_cache: false, error: null };
  }

  return {
    failures,
    urls,
    async getText(url: string): Promise<TextResult> {
      urls.push(url);
      return text(url, url);
    },
    async postJson(url: string, body: unknown): Promise<TextResult> {
      const key = `${url} ${JSON.stringify(body)}`;
      urls.push(key);
      return text(key, url);
    },
    async getBytes(url: string): Promise<BytesResult> {
      urls.push(url);
      const route = routes.get(url);
      const status = route?.status ?? (route === undefined ? 0 : 200);
      if (route === undefined || route.bytes === undefined || status >= 400) {
        fail(url, status, `no bytes, status ${status}`);
        return { ok: false, status, bytes: null, from_cache: false, error: `status ${status}` };
      }
      return { ok: true, status, bytes: route.bytes, from_cache: false, error: null };
    },
  };
}

function checklistRoutes(): Map<string, Route> {
  const routes = new Map<string, Route>();
  routes.set(CHECKLIST_URL, { body: fixture('plantlst_sample.txt') });
  routes.set(profileUrl('QUGA'), { body: fixture('plants_profile_quga.json') });
  routes.set(profileUrl('QUUN'), { body: fixture('plants_profile_quun.json') });
  routes.set(`${DISTRIBUTION_URL} {"MasterId":${QUGA_ID}}`, {
    body: fixture('plants_distribution_quga.csv'),
  });
  routes.set(`${DISTRIBUTION_URL} {"MasterId":${QUUN_ID}}`, {
    body: 'Symbol,Country,State,State FIP,County,County FIP\n',
  });
  return routes;
}

function photoRoutes(): Map<string, Route> {
  const routes = new Map<string, Route>();
  routes.set(profileUrl('QUGA'), { body: fixture('plants_profile_quga.json') });
  routes.set(imagesUrl(QUGA_ID), { body: fixture('plants_images_quga.json') });

  const page1 = fixture('commons_category_quga.json');
  routes.set(categoryUrl(SCIENTIFIC, null), { body: page1 });
  const token = parseCategoryListing(JSON.parse(page1)).next;
  routes.set(categoryUrl(SCIENTIFIC, token), { body: fixture('commons_category_quga_page2.json') });

  routes.set(taxaUrl(SCIENTIFIC), { body: fixture('inat_taxa_quga.json') });
  for (const pass of inatPasses(FLOWERING_VALUE_ID)) {
    routes.set(observationsUrl(INAT_TAXON_ID, 1, pass), {
      body: fixture('inat_observations_quga.json'),
    });
  }

  const files = [
    'https://plants.sc.egov.usda.gov/ImageLibrary/original/quga_001_lvp.jpg',
    'https://plants.sc.egov.usda.gov/ImageLibrary/original/quga_002_bkp.jpg',
    'https://plants.sc.egov.usda.gov/ImageLibrary/original/quga_003_hbp.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Quercus_gambelii_acorn.jpg/1280px-Quercus_gambelii_acorn.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Quercus_gambelii_bark.jpg/1280px-Quercus_gambelii_bark.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/4/44/Quercus_gambelii_habit.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Quercus_gambelii_in_autumn.jpg/1280px-Quercus_gambelii_in_autumn.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Quercus_gambelii_leaf_detail.jpg/1280px-Quercus_gambelii_leaf_detail.jpg',
    'https://inaturalist-open-data.s3.amazonaws.com/photos/999001/original.jpg',
    'https://inaturalist-open-data.s3.amazonaws.com/photos/999005/original.jpeg',
  ];
  files.forEach((url, index) => routes.set(url, { bytes: jpeg(index) }));
  return routes;
}

function sectionRoutes(): Map<string, Route> {
  const routes = new Map<string, Route>();
  routes.set(SECTION_PAGES[0].url, { body: fixture('fna_lobatae.html') });
  routes.set(SECTION_PAGES[1].url, { body: fixture('fna_quercus.html') });
  routes.set(SECTION_PAGES[2].url, { body: fixture('fna_protobalanus.html') });
  return routes;
}

function setup(t: TestContext, routes: Map<string, Route> = new Map()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...args: unknown[]): void => {
    out.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]): void => {
    err.push(args.map(String).join(' '));
  };
  t.after(() => {
    console.log = log;
    console.error = error;
  });

  const exec = fakeExec();
  const http = fakeHttp(routes);
  const deps: CliDeps = {
    root,
    exec,
    http,
    storage: memoryStorage(),
    resize: async (bytes) => bytes,
    validate: stubValidate,
    now: () => new Date(NOW),
  };
  return { root, deps, exec, http, out, err };
}

function seedRun(root: string, flags: Record<string, string>, fill: (scope: RunScope) => void): void {
  const scope = newScope('demo', flags, NOW);
  fill(scope);
  writeRun(root, scope);
}

function seedInatTerms(root: string): void {
  const file = path.join(root, 'pipeline', 'data', 'inat_terms.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `{\n  "flowering_value_id": ${FLOWERING_VALUE_ID}\n}\n`, 'utf8');
}

function candidatesOf(root: string): Candidate[] {
  return readJsonl<Candidate>(path.join(runDir(root, 'demo'), 'candidates.jsonl'));
}

test('no argument prints the usage block and fails', async (t) => {
  const { deps, err } = setup(t);
  assert.equal(await runCommand([], deps), 1);
  const usage = err.join('\n');
  for (const command of [
    'run init',
    'species list',
    'photos fetch',
    'photos add',
    'build',
    'report',
    'run pr',
    'run finish',
    'images retire',
    'data sections',
    'data inat-terms',
    'ids check',
  ]) {
    assert.ok(usage.includes(command), `the usage block names ${command}`);
  }
});

test('an unknown command fails', async (t) => {
  const { deps, err } = setup(t);
  assert.equal(await runCommand(['frobnicate'], deps), 1);
  assert.ok(err.join('\n').includes('usage:'));
});

test('a Task 14 command says it is not implemented yet', async (t) => {
  const { deps, err } = setup(t);
  assert.equal(await runCommand(['build', 'demo'], deps), 1);
  assert.equal(await runCommand(['run', 'pr', 'demo'], deps), 1);
  assert.deepEqual(err, ['not implemented yet: build', 'not implemented yet: run pr']);
});

test('run init writes the scope and branches off main', async (t) => {
  const { root, deps, exec, out } = setup(t);
  const code = await runCommand(
    [
      'run',
      'init',
      'demo',
      '--bucket',
      'simple_lobed',
      '--states',
      'CO,UT',
      '--genera',
      'Quercus',
      '--include',
      'QUGA',
      '--channels',
      'leaf,bark',
    ],
    deps,
  );
  assert.equal(code, 0);

  const scope = readRun(root, 'demo');
  assert.equal(scope.bucket, 'simple_lobed');
  assert.deepEqual(scope.states, ['CO', 'UT']);
  assert.deepEqual(scope.genera, ['Quercus']);
  assert.deepEqual(scope.include, ['QUGA']);
  assert.deepEqual(scope.channels, ['leaf', 'bark']);
  assert.equal(scope.created_at, NOW);
  assert.deepEqual(exec.calls, [
    { command: 'git', args: ['checkout', '-b', 'content/demo', 'main'] },
  ]);
  assert.ok(out.join('\n').includes('content/demo'));
});

test('run init on an existing run resumes without a second branch', async (t) => {
  const { root, deps, exec, out } = setup(t);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});

  const code = await runCommand(['run', 'init', 'demo', '--bucket', 'other', '--channels', 'bark'], deps);
  assert.equal(code, 0);
  assert.deepEqual(out, ['run demo already exists']);
  assert.deepEqual(exec.calls, []);
  assert.equal(readRun(root, 'demo').bucket, 'simple_lobed');
});

test('run init --concepts writes a concept scope with no bucket', async (t) => {
  const { root, deps } = setup(t);
  const code = await runCommand(
    ['run', 'init', 'demo', '--concepts', 'bark/plated, leaf/lobed', '--channels', 'bark,leaf'],
    deps,
  );
  assert.equal(code, 0);

  const scope = readRun(root, 'demo');
  assert.equal(scope.bucket, null);
  assert.deepEqual(scope.concepts, ['bark/plated', 'leaf/lobed']);
  assert.deepEqual(scope.concept_exemplars, {});
  assert.deepEqual(scope.species, []);
});

test('species list enumerates the checklist and commits the result', async (t) => {
  const { root, deps, exec, out } = setup(t, checklistRoutes());
  seedRun(root, { bucket: 'simple_lobed', states: 'CO', genera: 'Quercus', channels: 'leaf' }, () => {});

  assert.equal(await runCommand(['species', 'list', 'demo'], deps), 0);

  const scope = readRun(root, 'demo');
  assert.deepEqual(scope.species, ['QUGA']);
  assert.deepEqual(scope.dropped, [{ symbol: 'QUUN', reason: 'hybrid' }]);
  assert.deepEqual(exec.calls[0], { command: 'git', args: ['add', '-A'] });
  assert.equal(exec.calls[1].args[2], 'content(demo): species list');
  assert.deepEqual(out, ['1 species kept, 1 dropped']);
});

test('species list stops on an unknown symbol in include', async (t) => {
  const { root, deps, exec, err } = setup(t, checklistRoutes());
  seedRun(
    root,
    { bucket: 'simple_lobed', states: 'CO', genera: 'Quercus', include: 'QUZZ', channels: 'leaf' },
    () => {},
  );

  assert.equal(await runCommand(['species', 'list', 'demo'], deps), 1);
  assert.deepEqual(err, ['unknown PLANTS symbol in include: QUZZ']);
  assert.deepEqual(exec.calls, []);
});

test('species list writes plants_ids.json', async (t) => {
  const { root, deps } = setup(t, checklistRoutes());
  seedRun(root, { bucket: 'simple_lobed', states: 'CO', genera: 'Quercus', channels: 'leaf' }, () => {});

  assert.equal(await runCommand(['species', 'list', 'demo'], deps), 0);

  const file = path.join(root, 'pipeline', 'data', 'plants_ids.json');
  const text = fs.readFileSync(file, 'utf8');
  assert.deepEqual(JSON.parse(text), { QUGA: QUGA_ID, QUUN: QUUN_ID });
  assert.ok(text.endsWith('}\n'));
});

test('photos fetch appends candidates with their bytes and commits', async (t) => {
  const { root, deps, exec } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const rows = candidatesOf(root);
  assert.equal(rows.length, 10);
  assert.deepEqual(
    [...new Set(rows.map((row) => row.source))].sort(),
    ['commons', 'inat', 'plants'],
  );
  for (const row of rows) {
    assert.equal(row.target, 'QUGA');
    assert.equal(row.fetch_error, null);
    assert.equal(row.fetched_at, NOW);
    assert.ok(row.file_hash !== null && row.file_hash.length === 64);
    assert.ok(row.local !== null && row.local.startsWith(`pipeline/cache/${row.source}/`));
    assert.ok(fs.existsSync(path.join(root, row.local)));
  }
  assert.equal(exec.calls[1].args[2], 'content(demo): photo candidates');
});

test('photos fetch records a failed download and keeps the row', async (t) => {
  const routes = photoRoutes();
  const failing = 'https://plants.sc.egov.usda.gov/ImageLibrary/original/quga_001_lvp.jpg';
  routes.set(failing, { status: 404 });
  const { root, deps } = setup(t, routes);
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const rows = candidatesOf(root);
  assert.equal(rows.length, 10);
  const plants = rows.filter((row) => row.source === 'plants');
  assert.equal(plants.length, 3);
  assert.equal(plants[0].local, null);
  assert.equal(plants[0].file_hash, null);
  assert.equal(plants[0].fetch_error, 'status 404');
  assert.equal(plants[1].fetch_error, null);
  assert.ok(plants[1].local !== null);
});

test('photos add appends one manual row and names a missing flag', async (t) => {
  const { root, deps, err } = setup(t);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});

  const full = [
    'photos',
    'add',
    'demo',
    '--target',
    'QUGA',
    '--origin',
    'https://www.fs.usda.gov/database/feis/quga.html',
    '--file-url',
    'https://www.fs.usda.gov/images/quga_bark.jpg',
    '--author',
    'US Forest Service',
    '--license',
    'US government work',
    '--channel-hint',
    'bark',
    '--local',
    'pipeline/cache/manual/quga_bark.jpg',
  ];
  assert.equal(await runCommand(full, deps), 0);

  const rows = candidatesOf(root);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'manual');
  assert.equal(rows[0].target, 'QUGA');
  assert.equal(rows[0].channel_hint, 'bark');
  assert.equal(rows[0].license_url, null);
  assert.equal(rows[0].local, 'pipeline/cache/manual/quga_bark.jpg');
  assert.equal(rows[0].fetched_at, NOW);

  const short = full.filter((word, index) => index < full.indexOf('--author'));
  assert.equal(await runCommand(short, deps), 1);
  assert.deepEqual(err, ['photos add needs --author']);
  assert.equal(candidatesOf(root).length, 1);
});

test('data sections writes the oak section table and prints the row count', async (t) => {
  const { root, deps, out } = setup(t, sectionRoutes());

  assert.equal(await runCommand(['data', 'sections'], deps), 0);

  const file = path.join(root, 'pipeline', 'data', 'quercus_sections.json');
  const table = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  assert.equal(Object.keys(table).length, 11);
  assert.equal(table['Quercus gambelii'], 'Quercus');
  assert.equal(table['Quercus rubra'], 'Lobatae');
  assert.equal(table['Quercus chrysolepis'], 'Protobalanus');
  assert.deepEqual(out, ['11 rows written to pipeline/data/quercus_sections.json']);
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\pipeline\cli.ts' imported from ...\pipeline\tests\cli_fetch.test.ts`

- [ ] **Step 9: Create `pipeline/cli.ts`**

```ts
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { collect, makeCandidate, type Candidate } from './lib/candidates.ts';
import { categoryUrl, commonsCandidates, parseCategoryListing } from './lib/commons.ts';
import { SECTION_PAGES, buildSectionTable } from './lib/fna.ts';
import type { Http } from './lib/http.ts';
import { sha256Hex, type Resize } from './lib/images.ts';
import {
  FRUITING_VALUE_ID,
  INAT_API,
  PHENOLOGY_TERM_ID,
  inatCandidates,
  inatPasses,
  loadInatTerms,
  observationsUrl,
  parseObservations,
  parseTaxon,
  taxaUrl,
  type InatPass,
} from './lib/inat.ts';
import { appendJsonl, readJsonl } from './lib/jsonl.ts';
import {
  CHECKLIST_URL,
  acceptedSymbols,
  fetchDistribution,
  fetchImages,
  fetchProfile,
  parseChecklist,
  plantsCandidates,
  type PlantsProfile,
} from './lib/plants.ts';
import {
  gitCheckoutBranch,
  gitCommitAll,
  newScope,
  parseFlags,
  readRun,
  runDir,
  writeRun,
  type Exec,
  type RunScope,
} from './lib/run.ts';
import { enumerateRun } from './lib/species.ts';
import type { Storage } from './lib/storage.ts';
import { stubValidate } from './lib/stub_validator.ts';
import { approvedVerdicts, countByChannel, type Verdict } from './lib/verdicts.ts';

export interface CliDeps {
  root: string;
  exec: Exec;
  http: Http;
  storage: Storage;
  resize: Resize;
  validate: (raw: unknown) => {
    errors: { file: string; message: string }[];
    warnings: { file: string; message: string }[];
  };
  now: () => Date;
}

type Handler = (rest: string[], deps: CliDeps) => Promise<number>;

const USAGE = `usage: node pipeline/cli.ts <command> [flags]

  run init <name> --bucket <b> --states <csv> --genera <csv> --include <csv> --channels <csv>
  run init <name> --concepts <csv> --channels <csv>
  species list <name>
  photos fetch <name>
  photos add <name> --target <t> --origin <url> --file-url <url> --author <a> --license <l> [--license-url <u>] [--source-species <s>] [--channel-hint <c>] [--local <path>]
  build <name>
  report <name>
  run pr <name>
  run finish <name>
  images retire <hash> --reason "<text>"
  data sections
  data inat-terms
  ids check

--refresh works on every command and bypasses the cache for that command.`;

/** A first word that takes a second word. Every other command is one word. */
const GROUPS: Set<string> = new Set(['run', 'species', 'photos', 'data', 'images', 'ids']);

const ADD_REQUIRED: string[] = ['target', 'origin', 'file-url', 'author', 'license'];

const MAX_COMMONS_PAGES = 4;
const MAX_INAT_PAGES = 4;
const INAT_PER_PAGE = 50;

const INAT_TERMS_URL =
  `${INAT_API}/observations?term_id=${PHENOLOGY_TERM_ID}&per_page=1&photos=true&quality_grade=research`;

export async function runCommand(argv: string[], deps: CliDeps): Promise<number> {
  const key = commandKey(argv);
  const handler = key === null ? undefined : COMMANDS[key];
  if (key === null || handler === undefined) {
    console.error(USAGE);
    return 1;
  }
  const rest = GROUPS.has(argv[0]) ? argv.slice(2) : argv.slice(1);
  try {
    return await handler(rest, deps);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function runInit(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'run init <name> --bucket <b> --channels <csv>');
  const file = path.join(runDir(deps.root, name), 'run.json');
  if (fs.existsSync(file)) {
    // A stopped run resumes with the same command, so this is not a failure.
    console.log(`run ${name} already exists`);
    return 0;
  }
  const scope = newScope(name, parseFlags(rest.slice(1)), isoNow(deps));
  writeRun(deps.root, scope);
  gitCheckoutBranch(deps.exec, name);
  console.log(`run ${name} created on branch content/${name}`);
  return 0;
}

async function speciesList(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'species list <name>');
  const scope = readRun(deps.root, name);

  const checklist = await deps.http.getText(CHECKLIST_URL);
  if (!checklist.ok) {
    console.error(`the PLANTS checklist fetch failed: ${checklist.error ?? checklist.status}`);
    return 1;
  }
  const rows = parseChecklist(checklist.body);

  const known = new Set(rows.map((row) => row.symbol));
  for (const symbol of scope.include) {
    // Spec section 11: an unknown symbol in include stops the run.
    if (!known.has(symbol)) {
      console.error(`unknown PLANTS symbol in include: ${symbol}`);
      return 1;
    }
  }

  const wanted = [...new Set([...acceptedSymbols(rows, scope.genera), ...scope.include])].sort();
  const profiles: Record<string, PlantsProfile> = {};
  const distribution: Record<string, string[]> = {};
  for (const symbol of wanted) {
    const profile = await fetchProfile(deps.http, symbol);
    if (profile === null) continue;
    profiles[symbol] = profile;
    distribution[symbol] = await fetchDistribution(deps.http, profile.plants_id);
  }

  const enumerated = enumerateRun({
    rows,
    genera: scope.genera,
    states: scope.states,
    include: scope.include,
    profiles,
    distribution,
  });
  scope.species = enumerated.kept;
  scope.dropped = enumerated.dropped;
  writeRun(deps.root, scope);
  writePlantsIds(deps.root, profiles);
  gitCommitAll(deps.exec, `content(${name}): species list`);
  console.log(`${enumerated.kept.length} species kept, ${enumerated.dropped.length} dropped`);
  return 0;
}

async function photosFetch(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'photos fetch <name>');
  const scope = readRun(deps.root, name);
  const now = isoNow(deps);
  const dir = runDir(deps.root, name);
  const candidatesPath = path.join(dir, 'candidates.jsonl');

  const verdicts = readJsonl<Verdict>(path.join(dir, 'verdicts.jsonl'));
  const approvedByChannel = countByChannel(approvedVerdicts(verdicts));
  const terms = loadInatTerms(path.join(deps.root, 'pipeline', 'data', 'inat_terms.json'));
  const passes = inatPasses(terms.flowering_value_id);

  let existing = readJsonl<Candidate>(candidatesPath);
  const appended: Candidate[] = [];
  let failures = 0;

  for (const target of targetsOf(scope)) {
    const found: Candidate[] = [];
    for (const symbol of target.lookups) {
      const profile = await fetchProfile(deps.http, symbol);
      if (profile === null) continue;
      found.push(...(await plantsRows(deps.http, profile, symbol, now)));
      found.push(...(await commonsRows(deps.http, profile.scientific, symbol, now)));
      found.push(...(await inatRows(deps.http, profile.scientific, symbol, passes, now)));
    }
    const collected = collect({
      existing,
      found: retarget(found, target.key),
      target: target.key,
      approvedByChannel,
    });
    for (const row of collected.added) {
      await download(deps, row);
      if (row.fetch_error !== null) failures += 1;
    }
    existing = existing.concat(collected.added);
    appended.push(...collected.added);
  }

  appendJsonl(candidatesPath, appended);
  gitCommitAll(deps.exec, `content(${name}): photo candidates`);
  console.log(
    `${appended.length} candidates appended to ${relative(deps.root, candidatesPath)}, ${failures} download failures`,
  );
  return 0;
}

async function photosAdd(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'photos add <name> --target <t> --origin <url>');
  readRun(deps.root, name);
  const flags = parseFlags(rest.slice(1));
  for (const key of ADD_REQUIRED) {
    const value = flags[key];
    if (value === undefined || value === 'true') {
      console.error(`photos add needs --${key}`);
      return 1;
    }
  }
  const row = makeCandidate({
    target: flags.target,
    source: 'manual',
    origin: flags.origin,
    file_url: flags['file-url'],
    author: flags.author,
    license: flags.license,
    license_url: flags['license-url'] ?? null,
    source_species: flags['source-species'] ?? null,
    channel_hint: flags['channel-hint'] ?? null,
    local: flags.local ?? null,
    fetched_at: isoNow(deps),
  });
  appendJsonl(path.join(runDir(deps.root, name), 'candidates.jsonl'), [row]);
  console.log(`manual candidate ${row.id} added for ${row.target}`);
  return 0;
}

async function dataSections(_rest: string[], deps: CliDeps): Promise<number> {
  const pages: { section: string; html: string }[] = [];
  for (const page of SECTION_PAGES) {
    const result = await deps.http.getText(page.url);
    if (!result.ok) {
      console.error(
        `the FNA page for section ${page.section} failed: ${result.error ?? result.status}`,
      );
      return 1;
    }
    pages.push({ section: page.section, html: result.body });
  }
  const table = sortKeys(buildSectionTable(pages));
  const file = path.join(deps.root, 'pipeline', 'data', 'quercus_sections.json');
  writeJson(file, table);
  console.log(`${Object.keys(table).length} rows written to ${relative(deps.root, file)}`);
  return 0;
}

async function dataInatTerms(_rest: string[], deps: CliDeps): Promise<number> {
  const result = await deps.http.getText(INAT_TERMS_URL);
  if (!result.ok) {
    console.error(`the iNat observation fetch failed: ${result.error ?? result.status}`);
    return 1;
  }
  const first = asRecord(asList(asRecord(parseJson(result.body)).results)[0]);
  let flowering: number | null = null;
  for (const raw of asList(first.annotations)) {
    const row = asRecord(raw);
    if (row.controlled_attribute_id !== PHENOLOGY_TERM_ID) continue;
    const value = row.controlled_value_id;
    if (typeof value !== 'number' || value === FRUITING_VALUE_ID) continue;
    flowering = value;
    break;
  }
  if (flowering === null) {
    console.error(
      'no phenology annotation came back. Set flowering_value_id by hand in pipeline/data/inat_terms.json.',
    );
    return 1;
  }
  const file = path.join(deps.root, 'pipeline', 'data', 'inat_terms.json');
  writeJson(file, { flowering_value_id: flowering });
  console.log(`flowering_value_id is ${flowering}`);
  return 0;
}

function notYet(name: string): Handler {
  return async () => {
    console.error(`not implemented yet: ${name}`);
    return 1;
  };
}

// Every command of the surface is named here. Task 14 replaces the last six.
const COMMANDS: Record<string, Handler> = {
  'run init': runInit,
  'species list': speciesList,
  'photos fetch': photosFetch,
  'photos add': photosAdd,
  'data sections': dataSections,
  'data inat-terms': dataInatTerms,
  build: notYet('build'),
  report: notYet('report'),
  'run pr': notYet('run pr'),
  'run finish': notYet('run finish'),
  'images retire': notYet('images retire'),
  'ids check': notYet('ids check'),
};

function commandKey(argv: string[]): string | null {
  const first = argv[0];
  if (first === undefined || first.startsWith('--')) return null;
  if (!GROUPS.has(first)) return first;
  const second = argv[1];
  if (second === undefined || second.startsWith('--')) return null;
  return `${first} ${second}`;
}

/** A bucket run targets each species. A concept run targets the key and looks up the exemplars. */
function targetsOf(scope: RunScope): { key: string; lookups: string[] }[] {
  if (scope.concepts.length > 0) {
    return scope.concepts.map((key) => ({
      key,
      lookups: scope.concept_exemplars[key] ?? [],
    }));
  }
  return scope.species.map((symbol) => ({ key: symbol, lookups: [symbol] }));
}

/** The origin of a row stays the exemplar's page. Only the target moves to the concept key. */
function retarget(rows: Candidate[], target: string): Candidate[] {
  return rows.map((row) => (row.target === target ? row : { ...row, target }));
}

async function plantsRows(
  http: Http,
  profile: PlantsProfile,
  symbol: string,
  now: string,
): Promise<Candidate[]> {
  const images = await fetchImages(http, profile.plants_id);
  return plantsCandidates(images, symbol, profile.scientific, profile.plants_id, now);
}

async function commonsRows(
  http: Http,
  scientific: string,
  target: string,
  now: string,
): Promise<Candidate[]> {
  const rows: Candidate[] = [];
  let token: string | null = null;
  for (let page = 0; page < MAX_COMMONS_PAGES; page += 1) {
    const result = await http.getText(categoryUrl(scientific, token));
    if (!result.ok) break;
    const listing = parseCategoryListing(parseJson(result.body));
    rows.push(...commonsCandidates(listing.files, target, scientific, now));
    if (listing.next === null) break;
    token = listing.next;
  }
  return rows;
}

async function inatRows(
  http: Http,
  scientific: string,
  target: string,
  passes: InatPass[],
  now: string,
): Promise<Candidate[]> {
  const taxonResult = await http.getText(taxaUrl(scientific));
  if (!taxonResult.ok) return [];
  const taxon = parseTaxon(parseJson(taxonResult.body));
  if (taxon === null) return [];

  const rows: Candidate[] = [];
  for (const pass of passes) {
    for (let page = 1; page <= MAX_INAT_PAGES; page += 1) {
      const result = await http.getText(observationsUrl(taxon.id, page, pass));
      if (!result.ok) break;
      const json = parseJson(result.body);
      rows.push(...inatCandidates(parseObservations(json), target, pass, now));
      if (!isFullPage(json)) break;
    }
  }
  return rows;
}

/** iNat fills a page to `per_page`. A short page is the last one. */
function isFullPage(json: unknown): boolean {
  const root = asRecord(json);
  const results = Array.isArray(root.results) ? root.results.length : 0;
  const perPage = typeof root.per_page === 'number' ? root.per_page : INAT_PER_PAGE;
  return results >= perPage;
}

async function download(deps: CliDeps, row: Candidate): Promise<void> {
  const result = await deps.http.getBytes(row.file_url);
  if (!result.ok || result.bytes === null) {
    // The row is still appended, so the report counts the failure and a later run retries.
    row.fetch_error = result.error ?? `status ${result.status}`;
    return;
  }
  const hash = sha256Hex(result.bytes);
  const file = path.join(deps.root, 'pipeline', 'cache', row.source, `${hash}.jpg`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, result.bytes);
  row.local = relative(deps.root, file);
  row.file_hash = hash;
}

function writePlantsIds(root: string, profiles: Record<string, PlantsProfile>): void {
  const file = path.join(root, 'pipeline', 'data', 'plants_ids.json');
  const ids: Record<string, number> = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, number>)
    : {};
  for (const [symbol, profile] of Object.entries(profiles)) ids[symbol] = profile.plants_id;
  writeJson(file, sortKeys(ids));
}

function sortKeys<T>(table: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(table).sort()) sorted[key] = table[key];
  return sorted;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

function positional(rest: string[], usage: string): string {
  const value = rest[0];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`usage: node pipeline/cli.ts ${usage}`);
  }
  return value;
}

function isoNow(deps: CliDeps): string {
  return deps.now().toISOString().replace(/\.\d+Z$/, 'Z');
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const nodeExec: Exec = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.error !== undefined) {
    return { code: 1, out: `${out} ${result.error.message}`.trim() };
  }
  return { code: result.status ?? 1, out };
};

// sharp and the S3 client load on first use, so a command that needs neither runs
// without them installed.
const lazyResize: Resize = async (bytes, maxSide, quality) => {
  const { sharpResize } = await import('./lib/sharp_resizer.ts');
  return sharpResize(bytes, maxSide, quality);
};

function lazyStorage(): Storage {
  let real: Storage | null = null;
  const load = async (): Promise<Storage> => {
    if (real === null) {
      const { s3Storage, s3ConfigFromEnv } = await import('./lib/s3_storage.ts');
      real = s3Storage(s3ConfigFromEnv(process.env));
    }
    return real;
  };
  return {
    async head(key) {
      return (await load()).head(key);
    },
    async put(key, bytes, contentType) {
      return (await load()).put(key, bytes, contentType);
    },
    async remove(key) {
      return (await load()).remove(key);
    },
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const root = process.cwd();
  // --refresh belongs to the Http, not to a command. The guard reads it from process.argv
  // and passes it to createHttp, so every command gets a cache that honours the flag.
  const refresh = argv.includes('--refresh');
  const { createHttp } = await import('./lib/http.ts');
  const http = createHttp({ cache_dir: path.join(root, 'pipeline', 'cache'), refresh });
  process.exitCode = await runCommand(argv, {
    root,
    exec: nodeExec,
    http,
    storage: lazyStorage(),
    resize: lazyResize,
    validate: stubValidate,
    now: () => new Date(),
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 11: Run the whole suite**

Run: `node --test "pipeline/tests/**/*.test.ts"`
Expected: PASS, 171 tests

- [ ] **Step 12: Commit**

```bash
git add pipeline/cli.ts pipeline/lib/run.ts pipeline/lib/stub_validator.ts pipeline/tests/run.test.ts pipeline/tests/cli_fetch.test.ts pipeline/tests/fixtures/plants_profile_quun.json && git commit -m "feat: add the run scope, the CLI, and the fetch commands" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 14: The build, the report, and the pull request

**Files:**
- Modify: `pipeline/cli.ts`
- Modify: `pipeline/lib/storage.ts` (one append)
- Modify: `pipeline/tests/cli_fetch.test.ts` (two small edits, step 6)
- Test: `pipeline/tests/cli_build.test.ts`

**Interfaces:**
- Consumes: `readRun`, `runDir`, `gitCommitAll`, `openPullRequest`, `parseFlags`, `type Exec`,
  `type RunScope` from `run.ts`; `readJsonl`, `appendJsonl` from `jsonl.ts`; `type Candidate` from
  `candidates.ts`; `approvedVerdicts`, `countByChannel`, `decisionsToVerdicts`, `stopRule`,
  `type Decision`, `type Verdict` from `verdicts.ts`; `publishApproved`, `retireImage`,
  `type ManifestRow` from `manifest.ts`; `MAX_SIDE`, `JPEG_QUALITY`, `reviewKey`,
  `type Resize` from `images.ts`; `memoryStorage`, `type Storage` from `storage.ts`;
  `appendOnlyErrors`, `readPublished`, `type ContentSet` from `ids.ts`; `buildGaps`,
  `renderReport`, `UNIT_MIN`, `UNIT_MAX`, `UNIT_FLAG_TEXT`, `type ReportData`,
  `type ReportSpeciesRow`, `type ReportUnitRow`, `type ReportEscalationRow` from `report.ts`;
  `buildFetched`, `mergeSpecies`, `readAuthored`, `speciesStatus`, `validateAuthored`,
  `type SpeciesRecord` from `species.ts`; `fetchProfile`, `fetchSubordinateTaxa`,
  `fetchDistribution` from `plants.ts`; `loadSectionTable`, `sectionFor` from `fna.ts`;
  `taxaUrl`, `parseTaxon` from `inat.ts`; `stubValidate` from `stub_validator.ts`.
- Produces:
  - `pipeline/lib/storage.ts`: `export function deferredStorage(inner: Storage): Storage & { flush(): Promise<void>; pending: string[] }`
  - `pipeline/cli.ts`: `export interface CliDeps` gains `cdn_base: string`;
    `export function runCommand(argv: string[], deps: CliDeps): Promise<number>` is unchanged
    and now dispatches all twelve commands. `build <name>` and `ids check` each take an
    optional `--base <ref>`, the git ref that holds the published content. It defaults to
    `main`.

Task 13 left six commands returning `not implemented yet`. This task writes them. Three
contract additions carry the task:

1. `CliDeps` gains `cdn_base`, the object storage base URL, ending in a slash. `cli report`
   links each escalated image through it. Task 17 wires it to the app's `CDN_BASE`.
2. `storage.ts` gains `deferredStorage`. It holds every `put` in memory until `flush`.
   Spec section 11 says a build that fails validation writes nothing to `content/` and
   uploads nothing, so `cli build` works in memory and uploads last.
3. `cli build` and `cli ids check` read the last published content with
   `git show <ref>:content/...`. The `--base <ref>` flag names that ref, because GitHub
   Actions checks out a pull request without a local `main`, and the CI step of Task 18
   passes `origin/main`. Without the flag the ref is `main`.

- [ ] **Step 1: Append `deferredStorage` to `pipeline/lib/storage.ts`**

Append the block below to the end of the file. Nothing above it changes.

```ts

/**
 * Holds every put in memory until `flush`. `cli build` validates before it uploads, so a
 * build that fails sends nothing to the bucket.
 */
export function deferredStorage(
  inner: Storage,
): Storage & { flush(): Promise<void>; pending: string[] } {
  const queue: { key: string; bytes: Uint8Array; contentType: string }[] = [];
  const pending: string[] = [];

  return {
    pending,
    async head(key: string): Promise<boolean> {
      if (await inner.head(key)) return true;
      // A second approval of the same bytes in one build must not queue a second put.
      return pending.includes(key);
    },
    async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
      queue.push({ key, bytes, contentType });
      pending.push(key);
    },
    async remove(key: string): Promise<void> {
      await inner.remove(key);
    },
    async flush(): Promise<void> {
      for (const item of queue) await inner.put(item.key, item.bytes, item.contentType);
      queue.length = 0;
      pending.length = 0;
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

The `Route`, `ExecCall`, `fakeExec` and `fakeHttp` shapes are copies of the ones in
`pipeline/tests/cli_fetch.test.ts`. A test file stays readable on its own, so nothing is
imported across test files. `fakeExec` answers `git show main:<path>` from a map that
`fakeGitShow` fills, and answers every other command from a queue. The fixtures are the
ones Tasks 3 and 5 already wrote.

`pipeline/tests/cli_build.test.ts`:

```ts
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCommand, type CliDeps } from '../cli.ts';
import { makeCandidate, type Candidate } from '../lib/candidates.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
import type { Resize } from '../lib/images.ts';
import { taxaUrl } from '../lib/inat.ts';
import { readJsonl, writeJsonl } from '../lib/jsonl.ts';
import type { ManifestRow } from '../lib/manifest.ts';
import { DISTRIBUTION_URL, profileUrl, subordinateTaxaUrl } from '../lib/plants.ts';
import { newScope, runDir, writeRun, type Exec } from '../lib/run.ts';
import type { ReportData } from '../lib/report.ts';
import { deferredStorage, memoryStorage } from '../lib/storage.ts';
import { stubValidate, type ValidationResult } from '../lib/stub_validator.ts';
import type { Verdict } from '../lib/verdicts.ts';

// The Route, ExecCall, fakeExec and fakeHttp shapes are copies of the ones in
// cli_fetch.test.ts. A test file stays readable on its own, so nothing is imported
// across test files.

const NOW = '2026-09-22T15:04:00Z';
const TODAY = '2026-09-22';
const SCIENTIFIC = 'Quercus gambelii';
const QUGA_ID = 25297;
const CDN = 'https://images.dendro.test/';

const CONCEPTS = [{ key: 'simple_lobed' }, { key: 'furrowed' }, { key: 'acorn' }];
const UNITS = [{ key: 'simple_lobed' }, { key: 'furrowed' }];

const AUTHORED = {
  concepts: { leaf: 'simple_lobed', bark: 'furrowed', fruit: 'acorn' },
  common_extra: ['Rocky Mountain white oak'],
  range: { text: 'Colorado Plateau and southern Rockies' },
  elevation_ft: [5000, 9000],
  height_ft: [15, 30],
  habitat: 'Dry slopes and foothills with pinyon and juniper',
  ref: ['FNA vol. 3, Quercus gambelii'],
};

const LEAF = makeCandidate({
  target: 'QUGA',
  source: 'commons',
  origin: 'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_leaf.jpg',
  file_url: 'https://upload.wikimedia.org/wikipedia/commons/8/88/Quercus_gambelii_leaf.jpg',
  author: 'A Hiker',
  license: 'CC BY-SA 4.0',
  local: 'pipeline/cache/commons/leaf.jpg',
  fetched_at: NOW,
});

const BARK = makeCandidate({
  target: 'QUGA',
  source: 'plants',
  origin: 'https://plants.usda.gov/plant-profile/QUGA/images/25297',
  file_url: 'https://plants.sc.egov.usda.gov/ImageLibrary/original/quga_002_bkp.jpg',
  author: 'USDA NRCS',
  license: 'US government work',
  local: 'pipeline/cache/plants/bark.jpg',
  fetched_at: NOW,
});

const MYSTERY = makeCandidate({
  target: 'QUGA',
  source: 'inat',
  origin: 'https://www.inaturalist.org/observations/999001',
  file_url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/999001/original.jpg',
  author: 'observer_one',
  license: 'CC BY 4.0',
  source_species: 'Quercus turbinella',
  local: 'pipeline/cache/inat/mystery.jpg',
  fetched_at: NOW,
});

const CANDIDATES: Candidate[] = [LEAF, BARK, MYSTERY];

const VERDICTS: Verdict[] = [
  verdict(LEAF.id, 'approve', { channel: 'leaf', tags: ['summer'], note: 'Leaf fills the frame.' }),
  verdict(BARK.id, 'approve', { channel: 'bark', note: 'Bark is sharp.' }),
  verdict(MYSTERY.id, 'escalate', {
    case: 'mismatch',
    note: 'The source page names Quercus turbinella.',
  }),
];

interface Route {
  status?: number;
  body?: string;
  bytes?: Uint8Array;
}

interface ExecCall {
  command: string;
  args: string[];
}

type FakeExec = Exec & {
  calls: ExecCall[];
  queue: { code: number; out: string }[];
  shows: Map<string, string>;
};

function verdict(
  id: string,
  kind: Verdict['verdict'],
  extra: Partial<Verdict> = {},
): Verdict {
  return {
    candidate_id: id,
    verdict: kind,
    channel: null,
    tags: [],
    case: null,
    note: '',
    checked_by: 'photo_check_agent',
    checked_at: TODAY,
    ...extra,
  };
}

function fixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

/** `git show main:<path>` answers from a map. Every other command answers from the queue. */
function fakeExec(): FakeExec {
  const calls: ExecCall[] = [];
  const queue: { code: number; out: string }[] = [];
  const shows = new Map<string, string>();
  const exec = (command: string, args: string[]): { code: number; out: string } => {
    calls.push({ command, args });
    if (command === 'git' && args[0] === 'show') {
      const text = shows.get(args[1]);
      if (text === undefined) return { code: 128, out: `fatal: path ${args[1]} does not exist` };
      return { code: 0, out: text };
    }
    return queue.shift() ?? { code: 0, out: '' };
  };
  return Object.assign(exec, { calls, queue, shows });
}

/** Seeds what `git show main:content/...` returns, so the append-only check has a past. */
function fakeGitShow(
  exec: FakeExec,
  content: {
    species?: Record<string, unknown>;
    concepts?: unknown[];
    units?: unknown[];
    manifest?: unknown[];
  },
): void {
  exec.shows.set('main:content/species.json', JSON.stringify(content.species ?? {}));
  exec.shows.set('main:content/concepts.json', JSON.stringify(content.concepts ?? CONCEPTS));
  exec.shows.set('main:content/units.json', JSON.stringify(content.units ?? UNITS));
  exec.shows.set('main:content/images/manifest.json', JSON.stringify(content.manifest ?? []));
}

function fakeHttp(routes: Map<string, Route>): Http & { urls: string[] } {
  const urls: string[] = [];
  const failures: HttpFailure[] = [];

  function text(key: string, url: string): TextResult {
    const route = routes.get(key);
    if (route === undefined || route.body === undefined) {
      failures.push({ url, status: 0, message: 'the fake has no route for this url', at: NOW });
      return { ok: false, status: 0, body: '', from_cache: false, error: 'no route' };
    }
    const status = route.status ?? 200;
    if (status >= 400) {
      return { ok: false, status, body: '', from_cache: false, error: `status ${status}` };
    }
    return { ok: true, status, body: route.body, from_cache: false, error: null };
  }

  return {
    failures,
    urls,
    async getText(url: string): Promise<TextResult> {
      urls.push(url);
      return text(url, url);
    },
    async postJson(url: string, body: unknown): Promise<TextResult> {
      const key = `${url} ${JSON.stringify(body)}`;
      urls.push(key);
      return text(key, url);
    },
    async getBytes(url: string): Promise<BytesResult> {
      urls.push(url);
      return { ok: false, status: 0, bytes: null, from_cache: false, error: 'no bytes route' };
    },
  };
}

/** Marks the bytes it returns, so a test tells a resized object from the original. */
function fakeResize(): Resize & { calls: { maxSide: number; quality: number }[] } {
  const calls: { maxSide: number; quality: number }[] = [];
  const resize = async (
    bytes: Uint8Array,
    maxSide: number,
    quality: number,
  ): Promise<Uint8Array> => {
    calls.push({ maxSide, quality });
    const out = new Uint8Array(bytes.length + 1);
    out.set(bytes, 0);
    out[bytes.length] = 0x52;
    return out;
  };
  return Object.assign(resize, { calls });
}

function defaultRoutes(): Map<string, Route> {
  const routes = new Map<string, Route>();
  routes.set(profileUrl('QUGA'), { body: fixture('plants_profile_quga.json') });
  routes.set(subordinateTaxaUrl(QUGA_ID, 0), { body: fixture('plants_subordinate_quga.json') });
  routes.set(`${DISTRIBUTION_URL} {"MasterId":${QUGA_ID}}`, {
    body: fixture('plants_distribution_quga.csv'),
  });
  routes.set(taxaUrl(SCIENTIFIC), { body: fixture('inat_taxa_quga.json') });
  return routes;
}

function setup(t: TestContext, routes: Map<string, Route> = defaultRoutes()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...args: unknown[]): void => {
    out.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]): void => {
    err.push(args.map(String).join(' '));
  };
  t.after(() => {
    console.log = log;
    console.error = error;
  });

  const exec = fakeExec();
  const storage = memoryStorage();
  const resize = fakeResize();
  const deps: CliDeps = {
    root,
    exec,
    http: fakeHttp(routes),
    storage,
    resize,
    cdn_base: CDN,
    validate: stubValidate,
    now: () => new Date(NOW),
  };
  return { root, deps, exec, storage, resize, out, err };
}

function write(root: string, rel: string, text: string): void {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function writeJson(root: string, rel: string, value: unknown): void {
  write(root, rel, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson<T>(root: string, rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')) as T;
}

function exists(root: string, rel: string): boolean {
  return fs.existsSync(path.join(root, ...rel.split('/')));
}

interface SeedOptions {
  candidates?: Candidate[];
  verdicts?: Verdict[];
  manifest?: ManifestRow[];
  confusion?: { a: string; b: string }[];
  authored?: unknown;
  species?: string[];
}

function seed(root: string, options: SeedOptions = {}): void {
  writeJson(root, 'pipeline/data/quercus_sections.json', { 'Quercus gambelii': 'Quercus' });
  writeJson(root, 'content/concepts.json', CONCEPTS);
  writeJson(root, 'content/units.json', UNITS);
  if (options.confusion !== undefined) writeJson(root, 'content/confusion.json', options.confusion);
  if (options.manifest !== undefined) {
    writeJson(root, 'content/images/manifest.json', options.manifest);
  }
  if (options.authored !== null) {
    writeJson(root, 'content_src/species/QUGA.json', options.authored ?? AUTHORED);
  }

  const scope = newScope('demo', { bucket: 'simple_lobed', channels: 'leaf,bark' }, NOW);
  scope.species = options.species ?? ['QUGA'];
  scope.dropped = [{ symbol: 'QUUN', reason: 'hybrid' }];
  writeRun(root, scope);

  const candidates = options.candidates ?? CANDIDATES;
  const dir = runDir(root, 'demo');
  writeJsonl(path.join(dir, 'candidates.jsonl'), candidates);
  writeJsonl(path.join(dir, 'verdicts.jsonl'), options.verdicts ?? VERDICTS);

  candidates.forEach((row, index) => {
    if (row.local === null) return;
    write(root, row.local, '');
    fs.writeFileSync(
      path.join(root, ...row.local.split('/')),
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, index]),
    );
  });
}

function manifestOf(root: string): ManifestRow[] {
  return readJson<ManifestRow[]>(root, 'content/images/manifest.json');
}

function speciesOf(root: string): Record<string, Record<string, unknown>> {
  return readJson<Record<string, Record<string, unknown>>>(root, 'content/species.json');
}

function called(exec: FakeExec, command: string, first: string): ExecCall | undefined {
  return exec.calls.find((call) => call.command === command && call.args[0] === first);
}

test('build writes the three content files and commits', async (t) => {
  const { root, deps, exec, storage, resize, out, err } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const species = speciesOf(root);
  assert.deepEqual(Object.keys(species), ['QUGA']);
  assert.equal(species.QUGA.scientific, SCIENTIFIC);
  assert.equal(species.QUGA.section, 'Quercus');
  assert.equal(species.QUGA.inat_taxon_id, 47851);
  assert.deepEqual(species.QUGA.range, {
    text: 'Colorado Plateau and southern Rockies',
    states: ['AZ', 'CO', 'NM', 'UT'],
  });

  const rows = manifestOf(root);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.channel).sort(), ['bark', 'leaf']);
  assert.deepEqual(readJson<unknown[]>(root, 'content/confusion.json'), []);

  assert.equal(storage.puts.length, 2);
  for (const key of storage.puts) assert.match(key, /^img\/[0-9a-f]{64}\.jpg$/);
  assert.deepEqual(resize.calls, [
    { maxSide: 1200, quality: 82 },
    { maxSide: 1200, quality: 82 },
  ]);

  const commit = called(exec, 'git', 'commit');
  assert.ok(commit !== undefined);
  assert.equal(commit.args[2], 'content: build demo');
  assert.ok(out.join('\n').includes('1 species'));

  const text = fs.readFileSync(path.join(root, 'content', 'species.json'), 'utf8');
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.includes('\n  "QUGA"'));
});

test('a validator error writes no content file and uploads nothing', async (t) => {
  const { root, deps, storage, err } = setup(t);
  seed(root);
  deps.validate = (): ValidationResult => ({
    errors: [{ file: 'content/species.json', message: 'QUGA has no habitat.' }],
    warnings: [],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.deepEqual(storage.puts, []);
  assert.equal(exists(root, 'content/species.json'), false);
  assert.equal(exists(root, 'content/images/manifest.json'), false);
  assert.equal(exists(root, 'pipeline/runs/demo/build.json'), false);
  assert.ok(err.join('\n').includes('QUGA has no habitat.'));
});

test('a failed append-only check writes nothing and names the missing id', async (t) => {
  const { root, deps, exec, storage, err } = setup(t);
  seed(root);
  const gone = 'a'.repeat(64);
  fakeGitShow(exec, { manifest: [{ hash: gone }] });

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.deepEqual(storage.puts, []);
  assert.equal(exists(root, 'content/species.json'), false);
  assert.ok(err.join('\n').includes(`image:${gone}`));
  assert.ok(err.join('\n').includes('images/manifest.json'));
});

test('a first run with no published content succeeds', async (t) => {
  const { root, deps, exec } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0);

  assert.ok(called(exec, 'git', 'show') !== undefined);
  assert.deepEqual(Object.keys(speciesOf(root)), ['QUGA']);
});

test('a published species that left the pool is copied over as retired', async (t) => {
  const { root, deps, exec } = setup(t);
  seed(root);
  fakeGitShow(exec, {
    species: {
      QUAL: { scientific: 'Quercus alba', common: ['white oak'], varieties: [] },
    },
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0);

  const species = speciesOf(root);
  assert.deepEqual(Object.keys(species).sort(), ['QUAL', 'QUGA']);
  assert.equal(species.QUAL.scientific, 'Quercus alba');
  assert.equal(species.QUAL.retired, true);
  assert.equal(species.QUAL.retired_reason, 'the species left the run pool');
  assert.equal(species.QUAL.retired_at, TODAY);
  assert.equal(species.QUGA.retired, undefined);
});

test('a species whose every image is retired gains retired true', async (t) => {
  const { root, deps } = setup(t);
  const row: ManifestRow = {
    hash: 'b'.repeat(64),
    target: 'QUGA',
    channel: 'leaf',
    source: 'commons',
    author: 'A Hiker',
    license: 'CC BY-SA 4.0',
    origin: LEAF.origin,
    tags: [],
    checked_by: 'photo_check_agent',
    checked_at: TODAY,
    note: '',
    retired: true,
    retired_reason: 'takedown request',
    retired_at: '2026-09-01',
  };
  seed(root, {
    manifest: [row],
    verdicts: [verdict(MYSTERY.id, 'escalate', { case: 'quality', note: 'Blurred.' })],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0);

  const species = speciesOf(root);
  assert.equal(species.QUGA.retired, true);
  assert.equal(species.QUGA.retired_reason, 'every approved image was retired');
  assert.equal(species.QUGA.retired_at, TODAY);
  assert.equal(manifestOf(root).length, 1);
});

test('an authored file with a missing required field stops the build', async (t) => {
  const { root, deps, storage, err } = setup(t);
  const broken = { ...AUTHORED };
  delete (broken as Record<string, unknown>).habitat;
  seed(root, { authored: broken });

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.deepEqual(err, ['QUGA: missing required field habitat']);
  assert.deepEqual(storage.puts, []);
  assert.equal(exists(root, 'content/species.json'), false);
});

test('build.json holds one row per run species with per-channel counts', async (t) => {
  const { root, deps } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0);

  const data = readJson<Omit<ReportData, 'escalations'>>(root, 'pipeline/runs/demo/build.json');
  assert.equal(data.run, 'demo');
  assert.deepEqual(data.channels, ['leaf', 'bark']);
  assert.deepEqual(data.species, [
    { symbol: 'QUGA', status: 'included', reason: null, counts: { leaf: 1, bark: 1 } },
    { symbol: 'QUUN', status: 'dropped', reason: 'hybrid', counts: {} },
  ]);
  assert.deepEqual(data.gaps, [
    { symbol: 'QUGA', channel: 'bark', count: 1 },
    { symbol: 'QUGA', channel: 'leaf', count: 1 },
  ]);
  assert.deepEqual(data.counts.candidates_by_source, { commons: 1, inat: 1, plants: 1 });
  assert.deepEqual(data.counts.verdicts_by_kind, { approve: 2, escalate: 1 });
  assert.equal(data.counts.fetch_failures, 0);
  assert.equal(data.counts.stop_rule_fired, false);
});

test('a unit outside 5 to 25 prints a line and the build still succeeds', async (t) => {
  const { root, deps, out } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0);

  const lines = out.join('\n');
  assert.ok(lines.includes('unit simple_lobed holds 1 card, outside 5 to 25'));
  assert.ok(lines.includes('unit furrowed holds 1 card, outside 5 to 25'));

  const data = readJson<Omit<ReportData, 'escalations'>>(root, 'pipeline/runs/demo/build.json');
  assert.deepEqual(data.units, [
    { key: 'simple_lobed', cards: 1, flag: true },
    { key: 'furrowed', cards: 1, flag: true },
  ]);
});

test('a second build over the same verdicts uploads nothing new', async (t) => {
  const { root, deps, storage } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0);
  const first = storage.puts.slice();
  assert.equal(await runCommand(['build', 'demo'], deps), 0);

  assert.deepEqual(storage.puts, first);
  assert.equal(manifestOf(root).length, 2);
});

test('report writes report.md and uploads every escalated candidate', async (t) => {
  const { root, deps, storage, exec } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0);
  assert.equal(await runCommand(['report', 'demo'], deps), 0);

  assert.ok(storage.puts.includes(`review/${MYSTERY.id}.jpg`));
  const text = fs.readFileSync(path.join(runDir(root, 'demo'), 'report.md'), 'utf8');
  assert.ok(text.startsWith('# Content run: demo'));
  assert.ok(text.includes('The source page names Quercus turbinella.'));
  assert.ok(text.includes(MYSTERY.origin));
  assert.ok(text.includes('mismatch'));
  const commits = exec.calls.filter((call) => call.args[0] === 'commit');
  assert.equal(commits.length, 2);
});

test('report links the escalated image through cdn_base', async (t) => {
  const { root, deps } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0);
  assert.equal(await runCommand(['report', 'demo'], deps), 0);

  const text = fs.readFileSync(path.join(runDir(root, 'demo'), 'report.md'), 'utf8');
  assert.ok(text.includes(`![](${CDN}review/${MYSTERY.id}.jpg)`));
});

test('run pr pushes and opens a draft pull request', async (t) => {
  const { root, deps, exec } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0);
  assert.equal(await runCommand(['report', 'demo'], deps), 0);
  assert.equal(await runCommand(['run', 'pr', 'demo'], deps), 0);

  const push = called(exec, 'git', 'push');
  assert.ok(push !== undefined);
  assert.deepEqual(push.args, ['push', '-u', 'origin', 'content/demo']);

  const pr = called(exec, 'gh', 'pr');
  assert.ok(pr !== undefined);
  assert.deepEqual(pr.args.slice(0, 5), ['pr', 'create', '--draft', '--title', 'content: demo']);
  assert.equal(pr.args[6], path.join(runDir(root, 'demo'), 'report.md'));
});

test('run pr without a report fails and says to run cli report', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);

  assert.equal(await runCommand(['run', 'pr', 'demo'], deps), 1);

  assert.equal(called(exec, 'git', 'push'), undefined);
  assert.ok(err.join('\n').includes('cli report demo'));
});

test('run finish turns decisions into owner verdicts and rebuilds', async (t) => {
  const { root, deps, exec, out } = setup(t);
  seed(root);
  writeJson(root, 'pipeline/runs/demo/decisions.json', {
    [MYSTERY.id]: { decision: 'approve', channel: 'fruit', note: 'The tagged tree.' },
  });

  assert.equal(await runCommand(['run', 'finish', 'demo'], deps), 0);

  const verdicts = readJsonl<Verdict>(path.join(runDir(root, 'demo'), 'verdicts.jsonl'));
  assert.equal(verdicts.length, 4);
  assert.equal(verdicts[3].candidate_id, MYSTERY.id);
  assert.equal(verdicts[3].verdict, 'approve');
  assert.equal(verdicts[3].channel, 'fruit');
  assert.equal(verdicts[3].checked_by, 'owner');
  assert.equal(verdicts[3].checked_at, TODAY);

  const rows = manifestOf(root);
  assert.equal(rows.length, 3);
  assert.equal(rows[2].channel, 'fruit');
  assert.equal(rows[2].checked_by, 'owner');

  const text = fs.readFileSync(path.join(runDir(root, 'demo'), 'report.md'), 'utf8');
  assert.ok(text.includes('No escalations.'));
  assert.ok(called(exec, 'git', 'push') !== undefined);
  assert.ok(out.join('\n').includes('1 decision'));
});

test('run finish names a decision the run does not hold', async (t) => {
  const { root, deps, err } = setup(t);
  seed(root);
  writeJson(root, 'pipeline/runs/demo/decisions.json', {
    nosuchid: { decision: 'approve', channel: 'leaf' },
  });

  assert.equal(await runCommand(['run', 'finish', 'demo'], deps), 1);
  assert.ok(err.join('\n').includes('nosuchid'));
});

test('run finish with no decisions.json returns 0', async (t) => {
  const { root, deps, exec, out } = setup(t);
  seed(root);

  assert.equal(await runCommand(['run', 'finish', 'demo'], deps), 0);
  assert.deepEqual(out, ['no decisions to apply']);
  assert.deepEqual(exec.calls, []);
});

test('images retire keeps the row, writes the reason, and commits', async (t) => {
  const { root, deps, exec, storage, out, err } = setup(t);
  const hash = 'c'.repeat(64);
  const other = 'd'.repeat(64);
  const row = (h: string, channel: string): ManifestRow => ({
    hash: h,
    target: 'QUGA',
    channel,
    source: 'commons',
    author: 'A Hiker',
    license: 'CC BY-SA 4.0',
    origin: LEAF.origin,
    tags: [],
    checked_by: 'photo_check_agent',
    checked_at: TODAY,
    note: '',
  });
  seed(root, { manifest: [row(hash, 'leaf'), row(other, 'bark')] });
  writeJson(root, 'content/species.json', { QUGA: { scientific: SCIENTIFIC, concepts: {} } });
  await storage.put(`img/${hash}.jpg`, new Uint8Array([1]), 'image/jpeg');

  assert.equal(await runCommand(['images', 'retire', hash, '--reason', 'Takedown email.'], deps), 0);

  assert.equal(storage.objects.has(`img/${hash}.jpg`), false);
  const rows = manifestOf(root);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].hash, hash);
  assert.equal(rows[0].retired, true);
  assert.equal(rows[0].retired_reason, 'Takedown email.');
  assert.equal(rows[0].retired_at, TODAY);
  assert.equal(rows[1].retired, undefined);
  const commit = called(exec, 'git', 'commit');
  assert.ok(commit !== undefined);
  assert.equal(commit.args[2], `content: retire image ${hash}`);
  assert.ok(out.join('\n').includes('1 manifest row retired'));

  assert.equal(await runCommand(['images', 'retire', other], deps), 1);
  assert.ok(err.join('\n').includes('--reason'));
  assert.equal(manifestOf(root)[1].retired, undefined);
});

test('ids check passes on append-only content and fails on a missing id', async (t) => {
  const { root, deps, exec, out, err } = setup(t);
  seed(root);
  assert.equal(await runCommand(['build', 'demo'], deps), 0);

  assert.equal(await runCommand(['ids', 'check'], deps), 0);
  assert.ok(out.join('\n').includes('content ids are append-only'));

  fakeGitShow(exec, { species: { QUAL: { scientific: 'Quercus alba' } } });
  assert.equal(await runCommand(['ids', 'check'], deps), 1);
  assert.ok(err.join('\n').includes('species:QUAL'));
  assert.ok(err.join('\n').includes('species.json'));
});

test('ids check --base reads the published content from that ref', async (t) => {
  const { root, deps, exec, out } = setup(t);
  seed(root);

  assert.equal(await runCommand(['ids', 'check', '--base', 'origin/main'], deps), 0);

  const show = called(exec, 'git', 'show');
  assert.ok(show !== undefined);
  assert.deepEqual(show.args, ['show', 'origin/main:content/species.json']);
  assert.ok(out.join('\n').includes('content ids are append-only'));
});

test('ids check without --base reads main', async (t) => {
  const { root, deps, exec } = setup(t);
  seed(root);

  assert.equal(await runCommand(['ids', 'check'], deps), 0);

  const show = called(exec, 'git', 'show');
  assert.ok(show !== undefined);
  assert.deepEqual(show.args, ['show', 'main:content/species.json']);
});

test('build --base reads the published content from that ref', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);

  const code = await runCommand(['build', 'demo', '--base', 'origin/main'], deps);
  assert.equal(code, 0, err.join(' | '));

  const show = called(exec, 'git', 'show');
  assert.ok(show !== undefined);
  assert.deepEqual(show.args, ['show', 'origin/main:content/species.json']);
});

test('deferredStorage queues a put, sees it in head, and flushes in order', async (t) => {
  void t;
  const inner = memoryStorage();
  const deferred = deferredStorage(inner);

  await deferred.put('img/one.jpg', new Uint8Array([1]), 'image/jpeg');
  await deferred.put('img/two.jpg', new Uint8Array([2]), 'image/jpeg');

  assert.deepEqual(deferred.pending, ['img/one.jpg', 'img/two.jpg']);
  assert.deepEqual(inner.puts, []);
  assert.equal(await deferred.head('img/one.jpg'), true);
  assert.equal(await deferred.head('img/three.jpg'), false);

  await deferred.flush();

  assert.deepEqual(inner.puts, ['img/one.jpg', 'img/two.jpg']);
  assert.deepEqual([...inner.objects.get('img/two.jpg')!], [2]);
  assert.deepEqual(deferred.pending, []);

  await deferred.flush();
  assert.deepEqual(inner.puts, ['img/one.jpg', 'img/two.jpg']);

  await deferred.remove('img/one.jpg');
  assert.equal(inner.objects.has('img/one.jpg'), false);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test pipeline/tests/cli_build.test.ts`
Expected: FAIL, 22 of 23 tests. The module loads, so the failure is an assertion on the
exit code, not a missing import. The first one reads:

```
not ok 1 - build writes the three content files and commits
  ---
  failureType: 'testCodeFailure'
  error: |-
    not implemented yet: build

    1 !== 0

  code: 'ERR_ASSERTION'
  expected: 0
  actual: 1
  operator: 'strictEqual'
```

The one test that passes is `deferredStorage queues a put, sees it in head, and flushes
in order`, because step 1 already added that function.

- [ ] **Step 4: Replace `pipeline/cli.ts`**

Six handlers arrive: `build`, `report`, `runPr`, `runFinish`, `imagesRetire`, and
`idsCheck`. `buildContent` holds the whole build. It builds the content set in memory,
runs the validator and the append-only check, and only then flushes the uploads and
writes the files.

`carryRetired` is where the species level retire of spec section 4 happens. No other
module owns it, so the rule lives here: a species never leaves `species.json`.

```ts
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { collect, makeCandidate, type Candidate } from './lib/candidates.ts';
import { categoryUrl, commonsCandidates, parseCategoryListing } from './lib/commons.ts';
import { SECTION_PAGES, buildSectionTable, loadSectionTable, sectionFor } from './lib/fna.ts';
import type { Http } from './lib/http.ts';
import { appendOnlyErrors, readPublished, type ContentSet } from './lib/ids.ts';
import { JPEG_QUALITY, MAX_SIDE, reviewKey, sha256Hex, type Resize } from './lib/images.ts';
import {
  FRUITING_VALUE_ID,
  INAT_API,
  PHENOLOGY_TERM_ID,
  inatCandidates,
  inatPasses,
  loadInatTerms,
  observationsUrl,
  parseObservations,
  parseTaxon,
  taxaUrl,
  type InatPass,
} from './lib/inat.ts';
import { appendJsonl, readJsonl } from './lib/jsonl.ts';
import { publishApproved, retireImage, type ManifestRow } from './lib/manifest.ts';
import {
  CHECKLIST_URL,
  acceptedSymbols,
  fetchDistribution,
  fetchImages,
  fetchProfile,
  fetchSubordinateTaxa,
  parseChecklist,
  plantsCandidates,
  type PlantsProfile,
} from './lib/plants.ts';
import {
  UNIT_FLAG_TEXT,
  UNIT_MAX,
  UNIT_MIN,
  buildGaps,
  renderReport,
  type ReportData,
  type ReportEscalationRow,
  type ReportSpeciesRow,
  type ReportUnitRow,
} from './lib/report.ts';
import {
  gitCheckoutBranch,
  gitCommitAll,
  newScope,
  openPullRequest,
  parseFlags,
  readRun,
  runDir,
  writeRun,
  type Exec,
  type RunScope,
} from './lib/run.ts';
import {
  buildFetched,
  enumerateRun,
  mergeSpecies,
  readAuthored,
  speciesStatus,
  validateAuthored,
  type SpeciesRecord,
} from './lib/species.ts';
import { deferredStorage, type Storage } from './lib/storage.ts';
import { stubValidate } from './lib/stub_validator.ts';
import {
  approvedVerdicts,
  countByChannel,
  decisionsToVerdicts,
  stopRule,
  type Decision,
  type Verdict,
} from './lib/verdicts.ts';

export interface CliDeps {
  root: string;
  exec: Exec;
  http: Http;
  storage: Storage;
  resize: Resize;
  /** The object storage base URL, ending in a slash. The report links review images here. */
  cdn_base: string;
  validate: (raw: unknown) => {
    errors: { file: string; message: string }[];
    warnings: { file: string; message: string }[];
  };
  now: () => Date;
}

type Handler = (rest: string[], deps: CliDeps) => Promise<number>;

const USAGE = `usage: node pipeline/cli.ts <command> [flags]

  run init <name> --bucket <b> --states <csv> --genera <csv> --include <csv> --channels <csv>
  run init <name> --concepts <csv> --channels <csv>
  species list <name>
  photos fetch <name>
  photos add <name> --target <t> --origin <url> --file-url <url> --author <a> --license <l> [--license-url <u>] [--source-species <s>] [--channel-hint <c>] [--local <path>]
  build <name> [--base <ref>]
  report <name>
  run pr <name>
  run finish <name>
  images retire <hash> --reason "<text>"
  data sections
  data inat-terms
  ids check [--base <ref>]

--refresh works on every command and bypasses the cache for that command.
--base names the git ref that holds the published content. It defaults to main.`;

/** A first word that takes a second word. Every other command is one word. */
const GROUPS: Set<string> = new Set(['run', 'species', 'photos', 'data', 'images', 'ids']);

const ADD_REQUIRED: string[] = ['target', 'origin', 'file-url', 'author', 'license'];

const MAX_COMMONS_PAGES = 4;
const MAX_INAT_PAGES = 4;
const INAT_PER_PAGE = 50;

const INAT_TERMS_URL =
  `${INAT_API}/observations?term_id=${PHENOLOGY_TERM_ID}&per_page=1&photos=true&quality_grade=research`;

export async function runCommand(argv: string[], deps: CliDeps): Promise<number> {
  const key = commandKey(argv);
  const handler = key === null ? undefined : COMMANDS[key];
  if (key === null || handler === undefined) {
    console.error(USAGE);
    return 1;
  }
  const rest = GROUPS.has(argv[0]) ? argv.slice(2) : argv.slice(1);
  try {
    return await handler(rest, deps);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function runInit(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'run init <name> --bucket <b> --channels <csv>');
  const file = path.join(runDir(deps.root, name), 'run.json');
  if (fs.existsSync(file)) {
    // A stopped run resumes with the same command, so this is not a failure.
    console.log(`run ${name} already exists`);
    return 0;
  }
  const scope = newScope(name, parseFlags(rest.slice(1)), isoNow(deps));
  writeRun(deps.root, scope);
  gitCheckoutBranch(deps.exec, name);
  console.log(`run ${name} created on branch content/${name}`);
  return 0;
}

async function speciesList(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'species list <name>');
  const scope = readRun(deps.root, name);

  const checklist = await deps.http.getText(CHECKLIST_URL);
  if (!checklist.ok) {
    console.error(`the PLANTS checklist fetch failed: ${checklist.error ?? checklist.status}`);
    return 1;
  }
  const rows = parseChecklist(checklist.body);

  const known = new Set(rows.map((row) => row.symbol));
  for (const symbol of scope.include) {
    // Spec section 11: an unknown symbol in include stops the run.
    if (!known.has(symbol)) {
      console.error(`unknown PLANTS symbol in include: ${symbol}`);
      return 1;
    }
  }

  const wanted = [...new Set([...acceptedSymbols(rows, scope.genera), ...scope.include])].sort();
  const profiles: Record<string, PlantsProfile> = {};
  const distribution: Record<string, string[]> = {};
  for (const symbol of wanted) {
    const profile = await fetchProfile(deps.http, symbol);
    if (profile === null) continue;
    profiles[symbol] = profile;
    distribution[symbol] = await fetchDistribution(deps.http, profile.plants_id);
  }

  const enumerated = enumerateRun({
    rows,
    genera: scope.genera,
    states: scope.states,
    include: scope.include,
    profiles,
    distribution,
  });
  scope.species = enumerated.kept;
  scope.dropped = enumerated.dropped;
  writeRun(deps.root, scope);
  writePlantsIds(deps.root, profiles);
  gitCommitAll(deps.exec, `content(${name}): species list`);
  console.log(`${enumerated.kept.length} species kept, ${enumerated.dropped.length} dropped`);
  return 0;
}

async function photosFetch(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'photos fetch <name>');
  const scope = readRun(deps.root, name);
  const now = isoNow(deps);
  const dir = runDir(deps.root, name);
  const candidatesPath = path.join(dir, 'candidates.jsonl');

  const verdicts = readJsonl<Verdict>(path.join(dir, 'verdicts.jsonl'));
  const approvedByChannel = countByChannel(approvedVerdicts(verdicts));
  const terms = loadInatTerms(path.join(deps.root, 'pipeline', 'data', 'inat_terms.json'));
  const passes = inatPasses(terms.flowering_value_id);

  let existing = readJsonl<Candidate>(candidatesPath);
  const appended: Candidate[] = [];
  let failures = 0;

  for (const target of targetsOf(scope)) {
    const found: Candidate[] = [];
    for (const symbol of target.lookups) {
      const profile = await fetchProfile(deps.http, symbol);
      if (profile === null) continue;
      found.push(...(await plantsRows(deps.http, profile, symbol, now)));
      found.push(...(await commonsRows(deps.http, profile.scientific, symbol, now)));
      found.push(...(await inatRows(deps.http, profile.scientific, symbol, passes, now)));
    }
    const collected = collect({
      existing,
      found: retarget(found, target.key),
      target: target.key,
      approvedByChannel,
    });
    for (const row of collected.added) {
      await download(deps, row);
      if (row.fetch_error !== null) failures += 1;
    }
    existing = existing.concat(collected.added);
    appended.push(...collected.added);
  }

  appendJsonl(candidatesPath, appended);
  gitCommitAll(deps.exec, `content(${name}): photo candidates`);
  console.log(
    `${appended.length} candidates appended to ${relative(deps.root, candidatesPath)}, ${failures} download failures`,
  );
  return 0;
}

async function photosAdd(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'photos add <name> --target <t> --origin <url>');
  readRun(deps.root, name);
  const flags = parseFlags(rest.slice(1));
  for (const key of ADD_REQUIRED) {
    const value = flags[key];
    if (value === undefined || value === 'true') {
      console.error(`photos add needs --${key}`);
      return 1;
    }
  }
  const row = makeCandidate({
    target: flags.target,
    source: 'manual',
    origin: flags.origin,
    file_url: flags['file-url'],
    author: flags.author,
    license: flags.license,
    license_url: flags['license-url'] ?? null,
    source_species: flags['source-species'] ?? null,
    channel_hint: flags['channel-hint'] ?? null,
    local: flags.local ?? null,
    fetched_at: isoNow(deps),
  });
  appendJsonl(path.join(runDir(deps.root, name), 'candidates.jsonl'), [row]);
  console.log(`manual candidate ${row.id} added for ${row.target}`);
  return 0;
}

async function dataSections(_rest: string[], deps: CliDeps): Promise<number> {
  const pages: { section: string; html: string }[] = [];
  for (const page of SECTION_PAGES) {
    const result = await deps.http.getText(page.url);
    if (!result.ok) {
      console.error(
        `the FNA page for section ${page.section} failed: ${result.error ?? result.status}`,
      );
      return 1;
    }
    pages.push({ section: page.section, html: result.body });
  }
  const table = sortKeys(buildSectionTable(pages));
  const file = path.join(deps.root, 'pipeline', 'data', 'quercus_sections.json');
  writeJson(file, table);
  console.log(`${Object.keys(table).length} rows written to ${relative(deps.root, file)}`);
  return 0;
}

async function dataInatTerms(_rest: string[], deps: CliDeps): Promise<number> {
  const result = await deps.http.getText(INAT_TERMS_URL);
  if (!result.ok) {
    console.error(`the iNat observation fetch failed: ${result.error ?? result.status}`);
    return 1;
  }
  const first = asRecord(asList(asRecord(parseJson(result.body)).results)[0]);
  let flowering: number | null = null;
  for (const raw of asList(first.annotations)) {
    const row = asRecord(raw);
    if (row.controlled_attribute_id !== PHENOLOGY_TERM_ID) continue;
    const value = row.controlled_value_id;
    if (typeof value !== 'number' || value === FRUITING_VALUE_ID) continue;
    flowering = value;
    break;
  }
  if (flowering === null) {
    console.error(
      'no phenology annotation came back. Set flowering_value_id by hand in pipeline/data/inat_terms.json.',
    );
    return 1;
  }
  const file = path.join(deps.root, 'pipeline', 'data', 'inat_terms.json');
  writeJson(file, { flowering_value_id: flowering });
  console.log(`flowering_value_id is ${flowering}`);
  return 0;
}

async function build(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'build <name>');
  const data = await buildContent(name, deps, baseRef(parseFlags(rest.slice(1))));
  if (data === null) return 1;
  gitCommitAll(deps.exec, `content: build ${name}`);
  return 0;
}

async function report(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'report <name>');
  if (!(await writeReport(name, deps))) return 1;
  gitCommitAll(deps.exec, `content(${name}): report`);
  return 0;
}

async function runPr(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'run pr <name>');
  const body = path.join(runDir(deps.root, name), 'report.md');
  if (!fs.existsSync(body)) {
    console.error(
      `${relative(deps.root, body)} is missing. Run "cli report ${name}" first.`,
    );
    return 1;
  }
  gitCommitAll(deps.exec, `content(${name}): pull request`);
  if (!pushBranch(deps, name)) return 1;
  openPullRequest(deps.exec, name, body);
  console.log(`draft pull request opened for content/${name}`);
  return 0;
}

async function runFinish(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'run finish <name>');
  const dir = runDir(deps.root, name);
  const file = path.join(dir, 'decisions.json');
  if (!fs.existsSync(file)) {
    // The owner had nothing to decide. That is a finished run, not a failure.
    console.log('no decisions to apply');
    return 0;
  }

  const decisions = readJsonFile<Record<string, Decision>>(file, {});
  const known = new Set(
    readJsonl<Candidate>(path.join(dir, 'candidates.jsonl')).map((row) => row.id),
  );
  for (const id of Object.keys(decisions)) {
    if (known.has(id)) continue;
    console.error(`decisions.json names ${id}, which run ${name} does not hold`);
    return 1;
  }

  const rows = decisionsToVerdicts(decisions, isoDate(deps));
  appendJsonl(path.join(dir, 'verdicts.jsonl'), rows);
  console.log(`${rows.length} decisions applied`);

  const data = await buildContent(name, deps, DEFAULT_BASE);
  if (data === null) return 1;
  gitCommitAll(deps.exec, `content: build ${name}`);
  if (!(await writeReport(name, deps))) return 1;
  gitCommitAll(deps.exec, `content(${name}): report`);
  return pushBranch(deps, name) ? 0 : 1;
}

async function imagesRetire(rest: string[], deps: CliDeps): Promise<number> {
  const hash = positional(rest, 'images retire <hash> --reason "<text>"');
  const reason = parseFlags(rest.slice(1)).reason;
  if (reason === undefined || reason === 'true') {
    console.error('images retire needs --reason "<text>"');
    return 1;
  }

  const file = contentFile(deps.root, MANIFEST_NAME);
  const result = await retireImage({
    storage: deps.storage,
    rows: readJsonFile<ManifestRow[]>(file, []),
    hash,
    reason,
    at: isoDate(deps),
  });

  const raw = {
    species: readJsonFile<Record<string, SpeciesRecord>>(contentFile(deps.root, 'species.json'), {}),
    concepts: readJsonFile<{ key: string }[]>(contentFile(deps.root, 'concepts.json'), []),
    units: readJsonFile<{ key: string }[]>(contentFile(deps.root, 'units.json'), []),
    confusion: readJsonFile<Record<string, unknown>[]>(
      contentFile(deps.root, 'confusion.json'),
      [],
    ),
    manifest: result.rows,
  };
  if (!printValidation(deps, raw)) return 1;

  writeJson(file, result.rows);
  gitCommitAll(deps.exec, `content: retire image ${hash}`);
  const rows = `${result.retired} manifest row${result.retired === 1 ? '' : 's'}`;
  console.log(`${rows} retired for ${hash}`);
  return 0;
}

async function idsCheck(rest: string[], deps: CliDeps): Promise<number> {
  const next: ContentSet = {
    species: readJsonFile<Record<string, Record<string, unknown>>>(
      contentFile(deps.root, 'species.json'),
      {},
    ),
    concepts: readJsonFile<{ key: string }[]>(contentFile(deps.root, 'concepts.json'), []),
    units: readJsonFile<{ key: string }[]>(contentFile(deps.root, 'units.json'), []),
    manifest: readJsonFile<ManifestRow[]>(contentFile(deps.root, MANIFEST_NAME), []),
  };
  const base = baseRef(parseFlags(rest));
  const errors = appendOnlyErrors(readPublished(gitShowOf(deps, base)), next);
  for (const message of errors) console.error(message);
  if (errors.length > 0) return 1;
  console.log('content ids are append-only');
  return 0;
}

// Every command of the surface is named here.
const COMMANDS: Record<string, Handler> = {
  'run init': runInit,
  'species list': speciesList,
  'photos fetch': photosFetch,
  'photos add': photosAdd,
  'data sections': dataSections,
  'data inat-terms': dataInatTerms,
  build,
  report,
  'run pr': runPr,
  'run finish': runFinish,
  'images retire': imagesRetire,
  'ids check': idsCheck,
};

const MANIFEST_NAME = path.join('images', 'manifest.json');
const DEFAULT_BASE = 'main';
const LEFT_POOL = 'the species left the run pool';
const IMAGES_RETIRED = 'every approved image was retired';
const MISSING_FILE = 'the local file is missing';

interface RawContent {
  species: Record<string, SpeciesRecord>;
  concepts: { key: string }[];
  units: { key: string }[];
  confusion: Record<string, unknown>[];
  manifest: ManifestRow[];
}

type BuildReport = Omit<ReportData, 'escalations'>;

/**
 * Builds the whole content set in memory, checks it, and only then uploads and writes.
 * Spec section 11: a build that fails writes nothing to content/ and uploads nothing.
 * Returns null when it reported a failure.
 */
async function buildContent(
  name: string,
  deps: CliDeps,
  base: string,
): Promise<BuildReport | null> {
  const scope = readRun(deps.root, name);
  const dir = runDir(deps.root, name);
  const candidates = readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'));
  const verdicts = readJsonl<Verdict>(path.join(dir, 'verdicts.jsonl'));
  const at = isoDate(deps);

  const deferred = deferredStorage(deps.storage);
  const published = await publishApproved({
    deps: {
      storage: deferred,
      resize: deps.resize,
      readLocal: (file) => fs.readFileSync(path.join(deps.root, file)),
    },
    candidates,
    verdicts: approvedVerdicts(verdicts),
    rows: readJsonFile<ManifestRow[]>(contentFile(deps.root, MANIFEST_NAME), []),
  });
  const manifest = published.rows;

  const confusion = readJsonFile<Record<string, unknown>[]>(
    contentFile(deps.root, 'confusion.json'),
    [],
  );
  const named = edgeSymbols(confusion);

  const authoredDir = path.join(deps.root, 'content_src', 'species');
  const statuses: Record<string, string> = {};
  const species: Record<string, SpeciesRecord> = {};
  const authoredErrors: string[] = [];

  let sections: Record<string, string> | null = null;
  for (const symbol of scope.species) {
    const profile = await fetchProfile(deps.http, symbol);
    if (profile === null) {
      console.error(`the PLANTS profile for ${symbol} failed. The build stopped.`);
      return null;
    }
    if (profile.genus === 'Quercus' && sections === null) {
      sections = loadSectionTable(
        path.join(deps.root, 'pipeline', 'data', 'quercus_sections.json'),
      );
    }
    const taxon = await deps.http.getText(taxaUrl(profile.scientific));
    const fetched = buildFetched({
      profile,
      subordinate: await fetchSubordinateTaxa(deps.http, profile.plants_id),
      states: await fetchDistribution(deps.http, profile.plants_id),
      section: sections === null ? null : sectionFor(sections, profile.scientific),
      inat: taxon.ok ? parseTaxon(parseJson(taxon.body)) : null,
    });

    const authored = readAuthored(authoredDir, symbol);
    // A retired row still counts here. carryRetired then retires a species whose every
    // image is gone, so the record stays and the ids stay append-only.
    const status = speciesStatus(symbol, {
      authored,
      imageCount: manifest.filter((row) => row.target === symbol).length,
      namedByEdge: named.has(symbol),
    });
    statuses[symbol] = status;
    if (authored === null) continue;

    authoredErrors.push(...validateAuthored(authored, symbol));
    if (status === 'included') species[symbol] = mergeSpecies(fetched, authored);
  }

  if (authoredErrors.length > 0) {
    for (const message of authoredErrors) console.error(message);
    return null;
  }

  const previous = readPublished(gitShowOf(deps, base));
  carryRetired(species, previous, manifest, named, at);

  const raw: RawContent = {
    species: sortKeys(species),
    concepts: readJsonFile<{ key: string }[]>(contentFile(deps.root, 'concepts.json'), []),
    units: readJsonFile<{ key: string }[]>(contentFile(deps.root, 'units.json'), []),
    confusion,
    manifest,
  };

  if (!printValidation(deps, raw)) return null;

  const idErrors = appendOnlyErrors(previous, contentSetOf(raw));
  if (idErrors.length > 0) {
    for (const message of idErrors) console.error(message);
    return null;
  }

  await deferred.flush();
  writeJson(contentFile(deps.root, 'species.json'), raw.species);
  writeJson(contentFile(deps.root, 'confusion.json'), raw.confusion);
  writeJson(contentFile(deps.root, MANIFEST_NAME), raw.manifest);

  const data = reportData(name, scope, statuses, candidates, verdicts, raw);
  writeJson(path.join(dir, 'build.json'), data);
  for (const unit of data.units) {
    if (!unit.flag) continue;
    const cards = `${unit.cards} card${unit.cards === 1 ? '' : 's'}`;
    console.log(`unit ${unit.key} holds ${cards}, ${UNIT_FLAG_TEXT}`);
  }
  console.log(
    `content built: ${Object.keys(raw.species).length} species, ${raw.manifest.length} manifest rows, ${published.uploaded.length} images uploaded`,
  );
  return data;
}

/**
 * Section 4: a species never leaves species.json. This is the only place the species
 * level retire happens. No other module owns it.
 */
function carryRetired(
  species: Record<string, SpeciesRecord>,
  previous: ContentSet | null,
  manifest: ManifestRow[],
  named: Set<string>,
  at: string,
): void {
  if (previous !== null) {
    for (const [symbol, record] of Object.entries(previous.species)) {
      const current = species[symbol];
      if (record.retired === true) {
        const fields = {
          retired: true,
          retired_reason: record.retired_reason,
          retired_at: record.retired_at,
        };
        species[symbol] = current === undefined ? record : { ...current, ...fields };
        continue;
      }
      if (current !== undefined) continue;
      species[symbol] = { ...record, retired: true, retired_reason: LEFT_POOL, retired_at: at };
    }
  }

  for (const [symbol, record] of Object.entries(species)) {
    if (record.retired === true || named.has(symbol)) continue;
    const rows = manifest.filter((row) => row.target === symbol);
    if (rows.length === 0 || rows.some((row) => row.retired !== true)) continue;
    species[symbol] = {
      ...record,
      retired: true,
      retired_reason: IMAGES_RETIRED,
      retired_at: at,
    };
  }
}

function reportData(
  name: string,
  scope: RunScope,
  statuses: Record<string, string>,
  candidates: Candidate[],
  verdicts: Verdict[],
  raw: RawContent,
): BuildReport {
  const targetOf = new Map(candidates.map((row) => [row.id, row.target]));
  const rows: ReportSpeciesRow[] = [];
  for (const symbol of scope.species) {
    rows.push({
      symbol,
      status: statuses[symbol] ?? 'not_authored',
      reason: null,
      counts: countByChannel(
        verdicts.filter((row) => targetOf.get(row.candidate_id) === symbol),
      ),
    });
  }
  for (const dropped of scope.dropped) {
    rows.push({ symbol: dropped.symbol, status: 'dropped', reason: dropped.reason, counts: {} });
  }

  const kinds: Record<string, number> = {};
  for (const row of lastVerdicts(verdicts)) kinds[row.verdict] = (kinds[row.verdict] ?? 0) + 1;
  const sources: Record<string, number> = {};
  for (const row of candidates) sources[row.source] = (sources[row.source] ?? 0) + 1;

  return {
    run: name,
    channels: scope.channels,
    species: rows,
    gaps: buildGaps(rows, scope.channels),
    units: unitRows(raw),
    counts: {
      candidates_by_source: sortKeys(sources),
      verdicts_by_kind: sortKeys(kinds),
      fetch_failures: candidates.filter((row) => row.fetch_error !== null).length,
      stop_rule_fired: stopRule(verdicts).fired,
    },
  };
}

/** A unit the run touches is one a live species record names through its concepts. */
function unitRows(raw: RawContent): ReportUnitRow[] {
  const rows: ReportUnitRow[] = [];
  for (const unit of raw.units) {
    let cards = 0;
    for (const record of Object.values(raw.species)) {
      if (record.retired === true) continue;
      if (Object.values(asRecord(record.concepts)).includes(unit.key)) cards += 1;
    }
    if (cards === 0) continue;
    rows.push({ key: unit.key, cards, flag: cards < UNIT_MIN || cards > UNIT_MAX });
  }
  return rows;
}

async function writeReport(name: string, deps: CliDeps): Promise<boolean> {
  const dir = runDir(deps.root, name);
  readRun(deps.root, name);
  const buildFile = path.join(dir, 'build.json');
  if (!fs.existsSync(buildFile)) {
    console.error(
      `${relative(deps.root, buildFile)} is missing. Run "cli build ${name}" first.`,
    );
    return false;
  }

  const base = readJsonFile<BuildReport | null>(buildFile, null);
  if (base === null) return false;
  const candidates = readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'));
  const verdicts = readJsonl<Verdict>(path.join(dir, 'verdicts.jsonl'));
  const byId = new Map(candidates.map((row) => [row.id, row]));

  const escalations: ReportEscalationRow[] = [];
  for (const verdict of lastVerdicts(verdicts)) {
    if (verdict.verdict !== 'escalate') continue;
    const candidate = byId.get(verdict.candidate_id);
    if (candidate === undefined) continue;

    // The branch holds no image bytes, so the report links a copy under review/.
    const bytes = localBytes(deps.root, candidate);
    let url = '';
    let note = verdict.note;
    if (bytes === null) {
      note = note === '' ? MISSING_FILE : `${note} (${MISSING_FILE})`;
    } else {
      const key = reviewKey(candidate.id);
      await deps.storage.put(key, await deps.resize(bytes, MAX_SIDE, JPEG_QUALITY), 'image/jpeg');
      url = `${deps.cdn_base}${key}`;
    }
    escalations.push({
      candidate_id: candidate.id,
      image_url: url,
      origin: candidate.origin,
      case: verdict.case ?? '',
      note,
      target: candidate.target,
    });
  }

  const file = path.join(dir, 'report.md');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, renderReport({ ...base, escalations }), 'utf8');
  console.log(`${escalations.length} escalations in ${relative(deps.root, file)}`);
  return true;
}

function localBytes(root: string, candidate: Candidate): Uint8Array | null {
  if (candidate.local === null) return null;
  const file = path.join(root, candidate.local);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

/** Prints every message and answers whether the content set is clean. */
function printValidation(deps: CliDeps, raw: unknown): boolean {
  const result = deps.validate(raw);
  for (const row of result.warnings) console.log(`warning ${row.file}: ${row.message}`);
  for (const row of result.errors) console.error(`error ${row.file}: ${row.message}`);
  return result.errors.length === 0;
}

function pushBranch(deps: CliDeps, name: string): boolean {
  const result = deps.exec('git', ['push', '-u', 'origin', `content/${name}`]);
  if (result.code === 0) return true;
  console.error(`git push failed with code ${result.code}: ${result.out}`);
  return false;
}

function gitShowOf(deps: CliDeps, base: string): (file: string) => string | null {
  return (file) => {
    const result = deps.exec('git', ['show', `${base}:${file}`]);
    return result.code === 0 ? result.out : null;
  };
}

/**
 * The ref that holds the published content. GitHub Actions checks out a pull request
 * without a local main, so the CI step passes --base origin/main.
 */
function baseRef(flags: Record<string, string>): string {
  const value = flags.base;
  return value === undefined || value === 'true' ? DEFAULT_BASE : value;
}

function contentSetOf(raw: RawContent): ContentSet {
  return {
    species: raw.species as Record<string, Record<string, unknown>>,
    concepts: raw.concepts,
    units: raw.units,
    manifest: raw.manifest,
  };
}

/** The last row for a candidate id wins, so an owner decision beats an agent verdict. */
function lastVerdicts(verdicts: Verdict[]): Verdict[] {
  const last = new Map<string, Verdict>();
  for (const row of verdicts) last.set(row.candidate_id, row);
  return [...last.values()];
}

function edgeSymbols(confusion: Record<string, unknown>[]): Set<string> {
  const named = new Set<string>();
  for (const edge of confusion) {
    for (const side of ['a', 'b']) {
      const symbol = edge[side];
      if (typeof symbol === 'string') named.add(symbol);
    }
  }
  return named;
}

function contentFile(root: string, name: string): string {
  return path.join(root, 'content', name);
}

function readJsonFile<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function commandKey(argv: string[]): string | null {
  const first = argv[0];
  if (first === undefined || first.startsWith('--')) return null;
  if (!GROUPS.has(first)) return first;
  const second = argv[1];
  if (second === undefined || second.startsWith('--')) return null;
  return `${first} ${second}`;
}

/** A bucket run targets each species. A concept run targets the key and looks up the exemplars. */
function targetsOf(scope: RunScope): { key: string; lookups: string[] }[] {
  if (scope.concepts.length > 0) {
    return scope.concepts.map((key) => ({
      key,
      lookups: scope.concept_exemplars[key] ?? [],
    }));
  }
  return scope.species.map((symbol) => ({ key: symbol, lookups: [symbol] }));
}

/** The origin of a row stays the exemplar's page. Only the target moves to the concept key. */
function retarget(rows: Candidate[], target: string): Candidate[] {
  return rows.map((row) => (row.target === target ? row : { ...row, target }));
}

async function plantsRows(
  http: Http,
  profile: PlantsProfile,
  symbol: string,
  now: string,
): Promise<Candidate[]> {
  const images = await fetchImages(http, profile.plants_id);
  return plantsCandidates(images, symbol, profile.scientific, profile.plants_id, now);
}

async function commonsRows(
  http: Http,
  scientific: string,
  target: string,
  now: string,
): Promise<Candidate[]> {
  const rows: Candidate[] = [];
  let token: string | null = null;
  for (let page = 0; page < MAX_COMMONS_PAGES; page += 1) {
    const result = await http.getText(categoryUrl(scientific, token));
    if (!result.ok) break;
    const listing = parseCategoryListing(parseJson(result.body));
    rows.push(...commonsCandidates(listing.files, target, scientific, now));
    if (listing.next === null) break;
    token = listing.next;
  }
  return rows;
}

async function inatRows(
  http: Http,
  scientific: string,
  target: string,
  passes: InatPass[],
  now: string,
): Promise<Candidate[]> {
  const taxonResult = await http.getText(taxaUrl(scientific));
  if (!taxonResult.ok) return [];
  const taxon = parseTaxon(parseJson(taxonResult.body));
  if (taxon === null) return [];

  const rows: Candidate[] = [];
  for (const pass of passes) {
    for (let page = 1; page <= MAX_INAT_PAGES; page += 1) {
      const result = await http.getText(observationsUrl(taxon.id, page, pass));
      if (!result.ok) break;
      const json = parseJson(result.body);
      rows.push(...inatCandidates(parseObservations(json), target, pass, now));
      if (!isFullPage(json)) break;
    }
  }
  return rows;
}

/** iNat fills a page to `per_page`. A short page is the last one. */
function isFullPage(json: unknown): boolean {
  const root = asRecord(json);
  const results = Array.isArray(root.results) ? root.results.length : 0;
  const perPage = typeof root.per_page === 'number' ? root.per_page : INAT_PER_PAGE;
  return results >= perPage;
}

async function download(deps: CliDeps, row: Candidate): Promise<void> {
  const result = await deps.http.getBytes(row.file_url);
  if (!result.ok || result.bytes === null) {
    // The row is still appended, so the report counts the failure and a later run retries.
    row.fetch_error = result.error ?? `status ${result.status}`;
    return;
  }
  const hash = sha256Hex(result.bytes);
  const file = path.join(deps.root, 'pipeline', 'cache', row.source, `${hash}.jpg`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, result.bytes);
  row.local = relative(deps.root, file);
  row.file_hash = hash;
}

function writePlantsIds(root: string, profiles: Record<string, PlantsProfile>): void {
  const file = path.join(root, 'pipeline', 'data', 'plants_ids.json');
  const ids: Record<string, number> = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, number>)
    : {};
  for (const [symbol, profile] of Object.entries(profiles)) ids[symbol] = profile.plants_id;
  writeJson(file, sortKeys(ids));
}

function sortKeys<T>(table: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(table).sort()) sorted[key] = table[key];
  return sorted;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

function positional(rest: string[], usage: string): string {
  const value = rest[0];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`usage: node pipeline/cli.ts ${usage}`);
  }
  return value;
}

function isoNow(deps: CliDeps): string {
  return deps.now().toISOString().replace(/\.\d+Z$/, 'Z');
}

/** A verdict date and a retire date are days, not timestamps. */
function isoDate(deps: CliDeps): string {
  return deps.now().toISOString().slice(0, 10);
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const nodeExec: Exec = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.error !== undefined) {
    return { code: 1, out: `${out} ${result.error.message}`.trim() };
  }
  return { code: result.status ?? 1, out };
};

// sharp and the S3 client load on first use, so a command that needs neither runs
// without them installed.
const lazyResize: Resize = async (bytes, maxSide, quality) => {
  const { sharpResize } = await import('./lib/sharp_resizer.ts');
  return sharpResize(bytes, maxSide, quality);
};

function lazyStorage(): Storage {
  let real: Storage | null = null;
  const load = async (): Promise<Storage> => {
    if (real === null) {
      const { s3Storage, s3ConfigFromEnv } = await import('./lib/s3_storage.ts');
      real = s3Storage(s3ConfigFromEnv(process.env));
    }
    return real;
  };
  return {
    async head(key) {
      return (await load()).head(key);
    },
    async put(key, bytes, contentType) {
      return (await load()).put(key, bytes, contentType);
    },
    async remove(key) {
      return (await load()).remove(key);
    },
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const root = process.cwd();
  // --refresh belongs to the Http, not to a command. The guard reads it from process.argv
  // and passes it to createHttp, so every command gets a cache that honours the flag.
  const refresh = argv.includes('--refresh');
  const { createHttp } = await import('./lib/http.ts');
  const http = createHttp({ cache_dir: path.join(root, 'pipeline', 'cache'), refresh });
  process.exitCode = await runCommand(argv, {
    root,
    exec: nodeExec,
    http,
    storage: lazyStorage(),
    resize: lazyResize,
    // Task 17 points this at the app's CDN_BASE. A trailing slash is part of the value.
    cdn_base: process.env.CDN_BASE ?? '',
    validate: stubValidate,
    now: () => new Date(),
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test pipeline/tests/cli_build.test.ts`
Expected: PASS, 23 tests

- [ ] **Step 6: Update the two Task 13 placeholders in `pipeline/tests/cli_fetch.test.ts`**

Task 13 wrote a test that asserts the six commands print `not implemented yet`. That
message is gone. Make two edits with the Edit tool.

Edit 1. `CliDeps` now carries `cdn_base`, so the fake deps carry it too.

Old:

```ts
    storage: memoryStorage(),
    resize: async (bytes) => bytes,
    validate: stubValidate,
```

New:

```ts
    storage: memoryStorage(),
    resize: async (bytes) => bytes,
    cdn_base: 'https://images.dendro.test/',
    validate: stubValidate,
```

Edit 2. The placeholder test now checks that each command reaches its own handler.

Old:

```ts
test('a Task 14 command says it is not implemented yet', async (t) => {
  const { deps, err } = setup(t);
  assert.equal(await runCommand(['build', 'demo'], deps), 1);
  assert.equal(await runCommand(['run', 'pr', 'demo'], deps), 1);
  assert.deepEqual(err, ['not implemented yet: build', 'not implemented yet: run pr']);
});
```

New:

```ts
test('a Task 14 command reaches its own handler', async (t) => {
  const { deps, err } = setup(t);
  assert.equal(await runCommand(['build', 'demo'], deps), 1);
  assert.equal(await runCommand(['run', 'pr', 'demo'], deps), 1);
  assert.equal(err.length, 2);
  assert.ok(err[0].includes('run demo does not exist'));
  assert.ok(err[1].includes('Run "cli report demo" first.'));
});
```

- [ ] **Step 7: Run every pipeline test**

Run: `node --test "pipeline/tests/**/*.test.ts"`
Expected: PASS, 194 tests

- [ ] **Step 8: Commit**

```bash
git add pipeline/cli.ts pipeline/lib/storage.ts pipeline/tests/cli_build.test.ts pipeline/tests/cli_fetch.test.ts && git commit -m "feat: build the content, write the report, and open the pull request" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 15: The four agent skills

**Files:**
- Create: `.claude/skills/content-run/SKILL.md`
- Create: `.claude/skills/photo-check/SKILL.md`
- Create: `.claude/skills/species-draft/SKILL.md`
- Create: `.claude/skills/edges-draft/SKILL.md`

**Interfaces:**
- Consumes: nothing. These are prose files. They name the CLI commands of Tasks 11
  through 13 and the file paths of Tasks 2, 6, and 9.
- Produces: four skill files. No code and no exported name.

This task writes prose, not code. There is no test. The skills hold the judgment rules
of spec sections 5, 6, 7, and 8, so a run next year uses today's rules. Each file quotes
the rules in full. A skill never points at a spec file, because the spec may move.

Each file starts with YAML frontmatter that holds exactly `name` and `description`. The
`name` equals the directory name. The `description` starts with "Use when".

- [ ] **Step 1: Create `.claude/skills/content-run/SKILL.md`**

````markdown
---
name: content-run
description: Use when running a Dendro content run end to end, from `cli run init` to the merged pull request.
---

# Content run

A run is one scope of content: a bucket, a set of states, a set of channels, and a
species seed. You walk the ten steps below in order.

Every CLI command reads what earlier steps wrote and skips finished work, so a stopped
run resumes with the same command. Every command takes `--refresh` to bypass the cache.

**The CLI commits. You do not.** The CLI commits on the branch at the end of steps 2, 4,
6, 8, and 9. Agents commit nothing. Do not run `git commit` yourself.

## The ten steps

- [ ] **Step 1: Init the run (script)**

```bash
node pipeline/cli.ts run init <name> --bucket <b> --states <list> --genera <list> --include <list> --channels <list>
```

This creates the branch `content/<name>` from `main` and writes `runs/<name>/run.json`.

- [ ] **Step 2: List the species (script, commits)**

```bash
node pipeline/cli.ts species list <name>
```

This writes the species into `run.json`, with the reason for each dropped species.

- [ ] **Step 3: Draft the authored species files (agent)**

Run the `species-draft` skill. It writes one `content_src/species/<SYMBOL>.json` for each
species that lacks one. The list is then filtered to the run's bucket.

- [ ] **Step 4: Fetch the photo candidates (script, commits)**

```bash
node pipeline/cli.ts photos fetch <name>
```

This fills `runs/<name>/candidates.jsonl` and the cache.

- [ ] **Step 5: Approve the photos (agent)**

Run the `photo-check` skill. It writes `runs/<name>/verdicts.jsonl`. The
quarter-escalation stop rule applies. When that skill stops, the run stops with it.

- [ ] **Step 6: Build (script, commits)**

```bash
node pipeline/cli.ts build <name>
```

This merges the species records, uploads the approved images, writes the manifest rows,
runs the validator, computes the unit sizes, and writes the gap list per species and
channel.

- [ ] **Step 7: Hunt for the thin channels (agent)**

Read the gap list from step 6. Find photos by hand in a browser for the thin channels.
Append each one as a manual candidate:

```bash
node pipeline/cli.ts photos add <name> --target <t> --origin <url> --file-url <url> --author <a> --license <l> --source-species <s> --channel-hint <c>
```

Then run steps 5 and 6 again.

- [ ] **Step 8: Draft the confusion edges (agent, the CLI commits)**

Run the `edges-draft` skill. It writes edges for the run's units.

- [ ] **Step 9: Report and open the pull request (script, commits)**

```bash
node pipeline/cli.ts report <name>
node pipeline/cli.ts run pr <name>
```

`report` writes `runs/<name>/report.md`. `run pr` opens a draft pull request with the
report as its body.

- [ ] **Step 10: Stop and wait for the owner**

**The run stops here.** The owner reviews the pull request. They write
`runs/<name>/decisions.json` for the escalations, and they edit the authored files and
the edges in place. Do not do this work for them. Do not guess a decision.

When the owner says the decisions are ready:

```bash
node pipeline/cli.ts run finish <name>
```

This applies the decisions, rebuilds, re-renders the report, and pushes. CI validates.
The owner marks the pull request ready and merges.

## The concept run variant

Step 1 of a concept run takes `--concepts <list>` in place of `--bucket`, and keeps the
other flags. Its `run.json` lists exemplar species per concept. Candidates target the
concept key, such as `bark/plated`. No species record is written. **Skip step 3 and
step 8.**

## Other commands

- `node pipeline/cli.ts images retire <hash> --reason "<text>"` takes one image down. It
  deletes the object, keeps the manifest row, writes the reason and the date, validates,
  and commits. Run it only when the owner asks.
- `node pipeline/cli.ts data sections` builds the oak section table. Run it once.
- `node pipeline/cli.ts data inat-terms` reads the iNat phenology term values.

## What this skill does not do

- It does not commit. The CLI commits.
- It does not write decisions for the owner at step 10.
- It does not restart a run that the stop rule stopped. The owner changes the source list
  or the threshold first.
- It does not edit `content/concepts.json` or `content/units.json`. Those are authored by
  hand.
````

- [ ] **Step 2: Create `.claude/skills/photo-check/SKILL.md`**

````markdown
---
name: photo-check
description: Use when approving the photo candidates of a Dendro content run and writing one verdict row per candidate.
---

# Photo check

You judge the photo candidates of one run. You write one verdict row per candidate.

## The loop

1. Read `pipeline/runs/<name>/candidates.jsonl`.
2. Read `pipeline/runs/<name>/verdicts.jsonl` when it exists.
3. Take every candidate whose `id` has no row in `verdicts.jsonl`. These are the
   unjudged candidates.
4. Dispatch subagents in batches of 10. Each subagent gets one candidate row. It reads
   the image file at the row's `local` path and the row itself.
5. Each subagent appends exactly one verdict row to
   `pipeline/runs/<name>/verdicts.jsonl`.
6. After each batch, apply the stop rule below.

## The verdict row

One line of JSON, appended to `verdicts.jsonl`:

```json
{ "candidate_id": "<id>", "verdict": "approve", "channel": "bark",
  "tags": ["winter"], "case": null,
  "note": "Bark fills the frame and is sharp. Source page names Quercus gambelii.",
  "checked_by": "photo_check_agent", "checked_at": "2026-09-22" }
```

- `verdict` is `approve`, `reject`, or `escalate`.
- `case` is null on an approve and on a reject. On an escalation it is `mismatch`,
  `license`, or `quality`.
- `channel` is one of `leaf`, `bark`, `fruit`, `flower`, `twig`.
- `checked_by` is `photo_check_agent`.
- `checked_at` is the date, in `YYYY-MM-DD`.
- `note` is one or two sentences that say what you saw.

## The four rules

**Channel.** Set the channel from the fixed list: `leaf`, `bark`, `fruit`, `flower`,
`twig`. The row's `channel_hint` is a suggestion only. Use your eyes. **When no channel
is clear, reject the image. An unclear channel is a reject, not an escalation.**

**Quality.** The photo is sharp. The subject fills the frame. No hand and no ruler are in
the shot. Below that threshold, escalate with `case: quality`.

**License.** The license text on the row is in the allowlist and matches the source page.
The allowlist is public domain, US government work, CC0 any version, CC BY any version,
and CC BY-SA any version. NC and ND variants are not allowed. When the license is
missing, ambiguous, or not redistributable, escalate with `case: license`.

**Identity.** The script already compared `source_species` to the species name, its
PLANTS synonyms, and its iNat name, after normalization. On a match the identity check
passed and you do nothing. On a difference, read the source page at `origin`. When the
names still differ, escalate with `case: mismatch`.

Eligible identity sources are iNaturalist at research grade, USDA PLANTS, US Forest
Service and NRCS through a manual candidate, Wikimedia Commons with a species-level
category, and university dendrology collections that name the species.

**You never set or change the species from what you see in the photo.** Identity comes
from the source page. Your own recognition of the plant is not evidence.

## The three escalation cases

Escalate in these three cases and no others:

1. `mismatch`: the species on the source page and the species on the row differ.
2. `license`: the license is missing, ambiguous, or not redistributable.
3. `quality`: the channel or the quality falls below the threshold.

Everything else is an approve or a reject.

## The stop rule

After each batch of 10, count the rows in `verdicts.jsonl` for this run.

- When fewer than 20 candidates have a verdict, continue.
- When 20 or more have a verdict **and** more than a quarter of them are escalations,
  **stop**.

Example: 24 judged with 7 escalations is 29 percent. That is more than a quarter, so the
run stops. 24 judged with 6 escalations is 25 percent. That is not more than a quarter,
so the run continues.

When the stop rule fires:

1. Dispatch no more batches.
2. Write the reason into the run's report data: the count judged, the count escalated,
   and the percentage.
3. Tell the owner the run stopped and why.
4. Stop. The run resumes only after the owner changes the source list or the threshold
   and re-runs the command.

A stopped run is a signal that the source list or the threshold is wrong. Do not lower
your standard to get past it.

## What this skill does not do

- It does not identify a species from the image.
- It does not re-judge a candidate that already has a verdict row.
- It does not write `decisions.json`. The owner writes that.
- It does not upload, resize, or delete any image. `cli build` does that.
- It does not commit.
- It does not continue after the stop rule fires.
````

- [ ] **Step 3: Create `.claude/skills/species-draft/SKILL.md`**

````markdown
---
name: species-draft
description: Use when drafting the authored species files under `content_src/species/` for a Dendro content run.
---

# Species draft

You draft one file per species that lacks one. The file holds the authored layer of a
species record. A script fetches the rest from USDA PLANTS and iNaturalist.

## What to draft

1. Read the run's species list from `pipeline/runs/<name>/run.json`.
2. For each accepted symbol, check whether `content_src/species/<SYMBOL>.json` exists.
3. Draft one file for each symbol that has no file. Leave the existing files alone.

`<SYMBOL>` is the USDA PLANTS symbol, in upper case, such as `QUGA`.

## The file shape

```json
{
  "concepts": { "leaf": "simple_lobed", "bark": "furrowed", "fruit": "acorn" },
  "common_extra": ["Rocky Mountain white oak"],
  "audubon_name": "Gambel Oak",
  "range": { "text": "Colorado Plateau and southern Rockies" },
  "planted_states": [],
  "elevation_ft": [5000, 9000],
  "height_ft": [15, 30],
  "habitat": "Dry slopes and foothills with pinyon and juniper",
  "variety_notes": { "QUGAG": "The widespread form." },
  "ref": ["Virginia Tech Dendrology fact sheet, Quercus gambelii",
          "FNA vol. 3, Quercus gambelii"]
}
```

**Required fields.** The build fails when one is missing.

- `concepts`: an object with at least one channel. The key is the channel. The value is
  the level-1 concept key from `content/concepts.json`.
- `range.text`: one short phrase that names the range.
- `elevation_ft`: two numbers, low and high.
- `height_ft`: two numbers, low and high.
- `habitat`: one sentence.
- `ref`: a list of strings. Each string names one reference you read.

**Optional fields.** Leave a field out when you have nothing for it.

- `common_extra`: extra common names. The build appends them after the PLANTS common
  name.
- `audubon_name`: the name the Audubon guide uses.
- `planted_states`: states where the species is planted but not native.
- `variety_notes`: an object keyed by variety symbol, with one note each.

## The reference order

Read in this order of preference and stop when you have the fields:

1. The Silvics of North America chapter for the species.
2. The Virginia Tech dendrology fact sheet.
3. The Flora of North America treatment.
4. Sibley.

## The two rules that matter most

**`ref` names what you actually read.** Write the reference you opened, with enough
detail to find it again: the guide, the volume or the page, and the species. Do not list
a reference you did not read. The owner checks each claim against the named page. A wrong
`ref` wastes their time and hides an error.

**Never invent a number you did not read.** `elevation_ft` and `height_ft` come from a
reference. When no reference gives a number, say so to the owner and leave the file
undrafted. A guessed number reads exactly like a checked one, and the owner cannot tell
them apart.

The same rule holds for `habitat` and `range.text`. Write what the source says, in your
own short words.

## What this skill does not do

- It does not overwrite a file that already exists.
- It does not write any fetched field: `scientific`, `common[0]`, `family`, `genus`,
  `native_status`, `varieties`, `range.states`, `section`, `inat_taxon_id`, or
  `inat_name`. A script fetches those.
- It does not edit `content/species.json`. The build writes that.
- It does not write confusion edges. The `edges-draft` skill does that.
- It does not commit.
````

- [ ] **Step 4: Create `.claude/skills/edges-draft/SKILL.md`**

````markdown
---
name: edges-draft
description: Use when drafting confusion edges for a Dendro bucket and appending them to `content/confusion.json`.
---

# Edges draft

A confusion edge is a pair of species that a learner mixes up, on one channel, with one
sentence that separates each from the other. You draft edges from named references and
append them to `content/confusion.json`.

## Inputs

- The bucket, such as `simple_lobed`.
- The species list of the unit, from `pipeline/runs/<name>/run.json`.
- The current `content/species.json`, for the symbols that exist.
- The current `content/confusion.json`, for the edges that already exist.

## The edge shape

```json
{ "a": "QURU", "b": "QUVE", "channel": "leaf",
  "a_not_b": "Northern red oak has shallower sinuses and shorter bristle tips than black oak.",
  "b_not_a": "Black oak has deeper sinuses, longer bristle tips, and larger hairy buds.",
  "ref": "Virginia Tech Dendrology fact sheet, Quercus velutina" }
```

- `a` and `b` are PLANTS symbols.
- `channel` is one of `leaf`, `bark`, `fruit`, `flower`, `twig`.
- `a_not_b` says how `a` differs from `b`.
- `b_not_a` says how `b` differs from `a`.
- `ref` is one string that names the source of the two sentences.

Append each edge to the list in `content/confusion.json`.

## The target

For `simple_lobed` in v0, draft 15 to 25 edges. Below 15 the distractor pool is thin.
Above 25 the owner's read gets long.

## The rules

**Both `a` and `b` must be in `species.json`.** Check each symbol before you write the
edge. The validator rejects an edge whose `a` or `b` is missing, and the build fails.

**Each side names a feature a person can see in the field.** Write what the person holds
in their hand or sees on the trunk: the depth of a sinus, the length of a bristle tip,
the color of a bud, the texture of the bark. Do not write a range statement, a habitat,
a bloom date, or a microscope feature. The learner is looking at one photo.

- Good: "Black oak has deeper sinuses, longer bristle tips, and larger hairy buds."
- Bad: "Black oak grows further east." The learner cannot see that in the photo.

**`ref` names the source.** Write the guide and the species, such as "Virginia Tech
Dendrology fact sheet, Quercus velutina". The owner checks the two sentences against that
page. Do not name a page you did not read. Do not write an edge from memory.

**One edge per pair per channel.** Two species that confuse on both leaf and bark get two
edges, one per channel. Do not write the same pair and channel twice. Check the existing
edges first.

**Both directions carry a real difference.** `a_not_b` and `b_not_a` are not the same
sentence with the species swapped. Each names what that species has.

## What this skill does not do

- It does not create or edit a species record.
- It does not rename or remove an existing edge. Edges are appended.
- It does not write an edge for a species that is not in `species.json`.
- It does not run the validator. `cli build` does that.
- It does not commit.
````

- [ ] **Step 5: Check the four skills load**

Run: `ls .claude/skills/content-run/SKILL.md .claude/skills/photo-check/SKILL.md .claude/skills/species-draft/SKILL.md .claude/skills/edges-draft/SKILL.md`
Expected: the four paths print, one per line.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills && git commit -m "docs: add the four content pipeline agent skills" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 16: Dev dependencies, the real resizer, and the real object storage client

This task starts only after the app branch has merged to `main` and this branch has been rebased onto `main`. Before that, `package.json` does not exist here and a rebase would conflict. Check with `git log --oneline -1 main` and `git rebase main` first.

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `pipeline/lib/sharp_resizer.ts`
- Create: `pipeline/lib/s3_storage.ts`
- Test: `pipeline/tests/sharp_resizer.test.ts`

**Interfaces:**
- Consumes: `Resize` from `pipeline/lib/images.ts`, which is `(bytes: Uint8Array, maxSide: number, quality: number) => Promise<Uint8Array>`. `Storage` from `pipeline/lib/storage.ts`, which is `{ head(key): Promise<boolean>; put(key, bytes, contentType): Promise<void>; remove(key): Promise<void> }`.
- Produces:
  - `pipeline/lib/sharp_resizer.ts`: `export const sharpResize: Resize`.
  - `pipeline/lib/s3_storage.ts`: `export interface S3Config { endpoint: string; region: string; bucket: string; access_key_id: string; secret_access_key: string }`, `export function s3ConfigFromEnv(env: Record<string, string | undefined>): S3Config`, `export function s3Storage(config: S3Config): Storage`.

This is the first task in this plan that installs packages. Every earlier task runs with no `node_modules`. The test in this task needs `sharp`, so it comes last and Step 2 installs the packages before Step 5 runs it. The app still imports none of these packages.

- [ ] **Step 1: Replace `package.json`**

The file keeps every field and every script the app plan created. It gains `devDependencies` and the two pipeline test scripts.

```json
{
  "name": "dendro",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "A desk-based learning tool for North American tree identification.",
  "scripts": {
    "test": "node --test \"tests/**/*.test.js\"",
    "test:pipeline": "node --test \"pipeline/tests/**/*.test.ts\"",
    "test:all": "npm test && npm run test:pipeline",
    "validate": "node scripts/validate_content.js content",
    "validate:dev": "node scripts/validate_content.js content_dev --local-images content_dev/images",
    "images:dev": "node scripts/make_placeholder_jpegs.js"
  },
  "devDependencies": {
    "@aws-sdk/client-s3": "^3.1138.0",
    "@types/node": "^24.13.6",
    "sharp": "^0.35.4"
  },
  "engines": {
    "node": ">=24"
  }
}
```

`@types/node` stays on major 24, to match the Node the pipeline runs on.

- [ ] **Step 2: Install the packages**

Run: `npm install`
Expected: `added 35 packages, and audited 36 packages`, then `found 0 vulnerabilities`. `sharp` ships a prebuilt binary for Windows, macOS, and Linux, so the install needs no compiler.

- [ ] **Step 3: Replace `.gitignore`**

The app plan already ignores `pipeline/cache/`. This edit adds one comment, so a later reader does not add `pipeline/runs/` to the list.

```
node_modules/
pipeline/cache/
# pipeline/runs/ is committed: each run record is part of the history.
.DS_Store
Thumbs.db
*.log
```

- [ ] **Step 4: Write the failing test**

The test builds its own JPEGs with `sharp`, so it needs no fixture file and no network. It covers the resizer, and it covers `s3ConfigFromEnv` from the next module. It does not reach a bucket.

`pipeline/tests/sharp_resizer.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { sharpResize } from '../lib/sharp_resizer.ts';
import { s3ConfigFromEnv } from '../lib/s3_storage.ts';

async function makeJpeg(width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 120, b: 60 } },
  }).jpeg().toBuffer();
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

test('a large image resizes to the maximum long side', async () => {
  const input = await makeJpeg(2000, 1000);
  const out = await sharpResize(input, 1200, 82);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 600);
});

test('a small image keeps its size', async () => {
  const input = await makeJpeg(400, 300);
  const out = await sharpResize(input, 1200, 82);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 400);
  assert.equal(meta.height, 300);
});

test('the output is a jpeg and a Uint8Array', async () => {
  const input = await makeJpeg(800, 600);
  const out = await sharpResize(input, 1200, 82);
  assert.ok(out instanceof Uint8Array);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, 'jpeg');
});

test('exif does not survive the resize', async () => {
  const buf = await sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 10, b: 10 } },
  }).withExif({ IFD0: { Copyright: 'test' } }).jpeg().toBuffer();
  const input = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  const before = await sharp(input).metadata();
  assert.ok(before.exif, 'the input carries exif');

  const out = await sharpResize(input, 1200, 82);
  const after = await sharp(out).metadata();
  assert.equal(after.exif, undefined);
});

const FULL_ENV = {
  DENDRO_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  DENDRO_S3_REGION: 'auto',
  DENDRO_S3_BUCKET: 'dendro-images',
  DENDRO_S3_ACCESS_KEY_ID: 'key-id',
  DENDRO_S3_SECRET_ACCESS_KEY: 'secret',
};

test('s3ConfigFromEnv reads a full environment', () => {
  const config = s3ConfigFromEnv({ ...FULL_ENV, OTHER: 'ignored' });
  assert.deepEqual(config, {
    endpoint: 'https://account.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'dendro-images',
    access_key_id: 'key-id',
    secret_access_key: 'secret',
  });
});

test('s3ConfigFromEnv names every missing variable', () => {
  const env: Record<string, string | undefined> = { ...FULL_ENV };
  delete env.DENDRO_S3_BUCKET;
  delete env.DENDRO_S3_SECRET_ACCESS_KEY;
  assert.throws(
    () => s3ConfigFromEnv(env),
    (error: Error) => {
      assert.match(error.message, /DENDRO_S3_BUCKET/);
      assert.match(error.message, /DENDRO_S3_SECRET_ACCESS_KEY/);
      assert.doesNotMatch(error.message, /DENDRO_S3_REGION/);
      return true;
    },
  );
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `node --test pipeline/tests/sharp_resizer.test.ts`
Expected: FAIL, 1 file, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\sharp_resizer.ts' imported from <repo>\pipeline\tests\sharp_resizer.test.ts`.

- [ ] **Step 6: Create `pipeline/lib/sharp_resizer.ts`**

```ts
import sharp from 'sharp';
import type { Resize } from './images.ts';

// sharp drops every metadata block unless withMetadata() is called. Never call it,
// so EXIF and GPS cannot survive into a published image.
export const sharpResize: Resize = async (bytes, maxSide, quality) => {
  const out = await sharp(bytes)
    .rotate() // applies the EXIF orientation before the EXIF block goes away
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
};
```

`import type` erases at runtime, so Node never resolves `images.ts` from this file.

- [ ] **Step 7: Run the test to verify it still fails**

Run: `node --test pipeline/tests/sharp_resizer.test.ts`
Expected: FAIL, 1 file, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\s3_storage.ts' imported from <repo>\pipeline\tests\sharp_resizer.test.ts`.

- [ ] **Step 8: Create `pipeline/lib/s3_storage.ts`**

```ts
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { Storage } from './storage.ts';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  access_key_id: string;
  secret_access_key: string;
}

const ENV_FIELDS: [keyof S3Config, string][] = [
  ['endpoint', 'DENDRO_S3_ENDPOINT'],
  ['region', 'DENDRO_S3_REGION'],
  ['bucket', 'DENDRO_S3_BUCKET'],
  ['access_key_id', 'DENDRO_S3_ACCESS_KEY_ID'],
  ['secret_access_key', 'DENDRO_S3_SECRET_ACCESS_KEY'],
];

export function s3ConfigFromEnv(env: Record<string, string | undefined>): S3Config {
  const config: Record<string, string> = {};
  const missing: string[] = [];
  for (const [field, name] of ENV_FIELDS) {
    const value = env[name];
    if (value === undefined || value === '') {
      missing.push(name);
      continue;
    }
    config[field] = value;
  }
  if (missing.length > 0) {
    throw new Error(`missing environment variables: ${missing.join(', ')}`);
  }
  return config as unknown as S3Config;
}

function isNotFound(error: unknown): boolean {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
}

export function s3Storage(config: S3Config): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.access_key_id,
      secretAccessKey: config.secret_access_key,
    },
  });
  return {
    async head(key: string): Promise<boolean> {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
    async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
      // No ACL: R2 serves the bucket through a public CDN binding, not per-object ACLs.
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }));
    },
    async remove(key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
```

`head` returns `false` on a `NotFound` error or a 404 status, and rethrows anything else. An access error must stop the run, not look like a missing object.

- [ ] **Step 9: Run the test to verify it passes**

Run: `node --test pipeline/tests/sharp_resizer.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 10: Run the whole pipeline suite**

Run: `npm run test:pipeline`
Expected: PASS, every pipeline test file, including the new one.

- [ ] **Step 11: Hand-run the full check**

Run these two commands from the repo root and read the output:

1. `npm install`
   Expected: npm prints the number of packages it added and audited, then `found 0 vulnerabilities`. On a second run it prints `up to date`. No compiler runs, because `sharp` ships prebuilt binaries.
2. `npm run test:all`
   Expected: two suites in order. The app suite runs first, from `tests/**/*.test.js`, and prints `# fail 0`. The pipeline suite runs second, from `pipeline/tests/**/*.test.ts`, and prints `# fail 0`. `npm` exits 0. If the app suite fails, `npm` stops and never starts the pipeline suite.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json .gitignore pipeline/lib/sharp_resizer.ts pipeline/lib/s3_storage.ts pipeline/tests/sharp_resizer.test.ts && git commit -m "feat: add the sharp resizer and the s3 storage client" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 17: The real validator and the CDN base

This task starts only after the app branch has merged to `main` and this branch has been rebased onto `main`. Before that, `app/logic/content.js` does not exist here. Check with `git log --oneline -1 main` and `git rebase main` first. Task 16 does the same rebase; when Task 16 has already run, the branch is already on `main` and `git rebase main` prints `Current branch pipeline is up to date`.

**Files:**
- Modify: `app/logic/content.js` (one line: the `CDN_BASE` value)
- Modify: `pipeline/cli.ts` (the imports and the `main` guard)
- Move: `pipeline/lib/stub_validator.ts` to `pipeline/tests/fake_validator.ts`
- Modify: `pipeline/tests/cli_build.test.ts`, `pipeline/tests/cli_fetch.test.ts`, `pipeline/tests/run.test.ts` (one import line each)
- Test: `pipeline/tests/validator_wiring.test.ts`

**Interfaces:**
- Consumes: `validateContent(raw)` and `CDN_BASE` from `app/logic/content.js`, written by the app plan's Task 2.
- Produces: a `main` guard whose `deps.validate` is the app's own validator and whose `deps.cdn_base` is the app's own `CDN_BASE`. The pipeline and the app now agree on one validator and one image base by construction, not by copy.

Until now `deps.validate` was `stubValidate`, a stand-in that checked only what the pipeline writes. It stops being production code here. It stays useful as a test double, because a unit test of `cli build` should not also be a test of the app's validator, so the file moves into `pipeline/tests/`.

- [ ] **Step 1: Confirm the merge and rebase**

Run: `git log --oneline -1 main`
Expected: the app branch's last commit, not the commit this branch started from.

Run: `git rebase main`
Expected: `Successfully rebased and updated refs/heads/pipeline`, or `Current branch pipeline is up to date`.

Run: `ls app/logic/content.js`
Expected: the path prints.

- [ ] **Step 2: Set the real CDN base in `app/logic/content.js`**

The app plan ships a placeholder. Task 19 creates the bucket and the CDN binding, and that is where the host below comes from. Set it now so the pipeline and the app read one value; Task 19 confirms it serves.

Find this line:

```js
export const CDN_BASE = 'https://REPLACE-WITH-CDN-HOST/';
```

Replace it with:

```js
export const CDN_BASE = 'https://img.dendro.app/';
```

The trailing slash is part of the value. `imageUrl(photo, CDN_BASE)` returns `<base>img/<hash>.jpg`, so a base with no slash would build `...appimg/`.

- [ ] **Step 3: Move the stub out of `pipeline/lib/`**

Run:

```bash
git mv pipeline/lib/stub_validator.ts pipeline/tests/fake_validator.ts
```

Expected: no output.

Then edit the comment at the top of `pipeline/tests/fake_validator.ts`. Find the lines that say it is a stand-in until the app branch merges and that Task 17 deletes it, and replace that comment with:

```ts
// A test double for the content validator. The real one is validateContent in
// app/logic/content.js, which the CLI uses. A unit test of cli build should not
// also be a test of the app's validator, so the tests keep this small stand-in.
```

- [ ] **Step 4: Repoint the three test imports**

In `pipeline/tests/cli_build.test.ts`, replace:

```ts
import { stubValidate, type ValidationResult } from '../lib/stub_validator.ts';
```

with:

```ts
import { stubValidate, type ValidationResult } from './fake_validator.ts';
```

In `pipeline/tests/cli_fetch.test.ts`, replace:

```ts
import { stubValidate } from '../lib/stub_validator.ts';
```

with:

```ts
import { stubValidate } from './fake_validator.ts';
```

In `pipeline/tests/run.test.ts`, replace:

```ts
import { stubValidate } from '../lib/stub_validator.ts';
```

with:

```ts
import { stubValidate } from './fake_validator.ts';
```

- [ ] **Step 5: Run the suite to confirm the move broke nothing**

Run: `node --test "pipeline/tests/**/*.test.ts"`
Expected: PASS, 194 tests. The move changes no behaviour, so the count is the same as at the end of Task 14.

- [ ] **Step 6: Wire the real validator into `pipeline/cli.ts`**

Remove this import line:

```ts
import { stubValidate } from './lib/stub_validator.ts';
```

Add this import in its place. It is the only line in `pipeline/` that reaches into `app/`, and it is the boundary spec section 2 names:

```ts
// The one import that crosses from pipeline/ into app/. The validator is shared,
// never copied, and CDN_BASE is the app's own value, so the two cannot drift.
import { CDN_BASE, validateContent } from '../app/logic/content.js';
```

In the `main` guard, replace these two lines:

```ts
    // Task 17 points this at the app's CDN_BASE. A trailing slash is part of the value.
    cdn_base: process.env.CDN_BASE ?? '',
    validate: stubValidate,
```

with:

```ts
    cdn_base: CDN_BASE,
    validate: validateContent,
```

- [ ] **Step 7: Write the wiring test**

`pipeline/tests/validator_wiring.test.ts`:

```ts
// These three tests are the seam between the pipeline and the app. They fail the
// day someone copies the validator instead of importing it, or leaves the CDN
// base on its placeholder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CDN_BASE, validateContent } from '../../app/logic/content.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function readContent(dir: string): Record<string, unknown> {
  const files: Record<string, string> = {
    species: 'species.json',
    concepts: 'concepts.json',
    confusion: 'confusion.json',
    units: 'units.json',
    manifest: 'images/manifest.json',
  };
  const raw: Record<string, unknown> = {};
  for (const [field, file] of Object.entries(files)) {
    raw[field] = JSON.parse(readFileSync(join(ROOT, dir, file), 'utf8'));
  }
  return raw;
}

test('the app validator accepts the live content set', () => {
  const result = validateContent(readContent('content'));
  assert.deepEqual(result.errors, []);
});

test('the app validator returns the shape the CLI expects', () => {
  const result = validateContent(readContent('content'));
  assert.ok(Array.isArray(result.errors));
  assert.ok(Array.isArray(result.warnings));
  for (const entry of [...result.errors, ...result.warnings]) {
    assert.equal(typeof entry.file, 'string');
    assert.equal(typeof entry.message, 'string');
  }
});

test('CDN_BASE is set and ends in a slash', () => {
  assert.ok(CDN_BASE.endsWith('/'));
  assert.ok(!CDN_BASE.includes('REPLACE'));
  assert.ok(CDN_BASE.startsWith('https://'));
});
```

- [ ] **Step 8: Run the wiring test**

Run: `node --test pipeline/tests/validator_wiring.test.ts`
Expected: PASS, 3 tests.

Run: `node --test "pipeline/tests/**/*.test.ts"`
Expected: PASS, 197 tests. That is the 194 of Task 14 plus these 3.

Run: `npm test`
Expected: the app suite, still green. This task changed one string in `app/logic/content.js`, and the app's own test asserts only that `CDN_BASE` ends in a slash.

- [ ] **Step 9: Confirm the CLI runs with the real validator**

Run: `node pipeline/cli.ts ids check`
Expected: `content ids are append-only`, and exit code 0. On the first run, when `main` holds no content, the check is skipped and prints the same line.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: import the app validator and the CDN base into the pipeline" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: The append-only check in CI

This task starts only after the app branch has merged to `main` and this branch has been rebased onto `main`. Before that, `.github/workflows/check.yml` does not exist here. Tasks 16 and 17 do the same rebase, so by now the branch is already on `main`; run `git rebase main` anyway and expect `Current branch pipeline is up to date`.

**Files:**
- Modify: `.github/workflows/check.yml`

**Interfaces:**
- Consumes: `node pipeline/cli.ts ids check --base <ref>` from Task 14.
- Produces: a CI job that fails a pull request which drops a published ID.

Spec section 11 puts the append-only check in `cli build` and in CI. `cli build` has it from Task 14. This adds it to the pull-request job, so an ID cannot leave `main` even when someone edits `content/` by hand.

Two details drive the shape of the step:

- `actions/checkout@v4` fetches one commit by default, and on a pull request it checks out a merge ref, so the local branch `main` does not exist. The step fetches `origin/main` and passes it with `--base`.
- The check needs the *published* content, which is what `main` holds. On a pull request that is the base branch. On a push to `main` it is the commit before the push, and `origin/main` after the fetch is the pushed commit itself, so the check compares the content to itself and passes. That is correct: the gate belongs on the pull request, which is the only way content reaches `main`.

- [ ] **Step 1: Confirm the merge and the workflow file**

Run: `git rebase main`
Expected: `Current branch pipeline is up to date`.

Run: `cat .github/workflows/check.yml`
Expected: the app plan's Task 13 workflow, with a `check` job and a `deploy` job.

- [ ] **Step 2: Add the fetch depth and the append-only step**

Edit `.github/workflows/check.yml`. In the `check` job, replace:

```yaml
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
```

with:

```yaml
      - uses: actions/checkout@v4
        with:
          # The append-only check reads the published content from main. A default
          # checkout fetches one commit and no main ref, so the check has nothing
          # to compare against.
          fetch-depth: 0
      - uses: actions/setup-node@v4
```

Then, after the `Validate the fixture content` step, add:

```yaml
      - name: Fetch the published content
        run: git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
      - name: Check the content ids are append-only
        # A card ID is a foreign key in other people's review logs. Once an ID has
        # shipped it never leaves the content, retired or not.
        run: node pipeline/cli.ts ids check --base origin/main
```

The two steps stay in the `check` job, before `deploy`. The `deploy` job is unchanged.

- [ ] **Step 3: Read the whole file back**

Run: `cat .github/workflows/check.yml`
Expected: the `check` job now has seven steps in this order: `checkout`, `setup-node`, `Run the tests`, `Validate the live content`, `Validate the fixture content`, `Fetch the published content`, `Check the content ids are append-only`. The two new ones are last, and `checkout` carries `fetch-depth: 0`.

- [ ] **Step 4: Run the check locally the way CI runs it**

Run: `git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main`
Expected: either `From <remote>` with a line for `main`, or no output when it is already current.

Run: `node pipeline/cli.ts ids check --base origin/main`
Expected: `content ids are append-only`, exit code 0. When `origin/main` holds no `content/species.json` yet, the same line prints, because the check is skipped on a first run.

- [ ] **Step 5: Prove the check fails on a dropped ID**

This is a throwaway edit. It confirms the gate is live, and then it is undone.

Edit `content/species.json` and delete one whole species record, keeping the JSON valid.

Run: `node pipeline/cli.ts ids check --base origin/main`
Expected: exit code 1, and a line naming the symbol, in the shape `species:QUGA is in the published species.json and is gone from the new content`.

Run: `git checkout -- content/species.json`
Expected: no output.

Run: `node pipeline/cli.ts ids check --base origin/main`
Expected: `content ids are append-only`, exit code 0.

When `content/species.json` is still `{}` on `main`, there is no record to delete. Skip this step and write one line in the pull request saying the gate was first exercised by the `ids` unit tests of Task 11 and the `cli_build` tests of Task 14.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/check.yml && git commit -m "ci: check that content ids are append-only" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 7: Watch the workflow**

Push the branch and open the pull request's Checks tab, or run:

```bash
gh run watch
```

Expected: the `check` job passes all seven steps. The `deploy` job does not run, because the branch is not `main`.

---

### Task 19: The first public run

This task starts only after the app branch has merged to `main`, this branch has been rebased onto `main`, and Tasks 16, 17, and 18 are done.

Every earlier task ran offline against fixtures a person wrote by hand from the documented field shapes. This task points the pipeline at the live sources for the first time. It is mostly a checklist, because most of it is a person reading a page, creating a bucket, or confirming a value that only a live response can settle. Nothing here is guesswork the plan could have removed: each item is a fact the plan could not check without the network.

**Files:**
- Modify: `pipeline/lib/http.ts` (the contact URL, only if it is wrong)
- Modify: `pipeline/data/quercus_sections.json` (the full 90 rows, written by the CLI)
- Modify: `pipeline/data/inat_terms.json` (the confirmed flowering value id, written by the CLI)
- Modify: `pipeline/tests/fixtures/*` (recorded responses in place of the hand-built ones)
- Modify: `pipeline/lib/plants.ts` (the part-code table and the checklist name rule, only if the live data disagrees)

**Interfaces:**
- Consumes: every command from Tasks 13 and 14.
- Produces: a bucket that serves images, two committed data tables built from the live sources, fixtures that are real recordings, and two merged content runs.

- [ ] **Step 1: Confirm the User-Agent contact URL**

Spec section 10 says Wikimedia's policy expects the address in the User-Agent to reach a person who can answer, and that a placeholder will not do. Without a compliant User-Agent, Commons drops from 200 requests per minute to 10.

Run: `node -e "import('./pipeline/lib/http.ts').then(m => console.log(m.USER_AGENT))"`
Expected: `dendro-pipeline/0.1.0 (https://github.com/jdenn0514/dendro)`

Open that URL in a browser. Confirm all three:

1. The page loads and is not a 404.
2. The repository has an open issues tab, or a README that names an address.
3. A stranger reading the page can work out how to reach the owner about a photo.

When any of the three fails, edit `CONTACT_URL` in `pipeline/lib/http.ts` to an address that passes, and run `node --test pipeline/tests/http.test.ts`. The test asserts the shape of the string, not the host, so it stays green.

Do not run any other step until this one passes. Every later step makes live requests that carry this string.

- [ ] **Step 2: Create the bucket and the CDN binding**

This is done by hand in the Cloudflare dashboard, once. The provider must offer an S3-compatible API and charge nothing for egress; R2 and Backblaze B2 both do, and the plan picked R2.

1. Create an R2 bucket named `dendro-images`.
2. Under the bucket's Settings, connect a custom domain `img.dendro.app`. This is the host in `CDN_BASE`, set in Task 17. Confirm it matches.
3. Add a lifecycle rule on the prefix `review/`: delete an object 30 days after it is written. Leave `img/` with no rule; those objects are permanent.
4. Create an API token scoped to this one bucket, with object read and write.

- [ ] **Step 3: Set the environment**

The key and the bucket name are never committed. Set these five variables in the shell that runs the pipeline:

```bash
export DENDRO_S3_ENDPOINT="https://<account_id>.r2.cloudflarestorage.com"
export DENDRO_S3_REGION="auto"
export DENDRO_S3_BUCKET="dendro-images"
export DENDRO_S3_ACCESS_KEY_ID="<the token id>"
export DENDRO_S3_SECRET_ACCESS_KEY="<the token secret>"
```

Run: `node -e "import('./pipeline/lib/s3_storage.ts').then(m => console.log(m.s3ConfigFromEnv(process.env).bucket))"`
Expected: `dendro-images`. A missing variable throws and the message names it.

- [ ] **Step 4: Prove the bucket round-trips**

```bash
node -e "import('./pipeline/lib/s3_storage.ts').then(async m => { const s = m.s3Storage(m.s3ConfigFromEnv(process.env)); await s.put('review/_probe.jpg', new Uint8Array([1,2,3]), 'image/jpeg'); console.log('head', await s.head('review/_probe.jpg')); await s.remove('review/_probe.jpg'); console.log('head after remove', await s.head('review/_probe.jpg')); })"
```

Expected: `head true` then `head after remove false`.

Then confirm the CDN serves the `img/` prefix. Put one object, fetch it over the custom domain, and remove it:

```bash
node -e "import('./pipeline/lib/s3_storage.ts').then(async m => { const s = m.s3Storage(m.s3ConfigFromEnv(process.env)); await s.put('img/_probe.jpg', new Uint8Array([1,2,3]), 'image/jpeg'); })"
```

Run: `curl -sI https://img.dendro.app/img/_probe.jpg | head -1`
Expected: `HTTP/2 200`. A 403 means the custom domain is not bound, and a 404 means the key or the bucket is wrong.

```bash
node -e "import('./pipeline/lib/s3_storage.ts').then(async m => { const s = m.s3Storage(m.s3ConfigFromEnv(process.env)); await s.remove('img/_probe.jpg'); })"
```

- [ ] **Step 5: Build the oak section table**

The committed table ships with 12 seed rows. Flora of North America has 90 species across three pages, and the pairing of taxon id to section in `SECTION_PAGES` was read off the spec's list, not off the live pages. A wrong pairing mislabels every oak, so check it before you keep the output.

Run: `node pipeline/cli.ts data sections --refresh`
Expected: a row count near 90.

Then confirm the pairing by hand. Open each of the three pages in a browser:

- `http://www.efloras.org/browse.aspx?flora_id=1&start_taxon_id=302020`
- `http://www.efloras.org/browse.aspx?flora_id=1&start_taxon_id=302027`
- `http://www.efloras.org/browse.aspx?flora_id=1&start_taxon_id=302029`

Read the section name at the top of each. The site's certificate is self-signed, so the URLs are `http://`.

Run: `node -e "const t=require('fs').readFileSync('pipeline/data/quercus_sections.json','utf8');const j=JSON.parse(t);console.log(j['Quercus rubra'], j['Quercus alba'], j['Quercus chrysolepis'])"`
Expected: `Lobatae Quercus Protobalanus`. Red oak is Lobatae, white oak is Quercus, canyon live oak is Protobalanus. Any other answer means `SECTION_PAGES` pairs the ids wrongly. Fix the pairing in `pipeline/lib/fna.ts`, re-run `data sections --refresh`, and run `node --test pipeline/tests/fna.test.ts`.

- [ ] **Step 6: Confirm the iNaturalist flowering value id**

`pipeline/data/inat_terms.json` ships `{ "flowering_value_id": 13 }`. Spec section 3 says the value is read off a live observation at build time, because the `controlled_terms` endpoint did not answer.

Run: `node pipeline/cli.ts data inat-terms --refresh`
Expected: a line naming the value it found, and the file rewritten.

Confirm it by eye. Open an iNaturalist observation that carries a Flowering annotation and read the value id off the annotations in the API response:

```bash
curl -s -H "User-Agent: dendro-pipeline/0.1.0 (https://github.com/jdenn0514/dendro)" "https://api.inaturalist.org/v1/observations?term_id=12&per_page=1&photos=true&quality_grade=research" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).results[0].annotations,null,2)))"
```

Expected: one or more annotations with `controlled_attribute_id: 12`. Fruiting is 14. The flowering value is the other one. When the command found nothing, set the value by hand and say in the commit why.

- [ ] **Step 7: Check the PLANTS part-code table against a real response**

`PART_CODE_CHANNELS` in `pipeline/lib/plants.ts` maps the two- and three-letter part codes in a PLANTS image filename to a channel. The table was written from the codes the plan could justify, not from a live response. A code the table does not hold gives a `null` hint, which is safe: the approval agent assigns the channel anyway. A code mapped to the wrong channel is not safe, because the hint biases the agent.

```bash
curl -s -H "User-Agent: dendro-pipeline/0.1.0 (https://github.com/jdenn0514/dendro)" "https://plantsservices.sc.egov.usda.gov/api/PlantImages?plantId=$(node -e "console.log(JSON.parse(require('fs').readFileSync('pipeline/data/plants_ids.json','utf8'))['QUGA'])")"
```

Read the file paths in the response. For each distinct part code:

1. Open the image.
2. Confirm the channel the table assigns it.
3. Add a missing code to `PART_CODE_CHANNELS`, or correct a wrong one.

Run: `node --test pipeline/tests/plants.test.ts` after any edit.

- [ ] **Step 8: Check the checklist name rule against the real file**

`parseChecklist` runs `splitScientific` on each row. The real `plantlst.txt` writes an infraspecific name as `Quercus gambelii Nutt. var. gambelii`, with the author in the middle, and the current rule cuts that to `Quercus gambelii`. That is right for the species row and wrong for the variety row.

Run: `node pipeline/cli.ts species list <a throwaway run name> --refresh` once, so the checklist lands in the cache. Then read a handful of infraspecific rows out of the cached file and confirm what `splitScientific` does with them.

The identity check in `verdicts.ts` compares a source page's species name to the PLANTS name and its synonyms. A variety name cut back to its species name still matches the species, so the failure mode is a missed distinction, not a wrong approval. Widen `splitScientific` to keep the infraspecific epithet when the real file needs it, and run `node --test pipeline/tests/plants.test.ts`.

- [ ] **Step 9: Replace the fixtures with real recordings**

Every fixture under `pipeline/tests/fixtures/` was written by hand from the field shapes the spec documents. After Steps 5 to 8 the cache under `pipeline/cache/` holds real responses for the same calls. Replace each fixture with the matching cached body, trimmed to the rows the test reads.

For each of these fixtures, find its cached response, copy the body, and trim it:

- `plants_profile_quga.json`, `plants_profile_purple_sage.json`, `plants_profile_quun.json`
- `plants_subordinate_quga.json`, `plants_distribution_quga.csv`, `plants_images_quga.json`
- `plantlst_sample.txt`
- `fna_lobatae.html`, `fna_quercus.html`, `fna_protobalanus.html`
- `inat_taxa_quga.json`, `inat_taxa_empty.json`, `inat_observations_quga.json`
- `commons_category_quga.json`, `commons_category_quga_page2.json`

Run: `node --test "pipeline/tests/**/*.test.ts"` after each fixture.

A test that now fails has found a real difference between the documented shape and the live one. Fix the parser, not the test, unless the test asserted something the live data does not carry. Record each difference in the commit message; this is the most valuable output of this task.

- [ ] **Step 10: Commit the data tables and the fixtures**

```bash
git add -A && git commit -m "feat: build the data tables and the fixtures from the live sources" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 11: Run `concepts_v0`**

Spec section 12's first run: a concept run for the 21 level-1 categories of the leaf, bark, and fruit channels. Target 3 to 5 approved images per category, about 70 in total.

```bash
node pipeline/cli.ts run init concepts_v0 --concepts needles,scale_like,simple_entire,simple_toothed,simple_lobed,pinnately_compound,palmately_compound,fan_strap,smooth,furrowed,plated,shaggy,papery,warty,samara,acorn,nut,pod,berry,capsule,cone --channels leaf,bark,fruit
```

Then edit `pipeline/runs/concepts_v0/run.json` and fill `concept_exemplars` with two or three exemplar species per category, by PLANTS symbol. The pipeline looks each concept's photos up through its exemplars.

Then walk the `content-run` skill from step 4: `photos fetch`, the `photo-check` skill, `build`, `report`, `run pr`, the owner's review, `run finish`.

Watch for the stop rule. It fires when 20 or more candidates have a verdict and more than a quarter are escalations. When it fires, read the escalations before you change anything: a high escalation rate on a first run usually means one source's license text does not match the allowlist, not that the threshold is wrong.

- [ ] **Step 12: Run `simple_lobed_co`**

Spec section 12's second run.

```bash
node pipeline/cli.ts run init simple_lobed_co --bucket simple_lobed --states CO,UT,NM,WY,NE,KS --genera Acer,Quercus,Platanus,Liquidambar,Liriodendron --include ACPL,QURU,ACSA2,PLAC,QUPA2 --channels leaf,bark,fruit
```

The five `include` symbols are the planted species: Norway maple, red oak, silver maple, London plane, and pin oak. Confirm each symbol against the checklist before you run; `cli run init` does not check them, and `cli species list` stops the run on an unknown symbol with the message `unknown PLANTS symbol in include: <symbol>`. Look each one up at `https://plants.usda.gov/plant-profile/<SYMBOL>` and correct any that 404.

Then walk the `content-run` skill through all ten steps, including `species-draft` at step 3 and `edges-draft` at step 8. The edge target is 15 to 25 for `simple_lobed`.

- [ ] **Step 13: Confirm the published site**

After both runs merge, open the deployed site and check three things:

1. A species card shows a photo. The image URL is `https://img.dendro.app/img/<hash>.jpg`.
2. The browser network tab shows no request to `plants.usda.gov`, `inaturalist.org`, or `commons.wikimedia.org`. Every image is served from the CDN, as spec section 1 requires.
3. The attribution under each photo links to its origin page.

- [ ] **Step 14: Rehearse a takedown**

A public site with several hundred third-party photos will get an email asking for one to come down, and the answer has to be same-day. Rehearse it once, on a photo you would keep, and then rebuild.

Pick a hash from `content/images/manifest.json`.

```bash
node pipeline/cli.ts images retire <hash> --reason "takedown rehearsal"
```

Expected: a line naming the number of rows retired, the object gone from the bucket, the row still in the manifest with `retired: true`, `retired_reason`, and `retired_at`, and a commit.

Run: `curl -sI https://img.dendro.app/img/<hash>.jpg | head -1`
Expected: `HTTP/2 404`.

Confirm the app still works: the species draws from the rest of that channel's pool. Then decide whether to keep the retirement. A retired row never returns, so on a rehearsal, pick a hash on a channel that has several images and leave it retired. That is cheaper than reverting a commit that the append-only check would then reject.

---

## Spec coverage

| Spec section | Task |
|---|---|
| 1 what the pipeline does, the three kinds of worker, authored files | 13 and 14 (the CLI), 15 (the four skills), 7 (authored species), 14 (the build writes the five files) |
| 2 runtime, layout, object storage | the header's Global Constraints, 16 (dev dependencies and the S3 client), 19 (the bucket and the CDN binding) |
| 3 data sources: PLANTS, oak section, iNaturalist, Commons, the sources that are excluded | 3, 4, 5, 6. 1 holds the rate limits and the User-Agent. Forest Service enters only as a manual candidate, through `cli photos add` in 13. |
| 4 species record build, enumeration, when a species enters `species.json`, IDs are append-only | 7 (the two layers and the merge), 3 and 4 and 5 (the fetched fields), 11 (the check), 14 (the build, and where a species retires) |
| 5 authored species fields, confusion edges, units and concepts, the license allowlist | 7 (`validateAuthored` and the worked `QUGA.json`), 15 (`species-draft` and `edges-draft`), 2 (the allowlist), 14 (unit sizes) |
| 6 photo candidates per source, the candidate row, caps and dedupe | 2 (the row), 3 and 5 and 6 (the three sources), 8 (caps and dedupe), 13 (`photos fetch` and `photos add`) |
| 7 approval, the rules, the stop rule, escalations and decisions, approved images, retiring an image | 9 (verdicts, the identity check, the stop rule, decisions), 10 (uploads, manifest rows, retire), 14 (`cli images retire`), 15 (the `photo-check` skill) |
| 8 run flow, concept runs, committed run records | 13 (`run init`, `species list`, `photos fetch`, `photos add`), 14 (`build`, `report`, `run pr`, `run finish`), 15 (the `content-run` skill) |
| 9 the report and its five parts | 12 (the renderer), 14 (`cli report`, and the upload of each escalated image to the `review/` prefix) |
| 10 the HTTP layer, the limiter, the cache, the committed tables | 1 (all of it), 4 and 5 (the two committed tables), 19 (filling them from the live sources) |
| 11 validation, the append-only check, tests, errors that stop a run | 11 (the check), 13 (the unknown `include` symbol and a bad `run.json`), 14 (validation in the build, and `ids check`), 17 (the real validator), 18 (the check in CI). Every task's test file covers section 11's test list. |
| 12 the two v0 runs | 19, steps 11 and 12 |
| 13 decisions and their reasons | inherited, not re-opened. The choices list in this header records only what those decisions left open. |

### Where the spec's test list lands

Spec section 11 names twelve test groups. Each one has a file.

| Spec test group | File | Tests |
|---|---|---|
| `http` | `pipeline/tests/http.test.ts` | 12 |
| `plants` | `pipeline/tests/plants.test.ts` | 12 |
| `fna` | `pipeline/tests/fna.test.ts` | 13 |
| `commons` | `pipeline/tests/commons.test.ts` | 10 |
| `inat` | `pipeline/tests/inat.test.ts` | 12 |
| `species` | `pipeline/tests/species.test.ts` | 14 |
| `candidates` | `pipeline/tests/candidates_core.test.ts`, `pipeline/tests/candidates_collect.test.ts` | 13, 13 |
| `manifest` | `pipeline/tests/manifest.test.ts` | 13 |
| `ids` | `pipeline/tests/ids.test.ts` | 10 |
| `retire` | `pipeline/tests/manifest.test.ts`, `pipeline/tests/cli_build.test.ts` | part of the 13 and the 23 |
| `verdicts` | `pipeline/tests/verdicts.test.ts` | 10 |
| `report` | `pipeline/tests/report.test.ts` | 7 |

Three files the spec's list does not name carry the CLI and the file helpers: `pipeline/tests/jsonl.test.ts` (7), `pipeline/tests/run.test.ts` (12), `pipeline/tests/cli_fetch.test.ts` (13), and `pipeline/tests/cli_build.test.ts` (23).

At the end of Task 14 the suite is **194 tests**. Task 17 adds 3, for 197. Task 16 adds `pipeline/tests/sharp_resizer.test.ts` (6), which needs `npm install` first and runs under `npm run test:pipeline`.

### What this plan does not build

- The content itself: the species set, the vocabularies, and the edges. That is a third spec. This plan builds the machine and ships one worked authored record, `content_src/species/QUGA.json`.
- The sync server and the analytics queries. Spec section 1 names them as their own spec.
- Anything under `app/`, except one line in `app/logic/content.js` in Task 17. The app plan owns that file.

