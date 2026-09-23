# Dendro Content Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the content pipeline that fills `content/` for the Dendro app: it fetches species facts and photos from USDA PLANTS, Flora of North America, iNaturalist, and Wikimedia Commons, has agents approve the photos, uploads the approved ones to object storage, and opens a draft pull request with a report.

**Architecture:** One entry, `pipeline/cli.ts`, dispatches to the command handlers in `pipeline/lib/commands.ts`. Pure modules under `pipeline/lib/` parse a response, merge a record, or render a table. Network, the clock, object storage, and image resizing arrive as parameters; a module that reads or writes a file takes the path as a parameter. Every test under `pipeline/tests/` runs offline against fakes and fixtures. A run's records live under `pipeline/runs/<name>/` and are committed as the audit trail. Approved images leave the repo: the pipeline uploads them to object storage behind a CDN, keyed by the sha256 of the resized bytes. The validator is the app's own `validateContent`, imported from `app/logic/content.js`, so the two halves cannot drift.

**Tech Stack:** Node 24 with TypeScript, run through Node's built-in type stripping. No compile step. Dev dependencies only: `sharp` for resizing, `@aws-sdk/client-s3` for the uploads, and `@types/node`. Tests run with `node --test`. `git` and `gh` do the branch and the pull request.

## Global Constraints

- Node 24 or later. TypeScript runs through Node's built-in type stripping. There is no build step. The machine this plan was written on runs Node v22.23.2; see "Before you start".
- Erasable TypeScript syntax only: no enums, no parameter properties, no namespaces. A relative import inside `pipeline/` carries the `.ts` extension.
- Dev dependencies only, and three of them: `sharp`, `@aws-sdk/client-s3`, `@types/node`. The app imports none of them and keeps zero runtime dependencies.
- Pipeline tests live in `pipeline/tests/` and run with `node --test "pipeline/tests/**/*.test.ts"`. They need no `node_modules`. The app keeps its own `node --test "tests/**/*.test.js"`.
- No test under `pipeline/tests/` calls a live API. Every network call goes through `pipeline/lib/http.ts`, which takes `fetchImpl` as a required option. Tests feed it fixtures under `pipeline/tests/fixtures/`.
- No test under `pipeline/tests/` needs `sharp` or an S3 client. Image resizing is the `Resize` function type and object storage is the `Storage` interface. Tests pass fakes. The two tests that need the real libraries live in `pipeline/tests_live/` and run with `npm run test:live` after `npm install`.
- Every data name is snake_case: JSON fields, file names, directory names. CLI flags are kebab-case (`--file-url`). TypeScript identifiers that are never serialized are camelCase; types are PascalCase.
- Timestamps are ISO 8601 with a `Z`. Dates are `YYYY-MM-DD`.
- The manifest row shape, the `retired` fields, the `img/<hash>.jpg` object key, the 1200 px quality 82 EXIF-stripped JPEG, and the append-only rule are fixed by both specs. Do not redesign them.
- Every live manifest row carries a non-empty `author`, `source`, and `license`. The app prints them verbatim as the photo credit, and `validateContent` fails a row without them.
- The pipeline never runs in the app and never on the server. CI runs the app tests, the validator, and `cli ids check`; nothing else from the pipeline.
- The fixture under `content_dev/` belongs to the app. The pipeline never writes it.
- `pipeline/runs/` is committed. `pipeline/cache/`, `node_modules/`, and `.env` are ignored by git (`.gitignore` already holds all three).
- Commit messages end with the line: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

## Before you start

These are the steps only a person can do. Line them up before the first task, in this order.

| # | Prerequisite | First needed at |
|---|---|---|
| 1 | Node 24 or later on the machine (`node --version`) | Task 1 Step 2, the first `node --test` |
| 2 | npm registry access | Task 16 Step 2, `npm install` |
| 3 | `gh` authenticated with push rights to `JDenn0514/Dendro`; GitHub Actions enabled | Task 18, the pull request that merges `pipeline` into `main` |
| 4 | A contact URL that reaches a person, as Wikimedia's policy expects. `CONTACT_URL` is `https://github.com/JDenn0514/Dendro`; the repository page must show how to reach the owner | Task 19 Step 1 |
| 5 | Cloudflare: the R2 bucket `dendro-images` and the `expire-review` lifecycle rule that deletes the `review/` prefix after 30 days (both exist today), a custom domain `img.learndendro.com` bound to the bucket, and an API token scoped to the bucket with object read and write | Task 19 Step 2 |
| 6 | A `.env` file at the repo root with the five `DENDRO_S3_*` values (endpoint, region, bucket, access key id, secret access key) | Task 19 Step 3 |
| 7 | The owner's judgment: `concept_exemplars` in a concept run's `run.json`, `decisions.json` after each review, the `ref` and habitat fields of authored species files, and each merge | Task 19 Steps 8 to 15 |
| 8 | GitHub Pages configured for the repository | Task 19's site check |

## For agentic workers

- The machine is Windows 11 with Git Bash. Any single shell command must stay under 5,000 bytes.
- Write file contents with the Write tool. Edit files with the Edit tool. Never use heredocs, `cat > file`, `echo >`, or `sed -i` for file content.
- Run one test file with `node --test pipeline/tests/<name>.test.ts`. Run the pipeline suite with `node --test "pipeline/tests/**/*.test.ts"`.
- Commit with two `-m` flags so the command stays short:
  `git commit -m "feat: subject line" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`
- This plan runs on branch `pipeline`, branched from `main`. The app is merged on `main`, so `package.json`, `app/logic/content.js`, `scripts/validate_content.js`, `.github/workflows/check.yml`, and the five files under `content/` all exist from the first task. Tasks 1 to 15 touch only `pipeline/`, `content_src/`, and `.claude/skills/`. Tasks 16 to 19 edit the shared files named below.
- `cli run init` branches from `main`, so `main` must hold `pipeline/` before Task 19. Task 18 ends with that merge.

## File Structure

| File | Responsibility |
|---|---|
| `pipeline/cli.ts` | Entry point and `main` guard. Wires the real dependencies: a child-process `Exec`, `createHttp` with the global `fetch`, `sharpResize` and `s3Storage` loaded on demand, `validateContent` and `CDN_BASE` from the app, `.env` through `process.loadEnvFile()`. Task 16 creates it. |
| `pipeline/lib/commands.ts` | `CliDeps`, `RawContent`, `runCommand`, and every command handler. Tasks 13 and 14. |
| `pipeline/lib/http.ts` | Host groups, per-group limiter and in-flight cap, disk cache, User-Agent, 429 and 5xx retry. |
| `pipeline/lib/jsonl.ts` | Read, write, and append a JSON-lines file. |
| `pipeline/lib/candidates.ts` | The candidate row, `SOURCE_NAMES`, the license allowlist, the channel hints (Task 2); `mergeFound`, `collect`, and the caps (Task 8). |
| `pipeline/lib/plants.ts` | PLANTS profile, subordinate taxa, distribution, checklist, and image parsing. |
| `pipeline/lib/fna.ts` | The oak section table from Flora of North America, with next-page following. |
| `pipeline/lib/json_fields.ts` | `asRecord`, `asString`, `asNumber`, `asArray`: one null-returning contract for reading a JSON body. Task 5. |
| `pipeline/lib/licenses.ts` | `normalizeLicenseUrl`: one spelling for a license URL. Task 5. |
| `pipeline/lib/inat.ts` | iNaturalist taxon lookup and observation photos. |
| `pipeline/lib/commons.ts` | Wikimedia Commons category listing and image info. |
| `pipeline/lib/species.ts` | The fetched layer, the authored layer, their validation, and the merge. |
| `pipeline/lib/verdicts.ts` | Verdict rows, their validation, the identity check, the stop rule, and owner decisions. |
| `pipeline/lib/images.ts` | The sha256, the object key, and the `Resize` type. |
| `pipeline/lib/storage.ts` | The `Storage` interface, the in-memory fake, and `deferredStorage`. |
| `pipeline/lib/manifest.ts` | Approved verdicts to uploads and manifest rows (`publishApproved`), and `retireRows`. |
| `pipeline/lib/ids.ts` | The append-only check over the last published content. |
| `pipeline/lib/report.ts` | `report.md` from one `ReportData`. |
| `pipeline/lib/run.ts` | Run scope, flag parsing, scope validation, branch, commit, and the draft pull request. |
| `pipeline/lib/sharp_resizer.ts` | The real `Resize`, built on `sharp`. Task 16. |
| `pipeline/lib/s3_storage.ts` | The real `Storage`, built on `@aws-sdk/client-s3`. Task 16. |
| `pipeline/data/quercus_sections.json` | Committed table, scientific name to oak section. |
| `pipeline/data/inat_terms.json` | Committed `flowering_value_id`. |
| `pipeline/data/plants_ids.json` | Committed map, PLANTS symbol to `{ id, scientific }`. `species list` writes it. |
| `pipeline/tests/*.test.ts` | The offline suite. |
| `pipeline/tests/fixtures/` | Fixture responses. Hand-built until Task 19 records the real ones. |
| `pipeline/tests_live/*.test.ts` | The two tests that need `sharp` and the S3 client. `npm run test:live`. |
| `pipeline/runs/<name>/` | `run.json`, `candidates.jsonl`, `verdicts.jsonl`, `decisions.json`, `build.json`, `report.md`. |
| `pipeline/cache/` | Raw responses and original images. Ignored by git. |
| `content_src/species/<SYMBOL>.json` | Authored species fields with `ref`. |
| `.env` | The five `DENDRO_S3_*` values. Ignored by git. |
| `.claude/skills/content-run/` | The orchestrating skill, one step per CLI command. |
| `.claude/skills/photo-check/` | The approval agent. |
| `.claude/skills/species-draft/` | Authored species fields from named references. |
| `.claude/skills/edges-draft/` | Confusion edges from named references. |

Five files are shared with the app. `package.json` changes in Task 16. `.github/workflows/check.yml` changes in Task 18. `app/logic/content.js` and `tests/content.test.js` change in Task 19 Step 5, when the CDN host moves from the r2.dev development URL to the custom domain. `content/*.json` is what `cli build` writes.

## Choices made where the spec is silent

Each choice is the simplest option that satisfies the surrounding rules.

1. **Network, the clock, object storage, and image resizing arrive as parameters.** Disk does not: a module that reads or writes a file takes the path as a parameter. This is what lets the suite run offline.
2. **The license allowlist and the candidate row sit in `candidates.ts` from Task 2**, because every source module imports them. `mergeFound`, `collect`, and the caps join the same file in Task 8.
3. **The channel list is `leaf`, `bark`, `fruit`, `flower`, `twig`.** v0 content covers the first three. The hint table maps keywords onto all five, because a Commons file name says `catkin` whether or not a flower unit exists yet. The app derives its own channels from `concepts.json`, and a run's scope limits the channels a verdict may name, so `flower` and `twig` stay hint-only until a concept exists on them.
4. **`licenseAllowed` matches normalized words, not an exact string.** It lower-cases the text, splits on non-letters, and admits `public domain`, `cc0`, `us government work`, and `cc by`. A word from `nc`, `nd`, `noncommercial`, `nonderivative`, `noderivatives`, `noderivs` rejects the text. A version number never changes the verdict.
5. **The S3-compatible client is `@aws-sdk/client-s3`.** It talks to Cloudflare R2 through an endpoint override, so the provider stays open.
6. **The object storage provider is Cloudflare R2, and the bucket `dendro-images` already exists.** The five connection values live in a local `.env`, which `pipeline/cli.ts` loads with `process.loadEnvFile()`.
7. **Fixtures are hand-built from the field shapes the spec documents.** No machine on this plan can reach the network before Task 19. Task 19 replaces each fixture with a recorded response after the first live fetch and re-runs the suite.
8. **`pipeline/data/quercus_sections.json` ships seeded** with the oaks the v0 run names. `cli data sections` follows each section's "Next page" links and fills the full table on a machine with network. Task 19 runs it.
9. **`pipeline/data/inat_terms.json` holds `flowering_value_id`,** committed. `cli data inat-terms` reads the phenology annotations off a page of live observations, removes the fruiting value, and requires exactly one value to remain; otherwise it exits 1 and lists what it saw. Task 19 runs it.
10. **The contact URL in the User-Agent is `https://github.com/JDenn0514/Dendro`.** Task 19 confirms it reaches a person before the first public run, as Wikimedia's policy expects.
11. **A candidate id is the sha1 hex of `<target>|<origin>`.** Two sources that name one origin for one target collapse to one row. One photo judged for two targets, as in a concept run, is two rows with two ids, so a verdict names one row without ambiguity.
12. **The last verdict row for a candidate id wins.** An owner decision is written after the agent verdict, so it overrides it without deleting anything. `publishApproved` applies the rule itself, so it has one home.
13. **Escalated review copies use the key `review/<candidate_id>.jpg`,** so the lifecycle rule can target the whole prefix and a re-render overwrites rather than duplicates.
14. **Every command takes a root directory.** `runCommand(argv, deps)` reads `deps.root`, so a test runs a whole command against a temp directory.
15. **The append-only check reads `main` through an injected `gitShow(path)`** that returns `null` when the path is absent. Its ids carry the channel on a concept and the target and channel on an image, so the check sees what the app keys on.
16. **The validator is the app's `validateContent`, from Task 13 on.** `CliDeps.validate` is that function, and `cli build` uses the app's `loadContent` for unit card counts, so the 5-to-25 band and every other content rule live in the app only. Tests pass the real validator and fixtures in the real shapes.
17. **A manual candidate is appended with `cli photos add`, and a verdict with `cli photos verdict`,** one flag per field. No agent writes `candidates.jsonl` or `verdicts.jsonl` directly, so each file has one writer.
18. **`plants_ids.json` maps a symbol to `{ id, scientific }`.** `cli species list` writes it and `photos fetch` reads it, so `photos fetch` makes no profile call for a known symbol. `build` needs the genus, family, and common name, which only the profile holds, so it calls `fetchProfile`; the disk cache from `species list` answers without a request.
19. **`cli build` writes `content/` only after the validator and the append-only check both pass.** It builds the whole set in memory first.
20. **The report is rendered from one `ReportData` object.** `cli report` gathers the data and `renderReport` returns a string, so the test compares a string to a stored file and checks its structure.
21. **A PLANTS origin carries the image path as a URL fragment**, `https://plants.usda.gov/plant-profile/<SYMBOL>#image=<path>`, and an iNaturalist origin carries the photo id, `https://www.inaturalist.org/observations/<id>#photo=<photo_id>`. Neither site has a page per image, and the fragment never reaches the server, so the link still opens the attribution page. Without the fragment every image of one species and target would share one id.
22. **`cli build` uploads last.** The build resizes and hashes in memory, wraps the storage client in `deferredStorage` to queue the puts, runs the validator and the append-only check, and flushes only when both pass.
23. **A species retires only on purpose.** `cli species retire <SYMBOL> --reason "<text>"` retires one, and `cli build` retires a species whose every manifest row is retired. A run never retires a species by leaving it out: `carryPublished` copies every published record the run does not rebuild, verbatim.
24. **`cli build`, `cli ids check`, `cli images retire`, and `cli species retire` take `--base <ref>`, defaulting to `main`.** GitHub Actions checks out a pull request with no local `main`, so the CI step of Task 18 passes `origin/main`.
25. **`CliDeps` carries `cdn_base`,** and `pipeline/cli.ts` sets it from the app's `CDN_BASE`, so the two never drift. The report links an escalated image through it.
26. **A concept run's exemplar species live in `run.json` under `concept_exemplars`.** `cli run init --concepts` writes an empty object and the owner fills it before `photos fetch`, because the exemplars are a content judgment, not something a script can derive.
27. **The CDN host is `img.learndendro.com`.** The owner bought `learndendro.com` through Cloudflare Registrar on 2026-09-23, so it is a zone in the same Cloudflare account as the bucket, which is what R2 requires: it binds a custom domain only to a zone in that account. An earlier draft named `img.dendro.app`, but `dendro.app` is registered to someone else. `CDN_BASE` holds the bucket's r2.dev development URL today. Task 19 Step 2 binds the host to the bucket, Step 5 writes it into `CDN_BASE`, and the app test then holds it there.
28. **A manifest row's `source` is a display name**: `USDA PLANTS Database`, `iNaturalist`, `Wikimedia Commons`. The app prints it verbatim in the photo credit. The candidate row carries `source_key` (`plants`, `inat`, `commons`, `manual`) for the cache directory and the report counts.
29. **A concept target is `<channel>/<key>`,** the form the app validator requires. A concept run names its concepts qualified, and its channels are the distinct prefixes; it takes no `--channels` flag.
30. **The channel cap is per target and channel.** `countByTargetChannel` joins verdicts to candidates, so eight approved bark photos of one species never stop bark collection for the next.
31. **Verdicts are validated before they publish.** `validateVerdicts` rejects an approve with no channel, a channel outside the run's scope, a concept approve on the wrong channel, and an unknown candidate id. `cli build` and `cli run finish` stop on the first list of errors.
32. **`author`, `source`, and `license` are gated twice.** Each source module drops an image with an empty author, `photos add` requires all three flags, and `publishApproved` throws on an empty value as a last guard. The app validator would fail the row otherwise, after every upload decision was made.
33. **Image bytes share their listing host's rate bucket.** `HOST_GROUP` maps `upload.wikimedia.org` onto `commons.wikimedia.org`, the iNaturalist photo hosts onto `api.inaturalist.org`, and `plants.sc.egov.usda.gov` onto `plantsservices.sc.egov.usda.gov`. Image bytes never expire from the cache.
34. **The entry and the handlers are two files.** `pipeline/lib/commands.ts` holds every handler and imports nothing that needs `node_modules`. `pipeline/cli.ts` loads `sharp` and the S3 client only when a command needs them, so `cli ids check` runs in CI with no install step.
35. **The identity check runs in `photos fetch`.** Each candidate carries `identity_match`, the result of comparing its `source_species` to the species' scientific name and PLANTS synonyms, and the photo-check agent reads the field.

---

### Task 1: The HTTP layer

**Files:**
- Create: `pipeline/lib/http.ts`
- Test: `pipeline/tests/http.test.ts`

**Interfaces:**
- Consumes: nothing. This is the first module.
- Produces:
  - `VERSION: string` (`'0.1.0'`)
  - `CONTACT_URL: string` (`'https://github.com/JDenn0514/Dendro'`)
  - `USER_AGENT: string` (`` `dendro-pipeline/${VERSION} (${CONTACT_URL})` ``)
  - `HOST_GROUP: Record<string, string>`
  - `RATE_PER_SECOND: Record<string, number>`
  - `MAX_IN_FLIGHT: Record<string, number>`
  - `CACHE_DAYS: Record<string, number>`
  - `MS_PER_SECOND: number` (`1000`)
  - `DAY_MS: number` (`86400000`)
  - `MAX_RETRIES: number` (`3`)
  - `BACKOFF_BASE_MS: number` (`2000`)
  - `NO_RETRY_AFTER_MS: number` (`30000`)
  - `DEFAULT_RATE_PER_SECOND: number` (`1`)
  - `DEFAULT_MAX_IN_FLIGHT: number` (`1`)
  - `DEFAULT_CACHE_DAYS: number` (`7`)
  - `interface HttpFailure { url: string; status: number; message: string; at: string }`
  - `interface TextResult { ok: boolean; status: number; body: string; fromCache: boolean; error: string | null }`
  - `interface BytesResult { ok: boolean; status: number; bytes: Uint8Array | null; fromCache: boolean; error: string | null }`
  - `interface HttpOptions { cacheDir: string; fetchImpl: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; refresh?: boolean }`
  - `interface Http { getText(url: string): Promise<TextResult>; postJson(url: string, body: unknown): Promise<TextResult>; getBytes(url: string): Promise<BytesResult>; failures: HttpFailure[] }`
  - `hostOf(url: string): string`
  - `cachePath(cacheDir: string, url: string, suffix: string): string`
  - `createHttp(options: HttpOptions): Http`

Every network call in the pipeline goes through this module. It holds one gate per host
group, retries on 429 and 5xx, records a failure row for each url it gives up on, and
caches every good response.

The clock, the sleep, and the fetch arrive as options. `fetchImpl` is required: there is
no fallback to the global `fetch`, so a test can never reach the network by accident. The
`main` guard in `pipeline/cli.ts` (Task 13) passes the global `fetch`.

The module writes the cache to disk. That is not a hidden global: the caller passes the
directory as `cacheDir`, so a test points it at a temporary directory.

**Host groups.** One site serves its API from one host and its files from another. The
politeness budget belongs to the site, not to the host name, so `HOST_GROUP` maps a file
host onto its API host. The limiter, the in-flight cap, and the cache days all key on the
group. `upload.wikimedia.org` therefore draws on the same gate as
`commons.wikimedia.org`, and the two iNaturalist photo hosts draw on the
`api.inaturalist.org` gate. The cache directory still keys on the real host, because it is
a path and not a budget.

**Image bytes never expire.** `getBytes` returns a cached file whatever its age. The bytes
behind an image url do not change; a new photo gets a new url.

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
import {
  BACKOFF_BASE_MS,
  CACHE_DAYS,
  DAY_MS,
  HOST_GROUP,
  MAX_IN_FLIGHT,
  MAX_RETRIES,
  MS_PER_SECOND,
  NO_RETRY_AFTER_MS,
  RATE_PER_SECOND,
  USER_AGENT,
  cachePath,
  createHttp,
  hostOf,
} from '../lib/http.ts';
import type { HttpOptions } from '../lib/http.ts';

const INAT = 'https://api.inaturalist.org/v1/taxa?q=Quercus';
const COMMONS = 'https://commons.wikimedia.org/w/api.php?action=query';
const UPLOAD = 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Quercus_alba_bark.jpg';
const PLANTS_POST = 'https://plants.sc.egov.usda.gov/api/PlantProfile';

const INAT_GAP = MS_PER_SECOND / RATE_PER_SECOND['api.inaturalist.org'];
const COMMONS_GAP = MS_PER_SECOND / RATE_PER_SECOND['commons.wikimedia.org'];

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

/** Lets every queued microtask run, so a pending fetch shows up as pending. */
function drain(): Promise<void> {
  return new Promise<void>((resolve) => { setImmediate(resolve); });
}

test('createHttp without a fetchImpl throws', (t) => {
  const dir = tmpCacheDir(t);
  assert.throws(
    () => createHttp({ cacheDir: dir } as unknown as HttpOptions),
    /createHttp needs a fetchImpl/,
  );
});

test('the limiter spaces requests on one group and does not link groups', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{}, {}, {}]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  await http.getText(`${INAT}&page=1`);
  await http.getText(`${INAT}&page=2`);
  assert.deepEqual(fake.calls.map((c) => c.at), [0, INAT_GAP]);
  assert.deepEqual(clock.sleeps, [INAT_GAP]);
  await http.getText(COMMONS);
  assert.equal(fake.calls[2].at, INAT_GAP);
  assert.deepEqual(clock.sleeps, [INAT_GAP]);
});

test('a file host waits on its group gate, not on a gate of its own', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{}, { body: new Uint8Array([7]) }]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  assert.equal(HOST_GROUP[hostOf(UPLOAD)], hostOf(COMMONS));
  await http.getText(COMMONS);
  const bytes = await http.getBytes(UPLOAD);
  assert.equal(bytes.ok, true);
  // The image request waited out the Commons gap, so the two share one budget.
  assert.deepEqual(clock.sleeps, [COMMONS_GAP]);
  assert.deepEqual(fake.calls.map((c) => c.at), [0, COMMONS_GAP]);
});

test('two concurrent calls on one group serialize, so the second waits', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{}, {}, {}]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  // The cap on this group is above two, so only the limiter can space these calls.
  assert.equal(MAX_IN_FLIGHT[hostOf(COMMONS)] > 2, true);
  // The first call leaves the gate warm: nextAt sits one gap in the future.
  await http.getText(`${COMMONS}&page=1`);
  await Promise.all([
    http.getText(`${COMMONS}&page=2`),
    http.getText(`${COMMONS}&page=3`),
  ]);
  assert.equal(fake.calls.length, 3);
  // Each of the two waits out its own gap. Two callers that read one nextAt would
  // sleep once between them, so the second would not wait at all.
  assert.deepEqual(clock.sleeps, [COMMONS_GAP, COMMONS_GAP]);
  assert.equal(clock.now(), COMMONS_GAP * 2);
});

test('the in-flight cap holds a second request until the first finishes', async (t) => {
  const clock = makeClock();
  const started: string[] = [];
  let finishFirst = (): void => {};
  const impl = (async (url: string) => {
    started.push(String(url));
    if (started.length === 1) {
      await new Promise<void>((resolve) => { finishFirst = resolve; });
    }
    return new Response('ok', { status: 200 });
  }) as unknown as typeof fetch;
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: impl, now: clock.now, sleep: clock.sleep,
  });
  // This group has no override, so DEFAULT_MAX_IN_FLIGHT applies and only one
  // request runs at a time.
  assert.equal(MAX_IN_FLIGHT[hostOf(INAT)], undefined);
  const both = Promise.all([
    http.getText(`${INAT}&page=1`),
    http.getText(`${INAT}&page=2`),
  ]);
  await drain();
  assert.deepEqual(started.length, 1);
  finishFirst();
  const results = await both;
  assert.deepEqual(started.length, 2);
  assert.deepEqual(results.map((r) => r.ok), [true, true]);
});

test('a 429 with Retry-After sleeps that many seconds and retries', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [
    { status: 429, headers: { 'Retry-After': '5' } },
    { status: 200, body: 'second try' },
  ]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  assert.deepEqual(clock.sleeps, [5 * MS_PER_SECOND]);
  assert.equal(fake.calls.length, 2);
  assert.equal(res.ok, true);
  assert.equal(res.body, 'second try');
  assert.deepEqual(http.failures, []);
});

test('a 429 without Retry-After sleeps the default wait', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{ status: 429 }, { status: 200, body: 'late' }]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  assert.deepEqual(clock.sleeps, [NO_RETRY_AFTER_MS]);
  assert.equal(res.body, 'late');
});

test('a 429 on every attempt stops after the retry cap and records one failure', async (t) => {
  const clock = makeClock();
  const queue = Array.from({ length: MAX_RETRIES + 1 }, () => ({
    status: 429,
    headers: { 'Retry-After': '5' },
  }));
  const fake = makeFetch(clock, queue);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  assert.equal(fake.calls.length, MAX_RETRIES + 1);
  assert.deepEqual(clock.sleeps, Array.from({ length: MAX_RETRIES }, () => 5 * MS_PER_SECOND));
  assert.equal(res.ok, false);
  assert.equal(res.status, 429);
  assert.equal(http.failures.length, 1);
  assert.equal(http.failures[0].status, 429);
  assert.equal(http.failures[0].message, 'http 429');
});

test('a 500 retries with doubling waits, then records one failure', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, Array.from({ length: MAX_RETRIES + 1 }, () => ({ status: 500 })));
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  const waits = [0, 1, 2].map((n) => BACKOFF_BASE_MS * 2 ** n);
  assert.deepEqual(clock.sleeps, waits);
  assert.equal(fake.calls.length, MAX_RETRIES + 1);
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
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
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
    cacheDir: dir, fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const first = await http.getText(INAT);
  const second = await http.getText(INAT);
  assert.equal(fake.calls.length, 1);
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(second.body, 'cached body');
  assert.equal(cachePath(dir, INAT, '.json').startsWith(join(dir, hostOf(INAT))), true);
});

test('the cache expires after the group lifetime', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{ body: 'old' }, { body: 'new' }]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  await http.getText(INAT);
  clock.advance((CACHE_DAYS['api.inaturalist.org'] + 1) * DAY_MS);
  const res = await http.getText(INAT);
  assert.equal(fake.calls.length, 2);
  assert.equal(res.fromCache, false);
  assert.equal(res.body, 'new');
});

test('refresh bypasses a warm cache and rewrites it', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{ body: 'first' }, { body: 'second' }]);
  const dir = tmpCacheDir(t);
  const opts = { cacheDir: dir, fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep };
  await createHttp(opts).getText(INAT);
  const forced = await createHttp({ ...opts, refresh: true }).getText(INAT);
  assert.equal(forced.fromCache, false);
  assert.equal(forced.body, 'second');
  assert.equal(fake.calls.length, 2);
  const after = await createHttp(opts).getText(INAT);
  assert.equal(after.fromCache, true);
  assert.equal(after.body, 'second');
  assert.equal(fake.calls.length, 2);
});

test('getBytes caches image bytes and never expires them', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{ body: new Uint8Array([1, 2, 3, 4]) }]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const first = await http.getBytes(UPLOAD);
  assert.deepEqual(Array.from(first.bytes ?? []), [1, 2, 3, 4]);
  clock.advance((CACHE_DAYS[HOST_GROUP[hostOf(UPLOAD)]] + 400) * DAY_MS);
  const second = await http.getBytes(UPLOAD);
  assert.equal(fake.calls.length, 1);
  assert.equal(second.fromCache, true);
  assert.deepEqual(Array.from(second.bytes ?? []), [1, 2, 3, 4]);
});

test('a POST caches under the url and the body', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{ body: 'rows for 1' }, { body: 'rows for 2' }]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  await http.postJson(PLANTS_POST, { MasterId: 1 });
  const repeat = await http.postJson(PLANTS_POST, { MasterId: 1 });
  assert.equal(fake.calls.length, 1);
  assert.equal(repeat.fromCache, true);
  assert.equal(repeat.body, 'rows for 1');
  const other = await http.postJson(PLANTS_POST, { MasterId: 2 });
  assert.equal(fake.calls.length, 2);
  assert.equal(other.fromCache, false);
  assert.equal(other.body, 'rows for 2');
});

test('every request carries the User-Agent', async (t) => {
  assert.match(USER_AGENT, /^dendro-pipeline\/\d+\.\d+\.\d+ \(https:\/\/[^ )]+\)$/);
  const clock = makeClock();
  const fake = makeFetch(clock, [{}, { body: new Uint8Array([9]) }, {}]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  await http.getText(INAT);
  await http.getBytes(UPLOAD);
  await http.postJson(PLANTS_POST, { MasterId: 1 });
  assert.equal(fake.calls.length, 3);
  for (const call of fake.calls) assert.equal(call.agent, USER_AGENT);
});

test('a thrown fetch retries and records a failure with status 0', async (t) => {
  const clock = makeClock();
  const queue = Array.from({ length: MAX_RETRIES + 1 }, () => ({ throws: 'socket hang up' }));
  const fake = makeFetch(clock, queue);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  assert.equal(fake.calls.length, MAX_RETRIES + 1);
  assert.deepEqual(clock.sleeps, [0, 1, 2].map((n) => BACKOFF_BASE_MS * 2 ** n));
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

Three of these tests earn a note:

- **The serialized gate.** With one shared `nextAt`, a caller that starts while another
  sleeps reads the same value and waits nothing. The test warms the gate with one call,
  starts two at once, and asserts two sleeps of one gap each. The unserialized gate sleeps
  once and fails the test. The test asserts the sleeps and the clock, not each fetch time:
  the fake sleep moves the clock the moment it is called, so a fetch time says less than
  the sequence of waits does.
- **The in-flight cap.** The fake fetch for that test holds the first response open, so
  the second request is visibly held back by the cap and not by the limiter.
- **The group gate.** `getBytes` to `upload.wikimedia.org` must wait out the
  `commons.wikimedia.org` gap. A per-host gate would fire it at once.

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
export const CONTACT_URL = 'https://github.com/JDenn0514/Dendro';
export const USER_AGENT = `dendro-pipeline/${VERSION} (${CONTACT_URL})`;

/**
 * A host that serves files for an API belongs to the API's group. The limiter, the
 * in-flight cap, and the cache days key on the group, so one site draws on one budget.
 */
export const HOST_GROUP: Record<string, string> = {
  'upload.wikimedia.org': 'commons.wikimedia.org',
  'static.inaturalist.org': 'api.inaturalist.org',
  'inaturalist-open-data.s3.amazonaws.com': 'api.inaturalist.org',
  'plants.sc.egov.usda.gov': 'plantsservices.sc.egov.usda.gov',
};

export const RATE_PER_SECOND: Record<string, number> = {
  'plantsservices.sc.egov.usda.gov': 1,
  'www.efloras.org': 1,
  'api.inaturalist.org': 1,
  'commons.wikimedia.org': 2,
};

export const MAX_IN_FLIGHT: Record<string, number> = {
  'commons.wikimedia.org': 3,
};

export const CACHE_DAYS: Record<string, number> = {
  'plantsservices.sc.egov.usda.gov': 30,
  'www.efloras.org': 30,
  'api.inaturalist.org': 7,
  'commons.wikimedia.org': 7,
};

export const MS_PER_SECOND = 1000;
export const DAY_MS = 86400000;
export const MAX_RETRIES = 3;
export const BACKOFF_BASE_MS = 2000;
export const NO_RETRY_AFTER_MS = 30000;
export const DEFAULT_RATE_PER_SECOND = 1;
export const DEFAULT_MAX_IN_FLIGHT = 1;
export const DEFAULT_CACHE_DAYS = 7;

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
  fromCache: boolean;
  error: string | null;
}
export interface BytesResult {
  ok: boolean;
  status: number;
  bytes: Uint8Array | null;
  fromCache: boolean;
  error: string | null;
}
export interface HttpOptions {
  cacheDir: string;
  fetchImpl: typeof fetch;
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

function groupOf(host: string): string {
  return HOST_GROUP[host] ?? host;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function keyPath(cacheDir: string, url: string, key: string, suffix: string): string {
  // The directory is the real host, because a path is a path and not a budget.
  return join(cacheDir, hostOf(url), sha256Hex(key) + suffix);
}

export function cachePath(cacheDir: string, url: string, suffix: string): string {
  return keyPath(cacheDir, url, url, suffix);
}

function writeFile(file: string, data: string | Uint8Array): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

function lifetimeMs(group: string): number {
  return (CACHE_DAYS[group] ?? DEFAULT_CACHE_DAYS) * DAY_MS;
}

interface HostGate {
  nextAt: number;
  inFlight: number;
  queue: (() => void)[];
  chain: Promise<void>;
}

type Sent =
  | { res: Response; status: number; error: null }
  | { res: null; status: number; error: string };

interface Attempt {
  sent: Sent;
  retryable: boolean;
  waitMs: number;
}

export function createHttp(options: HttpOptions): Http {
  // No fallback to the global fetch. A test must never reach the network by accident.
  if (options.fetchImpl === undefined) throw new Error('createHttp needs a fetchImpl');
  const cacheDir = options.cacheDir;
  const fetchImpl = options.fetchImpl;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep
    ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  const refresh = options.refresh === true;
  const failures: HttpFailure[] = [];
  const gates = new Map<string, HostGate>();

  function gateFor(group: string): HostGate {
    const found = gates.get(group);
    if (found !== undefined) return found;
    const gate: HostGate = { nextAt: 0, inFlight: 0, queue: [], chain: Promise.resolve() };
    gates.set(group, gate);
    return gate;
  }

  async function acquire(group: string): Promise<void> {
    const gate = gateFor(group);
    const limit = MAX_IN_FLIGHT[group] ?? DEFAULT_MAX_IN_FLIGHT;
    while (gate.inFlight >= limit) {
      await new Promise<void>((resolve) => { gate.queue.push(resolve); });
    }
    gate.inFlight += 1;
    // One promise chain per group. A caller takes its turn only after the caller
    // before it writes nextAt, so two callers never read the same value and fire
    // together.
    const turn = gate.chain.then(async () => {
      const wait = gate.nextAt - now();
      if (wait > 0) await sleep(wait);
      gate.nextAt = now() + MS_PER_SECOND / (RATE_PER_SECOND[group] ?? DEFAULT_RATE_PER_SECOND);
    });
    // A failed sleep must not break the chain for the next caller.
    gate.chain = turn.then(() => undefined, () => undefined);
    await turn;
  }

  function release(group: string): void {
    const gate = gateFor(group);
    gate.inFlight -= 1;
    const next = gate.queue.shift();
    if (next !== undefined) next();
  }

  function retryAfterMs(res: Response): number {
    const header = res.headers.get('retry-after');
    const seconds = header === null ? NaN : Number(header);
    return Number.isFinite(seconds) ? seconds * MS_PER_SECOND : NO_RETRY_AFTER_MS;
  }

  function backoffMs(attempt: number): number {
    return BACKOFF_BASE_MS * 2 ** attempt;
  }

  async function attemptOnce(url: string, init: RequestInit, attempt: number): Promise<Attempt> {
    const group = groupOf(hostOf(url));
    let res: Response | null = null;
    let thrown = '';
    await acquire(group);
    try {
      res = await fetchImpl(url, init);
    } catch (err) {
      thrown = (err as Error).message;
    } finally {
      release(group);
    }
    if (res === null) {
      return {
        sent: { res: null, status: 0, error: thrown },
        retryable: true,
        waitMs: backoffMs(attempt),
      };
    }
    const status = res.status;
    if (status < 400) {
      return { sent: { res, status, error: null }, retryable: false, waitMs: 0 };
    }
    if (status === 429) {
      return {
        sent: { res: null, status, error: 'http 429' },
        retryable: true,
        waitMs: retryAfterMs(res),
      };
    }
    // Every other 4xx is final. A 404 records one failure and stops here.
    if (status < 500) {
      return { sent: { res: null, status, error: `http ${status}` }, retryable: false, waitMs: 0 };
    }
    return {
      sent: { res: null, status, error: `http ${status}` },
      retryable: true,
      waitMs: backoffMs(attempt),
    };
  }

  async function send(url: string, init: RequestInit): Promise<Sent> {
    let attempt = 0;
    for (;;) {
      const tried = await attemptOnce(url, init, attempt);
      if (!tried.retryable || attempt === MAX_RETRIES) return tried.sent;
      await sleep(tried.waitMs);
      attempt += 1;
    }
  }

  function recordFailure(url: string, status: number, message: string): void {
    failures.push({ url, status, message, at: new Date(now()).toISOString() });
  }

  function headers(extra: Record<string, string>): Record<string, string> {
    return { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip', ...extra };
  }

  async function text(url: string, init: RequestInit, file: string): Promise<TextResult> {
    if (!refresh && existsSync(file)) {
      const row = JSON.parse(readFileSync(file, 'utf8'));
      if (now() - Date.parse(row.fetched_at) < lifetimeMs(groupOf(hostOf(url)))) {
        return { ok: true, status: row.status, body: row.body, fromCache: true, error: null };
      }
    }
    const sent = await send(url, init);
    if (sent.res === null) {
      recordFailure(url, sent.status, sent.error);
      return { ok: false, status: sent.status, body: '', fromCache: false, error: sent.error };
    }
    const body = await sent.res.text();
    const row = { url, fetched_at: new Date(now()).toISOString(), status: sent.status, body };
    writeFile(file, JSON.stringify(row));
    return { ok: true, status: sent.status, body, fromCache: false, error: null };
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
      // No lifetime check. Image bytes never change, so a cached file never expires.
      if (!refresh && existsSync(head) && existsSync(bin)) {
        const row = JSON.parse(readFileSync(head, 'utf8'));
        const cached = new Uint8Array(readFileSync(bin));
        return { ok: true, status: row.status, bytes: cached, fromCache: true, error: null };
      }
      const sent = await send(url, { method: 'GET', headers: headers({}) });
      if (sent.res === null) {
        recordFailure(url, sent.status, sent.error);
        return { ok: false, status: sent.status, bytes: null, fromCache: false, error: sent.error };
      }
      const bytes = new Uint8Array(await sent.res.arrayBuffer());
      const row = { url, fetched_at: new Date(now()).toISOString(), status: sent.status };
      writeFile(bin, bytes);
      writeFile(head, JSON.stringify(row));
      return { ok: true, status: sent.status, bytes, fromCache: false, error: null };
    },
  };
}
```

Four notes for the reader:

- The module caches a response only when its status is under 400. A failed request never
  poisons the cache.
- `getBytes` writes the header to `<hash>.bin.json` and the bytes to `<hash>.bin`, so a
  text response and a byte response for the same url never share a file.
- `send` loops with `for (;;)` and returns from inside the loop. Every exit carries a real
  status and a real message, so no caller needs a fallback string.
- The cache file holds `fetched_at`, `status`, `body`. Those are serialized data, so they
  stay snake_case. `HttpOptions` and the two result types are TypeScript names that never
  reach a file, so they are camelCase: `cacheDir`, `fetchImpl`, `fromCache`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test pipeline/tests/http.test.ts`
Expected: PASS, 17 tests

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
  - `SOURCE_KEYS: readonly ['plants', 'inat', 'commons', 'manual']`
  - `type SourceKey = (typeof SOURCE_KEYS)[number]`
  - `SOURCE_NAMES: Record<SourceKey, string>`
  - `LICENSE_ALLOWLIST: string[]`
  - `HINT_KEYWORDS: Record<string, string>`
  - `interface Candidate`
  - `candidateId(origin: string, target: string): string`
  - `licenseAllowed(text: string): boolean`
  - `channelHint(text: string): string | null`
  - `makeCandidate(fields: Omit<Partial<Candidate>, 'id'> & { target: string; source_key: SourceKey; origin: string; file_url: string }): Candidate`

This task creates the first half of `candidates.ts`: the row shape, the source keys, the
license allowlist, the hint keywords, `candidateId`, and `makeCandidate`. Task 8 adds
`collect`, the caps, and `mergeFound` to the same file.

The spec does not say where the allowlist and the row shape live. This plan puts them in
`candidates.ts` early, because every source module imports them, and the queue and the
caps join the same file in Task 8.

`jsonl.ts` reads and writes files. The caller passes the path, so nothing in the module
picks a location of its own and a test writes into a temporary directory.

**Two names for a source.** `source_key` drives machinery: the cache directory
`pipeline/cache/<source_key>/` and the report count `candidates_by_source`. `source` is
the display name, and `cli build` copies it verbatim onto the manifest row, where the app
prints it as the photo credit. `makeCandidate` requires `source_key` and defaults `source`
to `SOURCE_NAMES[source_key]`. A manual row has no default name, so `cli photos add`
requires `--source`.

**A candidate id is per target.** It is the sha1 of the target and the origin URL, so one
photo judged for two targets is two rows. Two sources that name one origin for one target
still collapse to one row, which is what Choice 11 asks for. No caller passes an id.

**The five channels.** `CHANNELS` lists `leaf`, `bark`, `fruit`, `flower`, `twig`. It is
the vocabulary for a hint, not the list the app renders: the app derives its channels from
`content/concepts.json`, and a run's scope limits which channels a verdict may name, which
Task 9 checks. So `flower` and `twig` stay hint-only until a concept carries them. The
hint table covers all five, because a Commons file name says `catkin` whether or not a
flower concept exists yet.

- [ ] **Step 1: Write the failing test for `jsonl`**

`pipeline/tests/jsonl.test.ts`:

```ts
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
  HINT_KEYWORDS,
  LICENSE_ALLOWLIST,
  SOURCE_KEYS,
  SOURCE_NAMES,
  candidateId,
  channelHint,
  licenseAllowed,
  makeCandidate,
} from '../lib/candidates.ts';

const COMMONS_ORIGIN = 'https://commons.wikimedia.org/wiki/File:Quercus_alba_bark.jpg';
const COMMONS_FILE = 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Quercus_alba_bark.jpg';
const INAT_ORIGIN = 'https://www.inaturalist.org/observations/12345#photo=678';
const INAT_FILE = 'https://static.inaturalist.org/photos/678/original.jpg';

test('CHANNELS lists the five channels and every hint channel is one of them', () => {
  assert.deepEqual(CHANNELS, ['leaf', 'bark', 'fruit', 'flower', 'twig']);
  for (const channel of Object.values(HINT_KEYWORDS)) {
    assert.ok(CHANNELS.includes(channel), `${channel} must be a channel`);
  }
});

test('SOURCE_NAMES holds one display name per source key, and manual has none', () => {
  assert.deepEqual(Object.keys(SOURCE_NAMES), [...SOURCE_KEYS]);
  // A manual row carries the name the collector passes with --source.
  assert.equal(SOURCE_NAMES.manual, '');
  for (const key of SOURCE_KEYS) {
    if (key === 'manual') continue;
    assert.notEqual(SOURCE_NAMES[key].trim(), '', `${key} needs a display name`);
  }
});

test('every LICENSE_ALLOWLIST label names a license licenseAllowed admits', () => {
  // The report prints the labels. licenseAllowed holds the machine rule. This ties them.
  const sample: Record<string, string> = {
    'public domain': 'Public domain',
    'US government work': 'United States Government Work',
    'CC0, any version': 'CC0 1.0',
    'CC BY, any version': 'CC BY 4.0',
    'CC BY-SA, any version': 'CC BY-SA 3.0',
  };
  assert.deepEqual(Object.keys(sample), LICENSE_ALLOWLIST);
  for (const [label, text] of Object.entries(sample)) {
    assert.equal(licenseAllowed(text), true, `${label} must be allowed`);
  }
});

test('licenseAllowed admits every allowed license whatever its version', () => {
  const allowed = [
    'Public domain',
    'public domain',
    'CC0 1.0',
    'CC0',
    'United States Government Work',
    'public domain (US government work)',
    'CC BY 2.0',
    'CC BY 4.0',
  ];
  for (const text of allowed) {
    assert.equal(licenseAllowed(text), true, `${text} must be allowed`);
  }
});

test('the cc by phrase already covers CC BY-SA, so the allowlist needs no sa phrase', () => {
  assert.equal(licenseAllowed('CC BY-SA 4.0'), true);
});

test('licenseAllowed rejects a license whose words carry an NC or ND token', () => {
  const rejected = [
    'CC BY-NC 4.0',
    'CC BY-NC-SA 4.0',
    'CC BY-NC-SA 2.0',
    'CC BY-ND 4.0',
    'CC BY-NC-ND 4.0',
    'Attribution-NonCommercial 4.0',
    'CC BY-NoDerivatives 4.0',
    'Attribution-NoDerivs 3.0',
    'CC BY-NonDerivative 4.0',
  ];
  for (const text of rejected) {
    assert.equal(licenseAllowed(text), false, `${text} must be rejected`);
  }
});

test('licenseAllowed rejects an unfree license and an empty text', () => {
  for (const text of ['All rights reserved', 'GFDL', '']) {
    assert.equal(licenseAllowed(text), false, `${text} must be rejected`);
  }
});

test('candidateId is the sha1 hex of the target and the origin url', () => {
  const expected = crypto.createHash('sha1').update(`QUGA|${INAT_ORIGIN}`).digest('hex');
  assert.equal(candidateId(INAT_ORIGIN, 'QUGA'), expected);
  assert.match(candidateId(INAT_ORIGIN, 'QUGA'), /^[0-9a-f]+$/);
});

test('one origin under two targets gives two ids', () => {
  // The same photo judged for a species and for a concept is two rows.
  const species = candidateId(INAT_ORIGIN, 'QUGA');
  const concept = candidateId(INAT_ORIGIN, 'leaf/lobed');
  assert.notEqual(species, concept);
});

test('one target and one origin give one id, whatever source found it', () => {
  // Two sources that name the same origin for the same target collapse to one row.
  assert.equal(candidateId(INAT_ORIGIN, 'QUGA'), candidateId(INAT_ORIGIN, 'QUGA'));
});

test('two different origin urls under one target give two different ids', () => {
  const one = candidateId('https://www.inaturalist.org/observations/12345#photo=1', 'QUGA');
  const two = candidateId('https://www.inaturalist.org/observations/12345#photo=2', 'QUGA');
  assert.notEqual(one, two);
});

test('HINT_KEYWORDS keeps its keys in match order', () => {
  // channelHint walks the keys in insertion order and the first hit wins, so the
  // order is behaviour. deepEqual on the object would not see it.
  assert.deepEqual(Object.keys(HINT_KEYWORDS), [
    'bark',
    'trunk',
    'leaf',
    'leaves',
    'foliage',
    'acorn',
    'fruit',
    'samara',
    'cone',
    'flower',
    'catkin',
    'bud',
    'twig',
  ]);
});

test('channelHint maps every keyword in HINT_KEYWORDS to its channel', () => {
  for (const [keyword, channel] of Object.entries(HINT_KEYWORDS)) {
    assert.equal(channelHint(keyword), channel, `${keyword} maps to ${channel}`);
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

test('makeCandidate fills the id from the origin and sets every default', () => {
  const candidate = makeCandidate({
    target: 'QUAL',
    source_key: 'commons',
    origin: COMMONS_ORIGIN,
    file_url: COMMONS_FILE,
  });
  assert.deepEqual(candidate, {
    id: candidateId(COMMONS_ORIGIN, 'QUAL'),
    target: 'QUAL',
    source_key: 'commons',
    source: 'Wikimedia Commons',
    origin: COMMONS_ORIGIN,
    file_url: COMMONS_FILE,
    author: '',
    license: '',
    license_url: null,
    source_species: null,
    channel_hint: null,
    tags_hint: [],
    identity_match: null,
    local: null,
    file_hash: null,
    fetched_at: '',
    fetch_error: null,
  });
});

test('makeCandidate takes the display name from the source key', () => {
  const plants = makeCandidate({
    target: 'QUAL',
    source_key: 'plants',
    origin: 'https://plants.usda.gov/plant-profile/QUAL#image=quercus_alba_bark.jpg',
    file_url: 'https://plants.sc.egov.usda.gov/ImageLibrary/quercus_alba_bark.jpg',
  });
  assert.equal(plants.source, 'USDA PLANTS Database');
  const inat = makeCandidate({
    target: 'QUGA',
    source_key: 'inat',
    origin: INAT_ORIGIN,
    file_url: INAT_FILE,
  });
  assert.equal(inat.source, 'iNaturalist');
});

test('makeCandidate keeps a source the caller passed', () => {
  const origin = 'https://www.fs.usda.gov/quercus-alba';
  const candidate = makeCandidate({
    target: 'QUAL',
    source_key: 'manual',
    source: 'US Forest Service',
    origin,
    file_url: 'https://www.fs.usda.gov/quercus-alba.jpg',
  });
  assert.equal(candidate.source, 'US Forest Service');
  // The id always comes from the target and the origin. No caller sets it.
  assert.equal(candidate.id, candidateId(origin, 'QUAL'));
});

test('makeCandidate keeps every field the caller passed', () => {
  const candidate = makeCandidate({
    target: 'QUGA',
    source_key: 'inat',
    origin: INAT_ORIGIN,
    file_url: INAT_FILE,
    author: '(c) Lyrae, some rights reserved (CC BY)',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    source_species: 'Quercus gambelii',
    channel_hint: 'fruit',
    tags_hint: ['fruiting'],
    identity_match: true,
    local: 'pipeline/cache/inat/abc.jpg',
    file_hash: 'deadbeef',
    fetched_at: '2026-09-22T15:04:00Z',
    fetch_error: 'timeout',
  });
  assert.equal(candidate.id, candidateId(INAT_ORIGIN, 'QUGA'));
  assert.equal(candidate.author, '(c) Lyrae, some rights reserved (CC BY)');
  assert.equal(candidate.license, 'CC BY 4.0');
  assert.equal(candidate.license_url, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(candidate.source_species, 'Quercus gambelii');
  assert.equal(candidate.channel_hint, 'fruit');
  assert.deepEqual(candidate.tags_hint, ['fruiting']);
  assert.equal(candidate.identity_match, true);
  assert.equal(candidate.local, 'pipeline/cache/inat/abc.jpg');
  assert.equal(candidate.file_hash, 'deadbeef');
  assert.equal(candidate.fetched_at, '2026-09-22T15:04:00Z');
  assert.equal(candidate.fetch_error, 'timeout');
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

/**
 * The vocabulary for a channel hint. The app derives the channels it renders from
 * content/concepts.json, and a run's scope limits which channels a verdict may name.
 */
export const CHANNELS: string[] = ['leaf', 'bark', 'fruit', 'flower', 'twig'];

export const SOURCE_KEYS = ['plants', 'inat', 'commons', 'manual'] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

/**
 * The credit line the app prints. `source_key` drives machinery: the cache directory
 * and the report count. A manual row has no default name, so `cli photos add`
 * requires --source.
 */
export const SOURCE_NAMES: Record<SourceKey, string> = {
  plants: 'USDA PLANTS Database',
  inat: 'iNaturalist',
  commons: 'Wikimedia Commons',
  manual: '',
};

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

// 'cc by' is a prefix of 'cc by sa', so a separate 'cc by sa' phrase would never run.
const ALLOWED_PHRASES: string[] = [
  'public domain',
  'cc0',
  'us government work',
  'cc by',
];

// One of these words in the license text rejects it, whatever else the text says.
const REJECT_WORDS: string[] = [
  'nc',
  'nd',
  'noncommercial',
  'nonderivative',
  'noderivatives',
  'noderivs',
];

export interface Candidate {
  id: string;
  target: string;
  source_key: SourceKey;
  source: string;
  origin: string;
  file_url: string;
  author: string;
  license: string;
  license_url: string | null;
  source_species: string | null;
  channel_hint: string | null;
  tags_hint: string[];
  identity_match: boolean | null;
  local: string | null;
  file_hash: string | null;
  fetched_at: string;
  fetch_error: string | null;
}

/**
 * The sha1 hex of the target and the origin url, so one photo judged for two
 * targets is two rows. Two sources that name one origin for one target still
 * collapse to one row.
 */
export function candidateId(origin: string, target: string): string {
  return crypto.createHash('sha1').update(`${target}|${origin}`).digest('hex');
}

/**
 * Admits public domain, CC0, US government work, CC BY, and CC BY-SA.
 * Any NC or ND token rejects the text, spelled short or spelled out.
 */
export function licenseAllowed(text: string): boolean {
  const words = licenseWords(text);
  if (words.length === 0) return false;
  if (words.some((word) => REJECT_WORDS.includes(word))) return false;
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

/**
 * Fills the id from the target and the origin, and every default the caller left
 * out. No caller passes an id.
 */
export function makeCandidate(
  fields: Omit<Partial<Candidate>, 'id'> & {
    target: string;
    source_key: SourceKey;
    origin: string;
    file_url: string;
  },
): Candidate {
  return {
    id: candidateId(fields.origin, fields.target),
    target: fields.target,
    source_key: fields.source_key,
    source: fields.source ?? SOURCE_NAMES[fields.source_key],
    origin: fields.origin,
    file_url: fields.file_url,
    author: fields.author ?? '',
    license: fields.license ?? '',
    license_url: fields.license_url ?? null,
    source_species: fields.source_species ?? null,
    channel_hint: fields.channel_hint ?? null,
    tags_hint: fields.tags_hint ?? [],
    // photos fetch sets this from the identity check. Task 9 holds the comparison.
    identity_match: fields.identity_match ?? null,
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

Two notes for the reader:

- `licenseWords` splits on every non-letter and non-digit, so `CC BY-NC-SA 4.0` becomes
  `cc by nc sa 4 0` and the `nc` token rejects it. `Attribution-NonCommercial 4.0` becomes
  `attribution noncommercial 4 0`, which `REJECT_WORDS` catches under the long spelling.
- A version number is its own word, so it never changes the verdict.

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test pipeline/tests/candidates_core.test.ts`
Expected: PASS, 20 tests

- [ ] **Step 9: Run both test files together**

Run: `node --test pipeline/tests/jsonl.test.ts pipeline/tests/candidates_core.test.ts`
Expected: PASS, 27 tests

- [ ] **Step 10: Commit**

```bash
git add pipeline/lib/jsonl.ts pipeline/lib/candidates.ts pipeline/tests/jsonl.test.ts pipeline/tests/candidates_core.test.ts && git commit -m "feat: add the JSONL helpers, the candidate row, and the license allowlist" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: USDA PLANTS

**Files:**
- Create: `pipeline/tests/fixtures/plants_profile_quga.json`
- Create: `pipeline/tests/fixtures/plants_profile_purple_sage.json`
- Create: `pipeline/tests/fixtures/plants_subordinate_quga.json`
- Create: `pipeline/tests/fixtures/plants_subordinate_quga_page2.json`
- Create: `pipeline/tests/fixtures/plants_distribution_quga.csv`
- Create: `pipeline/tests/fixtures/plants_images_quga.json`
- Create: `pipeline/tests/fixtures/plantlst_sample.txt`
- Create: `pipeline/lib/plants.ts`
- Test: `pipeline/tests/plants.test.ts`

**Interfaces:**
- Consumes:
  - `makeCandidate(fields: Partial<Candidate> & { target: string; source_key: SourceKey; origin: string; file_url: string }): Candidate` from `./candidates.ts` (Task 2)
  - `SOURCE_NAMES: Record<SourceKey, string>` from `./candidates.ts` (Task 2)
  - `candidateId(origin: string, target: string): string` from `./candidates.ts` (Task 2). The test imports it; the module does not, because `makeCandidate` computes the id.
  - `type Candidate` and `type SourceKey` from `./candidates.ts` (Task 2)
  - `type Http` from `./http.ts` (Task 1). The import is a type import, so Node erases it and this task does not need `http.ts` on disk.
  - `type TextResult` and `type BytesResult` from `./http.ts` (Task 1). The test imports them for its fake client.
- Produces:
  - `PLANTS_API: string`
  - `PLANTS_FILES: string`
  - `PLANTS_PROFILE: string`
  - `CHECKLIST_URL: string`
  - `DISTRIBUTION_URL: string`
  - `PLANTS_LICENSE: string`
  - `PART_CODE_CHANNELS: Record<string, string>`
  - `interface PlantsProfile { symbol: string; plants_id: number; scientific: string; author: string; common: string | null; family: string | null; genus: string | null; rank: string; growth_habits: string[]; native_status: string | null }`
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
  - `plantsCandidates(images: PlantsImage[], target: string, scientific: string, now: string): Candidate[]`
  - `profileUrl(symbol: string): string`
  - `subordinateTaxaUrl(plantsId: number, offset?: number): string`
  - `imagesUrl(plantsId: number): string`
  - `fetchProfile(http: Http, symbol: string, now: string): Promise<PlantsProfile | null>`
  - `fetchSubordinateTaxa(http: Http, plantsId: number, now: string): Promise<{ key: string; name: string }[]>`
  - `fetchDistribution(http: Http, plantsId: number): Promise<string[]>`
  - `fetchImages(http: Http, plantsId: number, now: string): Promise<PlantsImage[]>`
  - `fetchChecklist(http: Http): Promise<ChecklistRow[]>`

This module reads the four PLANTS endpoints of spec section 3 and the checklist file. It
holds parsers and URL builders only. The HTTP client arrives as a parameter, so no test
touches the network.

The three helpers that parse a JSON body take `now`, an ISO 8601 timestamp. They need it
for one job: a 200 response whose body is not JSON gets a row on `http.failures`, and the
row carries the time. The clock stays injected, as the plan requires. The caller passes
`deps.now().toISOString()`.

Every fixture below is built by hand. It holds the fields section 3 documents, trimmed to
the rows the test reads. Task 19 replaces each one with a recorded response after the
first live fetch.

Five points the spec leaves open, decided here:

1. The part code table. A PLANTS image file name ends in a three letter code, as in
   `quga_001_lvp.jpg`. The table covers leaf, bark, fruit, flower, and twig codes. The
   habit code `hbp` is absent, so it gives a null hint. The table is a guess from the file
   names. Task 19 checks it against a real `PlantImages` response and widens it.
2. `ChecklistRow.scientific` holds the name with the author removed, through
   `splitScientific`. Task 9 matches photo captions against these names, and an author
   string would break the match.
3. `plantsCandidates` builds the origin from the species profile page, as section 6 states,
   plus a `#image=` fragment that holds the url-encoded image path. PLANTS has no page per
   image, so the profile page is the attribution page a person opens. A fragment never
   reaches the server, so the link still opens that page. The fragment makes the origin
   unique per image, and the candidate id is the sha1 of the target and the origin, so
   each image of a species gets its own id. Without it every image of one species and
   target would share one id, and Task 8 would drop all but the first.
4. A subordinate taxon's `name` is the short label the app shows as a quiz answer. It runs
   from the rank marker on, with the botanical author removed:
   `Quercus gambelii Nutt. var. gambelii` gives `var. gambelii`. A row with no rank marker
   keeps the scientific name without the author.
5. A PLANTS name carries the author in the middle of an infraspecific name, as in
   `Quercus gambelii Nutt. var. gambelii`. `splitScientific` finds the rank marker anywhere
   after the epithet, joins the four name words, and treats every other word as the author.
   It handles the author-last ordering too.

Three fields of `PlantsProfile` stay nullable: `common`, `family`, and `genus`. A missing
one is `null`, never `''`, so a caller cannot mistake an empty string for a name. Task 7
checks them: `validateFetched` rejects a species record with no family or no common name.
`native_status` stays nullable as well, because PLANTS answers with no L48 row for some
species; Task 7 gives it a default.

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

The first page of `GET /api/PlantSubordinateTaxa/25297?offset=0`. `TotalResults` is 3 and
the page holds 2 rows, so the fetch helper asks for a second page.

```json
{
  "TotalResults": 3,
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

- [ ] **Step 4: Create `pipeline/tests/fixtures/plants_subordinate_quga_page2.json`**

The second page, `offset=2`. It holds the third row and the same `TotalResults`, so the
loop stops after it. The row is hand-built to drive the paging loop. Task 19 replaces both
pages with the recorded response and re-runs the suite.

```json
{
  "TotalResults": 3,
  "PlantResults": [
    {
      "Id": 25300,
      "Symbol": "QUGAT",
      "ScientificName": "<i>Quercus</i> <i>gambelii</i> Nutt. var. <i>triloba</i>"
    }
  ]
}
```

- [ ] **Step 5: Create `pipeline/tests/fixtures/plants_distribution_quga.csv`**

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

- [ ] **Step 6: Create `pipeline/tests/fixtures/plants_images_quga.json`**

The response of `GET /api/PlantImages?plantId=25297`. Each record holds four size paths,
the `Copyright` flag, and the photographer in `CommonName`. Two records never become
candidates: the fourth is copyright, and the fifth names no photographer. The app prints
the photographer as the credit, so a row with no name cannot ship. The photographer names
are made up.

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
    },
    {
      "Id": 505,
      "ThumbnailPath": "/ImageLibrary/thumbnail/quga_005_thp.jpg",
      "SmallImagePath": "/ImageLibrary/small/quga_005_svp.jpg",
      "MediumImagePath": "/ImageLibrary/medium/quga_005_mvp.jpg",
      "OriginalImagePath": "/ImageLibrary/original/quga_005_lvd.jpg",
      "Copyright": false,
      "CommonName": ""
    }
  ]
}
```

- [ ] **Step 7: Create `pipeline/tests/fixtures/plantlst_sample.txt`**

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

- [ ] **Step 8: Write the failing test**

`pipeline/tests/plants.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { candidateId, SOURCE_NAMES } from '../lib/candidates.ts';
import type { Http, TextResult, BytesResult, HttpFailure } from '../lib/http.ts';
import {
  PLANTS_API,
  PLANTS_FILES,
  PLANTS_PROFILE,
  CHECKLIST_URL,
  DISTRIBUTION_URL,
  PLANTS_LICENSE,
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
  fetchSubordinateTaxa,
  fetchDistribution,
  fetchImages,
  fetchChecklist,
} from '../lib/plants.ts';

function fixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function fixtureJson(name: string): unknown {
  return JSON.parse(fixture(name));
}

const QUGA_PROFILE = 'https://plants.usda.gov/plant-profile/QUGA';
const QUGA_ID = 25297;
const QUGA_SCIENTIFIC = 'Quercus gambelii';
const FETCHED_AT = '2026-09-22T15:04:00Z';
const OK = 200;
const NOT_FOUND = 404;
const SERVER_ERROR = 500;
const NO_STATUS = 0;
const FIRST_OFFSET = 0;
const PAGE_ONE_ROWS = 2;

interface Fake {
  http: Http;
  asked: string[];
}

/**
 * A fake HTTP client over a url-to-body map. A url the map does not hold answers
 * with `status` and records a failure row, which is what `http.ts` does for a url
 * it gives up on. The tests read `http.failures` to prove that the PLANTS helpers
 * add a row for a body that is not JSON and remove no row at all.
 */
function makeHttp(bodies: Record<string, string>, status: number = NOT_FOUND): Fake {
  const asked: string[] = [];
  const failures: HttpFailure[] = [];
  const answer = (url: string): TextResult => {
    asked.push(url);
    const body = bodies[url];
    if (body === undefined) {
      failures.push({ url, status, message: `status ${status}`, at: FETCHED_AT });
      return { ok: false, status, body: '', fromCache: false, error: `status ${status}` };
    }
    return { ok: true, status: OK, body, fromCache: false, error: null };
  };
  const http: Http = {
    failures,
    async getText(url: string): Promise<TextResult> {
      return answer(url);
    },
    async postJson(url: string): Promise<TextResult> {
      return answer(url);
    },
    async getBytes(): Promise<BytesResult> {
      return { ok: false, status: NO_STATUS, bytes: null, fromCache: false, error: 'not used' };
    },
  };
  return { http, asked };
}

test('the profile parser strips the tags and splits the author off', () => {
  assert.equal(
    stripItalics('<i>Quercus</i> <i>gambelii</i> Nutt.'),
    'Quercus gambelii Nutt.',
  );
  assert.deepEqual(splitScientific('Quercus gambelii Nutt.'), {
    scientific: QUGA_SCIENTIFIC,
    author: 'Nutt.',
  });
  assert.deepEqual(parseProfile(fixtureJson('plants_profile_quga.json')), {
    symbol: 'QUGA',
    plants_id: QUGA_ID,
    scientific: QUGA_SCIENTIFIC,
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

test('a profile with no family, no common name, and no name gives nulls, not empty strings', () => {
  const bare = parseProfile({ Id: QUGA_ID, Symbol: 'quga', Rank: 'Species' });
  assert.equal(bare.symbol, 'QUGA');
  assert.equal(bare.scientific, '');
  assert.equal(bare.common, null);
  assert.equal(bare.family, null);
  assert.equal(bare.genus, null);
  assert.equal(bare.native_status, null);
  assert.deepEqual(bare.growth_habits, []);
});

test('splitScientific takes the author out of the middle of an infraspecific name', () => {
  assert.deepEqual(splitScientific('Quercus gambelii Nutt. var. gambelii'), {
    scientific: 'Quercus gambelii var. gambelii',
    author: 'Nutt.',
  });
  assert.deepEqual(splitScientific('Quercus gambelii Nutt. var. bakeri (Kellogg) Cory'), {
    scientific: 'Quercus gambelii var. bakeri',
    author: 'Nutt. (Kellogg) Cory',
  });
  assert.deepEqual(splitScientific('Quercus gambelii var. gambelii Nutt.'), {
    scientific: 'Quercus gambelii var. gambelii',
    author: 'Nutt.',
  });
  assert.deepEqual(splitScientific('Quercus gambelii subsp. gambelii'), {
    scientific: 'Quercus gambelii subsp. gambelii',
    author: '',
  });
  assert.deepEqual(splitScientific(QUGA_SCIENTIFIC), {
    scientific: QUGA_SCIENTIFIC,
    author: '',
  });
  assert.deepEqual(splitScientific('Pinus ponderosa Douglas ex C. Lawson'), {
    scientific: 'Pinus ponderosa',
    author: 'Douglas ex C. Lawson',
  });
});

test('a multiplication sign or a lone x marks a hybrid', () => {
  assert.equal(isHybrid('Quercus ×undulata'), true);
  assert.equal(isHybrid('Quercus x undulata'), true);
  assert.equal(isHybrid('Quercus X undulata'), true);
  assert.equal(isHybrid(QUGA_SCIENTIFIC), false);
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

test('parseSubordinateTaxa gives the key and the short rank label', () => {
  assert.deepEqual(parseSubordinateTaxa(fixtureJson('plants_subordinate_quga.json')), [
    { key: 'QUGAG', name: 'var. gambelii' },
    { key: 'QUGAB', name: 'var. bakeri' },
  ]);
  assert.deepEqual(
    parseSubordinateTaxa({
      TotalResults: 2,
      PlantResults: [
        {
          Symbol: 'QUGAS',
          ScientificName: '<i>Quercus</i> <i>gambelii</i> Nutt. subsp. <i>gambelii</i>',
        },
        { Symbol: 'QUGAX', ScientificName: '<i>Quercus</i> <i>gambelii</i> Nutt.' },
      ],
    }),
    [
      { key: 'QUGAS', name: 'subsp. gambelii' },
      { key: 'QUGAX', name: QUGA_SCIENTIFIC },
    ],
  );
});

test('the checklist parses, accepted symbols filter by genus, and synonyms resolve', () => {
  const rows = parseChecklist(fixture('plantlst_sample.txt'));
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], {
    symbol: 'QUGA',
    synonym_symbol: '',
    scientific: QUGA_SCIENTIFIC,
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
  assert.equal(images.length, 5);
  const rows = plantsCandidates(images, 'QUGA', QUGA_SCIENTIFIC, FETCHED_AT);
  assert.equal(rows.length, 3);
  const firstPath = '/ImageLibrary/original/quga_001_lvp.jpg';
  const firstOrigin = `${QUGA_PROFILE}#image=${encodeURIComponent(firstPath)}`;
  assert.deepEqual(rows[0], {
    id: candidateId(firstOrigin, 'QUGA'),
    target: 'QUGA',
    source_key: 'plants',
    source: SOURCE_NAMES.plants,
    origin: firstOrigin,
    file_url: `${PLANTS_FILES}${firstPath}`,
    author: 'R. Nichols',
    license: PLANTS_LICENSE,
    license_url: null,
    source_species: QUGA_SCIENTIFIC,
    channel_hint: 'leaf',
    tags_hint: [],
    local: null,
    file_hash: null,
    identity_match: null,
    fetched_at: FETCHED_AT,
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
      encodeURIComponent(firstPath),
      encodeURIComponent('/ImageLibrary/original/quga_002_bkp.jpg'),
      encodeURIComponent('/ImageLibrary/original/quga_003_hbp.jpg'),
    ],
  );
  assert.equal(new Set(rows.map((row) => row.origin)).size, rows.length);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
});

test('plantsCandidates drops an image that names no photographer', () => {
  const images = parseImages(fixtureJson('plants_images_quga.json'));
  const anonymous = images.filter((image) => image.photographer === '');
  assert.equal(anonymous.length, 1);
  assert.equal(anonymous[0].path, '/ImageLibrary/original/quga_005_lvd.jpg');
  assert.equal(anonymous[0].copyright, false);
  const rows = plantsCandidates(images, 'QUGA', QUGA_SCIENTIFIC, FETCHED_AT);
  assert.equal(rows.length, 3);
  assert.equal(
    rows.some((row) => row.file_url.includes('quga_005')),
    false,
  );
  for (const row of rows) {
    assert.notEqual(row.author.trim(), '');
  }
});

test('the constants hold the PLANTS hosts, the license text, and the part code table', () => {
  assert.equal(PLANTS_API, 'https://plantsservices.sc.egov.usda.gov/api');
  assert.equal(PLANTS_FILES, 'https://plants.sc.egov.usda.gov');
  assert.equal(PLANTS_PROFILE, 'https://plants.usda.gov/plant-profile/');
  assert.equal(
    CHECKLIST_URL,
    'https://plants.sc.egov.usda.gov/DocumentLibrary/Txt/plantlst.txt',
  );
  assert.equal(PLANTS_LICENSE, 'public domain (US government work)');
  assert.equal(PART_CODE_CHANNELS.lvp, 'leaf');
  assert.equal(PART_CODE_CHANNELS.bkp, 'bark');
  assert.equal(PART_CODE_CHANNELS.frp, 'fruit');
  assert.equal(PART_CODE_CHANNELS.flp, 'flower');
  assert.equal(PART_CODE_CHANNELS.twp, 'twig');
  assert.equal(PART_CODE_CHANNELS.hbp, undefined);
});

test('the fetch helpers read the fake HTTP client and parse the body', async () => {
  const { http, asked } = makeHttp({
    [profileUrl('QUGA')]: fixture('plants_profile_quga.json'),
    [imagesUrl(QUGA_ID)]: fixture('plants_images_quga.json'),
    [DISTRIBUTION_URL]: fixture('plants_distribution_quga.csv'),
    [CHECKLIST_URL]: fixture('plantlst_sample.txt'),
  });

  const profile = await fetchProfile(http, 'QUGA', FETCHED_AT);
  assert.equal(profile?.plants_id, QUGA_ID);
  assert.deepEqual(await fetchDistribution(http, QUGA_ID), ['AZ', 'CO', 'NM', 'UT']);
  assert.equal((await fetchImages(http, QUGA_ID, FETCHED_AT)).length, 5);
  assert.equal((await fetchChecklist(http)).length, 5);
  assert.equal(await fetchProfile(http, 'NOPE', FETCHED_AT), null);
  assert.deepEqual(asked, [
    profileUrl('QUGA'),
    DISTRIBUTION_URL,
    imagesUrl(QUGA_ID),
    CHECKLIST_URL,
    profileUrl('NOPE'),
  ]);
  assert.deepEqual(
    http.failures.map((row) => row.url),
    [profileUrl('NOPE')],
  );
  assert.equal(
    subordinateTaxaUrl(QUGA_ID, FIRST_OFFSET),
    'https://plantsservices.sc.egov.usda.gov/api/PlantSubordinateTaxa/25297?offset=0',
  );
});

test('fetchSubordinateTaxa follows the offset until it has read TotalResults rows', async () => {
  const { http, asked } = makeHttp({
    [subordinateTaxaUrl(QUGA_ID, FIRST_OFFSET)]: fixture('plants_subordinate_quga.json'),
    [subordinateTaxaUrl(QUGA_ID, PAGE_ONE_ROWS)]: fixture('plants_subordinate_quga_page2.json'),
  });
  assert.deepEqual(await fetchSubordinateTaxa(http, QUGA_ID, FETCHED_AT), [
    { key: 'QUGAG', name: 'var. gambelii' },
    { key: 'QUGAB', name: 'var. bakeri' },
    { key: 'QUGAT', name: 'var. triloba' },
  ]);
  assert.deepEqual(asked, [
    subordinateTaxaUrl(QUGA_ID, FIRST_OFFSET),
    subordinateTaxaUrl(QUGA_ID, PAGE_ONE_ROWS),
  ]);
  assert.deepEqual(http.failures, []);
});

test('a body that is not JSON gives null and records a failure', async () => {
  const { http } = makeHttp({ [profileUrl('QUGA')]: '<html>maintenance</html>' });
  assert.equal(await fetchProfile(http, 'QUGA', FETCHED_AT), null);
  assert.deepEqual(http.failures, [
    {
      url: profileUrl('QUGA'),
      status: OK,
      message: 'body is not JSON',
      at: FETCHED_AT,
    },
  ]);
});

test('a 500 gives an empty result and leaves the failure row in place', async () => {
  const { http } = makeHttp({}, SERVER_ERROR);
  assert.deepEqual(await fetchImages(http, QUGA_ID, FETCHED_AT), []);
  assert.deepEqual(await fetchSubordinateTaxa(http, QUGA_ID, FETCHED_AT), []);
  assert.deepEqual(await fetchDistribution(http, QUGA_ID), []);
  assert.equal(await fetchProfile(http, 'QUGA', FETCHED_AT), null);
  assert.deepEqual(
    http.failures.map((row) => row.url),
    [
      imagesUrl(QUGA_ID),
      subordinateTaxaUrl(QUGA_ID, FIRST_OFFSET),
      DISTRIBUTION_URL,
      profileUrl('QUGA'),
    ],
  );
  for (const row of http.failures) {
    assert.equal(row.status, SERVER_ERROR);
  }
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `node --test pipeline/tests/plants.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>/pipeline/lib/plants.ts' imported from <repo>/pipeline/tests/plants.test.ts`. Node reports 1 test, 0 pass, 1 fail.

- [ ] **Step 10: Create `pipeline/lib/plants.ts`**

```ts
import { makeCandidate, SOURCE_NAMES } from './candidates.ts';
import type { Candidate } from './candidates.ts';
import type { Http } from './http.ts';

export const PLANTS_API: string = 'https://plantsservices.sc.egov.usda.gov/api';
export const PLANTS_FILES: string = 'https://plants.sc.egov.usda.gov';
export const PLANTS_PROFILE: string = 'https://plants.usda.gov/plant-profile/';
export const CHECKLIST_URL: string = `${PLANTS_FILES}/DocumentLibrary/Txt/plantlst.txt`;
export const DISTRIBUTION_URL: string =
  `${PLANTS_API}/PlantProfile/getDownloadDistributionDocumentation`;

/** The app prints this text as part of the photo credit. */
export const PLANTS_LICENSE: string = 'public domain (US government work)';

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

/** A genus and an epithet. */
const BINOMIAL_WORDS = 2;

/** A rank marker and the epithet after it. */
const MARKER_WORDS = 2;

const NOT_JSON = 'body is not JSON';

export interface PlantsProfile {
  symbol: string;
  plants_id: number;
  scientific: string;
  author: string;
  common: string | null;
  family: string | null;
  genus: string | null;
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
 * Splits a PLANTS name into the scientific name and the author.
 *
 * PLANTS writes the author in the middle of an infraspecific name, as in
 * `Quercus gambelii Nutt. var. gambelii`. So the rank marker is looked up
 * anywhere after the epithet. The scientific name is then the genus, the
 * epithet, the marker, and the epithet after the marker: BINOMIAL_WORDS plus
 * MARKER_WORDS words. Every other word is the author. A name with no marker
 * keeps its first BINOMIAL_WORDS words.
 */
export function splitScientific(nameWithAuthor: string): { scientific: string; author: string } {
  const words = wordsOf(nameWithAuthor);
  if (words.length === 0) return { scientific: '', author: '' };
  const marker = rankMarkerAt(words);
  if (marker !== -1) {
    return {
      scientific: [words[0], words[1], words[marker], words[marker + 1]].join(' '),
      author: words
        .slice(BINOMIAL_WORDS, marker)
        .concat(words.slice(marker + MARKER_WORDS))
        .join(' '),
    };
  }
  const count = Math.min(BINOMIAL_WORDS, words.length);
  return {
    scientific: words.slice(0, count).join(' '),
    author: words.slice(count).join(' '),
  };
}

export function parseProfile(json: unknown): PlantsProfile {
  const row = asRecord(json);
  const split = splitScientific(stripItalics(str(row.ScientificName)));
  const genus = split.scientific.split(' ')[0] ?? '';
  return {
    symbol: str(row.Symbol).toUpperCase(),
    plants_id: num(row.Id),
    scientific: split.scientific,
    author: split.author,
    // A missing field is null, never an empty string. Task 7 rejects a record
    // with no family or no common name, and defaults a null native_status.
    common: orNull(str(row.CommonName)),
    family: familyOf(row.AncestorRanks),
    genus: orNull(genus),
    rank: str(row.Rank),
    growth_habits: strList(row.GrowthHabits),
    native_status: nativeStatusL48(row.NativeStatuses),
  };
}

export function isTree(profile: PlantsProfile): boolean {
  return profile.growth_habits.some((habit) => habit.trim().toLowerCase() === 'tree');
}

/**
 * True when the name carries a multiplication sign or an `x` on its own.
 * `fna.ts` imports this function, so the rule lives in one place.
 */
export function isHybrid(scientific: string): boolean {
  return /×/.test(scientific) || /(^|\s)[xX](\s|$)/.test(scientific);
}

export function parseSubordinateTaxa(json: unknown): { key: string; name: string }[] {
  return listOf(json, 'PlantResults')
    .map((raw) => {
      const row = asRecord(raw);
      return {
        key: str(row.Symbol).toUpperCase(),
        name: subordinateLabel(stripItalics(str(row.ScientificName))),
      };
    })
    .filter((row) => row.key !== '' && row.name !== '');
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

/**
 * One candidate per usable image. An image is usable when it is not copyright
 * and it names a photographer. The app prints the photographer as the credit,
 * so an image with no name cannot ship and the row never enters the queue.
 */
export function plantsCandidates(
  images: PlantsImage[],
  target: string,
  scientific: string,
  now: string,
): Candidate[] {
  const profile = `${PLANTS_PROFILE}${target}`;
  return images
    .filter((image) => !image.copyright)
    .filter((image) => image.photographer.trim() !== '')
    .map((image) =>
      makeCandidate({
        target,
        source_key: 'plants',
        source: SOURCE_NAMES.plants,
        // PLANTS has no page per image, so the profile page is the attribution page.
        // The fragment stays off the wire and gives each image its own id.
        origin: `${profile}#image=${encodeURIComponent(image.path)}`,
        file_url: `${PLANTS_FILES}${image.path}`,
        author: image.photographer,
        license: PLANTS_LICENSE,
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

export async function fetchProfile(
  http: Http,
  symbol: string,
  now: string,
): Promise<PlantsProfile | null> {
  const url = profileUrl(symbol);
  const result = await http.getText(url);
  // A result that is not ok is already a row in http.failures.
  if (!result.ok) return null;
  const parsed = parseJson(result.body);
  if (!parsed.ok) {
    http.failures.push({ url, status: result.status, message: NOT_JSON, at: now });
    return null;
  }
  return parseProfile(parsed.value);
}

/**
 * Every subordinate taxon of a plant. The endpoint answers one page and the
 * count of all rows in `TotalResults`, so this reads pages at rising offsets
 * until it holds them all. A page with no rows also ends the loop, so a wrong
 * count cannot spin forever.
 */
export async function fetchSubordinateTaxa(
  http: Http,
  plantsId: number,
  now: string,
): Promise<{ key: string; name: string }[]> {
  const rows: { key: string; name: string }[] = [];
  let read = 0;
  for (;;) {
    const url = subordinateTaxaUrl(plantsId, read);
    const result = await http.getText(url);
    // A result that is not ok is already a row in http.failures.
    if (!result.ok) return rows;
    const parsed = parseJson(result.body);
    if (!parsed.ok) {
      http.failures.push({ url, status: result.status, message: NOT_JSON, at: now });
      return rows;
    }
    const onPage = listOf(parsed.value, 'PlantResults').length;
    if (onPage === 0) return rows;
    rows.push(...parseSubordinateTaxa(parsed.value));
    read += onPage;
    if (read >= totalResults(parsed.value)) return rows;
  }
}

export async function fetchDistribution(http: Http, plantsId: number): Promise<string[]> {
  const result = await http.postJson(DISTRIBUTION_URL, { MasterId: plantsId });
  // A result that is not ok is already a row in http.failures.
  if (!result.ok) return [];
  return parseDistribution(result.body);
}

export async function fetchImages(
  http: Http,
  plantsId: number,
  now: string,
): Promise<PlantsImage[]> {
  const url = imagesUrl(plantsId);
  const result = await http.getText(url);
  // A result that is not ok is already a row in http.failures.
  if (!result.ok) return [];
  const parsed = parseJson(result.body);
  if (!parsed.ok) {
    http.failures.push({ url, status: result.status, message: NOT_JSON, at: now });
    return [];
  }
  return parseImages(parsed.value);
}

export async function fetchChecklist(http: Http): Promise<ChecklistRow[]> {
  const result = await http.getText(CHECKLIST_URL);
  // A result that is not ok is already a row in http.failures.
  if (!result.ok) return [];
  return parseChecklist(result.body);
}

function wordsOf(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');
}

/**
 * The index of the first rank marker after the epithet, or -1. A marker with no
 * word after it does not count, because there is no infraspecific epithet to take.
 */
function rankMarkerAt(words: string[]): number {
  for (let i = BINOMIAL_WORDS; i + 1 < words.length; i += 1) {
    if (RANK_MARKERS.includes(words[i].toLowerCase())) return i;
  }
  return -1;
}

/**
 * The short label the app shows as a quiz answer. It runs from the rank marker
 * on, with the author dropped: `Quercus gambelii Nutt. var. gambelii` gives
 * `var. gambelii`. A name with no rank marker keeps the scientific name.
 */
function subordinateLabel(nameWithAuthor: string): string {
  const words = wordsOf(nameWithAuthor);
  const marker = rankMarkerAt(words);
  if (marker === -1) return splitScientific(nameWithAuthor).scientific;
  return `${words[marker]} ${words[marker + 1]}`;
}

function orNull(text: string): string | null {
  return text === '' ? null : text;
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
    return orNull(stripItalics(str(row.ScientificName)));
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

/**
 * Parses a body. `ok` is false when the body is not JSON, so the caller can
 * record the failure. Nothing here returns a fabricated value.
 */
function parseJson(body: string): { ok: boolean; value: unknown } {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false, value: null };
  }
}

function totalResults(json: unknown): number {
  return num(asRecord(json).TotalResults);
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

- [ ] **Step 11: Run the test to verify it passes**

Run: `node --test pipeline/tests/plants.test.ts`
Expected: PASS, 17 tests. Node prints `# pass 17` and `# fail 0`.

- [ ] **Step 12: Commit**

```bash
git add pipeline/lib/plants.ts pipeline/tests/plants.test.ts pipeline/tests/fixtures/plants_profile_quga.json pipeline/tests/fixtures/plants_profile_purple_sage.json pipeline/tests/fixtures/plants_subordinate_quga.json pipeline/tests/fixtures/plants_subordinate_quga_page2.json pipeline/tests/fixtures/plants_distribution_quga.csv pipeline/tests/fixtures/plants_images_quga.json pipeline/tests/fixtures/plantlst_sample.txt && git commit -m "feat: add the USDA PLANTS parsers" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: The oak section table from Flora of North America

**Files:**
- Create: `pipeline/lib/fna.ts`
- Create: `pipeline/data/quercus_sections.json`
- Test: `pipeline/tests/fna.test.ts`
- Fixtures: `pipeline/tests/fixtures/fna_lobatae.html`, `pipeline/tests/fixtures/fna_lobatae_page2.html`, `pipeline/tests/fixtures/fna_quercus.html`, `pipeline/tests/fixtures/fna_protobalanus.html`, `pipeline/tests/fixtures/quercus_sections_sample.json`

**Interfaces:**
- Consumes:
  - `isHybrid(scientific: string): boolean` from `./plants.ts` (Task 3). This is a value import, so `plants.ts` must be on disk. Task 3 writes it, and Task 3 runs first. `plants.ts` imports `candidates.ts` (Task 2), which is also on disk by then.
- Produces:
  - `interface SectionPage { section: string; taxon_id: string; url: string }`
  - `const SECTION_PAGES: SectionPage[]`
  - `function parseSectionPage(html: string): string[]`
  - `function nextPageUrl(html: string, pageUrl: string): string | null`
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

A section can run over several pages. The last row of a page then holds a "Next page"
anchor. `nextPageUrl` returns that anchor's absolute url, or null when the page has none.
`cli data sections` (Task 13) reads a section's first page, then follows the next links
until `nextPageUrl` gives null, and passes every page it read to `buildSectionTable`.
`buildSectionTable` keeps its signature: it takes the pages it is given.

`isHybrid` comes from `plants.ts`. One copy of the rule covers `×`, ` x `, and ` X `, so
the two modules cannot drift.

> Each fixture holds the page structure section 3 documents, trimmed to the rows the
> test reads: a little chrome, one table of links, and 2 to 6 real oak names.
> Task 19 replaces them with recorded pages after the first live fetch.

- [ ] **Step 1: Write the Lobatae fixture**

This is page 1 of the section. The last row holds the "Next page" anchor.

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

- [ ] **Step 2: Write the second Lobatae fixture**

Page 2 of the same section. It holds two more species and a "Previous page" anchor, and
no next link, so `nextPageUrl` gives null and the loop in `cli data sections` stops.

`pipeline/tests/fixtures/fna_lobatae_page2.html`:

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
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501239"><i>Quercus shumardii</i></a> Buckley</td>
  </tr>
  <tr>
    <td><a href="florataxon.aspx?flora_id=1&amp;taxon_id=233501240"><i>Quercus texana</i></a> Buckley</td>
  </tr>
  <tr>
    <td><a href="browse.aspx?flora_id=1&amp;start_taxon_id=302020">Previous page</a></td>
  </tr>
</table>
<div id="footer">
  <a href="http://www.efloras.org/about.aspx">About eFloras</a>
</div>
</body>
</html>
```

- [ ] **Step 3: Write the Quercus fixture**

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

- [ ] **Step 4: Write the Protobalanus fixture**

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

- [ ] **Step 5: Write the committed table**

`cli data sections` fetches the three sections, follows every next link, and fills the
full 90 rows. Task 19 runs it and commits the result. This seed holds the oaks the v0 runs
name plus the oaks in the fixtures, so the pipeline works before the first live fetch.

No test reads this file. `cli data sections` overwrites it, so a test that read it would
break on the first live run. The test reads the frozen copy of Step 6 instead.

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
  "Quercus texana": "Lobatae",
  "Quercus vacciniifolia": "Protobalanus",
  "Quercus velutina": "Lobatae"
}
```

- [ ] **Step 6: Write the frozen copy the test reads**

The same rows, under `fixtures/`. `loadSectionTable` is tested against this file, so a
live `cli data sections` run cannot change what the test asserts.

`pipeline/tests/fixtures/quercus_sections_sample.json`:

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
  "Quercus texana": "Lobatae",
  "Quercus vacciniifolia": "Protobalanus",
  "Quercus velutina": "Lobatae"
}
```

- [ ] **Step 7: Write the failing test**

`pipeline/tests/fna.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SECTION_PAGES,
  parseSectionPage,
  nextPageUrl,
  buildSectionTable,
  sectionFor,
  loadSectionTable,
} from '../lib/fna.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures');
const sampleTable = path.join(fixtures, 'quercus_sections_sample.json');

function fixture(name: string): string {
  return fs.readFileSync(path.join(fixtures, name), 'utf8');
}

const lobatae = fixture('fna_lobatae.html');
const lobataePage2 = fixture('fna_lobatae_page2.html');
const quercus = fixture('fna_quercus.html');
const protobalanus = fixture('fna_protobalanus.html');

const LOBATAE = SECTION_PAGES[0];
const QUERCUS = SECTION_PAGES[1];
const PROTOBALANUS = SECTION_PAGES[2];
const LOBATAE_PAGE_2 = `${LOBATAE.url}&page=2`;

test('the Lobatae first page parses to its four species, in page order', () => {
  assert.deepEqual(parseSectionPage(lobatae), [
    'Quercus rubra',
    'Quercus velutina',
    'Quercus palustris',
    'Quercus coccinea',
  ]);
});

test('the Lobatae second page parses to its two species, in page order', () => {
  assert.deepEqual(parseSectionPage(lobataePage2), [
    'Quercus shumardii',
    'Quercus texana',
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
  assert.equal(names.length, 7);
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
  assert.equal(names.length, 4);
  assert.equal(names.some((name) => name.includes('runcinata')), false);
  assert.equal(names.some((name) => name.includes('×')), false);
});

test('nextPageUrl gives the absolute url of the next page anchor', () => {
  assert.equal(LOBATAE.section, 'Lobatae');
  assert.equal(nextPageUrl(lobatae, LOBATAE.url), LOBATAE_PAGE_2);
  assert.equal(nextPageUrl(quercus, QUERCUS.url), `${QUERCUS.url}&page=2`);
});

test('nextPageUrl gives null when the page holds no next page anchor', () => {
  assert.match(lobataePage2, /Previous page/);
  assert.equal(nextPageUrl(lobataePage2, LOBATAE_PAGE_2), null);
  assert.equal(nextPageUrl(protobalanus, PROTOBALANUS.url), null);
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

test('buildSectionTable joins two pages of one section', () => {
  const table = buildSectionTable([
    { section: 'Lobatae', html: lobatae },
    { section: 'Lobatae', html: lobataePage2 },
  ]);
  assert.equal(
    Object.keys(table).length,
    parseSectionPage(lobatae).length + parseSectionPage(lobataePage2).length,
  );
  assert.equal(table['Quercus rubra'], 'Lobatae');
  assert.equal(table['Quercus texana'], 'Lobatae');
});

test('a name on two sections throws, and the message names the species and both sections', () => {
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
  assert.equal(sectionFor(table, ''), null);
});

test('loadSectionTable reads a table file, and sectionFor answers from it', () => {
  const table = loadSectionTable(sampleTable);
  assert.equal(table['Quercus gambelii'], 'Quercus');
  assert.equal(table['Quercus rubra'], 'Lobatae');
  assert.equal(sectionFor(table, ' quercus GAMBELII var. gambelii '), 'Quercus');
  assert.equal(sectionFor(table, 'Acer rubrum'), null);
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

test('loadSectionTable rejects a file that is not an object of strings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-fna-'));
  try {
    const arrayFile = path.join(dir, 'array_sections.json');
    fs.writeFileSync(arrayFile, '["Quercus alba"]', 'utf8');
    assert.throws(() => loadSectionTable(arrayFile), /not a JSON object/);
    const numberFile = path.join(dir, 'number_sections.json');
    fs.writeFileSync(numberFile, '{"Quercus alba": 7}', 'utf8');
    assert.throws(() => loadSectionTable(numberFile), /non-string section for Quercus alba/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `node --test pipeline/tests/fna.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\fna.ts' imported from <repo>\pipeline\tests\fna.test.ts`

- [ ] **Step 9: Create `pipeline/lib/fna.ts`**

```ts
import fs from 'node:fs';

import { isHybrid } from './plants.ts';

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

/** The text of the anchor that leads to the next page of a section. */
const NEXT_TEXT = 'next page';

/** A genus and an epithet. A one-word name is the genus alone, not a species. */
const BINOMIAL_WORDS = 2;

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

function textOf(inner: string): string {
  return squash(decodeEntities(inner.replace(TAG, ' ')));
}

/** A taxon link carries a taxon_id parameter. start_taxon_id is a browse link, not a taxon. */
function isTaxonLink(href: string): boolean {
  return /[?&]taxon_id=\d+/.test(href);
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
    const name = textOf(italic === null ? inner : italic[1]);
    if (name === '') continue;
    if (isHybrid(name)) continue;
    if (name.split(' ').length < BINOMIAL_WORDS) continue;
    names.push(name);
  }
  return names;
}

/**
 * The absolute url of the "Next page" anchor, or null when the page holds none.
 * `pageUrl` is the absolute url the html came from. `cli data sections` calls
 * this after each page and stops when it gives null.
 */
export function nextPageUrl(html: string, pageUrl: string): string | null {
  ANCHOR.lastIndex = 0;
  let match: RegExpExecArray | null = ANCHOR.exec(html);
  while (match !== null) {
    const href = hrefOf(match[1]);
    const text = textOf(match[2]).toLowerCase();
    match = ANCHOR.exec(html);
    if (href === null || href === '') continue;
    if (text !== NEXT_TEXT) continue;
    return new URL(href, pageUrl).toString();
  }
  return null;
}

/** Maps every name on every page to its section. A name in two sections is an error. */
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
  if (words.length > BINOMIAL_WORDS) {
    const species = byKey[words.slice(0, BINOMIAL_WORDS).join(' ')];
    if (species !== undefined) return species;
  }
  return null;
}

/** Reads a section table from disk. A missing file names the command that writes it. */
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

- [ ] **Step 10: Run the test to verify it passes**

Run: `node --test pipeline/tests/fna.test.ts`
Expected: PASS, 17 tests. Node prints `# pass 17` and `# fail 0`.

- [ ] **Step 11: Commit**

```bash
git add pipeline/lib/fna.ts pipeline/data/quercus_sections.json pipeline/tests/fna.test.ts pipeline/tests/fixtures/fna_lobatae.html pipeline/tests/fixtures/fna_lobatae_page2.html pipeline/tests/fixtures/fna_quercus.html pipeline/tests/fixtures/fna_protobalanus.html pipeline/tests/fixtures/quercus_sections_sample.json && git commit -m "feat: add the oak section table from Flora of North America" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: iNaturalist

**Files:**
- Create: `pipeline/lib/json_fields.ts`
- Create: `pipeline/lib/licenses.ts`
- Create: `pipeline/lib/inat.ts`
- Create: `pipeline/data/inat_terms.json`
- Test: `pipeline/tests/json_fields.test.ts`
- Test: `pipeline/tests/licenses.test.ts`
- Test: `pipeline/tests/inat.test.ts`
- Fixture: `pipeline/tests/fixtures/inat_taxa_quga.json`
- Fixture: `pipeline/tests/fixtures/inat_taxa_empty.json`
- Fixture: `pipeline/tests/fixtures/inat_observations_quga.json`
- Fixture: `pipeline/tests/fixtures/inat_observations_unfiltered.json`
- Fixture: `pipeline/tests/fixtures/inat_observations_error.json`

**Interfaces:**
- Consumes, from `pipeline/lib/candidates.ts` (Task 2):
  - `function makeCandidate(fields: Partial<Candidate> & { target: string; source_key: SourceKey; origin: string; file_url: string }): Candidate`
  - `function licenseAllowed(text: string): boolean`
  - `const SOURCE_NAMES: Record<SourceKey, string>` (the test reads it)
  - `interface Candidate`
  - `type SourceKey`
- Produces, from `pipeline/lib/json_fields.ts`:
  - `function asRecord(value: unknown): Record<string, unknown> | null`
  - `function asString(value: unknown): string | null`
  - `function asNumber(value: unknown): number | null`
  - `function asArray(value: unknown): unknown[] | null`
- Produces, from `pipeline/lib/licenses.ts`:
  - `function normalizeLicenseUrl(url: string | null): string | null`
- Produces, from `pipeline/lib/inat.ts`:
  - `const INAT_API: string` is `'https://api.inaturalist.org/v1'`
  - `const PHENOLOGY_TERM_ID: number` is `12`
  - `const FRUITING_VALUE_ID: number` is `14`
  - `const PER_PAGE: number` is `50`
  - `interface InatPass { name: string; term_value_id: number | null; channel_hint: string | null; tags_hint: string[] }`
  - `interface InatTaxon { id: number; name: string }`
  - `interface InatPhoto { observation_id: number; photo_id: number; url: string; license_code: string; attribution: string; taxon_name: string }`
  - `function inatPasses(floweringValueId: number): InatPass[]`
  - `function taxaUrl(scientific: string): string`
  - `function observationsUrl(taxonId: number, page: number, pass: InatPass): string`
  - `function phenologyProbeUrl(perPage: number): string`
  - `function parseTaxon(json: unknown): InatTaxon | null`
  - `function photoUrlSize(url: string, size: string): string`
  - `function licenseLabel(code: string): string`
  - `function licenseUrlFor(code: string): string | null`
  - `function parseObservations(json: unknown): { photos: InatPhoto[]; error: string | null }`
  - `function inatCandidates(photos: InatPhoto[], target: string, pass: InatPass, now: string): Candidate[]`
  - `function loadInatTerms(path: string): { flowering_value_id: number }`

This task creates three modules.

`json_fields.ts` holds the four readers for a parsed JSON value. Each one returns `null`
when the value is not of the type, and `asString` counts an empty string as `null`. The
source parsers of Task 5, Task 6, and Task 13 all read an untyped body, so one contract
serves all three. Nothing here is defensive about the type of its own argument: the
argument is `unknown` by design.

`licenses.ts` holds `normalizeLicenseUrl`. iNat's license table carries a trailing slash
and Commons' `LicenseUrl` field does not, so without one helper the two sources would
write two spellings of one license into the manifest.

`inat.ts` holds the url builders and the parsers for iNaturalist API v1. It does not
import `http.ts`. The caller fetches the url and hands the parsed JSON back, so every
function is pure except `loadInatTerms`, which takes the file path as a parameter.
Network, the clock, object storage, and image resizing are injected; disk is not, so a
module that reads a file takes the path as a parameter.

Section 6 runs three observation passes per species. The first pass takes no phenology
filter. The second and third filter with `term_id=12` and a value id. Fruiting is value
14. The flowering value is not in the code, because the `controlled_terms` endpoint did
not answer when the spec was written. It sits in `pipeline/data/inat_terms.json`, and
Task 13's `cli data inat-terms` command re-reads it from live observations through
`phenologyProbeUrl`.

An iNat origin carries the photo id in a fragment:
`https://www.inaturalist.org/observations/<observation_id>#photo=<photo_id>`. Two photos
of one observation are two candidates, and a fragment never reaches the server, so the
link still opens the observation page.

`parseObservations` returns an `error` field. An iNat error body arrives with an HTTP
status the caller may not check, so without this field a failed call reads as an empty
listing and the run reports "no photos" for a species the API refused.

The five fixtures hold the fields section 3 documents, trimmed to the rows the tests
read. They are hand-built, not recorded. The photo host is `static.inaturalist.org`, the
host the spec records. Task 19 replaces each fixture with a recorded response after the
first live fetch and re-runs the suite.

- [ ] **Step 1: Write the failing test for `json_fields`**

`pipeline/tests/json_fields.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { asRecord, asString, asNumber, asArray } from '../lib/json_fields.ts';

test('asRecord admits a plain object and rejects an array, null, and a scalar', () => {
  assert.deepEqual(asRecord({ a: 1 }), { a: 1 });
  assert.equal(asRecord([1, 2]), null);
  assert.equal(asRecord(null), null);
  assert.equal(asRecord('a'), null);
  assert.equal(asRecord(undefined), null);
});

test('asString admits a non-empty string and counts an empty string as absent', () => {
  assert.equal(asString('leaf'), 'leaf');
  assert.equal(asString(''), null);
  assert.equal(asString(' '), ' ');
  assert.equal(asString(5), null);
  assert.equal(asString(null), null);
});

test('asNumber admits a finite number and rejects NaN, Infinity, and a numeric string', () => {
  assert.equal(asNumber(0), 0);
  assert.equal(asNumber(-12.5), -12.5);
  assert.equal(asNumber(Number.NaN), null);
  assert.equal(asNumber(Number.POSITIVE_INFINITY), null);
  assert.equal(asNumber('12'), null);
  assert.equal(asNumber(null), null);
});

test('asArray admits an array and rejects an object and a string', () => {
  assert.deepEqual(asArray([1, 'a']), [1, 'a']);
  assert.deepEqual(asArray([]), []);
  assert.equal(asArray({ length: 2 }), null);
  assert.equal(asArray('ab'), null);
  assert.equal(asArray(null), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/json_fields.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\json_fields.ts' imported from <repo>\pipeline\tests\json_fields.test.ts`, and `# fail 1`.

- [ ] **Step 3: Create `pipeline/lib/json_fields.ts`**

```ts
/**
 * The four readers for a value out of a parsed JSON body. Each one returns null when the
 * value is not of the type, so a caller writes one `=== null` check per field. An empty
 * string counts as absent, because every field these parsers read is a url, a title, a
 * name, or a code, and an empty one of those is no value at all.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test pipeline/tests/json_fields.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Write the failing test for `licenses`**

`pipeline/tests/licenses.test.ts`:

```ts
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
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `node --test pipeline/tests/licenses.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\licenses.ts' imported from <repo>\pipeline\tests\licenses.test.ts`, and `# fail 1`.

- [ ] **Step 7: Create `pipeline/lib/licenses.ts`**

```ts
/**
 * One spelling for a license url. iNat's table carries a trailing slash and Commons'
 * `LicenseUrl` field does not, so two sources would otherwise write two urls for one
 * license. A url that trims to nothing is absent.
 */
export function normalizeLicenseUrl(url: string | null): string | null {
  if (url === null) return null;
  const trimmed = url.trim();
  if (trimmed === '') return null;
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test pipeline/tests/licenses.test.ts`
Expected: PASS, 1 test

- [ ] **Step 9: Write the taxon fixture**

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

- [ ] **Step 10: Write the empty taxon fixture**

`pipeline/tests/fixtures/inat_taxa_empty.json`:

```json
{
  "total_results": 0,
  "page": 1,
  "per_page": 1,
  "results": []
}
```

- [ ] **Step 11: Write the observations fixture**

This is the body the request asks for: `observationsUrl` always sends
`photo_license=cc0,cc-by,cc-by-sa`, so every photo here carries an allowed license.
Three observations. The first carries two photos, so the test can prove that two photos
of one observation give two candidate ids. The third carries a `cc0` photo whose url
ends in `.jpeg`, so the test can prove `photoUrlSize` keeps the extension, and its taxon
is a variety, so the test can prove `source_species` reads the observation's taxon.

`pipeline/tests/fixtures/inat_observations_quga.json`:

```json
{
  "total_results": 3,
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
          "url": "https://static.inaturalist.org/photos/999001/square.jpg"
        },
        {
          "id": 999002,
          "license_code": "cc-by",
          "attribution": "(c) Lyrae, some rights reserved (CC BY)",
          "url": "https://static.inaturalist.org/photos/999002/square.jpg"
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
          "license_code": "cc-by-sa",
          "attribution": "(c) Pat Ruiz, some rights reserved (CC BY-SA)",
          "url": "https://static.inaturalist.org/photos/999003/square.jpg"
        }
      ]
    },
    {
      "id": 121003,
      "quality_grade": "research",
      "taxon": { "id": 1155222, "name": "Quercus gambelii var. gambelii", "rank": "variety" },
      "photos": [
        {
          "id": 999004,
          "license_code": "cc0",
          "attribution": "Marta Olsen, no rights reserved (CC0)",
          "url": "https://static.inaturalist.org/photos/999004/square.jpeg"
        }
      ]
    }
  ]
}
```

- [ ] **Step 12: Write the unfiltered observations fixture**

This body holds the rows the `photo_license` parameter should have removed. It exists to
prove the two license guards inside the module: `parseObservations` drops a photo with
`license_code: null`, and `inatCandidates` drops a `cc-by-nc` photo. One observation,
three photos.

`pipeline/tests/fixtures/inat_observations_unfiltered.json`:

```json
{
  "total_results": 1,
  "page": 1,
  "per_page": 50,
  "results": [
    {
      "id": 121101,
      "quality_grade": "research",
      "taxon": { "id": 47851, "name": "Quercus gambelii", "rank": "species" },
      "photos": [
        {
          "id": 999101,
          "license_code": null,
          "attribution": "(c) Tam Nguyen, all rights reserved",
          "url": "https://static.inaturalist.org/photos/999101/square.jpg"
        },
        {
          "id": 999102,
          "license_code": "cc-by-nc",
          "attribution": "(c) Ravi Patel, some rights reserved (CC BY-NC)",
          "url": "https://static.inaturalist.org/photos/999102/square.jpg"
        },
        {
          "id": 999103,
          "license_code": "cc-by",
          "attribution": "(c) Dana Cole, some rights reserved (CC BY)",
          "url": "https://static.inaturalist.org/photos/999103/square.jpg"
        }
      ]
    }
  ]
}
```

- [ ] **Step 13: Write the error fixture**

iNat answers a failed query with an `error` key. The status line may still read 200 from
a proxy, so the parser reads the body.

`pipeline/tests/fixtures/inat_observations_error.json`:

```json
{
  "error": "Internal Server Error",
  "status": 500
}
```

- [ ] **Step 14: Write the terms data file**

13 is the flowering value the pipeline assumes. The `controlled_terms` endpoint did not
answer when the spec was written, so nobody confirmed it. Task 13's `cli data inat-terms`
reads it back from live observations, and Task 19 runs that command before the first
public run.

`pipeline/data/inat_terms.json`:

```json
{
  "flowering_value_id": 13
}
```

- [ ] **Step 15: Write the failing test**

`pipeline/tests/inat.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PHENOLOGY_TERM_ID,
  FRUITING_VALUE_ID,
  PER_PAGE,
  inatPasses,
  taxaUrl,
  observationsUrl,
  phenologyProbeUrl,
  parseTaxon,
  photoUrlSize,
  licenseLabel,
  licenseUrlFor,
  parseObservations,
  inatCandidates,
  loadInatTerms,
} from '../lib/inat.ts';
import type { InatPhoto } from '../lib/inat.ts';
import { SOURCE_NAMES } from '../lib/candidates.ts';

const taxaFixture = new URL('./fixtures/inat_taxa_quga.json', import.meta.url);
const taxaEmptyFixture = new URL('./fixtures/inat_taxa_empty.json', import.meta.url);
const observationsFixture = new URL('./fixtures/inat_observations_quga.json', import.meta.url);
const unfilteredFixture = new URL(
  './fixtures/inat_observations_unfiltered.json',
  import.meta.url,
);
const errorFixture = new URL('./fixtures/inat_observations_error.json', import.meta.url);
const termsPath = fileURLToPath(new URL('../data/inat_terms.json', import.meta.url));

function readFixture(url: URL): unknown {
  return JSON.parse(fs.readFileSync(url, 'utf8'));
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-inat-'));
}

const NOW = '2026-09-22T15:04:00Z';
const TAXON_ID = 47851;
// One name for the flowering value, read from the committed data file.
const FLOWERING_VALUE_ID = loadInatTerms(termsPath).flowering_value_id;
// A value no pass hard-codes, so a test can prove where the argument lands.
const PROBE_VALUE_ID = 99;

test('parseTaxon reads the id and the name, and gives null on no result', () => {
  const taxon = parseTaxon(readFixture(taxaFixture));
  assert.equal(taxon?.id, TAXON_ID);
  assert.equal(taxon?.name, 'Quercus gambelii');
  assert.equal(parseTaxon(readFixture(taxaEmptyFixture)), null);
  assert.equal(parseTaxon('not an object'), null);
});

test('photoUrlSize swaps the size and keeps the extension', () => {
  const square = 'https://static.inaturalist.org/photos/999001/square.jpg';
  assert.equal(
    photoUrlSize(square, 'original'),
    'https://static.inaturalist.org/photos/999001/original.jpg',
  );
  assert.equal(
    photoUrlSize(square, 'medium'),
    'https://static.inaturalist.org/photos/999001/medium.jpg',
  );
  assert.equal(
    photoUrlSize(square, 'large'),
    'https://static.inaturalist.org/photos/999001/large.jpg',
  );
  const jpeg = 'https://static.inaturalist.org/photos/999004/square.jpeg';
  assert.equal(
    photoUrlSize(jpeg, 'original'),
    'https://static.inaturalist.org/photos/999004/original.jpeg',
  );
});

test('observationsUrl carries every parameter and the fruiting pass adds the phenology filter', () => {
  const fruiting = inatPasses(FLOWERING_VALUE_ID)[2];
  assert.equal(
    observationsUrl(TAXON_ID, 1, fruiting),
    'https://api.inaturalist.org/v1/observations' +
      '?taxon_id=47851&quality_grade=research&photo_license=cc0,cc-by,cc-by-sa' +
      `&photos=true&order_by=votes&per_page=${PER_PAGE}&page=1` +
      `&term_id=${PHENOLOGY_TERM_ID}&term_value_id=${FRUITING_VALUE_ID}`,
  );

  const url = observationsUrl(TAXON_ID, 3, fruiting);
  for (const part of [
    'taxon_id=47851',
    'quality_grade=research',
    'photo_license=cc0,cc-by,cc-by-sa',
    'photos=true',
    'order_by=votes',
    `per_page=${PER_PAGE}`,
    'page=3',
    `term_id=${PHENOLOGY_TERM_ID}`,
    `term_value_id=${FRUITING_VALUE_ID}`,
  ]) {
    assert.ok(url.includes(part), `missing ${part}`);
  }
});

test('the any pass adds no term_id', () => {
  const any = inatPasses(FLOWERING_VALUE_ID)[0];
  const url = observationsUrl(TAXON_ID, 1, any);
  assert.equal(url.includes('term_id'), false);
  assert.equal(url.includes('term_value_id'), false);
  assert.equal(
    url,
    'https://api.inaturalist.org/v1/observations' +
      '?taxon_id=47851&quality_grade=research&photo_license=cc0,cc-by,cc-by-sa' +
      `&photos=true&order_by=votes&per_page=${PER_PAGE}&page=1`,
  );
});

test('phenologyProbeUrl asks for phenology-annotated photos and names no value', () => {
  const url = phenologyProbeUrl(PER_PAGE);
  assert.equal(
    url,
    'https://api.inaturalist.org/v1/observations' +
      `?term_id=${PHENOLOGY_TERM_ID}&quality_grade=research&photos=true&per_page=${PER_PAGE}`,
  );
  // `cli data inat-terms` reads the value ids out of the answer, so it sends none.
  assert.equal(url.includes('term_value_id'), false);
  assert.ok(phenologyProbeUrl(1).endsWith('per_page=1'));
});

test('inatPasses returns the three passes with their hints and tags', () => {
  assert.deepEqual(inatPasses(FLOWERING_VALUE_ID), [
    { name: 'any', term_value_id: null, channel_hint: null, tags_hint: [] },
    {
      name: 'flowering',
      term_value_id: FLOWERING_VALUE_ID,
      channel_hint: 'flower',
      tags_hint: ['flowering'],
    },
    {
      name: 'fruiting',
      term_value_id: FRUITING_VALUE_ID,
      channel_hint: 'fruit',
      tags_hint: ['fruiting'],
    },
  ]);

  // The argument reaches the flowering pass and nothing else.
  const passes = inatPasses(PROBE_VALUE_ID);
  assert.equal(passes[1].term_value_id, PROBE_VALUE_ID);
  assert.equal(passes[2].term_value_id, FRUITING_VALUE_ID);
});

test('parseObservations flattens every photo of every observation', () => {
  const { photos, error } = parseObservations(readFixture(observationsFixture));
  assert.equal(error, null);
  assert.equal(photos.length, 4);
  assert.deepEqual(
    photos.map((photo) => photo.photo_id),
    [999001, 999002, 999003, 999004],
  );
  assert.deepEqual(
    photos.map((photo) => photo.observation_id),
    [121001, 121001, 121002, 121003],
  );
  assert.equal(photos[0].license_code, 'cc-by');
  assert.equal(photos[0].attribution, '(c) Lyrae, some rights reserved (CC BY)');
  assert.equal(photos[0].taxon_name, 'Quercus gambelii');
  assert.equal(photos[3].taxon_name, 'Quercus gambelii var. gambelii');
  assert.equal(photos[3].url, 'https://static.inaturalist.org/photos/999004/square.jpeg');
});

test('parseObservations reports an API error instead of an empty listing', () => {
  const failed = parseObservations(readFixture(errorFixture));
  assert.equal(failed.error, 'Internal Server Error');
  assert.deepEqual(failed.photos, []);

  // A body that is not an object is a failure too, not an empty page.
  assert.equal(parseObservations('<html>').error, 'the response body is not an object');

  // A real empty page stays an empty page, with no error.
  const empty = parseObservations({ total_results: 0, page: 1, per_page: PER_PAGE, results: [] });
  assert.deepEqual(empty, { photos: [], error: null });
});

test('the parser guards the license on its own, so a server that ignores the filter cannot slip a row through', () => {
  const { photos, error } = parseObservations(readFixture(unfilteredFixture));
  assert.equal(error, null);

  // parseObservations drops the photo with no license code.
  assert.deepEqual(
    photos.map((photo) => photo.photo_id),
    [999102, 999103],
  );

  // inatCandidates drops the CC BY-NC photo.
  const rows = inatCandidates(photos, 'QUGA', inatPasses(FLOWERING_VALUE_ID)[0], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].license, 'CC BY 4.0');
  assert.equal(
    rows.some((row) => row.license.includes('NC')),
    false,
  );
});

test('inatCandidates gives each photo of an observation its own id', () => {
  const { photos } = parseObservations(readFixture(observationsFixture));
  const rows = inatCandidates(photos, 'QUGA', inatPasses(FLOWERING_VALUE_ID)[0], NOW);

  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.license),
    ['CC BY 4.0', 'CC BY 4.0', 'CC BY-SA 4.0', 'CC0 1.0'],
  );

  // The origin carries the photo id, so two photos of one observation are two rows.
  assert.equal(rows[0].origin, 'https://www.inaturalist.org/observations/121001#photo=999001');
  assert.equal(rows[1].origin, 'https://www.inaturalist.org/observations/121001#photo=999002');
  assert.notEqual(rows[0].id, rows[1].id);
  assert.notEqual(rows[0].file_url, rows[1].file_url);
});

test('a candidate points at the observation photo and the original photo size', () => {
  const { photos } = parseObservations(readFixture(observationsFixture));
  const fruiting = inatPasses(FLOWERING_VALUE_ID)[2];
  const row = inatCandidates(photos, 'QUGA', fruiting, NOW)[3];

  assert.equal(row.source_key, 'inat');
  assert.equal(row.source, SOURCE_NAMES.inat);
  assert.equal(row.source, 'iNaturalist');
  assert.equal(row.target, 'QUGA');
  assert.equal(row.origin, 'https://www.inaturalist.org/observations/121003#photo=999004');
  assert.equal(row.file_url, 'https://static.inaturalist.org/photos/999004/original.jpeg');
  assert.equal(row.author, 'Marta Olsen, no rights reserved (CC0)');
  assert.equal(row.license, 'CC0 1.0');
  assert.equal(row.license_url, 'https://creativecommons.org/publicdomain/zero/1.0/');
  assert.equal(row.source_species, 'Quercus gambelii var. gambelii');
  assert.equal(row.channel_hint, 'fruit');
  assert.deepEqual(row.tags_hint, ['fruiting']);
  assert.equal(row.fetched_at, NOW);
  assert.equal(row.local, null);
  assert.equal(row.file_hash, null);
  assert.equal(row.identity_match, null);
  assert.equal(row.fetch_error, null);
});

test('inatCandidates excludes a photo with an empty attribution', () => {
  const photos: InatPhoto[] = [
    {
      observation_id: 7,
      photo_id: 8,
      url: 'https://static.inaturalist.org/photos/8/square.jpg',
      license_code: 'cc0',
      attribution: '   ',
      taxon_name: 'Quercus gambelii',
    },
    {
      observation_id: 7,
      photo_id: 9,
      url: 'https://static.inaturalist.org/photos/9/square.jpg',
      license_code: 'cc0',
      attribution: 'Marta Olsen, no rights reserved (CC0)',
      taxon_name: 'Quercus gambelii',
    },
  ];
  // The app prints author, source, and license verbatim, so a row with no author is
  // no use to the pipeline.
  const rows = inatCandidates(photos, 'QUGA', inatPasses(FLOWERING_VALUE_ID)[0], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].author, 'Marta Olsen, no rights reserved (CC0)');
});

test('licenseLabel and licenseUrlFor map every code and give a trailing slash', () => {
  assert.equal(licenseLabel('cc0'), 'CC0 1.0');
  assert.equal(licenseLabel('cc-by'), 'CC BY 4.0');
  assert.equal(licenseLabel('cc-by-sa'), 'CC BY-SA 4.0');
  assert.equal(licenseLabel('cc-by-nc'), 'CC BY-NC 4.0');
  assert.equal(licenseLabel('cc-by-nc-sa'), 'CC BY-NC-SA 4.0');
  assert.equal(licenseLabel('cc-by-nd'), 'CC BY-ND 4.0');
  assert.equal(licenseLabel('cc-by-nc-nd'), 'CC BY-NC-ND 4.0');
  assert.equal(licenseLabel('gfdl'), 'All rights reserved');

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
});

test('loadInatTerms reads the flowering value and reports an absent file', () => {
  assert.deepEqual(loadInatTerms(termsPath), { flowering_value_id: 13 });
  assert.throws(
    () => loadInatTerms(path.join(tempDir(), 'no_such_terms.json')),
    /data inat-terms/,
  );
});

test('loadInatTerms reports a file with no flowering_value_id', () => {
  const file = path.join(tempDir(), 'inat_terms.json');
  fs.writeFileSync(file, JSON.stringify({ note: 'nobody filled this in' }));
  assert.throws(() => loadInatTerms(file), /flowering_value_id/);

  const wrongType = path.join(tempDir(), 'inat_terms.json');
  fs.writeFileSync(wrongType, JSON.stringify({ flowering_value_id: '13' }));
  assert.throws(() => loadInatTerms(wrongType), /flowering_value_id/);
});

test('taxaUrl url-encodes the space in a scientific name', () => {
  assert.equal(
    taxaUrl('Quercus gambelii'),
    'https://api.inaturalist.org/v1/taxa?q=Quercus%20gambelii&rank=species&per_page=1',
  );
});

test('a pass writes its channel hint and tags onto every row', () => {
  const photos: InatPhoto[] = [
    {
      observation_id: 5,
      photo_id: 6,
      url: 'https://static.inaturalist.org/photos/6/square.jpg',
      license_code: 'cc-by-sa',
      attribution: '(c) Pat Ruiz, some rights reserved (CC BY-SA)',
      taxon_name: 'Quercus gambelii',
    },
  ];
  const rows = inatCandidates(photos, 'bark/plated', inatPasses(FLOWERING_VALUE_ID)[1], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].target, 'bark/plated');
  assert.equal(rows[0].license, 'CC BY-SA 4.0');
  assert.equal(rows[0].channel_hint, 'flower');
  assert.deepEqual(rows[0].tags_hint, ['flowering']);
});
```

- [ ] **Step 16: Run the test to verify it fails**

Run: `node --test pipeline/tests/inat.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\inat.ts' imported from <repo>\pipeline\tests\inat.test.ts`, and `# fail 1`.

- [ ] **Step 17: Create `pipeline/lib/inat.ts`**

```ts
import fs from 'node:fs';

import { makeCandidate, licenseAllowed } from './candidates.ts';
import type { Candidate } from './candidates.ts';
import { asRecord, asString, asNumber, asArray } from './json_fields.ts';
import { normalizeLicenseUrl } from './licenses.ts';

export const INAT_API: string = 'https://api.inaturalist.org/v1';
export const PHENOLOGY_TERM_ID: number = 12;
export const FRUITING_VALUE_ID: number = 14;
export const PER_PAGE: number = 50;

const PHOTO_LICENSES: string = 'cc0,cc-by,cc-by-sa';

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

/**
 * Observations that carry a phenology annotation, with no value id. Task 13's
 * `cli data inat-terms` reads the value ids out of the answer and writes the flowering
 * one to `pipeline/data/inat_terms.json`.
 */
export function phenologyProbeUrl(perPage: number): string {
  const params = [
    `term_id=${PHENOLOGY_TERM_ID}`,
    'quality_grade=research',
    'photos=true',
    `per_page=${perPage}`,
  ];
  return `${INAT_API}/observations?${params.join('&')}`;
}

export function parseTaxon(json: unknown): InatTaxon | null {
  const root = asRecord(json);
  if (root === null) return null;
  const first = resultsOf(root)[0];
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

// The table holds the path. `normalizeLicenseUrl` adds the trailing slash, so iNat and
// Commons write one spelling of a license url.
const LICENSE_URLS: Record<string, string> = {
  cc0: 'https://creativecommons.org/publicdomain/zero/1.0',
  'cc-by': 'https://creativecommons.org/licenses/by/4.0',
  'cc-by-sa': 'https://creativecommons.org/licenses/by-sa/4.0',
  'cc-by-nc': 'https://creativecommons.org/licenses/by-nc/4.0',
  'cc-by-nc-sa': 'https://creativecommons.org/licenses/by-nc-sa/4.0',
  'cc-by-nd': 'https://creativecommons.org/licenses/by-nd/4.0',
  'cc-by-nc-nd': 'https://creativecommons.org/licenses/by-nc-nd/4.0',
};

/**
 * iNat reports the license family, not the version. 4.0 is the version iNat applies to
 * a new upload, so the label is the pipeline's reading and the agent checks it against
 * the source page.
 */
export function licenseLabel(code: string): string {
  return LICENSE_LABELS[code] ?? 'All rights reserved';
}

export function licenseUrlFor(code: string): string | null {
  return normalizeLicenseUrl(LICENSE_URLS[code] ?? null);
}

/**
 * Flattens the observations into photo rows. A photo with no license code is dropped,
 * because the label would read "All rights reserved" and the row could never publish.
 * The `error` field carries the API's own error, so a failed call never reads as an
 * empty listing.
 */
export function parseObservations(json: unknown): {
  photos: InatPhoto[];
  error: string | null;
} {
  const root = asRecord(json);
  if (root === null) return { photos: [], error: 'the response body is not an object' };
  const error = apiError(root);
  if (error !== null) return { photos: [], error };

  const photos: InatPhoto[] = [];
  for (const observation of resultsOf(root)) {
    const observationId = asNumber(observation.id);
    if (observationId === null) continue;
    const taxon = asRecord(observation.taxon);
    const taxonName = taxon === null ? null : asString(taxon.name);
    const rows = asArray(observation.photos) ?? [];
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
  return { photos, error: null };
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
    const author = photo.attribution.trim();
    // The app prints the credit verbatim, so a row with no author can never publish.
    if (author === '') continue;
    rows.push(
      makeCandidate({
        target,
        source_key: 'inat',
        // The fragment carries the photo id, so two photos of one observation are two
        // candidates. A fragment never reaches the server, so the link still opens the
        // observation page.
        origin: `https://www.inaturalist.org/observations/${photo.observation_id}#photo=${photo.photo_id}`,
        file_url: photoUrlSize(photo.url, 'original'),
        author,
        license,
        license_url: licenseUrlFor(photo.license_code),
        source_species: photo.taxon_name === '' ? null : photo.taxon_name,
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
    throw new Error(
      `the iNat terms file has no flowering_value_id: ${path}. Run "cli data inat-terms".`,
    );
  }
  return { flowering_value_id: value };
}

function resultsOf(root: Record<string, unknown>): Record<string, unknown>[] {
  const results = asArray(root.results);
  if (results === null) return [];
  const rows: Record<string, unknown>[] = [];
  for (const row of results) {
    const record = asRecord(row);
    if (record !== null) rows.push(record);
  }
  return rows;
}

/** iNat sends `error` as a string, or as an object with a `message`. */
function apiError(root: Record<string, unknown>): string | null {
  const direct = asString(root.error);
  if (direct !== null) return direct;
  const record = asRecord(root.error);
  if (record === null) return null;
  return asString(record.message) ?? 'the iNaturalist API returned an error';
}
```

- [ ] **Step 18: Run the tests to verify they pass**

Run: `node --test pipeline/tests/inat.test.ts`
Expected: PASS, 17 tests

Run: `node --test "pipeline/tests/**/*.test.ts"`
Expected: PASS, every test of Tasks 1 to 5, and `# fail 0`

- [ ] **Step 19: Commit**

```bash
git add pipeline/lib/json_fields.ts pipeline/lib/licenses.ts pipeline/lib/inat.ts pipeline/data/inat_terms.json pipeline/tests/json_fields.test.ts pipeline/tests/licenses.test.ts pipeline/tests/inat.test.ts pipeline/tests/fixtures/inat_taxa_quga.json pipeline/tests/fixtures/inat_taxa_empty.json pipeline/tests/fixtures/inat_observations_quga.json pipeline/tests/fixtures/inat_observations_unfiltered.json pipeline/tests/fixtures/inat_observations_error.json && git commit -m "feat: add the iNaturalist url builders and parsers" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: Wikimedia Commons

**Files:**
- Create: `pipeline/lib/commons.ts`
- Test: `pipeline/tests/commons.test.ts`
- Fixture: `pipeline/tests/fixtures/commons_category_quga.json`
- Fixture: `pipeline/tests/fixtures/commons_category_quga_page2.json`
- Fixture: `pipeline/tests/fixtures/commons_category_error.json`

**Interfaces:**
- Consumes, from `pipeline/lib/candidates.ts` (Task 2):
  - `function licenseAllowed(text: string): boolean`
  - `function channelHint(text: string): string | null`
  - `function makeCandidate(fields: Partial<Candidate> & { target: string; source_key: SourceKey; origin: string; file_url: string }): Candidate`
  - `const SOURCE_NAMES: Record<SourceKey, string>` (the test reads it)
  - `interface Candidate`
- Consumes, from `pipeline/lib/json_fields.ts` (Task 5):
  - `function asRecord(value: unknown): Record<string, unknown> | null`
  - `function asString(value: unknown): string | null`
  - `function asNumber(value: unknown): number | null`
  - `function asArray(value: unknown): unknown[] | null`
- Consumes, from `pipeline/lib/licenses.ts` (Task 5):
  - `function normalizeLicenseUrl(url: string | null): string | null`
- Produces:
  - `const COMMONS_API: string` is `'https://commons.wikimedia.org/w/api.php'`
  - `const COMMONS_PAGE_SIZE: number` is `50`
  - `const THUMB_WIDTH: number` is `1280`
  - `interface CommonsFile { title: string; mime: string; width: number; height: number; url: string; thumb_url: string; description_url: string; license: string; license_url: string | null; artist: string; description: string }`
  - `function categoryUrl(category: string, continueToken: string | null): string`
  - `function stripHtml(html: string): string`
  - `function parseCategoryListing(json: unknown): { files: CommonsFile[]; next: string | null; error: string | null }`
  - `function commonsCandidates(files: CommonsFile[], target: string, scientific: string, now: string): Candidate[]`

This module is pure. It builds the url and parses the response. It runs no fetch, so it
does not import `http.ts`. The caller passes the parsed JSON in and the run's timestamp
in. The four field readers and the license url helper come from Task 5, so Commons and
iNat read a body by one contract.

One call lists a Commons category and returns the image info for every file on the page.
The API is `action=query` with `generator=categorymembers`. The anonymous page size is
`COMMONS_PAGE_SIZE` titles. A continuation adds `gcmcontinue`. `parseCategoryListing`
reads the pages object, which the API keys by page id, so the module sorts the files by
title. `Artist` and `ImageDescription` come back as HTML, so both go through `stripHtml`.

`parseCategoryListing` skips a page with no `imageinfo` and a file with no
`descriptionurl`. A candidate id is the sha1 of `<target>|<origin>`, and the origin is
the description page, so every file of one species that lost its description page would
collapse onto one row. The `error` field carries the API's own error, so a refused query
never reads as an empty category.

`commonsCandidates` keeps a file only when its MIME type is `image/jpeg`,
`licenseAllowed` admits its `LicenseShortName`, and its artist is not empty after
trimming. The `file_url` is the `THUMB_WIDTH` thumbnail, or the original when the
original is not wider. The `origin` is the file's description page, not the file itself.

> The three fixtures hold the fields section 3 documents, trimmed to the rows the tests
> read. They are hand-built, not recorded. Task 19 replaces them with recorded responses
> after the first live fetch.

- [ ] **Step 1: Write the page 1 fixture**

`pipeline/tests/fixtures/commons_category_quga.json`:

Page 1 holds nine pages. Seven carry `imageinfo` and the parser returns them. One is an
audio file with no `imageinfo`. One is a JPEG with no `descriptionurl`. The page ids are
out of order, so the sort has something to do.

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
      },
      "999": {
        "pageid": 999,
        "ns": 6,
        "title": "File:Quercus gambelii twig.jpg",
        "imageinfo": [
          {
            "url": "https://upload.wikimedia.org/wikipedia/commons/9/99/Quercus_gambelii_twig.jpg",
            "descriptionurl": "https://commons.wikimedia.org/wiki/File:Quercus_gambelii_twig.jpg",
            "thumburl": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Quercus_gambelii_twig.jpg/1280px-Quercus_gambelii_twig.jpg",
            "thumbwidth": 1280,
            "thumbheight": 853,
            "width": 2400,
            "height": 1600,
            "mime": "image/jpeg",
            "extmetadata": {
              "LicenseShortName": { "value": "CC0" },
              "LicenseUrl": { "value": "https://creativecommons.org/publicdomain/zero/1.0" },
              "Artist": { "value": "" },
              "ImageDescription": { "value": "A young shoot in spring" }
            }
          }
        ]
      },
      "1001": {
        "pageid": 1001,
        "ns": 6,
        "title": "File:Quercus gambelii winter.jpg",
        "imageinfo": [
          {
            "url": "https://upload.wikimedia.org/wikipedia/commons/a/aa/Quercus_gambelii_winter.jpg",
            "thumburl": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Quercus_gambelii_winter.jpg/1280px-Quercus_gambelii_winter.jpg",
            "thumbwidth": 1280,
            "thumbheight": 853,
            "width": 3000,
            "height": 2000,
            "mime": "image/jpeg",
            "extmetadata": {
              "LicenseShortName": { "value": "CC0" },
              "LicenseUrl": { "value": "https://creativecommons.org/publicdomain/zero/1.0" },
              "Artist": { "value": "Ada Lovelace" },
              "ImageDescription": { "value": "Bare branches under snow" }
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

- [ ] **Step 3: Write the error fixture**

The MediaWiki API answers a bad query with an `error` object and no `query` key. The
status line is often 200, so the parser reads the body.

`pipeline/tests/fixtures/commons_category_error.json`:

```json
{
  "error": {
    "code": "invalidcategory",
    "info": "The category name you entered is not valid.",
    "*": "See https://commons.wikimedia.org/w/api.php for API usage."
  },
  "servedby": "mw-api-ext.codfw.main-6f7b8"
}
```

- [ ] **Step 4: Write the failing test**

`pipeline/tests/commons.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  COMMONS_PAGE_SIZE,
  THUMB_WIDTH,
  categoryUrl,
  stripHtml,
  parseCategoryListing,
  commonsCandidates,
  type CommonsFile,
} from '../lib/commons.ts';
import { SOURCE_NAMES } from '../lib/candidates.ts';

const page1Fixture = new URL('./fixtures/commons_category_quga.json', import.meta.url);
const page2Fixture = new URL('./fixtures/commons_category_quga_page2.json', import.meta.url);
const errorFixture = new URL('./fixtures/commons_category_error.json', import.meta.url);

function readFixture(url: URL): unknown {
  return JSON.parse(fs.readFileSync(url, 'utf8'));
}

function page1(): { files: CommonsFile[]; next: string | null; error: string | null } {
  return parseCategoryListing(readFixture(page1Fixture));
}

function fileNamed(files: CommonsFile[], title: string): CommonsFile {
  const found = files.find((file) => file.title === title);
  assert.ok(found, `the fixture holds ${title}`);
  return found;
}

const NOW = '2026-09-22T15:04:00Z';
const SCIENTIFIC = 'Quercus gambelii';

test('parseCategoryListing reads page 1 sorted by title and returns the continue token', () => {
  const { files, next, error } = page1();
  assert.equal(error, null);
  assert.equal(files.length, 7);
  assert.deepEqual(
    files.map((file) => file.title),
    [
      'File:Quercus gambelii acorn.jpg',
      'File:Quercus gambelii bark.jpg',
      'File:Quercus gambelii habit.jpg',
      'File:Quercus gambelii in autumn.jpg',
      'File:Quercus gambelii range map.svg',
      'File:Quercus gambelii sapling.jpg',
      'File:Quercus gambelii twig.jpg',
    ],
  );
  assert.equal(next, 'file|515545524355532047414d42454c49492e6a7067|60113541');

  const bark = fileNamed(files, 'File:Quercus gambelii bark.jpg');
  assert.equal(bark.mime, 'image/jpeg');
  assert.equal(bark.width, 4000);
  assert.equal(bark.height, 2667);
  assert.equal(bark.license, 'CC BY-SA 4.0');
  // Commons sends the license url with no trailing slash. The pipeline adds one.
  assert.equal(bark.license_url, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(bark.artist, 'Jane Doe');
  assert.equal(bark.description, 'Bark of Quercus gambelii in autumn');
  assert.equal(
    bark.description_url,
    'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark.jpg',
  );
});

test('parseCategoryListing skips a page with no imageinfo and a file with no description page', () => {
  const { files } = page1();
  // The audio file carries no imageinfo.
  assert.equal(
    files.some((file) => file.title === 'File:Quercus gambelii wind.ogg'),
    false,
  );
  // The winter JPEG carries no descriptionurl. A candidate id is the sha1 of
  // `<target>|<origin>`, so two rows of one target with no origin carry one id.
  assert.equal(
    files.some((file) => file.title === 'File:Quercus gambelii winter.jpg'),
    false,
  );
});

test('parseCategoryListing reads page 2 and reports no continuation', () => {
  const { files, next, error } = parseCategoryListing(readFixture(page2Fixture));
  assert.equal(error, null);
  assert.equal(files.length, 1);
  assert.equal(files[0].title, 'File:Quercus gambelii leaf detail.jpg');
  assert.equal(files[0].description, 'One leaf, upper surface');
  assert.equal(next, null);
});

test('parseCategoryListing reports an API error instead of an empty listing', () => {
  const failed = parseCategoryListing(readFixture(errorFixture));
  assert.equal(failed.error, 'The category name you entered is not valid.');
  assert.deepEqual(failed.files, []);
  assert.equal(failed.next, null);

  // A body that is not an object is a failure too.
  assert.equal(
    parseCategoryListing('<html>').error,
    'the response body is not an object',
  );
});

test('an empty category gives no files, no token, and no error', () => {
  const empty = parseCategoryListing({ batchcomplete: '', query: { pages: {} } });
  assert.deepEqual(empty, { files: [], next: null, error: null });
});

test('stripHtml decodes, strips the tags, then decodes once more', () => {
  assert.equal(stripHtml('<a href="x">Jane Doe</a>'), 'Jane Doe');
  assert.equal(stripHtml('Leaves &amp; twigs'), 'Leaves & twigs');
  assert.equal(stripHtml('a &quot;quoted&quot; word'), 'a "quoted" word');
  assert.equal(stripHtml('Jane&#39;s photo'), "Jane's photo");
  assert.equal(stripHtml('one&nbsp;two'), 'one two');
  assert.equal(stripHtml('  spaced\n\n out  '), 'spaced out');

  // An encoded tag decodes before the strip, so no live markup reaches the output.
  assert.equal(stripHtml('&lt;script&gt;alert(1)&lt;/script&gt;'), 'alert(1)');
  assert.equal(stripHtml('&lt;i&gt;'), '');

  // A tag encoded twice is text the page shows, so it survives as text.
  assert.equal(stripHtml('&amp;lt;i&amp;gt;'), '<i>');
});

test('commonsCandidates drops the NC file and the non-JPEG file', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
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
    assert.equal(row.source_key, 'commons');
    assert.equal(row.source, SOURCE_NAMES.commons);
    assert.equal(row.target, 'QUGA');
    assert.equal(row.source_species, SCIENTIFIC);
    assert.equal(row.fetched_at, NOW);
    assert.equal(row.fetch_error, null);
    assert.equal(row.identity_match, null);
    assert.deepEqual(row.tags_hint, []);
  }
});

test('commonsCandidates excludes a file with an empty artist', () => {
  const { files } = page1();
  const twig = fileNamed(files, 'File:Quercus gambelii twig.jpg');
  assert.equal(twig.artist, '');
  assert.equal(twig.mime, 'image/jpeg');
  assert.equal(twig.license, 'CC0');

  // The app prints the credit verbatim, so a row with no author can never publish.
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
  assert.equal(
    candidates.some((row) => row.origin === twig.description_url),
    false,
  );
});

test('the hint comes from the title and the description', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
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
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
  const habit = candidates.find(
    (row) => row.origin === 'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_habit.jpg',
  );
  assert.equal(habit?.channel_hint, null);
});

test('thumb_url is the thumbnail for a wide original and the original when it is smaller', () => {
  const { files } = page1();

  const bark = fileNamed(files, 'File:Quercus gambelii bark.jpg');
  assert.ok(bark.width > THUMB_WIDTH);
  assert.equal(
    bark.thumb_url,
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Quercus_gambelii_bark.jpg/1280px-Quercus_gambelii_bark.jpg',
  );

  const habit = fileNamed(files, 'File:Quercus gambelii habit.jpg');
  assert.ok(habit.width < THUMB_WIDTH);
  assert.equal(
    habit.thumb_url,
    'https://upload.wikimedia.org/wikipedia/commons/4/44/Quercus_gambelii_habit.jpg',
  );
  assert.equal(habit.thumb_url, habit.url);
});

test('categoryUrl builds the documented parameters and leaves gcmcontinue out', () => {
  assert.equal(
    categoryUrl(SCIENTIFIC, null),
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
      '&generator=categorymembers&gcmtitle=Category:Quercus%20gambelii' +
      `&gcmtype=file&gcmlimit=${COMMONS_PAGE_SIZE}&prop=imageinfo` +
      `&iiprop=url|extmetadata|mime|size&iiurlwidth=${THUMB_WIDTH}` +
      '&iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|LicenseUrl',
  );
});

test('categoryUrl adds the continuation token url-encoded', () => {
  const url = categoryUrl(SCIENTIFIC, 'file|QUGA.JPG|60113541');
  assert.equal(
    url,
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
      '&generator=categorymembers&gcmtitle=Category:Quercus%20gambelii' +
      `&gcmtype=file&gcmlimit=${COMMONS_PAGE_SIZE}&prop=imageinfo` +
      `&iiprop=url|extmetadata|mime|size&iiurlwidth=${THUMB_WIDTH}` +
      '&iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|LicenseUrl' +
      '&gcmcontinue=file%7CQUGA.JPG%7C60113541',
  );
});

test('the origin is the description page, not the file url', () => {
  const { files } = page1();
  const candidates = commonsCandidates(files, 'QUGA', SCIENTIFIC, NOW);
  const bark = candidates.find((row) => row.channel_hint === 'bark');
  assert.equal(
    bark?.origin,
    'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark.jpg',
  );
  assert.ok(bark?.origin.startsWith('https://commons.wikimedia.org/wiki/File:'));
  assert.notEqual(bark?.origin, bark?.file_url);
  assert.equal(bark?.author, 'Jane Doe');
  assert.equal(bark?.license, 'CC BY-SA 4.0');
  assert.equal(bark?.license_url, 'https://creativecommons.org/licenses/by-sa/4.0/');
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `node --test pipeline/tests/commons.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\commons.ts' imported from <repo>\pipeline\tests\commons.test.ts`, and `# fail 1`.

- [ ] **Step 6: Create `pipeline/lib/commons.ts`**

```ts
import { licenseAllowed, channelHint, makeCandidate } from './candidates.ts';
import type { Candidate } from './candidates.ts';
import { asRecord, asString, asNumber, asArray } from './json_fields.ts';
import { normalizeLicenseUrl } from './licenses.ts';

export const COMMONS_API: string = 'https://commons.wikimedia.org/w/api.php';

/** The page size an anonymous generator query gets. */
export const COMMONS_PAGE_SIZE: number = 50;

/** Commons rounds a thumbnail width to 960, 1280, 1920, or 3840. */
export const THUMB_WIDTH: number = 1280;

export interface CommonsFile {
  title: string;
  mime: string;
  width: number;
  height: number;
  url: string;
  thumb_url: string;
  description_url: string;
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
    `gcmlimit=${COMMONS_PAGE_SIZE}`,
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

// `&amp;` comes last in one pass, so `&amp;lt;` decodes to `&lt;` and not to `<`.
const ENTITIES: [string, string][] = [
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&nbsp;', ' '],
  ['&amp;', '&'],
];

function decodeEntities(text: string): string {
  let out = text;
  for (const [entity, char] of ENTITIES) {
    out = out.split(entity).join(char);
  }
  return out;
}

/**
 * `Artist` and `ImageDescription` come back as HTML. Decode first, then strip the tags,
 * so an encoded tag cannot pass the strip and land in the output as live markup. Decode
 * once more, so a twice-encoded entity reads as the text the Commons page shows.
 */
export function stripHtml(html: string): string {
  const stripped = decodeEntities(html).replace(/<[^>]*>/g, ' ');
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim();
}

export function parseCategoryListing(json: unknown): {
  files: CommonsFile[];
  next: string | null;
  error: string | null;
} {
  const root = asRecord(json);
  if (root === null) {
    return { files: [], next: null, error: 'the response body is not an object' };
  }
  const error = apiError(root);
  if (error !== null) return { files: [], next: null, error };

  const query = asRecord(root.query);
  const pages = query === null ? null : asRecord(query.pages);
  const files: CommonsFile[] = [];

  for (const page of Object.values(pages ?? {})) {
    const row = asRecord(page);
    if (row === null) continue;
    const list = asArray(row.imageinfo);
    if (list === null || list.length === 0) continue;
    const info = asRecord(list[0]);
    if (info === null) continue;
    const meta = asRecord(info.extmetadata) ?? {};

    const title = asString(row.title);
    const url = asString(info.url);
    const descriptionUrl = asString(info.descriptionurl);
    // The candidate id is the sha1 of `<target>|<origin>` and the origin is the
    // description page. With no description page every such row of one target would
    // carry one id.
    if (title === null || url === null || descriptionUrl === null) continue;

    const width = asNumber(info.width) ?? 0;
    const thumbUrl = asString(info.thumburl);
    // The request asks for a THUMB_WIDTH thumbnail, so a narrower original has none
    // worth taking.
    const thumb = thumbUrl !== null && width > THUMB_WIDTH ? thumbUrl : url;

    files.push({
      title,
      mime: asString(info.mime) ?? '',
      width,
      height: asNumber(info.height) ?? 0,
      url,
      thumb_url: thumb,
      description_url: descriptionUrl,
      license: metaValue(meta, 'LicenseShortName') ?? '',
      license_url: normalizeLicenseUrl(metaValue(meta, 'LicenseUrl')),
      artist: stripHtml(metaValue(meta, 'Artist') ?? ''),
      description: stripHtml(metaValue(meta, 'ImageDescription') ?? ''),
    });
  }

  // The pages object is keyed by page id, so sort the titles for a stable order.
  files.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));

  const cont = asRecord(root.continue);
  const next = cont === null ? null : asString(cont.gcmcontinue);
  return { files, next, error: null };
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
    const author = file.artist.trim();
    // The app prints the credit verbatim, so a row with no author can never publish.
    if (author === '') continue;
    const name = file.title.replace(/^File:/, '');
    rows.push(
      makeCandidate({
        target,
        source_key: 'commons',
        origin: file.description_url,
        file_url: file.thumb_url,
        author,
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

/** MediaWiki sends `error.info` as the human sentence and `error.code` as the token. */
function apiError(root: Record<string, unknown>): string | null {
  const error = asRecord(root.error);
  if (error === null) return null;
  return (
    asString(error.info) ?? asString(error.code) ?? 'the Commons API returned an error'
  );
}

function metaValue(meta: Record<string, unknown>, key: string): string | null {
  const entry = asRecord(meta[key]);
  return entry === null ? null : asString(entry.value);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test pipeline/tests/commons.test.ts`
Expected: PASS, 14 tests

Run: `node --test "pipeline/tests/**/*.test.ts"`
Expected: PASS, every test of Tasks 1 to 6, and `# fail 0`

- [ ] **Step 8: Commit**

```bash
git add pipeline/lib/commons.ts pipeline/tests/commons.test.ts pipeline/tests/fixtures/commons_category_quga.json pipeline/tests/fixtures/commons_category_quga_page2.json pipeline/tests/fixtures/commons_category_error.json && git commit -m "feat: add the Wikimedia Commons source" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: The species record build

**Files:**
- Create: `content_src/species/QUGA.json`
- Create: `pipeline/lib/species.ts`
- Test: `pipeline/tests/species.test.ts`
- Read only: `content/concepts.json`. It holds 21 rows on `main`. The test reads it and
  builds the concept key set from it.

**Interfaces:**
- Consumes:
  - `import type { PlantsProfile, ChecklistRow } from './plants.ts';` (Task 3)
  - `import { acceptedSymbols, isHybrid, isTree } from './plants.ts';` (Task 3). This is a
    value import, so `plants.ts` must be on disk. Task 3 precedes this task.
  - `import type { InatTaxon } from './inat.ts';` (Task 5). Type only, so Node erases the
    line and this task runs before `inat.ts` lands.
- Produces:
  - `interface AuthoredSpecies` — `concepts: Record<string, string>; common_extra?: string[]; audubon_name?: string; range: { text: string }; planted_states?: string[]; elevation_ft: [number, number]; height_ft: [number, number]; habitat: string; variety_notes?: Record<string, string>; ref: string[]; genus_common?: string; arrangement?: string`
  - `interface FetchedSpecies` — `scientific: string; common: string[]; family: string | null; genus: string; native_status: string | null; section: string | null; varieties: { key: string; name: string }[]; range: { states: string[] }; inat_taxon_id: number | null; inat_name: string | null`
  - `interface SpeciesRecord { [field: string]: unknown }`
  - `const REQUIRED_AUTHORED: string[]`
  - `function validateAuthored(authored: unknown, symbol: string, conceptKeys: Set<string>): string[]`
  - `function validateFetched(fetched: FetchedSpecies, symbol: string): string[]`
  - `function readAuthored(dir: string, symbol: string): AuthoredSpecies | null`
  - `function buildFetched(input: { profile: PlantsProfile; subordinate: { key: string; name: string }[]; states: string[]; section: string | null; inat: InatTaxon | null }): FetchedSpecies`
  - `function mergeSpecies(fetched: FetchedSpecies, authored: AuthoredSpecies): SpeciesRecord`
  - `function enumerateRun(input: { rows: ChecklistRow[]; genera: string[]; states: string[]; include: string[]; profiles: Record<string, PlantsProfile>; distribution: Record<string, string[]> }): { kept: string[]; dropped: { symbol: string; reason: string }[] }`

A species record has two layers. The fetched layer comes from PLANTS, FNA, and iNat. The
authored layer comes from `content_src/species/<SYMBOL>.json`. `mergeSpecies` joins them,
and the authored value wins on any field both hold. The record's field order matches the
app's `content_dev/species.json` fixture, so a build output and the fixture read the same.
One test merges the worked `QUGA.json` and compares the result with the fixture's `QUGA`
record, field for field.

Two validators guard the two layers. `validateAuthored` takes the set of `<channel>/<key>`
strings from `content/concepts.json` and names a concept bucket that set does not hold.
`validateFetched` names a profile field the merge needs and the profile did not carry.
Task 13's `cli build` calls both for every kept symbol, prints each error, and exits 1
before it writes `content/`. Without them a null `family`, an empty common name, or a
misspelled bucket reaches the app validator, after the run has already spent its network
budget.

The build writes a species when its authored file exists and `validateFetched` returns no
error. The app validator then requires a live image or a confusion edge, and the report
shows a species that failed that rule with the validator's message. So a species the run
keeps only because an edge names it is a normal outcome: the edge itself gives the learner
something to read.

The app validator also fails a confusion edge whose other endpoint is absent from
`species.json`, with `confusion.json: unknown species <symbol>`. So Task 15's
`edges-draft` skill names included species only. An edge to a species the build left out
blocks the whole build.

Task 3's `parseSubordinateTaxa` returns the variety `name` as the short label,
`var. gambelii`. `buildFetched` copies it unchanged.

`enumerateRun` imports the three rules it used to repeat. `acceptedSymbols` drops the
synonym rows and the rows outside the named genera, and returns the symbols unique and
sorted. `isTree` reads `growth_habits`. `isHybrid` reads the scientific name. A symbol with
no profile leaves `enumerateRun` in `dropped` with the reason `no profile`. Task 12's
`cli species list` prints one line, `<symbol>: no profile`, for each of those rows, and the
report lists them.

- [ ] **Step 1: Create `content_src/species/QUGA.json`**

This is the worked example, and the test reads it from disk. It is the file from section 5
of the spec, plus `genus_common`, `arrangement`, and the second variety note, so the
merged record equals the app fixture's `QUGA` record.

```json
{
  "concepts": { "leaf": "simple_lobed", "bark": "furrowed", "fruit": "acorn" },
  "common_extra": ["Rocky Mountain white oak"],
  "audubon_name": "Gambel Oak",
  "genus_common": "oak",
  "arrangement": "alternate",
  "range": { "text": "Colorado Plateau and southern Rockies" },
  "planted_states": [],
  "elevation_ft": [5000, 9000],
  "height_ft": [15, 30],
  "habitat": "Dry slopes and foothills with pinyon and juniper",
  "variety_notes": {
    "QUGAG": "The widespread form.",
    "QUGAB": "Narrower lobes, southwestern."
  },
  "ref": [
    "Virginia Tech Dendrology fact sheet, Quercus gambelii",
    "FNA vol. 3, Quercus gambelii"
  ]
}
```

- [ ] **Step 2: Write the failing test**

The test builds its `PlantsProfile`, `ChecklistRow`, and `InatTaxon` values by hand from
the field shapes section 3 documents. It reads two real files: `content_src/species/QUGA.json`
and `content/concepts.json`.

`pipeline/tests/species.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PlantsProfile, ChecklistRow } from '../lib/plants.ts';
import type { InatTaxon } from '../lib/inat.ts';
import {
  REQUIRED_AUTHORED,
  validateAuthored,
  validateFetched,
  readAuthored,
  buildFetched,
  mergeSpecies,
  enumerateRun,
} from '../lib/species.ts';
import type { AuthoredSpecies } from '../lib/species.ts';

const SPECIES_DIR = fileURLToPath(new URL('../../content_src/species', import.meta.url));
const CONTENT_DIR = fileURLToPath(new URL('../../content', import.meta.url));

/** The `<channel>/<key>` set the app validator builds from content/concepts.json. */
function conceptKeys(): Set<string> {
  const text = readFileSync(join(CONTENT_DIR, 'concepts.json'), 'utf8');
  const rows = JSON.parse(text) as { key: string; channel: string }[];
  return new Set(rows.map((row) => `${row.channel}/${row.key}`));
}

const KEYS = conceptKeys();

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

/** A copy of the QUGA record in the app's content_dev/species.json fixture. */
const FIXTURE_QUGA: Record<string, unknown> = {
  scientific: 'Quercus gambelii',
  common: ['Gambel oak', 'Rocky Mountain white oak'],
  audubon_name: 'Gambel Oak',
  inat_taxon_id: 47851,
  inat_name: null,
  genus: 'Quercus',
  genus_common: 'oak',
  section: 'Quercus',
  family: 'Fagaceae',
  arrangement: 'alternate',
  concepts: { leaf: 'simple_lobed', bark: 'furrowed', fruit: 'acorn' },
  range: {
    text: 'Colorado Plateau and southern Rockies',
    states: ['CO', 'UT', 'NM', 'AZ'],
  },
  planted_states: [],
  elevation_ft: [5000, 9000],
  height_ft: [15, 30],
  habitat: 'Dry slopes and foothills with pinyon and juniper',
  native_status: 'native',
  varieties: [
    { key: 'QUGAG', name: 'var. gambelii', note: 'The widespread form.' },
    { key: 'QUGAB', name: 'var. bakeri', note: 'Narrower lobes, southwestern.' },
  ],
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

test('mergeSpecies writes unknown when the profile carries no native status', () => {
  const fetched = buildFetched({
    profile: profile({ native_status: null }),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  const record = mergeSpecies(fetched, authored());
  assert.equal(record.native_status, 'unknown');
});

test('every required authored field, when missing, fails with a message naming the symbol and the field', () => {
  for (const field of REQUIRED_AUTHORED) {
    const short = authored() as unknown as Record<string, unknown>;
    delete short[field];
    const errors = validateAuthored(short, 'QUGA', KEYS);
    assert.equal(errors.length, 1, `${field}: ${errors.join(' | ')}`);
    assert.match(errors[0], /QUGA/);
    assert.ok(errors[0].includes(field), errors[0]);
  }
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
    const errors = validateAuthored(value, 'QUGA', KEYS);
    assert.ok(errors.length > 0, `expected an error for ${JSON.stringify(value)}`);
    assert.ok(errors.some((m) => pattern.test(m)), errors.join(' | '));
    assert.ok(errors.every((m) => m.includes('QUGA')), errors.join(' | '));
  }
});

test('an unknown top-level field fails and the message lists it', () => {
  const bad = { ...authored(), habitats: 'Dry slopes' };
  const errors = validateAuthored(bad, 'QUGA', KEYS);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /habitats/);
  assert.match(errors[0], /variety_notes/);
});

test('validateAuthored fails a concept bucket content/concepts.json does not hold', () => {
  const bad = authored({ concepts: { leaf: 'simple_lobed', bark: 'furrowd' } });
  const errors = validateAuthored(bad, 'QUGA', KEYS);
  assert.deepEqual(errors, ['QUGA: unknown concept bark/furrowd']);
  assert.equal(KEYS.has('bark/furrowed'), true);
});

test('the real content_src/species/QUGA.json passes validateAuthored against content/concepts.json', () => {
  const file = readAuthored(SPECIES_DIR, 'QUGA');
  assert.ok(file, 'QUGA.json is missing');
  assert.deepEqual(validateAuthored(file, 'QUGA', KEYS), []);
});

test('readAuthored returns null for a symbol with no file', () => {
  assert.equal(readAuthored(SPECIES_DIR, 'ZZZZ'), null);
});

test('readAuthored throws when the read fails for a reason other than a missing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dendro-authored-'));
  mkdirSync(join(dir, 'QUGA.json'));
  assert.throws(
    () => readAuthored(dir, 'QUGA'),
    (error: NodeJS.ErrnoException) => error.code !== undefined && error.code !== 'ENOENT',
  );
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

test('validateFetched names the symbol and each profile field the record needs', () => {
  const bare = buildFetched({
    profile: profile({ family: null, common: null, genus: '' }),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  assert.deepEqual(validateFetched(bare, 'QUGA'), [
    'QUGA: profile has no family',
    'QUGA: profile has no common name',
    'QUGA: profile has no genus',
  ]);

  const blank = buildFetched({
    profile: profile({ common: '   ' }),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  assert.deepEqual(validateFetched(blank, 'QUGA'), ['QUGA: profile has no common name']);

  const full = buildFetched({
    profile: profile(),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  assert.deepEqual(validateFetched(full, 'QUGA'), []);
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
  assert.deepEqual(Object.keys(record), Object.keys(FIXTURE_QUGA));
  assert.equal(record.ref, undefined);
});

test('the worked QUGA.json merges into the app fixture record, field for field', () => {
  const file = readAuthored(SPECIES_DIR, 'QUGA');
  assert.ok(file, 'QUGA.json is missing');
  const fetched = buildFetched({
    profile: profile(),
    subordinate: [
      { key: 'QUGAG', name: 'var. gambelii' },
      { key: 'QUGAB', name: 'var. bakeri' },
    ],
    states: ['CO', 'UT', 'NM', 'AZ'],
    section: 'Quercus',
    inat: { id: 47851, name: 'Quercus gambelii' },
  });
  assert.deepEqual(mergeSpecies(fetched, file), FIXTURE_QUGA);
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
import { acceptedSymbols, isHybrid, isTree } from './plants.ts';
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

/** The app prints this when PLANTS gave no native status. */
const NATIVE_STATUS_UNKNOWN = 'unknown';

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

/**
 * `conceptKeys` holds one `<channel>/<key>` string per row of content/concepts.json.
 * The caller builds it with
 * `new Set(concepts.map((row) => `${row.channel}/${row.key}`))`.
 */
export function validateAuthored(
  authored: unknown,
  symbol: string,
  conceptKeys: Set<string>,
): string[] {
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
          continue;
        }
        // The app validator fails an unknown bucket. Catch it here, before the build
        // spends a network budget on a species it cannot publish.
        if (!conceptKeys.has(`${channel}/${String(value)}`)) {
          errors.push(`${symbol}: unknown concept ${channel}/${String(value)}`);
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

/** The three fetched fields the app validator requires on a species record. */
export function validateFetched(fetched: FetchedSpecies, symbol: string): string[] {
  const errors: string[] = [];
  if (!nonEmptyString(fetched.family)) {
    errors.push(`${symbol}: profile has no family`);
  }
  if (fetched.common.length === 0) {
    errors.push(`${symbol}: profile has no common name`);
  }
  if (!nonEmptyString(fetched.genus)) {
    errors.push(`${symbol}: profile has no genus`);
  }
  return errors;
}

export function readAuthored(dir: string, symbol: string): AuthoredSpecies | null {
  const path = join(dir, `${symbol}.json`);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    // A missing file means the species is not authored yet. Any other read error is a
    // fault the run must not hide: a directory in place of the file, or no permission.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
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
  const common = profile.common === null ? '' : profile.common.trim();
  return {
    scientific: profile.scientific,
    common: common === '' ? [] : [common],
    family: profile.family,
    genus: profile.genus,
    native_status: profile.native_status,
    section,
    // Task 3 returns the short label, `var. gambelii`. It is the app's variety name.
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
  record.native_status = fetched.native_status ?? NATIVE_STATUS_UNKNOWN;
  record.varieties = varieties;
  // ref stays in content_src. It never enters the published record.
  return record;
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

  const kept: string[] = [];
  const dropped: { symbol: string; reason: string }[] = [];

  // acceptedSymbols drops the synonym rows and the other genera, and sorts.
  for (const symbol of acceptedSymbols(rows, genera)) {
    const profile = profiles[symbol];
    if (profile === undefined) {
      dropped.push({ symbol, reason: 'no profile' });
      continue;
    }
    if (!isTree(profile)) {
      dropped.push({ symbol, reason: 'not a tree' });
      continue;
    }
    if (isHybrid(profile.scientific)) {
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

  return { kept, dropped };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test pipeline/tests/species.test.ts`
Expected: PASS, 17 tests

- [ ] **Step 6: Run the Task 3 test to verify the value import broke nothing**

Run: `node --test pipeline/tests/plants.test.ts`
Expected: PASS, the summary line reads `# fail 0`

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/species.ts pipeline/tests/species.test.ts content_src/species/QUGA.json && git commit -m "feat: add the species record build" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: Candidate collection, dedupe, and the caps

**Files:**
- Modify: `pipeline/lib/candidates.ts`
- Test: `pipeline/tests/candidates_collect.test.ts`

**Interfaces:**
- Consumes, from the Task 2 half of `pipeline/lib/candidates.ts`:
  - `interface Candidate`
  - `type SourceKey`
  - `makeCandidate(fields: Partial<Candidate> & { target: string; source_key: SourceKey; origin: string; file_url: string }): Candidate`
- Produces:
  - `const MAX_PER_SPECIES: number` (60)
  - `const CHANNEL_TARGET: number` (8)
  - `function mergeFound(found: Candidate[]): Candidate[]`
  - `function underCap(existing: Candidate[], target: string): number`
  - `function channelFull(approvedByChannel: Record<string, number>, channel: string): boolean`
  - `function collect(input: { existing: Candidate[]; found: Candidate[]; target: string; approvedByChannel: Record<string, number> }): { added: Candidate[]; skipped: { id: string; reason: string }[] }`

Task 2 wrote the first half of `pipeline/lib/candidates.ts`. This task appends the second
half, and nothing above the append changes.

A run keeps at most `MAX_PER_SPECIES` candidates per target, across every source. A channel
of one target stops once that target holds `CHANNEL_TARGET` approved images on it. The cap
is per target and channel: `photos fetch` (Task 13) passes `counts[target] ?? {}`, where
`counts` comes from `countByTargetChannel` (Task 9). `collect` applies both caps and the
duplicate rule in one walk, and reports a reason for every row it drops.

`collect` is the one entry. There is no separate `dedupe` step: a caller that wants the
duplicate rule calls `collect` and reads `skipped`.

The duplicate rule is per target. Task 2's `candidateId(origin, target)` hashes the target
with the origin, so one photo judged for two targets is two rows, each with its own id.
`collect` reads the rule the same way: a row is a duplicate when an existing row holds the
same id, or holds the same target and the same origin, or holds the same target and the
same `file_hash` that is not null. One Commons photo can carry a `leaf/needles` row and a
`PIED` row at once, and both rows stand.

`mergeFound` runs before `collect`. The three iNaturalist passes of section 6 return the
same photo more than once, and each pass carries its own hints. Rows that share an `id`
become one row: the first row's fields, the union of `tags_hint` in first-seen order, and
the first `channel_hint` that is not null. `photos fetch` (Task 13) calls it on the
concatenated passes, then hands the result to `collect`.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/candidates_collect.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PER_SPECIES,
  CHANNEL_TARGET,
  makeCandidate,
  mergeFound,
  underCap,
  channelFull,
  collect,
} from '../lib/candidates.ts';
import type { Candidate } from '../lib/candidates.ts';

function row(fields: Partial<Candidate> & { origin: string }): Candidate {
  return makeCandidate({
    target: fields.target ?? 'QUGA',
    source_key: fields.source_key ?? 'inat',
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

/** A full channel table, so only the null-hint rule can let a row through. */
function allFull(): Record<string, number> {
  return {
    leaf: CHANNEL_TARGET,
    bark: CHANNEL_TARGET,
    fruit: CHANNEL_TARGET,
    flower: CHANNEL_TARGET,
    twig: CHANNEL_TARGET,
  };
}

test('collect drops a row whose origin an existing row carries for the same target', () => {
  const existing = [row({ origin: 'https://www.inaturalist.org/observations/1#photo=11' })];
  const found = [
    row({ origin: 'https://www.inaturalist.org/observations/1#photo=11' }),
    row({ origin: 'https://www.inaturalist.org/observations/2#photo=22' }),
  ];
  const result = collect({ existing, found, target: 'QUGA', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://www.inaturalist.org/observations/2#photo=22'],
  );
  assert.deepEqual(result.skipped, [{ id: found[0].id, reason: 'duplicate' }]);
});

test('collect keeps one photo for a second target, on the same origin and file_hash', () => {
  const origin = 'https://commons.wikimedia.org/wiki/File:Needles.jpg';
  const existing = [
    row({ origin, target: 'PIED', source_key: 'commons', file_hash: 'aaa' }),
  ];
  const found = [
    row({ origin, target: 'leaf/needles', source_key: 'commons', file_hash: 'aaa', channel_hint: 'leaf' }),
  ];
  const result = collect({ existing, found, target: 'leaf/needles', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.target),
    ['leaf/needles'],
  );
  assert.deepEqual(result.skipped, []);
  assert.notEqual(found[0].id, existing[0].id);
});

test('collect drops a row whose file_hash an existing row carries for the same target, whatever the source', () => {
  const existing = [
    row({
      origin: 'https://commons.wikimedia.org/wiki/File:A.jpg',
      source_key: 'commons',
      file_hash: 'aaa',
    }),
  ];
  const found = [
    row({
      origin: 'https://www.inaturalist.org/observations/9#photo=91',
      source_key: 'inat',
      file_hash: 'aaa',
    }),
    row({
      origin: 'https://www.inaturalist.org/observations/10#photo=101',
      source_key: 'inat',
      file_hash: 'bbb',
    }),
  ];
  const result = collect({ existing, found, target: 'QUGA', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.file_hash),
    ['bbb'],
  );
  assert.deepEqual(result.skipped, [{ id: found[0].id, reason: 'duplicate' }]);
});

test('collect drops the second of two found rows that share an id', () => {
  const found = [
    row({ origin: 'https://example.org/a' }),
    row({ origin: 'https://example.org/a' }),
    row({ origin: 'https://example.org/b' }),
  ];
  const result = collect({ existing: [], found, target: 'QUGA', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://example.org/a', 'https://example.org/b'],
  );
  assert.deepEqual(
    result.skipped.map((entry) => entry.reason),
    ['duplicate'],
  );
});

test('collect keeps a row whose file_hash is null when an existing row also carries null', () => {
  const existing = [row({ origin: 'https://example.org/a', file_hash: null })];
  const found = [row({ origin: 'https://example.org/b', file_hash: null })];
  const result = collect({ existing, found, target: 'QUGA', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://example.org/b'],
  );
  assert.deepEqual(result.skipped, []);
});

test('underCap returns the room left for a target', () => {
  const existing = manyRows('QUGA', MAX_PER_SPECIES - 2);
  assert.equal(underCap(existing, 'QUGA'), 2);
  assert.equal(underCap(existing, 'QUAL'), MAX_PER_SPECIES);
});

test('underCap floors at 0 when the target is over the cap', () => {
  const existing = manyRows('QUGA', MAX_PER_SPECIES + 5);
  assert.equal(underCap(existing, 'QUGA'), 0);
});

test('channelFull is true once the channel holds CHANNEL_TARGET approved images', () => {
  assert.equal(channelFull({ bark: CHANNEL_TARGET }, 'bark'), true);
  assert.equal(channelFull({ bark: CHANNEL_TARGET + 1 }, 'bark'), true);
  assert.equal(channelFull({ bark: CHANNEL_TARGET - 1 }, 'bark'), false);
  assert.equal(channelFull({}, 'leaf'), false);
});

test('collect stops at the per-species cap', () => {
  const existing = manyRows('QUGA', MAX_PER_SPECIES - 2);
  const found = [
    row({ origin: 'https://example.org/new/1' }),
    row({ origin: 'https://example.org/new/2' }),
    row({ origin: 'https://example.org/new/3' }),
    row({ origin: 'https://example.org/new/4' }),
    row({ origin: 'https://example.org/new/5' }),
  ];
  const result = collect({ existing, found, target: 'QUGA', approvedByChannel: {} });
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://example.org/new/1', 'https://example.org/new/2'],
  );
  assert.deepEqual(
    result.skipped.map((entry) => entry.reason),
    ['cap', 'cap', 'cap'],
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
    approvedByChannel: { bark: CHANNEL_TARGET, leaf: CHANNEL_TARGET - 5 },
  });
  assert.deepEqual(
    result.added.map((candidate) => candidate.origin),
    ['https://example.org/leaf/1'],
  );
  assert.deepEqual(result.skipped, [{ id: found[0].id, reason: 'channel_full' }]);
});

test('collect adds a row with a null hint even when every channel is full', () => {
  const found = [row({ origin: 'https://example.org/unknown/1', channel_hint: null })];
  const result = collect({
    existing: [],
    found,
    target: 'QUGA',
    approvedByChannel: allFull(),
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
    approvedByChannel: { bark: CHANNEL_TARGET },
  });
  assert.deepEqual(
    result.skipped.map((entry) => entry.reason),
    ['duplicate', 'channel_full'],
  );
  assert.equal(result.skipped[0].id, found[0].id);
  assert.equal(result.skipped[1].id, found[1].id);
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
  collect({ existing, found, target: 'QUGA', approvedByChannel: { bark: CHANNEL_TARGET } });
  assert.deepEqual(existing, existingBefore);
  assert.deepEqual(found, foundBefore);
});

test('mergeFound unions tags_hint in first-seen order for rows that share an id', () => {
  const origin = 'https://www.inaturalist.org/observations/7#photo=71';
  const found = [
    row({ origin, tags_hint: ['fall_color', 'winter'] }),
    row({ origin, tags_hint: ['winter', 'fruit_present'] }),
  ];
  const merged = mergeFound(found);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].tags_hint, ['fall_color', 'winter', 'fruit_present']);
});

test('mergeFound takes the first channel_hint that is not null', () => {
  const origin = 'https://www.inaturalist.org/observations/8#photo=81';
  const first = mergeFound([
    row({ origin, channel_hint: null }),
    row({ origin, channel_hint: 'fruit' }),
    row({ origin, channel_hint: 'leaf' }),
  ]);
  assert.equal(first[0].channel_hint, 'fruit');

  const already = mergeFound([
    row({ origin, channel_hint: 'leaf' }),
    row({ origin, channel_hint: 'fruit' }),
  ]);
  assert.equal(already[0].channel_hint, 'leaf');
});

test('mergeFound keeps the input order, keeps a unique row, and changes no input row', () => {
  const found = [
    row({ origin: 'https://example.org/a', tags_hint: ['winter'] }),
    row({ origin: 'https://example.org/b', tags_hint: [] }),
    row({ origin: 'https://example.org/a', tags_hint: ['fall_color'] }),
  ];
  const before = structuredClone(found);
  const merged = mergeFound(found);
  assert.deepEqual(
    merged.map((candidate) => candidate.origin),
    ['https://example.org/a', 'https://example.org/b'],
  );
  assert.deepEqual(merged[1], found[1]);
  assert.deepEqual(found, before);
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

/** 8 approved images stop collection for one channel of one target. */
export const CHANNEL_TARGET = 8;

/**
 * Rows that share an id become one row. The three iNaturalist passes return the same
 * photo more than once, and each pass carries its own hints.
 */
export function mergeFound(found: Candidate[]): Candidate[] {
  const byId = new Map<string, Candidate>();
  for (const candidate of found) {
    const first = byId.get(candidate.id);
    if (first === undefined) {
      byId.set(candidate.id, { ...candidate, tags_hint: [...candidate.tags_hint] });
      continue;
    }
    for (const tag of candidate.tags_hint) {
      if (!first.tags_hint.includes(tag)) first.tags_hint.push(tag);
    }
    if (first.channel_hint === null) first.channel_hint = candidate.channel_hint;
  }
  return [...byId.values()];
}

/** How many more rows the target may take before it reaches MAX_PER_SPECIES. */
export function underCap(existing: Candidate[], target: string): number {
  const count = existing.filter((candidate) => candidate.target === target).length;
  return Math.max(0, MAX_PER_SPECIES - count);
}

/** True once the channel holds CHANNEL_TARGET approved images for one target. */
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

/**
 * Every set is keyed by target, because one photo may serve two targets. The id already
 * hashes the target with the origin; the origin set repeats that check for a row whose id
 * arrived from a file rather than from makeCandidate.
 */
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
  seen.origins.add(`${candidate.target}|${candidate.origin}`);
  if (typeof candidate.file_hash === 'string') {
    seen.hashes.add(`${candidate.target}|${candidate.file_hash}`);
  }
}

function isDuplicate(seen: Seen, candidate: Candidate): boolean {
  if (seen.ids.has(candidate.id)) return true;
  if (seen.origins.has(`${candidate.target}|${candidate.origin}`)) return true;
  return (
    typeof candidate.file_hash === 'string'
    && seen.hashes.has(`${candidate.target}|${candidate.file_hash}`)
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test pipeline/tests/candidates_collect.test.ts`
Expected: PASS, 16 tests

- [ ] **Step 5: Run the Task 2 test to verify the append broke nothing**

Run: `node --test pipeline/tests/candidates_core.test.ts`
Expected: PASS, the summary line reads `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/candidates.ts pipeline/tests/candidates_collect.test.ts && git commit -m "feat: add candidate collection, the merge, and the caps" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: Approval, the stop rule, and owner decisions

**Files:**
- Create: `pipeline/lib/verdicts.ts`
- Test: `pipeline/tests/verdicts.test.ts`

**Interfaces:**
- Consumes: `interface Candidate` from `pipeline/lib/candidates.ts` (Task 2). The import is
  type-only, so Node's type stripping erases the line and this task runs against no other
  module.
- Produces:
  - `type VerdictKind = 'approve' | 'reject' | 'escalate'`
  - `type EscalationCase = 'mismatch' | 'license' | 'quality'`
  - `const VERDICT_KINDS: VerdictKind[]`
  - `interface Verdict { candidate_id: string; verdict: VerdictKind; channel: string | null; tags: string[]; case: EscalationCase | null; note: string; checked_by: string; checked_at: string }`
  - `type Decision = { decision: 'approve'; channel: string; tags?: string[]; note?: string } | { decision: 'reject'; channel?: string; tags?: string[]; note?: string }`
  - `const STOP_MIN_JUDGED: number` (20)
  - `const STOP_RATIO: number` (0.25)
  - `function normalizeName(name: string): string`
  - `function identityMatches(sourceSpecies: string | null, names: string[]): boolean`
  - `function pendingCandidates(candidates: Candidate[], verdicts: Verdict[]): Candidate[]`
  - `function stopRule(verdicts: Verdict[]): { fired: boolean; judged: number; escalated: number }`
  - `function decisionsToVerdicts(decisions: Record<string, Decision>, at: string): Verdict[]`
  - `function approvedVerdicts(verdicts: Verdict[]): Verdict[]`
  - `function countByTargetChannel(verdicts: Verdict[], candidates: Candidate[]): Record<string, Record<string, number>>`
  - `function validateVerdicts(verdicts: Verdict[], candidates: Candidate[], channels: string[]): string[]`

This module holds the approval bookkeeping of spec section 7. It reads and writes no files.
The `photo-check` skill and the CLI pass rows in and take rows out.

Four rules run through the module:

- The last verdict row for a candidate id wins. An owner decision arrives after the agent
  rows, so it overrides them.
- `stopRule` de-duplicates by candidate id first, then compares the ratio. The test is
  strictly greater than `STOP_RATIO`, because the spec says "more than a quarter".
- `identityMatches` returns `false` on a `null` or empty `source_species`. The script
  cannot confirm the identity, so the agent reads the source page. `photos fetch` (Task 13)
  calls it with `[profile.scientific, ...synonymNames(rows, symbol)]` and writes the answer
  to `Candidate.identity_match`. The `photo-check` skill reads that field.
- Every verdict is checked before it publishes. `validateVerdicts` names each bad row, and
  `cli build` and `cli run finish` (Task 13) print the errors and exit 1.

`normalizeName` lower-cases the name, drops a parenthesized author, drops the hybrid sign
`×`, and collapses whitespace. It keeps the genus and the first epithet. After that it
keeps only a token that is already lowercase and holds letters and hyphens alone:

- A spelled-out author is capitalized, so `Quercus gambelii Nuttall` loses `Nuttall`.
- An abbreviated author carries a period, so `Quercus gambelii Nutt.` loses `Nutt.`.
- A rank marker, and the epithet right after it, both go, because a variety name still
  names the species. `Quercus gambelii (Nuttall) var. gambelii` loses all three tokens.

All three names normalize to `quercus gambelii`, so a candidate labelled with any of them
matches a profile whose scientific name is `Quercus gambelii`.

`validateVerdicts` checks every row in the file, not only the row that wins. A bad row is a
fault in whatever wrote it, and the run must not carry it.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/verdicts.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Candidate } from '../lib/candidates.ts';
import {
  STOP_MIN_JUDGED,
  STOP_RATIO,
  VERDICT_KINDS,
  normalizeName,
  identityMatches,
  pendingCandidates,
  stopRule,
  decisionsToVerdicts,
  approvedVerdicts,
  countByTargetChannel,
  validateVerdicts,
} from '../lib/verdicts.ts';
import type { Verdict, VerdictKind, Decision } from '../lib/verdicts.ts';

const AT = '2026-09-22';
const CHANNELS = ['leaf', 'bark', 'fruit'];

/** One escalation more than the ratio allows, and the count that sits on it. */
const OVER_RATIO = Math.floor(STOP_MIN_JUDGED * STOP_RATIO) + 1;
const ON_RATIO = STOP_MIN_JUDGED * STOP_RATIO;

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

function candidate(id: string, over: Partial<Candidate> = {}): Candidate {
  return {
    id,
    target: 'QUGA',
    source_key: 'commons',
    source: 'Wikimedia Commons',
    origin: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
    file_url: `https://upload.wikimedia.org/${id}.jpg`,
    author: 'A Photographer',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    source_species: 'Quercus gambelii',
    channel_hint: 'bark',
    tags_hint: [],
    identity_match: true,
    local: null,
    file_hash: null,
    fetched_at: AT,
    fetch_error: null,
    ...over,
  };
}

function candidatesFor(rows: Verdict[]): Candidate[] {
  return rows.map((row) => candidate(row.candidate_id));
}

test('the stop rule fires when more than a quarter of the judged rows escalate', () => {
  const rows = [
    ...batch('e', 'escalate', OVER_RATIO),
    ...batch('a', 'approve', STOP_MIN_JUDGED - OVER_RATIO),
  ];
  assert.deepEqual(stopRule(rows), {
    fired: true,
    judged: STOP_MIN_JUDGED,
    escalated: OVER_RATIO,
  });
});

test('the stop rule does not fire when the escalations sit exactly on the ratio', () => {
  const rows = [
    ...batch('e', 'escalate', ON_RATIO),
    ...batch('a', 'approve', STOP_MIN_JUDGED - ON_RATIO),
  ];
  assert.deepEqual(stopRule(rows), {
    fired: false,
    judged: STOP_MIN_JUDGED,
    escalated: ON_RATIO,
  });
});

test('the stop rule does not fire below STOP_MIN_JUDGED, whatever the ratio', () => {
  const escalated = STOP_MIN_JUDGED - 10;
  const rows = [
    ...batch('e', 'escalate', escalated),
    ...batch('a', 'approve', STOP_MIN_JUDGED - escalated - 1),
  ];
  assert.deepEqual(stopRule(rows), {
    fired: false,
    judged: STOP_MIN_JUDGED - 1,
    escalated,
  });
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

test('decisionsToVerdicts throws and names the id on a decision it does not know', () => {
  const decisions = { c1: { decision: 'maybe' } } as unknown as Record<string, Decision>;
  assert.throws(
    () => decisionsToVerdicts(decisions, AT),
    /decisions\.json: c1 has an unknown decision maybe/,
  );
});

test('an owner decision overrides an earlier escalate row', () => {
  const agent = [
    ...batch('e', 'escalate', OVER_RATIO),
    ...batch('a', 'approve', STOP_MIN_JUDGED - OVER_RATIO),
  ];
  const owner = decisionsToVerdicts({ e0: { decision: 'approve', channel: 'leaf' } }, AT);
  const rows = [...agent, ...owner];

  assert.deepEqual(stopRule(rows), {
    fired: false,
    judged: STOP_MIN_JUDGED,
    escalated: OVER_RATIO - 1,
  });

  const approved = approvedVerdicts(rows);
  assert.equal(approved.length, STOP_MIN_JUDGED - OVER_RATIO + 1);
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

test('identityMatches compares normalized names and fails on no source species', () => {
  const names = ['Quercus gambelii', 'Quercus utahensis'];
  assert.equal(identityMatches('Quercus gambelii', names), true);
  assert.equal(identityMatches('quercus GAMBELII', names), true);
  assert.equal(identityMatches('Quercus utahensis Rydb.', names), true);
  assert.equal(identityMatches('Quercus rubra', names), false);
  assert.equal(identityMatches(null, names), false);
  assert.equal(identityMatches('', names), false);
});

test('Quercus gambelii Nuttall matches Quercus gambelii', () => {
  assert.equal(normalizeName('Quercus gambelii Nuttall'), 'quercus gambelii');
  assert.equal(identityMatches('Quercus gambelii Nuttall', ['Quercus gambelii']), true);
});

test('Quercus gambelii Nutt. matches Quercus gambelii', () => {
  assert.equal(normalizeName('Quercus gambelii Nutt.'), 'quercus gambelii');
  assert.equal(identityMatches('Quercus gambelii Nutt.', ['Quercus gambelii']), true);
});

test('Quercus gambelii (Nuttall) var. gambelii matches Quercus gambelii', () => {
  assert.equal(normalizeName('Quercus gambelii (Nuttall) var. gambelii'), 'quercus gambelii');
  assert.equal(
    identityMatches('Quercus gambelii (Nuttall) var. gambelii', ['Quercus gambelii']),
    true,
  );
});

test('normalizeName folds case, collapses spacing, and drops the hybrid sign', () => {
  assert.equal(normalizeName('QUERCUS GAMBELII'), 'quercus gambelii');
  assert.equal(normalizeName('Quercus  gambelii'), 'quercus gambelii');
  assert.equal(normalizeName('×Quercus gambelii'), 'quercus gambelii');
  assert.equal(normalizeName('Quercus gambelii subsp. bonina'), 'quercus gambelii');
  assert.equal(normalizeName(''), '');
});

test('countByTargetChannel counts the approved rows per target and channel', () => {
  const rows: Verdict[] = [
    verdict('c1', 'approve', { channel: 'bark' }),
    verdict('c2', 'approve', { channel: 'bark' }),
    verdict('c3', 'approve', { channel: 'leaf' }),
    verdict('c4', 'reject', { channel: 'leaf' }),
    verdict('c5', 'approve', { channel: 'leaf' }),
  ];
  const candidates = [
    candidate('c1'),
    candidate('c2'),
    candidate('c3'),
    candidate('c4'),
    candidate('c5', { target: 'QURU' }),
  ];
  assert.deepEqual(countByTargetChannel(rows, candidates), {
    QUGA: { bark: 2, leaf: 1 },
    QURU: { leaf: 1 },
  });
});

test('countByTargetChannel skips an approve with no channel and one no candidate holds', () => {
  const rows: Verdict[] = [
    verdict('c1', 'approve', { channel: null }),
    verdict('gone', 'approve', { channel: 'bark' }),
    verdict('c2', 'approve', { channel: 'bark' }),
  ];
  assert.deepEqual(countByTargetChannel(rows, [candidate('c1'), candidate('c2')]), {
    QUGA: { bark: 1 },
  });
});

test('validateVerdicts names a candidate_id no candidate holds', () => {
  const rows = [verdict('c1', 'approve'), verdict('gone', 'reject')];
  assert.deepEqual(validateVerdicts(rows, [candidate('c1')], CHANNELS), [
    'verdicts.jsonl: gone names no candidate',
  ]);
});

test('validateVerdicts names a verdict kind it does not know', () => {
  const rows = [verdict('c1', 'sortof' as unknown as VerdictKind)];
  assert.deepEqual(validateVerdicts(rows, [candidate('c1')], CHANNELS), [
    'verdicts.jsonl: c1 has an unknown verdict sortof',
  ]);
  for (const kind of VERDICT_KINDS) {
    assert.deepEqual(validateVerdicts([verdict('c1', kind)], [candidate('c1')], CHANNELS), []);
  }
});

test('validateVerdicts names an approve with no channel and an approve off the run channels', () => {
  const rows = [
    verdict('c1', 'approve', { channel: null }),
    verdict('c2', 'approve', { channel: 'twig' }),
  ];
  assert.deepEqual(validateVerdicts(rows, [candidate('c1'), candidate('c2')], CHANNELS), [
    'verdicts.jsonl: c1 is an approve with no channel',
    'verdicts.jsonl: c2 is an approve on channel twig, which this run does not cover',
  ]);
});

test('validateVerdicts names an approve whose channel is not its concept target prefix', () => {
  const rows = [
    verdict('c1', 'approve', { channel: 'bark' }),
    verdict('c2', 'approve', { channel: 'leaf' }),
  ];
  const candidates = [
    candidate('c1', { target: 'leaf/needles' }),
    candidate('c2', { target: 'leaf/needles' }),
  ];
  assert.deepEqual(validateVerdicts(rows, candidates, CHANNELS), [
    'verdicts.jsonl: c1 is an approve on channel bark but its target leaf/needles names leaf',
  ]);
});

test('validateVerdicts returns no error for a clean set of rows', () => {
  const rows = [
    verdict('c1', 'approve', { channel: 'bark' }),
    verdict('c2', 'reject'),
    verdict('c3', 'escalate'),
  ];
  assert.deepEqual(validateVerdicts(rows, candidatesFor(rows), CHANNELS), []);
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

/** The kinds a row may carry. `cli photos verdict` rejects any other --verdict value. */
export const VERDICT_KINDS: VerdictKind[] = ['approve', 'reject', 'escalate'];

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

/** An approve names its channel. A reject does not need one. */
export type Decision =
  | { decision: 'approve'; channel: string; tags?: string[]; note?: string }
  | { decision: 'reject'; channel?: string; tags?: string[]; note?: string };

export const STOP_MIN_JUDGED = 20;
export const STOP_RATIO = 0.25;

const RANK_MARKERS = new Set(['subsp.', 'subsp', 'ssp.', 'ssp', 'var.', 'var', 'f.']);
const EPITHET = /^[a-z][a-z-]*$/;

/** Letters and hyphens only, and already lowercase. An author fails both halves. */
function isEpithet(token: string): boolean {
  return EPITHET.test(token);
}

/**
 * The genus and the first epithet, lower cased. After them a token survives only when it
 * is already lowercase and holds letters and hyphens alone, so an author drops out. A rank
 * marker and the epithet after it both drop out, because a variety still names the species.
 */
export function normalizeName(name: string): string {
  const tokens = name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/×/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return '';

  const parts: string[] = [tokens[0].toLowerCase()];
  if (tokens.length > 1 && isEpithet(tokens[1].toLowerCase())) {
    parts.push(tokens[1].toLowerCase());
  }
  for (let i = 2; i < tokens.length; i += 1) {
    if (RANK_MARKERS.has(tokens[i].toLowerCase())) {
      i += 1;
      continue;
    }
    if (!isEpithet(tokens[i])) break;
    parts.push(tokens[i]);
  }
  return parts.join(' ');
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
  const rows: Verdict[] = [];
  for (const [candidateId, decision] of Object.entries(decisions)) {
    // decisions.json is owner-written, so the value on disk may be anything.
    const kind = (decision as { decision: string }).decision;
    if (kind !== 'approve' && kind !== 'reject') {
      throw new Error(`decisions.json: ${candidateId} has an unknown decision ${kind}`);
    }
    rows.push({
      candidate_id: candidateId,
      verdict: kind,
      channel: decision.channel ?? null,
      tags: decision.tags ?? [],
      case: null,
      note: decision.note ?? '',
      checked_by: 'owner',
      checked_at: at,
    });
  }
  return rows;
}

export function approvedVerdicts(verdicts: Verdict[]): Verdict[] {
  return [...lastByCandidate(verdicts).values()].filter((row) => row.verdict === 'approve');
}

/** Approved images per target, then per channel. The caps read one target's row. */
export function countByTargetChannel(
  verdicts: Verdict[],
  candidates: Candidate[],
): Record<string, Record<string, number>> {
  const targetOf = new Map(candidates.map((candidate) => [candidate.id, candidate.target]));
  const counts: Record<string, Record<string, number>> = {};
  for (const row of approvedVerdicts(verdicts)) {
    if (row.channel === null) continue;
    const target = targetOf.get(row.candidate_id);
    if (target === undefined) continue;
    const byChannel = counts[target] ?? {};
    byChannel[row.channel] = (byChannel[row.channel] ?? 0) + 1;
    counts[target] = byChannel;
  }
  return counts;
}

/** One message per bad row. `cli build` and `cli run finish` print them and exit 1. */
export function validateVerdicts(
  verdicts: Verdict[],
  candidates: Candidate[],
  channels: string[],
): string[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const errors: string[] = [];

  for (const row of verdicts) {
    const candidate = byId.get(row.candidate_id);
    if (candidate === undefined) {
      errors.push(`verdicts.jsonl: ${row.candidate_id} names no candidate`);
      continue;
    }
    if (!VERDICT_KINDS.includes(row.verdict)) {
      errors.push(`verdicts.jsonl: ${row.candidate_id} has an unknown verdict ${String(row.verdict)}`);
      continue;
    }
    if (row.verdict !== 'approve') continue;
    if (row.channel === null || row.channel.trim() === '') {
      errors.push(`verdicts.jsonl: ${row.candidate_id} is an approve with no channel`);
      continue;
    }
    if (!channels.includes(row.channel)) {
      errors.push(
        `verdicts.jsonl: ${row.candidate_id} is an approve on channel ${row.channel}, which this run does not cover`,
      );
      continue;
    }
    const slash = candidate.target.indexOf('/');
    if (slash === -1) continue;
    const prefix = candidate.target.slice(0, slash);
    if (row.channel !== prefix) {
      errors.push(
        `verdicts.jsonl: ${row.candidate_id} is an approve on channel ${row.channel} but its target ${candidate.target} names ${prefix}`,
      );
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test pipeline/tests/verdicts.test.ts`
Expected: PASS, 19 tests

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/verdicts.ts pipeline/tests/verdicts.test.ts && git commit -m "feat: add the verdict rules, the stop rule, and the verdict check" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: Images, object storage, and manifest rows

**Files:**
- Create: `pipeline/lib/images.ts`
- Create: `pipeline/lib/storage.ts`
- Create: `pipeline/lib/manifest.ts`
- Test: `pipeline/tests/manifest.test.ts`

**Interfaces:**
- Consumes:
  - `interface Candidate` (type-only) and `SOURCE_NAMES: Record<SourceKey, string>` from `pipeline/lib/candidates.ts` (Task 2). The test uses `SOURCE_NAMES`; `manifest.ts` uses the type.
  - `interface Verdict` (type-only) and `approvedVerdicts(verdicts: Verdict[]): Verdict[]` from `pipeline/lib/verdicts.ts` (Task 9). `approvedVerdicts` keeps the last verdict row per candidate id and returns the rows whose verdict is `approve`.
- Produces:
  - `images.ts`: `MAX_SIDE: number` (1200), `JPEG_QUALITY: number` (82), `type Resize = (bytes: Uint8Array, maxSide: number, quality: number) => Promise<Uint8Array>`, `sha256Hex(bytes: Uint8Array): string`, `objectKey(hash: string): string`, `reviewKey(candidateId: string): string`.
  - `storage.ts`: `interface Storage { head(key: string): Promise<boolean>; put(key: string, bytes: Uint8Array, contentType: string): Promise<void>; remove(key: string): Promise<void> }`, `memoryStorage(): Storage & { objects: Map<string, Uint8Array>; puts: { key: string; contentType: string }[] }`.
  - `manifest.ts`: `interface ManifestRow`, `interface PublishDeps`, `publishApproved(input: { deps: PublishDeps; candidates: Candidate[]; verdicts: Verdict[]; rows: ManifestRow[] }): Promise<{ rows: ManifestRow[]; uploaded: string[]; skipped: string[] }>`, `retireRows(rows: ManifestRow[], hash: string, reason: string, at: string): { rows: ManifestRow[]; retired: number }`.

`manifest.ts` imports `Candidate` as a type and `approvedVerdicts` as a value. Task 2 owns the type and Task 9 owns the function.

Section 7 of the spec sets the behaviour. `publishApproved` takes the whole verdict list and applies `approvedVerdicts` itself, so the "last row wins" rule has one home. It resizes each approved candidate, hashes the resized bytes, and uploads the object under `img/<hash>.jpg`. The hash is the whole key, so two candidates with the same bytes share one object. A manifest row is unique on `hash` plus `target` plus `channel`, so the same bytes used for two targets give two rows. The row field order is the app's manifest order: `hash`, `target`, `channel`, `source`, `author`, `license`, `origin`, `tags`, `checked_by`, `checked_at`, `note`.

`publishApproved` guards the row before it uploads:
- An approved verdict whose candidate is absent throws and names the candidate id.
- A candidate with no cached file throws.
- An empty `author`, `source`, or `license` throws `candidate <id> has an empty <field>`. The app prints all three verbatim as the photo credit, so an empty one renders the word `undefined` on a public page. `plantsCandidates`, `inatCandidates`, and `commonsCandidates` already drop an empty author, and `cli photos add` already requires the three flags; this is the last guard. `SOURCE_NAMES.manual` is the empty string, so a manual candidate publishes only with the `--source` the collector typed.
- An approved verdict with a null channel throws `candidate <id> has no channel`. Task 9's `validateVerdicts` runs in `cli build` and `cli run finish` before this module, so a null channel never reaches here from the CLI. The guard holds for a direct caller.

`retireRows` is pure. It marks every row that carries the hash with `retired: true`, the reason, and the date, and returns a new array with the count. It touches no storage. A row already retired takes the new reason and date, and the count covers every row that carries the hash. An unknown hash returns `retired: 0` and the rows unchanged; `cli images retire` (Task 14) then exits 1 with `no manifest row carries hash <hash>`. Task 14 removes the object from storage only after the validator and the append-only check pass.

The test uses a fake resizer and `memoryStorage()` in place of the bucket. The fake answers with the JPEG marker bytes `0xFF 0xD8` followed by the sha256 of its input, so the published hash is a real 64-hex digest and the key matches the app's `img/<64 hex>.jpg` rule. No test needs `sharp` or an S3 client. The real resizer also strips EXIF; this task's test checks only the arguments the resizer received, and Task 16's live test resizes a real JPEG and asserts the output carries no EXIF.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/manifest.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import type { Candidate } from '../lib/candidates.ts';
import { SOURCE_NAMES } from '../lib/candidates.ts';
import type { Verdict } from '../lib/verdicts.ts';
import { JPEG_QUALITY, MAX_SIDE, objectKey, reviewKey } from '../lib/images.ts';
import type { Resize } from '../lib/images.ts';
import { memoryStorage } from '../lib/storage.ts';
import { publishApproved, retireRows } from '../lib/manifest.ts';
import type { ManifestRow } from '../lib/manifest.ts';

const ROW_FIELDS = [
  'hash', 'target', 'channel', 'source', 'author',
  'license', 'origin', 'tags',
  'checked_by', 'checked_at', 'note',
];

const CREDIT_FIELDS: ('author' | 'source' | 'license')[] = ['author', 'source', 'license'];

const CACHE_1 = 'pipeline/cache/commons/c1.jpg';
const CACHE_2 = 'pipeline/cache/commons/c2.jpg';

// A candidate id is the sha1 of the target and the origin, so two rows on one
// target need two origins. Two Commons files hold the same bytes often enough.
const ORIGIN_1 = 'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark.jpg';
const ORIGIN_2 = 'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_bark_2.jpg';

// A JPEG starts with these two bytes. The fake resizer writes them, so the
// bytes it returns look like the file the real resizer returns.
const JPEG_MARKER = new Uint8Array([0xff, 0xd8]);

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// The marker plus the sha256 of the input. The output is 66 bytes, so the hash
// of it is a real 64 hex digest of bytes that differ per input.
function fakeResize(bytes: Uint8Array): Uint8Array {
  const digest = encode(createHash('sha256').update(bytes).digest('hex'));
  const out = new Uint8Array(JPEG_MARKER.length + digest.length);
  out.set(JPEG_MARKER, 0);
  out.set(digest, JPEG_MARKER.length);
  return out;
}

function resizedHash(text: string): string {
  return createHash('sha256').update(fakeResize(encode(text))).digest('hex');
}

function cand(over: Partial<Candidate>): Candidate {
  return {
    id: 'c1',
    target: 'QUGA',
    source_key: 'commons',
    source: SOURCE_NAMES.commons,
    origin: ORIGIN_1,
    file_url: 'https://upload.wikimedia.org/quercus_gambelii_bark.jpg',
    author: 'A Photographer',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    source_species: 'Quercus gambelii',
    identity_match: true,
    channel_hint: 'bark',
    tags_hint: [],
    local: CACHE_1,
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
    return fakeResize(bytes);
  };
  const readLocal = (file: string): Uint8Array => {
    const text = files[file];
    if (text === undefined) throw new Error(`no cached file at ${file}`);
    return encode(text);
  };
  return { storage, resizeCalls, deps: { storage, resize, readLocal } };
}

test('the key is img/<sha256 of the resized bytes>.jpg and the put names image/jpeg', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const hash = resizedHash('alpha');
  assert.deepEqual(result.uploaded, [`img/${hash}.jpg`]);
  assert.deepEqual(h.storage.puts, [{ key: `img/${hash}.jpg`, contentType: 'image/jpeg' }]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].hash, hash);
  assert.match(result.rows[0].hash, /^[0-9a-f]{64}$/);
  assert.match(result.uploaded[0], /^img\/[0-9a-f]{64}\.jpg$/);
  assert.equal(objectKey(hash), `img/${hash}.jpg`);
});

test('a second run over the same verdicts uploads nothing and adds no row', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
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
  const h = harness({ [CACHE_1]: 'alpha', [CACHE_2]: 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [
      cand({}),
      cand({ id: 'c2', target: 'PIPO', local: CACHE_2 }),
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
  const h = harness({ [CACHE_1]: 'alpha', [CACHE_2]: 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({}), cand({ id: 'c2', origin: ORIGIN_2, local: CACHE_2 })],
    verdicts: [verd({}), verd({ candidate_id: 'c2' })],
    rows: [],
  });
  assert.equal(h.storage.objects.size, 1);
  assert.equal(h.storage.puts.length, 1);
  assert.equal(result.rows.length, 1);
});

test('the row shape matches the app manifest, with the source display name', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
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
  assert.equal(row.source, SOURCE_NAMES.commons);
  assert.equal(row.source, 'Wikimedia Commons');
  assert.equal(row.author, 'A Photographer');
  assert.equal(row.license, 'CC BY 4.0');
  assert.equal(row.origin, ORIGIN_1);
  assert.deepEqual(row.tags, ['winter']);
  assert.equal(row.checked_by, 'photo_check_agent');
  assert.equal(row.checked_at, '2026-09-22');
  assert.equal(row.note, 'Bark fills the frame.');
});

test('a rejected candidate and an escalated candidate upload nothing and get no row', async () => {
  const h = harness({ [CACHE_1]: 'alpha', [CACHE_2]: 'beta' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({}), cand({ id: 'c2', origin: ORIGIN_2, local: CACHE_2 })],
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

test('an approve followed by a reject for one candidate uploads nothing', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  const result = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [
      verd({}),
      verd({ verdict: 'reject', channel: null, tags: [], note: 'The owner said no.' }),
    ],
    rows: [],
  });
  assert.deepEqual(h.storage.puts, []);
  assert.deepEqual(result.uploaded, []);
  assert.deepEqual(result.rows, []);
});

test('the resizer receives the cached bytes, MAX_SIDE, and JPEG_QUALITY', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  assert.deepEqual(h.resizeCalls, [{ text: 'alpha', maxSide: MAX_SIDE, quality: JPEG_QUALITY }]);
});

test('a verdict whose candidate is missing throws and names the candidate id', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
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

test('an empty author, source, or license throws and uploads nothing', async () => {
  for (const field of CREDIT_FIELDS) {
    const h = harness({ [CACHE_1]: 'alpha' });
    const over: Partial<Candidate> = { [field]: '   ' };
    await assert.rejects(
      () => publishApproved({
        deps: h.deps,
        candidates: [cand(over)],
        verdicts: [verd({})],
        rows: [],
      }),
      new Error(`candidate c1 has an empty ${field}`),
    );
    assert.deepEqual(h.storage.puts, []);
  }
});

test('an approved verdict with a null channel throws and uploads nothing', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  await assert.rejects(
    () => publishApproved({
      deps: h.deps,
      candidates: [cand({})],
      verdicts: [verd({ channel: null })],
      rows: [],
    }),
    new Error('candidate c1 has no channel'),
  );
  assert.deepEqual(h.storage.puts, []);
});

test('retireRows marks the row, keeps the object, and leaves the input alone', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  const published = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const hash = published.rows[0].hash;
  const result = retireRows(
    published.rows,
    hash,
    'takedown request from the photographer',
    '2026-09-23',
  );
  assert.equal(result.retired, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].hash, hash);
  assert.equal(result.rows[0].retired, true);
  assert.equal(result.rows[0].retired_reason, 'takedown request from the photographer');
  assert.equal(result.rows[0].retired_at, '2026-09-23');
  assert.equal(published.rows[0].retired, undefined);
  assert.equal(h.storage.objects.has(objectKey(hash)), true);
});

test('two rows that share a hash both retire in one call', async () => {
  const h = harness({ [CACHE_1]: 'alpha', [CACHE_2]: 'alpha' });
  const published = await publishApproved({
    deps: h.deps,
    candidates: [cand({}), cand({ id: 'c2', target: 'PIPO', local: CACHE_2 })],
    verdicts: [verd({}), verd({ candidate_id: 'c2' })],
    rows: [],
  });
  const result = retireRows(published.rows, published.rows[0].hash, 'takedown', '2026-09-23');
  assert.equal(result.retired, 2);
  assert.deepEqual(result.rows.map((r) => r.retired), [true, true]);
});

test('retireRows on a hash no row carries returns 0 and changes no row', async () => {
  const h = harness({ [CACHE_1]: 'alpha' });
  const published = await publishApproved({
    deps: h.deps,
    candidates: [cand({})],
    verdicts: [verd({})],
    rows: [],
  });
  const absent = '0'.repeat(64);
  const result = retireRows(published.rows, absent, 'takedown', '2026-09-23');
  assert.equal(result.retired, 0);
  assert.deepEqual(result.rows, published.rows);
  assert.equal(h.storage.objects.has(objectKey(published.rows[0].hash)), true);
});

test('reviewKey builds the review prefix', () => {
  assert.equal(reviewKey('abc'), 'review/abc.jpg');
});

test('memoryStorage head follows put and remove, and puts records the content type', async () => {
  const storage = memoryStorage();
  assert.equal(await storage.head('img/x.jpg'), false);
  await storage.put('img/x.jpg', encode('x'), 'image/jpeg');
  assert.equal(await storage.head('img/x.jpg'), true);
  assert.deepEqual(storage.puts, [{ key: 'img/x.jpg', contentType: 'image/jpeg' }]);
  await storage.remove('img/x.jpg');
  assert.equal(await storage.head('img/x.jpg'), false);
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

// Task 16 builds the real Resize on sharp. A test passes a fake, so no test needs sharp.
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

// The fake records the key and the content type of every put, so a test reads
// what the bucket would have been told.
export function memoryStorage(): Storage & {
  objects: Map<string, Uint8Array>;
  puts: { key: string; contentType: string }[];
} {
  const objects = new Map<string, Uint8Array>();
  const puts: { key: string; contentType: string }[] = [];

  return {
    objects,
    puts,
    async head(key: string): Promise<boolean> {
      return objects.has(key);
    },
    async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
      objects.set(key, bytes);
      puts.push({ key, contentType });
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
import { approvedVerdicts } from './verdicts.ts';
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
  // The caller owns the path. Task 14 builds this from deps.root.
  readLocal: (path: string) => Uint8Array;
}

// The app prints these three as the photo credit, so an empty one reaches a page.
const CREDIT_FIELDS: ('author' | 'source' | 'license')[] = ['author', 'source', 'license'];

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

  // approvedVerdicts applies the last-row-wins rule, so an approve the owner
  // later rejected never reaches the bucket.
  for (const verdict of approvedVerdicts(input.verdicts)) {
    const candidate = byId.get(verdict.candidate_id);
    if (candidate === undefined) {
      throw new Error(`no candidate for approved verdict ${verdict.candidate_id}`);
    }
    if (candidate.local === null) {
      throw new Error(`candidate ${candidate.id} has no cached file`);
    }
    for (const field of CREDIT_FIELDS) {
      if (candidate[field].trim() === '') {
        throw new Error(`candidate ${candidate.id} has an empty ${field}`);
      }
    }
    // validateVerdicts (Task 9) rejects this before the CLI gets here. The
    // guard holds for a direct caller.
    if (verdict.channel === null) {
      throw new Error(`candidate ${candidate.id} has no channel`);
    }
    const channel = verdict.channel;

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

    const present = rows.some(
      (row) => row.hash === hash && row.target === candidate.target && row.channel === channel,
    );
    if (present) continue;

    // Field order is the app manifest's order. A person reads the JSON diff.
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

// Pure. The caller removes the object after the validator and the append-only
// check pass.
export function retireRows(
  rows: ManifestRow[],
  hash: string,
  reason: string,
  at: string,
): { rows: ManifestRow[]; retired: number } {
  let retired = 0;
  const next = rows.map((row) => {
    if (row.hash !== hash) return row;
    retired += 1;
    return { ...row, retired: true, retired_reason: reason, retired_at: at };
  });
  return { rows: next, retired };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `node --test pipeline/tests/manifest.test.ts`
Expected: PASS, 16 tests

- [ ] **Step 8: Commit**

```bash
git add pipeline/lib/images.ts pipeline/lib/storage.ts pipeline/lib/manifest.ts pipeline/tests/manifest.test.ts && git commit -m "feat: add image publishing, object storage, and manifest rows" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 11: The append-only ID check

**Files:**
- Create: `pipeline/lib/ids.ts`
- Test: `pipeline/tests/ids.test.ts`

**Interfaces:**
- Consumes: nothing. `ContentSet` declares its own structural types, so this task imports no other pipeline module. A `ManifestRow` from Task 10 satisfies the `manifest` element type.
- Produces:
  - `interface ContentSet { species: Record<string, Record<string, unknown>>; concepts: { key: string; channel: string }[]; units: { key: string }[]; manifest: { hash: string; target: string; channel: string; retired?: boolean }[] }`
  - `function collectIds(content: ContentSet): string[]` returns a sorted, de-duplicated array of prefixed ids
  - `function appendOnlyErrors(previous: ContentSet | null, next: ContentSet): string[]` returns one message per lost id
  - `function readPublished(gitShow: (path: string) => string | null): ContentSet | null` returns the last published content, or `null` on the first run

Section 4 of the spec makes every id append-only. A card id such as `species:QUGA:bark` sits in a stranger's review log for months, so an id that leaves the content orphans that history. Section 11 gives the check: read the last published content with `git show main:content/species.json` and the three other files, collect every id, and fail the build when one of them is gone. A record with `retired: true` counts as present. The check is skipped on the first run, when `main` holds no content.

The five id forms:

| Form | Source |
|---|---|
| `species:<symbol>` | a key of `species.json` |
| `variety:<key>` | a `varieties[].key` inside a species record |
| `concept:<channel>/<key>` | a row of `concepts.json` |
| `unit:<key>` | a row of `units.json` |
| `image:<hash>\|<target>\|<channel>` | a row of `images/manifest.json` |

A concept id carries the channel because the app keys a concept on `<channel>/<key>`: `bark/plated` and `leaf/plated` are two concepts. An image id carries the target and the channel because the app treats `hash`, `target`, and `channel` as the row identity, and one hash serves several targets. Two rows that share a hash are two cards, so dropping one of them orphans a card id.

The spec's append-only list names bucket keys. A bucket key is an authored field on a unit, not a separate file. A bucket key reaches the check through the unit record that names it, so `unit:<key>` covers it.

An error message names the id and the content file it came from, so the reader knows which file to open. `readPublished` keeps the JSON parser's own message in its error, so a broken published file says where the text stops making sense.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/ids.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectIds, appendOnlyErrors, readPublished } from '../lib/ids.ts';
import type { ContentSet } from '../lib/ids.ts';

// The keys are the real content's: flat unit keys, channel-qualified concepts,
// and a concept target on a manifest row.
function sample(): ContentSet {
  return {
    species: {
      QUGA: {
        scientific: 'Quercus gambelii',
        varieties: [{ key: 'QUGAG', name: 'Quercus gambelii var. gambelii' }],
      },
      ACGL: { scientific: 'Acer glabrum' },
    },
    concepts: [
      { key: 'plated', channel: 'bark' },
      { key: 'simple_lobed', channel: 'leaf' },
    ],
    units: [{ key: 'leaf_types' }, { key: 'simple_lobed_white_oaks_co' }],
    manifest: [
      { hash: 'aaa1', target: 'QUGA', channel: 'leaf' },
      { hash: 'bbb2', target: 'bark/plated', channel: 'bark' },
    ],
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
    'concept:bark/plated',
    'concept:leaf/simple_lobed',
    'image:aaa1|QUGA|leaf',
    'image:bbb2|bark/plated|bark',
    'species:ACGL',
    'species:QUGA',
    'unit:leaf_types',
    'unit:simple_lobed_white_oaks_co',
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
  assert.equal(ids.includes('image:aaa1|QUGA|leaf'), true);
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

test('appendOnlyErrors gives one message per missing variety, concept, unit, and image', () => {
  const previous = sample();
  const next = sample();
  next.species.QUGA.varieties = [];
  next.concepts = [{ key: 'plated', channel: 'bark' }];
  next.units = [{ key: 'leaf_types' }];
  next.manifest = [{ hash: 'aaa1', target: 'QUGA', channel: 'leaf' }];
  const errors = appendOnlyErrors(previous, next);
  assert.deepEqual(errors, [
    'concept:leaf/simple_lobed is in the published concepts.json and is gone from the new content',
    'image:bbb2|bark/plated|bark is in the published images/manifest.json and is gone from the new content',
    'unit:simple_lobed_white_oaks_co is in the published units.json and is gone from the new content',
    'variety:QUGAG is in the published species.json and is gone from the new content',
  ]);
  assert.equal(errors.length, 4);
});

test('one hash on two targets: dropping one row is an error that names that target', () => {
  const previous = sample();
  previous.manifest = [
    { hash: 'aaa1', target: 'QUGA', channel: 'leaf' },
    { hash: 'aaa1', target: 'QUGAG', channel: 'leaf' },
  ];
  const next = sample();
  next.manifest = [{ hash: 'aaa1', target: 'QUGA', channel: 'leaf' }];
  assert.deepEqual(appendOnlyErrors(previous, next), [
    'image:aaa1|QUGAG|leaf is in the published images/manifest.json and is gone from the new content',
  ]);
});

test('a concept key that moves to another channel is an error', () => {
  const previous = sample();
  const next = sample();
  next.concepts = [
    { key: 'plated', channel: 'twig' },
    { key: 'simple_lobed', channel: 'leaf' },
  ];
  assert.deepEqual(appendOnlyErrors(previous, next), [
    'concept:bark/plated is in the published concepts.json and is gone from the new content',
  ]);
});

test('adding a species, a unit, or an image is never an error', () => {
  const previous = sample();
  const next = sample();
  next.species.PIPO = { scientific: 'Pinus ponderosa' };
  next.units.push({ key: 'needle_types' });
  next.manifest.push({ hash: 'ccc3', target: 'PIPO', channel: 'leaf' });
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
    'content/concepts.json': JSON.stringify([{ key: 'plated', channel: 'bark' }]),
    'content/units.json': JSON.stringify([{ key: 'bark_types' }]),
    'content/images/manifest.json': JSON.stringify([
      { hash: 'aaa1', target: 'QUGA', channel: 'leaf', retired: true },
    ]),
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
    'concept:bark/plated',
    'image:aaa1|QUGA|leaf',
    'species:QUGA',
    'unit:bark_types',
    'variety:QUGAG',
  ]);
});

test('readPublished keeps the JSON parser message in its error', () => {
  const broken = 'not json at all';
  let parserMessage = '';
  try {
    JSON.parse(broken);
  } catch (error) {
    parserMessage = (error as Error).message;
  }
  assert.notEqual(parserMessage, '');

  const { gitShow } = gitShowFrom({
    'content/species.json': JSON.stringify({ QUGA: {} }),
    'content/concepts.json': broken,
    'content/units.json': JSON.stringify([]),
    'content/images/manifest.json': JSON.stringify([]),
  });
  assert.throws(
    () => readPublished(gitShow),
    { message: `content/concepts.json does not hold valid JSON: ${parserMessage}` },
  );
});

test('readPublished names the file and the field when a row lacks one', () => {
  const { gitShow } = gitShowFrom({
    'content/species.json': JSON.stringify({ QUGA: {} }),
    'content/concepts.json': JSON.stringify([{ key: 'plated' }]),
    'content/units.json': JSON.stringify([]),
    'content/images/manifest.json': JSON.stringify([]),
  });
  assert.throws(
    () => readPublished(gitShow),
    { message: 'content/concepts.json holds a row with no channel' },
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
  concepts: { key: string; channel: string }[];
  units: { key: string }[];
  manifest: { hash: string; target: string; channel: string; retired?: boolean }[];
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
  // A concept is <channel>/<key> in the app, and a card is hash, target, and
  // channel. The ids carry the same parts.
  for (const concept of content.concepts) {
    ids.add(`concept:${concept.channel}/${concept.key}`);
  }
  for (const unit of content.units) ids.add(`unit:${unit.key}`);
  for (const row of content.manifest) {
    ids.add(`image:${row.hash}|${row.target}|${row.channel}`);
  }

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
    concepts: readKeyedRows(CONCEPTS_PATH, conceptsText, ['key', 'channel']) as {
      key: string;
      channel: string;
    }[],
    units: readKeyedRows(UNITS_PATH, unitsText, ['key']) as { key: string }[],
    manifest: readKeyedRows(MANIFEST_PATH, manifestText, ['hash', 'target', 'channel']) as {
      hash: string;
      target: string;
      channel: string;
      retired?: boolean;
    }[],
  };
}

function parseFile(path: string, text: string | null): unknown {
  if (text === null) throw new Error(`${path} is missing from the published content`);
  try {
    return JSON.parse(text);
  } catch (error) {
    // The parser says where the text stops making sense. Keep it.
    throw new Error(`${path} does not hold valid JSON: ${(error as Error).message}`);
  }
}

function readRecordMap(path: string, text: string | null): Record<string, Record<string, unknown>> {
  const parsed = parseFile(path, text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} does not hold a JSON object of records`);
  }
  return parsed as Record<string, Record<string, unknown>>;
}

function readKeyedRows(path: string, text: string | null, fields: string[]): unknown[] {
  const parsed = parseFile(path, text);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path} does not hold a JSON array of rows`);
  }
  for (const row of parsed) {
    if (row === null || typeof row !== 'object') {
      throw new Error(`${path} holds a row that is not an object`);
    }
    for (const field of fields) {
      if (typeof (row as Record<string, unknown>)[field] !== 'string') {
        throw new Error(`${path} holds a row with no ${field}`);
      }
    }
  }
  return parsed;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test pipeline/tests/ids.test.ts`
Expected: PASS, 13 tests

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
  - `interface ReportUnitRow { key: string; cards: number; warning: string | null }`
  - `interface ReportEscalationRow { candidate_id: string; image_url: string; origin: string; case: string; note: string; target: string }`
  - `interface ReportData { run: string; channels: string[]; species: ReportSpeciesRow[]; gaps: ReportGapRow[]; units: ReportUnitRow[]; escalations: ReportEscalationRow[]; counts: { candidates_by_source: Record<string, number>; verdicts_by_kind: Record<string, number>; fetch_failures: number; stop_rule_fired: boolean } }`
  - `const GAP_THRESHOLD: number` (4)
  - `function buildGaps(species: ReportSpeciesRow[], channels: string[]): ReportGapRow[]`
  - `function renderReport(data: ReportData): string`

`renderReport` is pure. It takes one `ReportData` and returns the whole of `report.md`. It reads no clock, no disk, and no network. `cli build` (Task 14) gathers the data; this module only formats it.

The document starts with `# Content run: <name>`. Five `## ` parts follow, in the order section 9 gives them: Species, Channel gaps, Units, Escalations, Run counts. Every part is a table.

Four rules the section leaves to this task:
- A cell escapes a pipe as `\|`, and a run of line breaks becomes one space. A note with either one never breaks a row.
- The Source cell links to the origin URL and uses the escalation's `target` as its text.
- A run-counts label is snake_case: `candidates_<source_key>`, `verdicts_<kind>`, then `fetch_failures` and `stop_rule_fired`. Source keys and kind keys are sorted, so the order is stable. `fetch_failures` comes from `run.json`, which Task 13 writes.
- The Units table has three columns: Unit, Cards, Warning. `cards` is the length of `loadContent(raw).content.unit_cards[key]` and `warning` is the app validator's `units.json` warning that names the unit, or `null`. This module never judges a card count. The 5-to-25 band lives in `app/logic/content.js` only.

> The fixture holds the `ReportData` shape the contract documents, with five species, three
> channels, six gap rows, three units, and two escalations. It is hand-built, not recorded.
> The unit keys are the real content's flat keys. The `gaps` array is what `buildGaps`
> returns for the fixture's species and channels, and a test proves it.
> `report_expected.md` is the renderer's own output. One test compares it byte for byte, and
> four more check the structure the five headings and the four tables must hold.

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
  type ReportEscalationRow,
  type ReportSpeciesRow,
} from '../lib/report.ts';

const runFixture = new URL('./fixtures/report_run.json', import.meta.url);
const expectedFixture = new URL('./fixtures/report_expected.md', import.meta.url);

function fixtureData(): ReportData {
  return JSON.parse(fs.readFileSync(runFixture, 'utf8')) as ReportData;
}

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

function escalation(over: Partial<ReportEscalationRow> = {}): ReportEscalationRow {
  return {
    candidate_id: 'a1b2c3',
    image_url: 'https://images.dendro.test/review/a1b2c3.jpg',
    origin: 'https://www.inaturalist.org/observations/123456',
    case: 'mismatch',
    note: 'Leaf reads Quercus rubra, not Quercus alba.',
    target: 'QUAL',
    ...over,
  };
}

// The table lines of one section, header and divider included.
function sectionLines(text: string, heading: string): string[] {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  assert.notEqual(start, -1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = end === -1 ? rest : rest.slice(0, end);
  return body.filter((line) => line.startsWith('|'));
}

function bodyRows(text: string, heading: string): string[] {
  return sectionLines(text, heading).slice(2);
}

test('the fixture run renders the stored report, byte for byte', () => {
  const expected = fs.readFileSync(expectedFixture, 'utf8');
  assert.equal(renderReport(fixtureData()), expected);
});

test('the fixture gaps are what buildGaps returns for its species and channels', () => {
  const data = fixtureData();
  assert.deepEqual(buildGaps(data.species, data.channels), data.gaps);
});

test('the report holds the five headings in the order section 9 gives', () => {
  const headings = renderReport(fixtureData())
    .split('\n')
    .filter((line) => line.startsWith('## '));
  assert.deepEqual(headings, [
    '## Species',
    '## Channel gaps',
    '## Units',
    '## Escalations',
    '## Run counts',
  ]);
});

test('each table holds one row per species, gap, unit, and escalation', () => {
  const data = fixtureData();
  const text = renderReport(data);
  assert.equal(bodyRows(text, 'Species').length, data.species.length);
  assert.equal(bodyRows(text, 'Channel gaps').length, data.gaps.length);
  assert.equal(bodyRows(text, 'Units').length, data.units.length);
  assert.equal(bodyRows(text, 'Escalations').length, data.escalations.length);
});

test('the run counts list the sources and the kinds sorted, then the two totals', () => {
  const labels = bodyRows(renderReport(fixtureData()), 'Run counts').map(
    (line) => line.slice(2).split(' | ')[0],
  );
  assert.deepEqual(labels, [
    'candidates_commons',
    'candidates_inat',
    'candidates_manual',
    'candidates_plants',
    'verdicts_approve',
    'verdicts_escalate',
    'verdicts_reject',
    'fetch_failures',
    'stop_rule_fired',
  ]);
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
      escalations: [escalation({ note: 'Leaf reads Quercus rubra | not Quercus alba.' })],
    }),
  );

  const line = text.split('\n').find((l) => l.includes('Leaf reads')) as string;
  assert.ok(line.includes('rubra \\| not'));
  // Four cells give five unescaped pipes, so the split yields six pieces.
  assert.equal(line.split(/(?<!\\)\|/).length, 6);
});

test('a line break in a note becomes one space and the row stays on one line', () => {
  const text = renderReport(
    makeData({
      escalations: [escalation({ note: 'Leaf reads Quercus rubra.\r\nThe cup is wrong too.' })],
    }),
  );

  const rows = bodyRows(text, 'Escalations');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].includes('Quercus rubra. The cup is wrong too.'));
});

test('a unit warning fills the Warning cell and a null warning leaves it empty', () => {
  const text = renderReport(
    makeData({
      units: [
        {
          key: 'leaf_types',
          cards: 27,
          warning: 'leaf_types holds 27 cards, outside the range 5 to 25',
        },
        { key: 'bark_types', cards: 12, warning: null },
      ],
    }),
  );

  assert.ok(text.includes('| Unit | Cards | Warning |'));
  assert.ok(
    text.includes('| leaf_types | 27 | leaf_types holds 27 cards, outside the range 5 to 25 |'),
  );
  assert.ok(text.includes('| bark_types | 12 |  |'));
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

test('the fetch failure count from the run reaches the table', () => {
  const data = makeData({
    counts: {
      candidates_by_source: {},
      verdicts_by_kind: {},
      fetch_failures: 3,
      stop_rule_fired: false,
    },
  });

  assert.ok(renderReport(data).includes('| fetch_failures | 3 |'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/report.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\report.ts' imported from <repo>\pipeline\tests\report.test.ts`

- [ ] **Step 3: Create `pipeline/tests/fixtures/report_run.json`**

Five species cover the four statuses. `QUMA2`, `QURU`, and `QUST` leave a channel out of `counts`, so the renderer and `buildGaps` both meet a missing channel. The unit keys are the real content's: `bark_types`, `leaf_types`, and `simple_lobed_white_oaks_co`. The `leaf_types` warning is the app validator's own text. The escalation image URLs are `cdn_base` plus `reviewKey`, with the test CDN base `https://images.dendro.test/`. The `gaps` array is `buildGaps(species, channels)`, which test 2 checks.

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
    { "key": "bark_types", "cards": 12, "warning": null },
    {
      "key": "leaf_types",
      "cards": 27,
      "warning": "leaf_types holds 27 cards, outside the range 5 to 25"
    },
    { "key": "simple_lobed_white_oaks_co", "cards": 5, "warning": null }
  ],
  "escalations": [
    {
      "candidate_id": "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      "image_url": "https://images.dendro.test/review/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678.jpg",
      "origin": "https://www.inaturalist.org/observations/123456",
      "case": "mismatch",
      "note": "Leaf reads Quercus rubra | not Quercus alba.",
      "target": "QUAL"
    },
    {
      "candidate_id": "90abcdef1234567890abcdef1234567890abcdef",
      "image_url": "https://images.dendro.test/review/90abcdef1234567890abcdef1234567890abcdef.jpg",
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
  // The app validator's units.json warning for this key, or null.
  warning: string | null;
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

// A pipe inside a cell ends the cell, and a line break ends the row. A note
// carries either one, so both are neutralized here.
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
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
      ['Unit', 'Cards', 'Warning'],
      data.units.map((unit) => [unit.key, String(unit.cards), unit.warning ?? '']),
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
file ends with one newline, and an empty cell gives `|  |`.

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

| Unit | Cards | Warning |
| --- | --- | --- |
| bark_types | 12 |  |
| leaf_types | 27 | leaf_types holds 27 cards, outside the range 5 to 25 |
| simple_lobed_white_oaks_co | 5 |  |

## Escalations

| Image | Source | Case | Note |
| --- | --- | --- | --- |
| ![](https://images.dendro.test/review/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678.jpg) | [QUAL](https://www.inaturalist.org/observations/123456) | mismatch | Leaf reads Quercus rubra \| not Quercus alba. |
| ![](https://images.dendro.test/review/90abcdef1234567890abcdef1234567890abcdef.jpg) | [QUVE](https://commons.wikimedia.org/wiki/File:Quercus_velutina_bark.jpg) | license | The file page names CC BY-NC. |

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
Expected: PASS, 13 tests

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/report.ts pipeline/tests/report.test.ts pipeline/tests/fixtures/report_run.json pipeline/tests/fixtures/report_expected.md && git commit -m "feat: render the run report" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 13: The run scope, the CLI commands, and the fetch commands

**Files:**
- Create: `pipeline/lib/run.ts`
- Create: `pipeline/lib/commands.ts`
- Create: `pipeline/tests/fixtures/plants_profile_quun.json`
- Create: `pipeline/tests/fixtures/inat_phenology_probe.json`
- Test: `pipeline/tests/run.test.ts`
- Test: `pipeline/tests/cli_fetch.test.ts`

**Interfaces:**
- Consumes:
  - `pipeline/lib/candidates.ts` (Task 2): `CHANNELS`, `SOURCE_NAMES`, `licenseAllowed(text)`, `makeCandidate(fields)`, type `Candidate`. `makeCandidate` computes the id as `candidateId(origin, target)`, the sha1 hex of `` `${target}|${origin}` ``, so an id is per target.
  - `pipeline/lib/candidates.ts` (Task 8): `CHANNEL_TARGET`, `collect({ existing, found, target, approvedByChannel })`, `mergeFound(found)`.
  - `pipeline/lib/jsonl.ts` (Task 2): `readJsonl<T>(filePath)`, `appendJsonl(filePath, rows)`.
  - `pipeline/lib/json_fields.ts` (Task 5): `asArray(value)`, `asNumber(value)`, `asRecord(value)`, `asString(value)`. Each returns `null` when the value is the wrong shape.
  - `pipeline/lib/plants.ts` (Task 3): `CHECKLIST_URL`, `profileUrl(symbol)`, `imagesUrl(plantsId)`, `parseChecklist(body)`, `acceptedSymbols(rows, genera)`, `synonymNames(rows, symbol)`, `fetchProfile(http, symbol, now)`, `fetchDistribution(http, plantsId)`, `fetchImages(http, plantsId, now)`, `plantsCandidates(images, target, scientific, now)`, type `PlantsProfile`.
  - `pipeline/lib/commons.ts` (Task 6): `categoryUrl(category, token)`, `parseCategoryListing(json)` returning `{ files, next, error }`, `commonsCandidates(files, target, scientific, now)`.
  - `pipeline/lib/inat.ts` (Task 5): `PER_PAGE`, `PHENOLOGY_TERM_ID`, `FRUITING_VALUE_ID`, `inatPasses(floweringValueId)`, `taxaUrl(scientific)`, `observationsUrl(taxonId, page, pass)`, `phenologyProbeUrl(perPage)`, `parseTaxon(json)`, `parseObservations(json)` returning `{ photos, error }`, `inatCandidates(photos, target, pass, now)`, `loadInatTerms(path)`, type `InatPass`.
  - `pipeline/lib/fna.ts` (Task 4): `SECTION_PAGES`, `buildSectionTable(pages)`, `nextPageUrl(html, pageUrl)`.
  - `pipeline/lib/species.ts` (Task 7): `enumerateRun({ rows, genera, states, include, profiles, distribution })`.
  - `pipeline/lib/verdicts.ts` (Task 9): `VERDICT_KINDS`, `approvedVerdicts(verdicts)`, `identityMatches(sourceSpecies, names)`, type `Verdict`, type `VerdictKind`, type `EscalationCase`.
  - `pipeline/lib/verdicts.ts` (Task 9, D6 and D8): `countByTargetChannel(verdicts, candidates)`, `validateVerdicts(verdicts, candidates, channels)`.
  - `pipeline/lib/images.ts` (Task 10): `sha256Hex(bytes)`, type `Resize`.
  - `pipeline/lib/storage.ts` (Task 10): type `Storage`, and `memoryStorage()` in the test.
  - `pipeline/lib/manifest.ts` (Task 10): type `ManifestRow`.
  - `pipeline/lib/http.ts` (Task 1): type `Http`, type `TextResult`, type `BytesResult`, type `HttpFailure`.
  - `app/logic/content.js` (on `main` today): `validateContent(raw)`. The test passes it as `deps.validate`.
- Produces:
  - `pipeline/lib/run.ts`: `interface RunScope { name: string; bucket: string | null; concepts: string[]; concept_exemplars: Record<string, string[]>; states: string[]; genera: string[]; include: string[]; channels: string[]; created_at: string; species: string[]; dropped: { symbol: string; reason: string }[]; fetch_failures: number; capped: string[] }`, `type Exec = (command: string, args: string[]) => { code: number; out: string }`, `BOOLEAN_FLAGS: string[]`, `errorMessage(error: unknown): string`, `csvList(value: string | undefined): string[]`, `parseFlags(argv: string[]): Record<string, string>`, `newScope(name: string, flags: Record<string, string>, createdAt: string): RunScope`, `runDir(root: string, name: string): string`, `validateScope(raw: unknown): string[]`, `readRun(root: string, name: string): RunScope`, `writeRun(root: string, scope: RunScope): void`, `readConceptKeys(file: string): string[]`, `gitCheckoutBranch(exec: Exec, name: string): void`, `gitCheckoutExisting(exec: Exec, name: string): void`, `gitCommitAll(exec: Exec, message: string): void`, `openPullRequest(exec: Exec, name: string, bodyPath: string): void`.
  - `pipeline/lib/commands.ts`: `interface CliDeps { root: string; exec: Exec; http: Http; storage: Storage; resize: Resize; validate: (raw: RawContent) => ValidationResult; cdn_base: string; now: () => Date }`, `interface ValidationMessage { file: string; message: string }`, `interface ValidationResult { errors: ValidationMessage[]; warnings: ValidationMessage[] }`, `interface RawContent { species: Record<string, Record<string, unknown>>; concepts: { key: string; channel: string; name: string; accept: string[]; description: string }[]; units: Record<string, unknown>[]; confusion: { a: string; b: string; channel: string; a_not_b: string; b_not_a: string; ref: string }[]; manifest: ManifestRow[] }`, `CHECK_AGENT: string`, `NO_PROFILE: string`, `MAX_COMMONS_PAGES: number`, `MAX_INAT_PAGES: number`, `runCommand(argv: string[], deps: CliDeps): Promise<number>`.

`commands.ts` holds the command handlers and nothing else. It has no `main` guard, no
dynamic import, and no `process.argv`. Task 16 creates `pipeline/cli.ts`, the entry that
builds `CliDeps` from the real world: `nodeExec`, `createHttp({ cacheDir, fetchImpl: fetch,
refresh })`, a lazy `sharpResize`, a lazy `s3Storage`, `validate: validateContent`, and
`cdn_base: CDN_BASE`. Both come from `app/logic/content.js`. Splitting the file this way
keeps Task 13 free of `sharp` and the S3 client, and keeps every test import static.

`deps.validate` is the app's own `validateContent` from the first commit. There is no stub
validator. Task 13 never calls `deps.validate`, because `build` belongs to Task 14; the
field is in `CliDeps` so Task 14 adds no dependency to the interface.

Three changes to the contract in the spec, each small:

- `newScope` takes `createdAt` as a third parameter, so it stays pure and the caller owns
  the clock.
- `RunScope` gains `concept_exemplars`, a map from a concept key to the exemplar species a
  concept run looks photos up by. Section 8 of the spec says a concept run's `run.json`
  lists them, and `photos fetch` reads them.
- `RunScope` gains `fetch_failures` and `capped`. A run that gave up on a url, or that hit a
  listing page cap, says so in `run.json`, so the report and the reader see it (D16, and the
  Commons cap below).

A concept run's targets are qualified keys, `<channel>/<key>`, exactly as
`content/concepts.json` writes them (D5). `newScope` rejects a value with no `/`, and
`run init` reads `content/concepts.json` and exits 1 naming an unknown key. A concept run's
channels are the distinct prefixes, so `--channels` is not a flag of a concept run, and
giving it is an error.

`run init` branches `content/<name>` off `main`, because `main` is the branch a content run
opens its pull request against. Task 18 merges `pipeline` into `main` through a pull
request, so the first real run finds the pipeline on `main`.

The dispatch table names every command of the surface. The seven that Task 14 owns
(`build`, `report`, `run pr`, `run finish`, `images retire`, `species retire`, `ids check`)
print `not implemented yet: <command>` and return 1, so the usage text is complete from the
first commit.

A candidate id carries its target: `candidateId(origin, target)` is the sha1 hex of
`` `${target}|${origin}` ``, and `makeCandidate` computes it (Task 2). So each source builds
its rows with the run's target from the start, and `photos fetch` never rewrites a target
afterwards. A concept run points two targets at one exemplar, and one photo then gives two
rows with two ids, which the dedupe in `collect` keeps apart. The three iNat passes share
one target, so a photo seen in two passes gives one id, and `mergeFound` folds the passes
into one row (D7).

`data sections` follows `nextPageUrl` until it returns `null`, and stops early on a url it
already read, so a page that links itself cannot loop. Task 4's Lobatae and Quercus
fixtures both carry a "Next page" anchor, so the walk is five requests over the three
sections, not three.

Every count in `cli_fetch.test.ts` comes from the fixtures Tasks 3, 4, 5, and 6 record, and
the test derives each one by running the same pure function the command runs. A fixture that
gains or loses a row moves the expectation with it, so no edit in those tasks can leave this
file asserting a stale number. The counts today: 3 PLANTS candidates out of 5 images, 5
Commons candidates out of 8 files over two pages, and 4 iNat photos, which is 12 candidates
per target.

- [ ] **Step 1: Write the failing test for the run scope**

`pipeline/tests/run.test.ts`:

```ts
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

const CREATED_AT = '2026-09-22T15:04:00Z';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

test('newScope takes a concept run's channels from the prefixes and refuses --channels', () => {
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

test('readRun keeps the JSON parser's message', (t) => {
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test pipeline/tests/run.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\pipeline\lib\run.ts' imported from ...\pipeline\tests\run.test.ts`

- [ ] **Step 3: Create `pipeline/lib/run.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';

import { CHANNELS } from './candidates.ts';
import { asArray, asNumber, asRecord, asString } from './json_fields.ts';

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
  /** How many urls this run gave up on. The report prints it. */
  fetch_failures: number;
  /** One message per listing this run cut short at a page cap. */
  capped: string[];
}

export type Exec = (command: string, args: string[]) => { code: number; out: string };

const CO_AUTHOR = 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>';

/** The only flag that takes no value. Every other flag needs one. */
export const BOOLEAN_FLAGS: string[] = ['refresh'];

const LIST_FIELDS: string[] = [
  'concepts',
  'states',
  'genera',
  'include',
  'channels',
  'species',
  'capped',
];

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Splits a comma-separated flag value, trims each part, and drops the empty parts. */
export function csvList(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * `--key value` gives `{ key: 'value' }`. A key keeps its hyphens, so `--file-url` is the
 * key `file-url`. A flag outside `BOOLEAN_FLAGS` with no value is an error: a bare
 * `--author` used to become the string `true` and reached the manifest as a credit.
 * A value that itself starts with `--` is unreachable, and no flag of this CLI takes one.
 */
export function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === '') throw new Error('-- is not a flag name.');
    if (BOOLEAN_FLAGS.includes(key)) {
      flags[key] = 'true';
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`the flag --${key} needs a value.`);
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

  const concepts = csvList(flags.concepts);
  let channels: string[];
  if (hasConcepts) {
    if (concepts.length === 0) throw new Error('--concepts needs at least one concept key.');
    if (flags.channels !== undefined) {
      throw new Error('a concept run takes its channels from --concepts. Drop --channels.');
    }
    for (const key of concepts) {
      if (!key.includes('/')) {
        throw new Error(
          `the concept ${key} needs the form <channel>/<key>, as content/concepts.json writes it.`,
        );
      }
    }
    channels = [...new Set(concepts.map((key) => key.split('/')[0]))];
  } else {
    channels = csvList(flags.channels);
    if (channels.length === 0) {
      throw new Error('run init needs --channels with at least one channel.');
    }
  }
  for (const channel of channels) {
    if (!CHANNELS.includes(channel)) {
      throw new Error(`${channel} is not a channel. The channels are ${CHANNELS.join(', ')}.`);
    }
  }

  return {
    name,
    bucket: flags.bucket ?? null,
    concepts,
    concept_exemplars: {},
    states: csvList(flags.states),
    genera: csvList(flags.genera),
    include: csvList(flags.include),
    channels,
    created_at: createdAt,
    species: [],
    dropped: [],
    fetch_failures: 0,
    capped: [],
  };
}

export function runDir(root: string, name: string): string {
  return path.join(root, 'pipeline', 'runs', name);
}

/** One message per field that is not the shape `RunScope` declares. */
export function validateScope(raw: unknown): string[] {
  const scope = asRecord(raw);
  if (scope === null) return ['run.json does not hold an object.'];

  const errors: string[] = [];
  if (asString(scope.name) === null) errors.push('name is not a string.');
  if (scope.bucket !== null && asString(scope.bucket) === null) {
    errors.push('bucket is not a string and not null.');
  }
  if (asString(scope.created_at) === null) errors.push('created_at is not a string.');
  if (asNumber(scope.fetch_failures) === null) errors.push('fetch_failures is not a number.');
  for (const field of LIST_FIELDS) {
    if (!isStringList(scope[field])) errors.push(`${field} is not an array of strings.`);
  }

  const exemplars = asRecord(scope.concept_exemplars);
  if (exemplars === null) {
    errors.push('concept_exemplars is not an object.');
  } else {
    for (const [key, value] of Object.entries(exemplars)) {
      if (!isStringList(value)) {
        errors.push(`concept_exemplars.${key} is not an array of strings.`);
      }
    }
  }

  const dropped = asArray(scope.dropped);
  if (dropped === null) {
    errors.push('dropped is not an array.');
  } else {
    for (const item of dropped) {
      const row = asRecord(item);
      if (row === null || asString(row.symbol) === null || asString(row.reason) === null) {
        errors.push('a dropped row needs a symbol and a reason.');
      }
    }
  }
  return errors;
}

export function readRun(root: string, name: string): RunScope {
  const file = path.join(runDir(root, name), 'run.json');
  if (!fs.existsSync(file)) {
    throw new Error(`run ${name} does not exist. Run "cli run init ${name}" first.`);
  }
  const raw = readJsonFile(file);
  const errors = validateScope(raw);
  if (errors.length > 0) {
    throw new Error(`${file} is not a run scope: ${errors.join(' ')}`);
  }
  return raw as RunScope;
}

export function writeRun(root: string, scope: RunScope): void {
  const dir = runDir(root, scope.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run.json'), `${JSON.stringify(scope, null, 2)}\n`, 'utf8');
}

/** Every concept of the content set, as the qualified key `<channel>/<key>`, sorted. */
export function readConceptKeys(file: string): string[] {
  const rows = asArray(readJsonFile(file));
  if (rows === null) throw new Error(`${file} does not hold an array.`);
  const keys: string[] = [];
  for (const item of rows) {
    const row = asRecord(item);
    const key = row === null ? null : asString(row.key);
    const channel = row === null ? null : asString(row.channel);
    if (key === null || channel === null) {
      throw new Error(`${file} holds a concept with no key or no channel.`);
    }
    keys.push(`${channel}/${key}`);
  }
  return keys.sort();
}

export function gitCheckoutBranch(exec: Exec, name: string): void {
  mustRun(exec, 'git', ['checkout', '-b', `content/${name}`, 'main']);
}

/** A resumed run already has its branch, so this checks it out instead of creating it. */
export function gitCheckoutExisting(exec: Exec, name: string): void {
  mustRun(exec, 'git', ['checkout', `content/${name}`]);
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

function isStringList(value: unknown): boolean {
  const list = asArray(value);
  if (list === null) return false;
  return list.every((item) => asString(item) !== null);
}

function readJsonFile(file: string): unknown {
  const text = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`cannot parse ${file}: ${errorMessage(error)}`);
  }
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test pipeline/tests/run.test.ts`
Expected: PASS, 22 tests

- [ ] **Step 5: Create the hybrid profile fixture**

The fixture holds the fields section 3 documents, trimmed to the rows the test reads.
`species list` keeps `QUGA` and drops this one, because the name carries the hybrid sign.
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

- [ ] **Step 6: Create the phenology probe fixture**

`data inat-terms` reads the phenology annotations of a page of observations. The fixture
holds four observations: two carry the flowering value, one carries the fruiting value, one
carries another attribute, and one carries no annotation. The probe reads
`results[].annotations` and nothing else. Task 19 confirms the value against the live
endpoint.

`pipeline/tests/fixtures/inat_phenology_probe.json`:

```json
{
  "total_results": 4,
  "page": 1,
  "per_page": 30,
  "results": [
    {
      "id": 111,
      "annotations": [
        { "controlled_attribute_id": 12, "controlled_value_id": 13 },
        { "controlled_attribute_id": 9, "controlled_value_id": 11 }
      ]
    },
    {
      "id": 112,
      "annotations": [{ "controlled_attribute_id": 12, "controlled_value_id": 14 }]
    },
    {
      "id": 113,
      "annotations": [{ "controlled_attribute_id": 12, "controlled_value_id": 13 }]
    },
    { "id": 114, "annotations": [] }
  ]
}
```

- [ ] **Step 7: Write the failing test for the commands**

The test builds `CliDeps` with the app's own `validateContent` and a test CDN base. It never
writes a candidate count as a literal: `expectedRows(target)` runs `plantsCandidates`,
`commonsCandidates`, and `inatCandidates` over the recorded fixtures, and each test compares
the rows on disk with that list. The byte routes come from the same list, so an excluded
image is never routed and never downloaded.

`pipeline/tests/cli_fetch.test.ts`:

```ts
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateContent } from '../../app/logic/content.js';
import {
  CHANNEL_TARGET,
  SOURCE_NAMES,
  makeCandidate,
  type Candidate,
} from '../lib/candidates.ts';
import {
  CHECK_AGENT,
  MAX_COMMONS_PAGES,
  NO_PROFILE,
  runCommand,
  type CliDeps,
} from '../lib/commands.ts';
import { categoryUrl, commonsCandidates, parseCategoryListing } from '../lib/commons.ts';
import { SECTION_PAGES, nextPageUrl, parseSectionPage } from '../lib/fna.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
import {
  FRUITING_VALUE_ID,
  PER_PAGE,
  PHENOLOGY_TERM_ID,
  inatCandidates,
  inatPasses,
  observationsUrl,
  parseObservations,
  phenologyProbeUrl,
  taxaUrl,
  type InatPass,
} from '../lib/inat.ts';
import { appendJsonl, readJsonl } from '../lib/jsonl.ts';
import {
  CHECKLIST_URL,
  DISTRIBUTION_URL,
  imagesUrl,
  parseImages,
  plantsCandidates,
  profileUrl,
} from '../lib/plants.ts';
import { newScope, readRun, runDir, writeRun, type Exec, type RunScope } from '../lib/run.ts';
import { memoryStorage } from '../lib/storage.ts';
import type { Verdict } from '../lib/verdicts.ts';

const NOW = '2026-09-22T15:04:00Z';
const CDN_BASE = 'https://images.dendro.test/';
const SCIENTIFIC = 'Quercus gambelii';
const QUGA_ID = 25297;
const QUUN_ID = 25298;
const INAT_TAXON_ID = 47851;
const FLOWERING_VALUE_ID = 13;
const EMPTY_OBSERVATIONS = '{ "total_results": 0, "page": 1, "results": [] }';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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
 * A hand-written Http over a route map. It skips the cache and the limiter, which the http
 * tests already cover. A POST keys on the url and the body together, because every
 * distribution call goes to one url. A url in `throwOn` throws, which stands for a dropped
 * connection.
 */
function fakeHttp(routes: Map<string, Route>, throwOn: Set<string> = new Set()): Http & {
  urls: string[];
} {
  const urls: string[] = [];
  const failures: HttpFailure[] = [];

  function fail(url: string, status: number, message: string): void {
    failures.push({ url, status, message, at: NOW });
  }

  function text(key: string, url: string): TextResult {
    const route = routes.get(key);
    if (route === undefined) {
      fail(url, 0, 'the fake has no route for this url');
      return { ok: false, status: 0, body: '', fromCache: false, error: 'no route' };
    }
    const status = route.status ?? 200;
    if (status >= 400 || route.body === undefined) {
      fail(url, status, `status ${status}`);
      return { ok: false, status, body: '', fromCache: false, error: `status ${status}` };
    }
    return { ok: true, status, body: route.body, fromCache: false, error: null };
  }

  function guard(url: string): void {
    if (throwOn.has(url)) throw new Error(`${url}: the fake connection dropped`);
  }

  return {
    failures,
    urls,
    async getText(url: string): Promise<TextResult> {
      urls.push(url);
      guard(url);
      return text(url, url);
    },
    async postJson(url: string, body: unknown): Promise<TextResult> {
      const key = `${url} ${JSON.stringify(body)}`;
      urls.push(key);
      guard(url);
      return text(key, url);
    },
    async getBytes(url: string): Promise<BytesResult> {
      urls.push(url);
      guard(url);
      const route = routes.get(url);
      const status = route?.status ?? (route === undefined ? 0 : 200);
      if (route === undefined || route.bytes === undefined || status >= 400) {
        fail(url, status, `status ${status}`);
        return { ok: false, status, bytes: null, fromCache: false, error: `status ${status}` };
      }
      return { ok: true, status, bytes: route.bytes, fromCache: false, error: null };
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

/** The photo sources for QUGA, plus the checklist that `synonymNames` reads. */
function photoRoutes(): Map<string, Route> {
  const routes = new Map<string, Route>();
  routes.set(CHECKLIST_URL, { body: fixture('plantlst_sample.txt') });
  routes.set(profileUrl('QUGA'), { body: fixture('plants_profile_quga.json') });
  routes.set(imagesUrl(QUGA_ID), { body: fixture('plants_images_quga.json') });

  const page1 = fixture('commons_category_quga.json');
  routes.set(categoryUrl(SCIENTIFIC, null), { body: page1 });
  routes.set(categoryUrl(SCIENTIFIC, commonsToken()), {
    body: fixture('commons_category_quga_page2.json'),
  });

  routes.set(taxaUrl(SCIENTIFIC), { body: fixture('inat_taxa_quga.json') });
  // The fruiting pass comes back empty, so every iNat photo arrives from the plain pass and
  // the flowering pass. The merge then has two rows per photo to fold into one.
  for (const pass of inatPasses(FLOWERING_VALUE_ID)) {
    const body =
      pass.term_value_id === FRUITING_VALUE_ID
        ? EMPTY_OBSERVATIONS
        : fixture('inat_observations_quga.json');
    routes.set(observationsUrl(INAT_TAXON_ID, 1, pass), { body });
  }

  for (const [index, url] of fileUrls('QUGA').entries()) routes.set(url, { bytes: jpeg(index) });
  return routes;
}

function commonsToken(): string {
  const listing = parseCategoryListing(JSON.parse(fixture('commons_category_quga.json')));
  const token = listing.next;
  assert.ok(token !== null, 'the page 1 fixture carries a continuation token');
  return token;
}

function floweringPass(): InatPass {
  const pass = inatPasses(FLOWERING_VALUE_ID).find(
    (row) => row.term_value_id === FLOWERING_VALUE_ID,
  );
  assert.ok(pass !== undefined, 'one pass filters on the flowering value');
  return pass;
}

/** The rows `plantsCandidates` builds from the recorded images. The fixture holds more
 *  images than that: one is copyright and one names no photographer. */
function plantsRowsOf(target: string): Candidate[] {
  const images = parseImages(JSON.parse(fixture('plants_images_quga.json')));
  return plantsCandidates(images, target, SCIENTIFIC, NOW);
}

/** The rows the two recorded Commons pages give. Page 1 holds a file with no artist and a
 *  file that is not a JPEG, and neither becomes a row. */
function commonsRowsOf(target: string): Candidate[] {
  const rows: Candidate[] = [];
  for (const name of ['commons_category_quga.json', 'commons_category_quga_page2.json']) {
    const listing = parseCategoryListing(JSON.parse(fixture(name)));
    assert.equal(listing.error, null, `${name} parses`);
    rows.push(...commonsCandidates(listing.files, target, SCIENTIFIC, NOW));
  }
  return rows;
}

/** The rows one observation pass gives. The flowering pass carries the hints the merge
 *  keeps, so the expectation uses it. */
function inatRowsOf(target: string): Candidate[] {
  const parsed = parseObservations(JSON.parse(fixture('inat_observations_quga.json')));
  assert.equal(parsed.error, null, 'the observations fixture parses');
  return inatCandidates(parsed.photos, target, floweringPass(), NOW);
}

/** Every candidate a `photos fetch` of QUGA should write under `target`. */
function expectedRows(target: string): Candidate[] {
  return [...plantsRowsOf(target), ...commonsRowsOf(target), ...inatRowsOf(target)];
}

function fileUrls(target: string): string[] {
  return [...new Set(expectedRows(target).map((row) => row.file_url))];
}

function originsOf(rows: Candidate[]): string[] {
  return rows.map((row) => row.origin).sort();
}

/**
 * A section page with no taxa and no next link. The Quercus fixture links a page 2 that
 * Task 4 does not record, so the walk needs somewhere to end.
 */
const EMPTY_SECTION_PAGE = [
  '<html><body>',
  '<table id="ucFloraTaxonList_dgTaxonList">',
  '<tr><td><a href="browse.aspx?flora_id=1&amp;start_taxon_id=302027">Previous page</a></td></tr>',
  '</table>',
  '</body></html>',
].join('\n');

/** The first page of each section, and the page its next anchor points at. */
const SECTION_WALK: { first: string; second: string | null }[] = [
  { first: 'fna_lobatae.html', second: 'fna_lobatae_page2.html' },
  { first: 'fna_quercus.html', second: null },
  { first: 'fna_protobalanus.html', second: null },
];

/** The routes and the urls `data sections` reads, in order, following every next anchor. */
function sectionWalk(): { routes: Map<string, Route>; urls: string[] } {
  const routes = new Map<string, Route>();
  const urls: string[] = [];
  SECTION_WALK.forEach((page, index) => {
    const url = SECTION_PAGES[index].url;
    const body = fixture(page.first);
    routes.set(url, { body });
    urls.push(url);
    const next = nextPageUrl(body, url);
    if (next === null) return;
    routes.set(next, {
      body: page.second === null ? EMPTY_SECTION_PAGE : fixture(page.second),
    });
    urls.push(next);
  });
  return { routes, urls };
}

/** Every name the walked pages name, which is the table `data sections` writes. */
function sectionNames(): Set<string> {
  const names = new Set<string>();
  for (const page of SECTION_WALK) {
    for (const name of parseSectionPage(fixture(page.first))) names.add(name);
    if (page.second === null) continue;
    for (const name of parseSectionPage(fixture(page.second))) names.add(name);
  }
  return names;
}

function termRoutes(body: string): Map<string, Route> {
  const routes = new Map<string, Route>();
  routes.set(phenologyProbeUrl(PER_PAGE), { body });
  return routes;
}

function setup(t: TestContext, routes: Map<string, Route> = new Map(), throwOn?: Set<string>) {
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
  const http = fakeHttp(routes, throwOn);
  const deps: CliDeps = {
    root,
    exec,
    http,
    storage: memoryStorage(),
    resize: async (bytes) => bytes,
    validate: validateContent,
    cdn_base: CDN_BASE,
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

function seedPlantsIds(root: string, table: Record<string, { id: number; scientific: string }>): void {
  const file = path.join(root, 'pipeline', 'data', 'plants_ids.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(table, null, 2)}\n`, 'utf8');
}

/** The real concepts file, so a concept run runs against the keys the app ships. */
function seedConcepts(root: string): void {
  const file = path.join(root, 'content', 'concepts.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'content', 'concepts.json'), file);
}

/** One hand-written candidate on the run's queue. The manual source marks it as seeded. */
function seedCandidate(root: string, target: string, index: number): Candidate {
  const row = makeCandidate({
    target,
    source_key: 'manual',
    source: 'a field notebook',
    origin: `https://example.org/seed/${index}`,
    file_url: `https://example.org/seed/${index}.jpg`,
    author: 'A Seeder',
    license: 'public domain',
    channel_hint: 'leaf',
    fetched_at: NOW,
  });
  appendJsonl(path.join(runDir(root, 'demo'), 'candidates.jsonl'), [row]);
  return row;
}

/** Fills one target's leaf channel to the cap, with a candidate row per approved verdict. */
function seedApprovedLeaf(root: string, target: string): void {
  const verdicts: Verdict[] = [];
  for (let index = 0; index < CHANNEL_TARGET; index += 1) {
    const row = seedCandidate(root, target, index);
    verdicts.push({
      candidate_id: row.id,
      verdict: 'approve',
      channel: 'leaf',
      tags: [],
      case: null,
      note: 'seeded',
      checked_by: 'owner',
      checked_at: NOW,
    });
  }
  appendJsonl(path.join(runDir(root, 'demo'), 'verdicts.jsonl'), verdicts);
}

function candidatesOf(root: string): Candidate[] {
  return readJsonl<Candidate>(path.join(runDir(root, 'demo'), 'candidates.jsonl'));
}

function verdictsOf(root: string): Verdict[] {
  return readJsonl<Verdict>(path.join(runDir(root, 'demo'), 'verdicts.jsonl'));
}

/** The rows the run fetched, without the rows a test seeded by hand. */
function fetchedOf(root: string): Candidate[] {
  return candidatesOf(root).filter((row) => row.source_key !== 'manual');
}

test('no argument prints the usage block and fails', async (t) => {
  const { deps, err } = setup(t);
  assert.equal(await runCommand([], deps), 1);
  const usage = err.join('\n');
  for (const command of [
    'run init',
    'species list',
    'species retire',
    'photos fetch',
    'photos add',
    'photos verdict',
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
  assert.ok(usage.includes('build <name> [--base <ref>]'), 'build takes --base');
  assert.ok(usage.includes('ids check [--base <ref>]'), 'ids check takes --base');
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
  assert.equal(await runCommand(['species', 'retire', 'QUGA'], deps), 1);
  assert.deepEqual(err, [
    'not implemented yet: build',
    'not implemented yet: run pr',
    'not implemented yet: species retire',
  ]);
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
  assert.equal(scope.fetch_failures, 0);
  assert.deepEqual(exec.calls, [
    { command: 'git', args: ['checkout', '-b', 'content/demo', 'main'] },
  ]);
  assert.ok(out.join('\n').includes('content/demo'));
});

test('run init on an existing run resumes and checks out its branch', async (t) => {
  const { root, deps, exec, out } = setup(t);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});

  const code = await runCommand(
    ['run', 'init', 'demo', '--bucket', 'other', '--channels', 'bark'],
    deps,
  );
  assert.equal(code, 0);
  assert.deepEqual(out, ['run demo already exists']);
  assert.deepEqual(exec.calls, [{ command: 'git', args: ['checkout', 'content/demo'] }]);
  assert.equal(readRun(root, 'demo').bucket, 'simple_lobed');
});

test('run init --concepts takes its channels from the prefixes', async (t) => {
  const { root, deps } = setup(t);
  seedConcepts(root);
  const code = await runCommand(
    ['run', 'init', 'demo', '--concepts', 'bark/plated, leaf/simple_lobed'],
    deps,
  );
  assert.equal(code, 0);

  const scope = readRun(root, 'demo');
  assert.equal(scope.bucket, null);
  assert.deepEqual(scope.concepts, ['bark/plated', 'leaf/simple_lobed']);
  assert.deepEqual(scope.channels, ['bark', 'leaf']);
  assert.deepEqual(scope.concept_exemplars, {});
  assert.deepEqual(scope.species, []);
});

test('run init --concepts names an unknown concept key', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seedConcepts(root);
  assert.equal(
    await runCommand(['run', 'init', 'demo', '--concepts', 'leaf/lobed,bark/plated'], deps),
    1,
  );
  assert.deepEqual(err, ['unknown concept key: leaf/lobed']);
  assert.deepEqual(exec.calls, []);
  assert.ok(!fs.existsSync(path.join(runDir(root, 'demo'), 'run.json')));
});

test('species list enumerates the checklist and commits the result', async (t) => {
  const { root, deps, exec, out } = setup(t, checklistRoutes());
  seedRun(root, { bucket: 'simple_lobed', states: 'CO', genera: 'Quercus', channels: 'leaf' }, () => {});

  assert.equal(await runCommand(['species', 'list', 'demo'], deps), 0);

  const scope = readRun(root, 'demo');
  assert.deepEqual(scope.species, ['QUGA']);
  assert.deepEqual(scope.dropped, [{ symbol: 'QUUN', reason: 'hybrid' }]);
  assert.equal(scope.fetch_failures, 0);
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

test('species list writes plants_ids.json with the id and the scientific name', async (t) => {
  const { root, deps } = setup(t, checklistRoutes());
  seedRun(root, { bucket: 'simple_lobed', states: 'CO', genera: 'Quercus', channels: 'leaf' }, () => {});

  assert.equal(await runCommand(['species', 'list', 'demo'], deps), 0);

  const file = path.join(root, 'pipeline', 'data', 'plants_ids.json');
  const text = fs.readFileSync(file, 'utf8');
  const table = JSON.parse(text) as Record<string, { id: number; scientific: string }>;
  assert.deepEqual(table.QUGA, { id: QUGA_ID, scientific: SCIENTIFIC });
  assert.equal(table.QUUN.id, QUUN_ID);
  assert.ok(table.QUUN.scientific.includes('undulata'));
  assert.ok(text.endsWith('}\n'));
});

test('species list reports a symbol with no profile and drops it', async (t) => {
  const routes = checklistRoutes();
  routes.delete(profileUrl('QUUN'));
  const { root, deps, err } = setup(t, routes);
  seedRun(root, { bucket: 'simple_lobed', states: 'CO', genera: 'Quercus', channels: 'leaf' }, () => {});

  assert.equal(await runCommand(['species', 'list', 'demo'], deps), 0);

  assert.ok(err.includes(`QUUN: ${NO_PROFILE}`));
  const scope = readRun(root, 'demo');
  assert.deepEqual(scope.species, ['QUGA']);
  assert.deepEqual(scope.dropped, [{ symbol: 'QUUN', reason: NO_PROFILE }]);
  assert.ok(scope.fetch_failures > 0);
});

test('photos fetch appends candidates with their bytes and commits', async (t) => {
  const { root, deps, exec } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const rows = fetchedOf(root);
  const expected = expectedRows('QUGA');
  assert.equal(rows.length, expected.length);
  assert.deepEqual(
    originsOf(rows),
    originsOf(expected),
    'one row per candidate the three sources name, and no row for an excluded image',
  );
  assert.deepEqual([...new Set(rows.map((row) => row.source_key))].sort(), [
    'commons',
    'inat',
    'plants',
  ]);
  for (const key of ['commons', 'inat', 'plants'] as const) {
    const row = rows.find((candidate) => candidate.source_key === key);
    assert.ok(row !== undefined, `the run found a ${key} row`);
    assert.equal(row.source, SOURCE_NAMES[key], 'the display name reaches the row');
  }
  for (const row of rows) {
    assert.equal(row.target, 'QUGA');
    assert.equal(row.fetch_error, null);
    assert.equal(row.fetched_at, NOW);
    assert.equal(row.identity_match, true);
    assert.ok(row.file_hash !== null && row.file_hash.length === 64);
    assert.ok(row.local !== null && row.local.startsWith(`pipeline/cache/${row.source_key}/`));
    assert.ok(fs.existsSync(path.join(root, row.local)));
  }
  assert.equal(readRun(root, 'demo').fetch_failures, 0);
  assert.equal(exec.calls[1].args[2], 'content(demo): photo candidates');
});

test('photos fetch merges the three iNat passes into one row per photo', async (t) => {
  const { root, deps, http } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  for (const pass of inatPasses(FLOWERING_VALUE_ID)) {
    assert.ok(
      http.urls.includes(observationsUrl(INAT_TAXON_ID, 1, pass)),
      `the ${pass.name} pass was requested`,
    );
  }
  assert.deepEqual(http.failures, []);

  const inat = fetchedOf(root).filter((row) => row.source_key === 'inat');
  assert.equal(inat.length, inatRowsOf('QUGA').length, 'one row per photo, not one per pass');
  for (const row of inat) {
    assert.deepEqual(row.tags_hint, ['flowering'], 'the flowering pass tags survive the merge');
    assert.equal(row.channel_hint, 'flower');
  }
});

test('photos fetch pages the Commons listing', async (t) => {
  const { root, deps, http } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  assert.ok(http.urls.includes(categoryUrl(SCIENTIFIC, null)), 'page 1 was requested');
  assert.ok(http.urls.includes(categoryUrl(SCIENTIFIC, commonsToken())), 'page 2 was requested');
  assert.deepEqual(http.failures, []);
  assert.deepEqual(
    originsOf(fetchedOf(root).filter((row) => row.source_key === 'commons')),
    originsOf(commonsRowsOf('QUGA')),
    'both pages of the listing reach the queue',
  );
  assert.deepEqual(readRun(root, 'demo').capped, []);
});

test('photos fetch prints a failed listing and still exits 0', async (t) => {
  const routes = photoRoutes();
  const failing = categoryUrl(SCIENTIFIC, null);
  routes.set(failing, { status: 500 });
  const { root, deps, http, err } = setup(t, routes);
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const rows = fetchedOf(root);
  assert.deepEqual(
    originsOf(rows),
    originsOf([...plantsRowsOf('QUGA'), ...inatRowsOf('QUGA')]),
    'the other two sources still fill the queue',
  );
  assert.equal(rows.filter((row) => row.source_key === 'commons').length, 0);
  assert.ok(err.includes(`fetch failed: 500 ${failing}: status 500`));
  assert.equal(readRun(root, 'demo').fetch_failures, http.failures.length);
  assert.ok(http.failures.length > 0);
});

test('photos fetch records a failed download and keeps the row', async (t) => {
  const routes = photoRoutes();
  const failing = plantsRowsOf('QUGA')[0].file_url;
  routes.set(failing, { status: 404 });
  const { root, deps } = setup(t, routes);
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const rows = fetchedOf(root);
  assert.equal(rows.length, expectedRows('QUGA').length, 'the failed row is kept, not dropped');
  const plants = rows.filter((row) => row.source_key === 'plants');
  assert.equal(plants.length, plantsRowsOf('QUGA').length);
  const broken = plants.filter((row) => row.file_url === failing);
  assert.equal(broken.length, 1);
  assert.equal(broken[0].local, null);
  assert.equal(broken[0].file_hash, null);
  assert.equal(broken[0].fetch_error, 'status 404');
  for (const row of plants.filter((candidate) => candidate.file_url !== failing)) {
    assert.equal(row.fetch_error, null);
    assert.ok(row.local !== null);
  }
  assert.ok(readRun(root, 'demo').fetch_failures > 0);
});

test('photos fetch skips the profile call for a symbol in plants_ids.json', async (t) => {
  const { root, deps, http } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedPlantsIds(root, { QUGA: { id: QUGA_ID, scientific: SCIENTIFIC } });
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  assert.ok(!http.urls.includes(profileUrl('QUGA')), 'the committed id spares the profile call');
  assert.ok(http.urls.includes(imagesUrl(QUGA_ID)), 'the image call still runs');
  assert.deepEqual(originsOf(fetchedOf(root)), originsOf(expectedRows('QUGA')));
  assert.deepEqual(http.failures, []);
});

test('photos fetch sets identity_match false when the source name differs', async (t) => {
  const routes = photoRoutes();
  const other = fixture('inat_observations_quga.json').replaceAll(SCIENTIFIC, 'Quercus turbinella');
  for (const pass of inatPasses(FLOWERING_VALUE_ID)) {
    if (pass.term_value_id === FRUITING_VALUE_ID) continue;
    routes.set(observationsUrl(INAT_TAXON_ID, 1, pass), { body: other });
  }
  const { root, deps } = setup(t, routes);
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const rows = fetchedOf(root);
  const inat = rows.filter((row) => row.source_key === 'inat');
  assert.equal(inat.length, inatRowsOf('QUGA').length);
  for (const row of inat) {
    assert.ok(row.source_species !== null && row.source_species.startsWith('Quercus turbinella'));
    assert.equal(row.identity_match, false, 'a different species fails the identity check');
  }
  for (const row of rows.filter((candidate) => candidate.source_key === 'plants')) {
    assert.equal(row.identity_match, true);
  }
});

test('photos fetch counts the channel cap per target', async (t) => {
  const { root, deps } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { concepts: 'leaf/simple_lobed,bark/plated' }, (scope) => {
    scope.concept_exemplars = {
      'leaf/simple_lobed': ['QUGA'],
      'bark/plated': ['QUGA'],
    };
  });
  seedApprovedLeaf(root, 'leaf/simple_lobed');

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const leaf = fetchedOf(root).filter((row) => row.target === 'leaf/simple_lobed');
  const bark = fetchedOf(root).filter((row) => row.target === 'bark/plated');
  assert.ok(leaf.length > 0, 'the full channel does not stop the other channels');
  assert.ok(
    leaf.every((row) => row.channel_hint !== 'leaf'),
    'a target with a full leaf channel takes no more leaf photos',
  );
  assert.ok(
    bark.some((row) => row.channel_hint === 'leaf'),
    'the other target still takes a leaf photo',
  );
});

test('photos fetch keeps each target's rows when a later target throws', async (t) => {
  const throwOn = new Set([profileUrl('QUZZ')]);
  const { root, deps, exec, err } = setup(t, photoRoutes(), throwOn);
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA', 'QUZZ'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 1);

  assert.ok(err.join('\n').includes('the fake connection dropped'));
  const rows = candidatesOf(root);
  assert.equal(rows.length, expectedRows('QUGA').length, 'the first target is on disk');
  assert.ok(rows.every((row) => row.target === 'QUGA'));
  assert.deepEqual(exec.calls, [], 'a run that threw commits nothing');
});

test('photos fetch reports the Commons page cap and records it', async (t) => {
  const routes = photoRoutes();
  // Every page answers with page 1, so the continuation token never changes and the listing
  // never ends.
  routes.set(categoryUrl(SCIENTIFIC, commonsToken()), {
    body: fixture('commons_category_quga.json'),
  });
  const { root, deps, err } = setup(t, routes);
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const message = `QUGA: commons listing capped at ${MAX_COMMONS_PAGES} pages`;
  assert.ok(err.includes(message));
  assert.deepEqual(readRun(root, 'demo').capped, [message]);
});

test('photos fetch with --refresh requests the same urls and records no failure', async (t) => {
  const { root, deps, http } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo', '--refresh'], deps), 0);

  assert.deepEqual(originsOf(fetchedOf(root)), originsOf(expectedRows('QUGA')));
  assert.ok(http.urls.includes(profileUrl('QUGA')));
  assert.ok(
    http.urls.every((url) => !url.includes('refresh')),
    'the flag belongs to the http cache, not to a url',
  );
  assert.deepEqual(http.failures, []);
});

test('photos fetch keeps one photo under two concept targets', async (t) => {
  const { root, deps } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { concepts: 'leaf/simple_lobed,bark/plated' }, (scope) => {
    scope.concept_exemplars = {
      'leaf/simple_lobed': ['QUGA'],
      'bark/plated': ['QUGA'],
    };
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const rows = fetchedOf(root);
  const perTarget = expectedRows('leaf/simple_lobed').length;
  assert.equal(rows.length, perTarget * 2, 'every photo lands under each of the two targets');
  assert.deepEqual([...new Set(rows.map((row) => row.target))].sort(), [
    'bark/plated',
    'leaf/simple_lobed',
  ]);
  assert.equal(
    new Set(rows.map((row) => row.id)).size,
    perTarget * 2,
    'the target is part of the id, so the second target is no duplicate',
  );
  assert.equal(new Set(rows.map((row) => row.origin)).size, perTarget, 'one origin per photo');
});

test('photos fetch reports an exemplar with no profile', async (t) => {
  const { root, deps, err } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUZZ'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  assert.ok(err.includes(`QUZZ: ${NO_PROFILE}`));
  assert.deepEqual(readRun(root, 'demo').dropped, [{ symbol: 'QUZZ', reason: NO_PROFILE }]);
  assert.deepEqual(candidatesOf(root), []);
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
    '--source',
    'USDA Forest Service',
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
  assert.equal(rows[0].source_key, 'manual');
  assert.equal(rows[0].source, 'USDA Forest Service');
  assert.equal(rows[0].author, 'US Forest Service');
  assert.equal(rows[0].target, 'QUGA');
  assert.equal(rows[0].channel_hint, 'bark');
  assert.equal(rows[0].license_url, null);
  assert.equal(rows[0].local, 'pipeline/cache/manual/quga_bark.jpg');
  assert.equal(rows[0].fetched_at, NOW);

  const short = full.slice(0, full.indexOf('--author'));
  assert.equal(await runCommand(short, deps), 1);
  assert.deepEqual(err, ['photos add needs --author']);
  assert.equal(candidatesOf(root).length, 1);
});

test('photos add refuses a license the allowlist rejects', async (t) => {
  const { root, deps, err } = setup(t);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});

  const code = await runCommand(
    [
      'photos',
      'add',
      'demo',
      '--target',
      'QUGA',
      '--origin',
      'https://example.org/page',
      '--file-url',
      'https://example.org/a.jpg',
      '--source',
      'a blog',
      '--author',
      'A Photographer',
      '--license',
      'CC BY-NC 2.0',
    ],
    deps,
  );
  assert.equal(code, 1);
  assert.deepEqual(err, ['photos add license is not allowed: CC BY-NC 2.0']);
  assert.deepEqual(candidatesOf(root), []);
});

test('photos verdict appends an approved row with the agent name', async (t) => {
  const { root, deps, out } = setup(t);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, () => {});
  const target = seedCandidate(root, 'QUGA', 0);

  const code = await runCommand(
    [
      'photos',
      'verdict',
      'demo',
      '--candidate',
      target.id,
      '--verdict',
      'approve',
      '--channel',
      'leaf',
      '--tags',
      'shape, margin',
      '--note',
      'a clear lobed leaf',
    ],
    deps,
  );
  assert.equal(code, 0);

  const rows = verdictsOf(root);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    candidate_id: target.id,
    verdict: 'approve',
    channel: 'leaf',
    tags: ['shape', 'margin'],
    case: null,
    note: 'a clear lobed leaf',
    checked_by: CHECK_AGENT,
    checked_at: NOW,
  });
  assert.ok(out.join('\n').includes(target.id));
});

test('photos verdict refuses an unknown candidate and an unknown channel', async (t) => {
  const { root, deps, err } = setup(t);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, () => {});
  const target = seedCandidate(root, 'QUGA', 0);

  const absent = ['photos', 'verdict', 'demo', '--candidate', 'deadbeef', '--verdict', 'approve',
    '--channel', 'leaf', '--note', 'no such row'];
  assert.equal(await runCommand(absent, deps), 1);
  assert.ok(err.join('\n').includes('deadbeef'));

  const offChannel = ['photos', 'verdict', 'demo', '--candidate', target.id, '--verdict',
    'approve', '--channel', 'twig', '--note', 'a channel this run never opened'];
  assert.equal(await runCommand(offChannel, deps), 1);
  assert.ok(err.join('\n').includes('twig'));

  assert.deepEqual(verdictsOf(root), []);
});

test('data sections follows every next link and writes one table', async (t) => {
  const walk = sectionWalk();
  const { root, deps, http, out } = setup(t, walk.routes);

  assert.equal(await runCommand(['data', 'sections'], deps), 0);

  const names = sectionNames();
  const file = path.join(root, 'pipeline', 'data', 'quercus_sections.json');
  const table = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  assert.deepEqual(Object.keys(table), [...names].sort(), 'every name on every page');
  assert.equal(table['Quercus gambelii'], 'Quercus');
  assert.equal(table['Quercus rubra'], 'Lobatae');
  assert.equal(table['Quercus texana'], 'Lobatae', 'a page 2 name carries its section');
  assert.equal(table['Quercus chrysolepis'], 'Protobalanus');
  assert.deepEqual(out, [
    `${names.size} rows written to pipeline/data/quercus_sections.json`,
  ]);
  assert.equal(walk.urls.length, 5, 'two of the three first pages link a second page');
  assert.deepEqual(http.urls, walk.urls, 'each page is read once, in section order');
  assert.deepEqual(http.failures, []);
});

test('data inat-terms writes the one non-fruiting phenology value', async (t) => {
  const { root, deps, out } = setup(t, termRoutes(fixture('inat_phenology_probe.json')));

  assert.equal(await runCommand(['data', 'inat-terms'], deps), 0);

  const file = path.join(root, 'pipeline', 'data', 'inat_terms.json');
  const text = fs.readFileSync(file, 'utf8');
  assert.deepEqual(JSON.parse(text), { flowering_value_id: FLOWERING_VALUE_ID });
  assert.ok(text.endsWith('}\n'));
  assert.deepEqual(out, [`flowering_value_id is ${FLOWERING_VALUE_ID}`]);
});

test('data inat-terms lists the values when more than one remains', async (t) => {
  const probe = JSON.parse(fixture('inat_phenology_probe.json')) as {
    results: { annotations: { controlled_attribute_id: number; controlled_value_id: number }[] }[];
  };
  probe.results[0].annotations.push({
    controlled_attribute_id: PHENOLOGY_TERM_ID,
    controlled_value_id: 15,
  });
  const { root, deps, err } = setup(t, termRoutes(JSON.stringify(probe)));

  assert.equal(await runCommand(['data', 'inat-terms'], deps), 1);

  assert.ok(err.join('\n').includes(`${FLOWERING_VALUE_ID}, 15`));
  assert.ok(!fs.existsSync(path.join(root, 'pipeline', 'data', 'inat_terms.json')));
});

test('data inat-terms records a body that is not JSON', async (t) => {
  const { root, deps, http, err } = setup(t, termRoutes('<html>a login page</html>'));

  assert.equal(await runCommand(['data', 'inat-terms'], deps), 1);

  assert.ok(
    http.failures.some(
      (failure) =>
        failure.message === 'body is not JSON' && failure.url === phenologyProbeUrl(PER_PAGE),
    ),
    'the caller records the bad body instead of swallowing it',
  );
  assert.ok(err.join('\n').includes('body is not JSON'));
  assert.ok(!fs.existsSync(path.join(root, 'pipeline', 'data', 'inat_terms.json')));
});

test('a thrown error prints its stack when DENDRO_DEBUG is set', async (t) => {
  const throwOn = new Set([profileUrl('QUGA')]);
  const { root, deps, err } = setup(t, photoRoutes(), throwOn);
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, (scope) => {
    scope.species = ['QUGA'];
  });
  process.env.DENDRO_DEBUG = '1';
  t.after(() => {
    delete process.env.DENDRO_DEBUG;
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 1);

  const printed = err.join('\n');
  assert.ok(printed.includes('the fake connection dropped'));
  assert.ok(printed.includes('at '), 'the stack frames reach stderr');
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: FAIL, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\pipeline\lib\commands.ts' imported from ...\pipeline\tests\cli_fetch.test.ts`

- [ ] **Step 9: Create `pipeline/lib/commands.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';

import {
  collect,
  licenseAllowed,
  makeCandidate,
  mergeFound,
  type Candidate,
} from './candidates.ts';
import { categoryUrl, commonsCandidates, parseCategoryListing } from './commons.ts';
import { SECTION_PAGES, buildSectionTable, nextPageUrl } from './fna.ts';
import type { Http, TextResult } from './http.ts';
import { sha256Hex, type Resize } from './images.ts';
import {
  FRUITING_VALUE_ID,
  PER_PAGE,
  PHENOLOGY_TERM_ID,
  inatCandidates,
  inatPasses,
  loadInatTerms,
  observationsUrl,
  parseObservations,
  parseTaxon,
  phenologyProbeUrl,
  taxaUrl,
  type InatPass,
} from './inat.ts';
import { asArray, asNumber, asRecord, asString } from './json_fields.ts';
import { appendJsonl, readJsonl } from './jsonl.ts';
import type { ManifestRow } from './manifest.ts';
import {
  CHECKLIST_URL,
  acceptedSymbols,
  fetchDistribution,
  fetchImages,
  fetchProfile,
  parseChecklist,
  plantsCandidates,
  synonymNames,
  type PlantsProfile,
} from './plants.ts';
import {
  csvList,
  errorMessage,
  gitCheckoutBranch,
  gitCheckoutExisting,
  gitCommitAll,
  newScope,
  parseFlags,
  readConceptKeys,
  readRun,
  runDir,
  writeRun,
  type Exec,
  type RunScope,
} from './run.ts';
import { enumerateRun } from './species.ts';
import type { Storage } from './storage.ts';
import {
  VERDICT_KINDS,
  approvedVerdicts,
  countByTargetChannel,
  identityMatches,
  validateVerdicts,
  type EscalationCase,
  type Verdict,
  type VerdictKind,
} from './verdicts.ts';

export interface ValidationMessage {
  file: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
}

/** The four content files plus the manifest, as the app's validator reads them. */
export interface RawContent {
  species: Record<string, Record<string, unknown>>;
  concepts: { key: string; channel: string; name: string; accept: string[]; description: string }[];
  units: Record<string, unknown>[];
  confusion: { a: string; b: string; channel: string; a_not_b: string; b_not_a: string; ref: string }[];
  manifest: ManifestRow[];
}

/**
 * Every side effect a command needs. Network, the clock, object storage, and image resizing
 * arrive here. Disk does not: a function that reads or writes a file takes the path as a
 * parameter, and `root` is the directory those paths hang off.
 */
export interface CliDeps {
  root: string;
  exec: Exec;
  http: Http;
  storage: Storage;
  resize: Resize;
  validate: (raw: RawContent) => ValidationResult;
  cdn_base: string;
  now: () => Date;
}

type Handler = (rest: string[], deps: CliDeps) => Promise<number>;

/** The name every verdict this command writes carries. D11 keeps one writer. */
export const CHECK_AGENT = 'photo_check_agent';

/** The reason a species carries when its PLANTS profile did not arrive. */
export const NO_PROFILE = 'no profile';

export const MAX_COMMONS_PAGES = 4;
export const MAX_INAT_PAGES = 4;

const USAGE = `usage: node pipeline/cli.ts <command> [flags]

  run init <name> --bucket <b> --states <csv> --genera <csv> --include <csv> --channels <csv>
  run init <name> --concepts <csv>
  species list <name>
  species retire <SYMBOL> --reason "<text>"
  photos fetch <name>
  photos add <name> --target <t> --origin <url> --file-url <url> --source <s> --author <a> --license <l> [--license-url <u>] [--source-species <s>] [--channel-hint <c>] [--local <path>]
  photos verdict <name> --candidate <id> --verdict <${VERDICT_KINDS.join('|')}> [--channel <c>] [--tags a,b] [--case <case>] --note "<text>"
  build <name> [--base <ref>]
  report <name>
  run pr <name>
  run finish <name>
  images retire <hash> --reason "<text>"
  data sections
  data inat-terms
  ids check [--base <ref>]

A flag name is kebab-case. A csv value splits on commas and each part is trimmed.
--base names the ref the append-only check reads, and defaults to main.
--refresh works on every command and bypasses the cache for that command.`;

/** A first word that takes a second word. Every other command is one word. */
const GROUPS: Set<string> = new Set(['run', 'species', 'photos', 'data', 'images', 'ids']);

const ADD_REQUIRED: string[] = ['target', 'origin', 'file-url', 'source', 'author', 'license'];

const VERDICT_REQUIRED: string[] = ['candidate', 'verdict', 'note'];

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
    // A TypeError's message alone says nothing about where it came from, so
    // DENDRO_DEBUG keeps the stack.
    const debug = (process.env.DENDRO_DEBUG ?? '') !== '';
    if (debug && error instanceof Error) console.error(error.stack ?? String(error));
    else console.error(errorMessage(error));
    return 1;
  }
}

async function runInit(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'run init <name> --bucket <b> --channels <csv>');
  const file = path.join(runDir(deps.root, name), 'run.json');
  if (fs.existsSync(file)) {
    // A stopped run resumes with the same command, so this is not a failure. The branch
    // already exists, so this checks it out instead of branching again.
    gitCheckoutExisting(deps.exec, name);
    console.log(`run ${name} already exists`);
    return 0;
  }
  const scope = newScope(name, parseFlags(rest.slice(1)), isoNow(deps));
  if (scope.concepts.length > 0) {
    const known = readConceptKeys(path.join(deps.root, 'content', 'concepts.json'));
    const unknown = scope.concepts.filter((key) => !known.includes(key));
    if (unknown.length > 0) {
      console.error(`unknown concept key: ${unknown.join(', ')}`);
      return 1;
    }
  }
  writeRun(deps.root, scope);
  gitCheckoutBranch(deps.exec, name);
  console.log(`run ${name} created on branch content/${name}`);
  return 0;
}

async function speciesList(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'species list <name>');
  const scope = readRun(deps.root, name);
  const now = isoNow(deps);

  const checklist = await deps.http.getText(CHECKLIST_URL);
  if (!checklist.ok) {
    console.error(`the PLANTS checklist fetch failed: ${checklist.error ?? checklist.status}`);
    printFailures(deps);
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
  const noProfile: string[] = [];
  for (const symbol of wanted) {
    const profile = await fetchProfile(deps.http, symbol, now);
    if (profile === null) {
      console.error(`${symbol}: ${NO_PROFILE}`);
      noProfile.push(symbol);
      continue;
    }
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
  scope.dropped = withNoProfile(enumerated.dropped, noProfile);
  scope.fetch_failures = deps.http.failures.length;
  writeRun(deps.root, scope);
  writePlantsIds(plantsIdsPath(deps.root), profiles);
  gitCommitAll(deps.exec, `content(${name}): species list`);
  printFailures(deps);
  console.log(`${enumerated.kept.length} species kept, ${scope.dropped.length} dropped`);
  return 0;
}

async function photosFetch(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'photos fetch <name>');
  const scope = readRun(deps.root, name);
  const now = isoNow(deps);
  const dir = runDir(deps.root, name);
  const candidatesPath = path.join(dir, 'candidates.jsonl');

  let existing = readJsonl<Candidate>(candidatesPath);
  const verdicts = readJsonl<Verdict>(path.join(dir, 'verdicts.jsonl'));
  const counts = countByTargetChannel(approvedVerdicts(verdicts), existing);
  const terms = loadInatTerms(path.join(deps.root, 'pipeline', 'data', 'inat_terms.json'));
  const passes = inatPasses(terms.flowering_value_id);
  const ids = readPlantsIds(plantsIdsPath(deps.root));

  // `synonymNames` needs the checklist, and the disk cache already holds it from
  // `species list`, so this costs no request on a run that listed its species.
  const checklist = await deps.http.getText(CHECKLIST_URL);
  if (!checklist.ok) {
    console.error(
      `the PLANTS checklist fetch failed: ${checklist.error ?? checklist.status}. Every identity check reads the accepted name only.`,
    );
  }
  const rows = checklist.ok ? parseChecklist(checklist.body) : [];

  const noProfile: string[] = [];
  let appended = 0;
  for (const target of targetsOf(scope)) {
    if (target.lookups.length === 0) {
      console.error(`${target.key}: no exemplars in run.json`);
    }
    const found: Candidate[] = [];
    for (const symbol of target.lookups) {
      const plant = await plantOf(deps, ids, symbol, now);
      if (plant === null) {
        console.error(`${symbol}: ${NO_PROFILE}`);
        noProfile.push(symbol);
        continue;
      }
      const context: FetchContext = {
        deps,
        scope,
        target: target.key,
        scientific: plant.scientific,
        plants_id: plant.id,
        now,
      };
      const names = [plant.scientific, ...synonymNames(rows, symbol)];
      const fromSources: Candidate[] = [];
      fromSources.push(...(await plantsRows(context)));
      fromSources.push(...(await commonsRows(context)));
      fromSources.push(...(await inatRows(context, passes)));
      // D17: the script compares the source's own name with the accepted name and its
      // synonyms, so the photo-check agent reads a verdict instead of guessing.
      for (const row of fromSources) {
        row.identity_match = identityMatches(row.source_species, names);
      }
      found.push(...fromSources);
    }
    const collected = collect({
      existing,
      found: mergeFound(found),
      target: target.key,
      approvedByChannel: counts[target.key] ?? {},
    });
    for (const row of collected.added) await download(deps, row);
    // The append happens per target, so a run that stops on the third target keeps the
    // rows of the first two.
    if (collected.added.length > 0) appendJsonl(candidatesPath, collected.added);
    existing = existing.concat(collected.added);
    appended += collected.added.length;
  }

  scope.dropped = withNoProfile(scope.dropped, noProfile);
  scope.fetch_failures = deps.http.failures.length;
  writeRun(deps.root, scope);
  gitCommitAll(deps.exec, `content(${name}): photo candidates`);
  printFailures(deps);
  console.log(`${appended} candidates appended to ${relative(deps.root, candidatesPath)}`);
  return 0;
}

async function photosAdd(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'photos add <name> --target <t> --origin <url>');
  readRun(deps.root, name);
  const flags = parseFlags(rest.slice(1));
  for (const key of ADD_REQUIRED) {
    const value = flags[key];
    if (value === undefined || value.trim() === '') {
      console.error(`photos add needs --${key}`);
      return 1;
    }
  }
  if (!licenseAllowed(flags.license)) {
    console.error(`photos add license is not allowed: ${flags.license}`);
    return 1;
  }
  const row = makeCandidate({
    target: flags.target,
    source_key: 'manual',
    source: flags.source,
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

async function photosVerdict(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(
    rest,
    'photos verdict <name> --candidate <id> --verdict <kind> --note "<text>"',
  );
  const scope = readRun(deps.root, name);
  const flags = parseFlags(rest.slice(1));
  for (const key of VERDICT_REQUIRED) {
    const value = flags[key];
    if (value === undefined || value.trim() === '') {
      console.error(`photos verdict needs --${key}`);
      return 1;
    }
  }
  const dir = runDir(deps.root, name);
  const candidates = readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'));
  // The two casts hold because `validateVerdicts` rejects a kind outside VERDICT_KINDS and
  // a case outside the three cases, and nothing is written before it passes.
  const row: Verdict = {
    candidate_id: flags.candidate,
    verdict: flags.verdict as VerdictKind,
    channel: flags.channel ?? null,
    tags: csvList(flags.tags),
    case: (flags.case ?? null) as EscalationCase | null,
    note: flags.note,
    checked_by: CHECK_AGENT,
    checked_at: isoNow(deps),
  };
  const errors = validateVerdicts([row], candidates, scope.channels);
  if (errors.length > 0) {
    for (const message of errors) console.error(message);
    return 1;
  }
  appendJsonl(path.join(dir, 'verdicts.jsonl'), [row]);
  console.log(`${row.verdict} recorded for candidate ${row.candidate_id}`);
  return 0;
}

async function dataSections(_rest: string[], deps: CliDeps): Promise<number> {
  const pages: { section: string; html: string }[] = [];
  for (const page of SECTION_PAGES) {
    // A browse page links the next page of the same section. The seen set stops a page that
    // links itself.
    const seen = new Set<string>();
    let url: string | null = page.url;
    while (url !== null && !seen.has(url)) {
      seen.add(url);
      const result = await deps.http.getText(url);
      if (!result.ok) {
        console.error(
          `the FNA page for section ${page.section} failed: ${result.error ?? result.status}`,
        );
        printFailures(deps);
        return 1;
      }
      pages.push({ section: page.section, html: result.body });
      url = nextPageUrl(result.body, url);
    }
  }
  const table = sortKeys(buildSectionTable(pages));
  const file = path.join(deps.root, 'pipeline', 'data', 'quercus_sections.json');
  writeJson(file, table);
  console.log(`${Object.keys(table).length} rows written to ${relative(deps.root, file)}`);
  return 0;
}

async function dataInatTerms(_rest: string[], deps: CliDeps): Promise<number> {
  const now = isoNow(deps);
  const url = phenologyProbeUrl(PER_PAGE);
  const result = await deps.http.getText(url);
  if (!result.ok) {
    console.error(`the iNat phenology probe failed: ${result.error ?? result.status}`);
    printFailures(deps);
    return 1;
  }
  const json = parseJson(deps.http, url, result, now);
  if (json === null) {
    printFailures(deps);
    return 1;
  }
  const root = asRecord(json);
  const results = root === null ? null : asArray(root.results);
  if (results === null) {
    console.error(`${url} answered with no results array.`);
    return 1;
  }

  // Phenology has one value per state. Fruiting is known, so one page of observations that
  // names exactly one other value names flowering. Two values mean the vocabulary grew, and
  // a guess would mislabel every flower photo of every run.
  const values: number[] = [];
  for (const item of results) {
    const observation = asRecord(item);
    const annotations = observation === null ? null : asArray(observation.annotations);
    for (const raw of annotations ?? []) {
      const annotation = asRecord(raw);
      if (annotation === null) continue;
      if (asNumber(annotation.controlled_attribute_id) !== PHENOLOGY_TERM_ID) continue;
      const value = asNumber(annotation.controlled_value_id);
      if (value === null || value === FRUITING_VALUE_ID) continue;
      if (!values.includes(value)) values.push(value);
    }
  }
  values.sort((a, b) => a - b);
  if (values.length !== 1) {
    console.error(
      `the phenology probe found ${values.length} non-fruiting values: ${values.join(', ')}. Set flowering_value_id by hand in pipeline/data/inat_terms.json.`,
    );
    return 1;
  }

  const file = path.join(deps.root, 'pipeline', 'data', 'inat_terms.json');
  writeJson(file, { flowering_value_id: values[0] });
  console.log(`flowering_value_id is ${values[0]}`);
  return 0;
}

function notYet(name: string): Handler {
  return async () => {
    console.error(`not implemented yet: ${name}`);
    return 1;
  };
}

// Every command of the surface is named here. Task 14 replaces the last seven.
const COMMANDS: Record<string, Handler> = {
  'run init': runInit,
  'species list': speciesList,
  'photos fetch': photosFetch,
  'photos add': photosAdd,
  'photos verdict': photosVerdict,
  'data sections': dataSections,
  'data inat-terms': dataInatTerms,
  build: notYet('build'),
  report: notYet('report'),
  'run pr': notYet('run pr'),
  'run finish': notYet('run finish'),
  'images retire': notYet('images retire'),
  'species retire': notYet('species retire'),
  'ids check': notYet('ids check'),
};

interface FetchContext {
  deps: CliDeps;
  scope: RunScope;
  /** The run's target. The candidate id carries it, so a source builds with it. */
  target: string;
  scientific: string;
  plants_id: number;
  now: string;
}

interface PlantId {
  id: number;
  scientific: string;
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
    return scope.concepts.map((key) => ({ key, lookups: scope.concept_exemplars[key] ?? [] }));
  }
  return scope.species.map((symbol) => ({ key: symbol, lookups: [symbol] }));
}

/** The committed table spares the profile call. D12: `species list` writes it. */
async function plantOf(
  deps: CliDeps,
  ids: Record<string, PlantId>,
  symbol: string,
  now: string,
): Promise<PlantId | null> {
  const known = ids[symbol];
  if (known !== undefined) return known;
  const profile = await fetchProfile(deps.http, symbol, now);
  if (profile === null) return null;
  return { id: profile.plants_id, scientific: profile.scientific };
}

async function plantsRows(context: FetchContext): Promise<Candidate[]> {
  const images = await fetchImages(context.deps.http, context.plants_id, context.now);
  return plantsCandidates(images, context.target, context.scientific, context.now);
}

async function commonsRows(context: FetchContext): Promise<Candidate[]> {
  const { deps, scientific, target, now } = context;
  const rows: Candidate[] = [];
  let token: string | null = null;
  for (let page = 0; page < MAX_COMMONS_PAGES; page += 1) {
    const url = categoryUrl(scientific, token);
    const result = await deps.http.getText(url);
    if (!result.ok) return rows;
    const json = parseJson(deps.http, url, result, now);
    if (json === null) return rows;
    const listing = parseCategoryListing(json);
    if (listing.error !== null) {
      recordFailure(deps.http, url, result.status, listing.error, now);
      return rows;
    }
    rows.push(...commonsCandidates(listing.files, target, scientific, now));
    if (listing.next === null) return rows;
    token = listing.next;
  }
  noteCap(context, `commons listing capped at ${MAX_COMMONS_PAGES} pages`);
  return rows;
}

async function inatRows(context: FetchContext, passes: InatPass[]): Promise<Candidate[]> {
  const { deps, scientific, target, now } = context;
  const taxonUrl = taxaUrl(scientific);
  const taxonResult = await deps.http.getText(taxonUrl);
  if (!taxonResult.ok) return [];
  const taxonJson = parseJson(deps.http, taxonUrl, taxonResult, now);
  if (taxonJson === null) return [];
  const taxon = parseTaxon(taxonJson);
  if (taxon === null) return [];

  const rows: Candidate[] = [];
  for (const pass of passes) {
    let ranOut = true;
    for (let page = 1; page <= MAX_INAT_PAGES; page += 1) {
      const url = observationsUrl(taxon.id, page, pass);
      const result = await deps.http.getText(url);
      if (!result.ok) {
        ranOut = false;
        break;
      }
      const json = parseJson(deps.http, url, result, now);
      if (json === null) {
        ranOut = false;
        break;
      }
      const parsed = parseObservations(json);
      if (parsed.error !== null) {
        recordFailure(deps.http, url, result.status, parsed.error, now);
        ranOut = false;
        break;
      }
      rows.push(...inatCandidates(parsed.photos, target, pass, now));
      if (!pageIsFull(json)) {
        ranOut = false;
        break;
      }
    }
    if (ranOut) noteCap(context, `inat ${pass.name} listing capped at ${MAX_INAT_PAGES} pages`);
  }
  return rows;
}

/**
 * iNat fills a page to `PER_PAGE`, which is the size `observationsUrl` asks for. A page with
 * fewer observations is the last one.
 */
function pageIsFull(json: unknown): boolean {
  const root = asRecord(json);
  const results = root === null ? null : asArray(root.results);
  return results !== null && results.length >= PER_PAGE;
}

/** A cut-short listing is on the reader's screen and in run.json, never only in the code. */
function noteCap(context: FetchContext, reason: string): void {
  const message = `${context.target}: ${reason}`;
  console.error(message);
  if (!context.scope.capped.includes(message)) context.scope.capped.push(message);
}

async function download(deps: CliDeps, row: Candidate): Promise<void> {
  const result = await deps.http.getBytes(row.file_url);
  if (!result.ok || result.bytes === null) {
    // The row is still appended, so the report counts the failure and a later run retries.
    row.fetch_error = result.error ?? `status ${result.status}`;
    return;
  }
  const hash = sha256Hex(result.bytes);
  const file = path.join(deps.root, 'pipeline', 'cache', row.source_key, `${hash}.jpg`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, result.bytes);
  row.local = relative(deps.root, file);
  row.file_hash = hash;
}

function plantsIdsPath(root: string): string {
  return path.join(root, 'pipeline', 'data', 'plants_ids.json');
}

function readPlantsIds(file: string): Record<string, PlantId> {
  if (!fs.existsSync(file)) return {};
  const table = asRecord(readJson(file));
  if (table === null) throw new Error(`${file} does not hold an object.`);
  const ids: Record<string, PlantId> = {};
  for (const [symbol, value] of Object.entries(table)) {
    const row = asRecord(value);
    const id = row === null ? null : asNumber(row.id);
    const scientific = row === null ? null : asString(row.scientific);
    if (id === null || scientific === null) {
      throw new Error(`${file} entry ${symbol} needs an id and a scientific name.`);
    }
    ids[symbol] = { id, scientific };
  }
  return ids;
}

function writePlantsIds(file: string, profiles: Record<string, PlantsProfile>): void {
  const ids = readPlantsIds(file);
  for (const [symbol, profile] of Object.entries(profiles)) {
    ids[symbol] = { id: profile.plants_id, scientific: profile.scientific };
  }
  writeJson(file, sortKeys(ids));
}

/**
 * A symbol whose profile never arrived carries `no profile`. That reason replaces any reason
 * `enumerateRun` reached without a profile to read.
 */
function withNoProfile(
  dropped: { symbol: string; reason: string }[],
  symbols: string[],
): { symbol: string; reason: string }[] {
  const named = new Set(symbols);
  const rows = symbols.map((symbol) => ({ symbol, reason: NO_PROFILE }));
  for (const row of dropped) {
    if (!named.has(row.symbol)) rows.push(row);
  }
  return rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** D16: every url the run gave up on reaches the reader. */
function printFailures(deps: CliDeps): void {
  for (const failure of deps.http.failures) {
    console.error(`fetch failed: ${failure.status} ${failure.url}: ${failure.message}`);
  }
}

function recordFailure(
  http: Http,
  url: string,
  status: number,
  message: string,
  at: string,
): void {
  http.failures.push({ url, status, message, at });
}

/** A body that is not JSON is a failure row, not a silent null. */
function parseJson(http: Http, url: string, result: TextResult, at: string): unknown {
  try {
    return JSON.parse(result.body);
  } catch {
    recordFailure(http, url, result.status, 'body is not JSON', at);
    return null;
  }
}

function readJson(file: string): unknown {
  const text = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`cannot parse ${file}: ${errorMessage(error)}`);
  }
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
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: PASS, 33 tests

- [ ] **Step 11: Run the whole pipeline suite**

Run: `node --test "pipeline/tests/**/*.test.ts"`
Expected: PASS, no failures. `run.test.ts` reports 22 tests and `cli_fetch.test.ts` reports
33. The suite total is the sum of Tasks 1 to 13, so read the two new files' counts and the
`fail 0` line, not a total written here.

- [ ] **Step 12: Commit**

```bash
git add pipeline/lib/run.ts pipeline/lib/commands.ts pipeline/tests/run.test.ts pipeline/tests/cli_fetch.test.ts pipeline/tests/fixtures/plants_profile_quun.json pipeline/tests/fixtures/inat_phenology_probe.json && git commit -m "feat: add the run scope, the commands, and the fetch commands" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 14: The build, the report, and the pull request

**Files:**
- Modify: `pipeline/lib/commands.ts` (two edits, then one append)
- Modify: `pipeline/lib/storage.ts` (one append)
- Modify: `pipeline/tests/cli_fetch.test.ts` (one edit, step 7)
- Test: `pipeline/tests/cli_build.test.ts`

**Interfaces:**

- Consumes, from `pipeline/lib/commands.ts` (Task 13, the same file this task modifies):
  - `interface CliDeps { root: string; exec: Exec; http: Http; storage: Storage; resize: Resize; validate: (raw: RawContent) => ValidationResult; cdn_base: string; now: () => Date }`
  - `interface RawContent { species: Record<string, Record<string, unknown>>; concepts: { key: string; channel: string; name: string; accept: string[]; description: string }[]; units: Record<string, unknown>[]; confusion: { a: string; b: string; channel: string; a_not_b: string; b_not_a: string; ref: string }[]; manifest: ManifestRow[] }`
  - `interface ValidationMessage { file: string; message: string }`
  - `interface ValidationResult { errors: ValidationMessage[]; warnings: ValidationMessage[] }`
  - `runCommand(argv: string[], deps: CliDeps): Promise<number>`
  - `CHECK_AGENT: string` (`'photo_check_agent'`), `NO_PROFILE: string` (`'no profile'`),
    and `MAX_COMMONS_PAGES: number`. The test uses `CHECK_AGENT` for a verdict row and a
    manifest row and `MAX_COMMONS_PAGES` in the cap message it seeds, and `build` prints
    `NO_PROFILE`.
  - the module-private names `type Handler`, `COMMANDS`, `notYet`,
    `positional(rest, usage)`, `isoNow(deps)`, `relative(root, file)`,
    `writeJson(file, value)`, `sortKeys(table)`, `readJson(file)`,
    `parseJson(http, url, result, at)`, and `printFailures(deps)`. This task edits
    `COMMANDS`, deletes `notYet`, and calls the rest. It declares no second copy of any
    of them.
- Consumes, from `pipeline/lib/run.ts` (Task 13): `readRun(root, name): RunScope`,
  `runDir(root, name): string`, `gitCommitAll(exec, message): void`,
  `openPullRequest(exec, name, bodyPath): void`, `parseFlags(argv): Record<string, string>`,
  `type Exec`, `type RunScope`. `RunScope` already carries `channels: string[]`,
  `species: string[]`, `concepts: string[]`, `dropped: { symbol: string; reason: string }[]`,
  `capped: string[]`, and `fetch_failures: number`; this task adds no field. `readRun`
  checks the file with `validateScope` and throws, so a run this task reads is a whole
  scope or an error. The test also calls `newScope(name, flags, createdAt)` and
  `writeRun(root, scope)`. A concept run takes no `--channels`: `newScope` derives the
  channels from the qualified concept prefixes and throws when the flag is given, so the
  test's concept run passes `--concepts` alone.
- Consumes, from `pipeline/lib/jsonl.ts` (Task 2): `readJsonl<T>(path): T[]`,
  `appendJsonl(path, rows): void`. The test also calls `writeJsonl(path, rows)`.
- Consumes, from `pipeline/lib/candidates.ts` (Task 2): `type Candidate`. The test also
  calls `makeCandidate(fields: Partial<Candidate> & { target: string; source_key: SourceKey; origin: string; file_url: string }): Candidate`
  and reads `SOURCE_NAMES: Record<SourceKey, string>`.
- Consumes, from `pipeline/lib/verdicts.ts` (Task 9):
  `validateVerdicts(verdicts, candidates, channels): string[]`,
  `approvedVerdicts(verdicts): Verdict[]`,
  `countByTargetChannel(verdicts, candidates): Record<string, Record<string, number>>`,
  `decisionsToVerdicts(decisions, at): Verdict[]`,
  `stopRule(verdicts): { fired: boolean; judged: number; escalated: number }`,
  `type Decision`, `type Verdict`. `countByTargetChannel` counts the rows it is given, so
  the build passes `approvedVerdicts(verdicts)`.
- Consumes, from `pipeline/lib/manifest.ts` (Task 10):
  `publishApproved(input: { deps: PublishDeps; candidates: Candidate[]; verdicts: Verdict[]; rows: ManifestRow[] }): Promise<{ rows: ManifestRow[]; uploaded: string[]; skipped: string[] }>`,
  `retireRows(rows, hash, reason, at): { rows: ManifestRow[]; retired: number }`,
  `type ManifestRow`, `type PublishDeps` (`{ storage: Storage; resize: Resize; readLocal: (file: string) => Uint8Array }`).
  `publishApproved` takes the raw verdicts and applies the last-wins rule itself.
- Consumes, from `pipeline/lib/images.ts` (Task 10): `MAX_SIDE: number`,
  `JPEG_QUALITY: number`, `objectKey(hash): string`, `reviewKey(candidateId): string`,
  `type Resize`.
- Consumes, from `pipeline/lib/storage.ts` (Task 10): `type Storage`. The test also calls
  `memoryStorage(): Storage & { objects: Map<string, Uint8Array>; puts: { key: string; contentType: string }[] }`.
- Consumes, from `pipeline/lib/ids.ts` (Task 11):
  `readPublished(gitShow: (path: string) => string | null): ContentSet | null`,
  `appendOnlyErrors(previous: ContentSet | null, next: ContentSet): string[]`,
  `type ContentSet`.
- Consumes, from `pipeline/lib/report.ts` (Task 12):
  `buildGaps(species: ReportSpeciesRow[], channels: string[]): ReportGapRow[]`,
  `renderReport(data: ReportData): string`, `type ReportData`, `type ReportSpeciesRow`,
  `type ReportUnitRow` (`{ key: string; cards: number; warning: string | null }`),
  `type ReportEscalationRow`.
- Consumes, from `pipeline/lib/species.ts` (Task 7):
  `readAuthored(dir, symbol): AuthoredSpecies | null`,
  `validateAuthored(authored, symbol, conceptKeys: Set<string>): string[]`,
  `validateFetched(fetched, symbol): string[]`,
  `buildFetched(input: { profile; subordinate; states; section; inat }): FetchedSpecies`,
  `mergeSpecies(fetched, authored): SpeciesRecord`, `type SpeciesRecord`.
- Consumes, from `pipeline/lib/plants.ts` (Task 3):
  `fetchProfile(http, symbol, now): Promise<PlantsProfile | null>`,
  `fetchSubordinateTaxa(http, plantsId, now): Promise<{ key: string; name: string }[]>`,
  `fetchDistribution(http, plantsId): Promise<string[]>`, `type PlantsProfile`. The test
  also calls `profileUrl(symbol)`, `subordinateTaxaUrl(plantsId, offset)` and reads
  `DISTRIBUTION_URL`.
- Consumes, from `pipeline/lib/fna.ts` (Task 4): `loadSectionTable(path): Record<string, string>`,
  `sectionFor(table, scientific): string | null`.
- Consumes, from `pipeline/lib/inat.ts` (Task 5): `taxaUrl(scientific): string`,
  `parseTaxon(json): InatTaxon | null`, `type InatTaxon`.
- Consumes, from `pipeline/lib/http.ts` (Task 1): `type Http`. The test also uses
  `type TextResult`, `type BytesResult`, `type HttpFailure`.
- Consumes, from `app/logic/content.js` (on `main`): `loadContent(raw)`. The test also
  imports `validateContent(raw)` and passes it as `deps.validate`.
- Produces:
  - `pipeline/lib/storage.ts`: `deferredStorage(inner: Storage): Storage & { flush(): Promise<void>; pending: string[] }`
  - `pipeline/lib/commands.ts`: `runCommand(argv: string[], deps: CliDeps): Promise<number>`
    keeps its signature and now dispatches every command of the surface, with no
    placeholder left. The seven handlers Task 13 wrote as `notYet` become real: `build`,
    `report`, `run pr`, `run finish`, `images retire`, `species retire`, `ids check`.
    The command surface and the usage text do not change. Task 13 already names all
    seven, and it already writes `build <name> [--base <ref>]` and
    `ids check [--base <ref>]`. `--base` is the git ref that holds the published content,
    and it defaults to `main`. The two retire commands read `main` and take no `--base`:
    a retire is an owner's command, run on a checkout that has `main`, never a CI step.

This task writes the seven commands Task 13 left as placeholders. It changes no
signature and adds no field: `cdn_base`, `validate`, `fetch_failures`, and `capped` are
already there.

Four rules shape the code.

1. **The build works in memory and writes last.** Spec section 11 says a build that
   fails validation writes nothing to `content/` and uploads nothing. So the build
   resizes and hashes into a `deferredStorage` wrapper, runs the app validator and the
   append-only check, and flushes the uploads only when both pass.
2. **The build writes two files.** `content/species.json` and
   `content/images/manifest.json`. `content/concepts.json`, `content/units.json`, and
   `content/confusion.json` are authored inputs. The build reads them, hands them to the
   validator, and leaves them alone. A missing `concepts.json` or `units.json` is an
   error that names the file, because the build cannot invent either one.
3. **A species retires on purpose, on two paths and no others.**
   `cli species retire <SYMBOL> --reason "<text>"` sets the fields from the owner's
   reason. The build sets them when a species has manifest rows and every row is
   retired. `carryPublished` copies every published species record the run does not
   rebuild, verbatim, and adds nothing. A published record was valid when it was
   published, so a verbatim copy stays valid.
4. **The app validator owns the content rules.** The build does not recompute the
   "no image and no confusion edge" rule, and it holds no copy of the 5-to-25 card band.
   It writes a record for every species that has an authored file and a fetched layer
   that validates, then prints what the validator says.

The build calls `fetchProfile` for every species it writes, and it reads
`pipeline/data/plants_ids.json` for nothing. The table holds `{ id, scientific }` per
symbol, and `buildFetched` needs the genus, the family, the common name, the rank, and
the native status. Only the profile carries those five, so a build that skipped the
profile call would write a record with no genus, which the validator rejects. `species
list` fetched the same profile earlier in the run, so the disk cache of `http.ts` answers
the build's call without a request, and `--refresh` is the only way to make it cost one.
`species list` stays the only writer of the table, and `photos fetch` stays its only
reader, which is D12.

The build prints one line per entry of `scope.capped`, the listing caps `photos fetch`
recorded. A cap means a target may hold fewer candidates than the sources offered, so the
reader sees it again at build time. The count in the report stays the four fields Task 12
fixed, so `capped` is a printed line and not a report row.

Both retire commands follow one order: build the new set in memory, validate it, run the
append-only check, then remove the objects from storage, then write `content/` and
commit. The order matters for the case that used to deadlock. When the retired hash
carries a species' last live image, the in-memory build marks the species retired before
the validator runs, so the validator never sees a live species with no image.

`cli run pr` and `cli run finish` push the run branch and open the pull request against
`main`. Task 18 merges `pipeline` into `main` first, so `main` holds the CLI that the
run ran.

`deps.cdn_base` ends in a slash, and the report links an escalated image at
`${deps.cdn_base}${reviewKey(id)}`. A `cdn_base` without the trailing slash is a
construction error in the entry point, which Task 16 owns, not a check here.

- [ ] **Step 1: Append `deferredStorage` to `pipeline/lib/storage.ts`**

Append the block below to the end of the file. Nothing above it changes.

```ts

/**
 * Holds every put in memory until `flush`. `cli build` validates before it uploads, so a
 * build that fails sends nothing to the bucket. A remove drops the queued put for the
 * same key, so a flush never uploads an object a remove has already taken out.
 */
export function deferredStorage(
  inner: Storage,
): Storage & { flush(): Promise<void>; pending: string[] } {
  const queue: { key: string; bytes: Uint8Array; contentType: string }[] = [];
  const pending: string[] = [];

  const drop = (key: string): void => {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index].key === key) queue.splice(index, 1);
    }
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (pending[index] === key) pending.splice(index, 1);
    }
  };

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
      drop(key);
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

`pipeline/tests/cli_build.test.ts`.

Every test runs the real app validator: `deps.validate` is `validateContent` from
`app/logic/content.js`. So the fixtures carry the real shapes. `CONCEPTS` holds four rows
copied from `content/concepts.json`. `UNITS` holds the three level-1 rows from
`content/units.json` plus a level-2 and a level-3 row copied from
`content_dev/units.json`. The copied level-2 row carries `include: []`, because `PLOC` is
not in this run's pool and the validator rejects an unknown symbol there.

`fakeExec` answers `git show <ref>:<path>` from a map, and every other command from a
second map keyed by the first argument. Keying by argument, not by call order, lets one
test make `git push` fail without counting the commits before it. The fixtures under
`pipeline/tests/fixtures/` are the ones Tasks 3 and 5 wrote.

```ts
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadContent, validateContent } from '../../app/logic/content.js';
import {
  CHECK_AGENT,
  MAX_COMMONS_PAGES,
  NO_PROFILE,
  runCommand,
  type CliDeps,
} from '../lib/commands.ts';
import { SOURCE_NAMES, makeCandidate, type Candidate } from '../lib/candidates.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
import { JPEG_QUALITY, MAX_SIDE, objectKey, reviewKey, type Resize } from '../lib/images.ts';
import { taxaUrl } from '../lib/inat.ts';
import { readJsonl, writeJsonl } from '../lib/jsonl.ts';
import type { ManifestRow } from '../lib/manifest.ts';
import { DISTRIBUTION_URL, profileUrl, subordinateTaxaUrl } from '../lib/plants.ts';
import { newScope, runDir, writeRun, type Exec } from '../lib/run.ts';
import type { ReportData } from '../lib/report.ts';
import { deferredStorage, memoryStorage } from '../lib/storage.ts';
import type { Verdict } from '../lib/verdicts.ts';

const NOW = '2026-09-22T15:04:00Z';
const TODAY = '2026-09-22';
const SCIENTIFIC = 'Quercus gambelii';
const QUGA_ID = 25297;
const INAT_TAXON_ID = 47851;
const CDN = 'https://images.dendro.test/';
/** git exits 128 when a ref or a path is not there. The first run reads that as "no past". */
const GIT_BAD_REVISION = 128;

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);

// Four rows from content/concepts.json, verbatim.
const CONCEPTS = [
  {
    key: 'needles',
    channel: 'leaf',
    name: 'Needles',
    accept: ['needles', 'needle', 'needle like', 'conifer needles'],
    description: 'Narrow stiff leaves, in bundles, single along the twig, or in clusters.',
  },
  {
    key: 'simple_lobed',
    channel: 'leaf',
    name: 'Simple, lobed',
    accept: ['lobed', 'simple lobed', 'lobes'],
    description: 'One blade per stalk cut into lobes by sinuses.',
  },
  {
    key: 'furrowed',
    channel: 'bark',
    name: 'Furrowed / ridged',
    accept: ['furrowed', 'ridged', 'furrowed ridged', 'ridges'],
    description: 'Long ridges separated by deep vertical grooves.',
  },
  {
    key: 'acorn',
    channel: 'fruit',
    name: 'Acorn',
    accept: ['acorn', 'acorns'],
    description: 'A single nut seated in a scaly cup.',
  },
];

const STATES = ['CO', 'UT', 'NM', 'WY', 'NE', 'KS'];

// The three level-1 rows of content/units.json, then a level-2 and a level-3 row of
// content_dev/units.json. The copied rows carry an empty include: PLOC is not in the pool.
const UNITS: Record<string, unknown>[] = [
  { key: 'leaf_types', name: 'Leaf types', channel: 'leaf', level: 1, parent: null },
  { key: 'bark_types', name: 'Bark types', channel: 'bark', level: 1, parent: null },
  { key: 'fruit_types', name: 'Fruit types', channel: 'fruit', level: 1, parent: null },
  {
    key: 'simple_lobed_genus',
    name: 'Simple lobed leaves',
    channel: 'leaf',
    level: 2,
    parent: 'leaf_types',
    bucket: 'simple_lobed',
    states: STATES,
    include: [],
    exclude: [],
  },
  {
    key: 'simple_lobed_white_oaks_co',
    name: 'White oaks',
    channel: 'leaf',
    level: 3,
    parent: 'simple_lobed_genus',
    bucket: 'simple_lobed',
    genera: ['Quercus'],
    section: 'Quercus',
    states: STATES,
    include: [],
    exclude: [],
  },
];

const LEVEL_ONE_UNITS = UNITS.slice(0, 3);

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
  source_key: 'commons',
  origin: 'https://commons.wikimedia.org/wiki/File:Quercus_gambelii_leaf.jpg',
  file_url: 'https://upload.wikimedia.org/wikipedia/commons/8/88/Quercus_gambelii_leaf.jpg',
  author: 'A Hiker',
  license: 'CC BY-SA 4.0',
  local: 'pipeline/cache/commons/leaf.jpg',
  fetched_at: NOW,
});

const BARK = makeCandidate({
  target: 'QUGA',
  source_key: 'plants',
  origin: `https://plants.usda.gov/plant-profile/QUGA#image=quga_002_bkp.jpg`,
  file_url: 'https://plants.sc.egov.usda.gov/ImageLibrary/original/quga_002_bkp.jpg',
  author: 'USDA NRCS',
  license: 'public domain (US government work)',
  local: 'pipeline/cache/plants/bark.jpg',
  fetched_at: NOW,
});

const MYSTERY = makeCandidate({
  target: 'QUGA',
  source_key: 'inat',
  origin: 'https://www.inaturalist.org/observations/999001#photo=1',
  file_url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/999001/original.jpg',
  author: 'observer_one',
  license: 'CC BY 4.0',
  source_species: 'Quercus turbinella',
  identity_match: false,
  local: 'pipeline/cache/inat/mystery.jpg',
  fetched_at: NOW,
});

const BLUR = makeCandidate({
  target: 'QUGA',
  source_key: 'inat',
  origin: 'https://www.inaturalist.org/observations/999002#photo=2',
  file_url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/999002/original.jpg',
  author: 'observer_two',
  license: 'CC BY 4.0',
  local: 'pipeline/cache/inat/blur.jpg',
  fetched_at: NOW,
});

const CONCEPT_LEAF = makeCandidate({
  target: 'leaf/simple_lobed',
  source_key: 'commons',
  origin: 'https://commons.wikimedia.org/wiki/File:Lobed_leaf_plate.jpg',
  file_url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Lobed_leaf_plate.jpg',
  author: 'A Botanist',
  license: 'CC BY 4.0',
  local: 'pipeline/cache/commons/plate.jpg',
  fetched_at: NOW,
});

const CONCEPT_BARK = makeCandidate({
  target: 'bark/furrowed',
  source_key: 'commons',
  origin: 'https://commons.wikimedia.org/wiki/File:Furrowed_bark_plate.jpg',
  file_url: 'https://upload.wikimedia.org/wikipedia/commons/2/22/Furrowed_bark_plate.jpg',
  author: 'A Botanist',
  license: 'CC BY 4.0',
  local: 'pipeline/cache/commons/bark_plate.jpg',
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
}

interface ExecCall {
  command: string;
  args: string[];
}

type FakeExec = Exec & {
  calls: ExecCall[];
  /** Keyed by the first argument, so a test makes one subcommand fail. */
  codes: Map<string, { code: number; out: string }>;
  shows: Map<string, string>;
};

type BuildReport = Omit<ReportData, 'escalations'>;

function verdict(id: string, kind: Verdict['verdict'], extra: Partial<Verdict> = {}): Verdict {
  return {
    candidate_id: id,
    verdict: kind,
    channel: null,
    tags: [],
    case: null,
    note: '',
    checked_by: CHECK_AGENT,
    checked_at: TODAY,
    ...extra,
  };
}

/** A species record with every field the app validator requires. */
function record(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scientific: SCIENTIFIC,
    common: ['Gambel oak'],
    genus: 'Quercus',
    family: 'Fagaceae',
    section: 'Quercus',
    concepts: { leaf: 'simple_lobed', bark: 'furrowed', fruit: 'acorn' },
    varieties: [],
    ...fields,
  };
}

/** A live manifest row with every field the app validator requires. */
function row(
  fields: Partial<ManifestRow> & { hash: string; target: string; channel: string },
): ManifestRow {
  return {
    source: SOURCE_NAMES.commons,
    author: 'A Hiker',
    license: 'CC BY-SA 4.0',
    origin: LEAF.origin,
    tags: [],
    checked_by: CHECK_AGENT,
    checked_at: TODAY,
    note: '',
    ...fields,
  } as ManifestRow;
}

function fixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function fakeExec(): FakeExec {
  const calls: ExecCall[] = [];
  const codes = new Map<string, { code: number; out: string }>();
  const shows = new Map<string, string>();
  const exec = (command: string, args: string[]): { code: number; out: string } => {
    calls.push({ command, args });
    if (command === 'git' && args[0] === 'show') {
      const text = shows.get(args[1]);
      if (text === undefined) {
        return { code: GIT_BAD_REVISION, out: `fatal: path ${args[1]} does not exist` };
      }
      return { code: 0, out: text };
    }
    return codes.get(args[0]) ?? { code: 0, out: '' };
  };
  return Object.assign(exec, { calls, codes, shows });
}

/** Seeds what `git show <base>:content/...` returns, so the append-only check has a past. */
function fakeGitShow(
  exec: FakeExec,
  base: string,
  content: {
    species?: Record<string, unknown>;
    concepts?: unknown[];
    units?: unknown[];
    confusion?: unknown[];
    manifest?: unknown[];
  },
): void {
  const files: Record<string, unknown> = {
    'species.json': content.species ?? {},
    'concepts.json': content.concepts ?? CONCEPTS,
    'units.json': content.units ?? UNITS,
    'confusion.json': content.confusion ?? [],
    'images/manifest.json': content.manifest ?? [],
  };
  for (const [name, value] of Object.entries(files)) {
    exec.shows.set(`${base}:content/${name}`, JSON.stringify(value));
  }
}

function fakeHttp(routes: Map<string, Route>): Http & { urls: string[] } {
  const urls: string[] = [];
  const failures: HttpFailure[] = [];

  function text(key: string, url: string): TextResult {
    const route = routes.get(key);
    if (route === undefined || route.body === undefined) {
      failures.push({ url, status: 0, message: 'the fake has no route for this url', at: NOW });
      return { ok: false, status: 0, body: '', fromCache: false, error: 'no route' };
    }
    const status = route.status ?? 200;
    if (status >= 400) {
      return { ok: false, status, body: '', fromCache: false, error: `status ${status}` };
    }
    return { ok: true, status, body: route.body, fromCache: false, error: null };
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
      return { ok: false, status: 0, bytes: null, fromCache: false, error: 'no bytes route' };
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
  const http = fakeHttp(routes);
  const deps: CliDeps = {
    root,
    exec,
    http,
    storage,
    resize,
    cdn_base: CDN,
    validate: validateContent,
    now: () => new Date(NOW),
  };
  return { root, deps, exec, http, storage, resize, out, err };
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

function readText(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');
}

function exists(root: string, rel: string): boolean {
  return fs.existsSync(path.join(root, ...rel.split('/')));
}

function remove(root: string, rel: string): void {
  fs.rmSync(path.join(root, ...rel.split('/')));
}

interface SeedOptions {
  candidates?: Candidate[];
  verdicts?: Verdict[];
  manifest?: ManifestRow[];
  confusion?: Record<string, unknown>[];
  authored?: Record<string, unknown>;
  species?: string[];
  units?: Record<string, unknown>[];
  conceptRun?: string[];
  fetchFailures?: number;
  capped?: string[];
}

function seed(root: string, options: SeedOptions = {}): void {
  writeJson(root, 'pipeline/data/quercus_sections.json', { [SCIENTIFIC]: 'Quercus' });
  writeJson(root, 'content/concepts.json', CONCEPTS);
  writeJson(root, 'content/units.json', options.units ?? UNITS);
  if (options.confusion !== undefined) writeJson(root, 'content/confusion.json', options.confusion);
  if (options.manifest !== undefined) {
    writeJson(root, 'content/images/manifest.json', options.manifest);
  }
  writeJson(root, 'content_src/species/QUGA.json', options.authored ?? AUTHORED);

  // A bucket run names its channels. A concept run derives them from the key prefixes.
  const flags =
    options.conceptRun === undefined
      ? { bucket: 'simple_lobed', channels: options.channels ?? 'leaf,bark' }
      : { concepts: options.conceptRun.join(',') };
  const scope = newScope('demo', flags, NOW);
  scope.species = options.conceptRun === undefined ? (options.species ?? ['QUGA']) : [];
  scope.dropped = [{ symbol: 'QUUN', reason: 'hybrid' }];
  scope.fetch_failures = options.fetchFailures ?? 0;
  scope.capped = options.capped ?? [];
  writeRun(root, scope);

  const candidates = options.candidates ?? CANDIDATES;
  const dir = runDir(root, 'demo');
  writeJsonl(path.join(dir, 'candidates.jsonl'), candidates);
  writeJsonl(path.join(dir, 'verdicts.jsonl'), options.verdicts ?? VERDICTS);

  candidates.forEach((candidate, index) => {
    if (candidate.local === null) return;
    write(root, candidate.local, '');
    fs.writeFileSync(
      path.join(root, ...candidate.local.split('/')),
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

function buildOf(root: string): BuildReport {
  return readJson<BuildReport>(root, 'pipeline/runs/demo/build.json');
}

function called(exec: FakeExec, command: string, first: string): ExecCall | undefined {
  return exec.calls.find((call) => call.command === command && call.args[0] === first);
}

function shown(exec: FakeExec): string[] {
  return exec.calls
    .filter((call) => call.command === 'git' && call.args[0] === 'show')
    .map((call) => call.args[1]);
}

function keysOf(storage: { puts: { key: string; contentType: string }[] }): string[] {
  return storage.puts.map((put) => put.key);
}

test('build writes species.json and the manifest, uploads the resized bytes, and commits', async (t) => {
  const { root, deps, exec, storage, resize, out, err } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const species = speciesOf(root);
  assert.deepEqual(Object.keys(species), ['QUGA']);
  assert.equal(species.QUGA.scientific, SCIENTIFIC);
  assert.equal(species.QUGA.section, 'Quercus');
  assert.equal(species.QUGA.inat_taxon_id, INAT_TAXON_ID);
  assert.deepEqual(species.QUGA.common, ['Gambel oak', 'Rocky Mountain white oak']);
  assert.deepEqual(species.QUGA.range, {
    text: 'Colorado Plateau and southern Rockies',
    states: ['AZ', 'CO', 'NM', 'UT'],
  });

  const rows = manifestOf(root);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.channel).sort(), ['bark', 'leaf']);
  assert.equal(rows[0].source, SOURCE_NAMES.commons);
  for (const one of rows) assert.match(one.hash, /^[0-9a-f]{64}$/);

  // The build owns two files. The other three are authored inputs.
  assert.equal(exists(root, 'content/confusion.json'), false);
  assert.deepEqual(readJson<unknown[]>(root, 'content/units.json'), UNITS);

  assert.equal(storage.puts.length, 2);
  for (const put of storage.puts) {
    assert.match(put.key, /^img\/[0-9a-f]{64}\.jpg$/);
    assert.equal(put.contentType, 'image/jpeg');
  }
  assert.deepEqual(resize.calls, [
    { maxSide: MAX_SIDE, quality: JPEG_QUALITY },
    { maxSide: MAX_SIDE, quality: JPEG_QUALITY },
  ]);

  const commit = called(exec, 'git', 'commit');
  assert.ok(commit !== undefined);
  assert.ok(commit.args.includes('content: build demo'));
  assert.ok(out.join('\n').includes('1 species'));

  const text = readText(root, 'content/species.json');
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.includes('\n  "QUGA"'));
});

test('a validator error writes no content file and uploads nothing', async (t) => {
  const { root, deps, storage, err } = setup(t);
  seed(root);
  deps.validate = () => ({
    errors: [{ file: 'species.json', message: 'QUGA has no habitat' }],
    warnings: [],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.deepEqual(storage.puts, []);
  assert.equal(exists(root, 'content/species.json'), false);
  assert.equal(exists(root, 'content/images/manifest.json'), false);
  assert.equal(exists(root, 'pipeline/runs/demo/build.json'), false);
  assert.ok(err.includes('error species.json: QUGA has no habitat'));
});

test('an unknown species in a confusion edge fails the build with the validator message', async (t) => {
  const { root, deps, storage, err } = setup(t);
  seed(root, {
    confusion: [
      {
        a: 'QUGA',
        b: 'QUTU',
        channel: 'leaf',
        a_not_b: 'Lobes are rounded.',
        b_not_a: 'Leaves are holly like.',
        ref: 'FNA vol. 3',
      },
    ],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.ok(err.includes('error confusion.json: unknown species QUTU'));
  assert.deepEqual(storage.puts, []);
  assert.equal(exists(root, 'content/species.json'), false);
});

test('a verdict on a channel outside the run stops the build before it uploads', async (t) => {
  const { root, deps, storage, err } = setup(t);
  seed(root, {
    verdicts: [verdict(LEAF.id, 'approve', { channel: 'twig', note: 'Wrong channel.' })],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.deepEqual(storage.puts, []);
  assert.equal(exists(root, 'content/species.json'), false);
  assert.ok(err.join('\n').includes('twig'));
});

test('a failed append-only check writes nothing and names the missing id', async (t) => {
  const { root, deps, exec, storage, err } = setup(t);
  seed(root);
  fakeGitShow(exec, 'main', { manifest: [{ hash: HASH_A, target: 'QUGA', channel: 'leaf' }] });

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.deepEqual(storage.puts, []);
  assert.equal(exists(root, 'content/species.json'), false);
  assert.ok(err.join('\n').includes(`image:${HASH_A}|QUGA|leaf`));
  assert.ok(err.join('\n').includes('images/manifest.json'));
});

test('a first run with no published content succeeds', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  // Every git show answered 128, so readPublished reported no past.
  assert.ok(shown(exec).includes('main:content/species.json'));
  assert.deepEqual(Object.keys(speciesOf(root)), ['QUGA']);
});

test('a published species the run does not rebuild is copied verbatim', async (t) => {
  const { root, deps, exec, err } = setup(t);
  const qual = record({
    scientific: 'Quercus alba',
    common: ['white oak'],
    section: null,
    concepts: { leaf: 'simple_lobed' },
  });
  const qualRow = row({ hash: HASH_B, target: 'QUAL', channel: 'leaf' });
  seed(root, { manifest: [qualRow] });
  fakeGitShow(exec, 'main', { species: { QUAL: qual }, manifest: [qualRow] });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const species = speciesOf(root);
  assert.deepEqual(Object.keys(species), ['QUAL', 'QUGA']);
  assert.deepEqual(species.QUAL, qual);
  assert.equal(species.QUAL.retired, undefined);
  assert.equal(species.QUGA.retired, undefined);
});

test('a species whose every manifest row is retired gains retired true', async (t) => {
  const { root, deps, err } = setup(t);
  seed(root, {
    manifest: [
      row({
        hash: HASH_B,
        target: 'QUGA',
        channel: 'leaf',
        retired: true,
        retired_reason: 'takedown request',
        retired_at: '2026-09-01',
      }),
    ],
    verdicts: [verdict(MYSTERY.id, 'escalate', { case: 'quality', note: 'Blurred.' })],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const species = speciesOf(root);
  assert.equal(species.QUGA.retired, true);
  assert.equal(species.QUGA.retired_reason, 'every approved image was retired');
  assert.equal(species.QUGA.retired_at, TODAY);
  assert.equal(manifestOf(root).length, 1);
  assert.equal(buildOf(root).species[0].status, 'no_photos');
});

test('an authored file with a missing required field stops the build', async (t) => {
  const { root, deps, storage, err } = setup(t);
  const broken: Record<string, unknown> = { ...AUTHORED };
  delete broken.habitat;
  seed(root, { authored: broken });

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.deepEqual(err, ['QUGA: missing required field habitat']);
  assert.deepEqual(storage.puts, []);
  assert.equal(exists(root, 'content/species.json'), false);
});

test('a species with no authored file is reported not_authored and is not written', async (t) => {
  const { root, deps, http, err } = setup(t);
  seed(root, { species: ['QUGA', 'QUAL'] });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  assert.deepEqual(Object.keys(speciesOf(root)), ['QUGA']);
  const rows = buildOf(root).species;
  assert.deepEqual(
    rows.map((one) => [one.symbol, one.status]),
    [
      ['QUGA', 'included'],
      ['QUAL', 'not_authored'],
    ],
  );
  // No authored file means no fetch, so nothing asked PLANTS about QUAL.
  assert.equal(
    http.urls.some((url) => url.includes('QUAL')),
    false,
  );
});

test('a species whose profile fetch fails stops the build', async (t) => {
  const { root, deps, storage, err } = setup(t);
  seed(root, { species: ['QUGA', 'QUAL'] });
  writeJson(root, 'content_src/species/QUAL.json', AUTHORED);

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.ok(err.includes(`QUAL: ${NO_PROFILE}. The build stopped.`));
  assert.deepEqual(storage.puts, []);
  assert.equal(exists(root, 'content/species.json'), false);
});

test('a missing content/units.json is an error that names the file', async (t) => {
  const { root, deps, err } = setup(t);
  seed(root);
  remove(root, 'content/units.json');

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.deepEqual(err, ['content/units.json is missing']);
  assert.equal(exists(root, 'content/species.json'), false);
});

test('build.json holds one row per run target with per-channel counts', async (t) => {
  const { root, deps, out, err } = setup(t);
  const cap = `QUGA: commons listing capped at ${MAX_COMMONS_PAGES} pages`;
  seed(root, { fetchFailures: 2, capped: [cap] });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  // photos fetch recorded the cap in run.json. The build says it again.
  assert.ok(out.includes(`capped: ${cap}`));

  const data = buildOf(root);
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
  // The count belongs to the fetch step. A rebuild reads it and never changes it.
  assert.equal(data.counts.fetch_failures, 2);
  assert.equal(data.counts.stop_rule_fired, false);
});

test('every unit gets a row, and the card count is the one the app derives', async (t) => {
  const { root, deps, out, err } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const raw = {
    species: speciesOf(root),
    concepts: CONCEPTS,
    units: UNITS,
    confusion: [],
    manifest: manifestOf(root),
  };
  const loaded = loadContent(raw);
  assert.equal(loaded.ok, true);

  const rows = buildOf(root).units;
  assert.deepEqual(
    rows.map((one) => one.key),
    UNITS.map((unit) => unit.key),
  );
  for (const one of rows) {
    assert.equal(one.cards, loaded.content.unit_cards[one.key].length);
    assert.ok(one.warning !== null && one.warning.startsWith(`${one.key} holds `));
  }
  assert.equal(rows.find((one) => one.key === 'fruit_types')?.cards, 0);
  assert.equal(rows.find((one) => one.key === 'leaf_types')?.cards, 1);
  // The band lives in the app. The build prints what the validator said.
  assert.ok(out.join('\n').includes('warning units.json: leaf_types holds 1 cards'));
});

test('a unit row carries a null warning when the validator warns about nothing', async (t) => {
  const { root, deps, err } = setup(t);
  seed(root);
  deps.validate = () => ({ errors: [], warnings: [] });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const rows = buildOf(root).units;
  assert.equal(rows.length, UNITS.length);
  for (const one of rows) assert.equal(one.warning, null);
  assert.equal(rows.find((one) => one.key === 'leaf_types')?.cards, 1);
});

test('an iNat taxon miss prints a line and the species row names it', async (t) => {
  const routes = defaultRoutes();
  routes.set(taxaUrl(SCIENTIFIC), { status: 404 });
  const { root, deps, err } = setup(t, routes);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  assert.ok(err.includes('QUGA: no iNat taxon'));
  assert.equal(speciesOf(root).QUGA.inat_taxon_id, null);
  assert.equal(buildOf(root).species[0].reason, 'no iNat taxon');
});

test('a second build over the same verdicts uploads nothing new', async (t) => {
  const { root, deps, storage, err } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));
  const first = keysOf(storage);
  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  assert.deepEqual(keysOf(storage), first);
  assert.equal(manifestOf(root).length, 2);
});

test('a concept run writes manifest rows whose target is the qualified key', async (t) => {
  const { root, deps, err } = setup(t);
  seed(root, {
    conceptRun: ['leaf/simple_lobed', 'bark/furrowed'],
    units: LEVEL_ONE_UNITS,
    candidates: [CONCEPT_LEAF, CONCEPT_BARK],
    verdicts: [
      verdict(CONCEPT_LEAF.id, 'approve', { channel: 'leaf', note: 'A clean plate.' }),
      verdict(CONCEPT_BARK.id, 'approve', { channel: 'bark', note: 'Ridges are sharp.' }),
    ],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  assert.deepEqual(speciesOf(root), {});
  const rows = manifestOf(root);
  assert.deepEqual(
    rows.map((one) => [one.target, one.channel]),
    [
      ['leaf/simple_lobed', 'leaf'],
      ['bark/furrowed', 'bark'],
    ],
  );
  const data = buildOf(root);
  // The run named no channel. The two key prefixes are the whole list.
  assert.deepEqual(data.channels, ['leaf', 'bark']);
  assert.deepEqual(data.species.slice(0, 2), [
    { symbol: 'leaf/simple_lobed', status: 'included', reason: null, counts: { leaf: 1 } },
    { symbol: 'bark/furrowed', status: 'included', reason: null, counts: { bark: 1 } },
  ]);
});

test('report writes report.md, uploads each escalated candidate, and links it through cdn_base', async (t) => {
  const { root, deps, storage, exec, err } = setup(t);
  seed(root, {
    candidates: [...CANDIDATES, BLUR],
    verdicts: [...VERDICTS, verdict(BLUR.id, 'escalate', { case: 'quality', note: 'Blurred.' })],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));
  assert.equal(await runCommand(['report', 'demo'], deps), 0, err.join(' | '));

  assert.ok(keysOf(storage).includes(reviewKey(MYSTERY.id)));
  assert.ok(keysOf(storage).includes(reviewKey(BLUR.id)));

  const text = readText(root, 'pipeline/runs/demo/report.md');
  assert.ok(text.startsWith('# Content run: demo'));
  assert.ok(text.includes(`${CDN}${reviewKey(MYSTERY.id)}`));
  assert.ok(text.includes(`${CDN}${reviewKey(BLUR.id)}`));
  assert.equal(text.split(`${CDN}review/`).length - 1, 2);
  assert.ok(text.includes('The source page names Quercus turbinella.'));
  assert.ok(text.includes(MYSTERY.origin));
  assert.ok(text.includes('mismatch'));
  for (const unit of UNITS) assert.ok(text.includes(String(unit.key)));
  assert.equal(exec.calls.filter((call) => call.args[0] === 'commit').length, 2);
});

test('report without a build.json says to run build first', async (t) => {
  const { root, deps, err } = setup(t);
  seed(root);

  assert.equal(await runCommand(['report', 'demo'], deps), 1);
  writeJson(root, 'pipeline/runs/demo/build.json', null);
  assert.equal(await runCommand(['report', 'demo'], deps), 1);

  assert.deepEqual(err, [
    'run demo has no build.json; run build first',
    'run demo has no build.json; run build first',
  ]);
});

test('run pr pushes and opens a draft pull request', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));
  assert.equal(await runCommand(['report', 'demo'], deps), 0, err.join(' | '));
  assert.equal(await runCommand(['run', 'pr', 'demo'], deps), 0, err.join(' | '));

  const push = called(exec, 'git', 'push');
  assert.ok(push !== undefined);
  assert.deepEqual(push.args, ['push', '-u', 'origin', 'content/demo']);

  const pr = called(exec, 'gh', 'pr');
  assert.ok(pr !== undefined);
  assert.deepEqual(pr.args.slice(0, 5), ['pr', 'create', '--draft', '--title', 'content: demo']);
  assert.ok(pr.args.includes(path.join(runDir(root, 'demo'), 'report.md')));
});

test('run pr without a report says to run report first', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);

  assert.equal(await runCommand(['run', 'pr', 'demo'], deps), 1);

  assert.equal(called(exec, 'git', 'push'), undefined);
  assert.deepEqual(err, ['run demo has no report.md; run report first']);
});

test('run pr exits 1 when git push fails', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);
  write(root, 'pipeline/runs/demo/report.md', '# Content run: demo\n');
  exec.codes.set('push', { code: 1, out: 'fatal: no upstream' });

  assert.equal(await runCommand(['run', 'pr', 'demo'], deps), 1);

  assert.ok(err.join('\n').includes('git push failed with code 1'));
  assert.equal(called(exec, 'gh', 'pr'), undefined);
});

test('run finish turns decisions into owner verdicts and rebuilds', async (t) => {
  const { root, deps, exec, out, err } = setup(t);
  seed(root);
  writeJson(root, 'pipeline/runs/demo/decisions.json', {
    [MYSTERY.id]: { decision: 'approve', channel: 'bark', note: 'The tagged tree.' },
  });

  assert.equal(await runCommand(['run', 'finish', 'demo'], deps), 0, err.join(' | '));

  const verdicts = readJsonl<Verdict>(path.join(runDir(root, 'demo'), 'verdicts.jsonl'));
  assert.equal(verdicts.length, 4);
  assert.equal(verdicts[3].candidate_id, MYSTERY.id);
  assert.equal(verdicts[3].verdict, 'approve');
  assert.equal(verdicts[3].channel, 'bark');
  assert.equal(verdicts[3].checked_by, 'owner');
  assert.equal(verdicts[3].checked_at, TODAY);

  const rows = manifestOf(root);
  assert.equal(rows.length, 3);
  assert.equal(rows[2].channel, 'bark');
  assert.equal(rows[2].checked_by, 'owner');

  const text = readText(root, 'pipeline/runs/demo/report.md');
  assert.ok(text.includes('No escalations.'));
  assert.ok(called(exec, 'git', 'push') !== undefined);
  assert.ok(out.join('\n').includes('1 decision'));
});

test('run finish rejects a decision on a candidate the run does not hold', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);
  writeJson(root, 'pipeline/runs/demo/decisions.json', {
    nosuchid: { decision: 'approve', channel: 'leaf' },
  });

  assert.equal(await runCommand(['run', 'finish', 'demo'], deps), 1);

  assert.ok(err.join('\n').includes('nosuchid'));
  // The file is append-only, so a rejected decision must not reach it.
  assert.equal(readJsonl<Verdict>(path.join(runDir(root, 'demo'), 'verdicts.jsonl')).length, 3);
  assert.equal(called(exec, 'git', 'push'), undefined);
});

test('run finish with no decisions.json returns 0 and runs no git command', async (t) => {
  const { root, deps, exec, out } = setup(t);
  seed(root);

  assert.equal(await runCommand(['run', 'finish', 'demo'], deps), 0);

  assert.deepEqual(out, ['no decisions to apply']);
  assert.deepEqual(exec.calls, []);
});

test('images retire retires the row, removes the object, and keeps the other row', async (t) => {
  const { root, deps, exec, storage, out, err } = setup(t);
  seed(root, {
    manifest: [
      row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' }),
      row({ hash: HASH_D, target: 'QUGA', channel: 'bark' }),
    ],
  });
  writeJson(root, 'content/species.json', { QUGA: record() });
  await storage.put(objectKey(HASH_C), new Uint8Array([1]), 'image/jpeg');
  await storage.put(objectKey(HASH_D), new Uint8Array([2]), 'image/jpeg');

  const code = await runCommand(
    ['images', 'retire', HASH_C, '--reason', 'Takedown email.'],
    deps,
  );
  assert.equal(code, 0, err.join(' | '));

  assert.equal(storage.objects.has(objectKey(HASH_C)), false);
  assert.equal(storage.objects.has(objectKey(HASH_D)), true);
  const rows = manifestOf(root);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].retired, true);
  assert.equal(rows[0].retired_reason, 'Takedown email.');
  assert.equal(rows[0].retired_at, TODAY);
  assert.equal(rows[1].retired, undefined);
  assert.equal(speciesOf(root).QUGA.retired, undefined);
  const commit = called(exec, 'git', 'commit');
  assert.ok(commit !== undefined);
  assert.ok(commit.args.includes(`content: retire image ${HASH_C}`));
  assert.ok(out.join('\n').includes('1 manifest row retired'));
});

test('images retire without a reason, and on an unknown hash, changes nothing', async (t) => {
  const { root, deps, exec, storage, err } = setup(t);
  seed(root, { manifest: [row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' })] });
  writeJson(root, 'content/species.json', { QUGA: record() });
  await storage.put(objectKey(HASH_C), new Uint8Array([1]), 'image/jpeg');

  assert.equal(await runCommand(['images', 'retire', HASH_C], deps), 1);
  assert.equal(
    await runCommand(['images', 'retire', HASH_A, '--reason', 'Takedown email.'], deps),
    1,
  );

  assert.deepEqual(err, [
    'images retire needs --reason "<text>"',
    `no manifest row carries hash ${HASH_A}`,
  ]);
  assert.equal(manifestOf(root)[0].retired, undefined);
  assert.equal(storage.objects.has(objectKey(HASH_C)), true);
  assert.equal(called(exec, 'git', 'commit'), undefined);
});

test('images retire of the last live image retires the species too', async (t) => {
  const { root, deps, storage, err } = setup(t);
  seed(root, { manifest: [row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' })] });
  writeJson(root, 'content/species.json', { QUGA: record() });
  await storage.put(objectKey(HASH_C), new Uint8Array([1]), 'image/jpeg');

  const code = await runCommand(
    ['images', 'retire', HASH_C, '--reason', 'Takedown email.'],
    deps,
  );
  assert.equal(code, 0, err.join(' | '));

  const species = speciesOf(root);
  assert.equal(species.QUGA.retired, true);
  assert.equal(species.QUGA.retired_reason, 'every approved image was retired');
  assert.equal(species.QUGA.retired_at, TODAY);
  assert.equal(manifestOf(root)[0].retired_reason, 'Takedown email.');
  assert.equal(storage.objects.has(objectKey(HASH_C)), false);
});

test('species retire marks the record, retires its rows, and removes the objects', async (t) => {
  const { root, deps, exec, storage, out, err } = setup(t);
  seed(root, {
    manifest: [
      row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' }),
      row({ hash: HASH_D, target: 'QUGA', channel: 'bark' }),
    ],
  });
  writeJson(root, 'content/species.json', { QUGA: record() });
  await storage.put(objectKey(HASH_C), new Uint8Array([1]), 'image/jpeg');
  await storage.put(objectKey(HASH_D), new Uint8Array([2]), 'image/jpeg');

  const code = await runCommand(
    ['species', 'retire', 'QUGA', '--reason', 'The record duplicates QUGAX.'],
    deps,
  );
  assert.equal(code, 0, err.join(' | '));

  const species = speciesOf(root);
  assert.equal(species.QUGA.retired, true);
  assert.equal(species.QUGA.retired_reason, 'The record duplicates QUGAX.');
  assert.equal(species.QUGA.retired_at, TODAY);
  assert.equal(species.QUGA.scientific, SCIENTIFIC);
  for (const one of manifestOf(root)) {
    assert.equal(one.retired, true);
    assert.equal(one.retired_reason, 'The record duplicates QUGAX.');
  }
  assert.equal(storage.objects.size, 0);
  const commit = called(exec, 'git', 'commit');
  assert.ok(commit !== undefined);
  assert.ok(commit.args.includes('content: retire species QUGA'));
  assert.ok(out.join('\n').includes('QUGA retired'));
});

test('species retire on an unknown symbol exits 1', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root, { manifest: [row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' })] });
  writeJson(root, 'content/species.json', { QUGA: record() });

  assert.equal(
    await runCommand(['species', 'retire', 'QUAL', '--reason', 'Wrong symbol.'], deps),
    1,
  );

  assert.deepEqual(err, ['species.json has no record QUAL']);
  assert.equal(manifestOf(root)[0].retired, undefined);
  assert.equal(called(exec, 'git', 'commit'), undefined);
});

test('ids check passes on append-only content and fails on a missing id', async (t) => {
  const { root, deps, exec, out, err } = setup(t);
  seed(root);
  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  fakeGitShow(exec, 'main', { species: {} });
  assert.equal(await runCommand(['ids', 'check'], deps), 0, err.join(' | '));
  assert.ok(out.join('\n').includes('content ids are append-only'));

  fakeGitShow(exec, 'main', { species: { QUAL: record({ scientific: 'Quercus alba' }) } });
  assert.equal(await runCommand(['ids', 'check'], deps), 1);
  assert.ok(err.join('\n').includes('species:QUAL'));
  assert.ok(err.join('\n').includes('species.json'));
});

test('ids check reads main by default and the --base ref when it is given', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);
  fakeGitShow(exec, 'main', { species: {} });
  fakeGitShow(exec, 'origin/main', { species: {} });

  assert.equal(await runCommand(['ids', 'check'], deps), 0, err.join(' | '));
  assert.ok(shown(exec).includes('main:content/species.json'));
  assert.equal(
    shown(exec).some((arg) => arg.startsWith('origin/main:')),
    false,
  );

  assert.equal(await runCommand(['ids', 'check', '--base', 'origin/main'], deps), 0);
  assert.ok(shown(exec).includes('origin/main:content/species.json'));
});

test('build --base reads the published content from that ref', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);
  fakeGitShow(exec, 'origin/main', { species: {} });

  assert.equal(await runCommand(['build', 'demo', '--base', 'origin/main'], deps), 0, err.join(' | '));

  assert.ok(shown(exec).includes('origin/main:content/species.json'));
  assert.equal(
    shown(exec).some((arg) => arg.startsWith('main:')),
    false,
  );
});

test('deferredStorage queues, answers head, drops a removed put, and flushes in order', async (t) => {
  void t;
  const inner = memoryStorage();
  const deferred = deferredStorage(inner);

  await deferred.put('img/one.jpg', new Uint8Array([1]), 'image/jpeg');
  await deferred.put('img/two.jpg', new Uint8Array([2]), 'image/jpeg');
  await deferred.put('img/three.jpg', new Uint8Array([3]), 'image/jpeg');

  assert.deepEqual(deferred.pending, ['img/one.jpg', 'img/two.jpg', 'img/three.jpg']);
  assert.deepEqual(inner.puts, []);
  assert.equal(await deferred.head('img/one.jpg'), true);
  assert.equal(await deferred.head('img/four.jpg'), false);

  // A remove inside the same build drops the queued put, so the flush never revives it.
  await deferred.remove('img/three.jpg');
  assert.deepEqual(deferred.pending, ['img/one.jpg', 'img/two.jpg']);
  assert.equal(await deferred.head('img/three.jpg'), false);

  await deferred.flush();

  assert.deepEqual(
    inner.puts.map((put) => put.key),
    ['img/one.jpg', 'img/two.jpg'],
  );
  assert.deepEqual([...inner.objects.get('img/two.jpg')!], [2]);
  assert.deepEqual(deferred.pending, []);

  await deferred.flush();
  assert.equal(inner.puts.length, 2);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test pipeline/tests/cli_build.test.ts`

Expected: FAIL, 34 of 35 tests. The module loads, because every import already exists.
The one pass is `deferredStorage queues, answers head, drops a removed put, and flushes in
order`, which step 1 made work.

The 34 failures split in two, and no other way:

- 21 tests fail on `assert.equal(await runCommand(...), 0)`. Task 13's placeholder
  returns 1.
- 13 tests assert an exit code of 1, which the placeholder also returns, so they reach
  the next assertion and fail there on the message. Every one of those messages is
  `not implemented yet: <command>`. `species retire` is one of them: Task 13's table
  already names it and points it at the placeholder, so that test fails on the message
  too, not on the usage text.

The first failure reads:

```
not ok 1 - build writes species.json and the manifest, uploads the resized bytes, and commits
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

- [ ] **Step 4: Point the dispatch table at the new handlers**

Two edits to `pipeline/lib/commands.ts` with the Edit tool. The usage text needs none:
Task 13 already names all seven commands and already writes the two `--base` flags.

Edit 1. The seven placeholder entries become seven real ones. The old text is the tail of
Task 13's `COMMANDS` table, verbatim.

Old:

```ts
  build: notYet('build'),
  report: notYet('report'),
  'run pr': notYet('run pr'),
  'run finish': notYet('run finish'),
  'images retire': notYet('images retire'),
  'species retire': notYet('species retire'),
  'ids check': notYet('ids check'),
```

New:

```ts
  build,
  report,
  'run pr': runPr,
  'run finish': runFinish,
  'images retire': imagesRetire,
  'species retire': speciesRetire,
  'ids check': idsCheck,
```

Edit 2. The placeholder itself goes, and so does the comment that promised it. `type
Handler` stays: the table's own type still uses it.

Old:

```ts
function notYet(name: string): Handler {
  return async () => {
    console.error(`not implemented yet: ${name}`);
    return 1;
  };
}

// Every command of the surface is named here. Task 14 replaces the last seven.
```

New:

```ts
// Every command of the surface is named here.
```

- [ ] **Step 5: Append the seven handlers to `pipeline/lib/commands.ts`**

First widen the import block at the top of the file. Task 13 already imports from six of
these modules, so each line below adds names to a line that is there. `loadContent` is
the app's own loader, so the build's card count and the app's card count are one number
by construction.

Add these names to the import Task 13 already wrote for that module:

| Module | Names to add |
|---|---|
| `./fna.ts` | `loadSectionTable`, `sectionFor` |
| `./images.ts` | `JPEG_QUALITY`, `MAX_SIDE`, `objectKey`, `reviewKey` |
| `./inat.ts` | `type InatTaxon` |
| `./manifest.ts` | `publishApproved`, `retireRows` (the line already imports `type ManifestRow`) |
| `./plants.ts` | `fetchSubordinateTaxa` |
| `./run.ts` | `openPullRequest` |
| `./species.ts` | `buildFetched`, `mergeSpecies`, `readAuthored`, `validateAuthored`, `validateFetched`, `type SpeciesRecord` |
| `./storage.ts` | `deferredStorage` |
| `./verdicts.ts` | `decisionsToVerdicts`, `stopRule`, `validateVerdicts`, `type Decision` |

Then add these three import lines, one module each, in the block's alphabetical order:

```ts
import { loadContent } from '../../app/logic/content.js';
import { appendOnlyErrors, readPublished, type ContentSet } from './ids.ts';
import {
  buildGaps,
  renderReport,
  type ReportData,
  type ReportEscalationRow,
  type ReportSpeciesRow,
  type ReportUnitRow,
} from './report.ts';
```

`CHECK_AGENT` and `NO_PROFILE` are Task 13's own exported constants in this file, so the
code below names them and declares no second copy. `NO_PROFILE` is the text `no profile`,
which `enumerateRun` and `photos fetch` already print.

Task 13 already imports `fs`, `path`, `readJsonl`, `appendJsonl`, `readRun`, `runDir`,
`gitCommitAll`, `parseFlags`, `approvedVerdicts`, `countByTargetChannel`, `fetchProfile`,
`fetchDistribution`, `taxaUrl`, `parseTaxon`, `type Candidate`, `type Verdict`,
`type RunScope`, `type Storage`, `type Http`, and `type TextResult`. The code below uses
each of them and imports none of them a second time. It also calls Task 13's own
`printFailures`, `parseJson`, `readJson`, `sortKeys`, `writeJson`, `relative`,
`positional`, and `isoNow`, and declares no twin of any of them. `errorMessage` stays
Task 13's: `runCommand` already prints it for every error this task throws. `CliDeps`, `RawContent`, `ValidationMessage`, and `ValidationResult`
are declared in this same file, so they need no import at all.

Now append the block below to the end of the file.

Every side effect still arrives as a parameter: the network, the clock, the bucket, and
the resizer are on `deps`. Disk is not injected. A function that touches a file takes
the path, and `deps.root` is the only root any of them reads.

```ts

const MANIFEST_NAME = path.join('images', 'manifest.json');
const DEFAULT_BASE = 'main';
const IMAGES_RETIRED = 'every approved image was retired';
const MISSING_FILE = 'the local file is missing';
const NO_INAT_TAXON = 'no iNat taxon';
const CONCEPT_STATUS = { status: 'included', reason: null };

type BuildReport = Omit<ReportData, 'escalations'>;

/** What `loadContent` hands back. The app module carries no types of its own. */
interface LoadedContent {
  unit_cards: Record<string, string[]>;
}

interface LoadResult {
  ok: boolean;
  content: LoadedContent | null;
  errors: ValidationMessage[];
}

interface SpeciesStatus {
  status: string;
  reason: string | null;
}

async function build(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'build <name> [--base <ref>]');
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
    console.error(`run ${name} has no report.md; run report first`);
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

  const scope = readRun(deps.root, name);
  const decisions = readJsonFile<Record<string, Decision>>(file, {});
  const owner = decisionsToVerdicts(decisions, isoNow(deps).slice(0, 10));
  const verdictsPath = path.join(dir, 'verdicts.jsonl');
  const verdicts = readJsonl<Verdict>(verdictsPath);
  const candidates = readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'));

  // verdicts.jsonl is append-only, so a bad decision is rejected before it is written.
  const errors = validateVerdicts([...verdicts, ...owner], candidates, scope.channels);
  if (errors.length > 0) {
    for (const message of errors) console.error(message);
    return 1;
  }

  appendJsonl(verdictsPath, owner);
  console.log(`${owner.length} decision${owner.length === 1 ? '' : 's'} applied`);

  const data = await buildContent(name, deps, DEFAULT_BASE);
  if (data === null) return 1;
  gitCommitAll(deps.exec, `content: build ${name}`);
  if (!(await writeReport(name, deps))) return 1;
  gitCommitAll(deps.exec, `content(${name}): report`);
  return pushBranch(deps, name) ? 0 : 1;
}

async function imagesRetire(rest: string[], deps: CliDeps): Promise<number> {
  const hash = positional(rest, 'images retire <hash> --reason "<text>"');
  const flags = parseFlags(rest.slice(1));
  const reason = flagValue(flags, 'reason');
  if (reason === null) {
    console.error('images retire needs --reason "<text>"');
    return 1;
  }

  const at = isoNow(deps).slice(0, 10);
  const before = readManifest(deps.root);
  const result = retireRows(before, hash, reason, at);
  if (result.retired === 0) {
    console.error(`no manifest row carries hash ${hash}`);
    return 1;
  }

  const species = readSpecies(deps.root);
  markRetiredSpecies(species, result.rows, at);
  if (!(await commitRetire(deps, species, before, result.rows, `retire image ${hash}`))) {
    return 1;
  }
  const rows = `${result.retired} manifest row${result.retired === 1 ? '' : 's'}`;
  console.log(`${rows} retired for ${hash}`);
  return 0;
}

async function speciesRetire(rest: string[], deps: CliDeps): Promise<number> {
  const symbol = positional(rest, 'species retire <SYMBOL> --reason "<text>"');
  const flags = parseFlags(rest.slice(1));
  const reason = flagValue(flags, 'reason');
  if (reason === null) {
    console.error('species retire needs --reason "<text>"');
    return 1;
  }

  const species = readSpecies(deps.root);
  const current = species[symbol];
  if (current === undefined) {
    console.error(`species.json has no record ${symbol}`);
    return 1;
  }

  const at = isoNow(deps).slice(0, 10);
  const before = readManifest(deps.root);
  // The rows go too. A rebuild then sees every row retired and keeps the species retired.
  const rows = retireOwnRows(before, ownTargets(symbol, current), reason, at);
  species[symbol] = { ...current, retired: true, retired_reason: reason, retired_at: at };
  if (!(await commitRetire(deps, species, before, rows, `retire species ${symbol}`))) {
    return 1;
  }
  const count = rows.filter((one) => one.retired === true).length;
  console.log(`${symbol} retired, ${count} manifest row${count === 1 ? '' : 's'} retired`);
  return 0;
}

async function idsCheck(rest: string[], deps: CliDeps): Promise<number> {
  const raw = rawOf(deps.root, readSpecies(deps.root), readManifest(deps.root));
  const base = baseRef(parseFlags(rest));
  const errors = appendOnlyErrors(readPublished(gitShowOf(deps, base)), contentSetOf(raw));
  for (const message of errors) console.error(message);
  if (errors.length > 0) return 1;
  console.log('content ids are append-only');
  return 0;
}

/**
 * Builds the whole content set in memory, checks it, and only then uploads and writes.
 * Spec section 11: a build that fails writes nothing to content/ and uploads nothing.
 * Returns null when it printed a failure.
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
  const now = isoNow(deps);
  const at = now.slice(0, 10);

  const verdictErrors = validateVerdicts(verdicts, candidates, scope.channels);
  if (verdictErrors.length > 0) {
    for (const message of verdictErrors) console.error(message);
    return null;
  }

  const deferred = deferredStorage(deps.storage);
  const published = await publishApproved({
    deps: {
      storage: deferred,
      resize: deps.resize,
      readLocal: (file) => fs.readFileSync(path.join(deps.root, file)),
    },
    candidates,
    verdicts,
    rows: readManifest(deps.root),
  });
  const manifest = published.rows;

  const concepts = readContentList<RawContent['concepts'][number]>(deps.root, 'concepts.json');
  const conceptKeys = new Set(concepts.map((one) => `${one.channel}/${one.key}`));
  const authoredDir = path.join(deps.root, 'content_src', 'species');
  const species: Record<string, SpeciesRecord> = {};
  const statuses: Record<string, SpeciesStatus> = {};
  const authoredErrors: string[] = [];
  let sections: Record<string, string> | null = null;

  for (const symbol of scope.species) {
    const authored = readAuthored(authoredDir, symbol);
    if (authored === null) {
      statuses[symbol] = { status: 'not_authored', reason: null };
      continue;
    }
    authoredErrors.push(...validateAuthored(authored, symbol, conceptKeys));

    // species list fetched this profile already, so the disk cache answers it. The build
    // needs the whole record, which pipeline/data/plants_ids.json does not carry.
    const profile = await fetchProfile(deps.http, symbol, now);
    if (profile === null) {
      console.error(`${symbol}: ${NO_PROFILE}. The build stopped.`);
      return null;
    }
    if (profile.genus === 'Quercus' && sections === null) {
      sections = loadSectionTable(
        path.join(deps.root, 'pipeline', 'data', 'quercus_sections.json'),
      );
    }
    const taxon = await inatTaxonOf(deps, profile.scientific, symbol, now);
    const fetched = buildFetched({
      profile,
      subordinate: await fetchSubordinateTaxa(deps.http, profile.plants_id, now),
      states: await fetchDistribution(deps.http, profile.plants_id),
      section: sections === null ? null : sectionFor(sections, profile.scientific),
      inat: taxon,
    });

    const fetchedErrors = validateFetched(fetched, symbol);
    const live = manifest.filter(
      (one) => one.target === symbol && one.retired !== true,
    ).length;
    statuses[symbol] = statusOf(fetchedErrors, live, taxon === null);
    if (fetchedErrors.length > 0) {
      console.log(`${symbol}: dropped, ${statuses[symbol].reason ?? ''}`);
      continue;
    }
    // A species with no photo is still written. The app validator owns the rule that a
    // live species needs a live image or a confusion edge.
    species[symbol] = mergeSpecies(fetched, authored);
  }

  if (authoredErrors.length > 0) {
    for (const message of authoredErrors) console.error(message);
    return null;
  }

  const previous = readPublished(gitShowOf(deps, base));
  carryPublished(species, previous);
  markRetiredSpecies(species, manifest, at);

  const raw = rawOf(deps.root, species, manifest);
  const result = validated(deps, raw);
  if (result === null) return null;

  const loaded = loadContent(raw) as LoadResult;
  if (loaded.content === null) {
    // deps.validate passed and the app loader did not. The two disagree, so stop.
    for (const one of loaded.errors) console.error(`error ${one.file}: ${one.message}`);
    return null;
  }

  const idErrors = appendOnlyErrors(previous, contentSetOf(raw));
  if (idErrors.length > 0) {
    for (const message of idErrors) console.error(message);
    return null;
  }

  await deferred.flush();
  writeJson(contentFile(deps.root, 'species.json'), raw.species);
  writeJson(contentFile(deps.root, MANIFEST_NAME), raw.manifest);

  const data = reportData({
    name,
    scope,
    statuses,
    candidates,
    verdicts,
    raw,
    loaded: loaded.content,
    warnings: result.warnings,
  });
  writeJson(path.join(dir, 'build.json'), data);
  // A cap that photos fetch recorded reaches the reader again here.
  for (const message of scope.capped) console.log(`capped: ${message}`);
  printFailures(deps);
  console.log(
    `content built: ${Object.keys(raw.species).length} species, ${raw.manifest.length} manifest rows, ${published.uploaded.length} images uploaded`,
  );
  return data;
}

/**
 * Spec section 4: a species never leaves species.json. Every published record this run
 * does not rebuild is copied as it was published. It was valid then, so it is valid now.
 */
function carryPublished(
  species: Record<string, SpeciesRecord>,
  previous: ContentSet | null,
): void {
  if (previous === null) return;
  for (const [symbol, record] of Object.entries(previous.species)) {
    if (species[symbol] !== undefined) continue;
    species[symbol] = record;
  }
}

/**
 * The second of the two retire paths: a species whose every manifest row is retired.
 * `cli species retire` is the first. Nothing else writes these three fields.
 */
function markRetiredSpecies(
  species: Record<string, SpeciesRecord>,
  manifest: ManifestRow[],
  at: string,
): void {
  for (const [symbol, record] of Object.entries(species)) {
    if (record.retired === true) continue;
    const rows = manifest.filter((one) => one.target === symbol);
    if (rows.length === 0) continue;
    if (rows.some((one) => one.retired !== true)) continue;
    species[symbol] = {
      ...record,
      retired: true,
      retired_reason: IMAGES_RETIRED,
      retired_at: at,
    };
  }
}

function statusOf(
  fetchedErrors: string[],
  liveImages: number,
  taxonMissing: boolean,
): SpeciesStatus {
  if (fetchedErrors.length > 0) {
    return { status: 'dropped', reason: fetchedErrors.join('; ') };
  }
  return {
    status: liveImages === 0 ? 'no_photos' : 'included',
    reason: taxonMissing ? NO_INAT_TAXON : null,
  };
}

function reportData(input: {
  name: string;
  scope: RunScope;
  statuses: Record<string, SpeciesStatus>;
  candidates: Candidate[];
  verdicts: Verdict[];
  raw: RawContent;
  loaded: LoadedContent;
  warnings: ValidationMessage[];
}): BuildReport {
  const { name, scope, statuses, candidates, verdicts, raw, loaded, warnings } = input;
  const counts = countByTargetChannel(approvedVerdicts(verdicts), candidates);
  const rows: ReportSpeciesRow[] = [];
  // A concept run's targets are its qualified concept keys and it fills no status.
  const targets = scope.concepts.length > 0 ? scope.concepts : scope.species;
  for (const target of targets) {
    const status = statuses[target] ?? CONCEPT_STATUS;
    rows.push({
      symbol: target,
      status: status.status,
      reason: status.reason,
      counts: counts[target] ?? {},
    });
  }
  for (const dropped of scope.dropped) {
    rows.push({ symbol: dropped.symbol, status: 'dropped', reason: dropped.reason, counts: {} });
  }

  const kinds: Record<string, number> = {};
  for (const one of lastVerdicts(verdicts)) kinds[one.verdict] = (kinds[one.verdict] ?? 0) + 1;
  const sources: Record<string, number> = {};
  for (const one of candidates) sources[one.source_key] = (sources[one.source_key] ?? 0) + 1;

  return {
    run: name,
    channels: scope.channels,
    species: rows,
    gaps: buildGaps(rows, scope.channels),
    units: unitRows(raw.units, loaded, warnings),
    counts: {
      candidates_by_source: sortKeys(sources),
      verdicts_by_kind: sortKeys(kinds),
      // The fetch step owns this count. A rebuild reports it and never changes it.
      fetch_failures: scope.fetch_failures,
      stop_rule_fired: stopRule(verdicts).fired,
    },
  };
}

/** Every unit gets a row. The count is the app's own, and so is the warning text. */
function unitRows(
  units: Record<string, unknown>[],
  loaded: LoadedContent,
  warnings: ValidationMessage[],
): ReportUnitRow[] {
  return units.map((unit) => {
    const key = String(unit.key);
    const warning = warnings.find(
      (one) => one.file === 'units.json' && one.message.startsWith(`${key} `),
    );
    return {
      key,
      cards: loaded.unit_cards[key].length,
      warning: warning === undefined ? null : warning.message,
    };
  });
}

async function writeReport(name: string, deps: CliDeps): Promise<boolean> {
  const dir = runDir(deps.root, name);
  readRun(deps.root, name);
  const data = readJsonFile<BuildReport | null>(path.join(dir, 'build.json'), null);
  if (data === null) {
    console.error(`run ${name} has no build.json; run build first`);
    return false;
  }

  const candidates = readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'));
  const verdicts = readJsonl<Verdict>(path.join(dir, 'verdicts.jsonl'));
  const byId = new Map(candidates.map((one) => [one.id, one]));

  const escalations: ReportEscalationRow[] = [];
  for (const one of lastVerdicts(verdicts)) {
    if (one.verdict !== 'escalate') continue;
    const candidate = byId.get(one.candidate_id);
    if (candidate === undefined) {
      console.error(`verdicts.jsonl names candidate ${one.candidate_id}, which run ${name} does not hold`);
      return false;
    }

    // The branch holds no image bytes, so the report links a copy under review/.
    const bytes = localBytes(deps.root, candidate);
    let url = '';
    let note = one.note;
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
      case: one.case ?? '',
      note,
      target: candidate.target,
    });
  }

  const file = path.join(dir, 'report.md');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, renderReport({ ...data, escalations }), 'utf8');
  console.log(`${escalations.length} escalations in ${relative(deps.root, file)}`);
  return true;
}

/**
 * Both retire commands end the same way: validate, check the ids, remove the objects no
 * live row carries any more, write the two files, commit.
 */
async function commitRetire(
  deps: CliDeps,
  species: Record<string, SpeciesRecord>,
  before: ManifestRow[],
  after: ManifestRow[],
  subject: string,
): Promise<boolean> {
  const raw = rawOf(deps.root, species, after);
  if (validated(deps, raw) === null) return false;
  // A retire runs on a checkout that has main, so it needs no --base.
  const previous = readPublished(gitShowOf(deps, DEFAULT_BASE));
  const idErrors = appendOnlyErrors(previous, contentSetOf(raw));
  if (idErrors.length > 0) {
    for (const message of idErrors) console.error(message);
    return false;
  }
  for (const key of deadObjectKeys(before, after)) await deps.storage.remove(key);
  writeJson(contentFile(deps.root, 'species.json'), raw.species);
  writeJson(contentFile(deps.root, MANIFEST_NAME), raw.manifest);
  gitCommitAll(deps.exec, `content: ${subject}`);
  return true;
}

/** The species symbol and every variety key it owns. A row targets one of them. */
function ownTargets(symbol: string, record: SpeciesRecord): Set<string> {
  const targets = new Set([symbol]);
  const varieties = Array.isArray(record.varieties) ? record.varieties : [];
  for (const variety of varieties) {
    const key = (variety as Record<string, unknown>).key;
    if (typeof key === 'string') targets.add(key);
  }
  return targets;
}

function retireOwnRows(
  rows: ManifestRow[],
  targets: Set<string>,
  reason: string,
  at: string,
): ManifestRow[] {
  return rows.map((one) => {
    if (one.retired === true || !targets.has(one.target)) return one;
    return { ...one, retired: true, retired_reason: reason, retired_at: at };
  });
}

/** An object key no live row carries any more. The same bytes under two targets stay. */
function deadObjectKeys(before: ManifestRow[], after: ManifestRow[]): string[] {
  const live = new Set(after.filter((one) => one.retired !== true).map((one) => one.hash));
  const keys: string[] = [];
  for (const one of before) {
    if (one.retired === true || live.has(one.hash)) continue;
    const key = objectKey(one.hash);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** A miss is a line on the screen and a reason in the report, never a silent null. */
async function inatTaxonOf(
  deps: CliDeps,
  scientific: string,
  symbol: string,
  now: string,
): Promise<InatTaxon | null> {
  const url = taxaUrl(scientific);
  const result = await deps.http.getText(url);
  if (!result.ok) {
    console.error(`${symbol}: ${NO_INAT_TAXON}`);
    return null;
  }
  // Task 13's parseJson pushes a `body is not JSON` failure row and returns null.
  const json = parseJson(deps.http, url, result, now);
  const taxon = json === null ? null : parseTaxon(json);
  if (taxon === null) console.error(`${symbol}: ${NO_INAT_TAXON}`);
  return taxon;
}

function localBytes(root: string, candidate: Candidate): Uint8Array | null {
  if (candidate.local === null) return null;
  const file = path.join(root, candidate.local);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

/** Prints every message. Returns the result, or null when the set holds an error. */
function validated(deps: CliDeps, raw: RawContent): ValidationResult | null {
  const result = deps.validate(raw);
  for (const one of result.warnings) console.log(`warning ${one.file}: ${one.message}`);
  for (const one of result.errors) console.error(`error ${one.file}: ${one.message}`);
  return result.errors.length === 0 ? result : null;
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
 * without a local main, so the CI step of Task 18 passes --base origin/main.
 */
function baseRef(flags: Record<string, string>): string {
  const value = flags.base;
  return value === undefined || value === 'true' ? DEFAULT_BASE : value;
}

/** A flag with a real value. `parseFlags` gives a bare flag the value `true`. */
function flagValue(flags: Record<string, string>, key: string): string | null {
  const value = flags[key];
  return value === undefined || value === 'true' ? null : value;
}

function rawOf(
  root: string,
  species: Record<string, SpeciesRecord>,
  manifest: ManifestRow[],
): RawContent {
  return {
    species: sortKeys(species),
    concepts: readContentList<RawContent['concepts'][number]>(root, 'concepts.json'),
    units: readContentList<Record<string, unknown>>(root, 'units.json'),
    confusion: readJsonFile<RawContent['confusion']>(contentFile(root, 'confusion.json'), []),
    manifest,
  };
}

/**
 * The five ids of section 4 come from four of the five files. confusion.json carries no
 * id of its own: an edge names two species, and both ids live in species.json.
 */
function contentSetOf(raw: RawContent): ContentSet {
  return {
    species: raw.species,
    concepts: raw.concepts,
    units: raw.units.map((unit) => ({ key: String(unit.key) })),
    manifest: raw.manifest,
  };
}

/** The last row for a candidate id wins, so an owner decision beats an agent verdict. */
function lastVerdicts(verdicts: Verdict[]): Verdict[] {
  const last = new Map<string, Verdict>();
  for (const one of verdicts) last.set(one.candidate_id, one);
  return [...last.values()];
}

function contentFile(root: string, name: string): string {
  return path.join(root, 'content', name);
}

function readSpecies(root: string): Record<string, SpeciesRecord> {
  return readJsonFile<Record<string, SpeciesRecord>>(contentFile(root, 'species.json'), {});
}

function readManifest(root: string): ManifestRow[] {
  return readJsonFile<ManifestRow[]>(contentFile(root, MANIFEST_NAME), []);
}

/** An authored input the build cannot invent. Its absence is an error, not an empty list. */
function readContentList<T>(root: string, name: string): T[] {
  const file = contentFile(root, name);
  if (!fs.existsSync(file)) throw new Error(`${relative(root, file)} is missing`);
  return readJson(file) as T[];
}

function readJsonFile<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return readJson(file) as T;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test pipeline/tests/cli_build.test.ts`
Expected: PASS, 35 tests.

- [ ] **Step 7: Update the Task 13 placeholder test in `pipeline/tests/cli_fetch.test.ts`**

Task 13 wrote a test that asserts three Task 14 commands print `not implemented yet`.
That message is gone, so the test asserts each one now reaches its own handler. One edit
with the Edit tool. The old text is Task 13's test, verbatim.

Old:

```ts
test('a Task 14 command says it is not implemented yet', async (t) => {
  const { deps, err } = setup(t);
  assert.equal(await runCommand(['build', 'demo'], deps), 1);
  assert.equal(await runCommand(['run', 'pr', 'demo'], deps), 1);
  assert.equal(await runCommand(['species', 'retire', 'QUGA'], deps), 1);
  assert.deepEqual(err, [
    'not implemented yet: build',
    'not implemented yet: run pr',
    'not implemented yet: species retire',
  ]);
});
```

New:

```ts
test('a Task 14 command reaches its own handler', async (t) => {
  const { deps, err } = setup(t);
  assert.equal(await runCommand(['build', 'demo'], deps), 1);
  assert.equal(await runCommand(['run', 'pr', 'demo'], deps), 1);
  assert.equal(await runCommand(['species', 'retire', 'QUGA'], deps), 1);
  assert.deepEqual(err, [
    'run demo does not exist. Run "cli run init demo" first.',
    'run demo has no report.md; run report first',
    'species retire needs --reason "<text>"',
  ]);
});
```

Each message names the handler that printed it. The first is `readRun`, which `build`
calls first. The second and the third are this task's. None of the three is a
placeholder, which is what the test now proves.

- [ ] **Step 8: Run every pipeline test**

Run: `node --test "pipeline/tests/**/*.test.ts"`

Expected: PASS, with `fail 0`. `cli_build.test.ts` reports 35 tests, and
`cli_fetch.test.ts` still reports the 33 Task 13 gave it, because step 7 rewrites one
test and adds none. The suite total is the sum of Tasks 1 to 14, so read the two files'
counts and the `fail 0` line, not a total written here.

- [ ] **Step 9: Commit**

```bash
git add pipeline/lib/commands.ts pipeline/lib/storage.ts pipeline/tests/cli_build.test.ts pipeline/tests/cli_fetch.test.ts && git commit -m "feat: build the content, write the report, and open the pull request" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 15: The four agent skills

**Files:**
- Create: `.claude/skills/content-run/SKILL.md`
- Create: `.claude/skills/photo-check/SKILL.md`
- Create: `.claude/skills/species-draft/SKILL.md`
- Create: `.claude/skills/edges-draft/SKILL.md`

**Interfaces:**
- Consumes:
  - Task 13, the command surface it produces: `run init`, `species list`, `photos fetch`, `photos add`, `photos verdict`, `data sections`, `data inat-terms`.
  - Task 14, the command surface it produces: `build`, `report`, `run pr`, `run finish`, `images retire`, `species retire`, `ids check`.
  - Task 13: the run files under `pipeline/runs/<name>/` — `run.json`, `candidates.jsonl`, `verdicts.jsonl`.
  - Task 14: `pipeline/runs/<name>/build.json`, whose `counts` hold `candidates_by_source`, `verdicts_by_kind`, `fetch_failures`, and `stop_rule_fired`.
  - Task 9: `STOP_MIN_JUDGED` (20) and `STOP_RATIO` (0.25) from `pipeline/lib/verdicts.ts`. The skill quotes the two numbers and names the file that holds them.
  - Task 7: the authored file path `content_src/species/<SYMBOL>.json`, `REQUIRED_AUTHORED` (`concepts`, `range`, `elevation_ft`, `height_ft`, `habitat`, `ref`), and the optional fields (`common_extra`, `audubon_name`, `planted_states`, `variety_notes`, `genus_common`, `arrangement`).
  - Task 2: the `Candidate` fields the photo-check agent reads — `id`, `target`, `origin`, `local`, `author`, `license`, `source`, `source_species`, `channel_hint`, `tags_hint`.
  - Task 5 and Task 13 (D17): the `identity_match` field on a candidate row.
  - The repo: `content/concepts.json`, `content/species.json`, `content/confusion.json`.
- Produces:
  - `.claude/skills/content-run/SKILL.md`: the ten-step walkthrough of one run, one CLI command per script step.
  - `.claude/skills/photo-check/SKILL.md`: the approval rules, the batch loop, and the stop rule.
  - `.claude/skills/species-draft/SKILL.md`: the authored species file, field by field.
  - `.claude/skills/edges-draft/SKILL.md`: the confusion edge, field by field.
  - No code and no exported name.

This task writes prose, not code. There is no test. The skills hold the judgment rules of
spec sections 5, 6, 7, and 8, so a run next year uses today's rules. Each file quotes the
rules in full. A skill never points at a spec file, because the spec may move.

Each file starts with YAML frontmatter that holds exactly `name` and `description`. The
`name` equals the directory name. The `description` starts with "Use when".

Three rules shape every one of the four files:

- One code path writes a run record. The CLI writes it. An agent runs a command and reads
  the file the command wrote. No agent appends to `candidates.jsonl` or `verdicts.jsonl`.
- Every run path is `pipeline/runs/<name>/…`.
- The CLI commits. An agent never runs `git commit`.

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
run resumes with the same command. Every command takes `--refresh`, which bypasses the
disk cache for that command.

**The CLI commits. You do not.** The CLI commits at the end of `species list`,
`photos fetch`, `build`, `report`, `run pr`, and `run finish`. Each commit runs
`git add -A`, so the commit also carries the verdict rows and any file you edited since
the last commit. Do not run `git commit` yourself.

## The run's files

| Path | Written by |
|---|---|
| `pipeline/runs/<name>/run.json` | `run init`, then `species list` |
| `pipeline/runs/<name>/candidates.jsonl` | `photos fetch`, `photos add` |
| `pipeline/runs/<name>/verdicts.jsonl` | `photos verdict`, `run finish` |
| `pipeline/runs/<name>/build.json` | `build` |
| `pipeline/runs/<name>/decisions.json` | the owner, by hand |
| `pipeline/runs/<name>/report.md` | `report` |

## The ten steps

- [ ] **Step 1: Init the run (script)**

```bash
node pipeline/cli.ts run init <name> --bucket <b> --states <csv> --genera <csv> --include <csv> --channels <csv>
```

This creates the branch `content/<name>` from `main` and writes
`pipeline/runs/<name>/run.json`. It prints `run <name> created on branch content/<name>`.
When the run already exists it prints `run <name> already exists` and changes nothing.

- [ ] **Step 2: List the species (script, commits)**

```bash
node pipeline/cli.ts species list <name>
```

This writes the kept species and the dropped species into `run.json`, with the reason for
each drop, and writes `pipeline/data/plants_ids.json`. It prints
`<n> species kept, <m> dropped`, then one line per fetch failure, and it prints
`<SYMBOL>: no profile` for each symbol whose profile fetch failed. A symbol with no
profile is in no later step, so read those lines. Re-run with `--refresh` when a failure
looks like a rate limit. Tell the owner when a symbol fails twice.

- [ ] **Step 3: Draft the authored species files (agent)**

Run the `species-draft` skill. It writes one `content_src/species/<SYMBOL>.json` for each
species in `run.json` that lacks one. A species with no authored file gets no record in
`content/species.json`; the build reports it as `not_authored`.

- [ ] **Step 4: Fetch the photo candidates (script, commits)**

```bash
node pipeline/cli.ts photos fetch <name>
```

This appends rows to `pipeline/runs/<name>/candidates.jsonl` and downloads each image into
`pipeline/cache/`. It prints
`<n> candidates appended to pipeline/runs/<name>/candidates.jsonl, <m> download failures`,
then one line per fetch failure, and it records the count in `run.json` as
`fetch_failures`.

- [ ] **Step 5: Approve the photos (agent)**

Run the `photo-check` skill. It judges each candidate that has no verdict and records each
verdict with `node pipeline/cli.ts photos verdict …`. The stop rule applies. When that
skill stops, the run stops with it.

- [ ] **Step 6: Build (script, commits)**

```bash
node pipeline/cli.ts build <name>
```

This merges the species records, resizes and uploads the approved images, writes the
manifest rows, runs the validator and the append-only check, and writes
`pipeline/runs/<name>/build.json`. It prints one line per flagged unit, then
`content built: <n> species, <m> manifest rows, <k> images uploaded`.

The build writes nothing to `content/` until the validator and the append-only check both
pass. On an error it prints each message and exits 1. Read the messages and fix the cause:

- `error species.json: …` — an authored file or a fetched field is wrong. Edit the
  authored file, or tell the owner when the fetched layer is wrong.
- `error images/manifest.json: …` — a verdict approved an image the content set rejects.
- `<id> is in the published … and is gone from the new content` — a published ID left the
  content. Never delete a published ID. Retire it instead.

- [ ] **Step 7: Hunt for the thin channels (agent)**

Read the gap list in `build.json` under `gaps`. Each row names a species or a concept, a
channel, and the count of approved images. Find photos by hand in a browser for the thin
pairs. Append each one as a manual candidate:

```bash
node pipeline/cli.ts photos add <name> --target <t> --origin <url> --file-url <url> --author <a> --license <l> --source <s> [--license-url <u>] [--source-species <n>] [--channel-hint <c>] [--local <path>]
```

`--target`, `--origin`, `--file-url`, `--author`, `--license`, and `--source` are
required, and each must be non-empty. The command exits 1 and names the flag when one is
missing.

- `--author` and `--license` are the credit the app prints under the photo, word for word.
  Copy them off the source page. Do not write `unknown`.
- `--source` is the display name of the source, such as `US Forest Service`. It goes on the
  manifest row as it is.
- `--source-species` is the species the source page names. The identity check reads it.
- `--local <path>` names an image file you already downloaded. Without it the command
  downloads `--file-url`.

Then run steps 5 and 6 again.

- [ ] **Step 8: Draft the confusion edges (agent)**

Run the `edges-draft` skill. It appends edges to `content/confusion.json` for the species
in this run.

Then build again, so the validator reads the new edges before the report:

```bash
node pipeline/cli.ts build <name>
```

An edge whose `a` or `b` is not in `content/species.json` fails the build. Fix the edge
and build again.

- [ ] **Step 9: Report and open the pull request (script, commits)**

```bash
node pipeline/cli.ts report <name>
node pipeline/cli.ts run pr <name>
```

`report` writes `pipeline/runs/<name>/report.md` and prints
`<n> escalations in pipeline/runs/<name>/report.md`. It uploads a copy of each escalated
image under the `review/` prefix and links it, because the branch holds no image bytes.

`run pr` pushes the branch and opens a draft pull request with the report as its body. It
prints `draft pull request opened for content/<name>`. It exits 1 when `report.md` is
missing.

- [ ] **Step 10: Stop and wait for the owner**

**The run stops here.** The owner reviews the pull request. They write
`pipeline/runs/<name>/decisions.json` for the escalations, and they edit the authored files
and the edges in place. Do not do this work for them. Do not guess a decision.

When the owner says the decisions are ready:

```bash
node pipeline/cli.ts run finish <name>
```

This turns each decision into a verdict row with `checked_by: owner`, rebuilds, re-renders
the report, and pushes. It prints `<n> decisions applied`, or `no decisions to apply` when
the file is absent. It exits 1 when `decisions.json` names a candidate this run does not
hold. CI validates the pull request. The owner marks it ready and merges.

## The concept run variant

A concept run replaces `--bucket` with `--concepts`. Its `run init` takes that one flag and
no others:

```bash
node pipeline/cli.ts run init <name> --concepts <csv>
```

- Each `--concepts` value is qualified: `<channel>/<key>`, such as `bark/plated`. A value
  with no `/` fails. A key that is not in `content/concepts.json` fails and the message
  names it.
- The run's channels are the distinct channel prefixes of those keys, so the command
  derives them and **`--channels` is an error on a concept run**.

The manifest target of a concept candidate is the qualified key. The run writes no species
record, so **skip step 3 and step 8**.

The exemplar species live in `run.json` under `concept_exemplars`, a map from a qualified
key to two or three PLANTS symbols. The owner fills it after step 1 and before step 4,
because the exemplars are a content judgment. `photos fetch` looks each concept's photos up
through its exemplars.

## Other commands

- `node pipeline/cli.ts images retire <hash> --reason "<text>"` takes one image down. It
  builds the new content set in memory, validates it, runs the append-only check, then
  removes the object, writes `content/`, and commits. Two rows that share the hash both
  retire. Run it only when the owner asks.
- `node pipeline/cli.ts species retire <SYMBOL> --reason "<text>"` retires one species. The
  record stays in `content/species.json` with `retired: true` and the reason. Run it only
  when the owner asks.
- `node pipeline/cli.ts ids check --base <ref>` reports whether the content set keeps every
  published ID. `build` runs the same check.
- `node pipeline/cli.ts data sections` builds the oak section table. Run it once.
- `node pipeline/cli.ts data inat-terms` reads the iNaturalist phenology value and writes
  `pipeline/data/inat_terms.json`. It exits 1 when the live annotations are ambiguous.

## What this skill does not do

- It does not commit. The CLI commits.
- It does not append to `candidates.jsonl` or `verdicts.jsonl`. `photos add` and
  `photos verdict` do that.
- It does not write `decisions.json` for the owner at step 10.
- It does not restart a run that the stop rule stopped. The owner changes the source list
  or the threshold first.
- It does not edit `content/concepts.json` or `content/units.json`. A person authors those.
````

- [ ] **Step 2: Create `.claude/skills/photo-check/SKILL.md`**

````markdown
---
name: photo-check
description: Use when approving the photo candidates of a Dendro content run, one verdict per candidate, through `cli photos verdict`.
---

# Photo check

You judge the photo candidates of one run. One candidate gets one verdict.

## The loop

1. Read `pipeline/runs/<name>/candidates.jsonl`.
2. Read `pipeline/runs/<name>/verdicts.jsonl` when it exists.
3. Take every candidate whose `id` has no row in `verdicts.jsonl`. Those are the unjudged
   candidates.
4. Dispatch subagents in batches of 10. Each subagent gets one candidate row. It reads the
   image file at the row's `local` path and the row itself.
5. **Each subagent returns its verdict as its result. It writes no file.** It does not
   touch `verdicts.jsonl`.
6. For each returned verdict, run one command. Run them in sequence, one after the other,
   because each command appends to the same file:

   ```bash
   node pipeline/cli.ts photos verdict <name> --candidate <id> --verdict <kind> [--channel <c>] [--tags a,b] [--case <case>] --note "<text>"
   ```

   The six flags above are the whole surface. The command writes the row. It sets
   `checked_by` to `photo_check_agent`, which is `CHECK_AGENT` in the CLI, and `checked_at`
   to today's date. You never set those two.
7. After each batch, apply the stop rule below.

## The verdict

Each subagent returns five things, and no more:

- `verdict`: `approve`, `reject`, or `escalate`.
- `channel`: one of `leaf`, `bark`, `fruit`, `flower`, `twig`. Required on an `approve`.
  On a concept target the channel is the target's own prefix: a `bark/plated` target takes
  `--channel bark`.
- `tags`: zero or more words for `--tags`, comma separated, such as `winter,close_up`.
- `case`: only on an escalation. It is `mismatch`, `license`, or `quality`.
- `note`: one or two sentences that say what you saw.

`cli build` and `cli run finish` reject a verdict whose candidate id is unknown, whose kind
is not one of the three, or whose approved channel is not in the run's channel list. Each
one prints the error and exits 1.

## The four rules

**Channel.** Set the channel from the fixed list: `leaf`, `bark`, `fruit`, `flower`,
`twig`. The row's `channel_hint` and `tags_hint` are suggestions only. Use your eyes.
**When no channel is clear, reject the image. An unclear channel is a reject, not an
escalation.**

**Quality.** The photo is sharp. The subject fills the frame. No hand and no ruler are in
the shot. Below that threshold, escalate with `--case quality`.

**License.** The license text on the row is in the allowlist and matches the source page.
The allowlist is public domain, US government work, CC0 any version, CC BY any version,
and CC BY-SA any version. NC and ND variants are not allowed. When the license is missing,
ambiguous, or not redistributable, escalate with `--case license`.

**Identity.** Read `identity_match` on the candidate row. The fetch step set it by
comparing the row's `source_species` to the PLANTS scientific name, its PLANTS synonyms,
and the iNaturalist name, after normalization.

- `true`: the names agree. Do nothing for identity.
- `false`: the names differ. Open the source page at `origin` and read the species it
  names. When the names still differ, escalate with `--case mismatch`.
- `null`: the row carries no name to compare, which is the normal state of a manual
  candidate. Open the source page at `origin` and confirm the species yourself. When the
  page names a different species, escalate with `--case mismatch`. When the page names no
  species, escalate with `--case mismatch`.

Eligible identity sources are iNaturalist at research grade, USDA PLANTS, US Forest
Service and NRCS through a manual candidate, Wikimedia Commons with a species-level
category, and university dendrology collections that name the species.

**You never set or change the species from what you see in the photo.** Identity comes from
the source page. Your own recognition of the plant is not evidence.

## The three escalation cases

Escalate in these three cases and no others:

1. `mismatch`: the species on the source page and the species on the row differ, or the
   page names none.
2. `license`: the license is missing, ambiguous, or not redistributable.
3. `quality`: the channel or the quality falls below the threshold.

Everything else is an approve or a reject.

## The stop rule

After each batch of 10, count the candidates of this run that now have a verdict, and count
how many of those verdicts are escalations.

- Fewer than 20 judged: continue.
- 20 or more judged **and** more than a quarter of them escalated: **stop**.

The two numbers are `STOP_MIN_JUDGED` (20) and `STOP_RATIO` (0.25) in
`pipeline/lib/verdicts.ts`. `cli build` applies the same rule to the committed rows and
records the answer in `pipeline/runs/<name>/build.json` under `counts.stop_rule_fired`. The
report prints it. You write no file of your own for it.

Example: 24 judged with 7 escalations is 29 percent. That is more than a quarter, so the
run stops. 24 judged with 6 escalations is 25 percent. That is not more than a quarter, so
the run continues.

When the rule fires:

1. Dispatch no more batches.
2. Tell the owner the count judged, the count escalated, and the percentage.
3. Stop. The run resumes only after the owner changes the source list or the threshold and
   re-runs the command.

A stopped run is a signal that the source list or the threshold is wrong. Do not lower your
standard to get past it. On a first run a high escalation rate usually means one source's
license text does not match the allowlist.

## What this skill does not do

- It does not identify a species from the image.
- It does not re-judge a candidate that already has a verdict row.
- It does not write `verdicts.jsonl`. `cli photos verdict` writes it.
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

1. Read the run's species list from `pipeline/runs/<name>/run.json`, field `species`.
2. For each symbol, check whether `content_src/species/<SYMBOL>.json` exists.
3. Draft one file for each symbol that has no file. Leave the existing files alone.

`<SYMBOL>` is the USDA PLANTS symbol, in upper case, such as `QUGA`.

## The file shape

```json
{
  "concepts": { "leaf": "simple_lobed", "bark": "furrowed", "fruit": "acorn" },
  "range": { "text": "Colorado Plateau and southern Rockies" },
  "elevation_ft": [5000, 9000],
  "height_ft": [15, 30],
  "habitat": "Dry slopes and foothills with pinyon and juniper",
  "ref": ["Virginia Tech Dendrology fact sheet, Quercus gambelii",
          "FNA vol. 3, Quercus gambelii"],
  "common_extra": ["Rocky Mountain white oak"],
  "audubon_name": "Gambel Oak",
  "genus_common": "oak",
  "arrangement": "alternate",
  "planted_states": [],
  "variety_notes": { "QUGAG": "The widespread form." }
}
```

**Required fields.** The build prints an error and stops when one is missing or malformed.

- `concepts`: an object with at least one channel. The key is the channel, such as `leaf`.
  The value is the `key` of a row in `content/concepts.json` whose `channel` equals that
  channel. Read that file and copy the key. A concept row has `key`, `channel`, `name`,
  `accept`, and `description`, and nothing else; there is no level field and no nesting.
  Every key in the file is a valid value.
- `range`: an object with a non-empty `range.text`, one short phrase that names the range.
  The states come from the PLANTS distribution, not from you.
- `elevation_ft`: two numbers, low then high. The first must not exceed the second.
- `height_ft`: two numbers, low then high. The first must not exceed the second.
- `habitat`: one non-empty sentence.
- `ref`: a non-empty list of non-empty strings. Each string names one reference you read.

**Optional fields.** Leave a field out when you have nothing for it. A field the list
below does not name fails the build, so check a name before you write it.

- `common_extra`: extra common names. The build appends them after the PLANTS common name.
- `audubon_name`: the name the Audubon guide uses.
- `genus_common`: the common word for the genus, lower case and singular, such as `oak` or
  `maple`. The app labels a genus group with it.
- `arrangement`: the leaf arrangement the reference states, such as `alternate` or
  `opposite`. The species screen prints it as a fact.
- `planted_states`: states where the species is planted but not native.
- `variety_notes`: an object keyed by variety symbol, with one note each.

## The reference order

Read in this order of preference and stop when you have the fields:

1. The Silvics of North America chapter for the species.
2. The Virginia Tech dendrology fact sheet.
3. The Flora of North America treatment.
4. Sibley.

## The two rules that matter most

**`ref` names what you actually read.** Write the reference you opened, with enough detail
to find it again: the guide, the volume or the page, and the species. Do not list a
reference you did not read. The owner checks each claim against the named page. A wrong
`ref` wastes their time and hides an error.

**Never invent a number you did not read.** `elevation_ft` and `height_ft` come from a
reference. When no reference gives a number, say so to the owner and leave the file
undrafted. A guessed number reads exactly like a checked one, and the owner cannot tell
them apart.

The same rule holds for `habitat` and `range.text`. Write what the source says, in your own
short words.

## What this skill does not do

- It does not overwrite a file that already exists.
- It does not write any fetched field: `scientific`, `common[0]`, `family`, `genus`,
  `native_status`, `varieties`, `range.states`, `section`, `inat_taxon_id`, or `inat_name`.
  A script fetches those, and an unknown field fails the build.
- It does not edit `content/species.json`. The build writes that.
- It does not write confusion edges. The `edges-draft` skill does that.
- It does not commit.
````

- [ ] **Step 4: Create `.claude/skills/edges-draft/SKILL.md`**

````markdown
---
name: edges-draft
description: Use when drafting confusion edges for a Dendro content run and appending them to `content/confusion.json`.
---

# Edges draft

A confusion edge is a pair of species that a learner mixes up, on one channel, with one
sentence that separates each from the other. You draft edges from named references and
append them to `content/confusion.json`.

## Inputs

- The run's species list, from `pipeline/runs/<name>/run.json`, field `species`.
- The bucket, from the same file, field `bucket`.
- The current `content/species.json`, for the records that exist.
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

For `simple_lobed` in v0, draft 15 to 25 edges. Below 15 the distractor pool is thin. Above
25 the owner's read gets long.

## The rules

**Both symbols are in this run's species list.** Write an edge only for two symbols that
`run.json` names under `species`. A pair from another run is not yours to draft, and the
owner reviews this run's edges against this run's references.

**Both `a` and `b` must be in `content/species.json`.** Check each symbol in that file
before you write the edge. The validator rejects an edge whose `a` or `b` is missing, and
the build fails. A species the run dropped, or one with no authored file, has no record.

**Each side names a feature a person can see in the field.** Write what the person holds in
their hand or sees on the trunk: the depth of a sinus, the length of a bristle tip, the
color of a bud, the texture of the bark. Do not write a range statement, a habitat, a bloom
date, or a microscope feature. The learner is looking at one photo.

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

## When you finish

Tell the caller how many edges you appended. The `content-run` skill then runs
`node pipeline/cli.ts build <name>` again, so the validator reads the new edges before the
report. An edge that names a missing species fails that build.

## What this skill does not do

- It does not create or edit a species record.
- It does not rename or remove an existing edge. Edges are appended.
- It does not write an edge for a species that is not in `content/species.json`.
- It does not write an edge for a symbol outside this run's species list.
- It does not run the validator. `cli build` does that.
- It does not commit.
````

- [ ] **Step 5: Check the four skills are in place**

Run: `ls .claude/skills/content-run/SKILL.md .claude/skills/photo-check/SKILL.md .claude/skills/species-draft/SKILL.md .claude/skills/edges-draft/SKILL.md`
Expected: the four paths print, one per line.

Run: `head -4 .claude/skills/*/SKILL.md`
Expected: four blocks. Each opens with `---`, then `name:` equal to the directory name,
then `description:` starting with `Use when`.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills && git commit -m "docs: add the four content pipeline agent skills" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Dev dependencies, the CLI entry, the real resizer, and the real object storage client

This is the first task that installs packages. Tasks 1 to 15 run with no `node_modules`,
and the default pipeline suite keeps that property: `sharp` and the S3 client appear only
in `pipeline/tests_live/`, which runs under its own script.

This task also creates `pipeline/cli.ts`, the entry point. Tasks 13 and 14 put every
handler in `pipeline/lib/commands.ts` and export `runCommand` and `CliDeps`. The entry
builds the real `CliDeps` and hands over the argv. It is the one place the pipeline reaches
for a global: `process.argv`, `process.env`, `process.cwd`, the clock, `fetch`, and
`spawnSync` are read here and nowhere else.

**Files:**
- Modify: `package.json` (the `scripts` block; `npm install --save-dev` writes `devDependencies`)
- Create: `pipeline/cli.ts`
- Create: `pipeline/lib/sharp_resizer.ts`
- Create: `pipeline/lib/s3_storage.ts`
- Test: `pipeline/tests_live/sharp_resizer.test.ts`
- Test: `pipeline/tests_live/s3_storage.test.ts`

`.gitignore` needs no change. It already holds `node_modules/`, `pipeline/cache/`, `.env`,
and `.env.*`.

**Interfaces:**
- Consumes:
  - Task 13: `runCommand(argv: string[], deps: CliDeps): Promise<number>` and `interface CliDeps` from `pipeline/lib/commands.ts`.
  - Task 13: `type Exec = (command: string, args: string[]) => { code: number; out: string }` from `pipeline/lib/run.ts`.
  - Task 10: `type Resize = (bytes: Uint8Array, maxSide: number, quality: number) => Promise<Uint8Array>`, `MAX_SIDE` (1200), and `JPEG_QUALITY` (82) from `pipeline/lib/images.ts`.
  - Task 10: `interface Storage { head(key: string): Promise<boolean>; put(key: string, bytes: Uint8Array, contentType: string): Promise<void>; remove(key: string): Promise<void> }` from `pipeline/lib/storage.ts`.
  - Task 1: `createHttp(options: HttpOptions): Http` from `pipeline/lib/http.ts`, with `cacheDir`, `fetchImpl`, and `refresh`.
  - The app: `validateContent(raw)` and `CDN_BASE` from `app/logic/content.js`, on `main` today.
- Produces:
  - `pipeline/cli.ts`: the `main` guard. No exported name. `node pipeline/cli.ts <command> [flags]` is the whole surface.
  - `pipeline/lib/sharp_resizer.ts`: `export const sharpResize: Resize`.
  - `pipeline/lib/s3_storage.ts`: `export interface S3Config { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string }`, `export function s3ConfigFromEnv(env: Record<string, string | undefined>): S3Config`, `export function s3Storage(config: S3Config): Storage`.
  - `package.json`: the scripts `test:pipeline`, `test:live`, and `test:all`, and three dev dependencies.

- [ ] **Step 1: Add the three test scripts to `package.json`**

Find this block:

```json
  "scripts": {
    "test": "node --test \"tests/**/*.test.js\"",
    "validate": "node scripts/validate_content.js content",
    "validate:dev": "node scripts/validate_content.js content_dev --local-images content_dev/images",
    "images:dev": "node scripts/make_placeholder_jpegs.js"
  },
```

Replace it with:

```json
  "scripts": {
    "test": "node --test \"tests/**/*.test.js\"",
    "test:pipeline": "node --test \"pipeline/tests/**/*.test.ts\"",
    "test:live": "node --test \"pipeline/tests_live/**/*.test.ts\"",
    "test:all": "npm test && npm run test:pipeline && npm run test:live",
    "validate": "node scripts/validate_content.js content",
    "validate:dev": "node scripts/validate_content.js content_dev --local-images content_dev/images",
    "images:dev": "node scripts/make_placeholder_jpegs.js"
  },
```

`test:pipeline` is the default pipeline suite. It runs with no `node_modules`. `test:live`
is the suite that needs the two installed packages, and it is separate so a machine or a CI
job without an install can still run everything else.

- [ ] **Step 2: Install the three dev dependencies**

Run: `npm install --save-dev sharp @aws-sdk/client-s3 @types/node`

Expected: npm prints the number of packages it added and audited, then a line about
vulnerabilities. It writes `devDependencies` into `package.json` and writes
`package-lock.json`. `sharp` ships prebuilt binaries for Windows, macOS, and Linux, so no
compiler runs.

Commit whatever versions npm resolves. Do not pin a version by hand.

Run: `node -e "const p=require('./package.json');console.log(Object.keys(p.devDependencies).sort().join(' '))"`
Expected: `@aws-sdk/client-s3 @types/node sharp`

- [ ] **Step 3: Write the failing test for the resizer**

The test builds its own JPEGs with `sharp`, so it needs no fixture and no network. It reads
the two constants from `images.ts`, so the sizes in the test and the sizes in the build can
never disagree.

`pipeline/tests_live/sharp_resizer.test.ts`:

```ts
// This file needs node_modules. It lives outside pipeline/tests/ so the default
// pipeline suite stays runnable with nothing installed. Run it with npm run test:live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { JPEG_QUALITY, MAX_SIDE } from '../lib/images.ts';
import { sharpResize } from '../lib/sharp_resizer.ts';

async function makeJpeg(width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 120, b: 60 } },
  }).jpeg().toBuffer();
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

test('an image wider than the maximum comes back at the maximum long side', async () => {
  const input = await makeJpeg(MAX_SIDE * 2, MAX_SIDE);
  const out = await sharpResize(input, MAX_SIDE, JPEG_QUALITY);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, MAX_SIDE);
  assert.equal(meta.height, MAX_SIDE / 2);
});

test('an image smaller than the maximum keeps its size', async () => {
  const input = await makeJpeg(400, 300);
  const out = await sharpResize(input, MAX_SIDE, JPEG_QUALITY);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 400);
  assert.equal(meta.height, 300);
});

test('the output is a jpeg in a Uint8Array', async () => {
  const input = await makeJpeg(800, 600);
  const out = await sharpResize(input, MAX_SIDE, JPEG_QUALITY);
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

  const out = await sharpResize(input, MAX_SIDE, JPEG_QUALITY);
  const after = await sharp(out).metadata();
  assert.equal(after.exif, undefined);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test pipeline/tests_live/sharp_resizer.test.ts`
Expected: FAIL, 1 file, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\sharp_resizer.ts' imported from <repo>\pipeline\tests_live\sharp_resizer.test.ts`.

- [ ] **Step 5: Create `pipeline/lib/sharp_resizer.ts`**

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

- [ ] **Step 6: Run the resizer test to verify it passes**

Run: `node --test pipeline/tests_live/sharp_resizer.test.ts`
Expected: PASS, 4 tests, `# fail 0`.

- [ ] **Step 7: Write the failing test for the S3 configuration**

The test reads the environment map it passes in. It creates no client and reaches no
bucket. Task 19 proves the client against the live bucket by hand.

`pipeline/tests_live/s3_storage.test.ts`:

```ts
// This file needs node_modules, because s3_storage.ts imports the AWS client at the
// top level. Run it with npm run test:live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { s3ConfigFromEnv } from '../lib/s3_storage.ts';

const FULL_ENV: Record<string, string> = {
  DENDRO_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  DENDRO_S3_REGION: 'auto',
  DENDRO_S3_BUCKET: 'dendro-images',
  DENDRO_S3_ACCESS_KEY_ID: 'key-id',
  DENDRO_S3_SECRET_ACCESS_KEY: 'secret',
};

test('s3ConfigFromEnv reads the five variables into the camelCase fields', () => {
  const config = s3ConfigFromEnv({ ...FULL_ENV, OTHER: 'ignored' });
  assert.deepEqual(config, {
    endpoint: 'https://account.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'dendro-images',
    accessKeyId: 'key-id',
    secretAccessKey: 'secret',
  });
});

test('s3ConfigFromEnv names every missing variable and no other', () => {
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

test('s3ConfigFromEnv counts a blank value as missing', () => {
  // An unset variable in a .env file reads as an empty string, which would
  // otherwise build a client that fails on the first request.
  assert.throws(
    () => s3ConfigFromEnv({ ...FULL_ENV, DENDRO_S3_ACCESS_KEY_ID: '   ' }),
    (error: Error) => error.message.includes('DENDRO_S3_ACCESS_KEY_ID'),
  );
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `node --test pipeline/tests_live/s3_storage.test.ts`
Expected: FAIL, 1 file, `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<repo>\pipeline\lib\s3_storage.ts' imported from <repo>\pipeline\tests_live\s3_storage.test.ts`.

- [ ] **Step 9: Create `pipeline/lib/s3_storage.ts`**

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
  accessKeyId: string;
  secretAccessKey: string;
}

// The field names are camelCase, as every TypeScript identifier in this repo is.
// The variable names are the five the owner sets in .env.
const ENV_NAMES: Record<keyof S3Config, string> = {
  endpoint: 'DENDRO_S3_ENDPOINT',
  region: 'DENDRO_S3_REGION',
  bucket: 'DENDRO_S3_BUCKET',
  accessKeyId: 'DENDRO_S3_ACCESS_KEY_ID',
  secretAccessKey: 'DENDRO_S3_SECRET_ACCESS_KEY',
};

export function s3ConfigFromEnv(env: Record<string, string | undefined>): S3Config {
  const missing: string[] = [];
  const read = (name: string): string => {
    const value = env[name];
    if (value === undefined || value.trim() === '') {
      missing.push(name);
      return '';
    }
    return value;
  };
  // Built field by field, in this order, so the message names the variables in
  // the order the owner set them and no cast is needed.
  const config: S3Config = {
    endpoint: read(ENV_NAMES.endpoint),
    region: read(ENV_NAMES.region),
    bucket: read(ENV_NAMES.bucket),
    accessKeyId: read(ENV_NAMES.accessKeyId),
    secretAccessKey: read(ENV_NAMES.secretAccessKey),
  };
  if (missing.length > 0) {
    throw new Error(`missing environment variables: ${missing.join(', ')}`);
  }
  return config;
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
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
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
      // No ACL: R2 serves the bucket through a public custom domain, not per-object ACLs.
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

`head` returns `false` on a `NotFound` error or a 404 status, and rethrows anything else.
An access error must stop the run, not look like a missing object.

- [ ] **Step 10: Run the live suite to verify it passes**

Run: `npm run test:live`
Expected: PASS, 2 files, 7 tests, `# fail 0`.

- [ ] **Step 11: Create `pipeline/cli.ts`**

```ts
// The entry point. It builds the real CliDeps and hands the argv to runCommand.
// Every global the pipeline reads is read here: process.argv, process.env,
// process.cwd, the clock, fetch, and spawnSync. No lib/ module reads one.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The one import that crosses from pipeline/ into app/. The validator is shared,
// never copied, and CDN_BASE is the app's own value, so the two cannot drift.
import { CDN_BASE, validateContent } from '../app/logic/content.js';
import { runCommand, type CliDeps } from './lib/commands.ts';
import { createHttp } from './lib/http.ts';
import type { Resize } from './lib/images.ts';
import type { Exec } from './lib/run.ts';
import type { Storage } from './lib/storage.ts';

const nodeExec: Exec = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.error !== undefined) {
    return { code: 1, out: `${out} ${result.error.message}`.trim() };
  }
  return { code: result.status ?? 1, out };
};

// sharp and the S3 client load on first use. CI runs `ids check` with no
// node_modules, so neither package may be imported at the top of this file.
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
  // The five DENDRO_S3_* values live in .env at the repo root, which git ignores.
  // A machine that only runs ids check needs no .env, and CI has none, so a
  // missing file is not an error. Any other read error still stops the command.
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }

  // imageUrl builds `${base}img/${hash}.jpg`, so a base with no trailing slash
  // publishes a report full of broken links. Stop before any command runs.
  if (!CDN_BASE.endsWith('/')) {
    console.error(`CDN_BASE is "${CDN_BASE}". It must end in a slash.`);
    process.exitCode = 1;
    return;
  }

  const argv = process.argv.slice(2);
  const root = process.cwd();
  // --refresh belongs to the Http, not to a command, so the guard reads it here
  // and every command of this process gets a cache that honours it.
  const refresh = argv.includes('--refresh');
  const deps: CliDeps = {
    root,
    exec: nodeExec,
    http: createHttp({
      cacheDir: path.join(root, 'pipeline', 'cache'),
      fetchImpl: fetch,
      refresh,
    }),
    storage: lazyStorage(),
    resize: lazyResize,
    validate: validateContent,
    cdn_base: CDN_BASE,
    now: () => new Date(),
  };
  process.exitCode = await runCommand(argv, deps);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

`app/logic/content.js` carries no type declarations. Node strips the types and never checks
them, so the import works as it stands. A reader who later adds a compile step adds a
declaration file for that one module.

- [ ] **Step 12: Run the entry with no command**

Run: `node pipeline/cli.ts`
Expected: the usage text on stderr, and exit code 1.

Run: `node pipeline/cli.ts ids check`
Expected: `content ids are append-only`, and exit code 0.

Run: `echo $?`
Expected: `0`.

- [ ] **Step 13: Prove the default suite and `ids check` need no `node_modules`**

The append-only check runs in CI, where nothing installs packages. Move the directory
aside, run both, and move it back.

Run: `mv node_modules node_modules_off`
Expected: no output.

Run: `node pipeline/cli.ts ids check`
Expected: `content ids are append-only`, exit code 0. The lazy imports never run, so
neither `sharp` nor the S3 client is loaded.

Run: `npm run test:pipeline`
Expected: PASS, every file under `pipeline/tests/`, `# fail 0`.

Run: `npm run test:live`
Expected: FAIL, `Cannot find package 'sharp'`. That failure is the point of the split: only
this suite needs the install.

Run: `mv node_modules_off node_modules`
Expected: no output.

- [ ] **Step 14: Run every suite**

Run: `npm run test:all`
Expected: three suites in order, each with `# fail 0`: the app suite from
`tests/**/*.test.js`, the pipeline suite from `pipeline/tests/**/*.test.ts`, then the live
suite from `pipeline/tests_live/**/*.test.ts`. `npm` exits 0. A failing suite stops the
chain, so a later suite never hides an earlier failure.

- [ ] **Step 15: Commit**

```bash
git add package.json package-lock.json pipeline/cli.ts pipeline/lib/sharp_resizer.ts pipeline/lib/s3_storage.ts pipeline/tests_live && git commit -m "feat: add the CLI entry, the sharp resizer, and the s3 storage client" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Folded into Task 19

`CDN_BASE` in `app/logic/content.js` holds the r2.dev development URL of the
`dendro-images` bucket, which serves images today. Switching it to `https://img.learndendro.com/`
is only correct after the custom domain is bound, so that edit moved into Task 19, Step 5,
next to the step that binds the domain. The task numbering stays 1 to 19.

---

### Task 18: The append-only check in CI, then the merge to `main`

**Files:**
- Modify: `.github/workflows/check.yml`

**Interfaces:**
- Consumes:
  - Task 14: the `ids check` handler, and Choice 24, `--base <ref>` defaulting to `main`.
  - Task 16: `pipeline/cli.ts`, the entry that CI runs.
  - Task 11: `appendOnlyErrors`, whose message is
    `<id> is in the published <file> and is gone from the new content`.
- Produces:
  - `.github/workflows/check.yml`: a `check` job of seven steps. A pull request that drops a published ID fails.
  - `main` carrying `pipeline/`, through a merged pull request. `cli run init` branches from `main`, so Task 19 cannot start until this merge lands.

Spec section 11 puts the append-only check in `cli build` and in CI. `cli build` has it from
Task 14. This adds it to the pull-request job, so an ID cannot leave `main` even when
someone edits `content/` by hand.

Two details drive the shape of the step:

- `actions/checkout@v7` fetches one commit by default, and on a pull request it checks out a
  merge ref, so the local branch `main` does not exist. The step fetches `origin/main` and
  passes it with `--base`.
- The check needs the *published* content, which is what `main` holds. On a pull request
  that is the base branch. On a push to `main`, `origin/main` after the fetch is the pushed
  commit itself, so the check compares the content to itself and passes. That is correct:
  the gate belongs on the pull request, which is the only way content reaches `main`.

The job runs no `npm ci`. The entry loads `sharp` and the S3 client only when a command
needs them, and `ids check` needs neither, so the step runs on a bare checkout.

- [ ] **Step 1: Read the workflow**

Run: `cat .github/workflows/check.yml`
Expected: two jobs, `check` and `deploy`. The `check` job has five steps:
`actions/checkout@v7`, `actions/setup-node@v7` with `node-version: '24'`, `Run the tests`,
`Validate the live content`, `Validate the fixture content`.

- [ ] **Step 2: Add the fetch depth**

Edit `.github/workflows/check.yml`. In the `check` job, find these two lines:

```yaml
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
```

Replace them with:

```yaml
      - uses: actions/checkout@v7
        with:
          # The append-only check reads the published content from main. A default
          # checkout fetches one commit and no main ref, so the check would have
          # nothing to compare against.
          fetch-depth: 0
      - uses: actions/setup-node@v7
```

The `with: node-version: '24'` block that follows `setup-node@v7` stays as it is, with its
comment. Only the `check` job changes; the `deploy` job keeps its own bare
`actions/checkout@v7`.

- [ ] **Step 3: Add the two append-only steps**

In the same job, after the `Validate the fixture content` step, add:

```yaml
      - name: Fetch the published content
        run: git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
      - name: Check the content ids are append-only
        # A card ID is a foreign key in other people's review logs. Once an ID has
        # shipped it never leaves the content, retired or not.
        run: node pipeline/cli.ts ids check --base origin/main
```

- [ ] **Step 4: Read the file back**

Run: `cat .github/workflows/check.yml`
Expected: the `check` job now has seven steps in this order: `actions/checkout@v7` with
`fetch-depth: 0`, `actions/setup-node@v7`, `Run the tests`, `Validate the live content`,
`Validate the fixture content`, `Fetch the published content`,
`Check the content ids are append-only`. The `deploy` job is unchanged.

- [ ] **Step 5: Run the check locally the way CI runs it**

Run: `git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main`
Expected: either `From <remote>` with a line for `main`, or no output when it is current.

Run: `node pipeline/cli.ts ids check --base origin/main`
Expected: `content ids are append-only`, exit code 0.

- [ ] **Step 6: Commit the workflow**

```bash
git add .github/workflows/check.yml && git commit -m "ci: check that content ids are append-only" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 7: Open the pull request from `pipeline` to `main`**

```bash
git push -u origin pipeline
gh pr create --base main --head pipeline --title "The content pipeline" --body "Builds pipeline/, the four agent skills, and the append-only check in CI. The first live run is Task 19."
```

Expected: `gh` prints the pull request URL.

Run: `gh pr checks --watch`
Expected: the `check` job passes all seven steps. The `deploy` job does not run, because
the branch is not `main`.

- [ ] **Step 8: Prove the gate fails on a dropped ID**

`content/species.json` is `{}` on `main`, so no species record exists to delete.
`content/concepts.json` holds 21 rows, and each one is a published ID. Delete one, watch the
gate fail, then revert.

Edit `content/concepts.json` and delete the whole `needles` row, the first element of the
array. Keep the JSON valid.

Run: `node pipeline/cli.ts ids check --base origin/main`
Expected: exit code 1 and this line:
`concept:leaf/needles is in the published concepts.json and is gone from the new content`.

```bash
git commit -am "test: drop a concept row to exercise the CI gate" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

Run: `gh pr checks --watch`
Expected: the `check` job fails, and only at
`Check the content ids are append-only`. The three steps before it pass, because the
content set is still valid; it has simply lost an ID.

```bash
git revert --no-edit HEAD
git push
```

Run: `node pipeline/cli.ts ids check --base origin/main`
Expected: `content ids are append-only`, exit code 0.

Run: `gh pr checks --watch`
Expected: the `check` job passes all seven steps.

- [ ] **Step 9: Human: merge the pull request**

Open the pull request and click Merge. This is the owner's call, not an agent's.

Then bring the local `main` up to date:

```bash
git checkout main && git pull
```

Run: `ls pipeline/cli.ts .github/workflows/check.yml`
Expected: both paths print, on `main`.

`cli run init` creates each run branch from `main`, so every command Task 19 runs needs
`pipeline/` on `main`. That is why this merge is the last step of this task and not the
first step of the next one.

---

### Task 19: The first public run

Every earlier task ran offline against fixtures a person wrote by hand from the documented
field shapes. This task points the pipeline at the live sources for the first time. It is
mostly a checklist, because most of it is a person reading a page, confirming a value, or
clicking Merge. Each item is a fact the plan could not check without the network.

Read the prerequisites list in the plan header before Step 1, and confirm every line of it.
Each step below states its own instruction anyway.

The steps run in this order for a reason:

- The bucket answers before `CDN_BASE` points at it.
- `run init` comes before `species list`, because `species list` reads the run's scope.
- `pipeline/data/plants_ids.json` is read only after `species list` has written it.
- The Commons, iNaturalist observation, and subordinate-taxa fixtures are recorded only
  after the first `photos fetch` has put those responses in the cache.

**Files:**
- Modify: `app/logic/content.js` (the `CDN_BASE` value and its comment, in Step 5)
- Modify: `tests/content.test.js` (two assertions, in Step 5)
- Create: `.env` (never committed; `.gitignore` already holds `.env` and `.env.*`)
- Modify: `pipeline/lib/http.ts` (the contact URL, only if it fails Step 1)
- Modify: `pipeline/data/quercus_sections.json` (the full table, written by the CLI)
- Modify: `pipeline/data/inat_terms.json` (the confirmed flowering value, written by the CLI)
- Modify: `pipeline/data/plants_ids.json` (written by `species list`)
- Modify: `pipeline/lib/fna.ts` (the section page pairing, only if the live pages disagree)
- Modify: `pipeline/lib/plants.ts` (the part-code table and the checklist name rule, only if the live data disagrees)
- Modify: `pipeline/tests/fixtures/*` (recorded responses in place of the hand-built ones)

**Interfaces:**
- Consumes:
  - Task 1: `USER_AGENT` and `CONTACT_URL` from `pipeline/lib/http.ts`.
  - Task 13: `run init`, `species list`, `photos fetch`, `photos add`, `photos verdict`, `data sections`, `data inat-terms`.
  - Task 14: `build`, `report`, `run pr`, `run finish`, `images retire`, `ids check`.
  - Task 15: the `content-run`, `photo-check`, `species-draft`, and `edges-draft` skills.
  - Task 16: `pipeline/cli.ts`, `s3Storage`, `s3ConfigFromEnv`, `sharpResize`.
  - Task 18: `main` carrying `pipeline/`, and the CI gate.
  - The app: `CDN_BASE` and `imageUrl` from `app/logic/content.js`.
- Produces:
  - A bucket and a custom domain that serve `img/<hash>.jpg`.
  - `CDN_BASE` on the custom domain, with the app test that holds it there.
  - `.env` on the owner's machine, holding the five `DENDRO_S3_*` values.
  - `pipeline/data/quercus_sections.json` and `pipeline/data/inat_terms.json` built from the live sources.
  - Fixtures under `pipeline/tests/fixtures/` that are real recordings.
  - Two merged content runs, `simple_lobed_co` and `concepts_v0`.
  - One rehearsed takedown.

- [ ] **Step 1: Confirm the User-Agent contact URL**

Spec section 10 says Wikimedia's policy expects the address in the User-Agent to reach a
person who can answer, and that a placeholder will not do. Without a compliant User-Agent,
Commons drops from 200 requests per minute to 10.

Run: `node -e "import('./pipeline/lib/http.ts').then(m => console.log(m.USER_AGENT))"`
Expected: `dendro-pipeline/0.1.0 (https://github.com/jdenn0514/dendro)`

Open that URL in a browser. Confirm all three:

1. The page loads and is not a 404.
2. The repository has an open issues tab, or a README that names an address.
3. A stranger reading the page can work out how to reach the owner about a photo.

When any of the three fails, edit `CONTACT_URL` in `pipeline/lib/http.ts` to an address that
passes, and run `node --test pipeline/tests/http.test.ts`. That test asserts the shape of
the string, not the host, so it stays green.

Do not run any other step until this one passes. Every later step makes live requests that
carry this string.

- [ ] **Step 2: Human: set up the bucket, the domain, the lifecycle rule, and the token**

This is five items in the Cloudflare dashboard, done once, by the owner. An agent cannot
click them and must not be given the token.

1. Confirm the R2 bucket `dendro-images` exists. It does today: `CDN_BASE` in
   `app/logic/content.js` holds its r2.dev development URL. Read the bucket name in the
   dashboard and confirm it matches.
2. Confirm the lifecycle rule on the prefix `review/`: delete an object 30 days after it
   is written. It exists today, named `expire-review`. Confirm that `img/` carries no
   rule other than Cloudflare's own `Default Multipart Abort Rule`, which aborts a
   half-finished upload after 7 days. Objects under `img/` are permanent.
3. Confirm the zone `learndendro.com` is active in this same Cloudflare account. The owner
   bought it through Cloudflare Registrar on 2026-09-23, so it is a zone already. R2 binds
   a custom domain only to a zone in the account that owns the bucket. Decision 27 records
   the host.
4. Under the bucket's Settings, connect the custom domain `img.learndendro.com`. Cloudflare
   rate-limits the r2.dev host and does not cache it, so the public app needs the custom
   domain. Step 5 writes it into `CDN_BASE`.
5. Create an API token scoped to this one bucket, with object read and write. Copy the id
   and the secret once; the dashboard shows the secret one time.

- [ ] **Step 3: Human: write the `.env` file**

The token is never committed. `.gitignore` already holds `.env` and `.env.*`.

Create `.env` at the repo root with these five lines, and fill each value:

```
DENDRO_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
DENDRO_S3_REGION=auto
DENDRO_S3_BUCKET=dendro-images
DENDRO_S3_ACCESS_KEY_ID=<the token id>
DENDRO_S3_SECRET_ACCESS_KEY=<the token secret>
```

`pipeline/cli.ts` reads the file with `process.loadEnvFile()` on every command, so no shell
export is needed and no value reaches the shell history.

Run: `node -e "process.loadEnvFile(); import('./pipeline/lib/s3_storage.ts').then(m => console.log(m.s3ConfigFromEnv(process.env).bucket))"`
Expected: `dendro-images`. A missing or blank value throws, and the message names the
variable.

Run: `git status --short`
Expected: no line for `.env`.

- [ ] **Step 4: Prove the bucket round-trips and the domain serves**

First the S3 API, through the same client the pipeline uses:

```bash
node -e "process.loadEnvFile(); import('./pipeline/lib/s3_storage.ts').then(async m => { const s = m.s3Storage(m.s3ConfigFromEnv(process.env)); await s.put('review/_probe.jpg', new Uint8Array([1,2,3]), 'image/jpeg'); console.log('head', await s.head('review/_probe.jpg')); await s.remove('review/_probe.jpg'); console.log('head after remove', await s.head('review/_probe.jpg')); })"
```

Expected: `head true`, then `head after remove false`.

Then the custom domain, over the `img/` prefix the app reads:

```bash
node -e "process.loadEnvFile(); import('./pipeline/lib/s3_storage.ts').then(async m => { const s = m.s3Storage(m.s3ConfigFromEnv(process.env)); await s.put('img/_probe.jpg', new Uint8Array([1,2,3]), 'image/jpeg'); })"
```

Run: `curl -sI https://img.learndendro.com/img/_probe.jpg | head -1`
Expected: `HTTP/2 200`. A 403 means the custom domain is not bound. A 404 means the key or
the bucket is wrong. The key is new, so no cache can answer for it and the 200 is the
binding itself.

```bash
node -e "process.loadEnvFile(); import('./pipeline/lib/s3_storage.ts').then(async m => { const s = m.s3Storage(m.s3ConfigFromEnv(process.env)); await s.remove('img/_probe.jpg'); })"
```

- [ ] **Step 5: Point `CDN_BASE` at the custom domain**

The domain now answers, so the app can read through it. This is the edit that Task 17 used
to hold.

In `app/logic/content.js`, find these four lines:

```js
// The r2.dev development URL of the dendro-images bucket. Cloudflare rate-limits this
// host and does not cache it, so a custom domain replaces it before the app is public.
// See the pipeline spec, section 2.
export const CDN_BASE = 'https://pub-54f0f3ab05464e9db548cc8568c073bb.r2.dev/';
```

Replace them with:

```js
// The custom domain bound to the dendro-images bucket. The r2.dev host it replaces is
// rate-limited and uncached, so it was for development only.
// See the pipeline spec, section 2.
export const CDN_BASE = 'https://img.learndendro.com/';
```

The trailing slash is part of the value. `imageUrl(photo, CDN_BASE)` returns
`<base>img/<hash>.jpg`, so a base with no slash builds `...appimg/`. `pipeline/cli.ts`
checks the slash and exits 1 before any command runs.

In `tests/content.test.js`, find this line in the `imageUrl` test:

```js
  assert.ok(CDN_BASE.endsWith('/'));
```

Replace it with these three:

```js
  assert.ok(CDN_BASE.endsWith('/'));
  assert.ok(CDN_BASE.startsWith('https://'));
  assert.ok(!CDN_BASE.includes('r2.dev'));
```

The three assertions together say the app reads images over TLS, from the cached custom
domain, with a base the URL builder can append to.

Run: `npm test`
Expected: the app suite passes, `# fail 0`.

Run: `node pipeline/cli.ts ids check`
Expected: `content ids are append-only`, exit code 0. The entry read the new `CDN_BASE` and
accepted it.

```bash
git checkout -b live-prep
git add app/logic/content.js tests/content.test.js && git commit -m "feat: serve images from the img.learndendro.com custom domain" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Build the oak section table**

The committed table ships with 12 seed rows. Flora of North America has 90 species across
three pages, and the pairing of taxon id to section in `SECTION_PAGES` was read off the
spec's list, not off the live pages. A wrong pairing mislabels every oak, so check it before
you keep the output.

Run: `node pipeline/cli.ts data sections --refresh`
Expected: a line naming the row count and the file, with a count near 90.

Then confirm the pairing by hand. Open each of the three pages in a browser and read the
section name at the top. The site's certificate is self-signed, so the URLs are `http://`:

- `http://www.efloras.org/browse.aspx?flora_id=1&start_taxon_id=302020`
- `http://www.efloras.org/browse.aspx?flora_id=1&start_taxon_id=302027`
- `http://www.efloras.org/browse.aspx?flora_id=1&start_taxon_id=302029`

Run: `node -e "const j=JSON.parse(require('fs').readFileSync('pipeline/data/quercus_sections.json','utf8'));console.log(j['Quercus rubra'], j['Quercus alba'], j['Quercus chrysolepis'])"`
Expected: `Lobatae Quercus Protobalanus`. Red oak is Lobatae, white oak is Quercus, canyon
live oak is Protobalanus. Any other answer means `SECTION_PAGES` pairs the ids wrongly. Fix
the pairing in `pipeline/lib/fna.ts`, run `data sections --refresh` again, and run
`node --test pipeline/tests/fna.test.ts`.

- [ ] **Step 7: Confirm the iNaturalist flowering value**

`pipeline/data/inat_terms.json` ships `{ "flowering_value_id": 13 }`. Spec section 3 says
the value is read off a live observation, because the `controlled_terms` endpoint did not
answer. `cli data inat-terms` decides the value itself from the live annotations.

Run: `node pipeline/cli.ts data inat-terms --refresh`
Expected: one line, `flowering_value_id is <n>`, and the file rewritten with that value.

When the command exits 1, the live annotations were ambiguous and it says so. Then open one
iNaturalist observation that carries a Flowering annotation, read the value id off its
annotations, write it into `pipeline/data/inat_terms.json` by hand, and say in the commit
message which observation you read.

```bash
git add pipeline/data/quercus_sections.json pipeline/data/inat_terms.json && git commit -m "feat: build the oak section table and the inat terms from the live sources" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 8: Human: merge the prep branch into `main`**

`cli run init` creates the run branch from `main`, so the new `CDN_BASE` and the two data
tables must be on `main` before the first run starts.

```bash
git push -u origin live-prep
gh pr create --base main --head live-prep --title "Serve images from img.learndendro.com and build the live data tables" --body "The custom domain is bound and answers. The oak section table and the inat flowering value come from the live sources."
```

Run: `gh pr checks --watch`
Expected: the `check` job passes all seven steps.

Open the pull request and click Merge. Then:

```bash
git checkout main && git pull
```

Run: `node -e "import('./app/logic/content.js').then(m => console.log(m.CDN_BASE))"`
Expected: `https://img.learndendro.com/`, on `main`.

- [ ] **Step 9: Init `simple_lobed_co` and list its species**

Spec section 12's second run comes first here, because only a bucket run runs
`species list`, and `species list` is what writes `pipeline/data/plants_ids.json` and caches
the PLANTS checklist. Steps 10 and 11 read both.

```bash
node pipeline/cli.ts run init simple_lobed_co --bucket simple_lobed --states CO,UT,NM,WY,NE,KS --genera Acer,Quercus,Platanus,Liquidambar,Liriodendron --include ACPL,QURU,ACSA2,PLAC,QUPA2 --channels leaf,bark,fruit
```

Expected: `run simple_lobed_co created on branch content/simple_lobed_co`.

The five `include` symbols are the planted species: Norway maple, red oak, silver maple,
London plane, and pin oak. `run init` does not check them, and `species list` stops the run
on an unknown symbol with `unknown PLANTS symbol in include: <symbol>`. Look each one up at
`https://plants.usda.gov/plant-profile/<SYMBOL>` and correct any that 404.

```bash
node pipeline/cli.ts species list simple_lobed_co
```

Expected: `<n> species kept, <m> dropped`, then one line per fetch failure, and a commit on
`content/simple_lobed_co`. Read each `<SYMBOL>: no profile` line: that species reaches no
later step.

Run: `node -e "const j=JSON.parse(require('fs').readFileSync('pipeline/data/plants_ids.json','utf8'));console.log(Object.keys(j).length, JSON.stringify(j.QUGA))"`
Expected: a count of at least the kept species, and a `QUGA` entry that holds an `id` number
and a `scientific` name.

- [ ] **Step 10: Check the PLANTS part-code table against a real response**

`PART_CODE_CHANNELS` in `pipeline/lib/plants.ts` maps the two- and three-letter part codes in
a PLANTS image filename to a channel. The table was written from the codes the plan could
justify, not from a live response. A code the table does not hold gives a `null` hint, which
is safe: the approval agent assigns the channel anyway. A code mapped to the wrong channel is
not safe, because the hint biases the agent.

```bash
curl -s -H "User-Agent: dendro-pipeline/0.1.0 (https://github.com/jdenn0514/dendro)" "https://plantsservices.sc.egov.usda.gov/api/PlantImages?plantId=$(node -e "console.log(JSON.parse(require('fs').readFileSync('pipeline/data/plants_ids.json','utf8'))['QUGA'].id)")"
```

Read the file paths in the response. For each distinct part code:

1. Open the image.
2. Confirm the channel the table assigns it.
3. Add a missing code to `PART_CODE_CHANNELS`, or correct a wrong one.

Run: `node --test pipeline/tests/plants.test.ts` after any edit.

- [ ] **Step 11: Check the checklist name rule against the real file**

`parseChecklist` runs `splitScientific` on each row. The real `plantlst.txt` writes an
infraspecific name as `Quercus gambelii Nutt. var. gambelii`, with the author in the middle,
and the current rule cuts that to `Quercus gambelii`. That is right for the species row and
wrong for the variety row. Step 9 put the file in `pipeline/cache/`.

Read a handful of infraspecific rows out of the cached checklist and confirm what
`splitScientific` does with each one.

The identity check compares a source page's species name to the PLANTS name and its
synonyms. A variety name cut back to its species name still matches the species, so the
failure mode is a missed distinction, not a wrong approval. Widen `splitScientific` to keep
the infraspecific epithet where the real file needs it, and run
`node --test pipeline/tests/plants.test.ts`.

- [ ] **Step 12: Fetch the photo candidates**

```bash
node pipeline/cli.ts photos fetch simple_lobed_co
```

Expected:
`<n> candidates appended to pipeline/runs/simple_lobed_co/candidates.jsonl, <m> download failures`,
then one line per fetch failure, and a commit.

Run: `node -e "const rows=require('fs').readFileSync('pipeline/runs/simple_lobed_co/candidates.jsonl','utf8').trim().split('\n').map(JSON.parse);const by={};for(const r of rows)by[r.source_key]=(by[r.source_key]??0)+1;console.log(by)"`
Expected: a count for `plants`, `inat`, and `commons`. A source with zero rows means its
parser and the live shape disagree. Read that source's cached response before Step 13.

- [ ] **Step 13: Replace the fixtures with real recordings**

Every fixture under `pipeline/tests/fixtures/` was written by hand from the field shapes the
spec documents. The cache now holds real responses for the same calls: Steps 6 and 7 filled
the FNA and iNaturalist term responses, Step 9 the checklist and the profiles, and Step 12
the Commons listings, the iNaturalist observations, and the subordinate taxa.

For each fixture, find its cached response, copy the body, and trim it to the rows the test
reads:

- `plants_profile_quga.json`, `plants_profile_purple_sage.json`, `plants_profile_quun.json`
- `plants_subordinate_quga.json`, `plants_distribution_quga.csv`, `plants_images_quga.json`
- `plantlst_sample.txt`
- `fna_lobatae.html`, `fna_quercus.html`, `fna_protobalanus.html`
- `inat_taxa_quga.json`, `inat_taxa_empty.json`, `inat_observations_quga.json`
- `commons_category_quga.json`, `commons_category_quga_page2.json`

Run: `node --test "pipeline/tests/**/*.test.ts"` after each fixture.

A test that now fails has found a real difference between the documented shape and the live
one. Fix the parser, not the test, unless the test asserted something the live data does not
carry. Record each difference in the commit message. This is the most valuable output of
this task.

- [ ] **Step 14: Finish the `simple_lobed_co` run**

The parser fixes and the fixtures are in the working tree on `content/simple_lobed_co`. The
CLI commits with `git add -A`, so the next command sweeps them into the run's history and
they reach `main` with the run's pull request.

Walk the `content-run` skill from its step 3: the `species-draft` skill, then
`photos fetch` again if the drafting changed the list, the `photo-check` skill, `build`, the
gap hunt, the `edges-draft` skill, `build` again, `report`, `run pr`, the owner's review, and
`run finish`. The edge target is 15 to 25 for `simple_lobed`.

Watch for the stop rule at the `photo-check` step. It fires when 20 or more candidates have a
verdict and more than a quarter are escalations. When it fires, read the escalations before
you change anything: a high rate on a first run usually means one source's license text does
not match the allowlist, not that the threshold is wrong.

Expected at the end: the pull request merged, `content/species.json` holding the run's
species, and `content/images/manifest.json` holding one row per approved image.

- [ ] **Step 15: Run `concepts_v0`**

Spec section 12's first run: the 21 level-1 categories of the leaf, bark, and fruit channels.
Target 3 to 5 approved images per category, about 70 in total. Each value is the qualified
key `<channel>/<key>` from `content/concepts.json`. The command takes no `--channels`: it
derives the run's channels from the key prefixes, which here are `leaf`, `bark`, and
`fruit`, and it throws when `--channels` is passed as well.

```bash
git checkout main && git pull
node pipeline/cli.ts run init concepts_v0 --concepts leaf/needles,leaf/scale_like,leaf/simple_entire,leaf/simple_toothed,leaf/simple_lobed,leaf/pinnately_compound,leaf/palmately_compound,leaf/fan_strap,bark/smooth,bark/furrowed,bark/plated,bark/shaggy,bark/papery,bark/warty,fruit/samara,fruit/acorn,fruit/nut,fruit/pod,fruit/berry,fruit/capsule,fruit/cone
```

Expected: `run concepts_v0 created on branch content/concepts_v0`. An unknown key exits 1 and
the message names it.

Run: `node -e "const r=JSON.parse(require('fs').readFileSync('pipeline/runs/concepts_v0/run.json','utf8'));console.log(r.concepts.length, [...r.channels].sort().join(','))"`
Expected: `21 bark,fruit,leaf` — the 21 keys, and the three channels the command derived
from their prefixes.

Then edit `pipeline/runs/concepts_v0/run.json` and fill `concept_exemplars` with two or three
exemplar species per key, by PLANTS symbol. The owner makes that choice. `photos fetch` looks
each concept's photos up through its exemplars.

Then walk the `content-run` skill from its step 4, skipping step 3 and step 8: `photos fetch`,
the `photo-check` skill, `build`, the gap hunt, `report`, `run pr`, the owner's review,
`run finish`.

- [ ] **Step 16: Confirm the published site**

After both runs merge, open the deployed site and check three things:

1. A species card shows a photo, and its URL is `https://img.learndendro.com/img/<hash>.jpg`.
2. The browser network tab shows no request to `plants.usda.gov`, `inaturalist.org`, or
   `commons.wikimedia.org`. Every image comes from the CDN, as spec section 1 requires.
3. The credit under each photo prints the author, the source, and the license, and links to
   the origin page.

- [ ] **Step 17: Rehearse a takedown**

A public site with several hundred third-party photos will get an email asking for one to
come down, and the answer has to be same-day. Rehearse it once, on a channel that has several
images, and leave the retirement in place. A retired row never returns, and reverting the
commit would fail the append-only check.

Pick a hash from `content/images/manifest.json`.

```bash
node pipeline/cli.ts images retire <hash> --reason "takedown rehearsal"
```

Expected: `<n> manifest rows retired for <hash>`, a commit, the row still in the manifest
with `retired: true`, `retired_reason`, and `retired_at`, and the object gone from the bucket.

Confirm the object is gone at the source:

```bash
node -e "process.loadEnvFile(); import('./pipeline/lib/s3_storage.ts').then(async m => { const s = m.s3Storage(m.s3ConfigFromEnv(process.env)); console.log('head', await s.head('img/<hash>.jpg')); })"
```

Expected: `head false`. This is the check that settles it: it asks the bucket itself.

Run: `curl -sI https://img.learndendro.com/img/<hash>.jpg | head -1`
Expected: `HTTP/2 404`, or `HTTP/2 200` while Cloudflare still serves a cached copy. The
cached copy is informational only. When an answer has to be immediate, purge that URL in the
Cloudflare dashboard, then run the `curl` again.

Confirm the app still works: the species draws from the rest of that channel's pool, and the
card for that channel is still there.

---

## Where each spec section lands

| Spec section | Tasks |
|---|---|
| 1 scope, what the pipeline is and is not | every task; "What this plan does not build" below |
| 2 the object store, the CDN, the key `img/<hash>.jpg` | 10 (the key and the hash), 14 (the upload), 16 (the real client and the entry), 19 (the bucket, the domain, the switch of `CDN_BASE`) |
| 3 the four sources and their fields | 3 (PLANTS), 4 (FNA), 5 (iNaturalist), 6 (Commons) |
| 4 species record build, enumeration, when a species enters `species.json`, IDs are append-only | 7 (the two layers, their validation, the merge), 3 and 4 and 5 (the fetched fields), 11 (the check), 14 (the build, `carryPublished`, and where a species retires) |
| 5 authored species fields, confusion edges, units and concepts, the license allowlist | 7 (`validateAuthored` and the worked `QUGA.json`), 15 (`species-draft` and `edges-draft`), 2 (the allowlist), 14 (unit rows from the app's `loadContent`) |
| 6 photo candidates per source, the candidate row, caps and dedupe | 2 (the row, `SOURCE_NAMES`), 3 and 5 and 6 (the three sources), 8 (`mergeFound`, `collect`, the caps), 13 (`photos fetch` and `photos add`) |
| 7 approval, the rules, the stop rule, escalations and decisions, approved images, retiring an image | 9 (verdicts, `validateVerdicts`, the identity check, the stop rule, decisions), 10 (`publishApproved`, `retireRows`), 13 (`photos verdict`), 14 (`images retire`, `species retire`), 15 (the `photo-check` skill) |
| 8 run flow, concept runs, committed run records | 13 (`run init`, `species list`, `photos fetch`, `photos add`, `photos verdict`), 14 (`build`, `report`, `run pr`, `run finish`), 15 (the `content-run` skill) |
| 9 the report and its five parts | 12 (the renderer), 14 (`cli report`, and the upload of each escalated image to the `review/` prefix) |
| 10 the HTTP layer, the limiter, the cache, the committed tables | 1 (all of it, with host groups), 4 and 5 (the two committed tables), 13 (`data sections`, `data inat-terms`), 19 (filling them from the live sources) |
| 11 validation, the append-only check, tests, errors that stop a run | 11 (the check), 13 (the validated scope, the unknown `include` symbol, the unknown concept key), 14 (the app validator in the build, `validateVerdicts`, `ids check`), 18 (the check in CI). Every task's test file covers section 11's test list. |
| 12 the two v0 runs | 19, Steps 9 to 15 |
| 13 decisions and their reasons | inherited, not re-opened. The choices list in this header records only what those decisions left open, plus the review findings of 2026-09-23. |

## Where the spec's test list lands

Spec section 11 names twelve test groups. Each one has a file. Every count below is the count the task's own steps state.

| Spec test group | File | Tests |
|---|---|---|
| `http` | `pipeline/tests/http.test.ts` | 17 |
| `plants` | `pipeline/tests/plants.test.ts` | 17 |
| `fna` | `pipeline/tests/fna.test.ts` | 17 |
| `commons` | `pipeline/tests/commons.test.ts` | 14 |
| `inat` | `pipeline/tests/inat.test.ts` | 17 |
| `species` | `pipeline/tests/species.test.ts` | 17 |
| `candidates` | `pipeline/tests/candidates_core.test.ts`, `pipeline/tests/candidates_collect.test.ts` | 20, 16 |
| `manifest` | `pipeline/tests/manifest.test.ts` | 16 |
| `ids` | `pipeline/tests/ids.test.ts` | 13 |
| `retire` | `pipeline/tests/manifest.test.ts`, `pipeline/tests/cli_build.test.ts` | part of the 16 and the 35 |
| `verdicts` | `pipeline/tests/verdicts.test.ts` | 19 |
| `report` | `pipeline/tests/report.test.ts` | 13 |

Six files the spec's list does not name carry the shared helpers and the CLI: `pipeline/tests/jsonl.test.ts` (7), `pipeline/tests/json_fields.test.ts` (4), `pipeline/tests/licenses.test.ts` (1), `pipeline/tests/run.test.ts` (22), `pipeline/tests/cli_fetch.test.ts` (33), and `pipeline/tests/cli_build.test.ts` (35).

At the end of Task 14 the offline suite is **298 tests** and needs no `node_modules`. Task 16 adds `pipeline/tests_live/sharp_resizer.test.ts` (4) and `pipeline/tests_live/s3_storage.test.ts` (3), which need `npm install` and run under `npm run test:live`. Tasks 17 to 19 add no test file; Task 19 Step 5 adds two assertions to the app's `tests/content.test.js`.

## What this plan does not build

- The content itself: the species set, the vocabularies, and the edges. That is a third spec. This plan builds the machine and ships one worked authored record, `content_src/species/QUGA.json`.
- The sync server and the analytics queries. Spec section 1 names them as their own spec.
- Anything under `app/`, except the `CDN_BASE` line in `app/logic/content.js` and two assertions in `tests/content.test.js`, both in Task 19 Step 5. The app plan owns those files.
- A level-2 or deeper unit. `content/units.json` holds the three level-1 units today; the units for a bucket are content, and arrive with the content spec.

## Revision record

This plan was revised on 2026-09-23 after a critical review against the shipped app (`app/logic/content.js` on `main`). The review found the plan retired every published species on a second run, wrote concept targets the app validator rejects, printed a source slug as the public photo credit, deleted an object before validating a takedown, and carried a stub validator weaker than the real one. Each is fixed in the tasks above; the header's choices 11, 16, 17, 23, and 28 to 35 record the decisions.
