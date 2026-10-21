// Image download for the eval. Every request sends the eval User-Agent and keeps the per-host rate
// of the pipeline (RATE_PER_SECOND in pipeline/lib/http.ts, keyed on its host group).
// A response is a success only when it is a 2xx with an image content type.
import fs from 'node:fs';
import path from 'node:path';
import { EVAL } from './paths.mjs';
import { RATE_PER_SECOND, DEFAULT_RATE_PER_SECOND, HOST_GROUP } from '../../../pipeline/lib/http.ts';

export const USER_AGENT = JSON.parse(fs.readFileSync(path.join(EVAL, 'config.json'), 'utf8')).user_agent;
export const RETRIES = 3;
export const BACKOFF_MS = 2000;

const groupOf = host => HOST_GROUP[host] ?? host;
export const gapMs = host => 1000 / (RATE_PER_SECOND[groupOf(host)] ?? DEFAULT_RATE_PER_SECOND);

// The time of the last request per host group, shared by all downloads of one process.
const LAST = new Map();
const realSleep = ms => new Promise(r => setTimeout(r, ms));

// Returns { ok, status, contentType, bytes, error }. bytes is null unless ok.
// A 429, a 5xx, or a network error retries RETRIES times, with backoff BACKOFF_MS, then 2x, then 4x.
export async function download(url, { fetchImpl = fetch, sleep = realSleep, now = Date.now, last = LAST } = {}) {
  const group = groupOf(new URL(url).hostname);
  const gap = gapMs(new URL(url).hostname);
  let fail = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS * 2 ** (attempt - 1));
    const wait = (last.get(group) ?? -Infinity) + gap - now();
    if (wait > 0) await sleep(wait);
    last.set(group, now());
    let res;
    try {
      res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
    } catch (e) {
      fail = { ok: false, status: 0, contentType: null, bytes: null, error: `network: ${e.message}` };
      continue;
    }
    const contentType = res.headers.get('content-type');
    if (res.status === 429 || res.status >= 500) {
      fail = { ok: false, status: res.status, contentType, bytes: null, error: `http ${res.status}` };
      continue;
    }
    if (!res.ok) return { ok: false, status: res.status, contentType, bytes: null, error: `http ${res.status}` };
    if (!/^image\//i.test(contentType ?? '')) return { ok: false, status: res.status, contentType, bytes: null, error: `not an image: ${contentType}` };
    return { ok: true, status: res.status, contentType, bytes: new Uint8Array(await res.arrayBuffer()), error: null };
  }
  return fail;
}

// upload.wikimedia.org/wikipedia/commons/<a>/<ab>/<name> becomes
// thumb.wikimedia.org/wikipedia/commons/thumb/<a>/<ab>/<name>/<width>px-<name> (owner ruling 2026-10-21).
export function wikimediaThumb(url, width) {
  const u = new URL(url);
  const m = u.pathname.match(/^\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/);
  if (u.hostname !== 'upload.wikimedia.org' || !m) throw new Error(`not a Commons file URL: ${url}`);
  const [, a, ab, name] = m;
  return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${name}/${width}px-${name}`;
}

// The URL that the download uses: the thumbnail for an upload.wikimedia.org file, else the URL itself.
export const fetchUrlOf = (url, width) => (new URL(url).hostname === 'upload.wikimedia.org' ? wikimediaThumb(url, width) : url);
