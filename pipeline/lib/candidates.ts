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
    // A copy, not the caller's array, so two rows built from one pass's tags_hint never
    // share one array: a later push onto one row could not change another row or the pass.
    tags_hint: fields.tags_hint === undefined ? [] : [...fields.tags_hint],
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
    .replace(/\bu\.?\s*s\.?/g, 'us')
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

/**
 * Merges one row list per exemplar into one list, round-robin: row 0 of every group,
 * then row 1 of every group, and so on until every group is empty.
 *
 * A concept target looks its photos up through two or three exemplar species. `collect`
 * walks one list in order and stops at MAX_PER_SPECIES, so a plain concatenation gives
 * the whole cap to the first exemplar and the others reach no row. Round-robin splits
 * the cap about evenly, and a short group leaves its share to the others.
 *
 * One group in, the same order out, so a bucket run does not change.
 */
export function interleave(groups: Candidate[][]): Candidate[] {
  const out: Candidate[] = [];
  const longest = groups.reduce((max, group) => Math.max(max, group.length), 0);
  for (let i = 0; i < longest; i += 1) {
    for (const group of groups) {
      if (i < group.length) out.push(group[i]);
    }
  }
  return out;
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
