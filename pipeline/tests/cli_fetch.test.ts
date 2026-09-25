import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateContent } from '../../app/logic/content.js';
import {
  CHANNEL_TARGET,
  MAX_PER_SPECIES,
  SOURCE_NAMES,
  candidateId,
  interleave,
  makeCandidate,
  type Candidate,
} from '../lib/candidates.ts';
import {
  CHECK_AGENT,
  FETCH_ORDER,
  MAX_COMMONS_PAGES,
  NO_PROFILE,
  TURN_ORDER,
  runCommand,
  type CliDeps,
} from '../lib/commands.ts';
import { categoryUrl, commonsCandidates, parseCategoryListing } from '../lib/commons.ts';
import { SECTION_PAGES, nextPageUrl, parseSectionPage } from '../lib/fna.ts';
import { chromaOf } from '../lib/chroma.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
import { sha256Hex } from '../lib/images.ts';
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
import { newScope, readRun, runDir, writeRun, type RunScope } from '../lib/run.ts';
import { memoryStorage } from '../lib/storage.ts';
import type { Verdict } from '../lib/verdicts.ts';
import { greyJpeg, redJpeg } from './fixtures/images.ts';
import { captureConsole, fakeExec } from './helpers.ts';

const NOW = '2026-09-22T15:04:00Z';
const CDN_BASE = 'https://images.dendro.test/';
const SCIENTIFIC = 'Quercus gambelii';
const QUGA_ID = 70265;
// The live PlantProfile answer for the symbol QUUN is the accepted hybrid QUPA4.
const QUPA4_ID = 70415;
const INAT_TAXON_ID = 116377;
const FLOWERING_VALUE_ID = 13;
const EMPTY_OBSERVATIONS = '{ "total_results": 0, "page": 1, "results": [] }';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Bytes that sharp cannot decode. */
const NOT_AN_IMAGE = new Uint8Array([1, 2, 3, 4]);

interface Route {
  status?: number;
  body?: string;
  bytes?: Uint8Array;
}

function fixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function jpeg(seed: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, seed]);
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
  routes.set(profileUrl('QUPA4'), { body: fixture('plants_profile_quun.json') });
  routes.set(`${DISTRIBUTION_URL} {"MasterId":${QUGA_ID}}`, {
    body: fixture('plants_distribution_quga.csv'),
  });
  routes.set(`${DISTRIBUTION_URL} {"MasterId":${QUPA4_ID}}`, {
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
      pass.termValueId === FRUITING_VALUE_ID
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
    (row) => row.termValueId === FLOWERING_VALUE_ID,
  );
  assert.ok(pass !== undefined, 'one pass filters on the flowering value');
  return pass;
}

/** The rows `plantsCandidates` builds from the recorded images. The fixture holds more
 *  images than that: one is copyright and one names no photographer. */
function plantsRowsOf(target: string): Candidate[] {
  const images = parseImages(JSON.parse(fixture('plants_images_quga.json')));
  return plantsCandidates(images, target, 'QUGA', SCIENTIFIC, NOW);
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
  // No recorded section page links a second page, so the walk over a next link
  // is covered by the hand-built pair.
  { first: 'fna_hand_built_page1.html', second: 'fna_lobatae_page2.html' },
  { first: 'fna_protobalanus.html', second: null },
  { first: 'fna_quercus.html', second: null },
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

  const { out, err } = captureConsole(t);

  const exec = fakeExec();
  const http = fakeHttp(routes, throwOn);
  const deps: CliDeps = {
    root,
    exec,
    http,
    storage: memoryStorage(),
    resize: async (bytes) => bytes,
    // The fixture bytes are five-byte stand-ins, not JPEGs. Every row scores as colour here.
    // A colour test sets `deps.chroma = chromaOf` and serves real JPEGs.
    chroma: async () => 100,
    validate: validateContent,
    cdnBase: CDN_BASE,
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

/** The `photos add` arguments of one manual row, without `--local`. */
function manualAdd(fileUrl: string): string[] {
  return [
    'photos',
    'add',
    'demo',
    '--target',
    'QUGA',
    '--origin',
    'https://www.fs.usda.gov/database/feis/quga.html',
    '--file-url',
    fileUrl,
    '--source',
    'USDA Forest Service',
    '--author',
    'US Forest Service',
    '--license',
    'US government work',
    '--channel-hint',
    'bark',
  ];
}

/** Writes a stand-in image where the `--local` tests point, and returns its absolute path. */
function seedLocalFile(root: string): string {
  const file = path.join(root, 'pipeline', 'cache', 'manual', 'quga_bark.jpg');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, jpeg(1));
  return file;
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

/** The count line of `photos fetch`, before the line per source. The count comes from the rows, never from a literal. */
function appendedLine(appended: number, failures: number, mono = 0): string {
  return `${appended} candidates appended to pipeline/runs/demo/candidates.jsonl, ${failures} download failures, ${mono} monochrome dropped`;
}

/** The line `photos fetch` prints last. The counts come from the rows, never from a literal. */
function sourceLineOf(rows: Candidate[]): string {
  const parts = FETCH_ORDER.map(
    (key) => `${key} ${rows.filter((row) => row.source_key === key).length}`,
  );
  return `by source: ${parts.join(', ')}`;
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
    'photos audit',
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
  assert.deepEqual(scope.dropped, [{ symbol: 'QUPA4', reason: 'hybrid' }]);
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
  assert.equal(table.QUPA4.id, QUPA4_ID);
  assert.ok(table.QUPA4.scientific.includes('pauciloba'));
  assert.ok(text.endsWith('}\n'));
});

test('species list reports a symbol with no profile and drops it', async (t) => {
  const routes = checklistRoutes();
  routes.delete(profileUrl('QUPA4'));
  const { root, deps, err } = setup(t, routes);
  seedRun(root, { bucket: 'simple_lobed', states: 'CO', genera: 'Quercus', channels: 'leaf' }, () => {});

  assert.equal(await runCommand(['species', 'list', 'demo'], deps), 0);

  assert.ok(err.includes(`QUPA4: ${NO_PROFILE}`));
  const scope = readRun(root, 'demo');
  assert.deepEqual(scope.species, ['QUGA']);
  assert.deepEqual(scope.dropped, [{ symbol: 'QUPA4', reason: NO_PROFILE }]);
  assert.ok(scope.fetch_failures > 0);
});

test('photos fetch appends candidates with their bytes and commits', async (t) => {
  const { root, deps, exec, out } = setup(t, photoRoutes());
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
  assert.deepEqual(out, [appendedLine(expected.length, 0), sourceLineOf(rows)]);
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

test('the turn order is Commons, then iNaturalist, and PLANTS comes last', () => {
  assert.deepEqual(TURN_ORDER, ['commons', 'inat']);
  assert.deepEqual(FETCH_ORDER, ['commons', 'inat', 'plants']);
});

test('photos fetch takes Commons and iNaturalist in turns, then PLANTS', async (t) => {
  const { root, deps } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const turns = interleave([commonsRowsOf('QUGA'), inatRowsOf('QUGA')]);
  assert.deepEqual(
    fetchedOf(root).map((row) => row.origin),
    [...turns, ...plantsRowsOf('QUGA')].map((row) => row.origin),
    'one row from each turn source per round, and PLANTS after every turn row',
  );
});

test('photos fetch gives the cap to the turn sources ahead of PLANTS', async (t) => {
  const { root, deps, out, http } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });
  // The seeded rows leave room for the turn rows only, so every PLANTS row meets the cap.
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
    'no PLANTS row reaches the queue ahead of the turn sources',
  );
  assert.ok(http.urls.includes(imagesUrl(QUGA_ID)), 'the PLANTS listing was still fetched');
  assert.deepEqual(out, [appendedLine(room, 0), sourceLineOf(rows)]);
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
  const { root, deps, out } = setup(t, routes);
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
  const failures = readRun(root, 'demo').fetch_failures;
  assert.ok(failures > 0);
  assert.deepEqual(out, [appendedLine(rows.length, failures), sourceLineOf(rows)]);
});

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
  assert.deepEqual(out, [appendedLine(expected.length - 1, 0, 1), sourceLineOf(rows)]);
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
  assert.deepEqual(out, [appendedLine(expected.length - 1, 1, 0), sourceLineOf(rows)]);
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
    if (pass.termValueId === FRUITING_VALUE_ID) continue;
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

test("photos fetch keeps each target's rows when a later target throws", async (t) => {
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
  seedLocalFile(root);

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

test('photos add stores an absolute --local path root-relative with forward slashes', async (t) => {
  const { root, deps } = setup(t);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});
  const absolute = seedLocalFile(root);

  const args = [...manualAdd('https://example.org/a.jpg'), '--local', absolute];
  assert.equal(await runCommand(args, deps), 0);

  const rows = candidatesOf(root);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].local, 'pipeline/cache/manual/quga_bark.jpg');
});

test('photos add downloads the file when --local is absent', async (t) => {
  const fileUrl = 'https://www.fs.usda.gov/images/quga_bark.jpg';
  const { root, deps, out } = setup(t, new Map([[fileUrl, { bytes: jpeg(7) }]]));
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});

  assert.equal(await runCommand(manualAdd(fileUrl), deps), 0);

  const rows = candidatesOf(root);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].file_hash !== null && rows[0].file_hash.length === 64);
  assert.equal(
    rows[0].local,
    `pipeline/cache/manual/${rows[0].file_hash}.jpg`,
    'the cached file of a manual row sits beside the fetched ones',
  );
  assert.ok(rows[0].local !== null && fs.existsSync(path.join(root, rows[0].local)));
  assert.equal(rows[0].fetch_error, null);
  assert.deepEqual(out, [`manual candidate ${rows[0].id} added for QUGA`]);
});

test('photos add reports a download that failed and appends no row', async (t) => {
  const fileUrl = 'https://www.fs.usda.gov/images/quga_bark.jpg';
  const { root, deps, err } = setup(t, new Map([[fileUrl, { status: 404 }]]));
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});

  assert.equal(await runCommand(manualAdd(fileUrl), deps), 1);

  assert.deepEqual(err, [`photos add could not download ${fileUrl}: status 404`]);
  assert.deepEqual(candidatesOf(root), []);
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

test('photos add takes the permission label for a www.wildflower.org origin', async (t) => {
  const fileUrl = 'https://www.wildflower.org/image_archive/640x480/JLR/JLR_IMG8981.JPG';
  const { root, deps, out } = setup(t, new Map([[fileUrl, { bytes: jpeg(3) }]]));
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});

  const code = await runCommand(
    [
      'photos',
      'add',
      'demo',
      '--target',
      'QUGA',
      '--origin',
      'https://www.wildflower.org/gallery/result.php?id_image=66070',
      '--file-url',
      fileUrl,
      '--source',
      'Lady Bird Johnson Wildflower Center',
      '--author',
      'James L. Reveal',
      '--license',
      'used with permission, non-commercial',
    ],
    deps,
  );

  assert.equal(code, 0);
  const rows = candidatesOf(root);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].license, 'used with permission, non-commercial');
  assert.deepEqual(out, [`manual candidate ${rows[0].id} added for QUGA`]);
});

test('photos add refuses the permission label for any other host', async (t) => {
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
      'used with permission, non-commercial',
    ],
    deps,
  );

  assert.equal(code, 1);
  assert.deepEqual(err, ['photos add license is not allowed: used with permission, non-commercial']);
  assert.deepEqual(candidatesOf(root), []);
});

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
    `refused: ${id} for QUGA is monochrome (chroma ${score}, threshold 3). Colour photographs only (owner ruling 2026-09-24).`,
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
  assert.equal(walk.urls.length, 4, 'one of the three first pages links a second page');
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
