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
