import fs from 'node:fs';

import { makeCandidate, licenseAllowed } from './candidates.ts';
import type { Candidate } from './candidates.ts';
import { asRecord, asString, asNumber, asArray } from './json_fields.ts';
import { normalizeLicenseUrl } from './licenses.ts';

export const INAT_API: string = 'https://api.inaturalist.org/v1';
export const PHENOLOGY_TERM_ID: number = 12;
export const FRUITING_VALUE_ID: number = 14;
export const PER_PAGE: number = 50;

const PHOTO_LICENSES: string = 'cc0,cc-by,cc-by-sa';

export interface InatPass {
  name: string;
  termValueId: number | null;
  channelHint: string | null;
  tagsHint: string[];
}

export interface InatTaxon {
  id: number;
  name: string;
}

export interface InatPhoto {
  observation_id: number;
  photo_id: number;
  url: string;
  license_code: string;
  attribution: string;
  taxon_name: string;
}

/** The three observation passes of section 6, in order. */
export function inatPasses(floweringValueId: number): InatPass[] {
  return [
    { name: 'any', termValueId: null, channelHint: null, tagsHint: [] },
    {
      name: 'flowering',
      termValueId: floweringValueId,
      channelHint: 'flower',
      tagsHint: ['flowering'],
    },
    {
      name: 'fruiting',
      termValueId: FRUITING_VALUE_ID,
      channelHint: 'fruit',
      tagsHint: ['fruiting'],
    },
  ];
}

export function taxaUrl(scientific: string): string {
  return `${INAT_API}/taxa?q=${encodeURIComponent(scientific)}&rank=species&per_page=1`;
}

export function observationsUrl(taxonId: number, page: number, pass: InatPass): string {
  // The parameter order is fixed, so the same request always gives the same cache key.
  const params = [
    `taxon_id=${taxonId}`,
    'quality_grade=research',
    `photo_license=${PHOTO_LICENSES}`,
    'photos=true',
    'order_by=votes',
    `per_page=${PER_PAGE}`,
    `page=${page}`,
  ];
  if (pass.termValueId !== null) {
    params.push(`term_id=${PHENOLOGY_TERM_ID}`, `term_value_id=${pass.termValueId}`);
  }
  return `${INAT_API}/observations?${params.join('&')}`;
}

/**
 * Observations that carry a phenology annotation, with no value id. Task 13's
 * `cli data inat-terms` reads the value ids out of the answer and writes the flowering
 * one to `pipeline/data/inat_terms.json`.
 */
export function phenologyProbeUrl(perPage: number): string {
  const params = [
    `term_id=${PHENOLOGY_TERM_ID}`,
    'quality_grade=research',
    'photos=true',
    `per_page=${perPage}`,
  ];
  return `${INAT_API}/observations?${params.join('&')}`;
}

export function parseTaxon(json: unknown): InatTaxon | null {
  const root = asRecord(json);
  if (root === null) return null;
  const first = resultsOf(root)[0];
  if (first === undefined) return null;
  const id = asNumber(first.id);
  const name = asString(first.name);
  if (id === null || name === null) return null;
  return { id, name };
}

/** Replaces the base name of the last path segment and keeps the extension. */
export function photoUrlSize(url: string, size: string): string {
  const cut = url.lastIndexOf('/');
  if (cut === -1) return url;
  const segment = url.slice(cut + 1);
  const dot = segment.lastIndexOf('.');
  const extension = dot === -1 ? '' : segment.slice(dot);
  return `${url.slice(0, cut + 1)}${size}${extension}`;
}

const LICENSE_LABELS: Record<string, string> = {
  cc0: 'CC0 1.0',
  'cc-by': 'CC BY 4.0',
  'cc-by-sa': 'CC BY-SA 4.0',
  'cc-by-nc': 'CC BY-NC 4.0',
  'cc-by-nc-sa': 'CC BY-NC-SA 4.0',
  'cc-by-nd': 'CC BY-ND 4.0',
  'cc-by-nc-nd': 'CC BY-NC-ND 4.0',
};

// The table holds the path. `normalizeLicenseUrl` adds the trailing slash, so iNat and
// Commons write one spelling of a license url.
const LICENSE_URLS: Record<string, string> = {
  cc0: 'https://creativecommons.org/publicdomain/zero/1.0',
  'cc-by': 'https://creativecommons.org/licenses/by/4.0',
  'cc-by-sa': 'https://creativecommons.org/licenses/by-sa/4.0',
  'cc-by-nc': 'https://creativecommons.org/licenses/by-nc/4.0',
  'cc-by-nc-sa': 'https://creativecommons.org/licenses/by-nc-sa/4.0',
  'cc-by-nd': 'https://creativecommons.org/licenses/by-nd/4.0',
  'cc-by-nc-nd': 'https://creativecommons.org/licenses/by-nc-nd/4.0',
};

/**
 * iNat reports the license family, not the version. 4.0 is the version iNat applies to
 * a new upload, so the label is the pipeline's reading and the agent checks it against
 * the source page.
 */
export function licenseLabel(code: string): string {
  return LICENSE_LABELS[code] ?? 'All rights reserved';
}

export function licenseUrlFor(code: string): string | null {
  return normalizeLicenseUrl(LICENSE_URLS[code] ?? null);
}

/**
 * Flattens the observations into photo rows. A photo with no license code is dropped,
 * because the label would read "All rights reserved" and the row could never publish.
 * The `error` field carries the API's own error, so a failed call never reads as an
 * empty listing.
 */
export function parseObservations(json: unknown): {
  photos: InatPhoto[];
  error: string | null;
} {
  const root = asRecord(json);
  if (root === null) return { photos: [], error: 'the response body is not an object' };
  const error = apiError(root);
  if (error !== null) return { photos: [], error };

  const photos: InatPhoto[] = [];
  for (const observation of resultsOf(root)) {
    const observationId = asNumber(observation.id);
    if (observationId === null) continue;
    const taxon = asRecord(observation.taxon);
    const taxonName = taxon === null ? null : asString(taxon.name);
    const rows = asArray(observation.photos) ?? [];
    for (const row of rows) {
      const photo = asRecord(row);
      if (photo === null) continue;
      const photoId = asNumber(photo.id);
      const url = asString(photo.url);
      const licenseCode = asString(photo.license_code);
      if (photoId === null || url === null || licenseCode === null) continue;
      photos.push({
        observation_id: observationId,
        photo_id: photoId,
        url,
        license_code: licenseCode,
        attribution: asString(photo.attribution) ?? '',
        taxon_name: taxonName ?? '',
      });
    }
  }
  return { photos, error: null };
}

export function inatCandidates(
  photos: InatPhoto[],
  target: string,
  pass: InatPass,
  now: string,
): Candidate[] {
  const rows: Candidate[] = [];
  for (const photo of photos) {
    const license = licenseLabel(photo.license_code);
    if (!licenseAllowed(license)) continue;
    const author = photo.attribution.trim();
    // The app prints the credit verbatim, so a row with no author can never publish.
    if (author === '') continue;
    rows.push(
      makeCandidate({
        target,
        source_key: 'inat',
        // The fragment carries the photo id, so two photos of one observation are two
        // candidates. A fragment never reaches the server, so the link still opens the
        // observation page.
        origin: `https://www.inaturalist.org/observations/${photo.observation_id}#photo=${photo.photo_id}`,
        file_url: photoUrlSize(photo.url, 'original'),
        author,
        license,
        license_url: licenseUrlFor(photo.license_code),
        source_species: photo.taxon_name === '' ? null : photo.taxon_name,
        channel_hint: pass.channelHint,
        tags_hint: pass.tagsHint,
        fetched_at: now,
      }),
    );
  }
  return rows;
}

export function loadInatTerms(path: string): { flowering_value_id: number } {
  if (!fs.existsSync(path)) {
    throw new Error(`the iNat terms file is absent: ${path}. Run "cli data inat-terms".`);
  }
  const parsed = asRecord(JSON.parse(fs.readFileSync(path, 'utf8')));
  const value = parsed === null ? null : asNumber(parsed.flowering_value_id);
  if (value === null) {
    throw new Error(
      `the iNat terms file has no flowering_value_id: ${path}. Run "cli data inat-terms".`,
    );
  }
  return { flowering_value_id: value };
}

function resultsOf(root: Record<string, unknown>): Record<string, unknown>[] {
  const results = asArray(root.results);
  if (results === null) return [];
  const rows: Record<string, unknown>[] = [];
  for (const row of results) {
    const record = asRecord(row);
    if (record !== null) rows.push(record);
  }
  return rows;
}

/** iNat sends `error` as a string, or as an object with a `message`. */
function apiError(root: Record<string, unknown>): string | null {
  const direct = asString(root.error);
  if (direct !== null) return direct;
  const record = asRecord(root.error);
  if (record === null) return null;
  return asString(record.message) ?? 'the iNaturalist API returned an error';
}
