import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sha256Hex } from './hash.ts';

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

interface CachedRow {
  url: string;
  fetched_at: string;
  status: number;
  body?: string;
}

/**
 * `writeFileSync` is not atomic: a process killed mid-write leaves a truncated file.
 * A parse failure, or a row missing a field a caller needs, is a cache miss, not a
 * crash. Both `getText` and `getBytes` read a cached row through this one gate.
 */
function readCachedRow(file: string): CachedRow | null {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const row = parsed as Record<string, unknown>;
  if (typeof row.fetched_at !== 'string' || typeof row.status !== 'number') return null;
  if (row.body !== undefined && typeof row.body !== 'string') return null;
  return row as unknown as CachedRow;
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

  /**
   * The wait the server asked for. A header that is absent, not a number, or negative
   * leaves the caller's own wait in place.
   */
  function retryAfterOr(res: Response, fallback: number): number {
    const header = res.headers.get('retry-after');
    const seconds = header === null ? NaN : Number(header);
    if (!Number.isFinite(seconds) || seconds < 0) return fallback;
    return Math.max(0, seconds * MS_PER_SECOND);
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
        waitMs: retryAfterOr(res, NO_RETRY_AFTER_MS),
      };
    }
    // Every other 4xx is final. A 404 records one failure and stops here.
    if (status < 500) {
      return { sent: { res: null, status, error: `http ${status}` }, retryable: false, waitMs: 0 };
    }
    // A 5xx carries Retry-After too, and the server knows its own outage better than the
    // doubling backoff does.
    return {
      sent: { res: null, status, error: `http ${status}` },
      retryable: true,
      waitMs: retryAfterOr(res, backoffMs(attempt)),
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
    if (!refresh) {
      const row = readCachedRow(file);
      if (
        row !== null && typeof row.body === 'string'
        && now() - Date.parse(row.fetched_at) < lifetimeMs(groupOf(hostOf(url)))
      ) {
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
      if (!refresh && existsSync(bin)) {
        const row = readCachedRow(head);
        if (row !== null) {
          const cached = new Uint8Array(readFileSync(bin));
          return { ok: true, status: row.status, bytes: cached, fromCache: true, error: null };
        }
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
