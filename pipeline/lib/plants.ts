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
 * The channel a PLANTS file name code stands for. The table is empty, and every
 * PLANTS image gets a null hint.
 *
 * Task 19 read the live file names and found that the three letters name the
 * size, the orientation, and the kind of picture, not the part of the plant:
 * `quga_001_lvp.jpg` is the large, vertical photo of image 001, and
 * `qual_001_lvd.tif` is the drawing. The same code covers every channel:
 * `quga_001_lvp` is bark, `quga_003_lvp` is flowers, `quga_004_lhp` is a leaf,
 * and `quga_006_lhp` is a whole tree. So no code can carry a channel, and a
 * hint read off the file name would bias the approval agent. The table stays,
 * because a later response may add a code that does mean something.
 */
export const PART_CODE_CHANNELS: Record<string, string> = {};

/**
 * The two letter code of each state name the live distribution file writes, in
 * upper case. The file spells the state out, so the run's state scope, which
 * uses the two letter codes, needs this table to compare the two.
 */
const US_STATE_CODES: Record<string, string> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  'DISTRICT OF COLUMBIA': 'DC',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'PUERTO RICO': 'PR',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  'VIRGIN ISLANDS': 'VI',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
};

/** The walk of the subordinate taxa pages stops here, whatever the source says. */
const MAX_SUBORDINATE_ROWS = 500;

const RANK_MARKERS: string[] = ['var.', 'subsp.', 'ssp.', 'f.'];

/** A genus and an epithet. */
const BINOMIAL_WORDS = 2;

/** A rank marker and the epithet after it. */
const MARKER_WORDS = 2;

const NOT_JSON = 'body is not JSON';
const NOT_CSV = 'body is not the expected CSV';

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
    // The live profile names the ancestor list `Ancestors`.
    family: familyOf(row.Ancestors ?? row.AncestorRanks),
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
  return subordinateList(json)
    .map((raw) => {
      const row = recordOf(raw);
      return {
        key: str(row.Symbol).toUpperCase(),
        name: subordinateLabel(stripItalics(str(row.ScientificName))),
      };
    })
    .filter((row) => row.key !== '' && row.name !== '');
}

/**
 * The unique US state codes in the distribution CSV, sorted.
 *
 * The live file writes the country as `United States` and the state as its full
 * name, as in `QUGA,United States,New Mexico,35,Santa Fe,049`. A two letter code
 * is also accepted, because a row can carry one. A row of another country, or of
 * a state name the table does not hold, is dropped.
 */
export function parseDistribution(csv: string): string[] {
  const states = new Set<string>();
  for (const cells of dataLines(csv)) {
    if (!isUnitedStates(cells[1] ?? '')) continue;
    const state = stateCode((cells[2] ?? '').trim());
    if (state !== null) states.add(state);
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

/**
 * The synonym names of an accepted symbol. The identity check reads them.
 *
 * Every row of the live `plantlst.txt` carries the accepted symbol in the first
 * column. A row for an accepted name leaves the second column empty; a row for a
 * synonym puts the synonym's own symbol there and its own name in the third
 * column. So the synonyms of `QUGAG` are the rows whose first column is `QUGAG`
 * and whose second column is filled, as in
 * `"QUGAG","QUUT","Quercus utahensis (A. DC.) Rydb."`.
 */
export function synonymNames(rows: ChecklistRow[], symbol: string): string[] {
  return rows
    .filter((row) => row.symbol === symbol && row.synonym_symbol !== '')
    .map((row) => row.scientific);
}

/** The three letter part code at the end of a PLANTS file name, lower cased. */
export function partCodeOf(path: string): string | null {
  const file = path.split('/').pop() ?? '';
  const base = file.replace(/\.[^.]+$/, '');
  const match = /_([A-Za-z]{3})$/.exec(base);
  return match === null ? null : match[1].toLowerCase();
}

/**
 * One row per image in a PlantImages response.
 *
 * The live response is a bare array, and it names each size in its own field:
 * `LargeSizeImageLibraryPath`, `StandardSizeImageLibraryPath`, and
 * `OriginalSizeImageLibraryPath`. The large path is taken first, because the
 * original is a TIFF for a drawing and is larger than the pipeline needs. A row
 * with no large path falls back to the standard path, then to the original.
 */
export function parseImages(json: unknown): PlantsImage[] {
  return listOf(json, 'PlantImages')
    .map((raw) => {
      const row = recordOf(raw);
      const path = imagePath(row);
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
 *
 * `target` is the run's target and `symbol` is the PLANTS symbol of the species
 * the images come from. The two differ on a concept run, whose target is
 * `<channel>/<key>`. D21: the origin is the species' own profile page, so it
 * comes from the symbol. A target in that url would name a page that does not
 * exist, and would give one photo two origins under two concept targets.
 */
export function plantsCandidates(
  images: PlantsImage[],
  target: string,
  symbol: string,
  scientific: string,
  now: string,
): Candidate[] {
  const profile = `${PLANTS_PROFILE}${symbol}`;
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
    const onPage = subordinateList(parsed.value).length;
    if (onPage === 0) return rows;
    rows.push(...parseSubordinateTaxa(parsed.value));
    read += onPage;
    // The live response writes `NumTotalResults` as null, so the count is 0 and
    // the empty page above is what ends the walk. A response that does carry a
    // total still ends the walk on that total.
    const total = totalResults(parsed.value);
    if (total > 0 && read >= total) return rows;
    if (read >= MAX_SUBORDINATE_ROWS) return rows;
  }
}

export async function fetchDistribution(
  http: Http,
  plantsId: number,
  now: string,
): Promise<string[]> {
  const result = await http.postJson(DISTRIBUTION_URL, { MasterId: plantsId });
  // A result that is not ok is already a row in http.failures.
  if (!result.ok) return [];
  if (!looksLikeDistributionCsv(result.body)) {
    http.failures.push({ url: DISTRIBUTION_URL, status: result.status, message: NOT_CSV, at: now });
    return [];
  }
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

export async function fetchChecklist(http: Http, now: string): Promise<ChecklistRow[]> {
  const result = await http.getText(CHECKLIST_URL);
  // A result that is not ok is already a row in http.failures.
  if (!result.ok) return [];
  if (!looksLikeChecklistCsv(result.body)) {
    http.failures.push({ url: CHECKLIST_URL, status: result.status, message: NOT_CSV, at: now });
    return [];
  }
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
 *
 * `f.` is ambiguous: it is both the forma rank marker and, in an author string, the
 * abbreviation for filius (`Hook. f.`, `Balf. f.`). It counts as a rank marker only
 * when the word right before it is a lowercase epithet, never a capitalized author
 * abbreviation. The other markers carry no such author string, so they keep the
 * plain rule.
 */
function rankMarkerAt(words: string[]): number {
  for (let i = BINOMIAL_WORDS; i + 1 < words.length; i += 1) {
    const marker = words[i].toLowerCase();
    if (!RANK_MARKERS.includes(marker)) continue;
    if (marker === 'f.' && !isFormaEpithet(words[i + 1])) continue;
    return i;
  }
  return -1;
}

/**
 * True when the word after an `f.` is the epithet of a forma.
 *
 * `f.` reads two ways in the live `plantlst.txt`. In `Acer nigrum Michx. f. var.
 * floridanum` and in `Cleistanthus Hook. f. ex Planch.` it is filius, the son of
 * the author. In `Abies grandis (Douglas ex D. Don) Lindl. f. johnsonii` it is
 * forma. The word after the `f.` settles which: a forma carries a lowercase
 * epithet, and filius carries an author, an `&`, another rank marker, or the
 * connecting word `ex`. The rule reads all 64 forma rows of the live file, and
 * all 32 of its `f. ex` rows, the right way. The word before the `f.` does not
 * settle it, because a forma epithet follows an author as often as filius does.
 */
function isFormaEpithet(word: string): boolean {
  return word.toLowerCase() !== 'ex' && isLowercaseEpithet(word);
}

/** All lowercase letters, optionally with one hyphen, as a botanical epithet is written. */
function isLowercaseEpithet(word: string): boolean {
  return /^[a-z]+(-[a-z]+)?$/.test(word);
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

/**
 * The native status of the lower 48 states.
 *
 * The live row reads `{ "Region": "L48", "Status": "N", "Type": "Native" }`, so
 * the letter is in `Status`. `NativeStatus` is read as well, because the field
 * shape the plan documented named it that way.
 */
function nativeStatusL48(value: unknown): string | null {
  for (const raw of asList(value)) {
    const row = recordOf(raw);
    if (str(row.Region).toUpperCase() !== 'L48') continue;
    const status = (str(row.Status) || str(row.NativeStatus)).toUpperCase();
    if (status === 'N') return 'native';
    if (status === 'I') return 'introduced';
    return null;
  }
  return null;
}

/**
 * The family name in the ancestor list.
 *
 * The live profile names the list `Ancestors`, and writes the family with its
 * author, as `<i>Fagaceae</i> Dumort.`, so only the first word is the family.
 */
function familyOf(value: unknown): string | null {
  for (const raw of asList(value)) {
    const row = recordOf(raw);
    if (str(row.Rank).toLowerCase() !== 'family') continue;
    return orNull(stripItalics(str(row.ScientificName)).split(' ')[0] ?? '');
  }
  return null;
}

/** The path of the size the pipeline downloads: large, else standard, else original. */
function imagePath(row: Record<string, unknown>): string {
  const large = str(row.LargeSizeImageLibraryPath);
  if (large !== '') return large;
  const standard = str(row.StandardSizeImageLibraryPath);
  if (standard !== '') return standard;
  return str(row.OriginalSizeImageLibraryPath);
}

/** True when the country cell names the United States, in either of the two forms. */
function isUnitedStates(cell: string): boolean {
  const country = cell.trim().toUpperCase();
  return country === 'US' || country === 'UNITED STATES';
}

/** The two letter code of a state cell, or null when the cell names no US state. */
function stateCode(cell: string): string | null {
  const upper = cell.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  return US_STATE_CODES[upper] ?? null;
}

/** True when the first line reads like the distribution CSV header, not a maintenance page. */
function looksLikeDistributionCsv(body: string): boolean {
  const header = headerLine(body);
  return header.includes('country') && header.includes('state');
}

/** True when the first line reads like the plantlst.txt header, not a maintenance page. */
function looksLikeChecklistCsv(body: string): boolean {
  const header = headerLine(body);
  return header.includes('symbol') && header.includes('scientific name');
}

/**
 * The header line, lower cased. The live distribution file writes a title line,
 * `Distribution Data`, above its header, so the header is the first line that
 * carries a comma, not always the first line.
 */
function headerLine(body: string): string {
  return (nonEmptyLines(body)[headerIndex(body)] ?? '').toLowerCase();
}

/** The data lines of a comma separated file, with the header line and any title dropped. */
function dataLines(body: string): string[][] {
  return nonEmptyLines(body)
    .slice(headerIndex(body) + 1)
    .map(splitCsvLine);
}

function nonEmptyLines(body: string): string[] {
  return body.split(/\r?\n/).filter((line) => line.trim() !== '');
}

/** The index of the first line that carries a comma, or 0 when no line does. */
function headerIndex(body: string): number {
  const index = nonEmptyLines(body).findIndex((line) => line.includes(','));
  return index === -1 ? 0 : index;
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
  const row = recordOf(json);
  return num(row.NumTotalResults ?? row.TotalResults);
}

/**
 * The rows of a subordinate taxa page. The live response names the list
 * `SubordinateTaxa` and pages it 20 rows at a time from the `offset` query.
 */
function subordinateList(json: unknown): unknown[] {
  const row = recordOf(json);
  if (Array.isArray(row.SubordinateTaxa)) return row.SubordinateTaxa;
  return listOf(json, 'PlantResults');
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
