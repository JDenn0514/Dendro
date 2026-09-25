import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

test('a 503 with Retry-After sleeps that many seconds and retries', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [
    { status: 503, headers: { 'Retry-After': '2' } },
    { status: 200, body: 'second try' },
  ]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  assert.deepEqual(clock.sleeps, [2 * MS_PER_SECOND]);
  assert.equal(fake.calls.length, 2);
  assert.equal(res.ok, true);
  assert.equal(res.body, 'second try');
  assert.deepEqual(http.failures, []);
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

test('a corrupt cache file is treated as a miss and gets rewritten', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [{ body: 'fresh body' }]);
  const dir = tmpCacheDir(t);
  const file = cachePath(dir, INAT, '.json');
  // A process killed mid-write can leave a truncated file behind.
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '{"url": "https://api.inaturalist.org/v1/taxa?q=Que');
  const http = createHttp({
    cacheDir: dir, fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  const res = await http.getText(INAT);
  assert.equal(fake.calls.length, 1);
  assert.equal(res.fromCache, false);
  assert.equal(res.body, 'fresh body');
  assert.doesNotThrow(() => JSON.parse(readFileSync(file, 'utf8')));
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

const NEW_HOSTS = [
  'raw.githubusercontent.com',
  'zenodo.org',
  'www.treesandshrubsonline.org',
  'www.wildflower.org',
  'd2seqvvyy3b8p2.cloudfront.net',
];

test('the photo source hosts carry the rates and the cache days of the spec', () => {
  assert.equal(RATE_PER_SECOND['raw.githubusercontent.com'], 1);
  assert.equal(RATE_PER_SECOND['zenodo.org'], 0.5);
  assert.equal(RATE_PER_SECOND['www.treesandshrubsonline.org'], 1);
  assert.equal(RATE_PER_SECOND['www.wildflower.org'], 1);
  assert.equal(RATE_PER_SECOND['d2seqvvyy3b8p2.cloudfront.net'], 0.2);
  for (const host of NEW_HOSTS) assert.equal(MAX_IN_FLIGHT[host], 1, host);
  assert.equal(CACHE_DAYS['raw.githubusercontent.com'], 30);
  assert.equal(CACHE_DAYS['www.treesandshrubsonline.org'], 30);
  assert.equal(CACHE_DAYS['www.wildflower.org'], 3650);
  // These two hosts serve image files only, so the default applies.
  assert.equal(CACHE_DAYS['zenodo.org'], undefined);
  assert.equal(CACHE_DAYS['d2seqvvyy3b8p2.cloudfront.net'], undefined);
});

test('a rate below 1 spaces requests by more than a second', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [
    { body: new Uint8Array([1]) },
    { body: new Uint8Array([2]) },
    { body: new Uint8Array([3]) },
    { body: new Uint8Array([4]) },
  ]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  await http.getBytes('https://zenodo.org/records/1/files/a.jpg');
  await http.getBytes('https://zenodo.org/records/2/files/b.jpg');
  await http.getBytes('https://d2seqvvyy3b8p2.cloudfront.net/a.jpg');
  await http.getBytes('https://d2seqvvyy3b8p2.cloudfront.net/b.jpg');
  // 0.5 per second is a 2000 ms gap. 0.2 per second is a 5000 ms gap. The two hosts do not
  // share a gate.
  assert.deepEqual(fake.calls.map((c) => c.at), [0, 2000, 2000, 7000]);
  assert.deepEqual(clock.sleeps, [2000, 5000]);
});
