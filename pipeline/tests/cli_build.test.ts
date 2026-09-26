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
import { captureConsole } from './helpers.ts';

const NOW = '2026-09-22T15:04:00Z';
const TODAY = '2026-09-22';
const SCIENTIFIC = 'Quercus gambelii';
const QUGA_ID = 70265;
const INAT_TAXON_ID = 116377;
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

  const { out, err } = captureConsole(t);

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
    // No build test measures colour. Every row scores as colour here.
    chroma: async () => 100,
    cdnBase: CDN,
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
  channels?: string;
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

test('a rebuild keeps the reason and the date the owner retired a species with', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root);
  fakeGitShow(exec, 'main', {
    species: {
      QUGA: record({
        retired: true,
        retired_reason: 'misidentified',
        retired_at: '2026-09-01',
      }),
    },
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const species = speciesOf(root);
  assert.equal(species.QUGA.retired, true);
  assert.equal(species.QUGA.retired_reason, 'misidentified');
  assert.equal(species.QUGA.retired_at, '2026-09-01');
  // The run rebuilt the record. Only the three retirement fields come from the past.
  assert.equal(species.QUGA.inat_taxon_id, INAT_TAXON_ID);
});

test('a retired species with no manifest row stays retired after a rebuild', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root, {
    verdicts: [verdict(MYSTERY.id, 'escalate', { case: 'quality', note: 'Blurred.' })],
  });
  fakeGitShow(exec, 'main', {
    species: {
      QUGA: record({
        retired: true,
        retired_reason: 'misidentified',
        retired_at: '2026-09-01',
      }),
    },
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  assert.equal(manifestOf(root).length, 0);
  const species = speciesOf(root);
  assert.equal(species.QUGA.retired, true);
  assert.equal(species.QUGA.retired_reason, 'misidentified');
  assert.equal(species.QUGA.retired_at, '2026-09-01');
});

test('a new approved photo does not un-retire a species the owner retired', async (t) => {
  const { root, deps, exec, err } = setup(t);
  const retiredRow = row({
    hash: HASH_B,
    target: 'QUGA',
    channel: 'leaf',
    retired: true,
    retired_reason: 'takedown request',
    retired_at: '2026-09-01',
  });
  seed(root, { manifest: [retiredRow] });
  fakeGitShow(exec, 'main', {
    species: {
      QUGA: record({
        retired: true,
        retired_reason: 'misidentified',
        retired_at: '2026-09-01',
      }),
    },
    manifest: [retiredRow],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  // The run approved two photos, so the species has live rows again.
  assert.equal(manifestOf(root).filter((one) => one.retired !== true).length, 2);
  const species = speciesOf(root);
  assert.equal(species.QUGA.retired, true);
  assert.equal(species.QUGA.retired_reason, 'misidentified');
  assert.equal(species.QUGA.retired_at, '2026-09-01');
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
      ['QUUN', 'dropped'],
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

test('a failed distribution fetch stops the build before it writes or uploads', async (t) => {
  const routes = defaultRoutes();
  routes.set(`${DISTRIBUTION_URL} {"MasterId":${QUGA_ID}}`, { status: 500 });
  const { root, deps, storage, err } = setup(t, routes);
  seed(root);

  assert.equal(await runCommand(['build', 'demo'], deps), 1);

  assert.ok(err.includes('QUGA: distribution fetch failed, build stopped'));
  assert.deepEqual(storage.puts, []);
  assert.equal(exists(root, 'content/species.json'), false);
  assert.equal(exists(root, 'content/images/manifest.json'), false);
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
  // Each concept target gets one gap row, on the channel of its own prefix.
  assert.deepEqual(data.gaps, [
    { symbol: 'bark/furrowed', channel: 'bark', count: 1 },
    { symbol: 'leaf/simple_lobed', channel: 'leaf', count: 1 },
  ]);
});

test('report writes report.md, uploads each escalated candidate, and links it through cdnBase', async (t) => {
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

test('images difficulty --set hard marks the row and keeps the object', async (t) => {
  const { root, deps, exec, storage, out, err } = setup(t);
  seed(root, {
    manifest: [
      row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' }),
      row({ hash: HASH_D, target: 'QUGA', channel: 'bark' }),
    ],
  });
  writeJson(root, 'content/species.json', { QUGA: record() });
  await storage.put(objectKey(HASH_C), new Uint8Array([1]), 'image/jpeg');

  const code = await runCommand(['images', 'difficulty', HASH_C, '--set', 'hard'], deps);
  assert.equal(code, 0, err.join(' | '));

  const rows = manifestOf(root);
  assert.equal(rows[0].difficulty, 'hard');
  assert.equal(rows[1].difficulty, undefined);
  assert.equal(storage.objects.has(objectKey(HASH_C)), true);
  const commit = called(exec, 'git', 'commit');
  assert.ok(commit !== undefined);
  assert.ok(commit.args.includes(`content: mark image ${HASH_C} hard`));
  assert.ok(out.join('\n').includes(`1 manifest row set to hard for ${HASH_C}`));
});

test('images difficulty --clear takes the field off, and a second clear changes nothing', async (t) => {
  const { root, deps, exec, out, err } = setup(t);
  seed(root, {
    manifest: [
      row({ hash: HASH_C, target: 'QUGA', channel: 'leaf', difficulty: 'hard' }),
      row({ hash: HASH_D, target: 'QUGA', channel: 'bark' }),
    ],
  });
  writeJson(root, 'content/species.json', { QUGA: record() });

  assert.equal(await runCommand(['images', 'difficulty', HASH_C, '--clear'], deps), 0, err.join(' | '));
  assert.equal('difficulty' in manifestOf(root)[0], false);
  assert.ok(out.join('\n').includes(`1 manifest row cleared for ${HASH_C}`));

  assert.equal(await runCommand(['images', 'difficulty', HASH_C, '--clear'], deps), 0);
  assert.ok(out.join('\n').includes(`no manifest row changed for ${HASH_C}`));
  const commits = exec.calls.filter((call) => call.command === 'git' && call.args[0] === 'commit');
  assert.equal(commits.length, 1);
});

test('images difficulty needs one of --set or --clear, takes only hard, and needs a known hash', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root, { manifest: [row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' })] });
  writeJson(root, 'content/species.json', { QUGA: record() });

  assert.equal(await runCommand(['images', 'difficulty', HASH_C], deps), 1);
  assert.equal(
    await runCommand(['images', 'difficulty', HASH_C, '--set', 'hard', '--clear'], deps),
    1,
  );
  assert.equal(await runCommand(['images', 'difficulty', HASH_C, '--set', 'easy'], deps), 1);
  assert.equal(await runCommand(['images', 'difficulty', HASH_A, '--set', 'hard'], deps), 1);

  assert.deepEqual(err, [
    'images difficulty needs one of --set hard or --clear',
    'images difficulty needs one of --set hard or --clear',
    'images difficulty --set takes hard, not easy',
    `no manifest row carries hash ${HASH_A}`,
  ]);
  assert.equal(manifestOf(root)[0].difficulty, undefined);
  assert.equal(called(exec, 'git', 'commit'), undefined);
});

test('images difficulty will not hide the last photo of a species no edge names', async (t) => {
  const { root, deps, exec, storage, err } = setup(t);
  seed(root, { manifest: [row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' })] });
  writeJson(root, 'content/species.json', { QUGA: record() });
  await storage.put(objectKey(HASH_C), new Uint8Array([1]), 'image/jpeg');

  assert.equal(await runCommand(['images', 'difficulty', HASH_C, '--set', 'hard'], deps), 1);

  assert.ok(
    err.includes('error species.json: QUGA has no manifest image and no confusion edge'),
    err.join(' | '),
  );
  assert.equal(manifestOf(root)[0].difficulty, undefined);
  assert.equal(storage.objects.has(objectKey(HASH_C)), true);
  assert.equal(called(exec, 'git', 'commit'), undefined);
});

test('a build keeps the difficulty on a published row', async (t) => {
  const { root, deps, err } = setup(t);
  seed(root, {
    manifest: [row({ hash: HASH_C, target: 'QUGA', channel: 'leaf', difficulty: 'hard' })],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const kept = manifestOf(root).find((one) => one.hash === HASH_C);
  assert.equal(kept?.difficulty, 'hard');
});

test('a build leaves a hard photo out of the counts and the gaps', async (t) => {
  const { root, deps, err } = setup(t);
  seed(root);
  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));
  const rows = manifestOf(root).map((one) =>
    one.channel === 'leaf' ? { ...one, difficulty: 'hard' as const } : one,
  );
  writeJson(root, 'content/images/manifest.json', rows);

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const data = buildOf(root);
  assert.deepEqual(data.species[0], {
    symbol: 'QUGA', status: 'included', reason: null, counts: { bark: 1 },
  });
  assert.deepEqual(data.gaps, [
    { symbol: 'QUGA', channel: 'leaf', count: 0 },
    { symbol: 'QUGA', channel: 'bark', count: 1 },
  ]);
  assert.equal(manifestOf(root).find((one) => one.channel === 'leaf')?.difficulty, 'hard');
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

test('ids check on a base that does not resolve exits 1 and says so', async (t) => {
  const { root, deps, exec, out, err } = setup(t);
  seed(root);
  exec.codes.set('rev-parse', { code: 128, out: '' });

  assert.equal(await runCommand(['ids', 'check', '--base', 'no-such-ref'], deps), 1);

  assert.deepEqual(err, ['base no-such-ref does not resolve to a commit']);
  assert.deepEqual(out, []);
  // The check stops before the read, so nothing asked that ref for a file.
  assert.deepEqual(shown(exec), []);
});

test('build on a base that does not resolve writes nothing and uploads nothing', async (t) => {
  const { root, deps, exec, storage, err } = setup(t);
  seed(root);
  exec.codes.set('rev-parse', { code: 128, out: '' });

  assert.equal(await runCommand(['build', 'demo', '--base', 'no-such-ref'], deps), 1);

  assert.deepEqual(err, ['base no-such-ref does not resolve to a commit']);
  assert.deepEqual(storage.puts, []);
  assert.equal(exists(root, 'content/species.json'), false);
  assert.equal(exists(root, 'content/images/manifest.json'), false);
  assert.equal(called(exec, 'git', 'commit'), undefined);
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
