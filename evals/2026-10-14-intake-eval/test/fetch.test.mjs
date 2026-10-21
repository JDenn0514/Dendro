import { test } from 'node:test';
import assert from 'node:assert/strict';
import { download, wikimediaThumb, fetchUrlOf, gapMs, USER_AGENT } from '../lib/fetch.mjs';

// A fake clock: sleep moves the time on and records each wait.
function clock() {
  const c = { t: 1_000_000, waits: [] };
  c.now = () => c.t;
  c.sleep = async ms => { c.waits.push(ms); c.t += ms; };
  return c;
}
const response = (status, type, body = 'x') => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: h => (h.toLowerCase() === 'content-type' ? type : null) },
  arrayBuffer: async () => new TextEncoder().encode(body).buffer,
});
function fake(...answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, at: null });
    const a = answers.length > 1 ? answers.shift() : answers[0];
    if (a instanceof Error) throw a;
    return a;
  };
  return { calls, fetchImpl };
}

test('every call sends the eval User-Agent', async () => {
  assert.equal(USER_AGENT, 'Mozilla/5.0 (compatible; dendro-eval/0.1; +https://github.com/JDenn0514/Dendro)');
  const c = clock(), f = fake(response(200, 'image/jpeg'));
  await download('https://a.example/1.jpg', { fetchImpl: f.fetchImpl, sleep: c.sleep, now: c.now, last: new Map() });
  await download('https://b.example/2.jpg', { fetchImpl: f.fetchImpl, sleep: c.sleep, now: c.now, last: new Map() });
  assert.equal(f.calls.length, 2);
  for (const call of f.calls) assert.equal(call.init.headers['User-Agent'], USER_AGENT);
});

test('an image response returns the bytes and the content type', async () => {
  const c = clock(), f = fake(response(200, 'image/png', 'PNG'));
  const r = await download('https://a.example/1.png', { fetchImpl: f.fetchImpl, sleep: c.sleep, now: c.now, last: new Map() });
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.equal(r.contentType, 'image/png');
  assert.equal(Buffer.from(r.bytes).toString(), 'PNG');
});

test('two calls to one host wait 1 s on the clock; another host does not wait', async () => {
  const c = clock(), f = fake(response(200, 'image/jpeg')), last = new Map();
  const opts = { fetchImpl: f.fetchImpl, sleep: c.sleep, now: c.now, last };
  await download('https://www.wildflower.org/a.jpg', opts);
  await download('https://other.example/a.jpg', opts);
  assert.deepEqual(c.waits, []);
  await download('https://www.wildflower.org/b.jpg', opts);
  assert.deepEqual(c.waits, [1000]);
});

test('two calls at once to one host group take turns, 1 s apart', async () => {
  const c = clock(), f = fake(response(200, 'image/jpeg')), last = new Map();
  const at = [];
  const fetchImpl = async (url, init) => { at.push(c.t); return f.fetchImpl(url, init); };
  // Two hosts of the api.inaturalist.org group, at 1 per second.
  // Sleeps that overlap, as real timers do: each one ends at its own target time.
  const sleep = async ms => { const end = c.t + ms; await new Promise(r => setImmediate(r)); c.t = Math.max(c.t, end); };
  const opts = { fetchImpl, sleep, now: c.now, last };
  // A request of the group just went out, so both calls must wait.
  last.set('api.inaturalist.org', c.t);
  await Promise.all([download('https://static.inaturalist.org/a.jpg', opts), download('https://inaturalist-open-data.s3.amazonaws.com/b.jpg', opts)]);
  assert.equal(at.length, 2);
  assert.ok(at[0] - 1_000_000 >= 1000 && at[1] - at[0] >= 1000, `calls at ${at.map(t => t - 1_000_000)} ms`);
});

test('the gap comes from RATE_PER_SECOND, through the host group of the pipeline', () => {
  assert.equal(gapMs('www.wildflower.org'), 1000);
  assert.equal(gapMs('not-listed.example'), 1000);
  // upload.wikimedia.org is in the commons.wikimedia.org group, at 2 per second.
  assert.equal(gapMs('upload.wikimedia.org'), 500);
});

test('an HTML 200 response is a failure, never an image', async () => {
  const c = clock(), f = fake(response(200, 'text/html; charset=UTF-8', '<title>Just a moment...</title>'));
  const r = await download('https://www.wildflower.org/a.jpg', { fetchImpl: f.fetchImpl, sleep: c.sleep, now: c.now, last: new Map() });
  assert.equal(r.ok, false);
  assert.equal(r.bytes, null);
  assert.match(r.error, /not an image: text\/html/);
  assert.equal(f.calls.length, 1);
});

test('a 429 retries 3 times with backoff from 2 s, then fails', async () => {
  const c = clock(), f = fake(response(429, 'text/plain'));
  const r = await download('https://upload.example/a.jpg', { fetchImpl: f.fetchImpl, sleep: c.sleep, now: c.now, last: new Map() });
  assert.equal(f.calls.length, 4);
  assert.equal(r.ok, false);
  assert.equal(r.status, 429);
  assert.deepEqual(c.waits, [2000, 4000, 8000]);
});

test('a 5xx that recovers returns the image; a 404 does not retry', async () => {
  const c = clock(), f = fake(response(503, 'text/plain'), response(200, 'image/jpeg'));
  const r = await download('https://a.example/a.jpg', { fetchImpl: f.fetchImpl, sleep: c.sleep, now: c.now, last: new Map() });
  assert.equal(r.ok, true);
  assert.equal(f.calls.length, 2);
  const g = fake(response(404, 'text/html'));
  const r2 = await download('https://a.example/b.jpg', { fetchImpl: g.fetchImpl, sleep: c.sleep, now: c.now, last: new Map() });
  assert.equal(r2.ok, false);
  assert.equal(r2.status, 404);
  assert.equal(g.calls.length, 1);
});

test('a network error retries, then fails with status 0', async () => {
  const c = clock(), f = fake(new Error('socket hang up'));
  const r = await download('https://a.example/a.jpg', { fetchImpl: f.fetchImpl, sleep: c.sleep, now: c.now, last: new Map() });
  assert.equal(f.calls.length, 4);
  assert.equal(r.status, 0);
  assert.match(r.error, /socket hang up/);
});

test('wikimediaThumb makes the thumb.wikimedia.org URL at the width and drops the query', () => {
  assert.equal(
    wikimediaThumb('https://upload.wikimedia.org/wikipedia/commons/a/ac/Platanus_occidentalis%E2%80%94_stipules_02.jpg?utm_source=commons.wikimedia.org&utm_campaign=x', 1280),
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ac/Platanus_occidentalis%E2%80%94_stipules_02.jpg/1280px-Platanus_occidentalis%E2%80%94_stipules_02.jpg',
  );
  assert.throws(() => wikimediaThumb('https://upload.wikimedia.org/other/x.jpg', 1280), /not a Commons file URL/);
});

test('fetchUrlOf sends only upload.wikimedia.org URLs through the thumbnail', () => {
  assert.equal(fetchUrlOf('https://upload.wikimedia.org/wikipedia/commons/6/66/P.jpg', 1280), 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/66/P.jpg/1280px-P.jpg');
  const thumb = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dd/B.JPG/1280px-B.JPG?utm_source=commons.wikimedia.org';
  assert.equal(fetchUrlOf(thumb, 1280), thumb);
  assert.equal(fetchUrlOf('https://www.wildflower.org/a.jpg', 1280), 'https://www.wildflower.org/a.jpg');
});
