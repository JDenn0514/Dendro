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
    '2 measured, 1 skipped, 1 under threshold 3',
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
    '2 measured, 0 skipped, 1 under threshold 3',
  ]);
  assert.ok(!http.urls.includes(retiredUrl), 'the retired hash was never requested');
});

test('photos audit --threshold 0 prints no row lines', async (t) => {
  const { root, deps, out } = setup(t);
  await seedRunRows(root);

  assert.equal(await runCommand(['photos', 'audit', 'demo', '--threshold', '0'], deps), 0);

  assert.deepEqual(out, ['2 measured, 1 skipped, 0 under threshold 0']);
});
