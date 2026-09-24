import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PlantsProfile, ChecklistRow } from './plants.ts';
import { acceptedSymbols, isHybrid, isTree } from './plants.ts';
import type { InatTaxon } from './inat.ts';

export interface AuthoredSpecies {
  concepts: Record<string, string>;
  common_extra?: string[];
  audubon_name?: string;
  range: { text: string };
  planted_states?: string[];
  elevation_ft: [number, number];
  height_ft: [number, number];
  habitat: string;
  variety_notes?: Record<string, string>;
  ref: string[];
  genus_common?: string;
  arrangement?: string;
}

export interface FetchedSpecies {
  scientific: string;
  common: string[];
  family: string | null;
  genus: string;
  native_status: string | null;
  section: string | null;
  varieties: { key: string; name: string }[];
  range: { states: string[] };
  inat_taxon_id: number | null;
  inat_name: string | null;
}

export interface SpeciesRecord {
  [field: string]: unknown;
}

export const REQUIRED_AUTHORED: string[] = [
  'concepts',
  'range',
  'elevation_ft',
  'height_ft',
  'habitat',
  'ref',
];

const OPTIONAL_AUTHORED: string[] = [
  'common_extra',
  'audubon_name',
  'planted_states',
  'variety_notes',
  'genus_common',
  'arrangement',
];

const ALLOWED_AUTHORED: string[] = [...REQUIRED_AUTHORED, ...OPTIONAL_AUTHORED].sort();

/** The optional fields the merge spreads into a list. A string spreads into its letters. */
const ARRAY_AUTHORED: string[] = ['common_extra', 'planted_states'];

/** The optional fields the merge copies to the record as they are. */
const STRING_AUTHORED: string[] = ['audubon_name', 'genus_common', 'arrangement'];

/** The app prints this when PLANTS gave no native status. */
const NATIVE_STATUS_UNKNOWN = 'unknown';

/** A genus and an epithet. A name of one word is a genus row, not a species. */
const BINOMIAL_WORDS = 2;

function wordCount(name: string): number {
  const trimmed = name.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkRange(errors: string[], symbol: string, field: string, value: unknown): void {
  if (!Array.isArray(value) || value.length !== 2) {
    errors.push(`${symbol}: ${field} must be an array of two numbers`);
    return;
  }
  const [low, high] = value;
  if (typeof low !== 'number' || typeof high !== 'number') {
    errors.push(`${symbol}: ${field} must be an array of two numbers`);
    return;
  }
  if (low > high) {
    errors.push(`${symbol}: ${field} has a first number greater than its second`);
  }
}

/**
 * `conceptKeys` holds one `<channel>/<key>` string per row of content/concepts.json.
 * The caller builds it with
 * `new Set(concepts.map((row) => `${row.channel}/${row.key}`))`.
 */
export function validateAuthored(
  authored: unknown,
  symbol: string,
  conceptKeys: Set<string>,
): string[] {
  const errors: string[] = [];
  if (!isPlainObject(authored)) {
    return [`${symbol}: the authored file must be a JSON object`];
  }

  for (const field of Object.keys(authored)) {
    if (!ALLOWED_AUTHORED.includes(field)) {
      // A typo in an optional field is silent without this check.
      errors.push(`${symbol}: unknown field ${field}. Allowed: ${ALLOWED_AUTHORED.join(', ')}`);
    }
  }

  for (const field of REQUIRED_AUTHORED) {
    if (authored[field] === undefined) {
      errors.push(`${symbol}: missing required field ${field}`);
    }
  }

  const concepts = authored.concepts;
  if (concepts !== undefined) {
    if (!isPlainObject(concepts) || Object.keys(concepts).length === 0) {
      errors.push(`${symbol}: concepts must be an object with at least one channel`);
    } else {
      for (const [channel, value] of Object.entries(concepts)) {
        if (!nonEmptyString(value)) {
          errors.push(`${symbol}: concepts.${channel} must be a non-empty string`);
          continue;
        }
        // The app validator fails an unknown bucket. Catch it here, before the build
        // spends a network budget on a species it cannot publish.
        if (!conceptKeys.has(`${channel}/${String(value)}`)) {
          errors.push(`${symbol}: unknown concept ${channel}/${String(value)}`);
        }
      }
    }
  }

  const range = authored.range;
  if (range !== undefined) {
    if (!isPlainObject(range) || !nonEmptyString(range.text)) {
      errors.push(`${symbol}: range must be an object with a non-empty range.text`);
    }
  }

  if (authored.elevation_ft !== undefined) {
    checkRange(errors, symbol, 'elevation_ft', authored.elevation_ft);
  }
  if (authored.height_ft !== undefined) {
    checkRange(errors, symbol, 'height_ft', authored.height_ft);
  }

  if (authored.habitat !== undefined && !nonEmptyString(authored.habitat)) {
    errors.push(`${symbol}: habitat must be a non-empty string`);
  }

  const ref = authored.ref;
  if (ref !== undefined) {
    if (!Array.isArray(ref) || ref.length === 0 || !ref.every(nonEmptyString)) {
      errors.push(`${symbol}: ref must be a non-empty array of non-empty strings`);
    }
  }

  // An optional field of the wrong type reaches a public page. A string common_extra
  // spreads into one common name per letter.
  for (const field of ARRAY_AUTHORED) {
    const value = authored[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || !value.every(nonEmptyString)) {
      errors.push(`${symbol}: ${field} must be an array of non-empty strings`);
    }
  }

  for (const field of STRING_AUTHORED) {
    const value = authored[field];
    if (value !== undefined && !nonEmptyString(value)) {
      errors.push(`${symbol}: ${field} must be a non-empty string`);
    }
  }

  const notes = authored.variety_notes;
  if (notes !== undefined) {
    if (!isPlainObject(notes) || !Object.values(notes).every(nonEmptyString)) {
      errors.push(`${symbol}: variety_notes must be an object of non-empty strings`);
    }
  }

  return errors;
}

/** The three fetched fields the app validator requires on a species record. */
export function validateFetched(fetched: FetchedSpecies, symbol: string): string[] {
  const errors: string[] = [];
  if (!nonEmptyString(fetched.family)) {
    errors.push(`${symbol}: profile has no family`);
  }
  if (fetched.common.length === 0) {
    errors.push(`${symbol}: profile has no common name`);
  }
  if (!nonEmptyString(fetched.genus)) {
    errors.push(`${symbol}: profile has no genus`);
  }
  return errors;
}

export function readAuthored(dir: string, symbol: string): AuthoredSpecies | null {
  const path = join(dir, `${symbol}.json`);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    // A missing file means the species is not authored yet. Any other read error is a
    // fault the run must not hide: a directory in place of the file, or no permission.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    return JSON.parse(text) as AuthoredSpecies;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path} is not valid JSON: ${message}`);
  }
}

export function buildFetched(input: {
  profile: PlantsProfile;
  subordinate: { key: string; name: string }[];
  states: string[];
  section: string | null;
  inat: InatTaxon | null;
}): FetchedSpecies {
  const { profile, subordinate, states, section, inat } = input;
  const common = profile.common === null ? '' : profile.common.trim();
  return {
    scientific: profile.scientific,
    common: common === '' ? [] : [common],
    family: profile.family,
    genus: profile.genus,
    native_status: profile.native_status,
    section,
    // Task 3 returns the short label, `var. gambelii`. It is the app's variety name.
    varieties: subordinate.map((row) => ({ key: row.key, name: row.name })),
    range: { states },
    inat_taxon_id: inat === null ? null : inat.id,
    inat_name: inat !== null && inat.name !== profile.scientific ? inat.name : null,
  };
}

export function mergeSpecies(fetched: FetchedSpecies, authored: AuthoredSpecies): SpeciesRecord {
  const common: string[] = [];
  for (const name of [...fetched.common, ...(authored.common_extra ?? [])]) {
    if (!common.includes(name)) common.push(name);
  }

  const notes = authored.variety_notes ?? {};
  const varieties = fetched.varieties.map((variety) => {
    const note = notes[variety.key];
    return note === undefined
      ? { key: variety.key, name: variety.name }
      : { key: variety.key, name: variety.name, note };
  });

  const record: SpeciesRecord = {};
  record.scientific = fetched.scientific;
  record.common = common;
  if (authored.audubon_name !== undefined) record.audubon_name = authored.audubon_name;
  record.inat_taxon_id = fetched.inat_taxon_id;
  record.inat_name = fetched.inat_name;
  record.genus = fetched.genus;
  if (authored.genus_common !== undefined) record.genus_common = authored.genus_common;
  record.section = fetched.section;
  record.family = fetched.family;
  if (authored.arrangement !== undefined) record.arrangement = authored.arrangement;
  record.concepts = authored.concepts;
  record.range = { text: authored.range.text, states: fetched.range.states };
  record.planted_states = authored.planted_states ?? [];
  record.elevation_ft = authored.elevation_ft;
  record.height_ft = authored.height_ft;
  record.habitat = authored.habitat;
  record.native_status = fetched.native_status ?? NATIVE_STATUS_UNKNOWN;
  record.varieties = varieties;
  // ref stays in content_src. It never enters the published record.
  return record;
}

export function enumerateRun(input: {
  rows: ChecklistRow[];
  genera: string[];
  states: string[];
  include: string[];
  profiles: Record<string, PlantsProfile>;
  distribution: Record<string, string[]>;
}): { kept: string[]; dropped: { symbol: string; reason: string }[] } {
  const { rows, genera, states, include, profiles, distribution } = input;

  const kept: string[] = [];
  const dropped: { symbol: string; reason: string }[] = [];

  const included = new Set(include);
  const nameOf = new Map(
    rows.filter((row) => row.synonym_symbol === '').map((row) => [row.symbol, row.scientific]),
  );

  // acceptedSymbols drops the synonym rows and the other genera, and sorts.
  for (const symbol of acceptedSymbols(rows, genera)) {
    // A name of one word is a genus row, not a species. The live checklist
    // carries `Acer`, `Quercus`, and `Platanus` as accepted rows of their own,
    // and each one matches its genus.
    if (wordCount(nameOf.get(symbol) ?? '') < BINOMIAL_WORDS) {
      dropped.push({ symbol, reason: 'not a species' });
      continue;
    }
    const profile = profiles[symbol];
    if (profile === undefined) {
      dropped.push({ symbol, reason: 'no profile' });
      continue;
    }
    if (!isTree(profile)) {
      dropped.push({ symbol, reason: 'not a tree' });
      continue;
    }
    // An include symbol is the owner's own choice, so it bypasses the hybrid
    // gate and the range gate. The tree gate still applies to it.
    if (isHybrid(profile.scientific) && !included.has(symbol)) {
      dropped.push({ symbol, reason: 'hybrid' });
      continue;
    }
    const inRange = (distribution[symbol] ?? []).some((state) => states.includes(state));
    if (!inRange && !included.has(symbol)) {
      dropped.push({ symbol, reason: 'out of range' });
      continue;
    }
    kept.push(symbol);
  }

  return { kept, dropped };
}
