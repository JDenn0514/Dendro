import { makeCandidate, SOURCE_NAMES } from './candidates.ts';
import type { Candidate } from './candidates.ts';
import type { Http } from './http.ts';
import { parseJson } from './json_fields.ts';

export const PLANTS_API: string = 'https://plantsservices.sc.egov.usda.gov/api';
export const PLANTS_FILES: string = 'https://plants.sc.egov.usda.gov';
export const PLANTS_PROFILE: string = 'https://plants.usda.gov/plant-profile/';
export const CHECKLIST_URL: string = `${PLANTS_FILES}/DocumentLibrary/Txt/plantlst.txt`;
export const DISTRIBUTION_URL: string =
  `${PLANTS_API}/PlantProfile/getDownloadDistributionDocumentation`;

/** The app prints this text as part of the photo credit. */
export const PLANTS_LICENSE: string = 'public domain (US government work)';

/**
 * A PLANTS image file name ends in a three letter part code, as in
 * `quga_001_lvp.jpg`. The codes below are the ones the file names justify.
 * A code that is absent here gives a null hint. Task 19 checks this table
 * against a real PlantImages response and widens it.
 */
export const PART_CODE_CHANNELS: Record<string, string> = {
  lvp: 'leaf',
  lvd: 'leaf',
  lhp: 'leaf',
  bkp: 'bark',
  brp: 'bark',
  frp: 'fruit',
  fvp: 'fruit',
  flp: 'flower',
  twp: 'twig',
};

const RANK_MARKERS: string[] = ['var.', 'subsp.', 'ssp.', 'f.'];

/** A genus and an epithet. */
const BINOMIAL_WORDS = 2;

/** A rank marker and the epithet after it. */
const MARKER_WORDS = 2;

const NOT_JSON = 'body is not JSON';

export interface PlantsProfile {
  symbol: string;
  plants_id: number;
  scientific: string;
  author: string;
  common: string | null;
  family: string | null;
  genus: string | null;
  rank: string;
  growth_habits: string[];
  native_status: string | null;
}

export interface ChecklistRow {
  symbol: string;
  synonym_symbol: string;
  scientific: string;
  common: string;
  family: string;
}

export interface PlantsImage {
  path: string;
  copyright: boolean;
  photographer: string;
  part_code: string | null;
}

/** Removes the `<i>` tags PLANTS wraps a name in and collapses the gaps. */
export function stripItalics(html: string): string {
  return html
    .replace(/<\/?i>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a PLANTS name into the scientific name and the author.
 *
 * PLANTS writes the author in the middle of an infraspecific name, as in
 * `Quercus gambelii Nutt. var. gambelii`. So the rank marker is looked up
 * anywhere after the epithet. The scientific name is then the genus, the
 * epithet, the marker, and the epithet after the marker: BINOMIAL_WORDS plus
 * MARKER_WORDS words. Every other word is the author. A name with no marker
 * keeps its first BINOMIAL_WORDS words.
 */
export function splitScientific(nameWithAuthor: string): { scientific: string; author: string } {
  const words = wordsOf(nameWithAuthor);
  if (words.length === 0) return { scientific: '', author: '' };
  const marker = rankMarkerAt(words);
  if (marker !== -1) {
    return {
      scientific: [words[0], words[1], words[marker], words[marker + 1]].join(' '),
      author: words
        .slice(BINOMIAL_WORDS, marker)
        .concat(words.slice(marker + MARKER_WORDS))
        .join(' '),
    };
  }
  const count = Math.min(BINOMIAL_WORDS, words.length);
  return {
    scientific: words.slice(0, count).join(' '),
    author: words.slice(count).join(' '),
  };
}

export function parseProfile(json: unknown): PlantsProfile {
  const row = recordOf(json);
  const split = splitScientific(stripItalics(str(row.ScientificName)));
  const genus = split.scientific.split(' ')[0] ?? '';
  return {
    symbol: str(row.Symbol).toUpperCase(),
    plants_id: num(row.Id),
    scientific: split.scientific,
    author: split.author,
    // A missing field is null, never an empty string. Task 7 rejects a record
    // with no family or no common name, and defaults a null native_status.
    common: orNull(str(row.CommonName)),
    family: familyOf(row.AncestorRanks),
    genus: orNull(genus),
    rank: str(row.Rank),
    growth_habits: strList(row.GrowthHabits),
    native_status: nativeStatusL48(row.NativeStatuses),
  };
}

export function isTree(profile: PlantsProfile): boolean {
  return profile.growth_habits.some((habit) => habit.trim().toLowerCase() === 'tree');
}

/**
 * True when the name carries a multiplication sign or an `x` on its own.
 * `fna.ts` imports this function, so the rule lives in one place.
 */
export function isHybrid(scientific: string): boolean {
  return /×/.test(scientific) || /(^|\s)[xX](\s|$)/.test(scientific);
}

export function parseSubordinateTaxa(json: unknown): { key: string; name: string }[] {
  return listOf(json, 'PlantResults')
    .map((raw) => {
      const row = recordOf(raw);
      return {
        key: str(row.Symbol).toUpperCase(),
        name: subordinateLabel(stripItalics(str(row.ScientificName))),
      };
    })
    .filter((row) => row.key !== '' && row.name !== '');
}

/** The unique US state codes in the distribution CSV, sorted. */
export function parseDistribution(csv: string): string[] {
  const states = new Set<string>();
  for (const cells of dataLines(csv)) {
    if ((cells[1] ?? '').trim().toUpperCase() !== 'US') continue;
    const state = (cells[2] ?? '').trim().toUpperCase();
    if (state !== '') states.add(state);
  }
  return [...states].sort();
}

/** One row per data line of `plantlst.txt`. The author is split off the name. */
export function parseChecklist(body: string): ChecklistRow[] {
  return dataLines(body).map((cells) => ({
    symbol: (cells[0] ?? '').trim(),
    synonym_symbol: (cells[1] ?? '').trim(),
    scientific: splitScientific((cells[2] ?? '').trim()).scientific,
    common: (cells[3] ?? '').trim(),
    family: (cells[4] ?? '').trim(),
  }));
}

/** The accepted symbols in the given genera, sorted. A synonym row is not accepted. */
export function acceptedSymbols(rows: ChecklistRow[], genera: string[]): string[] {
  const wanted = new Set(genera.map((genus) => genus.toLowerCase()));
  const symbols = rows
    .filter((row) => row.synonym_symbol === '' && row.symbol !== '')
    .filter((row) => wanted.has((row.scientific.split(' ')[0] ?? '').toLowerCase()))
    .map((row) => row.symbol);
  return [...new Set(symbols)].sort();
}

/** The names of the rows that point at this symbol. The identity check reads them. */
export function synonymNames(rows: ChecklistRow[], symbol: string): string[] {
  return rows.filter((row) => row.synonym_symbol === symbol).map((row) => row.scientific);
}

/** The three letter part code at the end of a PLANTS file name, lower cased. */
export function partCodeOf(path: string): string | null {
  const file = path.split('/').pop() ?? '';
  const base = file.replace(/\.[^.]+$/, '');
  const match = /_([A-Za-z]{3})$/.exec(base);
  return match === null ? null : match[1].toLowerCase();
}

export function parseImages(json: unknown): PlantsImage[] {
  return listOf(json, 'PlantImages')
    .map((raw) => {
      const row = recordOf(raw);
      const path = str(row.OriginalImagePath);
      return {
        path,
        copyright: row.Copyright === true,
        photographer: str(row.CommonName),
        part_code: partCodeOf(path),
      };
    })
    .filter((image) => image.path !== '');
}

/**
 * One candidate per usable image. An image is usable when it is not copyright
 * and it names a photographer. The app prints the photographer as the credit,
 * so an image with no name cannot ship and the row never enters the queue.
 */
export function plantsCandidates(
  images: PlantsImage[],
  target: string,
  scientific: string,
  now: string,
): Candidate[] {
  const profile = `${PLANTS_PROFILE}${target}`;
  return images
    .filter((image) => !image.copyright)
    .filter((image) => image.photographer.trim() !== '')
    .map((image) =>
      makeCandidate({
        target,
        source_key: 'plants',
        source: SOURCE_NAMES.plants,
        // PLANTS has no page per image, so the profile page is the attribution page.
        // The fragment stays off the wire and gives each image its own id.
        origin: `${profile}#image=${encodeURIComponent(image.path)}`,
        file_url: `${PLANTS_FILES}${image.path}`,
        author: image.photographer,
        license: PLANTS_LICENSE,
        license_url: null,
        source_species: scientific,
        channel_hint: image.part_code === null ? null : PART_CODE_CHANNELS[image.part_code] ?? null,
        fetched_at: now,
      }),
    );
}

export function profileUrl(symbol: string): string {
  return `${PLANTS_API}/PlantProfile?symbol=${encodeURIComponent(symbol)}`;
}

export function subordinateTaxaUrl(plantsId: number, offset: number = 0): string {
  return `${PLANTS_API}/PlantSubordinateTaxa/${plantsId}?offset=${offset}`;
}

export function imagesUrl(plantsId: number): string {
  return `${PLANTS_API}/PlantImages?plantId=${plantsId}`;
}

export async function fetchProfile(
  http: Http,
  symbol: string,
  now: string,
): Promise<PlantsProfile | null> {
  const url = profileUrl(symbol);
  const result = await http.getText(url);
  // A result that is not ok is already a row in http.failures.
  if (!result.ok) return null;
  const parsed = parseJson(result.body);
  if (!parsed.ok) {
    http.failures.push({ url, status: result.status, message: NOT_JSON, at: now });
    return null;
  }
  return parseProfile(parsed.value);
}

/**
 * Every subordinate taxon of a plant. The endpoint answers one page and the
 * count of all rows in `TotalResults`, so this reads pages at rising offsets
 * until it holds them all. A page with no rows also ends the loop, so a wrong
 * count cannot spin forever.
 */
export async function fetchSubordinateTaxa(
  http: Http,
  plantsId: number,
  now: string,
): Promise<{ key: string; name: string }[]> {
  const rows: { key: string; name: string }[] = [];
  let read = 0;
  for (;;) {
    const url = subordinateTaxaUrl(plantsId, read);
    const result = await http.getText(url);
    // A result that is not ok is already a row in http.failures.
    if (!result.ok) return rows;
    const parsed = parseJson(result.body);
    if (!parsed.ok) {
      http.failures.push({ url, status: result.status, message: NOT_JSON, at: now });
      return rows;
    }
    const onPage = listOf(parsed.value, 'PlantResults').length;
    if (onPage === 0) return rows;
    rows.push(...parseSubordinateTaxa(parsed.value));
    read += onPage;
    if (read >= totalResults(parsed.value)) return rows;
  }
}

export async function fetchDistribution(http: Http, plantsId: number): Promise<string[]> {
  const result = await http.postJson(DISTRIBUTION_URL, { MasterId: plantsId });
  // A result that is not ok is already a row in http.failures.
  if (!result.ok) return [];
  return parseDistribution(result.body);
}

export async function fetchImages(
  http: Http,
  plantsId: number,
  now: string,
): Promise<PlantsImage[]> {
  const url = imagesUrl(plantsId);
  const result = await http.getText(url);
  // A result that is not ok is already a row in http.failures.
  if (!result.ok) return [];
  const parsed = parseJson(result.body);
  if (!parsed.ok) {
    http.failures.push({ url, status: result.status, message: NOT_JSON, at: now });
    return [];
  }
  return parseImages(parsed.value);
}

export async function fetchChecklist(http: Http): Promise<ChecklistRow[]> {
  const result = await http.getText(CHECKLIST_URL);
  // A result that is not ok is already a row in http.failures.
  if (!result.ok) return [];
  return parseChecklist(result.body);
}

function wordsOf(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');
}

/**
 * The index of the first rank marker after the epithet, or -1. A marker with no
 * word after it does not count, because there is no infraspecific epithet to take.
 */
function rankMarkerAt(words: string[]): number {
  for (let i = BINOMIAL_WORDS; i + 1 < words.length; i += 1) {
    if (RANK_MARKERS.includes(words[i].toLowerCase())) return i;
  }
  return -1;
}

/**
 * The short label the app shows as a quiz answer. It runs from the rank marker
 * on, with the author dropped: `Quercus gambelii Nutt. var. gambelii` gives
 * `var. gambelii`. A name with no rank marker keeps the scientific name.
 */
function subordinateLabel(nameWithAuthor: string): string {
  const words = wordsOf(nameWithAuthor);
  const marker = rankMarkerAt(words);
  if (marker === -1) return splitScientific(nameWithAuthor).scientific;
  return `${words[marker]} ${words[marker + 1]}`;
}

function orNull(text: string): string | null {
  return text === '' ? null : text;
}

function nativeStatusL48(value: unknown): string | null {
  for (const raw of asList(value)) {
    const row = recordOf(raw);
    if (str(row.Region).toUpperCase() !== 'L48') continue;
    const status = str(row.NativeStatus).toUpperCase();
    if (status === 'N') return 'native';
    if (status === 'I') return 'introduced';
    return null;
  }
  return null;
}

function familyOf(value: unknown): string | null {
  for (const raw of asList(value)) {
    const row = recordOf(raw);
    if (str(row.Rank).toLowerCase() !== 'family') continue;
    return orNull(stripItalics(str(row.ScientificName)));
  }
  return null;
}

/** The data lines of a comma separated file, with the header line dropped. */
function dataLines(body: string): string[][] {
  const lines = body.split(/\r?\n/).filter((line) => line.trim() !== '');
  return lines.slice(1).map(splitCsvLine);
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = false;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function totalResults(json: unknown): number {
  return num(recordOf(json).TotalResults);
}

function recordOf(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The array itself, or the array the named field holds. */
function listOf(json: unknown, field: string): unknown[] {
  if (Array.isArray(json)) return json;
  return asList(recordOf(json)[field]);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strList(value: unknown): string[] {
  return asList(value)
    .map((item) => str(item))
    .filter((item) => item !== '');
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
