import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureConsole } from './helpers.ts';
import { licenseAllowedAt } from '../lib/licenses.ts';
import { vtRowsMain } from '../scripts/vt-rows.ts';
import { VT_SITE } from '../scripts/sources.ts';
import { SOURCE_NAMES } from '../lib/candidates.ts';
import { POWO_SOURCE } from '../lib/powo.ts';
import { sourceEntry } from '../../app/logic/sources.js';
import {
  VT_AUTHORS,
  VT_LICENSE,
  VT_SITE_NAME,
  VT_SOURCE,
  parseVtImages,
  vtOrganChannel,
  vtPhotographers,
  vtRow,
  vtSpeciesName,
} from '../lib/vt.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = fs.readFileSync(path.join(REPO_ROOT, 'pipeline', 'tests', 'fixtures', 'vt', 'quga4_factsheet.html'), 'utf8');
const PAGE_URL = 'https://dendro.cnre.vt.edu/dendrology/syllabus/factsheet.cfm?ID=240';
const IMAGES = 'https://dendro.cnre.vt.edu/dendrology/images/Quercus%20garryana';
const mkadds = createRequire(import.meta.url)(path.join(REPO_ROOT, 'pipeline', 'scripts', 'mkadds.cjs')) as {
  buildCommand: (row: unknown, run: string) => { line: string; problems: string[] };
};

test('the credit values match the decision record', () => {
  assert.equal(VT_SOURCE, 'VT Dendrology');
  // The site name in pipeline/sources/<SYMBOL>.json, which sources.ts writes.
  assert.equal(VT_SITE_NAME, VT_SITE);
  assert.equal(VT_SITE_NAME, 'Virginia Tech Dendrology');
  assert.equal(VT_LICENSE, 'used with permission, non-commercial');
  assert.equal(VT_AUTHORS, 'John Seiler, Edward Jensen, Alex Niemiera, and John Peterson');
});

test('every source name the pipeline writes has an entry on the Sources screen', () => {
  const names = [...Object.values(SOURCE_NAMES).filter((name) => name !== ''), POWO_SOURCE, VT_SOURCE];
  for (const name of names) assert.ok(sourceEntry(name), name);
  assert.equal(sourceEntry(VT_SITE_NAME), null);
});

test('leaf, bark, and fruit map to their channels, and every other organ to none', () => {
  assert.equal(vtOrganChannel('leaf'), 'leaf');
  assert.equal(vtOrganChannel('bark'), 'bark');
  assert.equal(vtOrganChannel('fruit'), 'fruit');
  for (const organ of ['flower', 'twig', 'form', 'map', 'fall', 'wood', 'latin', '']) {
    assert.equal(vtOrganChannel(organ), null, organ);
  }
  assert.equal(vtOrganChannel('Leaf'), 'leaf');
});

test('parseVtImages reads each image link of the page once, in page order', () => {
  const images = parseVtImages(PAGE, PAGE_URL);
  assert.deepEqual(images.map((image) => image.file), [
    'leaf1.jpg', 'flower1.jpg', 'fruit1.jpg', 'twig1.jpg', 'bark1.jpg', 'form1.jpg', 'map.jpg',
  ]);
  assert.deepEqual(images.map((image) => image.organ), [
    'leaf', 'flower', 'fruit', 'twig', 'bark', 'form', 'map',
  ]);
  assert.deepEqual(images.map((image) => image.channel), [
    'leaf', null, 'fruit', null, 'bark', null, null,
  ]);
  assert.equal(images[2].url, `${IMAGES}/fruit1.jpg`);
});

test('parseVtImages takes only jpg files under the images folder', () => {
  const html = [
    '<a href="../images/Acer rubrum/latin.wav">x</a>',
    '<a href="../images/Acer rubrum/map.pdf">x</a>',
    '<a href="../qr/1.png">x</a>',
    '<a href="../images/Acer rubrum/bark2.JPG"><img src="../images/Acer rubrum/bark2.JPG"></a>',
    '<a href="https://example.com/images/Acer rubrum/leaf1.jpg">x</a>',
  ].join('\n');
  const images = parseVtImages(html, PAGE_URL);
  assert.deepEqual(images, [
    {
      file: 'bark2.JPG',
      organ: 'bark',
      channel: 'bark',
      url: 'https://dendro.cnre.vt.edu/dendrology/images/Acer%20rubrum/bark2.JPG',
    },
  ]);
});

test('vtSpeciesName reads the scientific name that the page shows', () => {
  assert.equal(vtSpeciesName(PAGE), 'Quercus garryana');
  assert.equal(vtSpeciesName('<p>no name here</p>'), null);
});

test('vtPhotographers reads the footer list word for word', () => {
  assert.equal(vtPhotographers(PAGE), VT_AUTHORS);
  assert.equal(vtPhotographers('<small>All material</small>'), null);
});

/** A root with one sources file, and the saved page when `saved` is true. */
function fakeRoot(t: TestContext, saved: boolean): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-vt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = path.join(root, 'pipeline', 'sources');
  fs.mkdirSync(path.join(sources, 'raw'), { recursive: true });
  fs.writeFileSync(path.join(sources, 'QUGA4.json'), JSON.stringify({
    symbol: 'QUGA4',
    scientific_name: 'Quercus garryana',
    sources: [{ site: 'Virginia Tech Dendrology', url: PAGE_URL }],
  }));
  if (saved) fs.writeFileSync(path.join(sources, 'raw', 'QUGA4.vt.html'), PAGE);
  return root;
}

function fakeFetch(routes: Map<string, Uint8Array>, calls: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const body = routes.get(url);
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

test('vt-rows.ts writes one row per image of the channel, from the saved page', async (t) => {
  const root = fakeRoot(t, true);
  const out = path.join(root, 'out');
  const gap = path.join(root, 'gap.json');
  fs.writeFileSync(gap, JSON.stringify([{ symbol: 'QUGA4', sci: 'Quercus garryana', channel: 'fruit', approved: 0 }]));
  const calls: string[] = [];
  const fetchImpl = fakeFetch(new Map([[`${IMAGES}/fruit1.jpg`, JPEG]]), calls);
  captureConsole(t);

  const code = await vtRowsMain(['--rows', gap, '--run', 'r1', '--out-dir', out, '--root', root], fetchImpl);

  assert.equal(code, 0);
  assert.deepEqual(calls, [`${IMAGES}/fruit1.jpg`]);
  const rows = JSON.parse(fs.readFileSync(path.join(out, 'vt-rows.json'), 'utf8'));
  const local = path.join(out, 'images', 'QUGA4-fruit1.jpg');
  assert.deepEqual(rows, [{ ...vtRow(parseVtImages(PAGE, PAGE_URL)[2], PAGE_URL, 'QUGA4', 'Quercus garryana', VT_AUTHORS), local }]);
  assert.deepEqual(new Uint8Array(fs.readFileSync(local)), JPEG);
  const report = fs.readFileSync(path.join(out, 'vt-report.md'), 'utf8');
  assert.match(report, /## QUGA4 fruit/);
  assert.match(report, /Taken for fruit: fruit1\.jpg\./);
  const built = mkadds.buildCommand(rows[0], 'r1');
  assert.deepEqual(built.problems, []);
  assert.match(built.line, /--source "VT Dendrology"/);
  assert.match(built.line, /--license "used with permission, non-commercial"/);
});

test('vt-rows.ts fetches a missing page and skips an image the run holds', async (t) => {
  const root = fakeRoot(t, false);
  const runDir = path.join(root, 'pipeline', 'runs', 'r1');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'candidates.jsonl'), `${JSON.stringify({ origin: `${PAGE_URL}#image=bark1.jpg` })}\n`);
  const out = path.join(root, 'out');
  const gap = path.join(root, 'gap.json');
  fs.writeFileSync(gap, JSON.stringify([
    { symbol: 'QUGA4', sci: 'Quercus garryana', channel: 'bark', approved: 1 },
    { symbol: 'ACRU', sci: 'Acer rubrum', channel: 'leaf', approved: 0 },
  ]));
  const calls: string[] = [];
  const fetchImpl = fakeFetch(new Map([[PAGE_URL, new TextEncoder().encode(PAGE)]]), calls);
  captureConsole(t);

  const code = await vtRowsMain(['--rows', gap, '--run', 'r1', '--out-dir', out, '--root', root], fetchImpl);

  assert.equal(code, 0);
  assert.deepEqual(calls, [PAGE_URL]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'vt-rows.json'), 'utf8')), []);
  const report = fs.readFileSync(path.join(out, 'vt-report.md'), 'utf8');
  assert.match(report, /bark1\.jpg: skipped, the run already holds it\./);
  assert.match(report, /## ACRU leaf[\s\S]*No Virginia Tech fact sheet/);
});

test('vt-rows.ts names a missing flag and exits 1', async (t) => {
  const logs = captureConsole(t);
  assert.equal(await vtRowsMain(['--rows', 'gap.json'], fakeFetch(new Map(), [])), 1);
  assert.equal(logs.err[0], 'vt-rows needs --run');
});

test('vtRow writes one add row that licenseAllowedAt accepts', () => {
  const fruit = parseVtImages(PAGE, PAGE_URL)[2];
  const row = vtRow(fruit, PAGE_URL, 'QUGA4', 'Quercus garryana', VT_AUTHORS);
  assert.deepEqual(row, {
    target: 'QUGA4',
    origin: `${PAGE_URL}#image=fruit1.jpg`,
    file_url: `${IMAGES}/fruit1.jpg`,
    author: VT_AUTHORS,
    license: VT_LICENSE,
    license_url: null,
    source: VT_SOURCE,
    source_species: 'Quercus garryana',
    channel_hint: 'fruit',
  });
  assert.equal(licenseAllowedAt(row.license, row.origin), true);
});
