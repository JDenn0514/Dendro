import { channelHint, licenseAllowed, makeCandidate, type Candidate } from './candidates.ts';
import type { Http } from './http.ts';

/** The Bioimages catalogue: one row per image, `|` delimited, with a header row. */
export const BIOIMAGES_CATALOGUE_URL =
  'https://raw.githubusercontent.com/baskaufs/Bioimages/master/images.csv';

/**
 * `usageTermsIndex` to a licence, from `license.xml` in the Bioimages repository. Codes 3 and
 * 4 are NC licences, and `licenseAllowed` rejects them.
 */
export const BIOIMAGES_LICENSES: Record<string, { label: string; url: string }> = {
  '0': { label: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  '1': { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  '2': { label: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  '3': { label: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  '4': { label: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
};

/** One catalogue row, keyed by the header names. */
export type BioimagesRow = Record<string, string>;

/** Reads the catalogue by header name. The file has no quoting, so a split on `|` is exact. */
export function parseBioimagesCatalogue(text: string): BioimagesRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line !== '');
  if (lines.length === 0) return [];
  const header = lines[0].split('|');
  return lines.slice(1).map((line) => {
    const cells = line.split('|');
    const row: BioimagesRow = {};
    header.forEach((name, index) => {
      row[name] = cells[index] ?? '';
    });
    return row;
  });
}

/**
 * The name in a title, as written. No column holds the name, so the name is the title text
 * before the first ` (`, as in `Quercus gambelii (Fagaceae) - fruit - as borne on the plant`.
 */
export function bioimagesName(title: string): string {
  const cut = title.indexOf(' (');
  return (cut === -1 ? title : title.slice(0, cut)).trim();
}

/** Unicode NFC, `×` as ` x `, one space between words, trimmed, lower case. */
export function normalizeBioimagesName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/×/g, ' x ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The photographer: `photoshop_Credit` before ` http`, else `xmpRights_Owner`. */
export function bioimagesAuthor(row: BioimagesRow): string {
  const credit = row.photoshop_Credit ?? '';
  const cut = credit.indexOf(' http');
  const name = (cut === -1 ? credit : credit.slice(0, cut)).trim();
  if (name !== '') return name;
  return (row.xmpRights_Owner ?? '').trim();
}

/**
 * The `gq` file of a row: `http://bioimages.vanderbilt.edu/gq/<ns>/g<fileName>`. `<ns>` is the
 * path segment of `dcterms_identifier` before the image id, as `baskauf` in
 * `http://bioimages.vanderbilt.edu/baskauf/14133`. pipeline/scripts/harvest.cjs builds the same
 * URL, and the manifest rows came from those files. The manifest finds a retired or a published
 * photo by the hash of its image, so the fetch must download the same file. A `gq` file is
 * 1024 px on the long side. The value is null when the row has no file name or no `<ns>`.
 */
export function bioimagesFileUrl(row: BioimagesRow): string | null {
  const ns = (row.dcterms_identifier ?? '').split('/').slice(-2)[0] ?? '';
  const fileName = row.fileName ?? '';
  if (ns === '' || fileName === '') return null;
  return `http://bioimages.vanderbilt.edu/gq/${ns}/g${fileName}`;
}

/**
 * The channel hint of a title. A title names the view after `) - `, up to the next ` - `, as
 * `twig` in `Quercus rubra (Fagaceae) - twig - close-up winter leaf scar/bud`. The view word
 * comes first, because `channelHint` takes the first keyword in its own order and `leaf` comes
 * before `twig`. When the view word gives no hint, the text after `) - ` gives it.
 */
function titleHint(title: string): string | null {
  const cut = title.indexOf(' (');
  if (cut === -1) return null;
  const tail = title.slice(cut);
  const open = tail.indexOf(') - ');
  if (open === -1) return channelHint(tail);
  const rest = tail.slice(open + ') - '.length);
  const close = rest.indexOf(' - ');
  const view = close === -1 ? rest : rest.slice(0, close);
  return channelHint(view) ?? channelHint(rest);
}

/**
 * The rows of one target. `names` holds the scientific name and the PLANTS synonyms. A row
 * matches when its title name, normalised, equals one of them, normalised the same way.
 */
export function bioimagesCandidates(
  rows: BioimagesRow[],
  names: string[],
  target: string,
  now: string,
): Candidate[] {
  const wanted = new Set(names.map(normalizeBioimagesName));
  const out: Candidate[] = [];
  for (const row of rows) {
    const title = row.dcterms_title ?? '';
    const name = bioimagesName(title);
    if (!wanted.has(normalizeBioimagesName(name))) continue;
    // One bit of the suppress flag has no documented meaning, so every flagged row is skipped.
    const suppress = (row.suppress ?? '').trim();
    if (suppress !== '' && suppress !== '0') continue;
    const fileUrl = bioimagesFileUrl(row);
    if (fileUrl === null) continue;
    const license = BIOIMAGES_LICENSES[(row.usageTermsIndex ?? '').trim()];
    if (license === undefined || !licenseAllowed(license.label)) continue;
    const author = bioimagesAuthor(row);
    // The app prints the credit as it is, so a row with no author can never publish.
    if (author === '') continue;
    // Each image has its own page, so the origin needs no fragment.
    const origin = (row.ac_attributionLinkURL ?? '').trim();
    if (origin === '') continue;
    out.push(
      makeCandidate({
        target,
        source_key: 'bioimages',
        origin,
        file_url: fileUrl,
        author,
        license: license.label,
        license_url: license.url,
        source_species: name,
        channel_hint: titleHint(title),
        fetched_at: now,
      }),
    );
  }
  return out;
}

// One parse for each Http. One process has one Http, so the 12 MB catalogue parses once per
// process. A WeakMap keeps the fake Http of one test from seeing the catalogue of another.
const catalogues = new WeakMap<Http, Promise<BioimagesRow[] | null>>();

function catalogueOf(http: Http): Promise<BioimagesRow[] | null> {
  let found = catalogues.get(http);
  if (found === undefined) {
    found = http
      .getText(BIOIMAGES_CATALOGUE_URL)
      .then((result) => (result.ok ? parseBioimagesCatalogue(result.body) : null));
    catalogues.set(http, found);
  }
  return found;
}

/** The Bioimages rows of one symbol. A failed catalogue fetch gives no rows; the Http records it. */
export async function bioimagesRows(
  http: Http,
  names: string[],
  target: string,
  now: string,
): Promise<Candidate[]> {
  const rows = await catalogueOf(http);
  if (rows === null) return [];
  return bioimagesCandidates(rows, names, target, now);
}
