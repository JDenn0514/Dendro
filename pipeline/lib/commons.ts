import { licenseAllowed, channelHint, makeCandidate } from './candidates.ts';
import type { Candidate } from './candidates.ts';
import { asRecord, asString, asNumber, asArray } from './json_fields.ts';
import { normalizeLicenseUrl } from './licenses.ts';

export const COMMONS_API: string = 'https://commons.wikimedia.org/w/api.php';

/** The page size an anonymous generator query gets. */
export const COMMONS_PAGE_SIZE: number = 50;

/** Commons rounds a thumbnail width to 960, 1280, 1920, or 3840. */
export const THUMB_WIDTH: number = 1280;

export interface CommonsFile {
  title: string;
  mime: string;
  width: number;
  height: number;
  url: string;
  thumb_url: string;
  description_url: string;
  license: string;
  license_url: string | null;
  artist: string;
  description: string;
}

// The parameter order is fixed, so one category always gives one cache key.
export function categoryUrl(category: string, continueToken: string | null): string {
  const parts = [
    'action=query',
    'format=json',
    'generator=categorymembers',
    `gcmtitle=Category:${encodeURIComponent(category)}`,
    'gcmtype=file',
    `gcmlimit=${COMMONS_PAGE_SIZE}`,
    'prop=imageinfo',
    'iiprop=url|extmetadata|mime|size',
    `iiurlwidth=${THUMB_WIDTH}`,
    'iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|LicenseUrl',
  ];
  if (continueToken !== null) {
    parts.push(`gcmcontinue=${encodeURIComponent(continueToken)}`);
  }
  return `${COMMONS_API}?${parts.join('&')}`;
}

// `&amp;` comes last in one pass, so `&amp;lt;` decodes to `&lt;` and not to `<`.
const ENTITIES: [string, string][] = [
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&nbsp;', ' '],
  ['&amp;', '&'],
];

function decodeEntities(text: string): string {
  let out = text;
  for (const [entity, char] of ENTITIES) {
    out = out.split(entity).join(char);
  }
  return out;
}

/**
 * `Artist` and `ImageDescription` come back as HTML. Decode first, then strip the tags,
 * so an encoded tag cannot pass the strip and land in the output as live markup. Decode
 * once more, so a twice-encoded entity reads as the text the Commons page shows.
 */
export function stripHtml(html: string): string {
  const stripped = decodeEntities(html).replace(/<[^>]*>/g, ' ');
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim();
}

export function parseCategoryListing(json: unknown): {
  files: CommonsFile[];
  next: string | null;
  error: string | null;
} {
  const root = asRecord(json);
  if (root === null) {
    return { files: [], next: null, error: 'the response body is not an object' };
  }
  const error = apiError(root);
  if (error !== null) return { files: [], next: null, error };

  const query = asRecord(root.query);
  const pages = query === null ? null : asRecord(query.pages);
  const files: CommonsFile[] = [];

  for (const page of Object.values(pages ?? {})) {
    const row = asRecord(page);
    if (row === null) continue;
    const list = asArray(row.imageinfo);
    if (list === null || list.length === 0) continue;
    const info = asRecord(list[0]);
    if (info === null) continue;
    const meta = asRecord(info.extmetadata) ?? {};

    const title = asString(row.title);
    const url = asString(info.url);
    const descriptionUrl = asString(info.descriptionurl);
    // The candidate id is the sha1 of `<target>|<origin>` and the origin is the
    // description page. With no description page every such row of one target would
    // carry one id.
    if (title === null || url === null || descriptionUrl === null) continue;

    const width = asNumber(info.width) ?? 0;
    const thumbUrl = asString(info.thumburl);
    // The request asks for a THUMB_WIDTH thumbnail, so a narrower original has none
    // worth taking.
    const thumb = thumbUrl !== null && width > THUMB_WIDTH ? thumbUrl : url;

    files.push({
      title,
      mime: asString(info.mime) ?? '',
      width,
      height: asNumber(info.height) ?? 0,
      url,
      thumb_url: thumb,
      description_url: descriptionUrl,
      license: metaValue(meta, 'LicenseShortName') ?? '',
      license_url: normalizeLicenseUrl(metaValue(meta, 'LicenseUrl')),
      artist: stripHtml(metaValue(meta, 'Artist') ?? ''),
      description: stripHtml(metaValue(meta, 'ImageDescription') ?? ''),
    });
  }

  // The pages object is keyed by page id, so sort the titles for a stable order.
  files.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));

  const cont = asRecord(root.continue);
  const next = cont === null ? null : asString(cont.gcmcontinue);
  return { files, next, error: null };
}

export function commonsCandidates(
  files: CommonsFile[],
  target: string,
  scientific: string,
  now: string,
): Candidate[] {
  const rows: Candidate[] = [];
  for (const file of files) {
    if (file.mime !== 'image/jpeg') continue;
    if (!licenseAllowed(file.license)) continue;
    const author = file.artist.trim();
    // The app prints the credit verbatim, so a row with no author can never publish.
    if (author === '') continue;
    const name = file.title.replace(/^File:/, '');
    rows.push(
      makeCandidate({
        target,
        source_key: 'commons',
        origin: file.description_url,
        file_url: file.thumb_url,
        author,
        license: file.license,
        license_url: file.license_url,
        source_species: scientific,
        channel_hint: channelHint(`${name} ${file.description}`),
        fetched_at: now,
      }),
    );
  }
  return rows;
}

/** MediaWiki sends `error.info` as the human sentence and `error.code` as the token. */
function apiError(root: Record<string, unknown>): string | null {
  const error = asRecord(root.error);
  if (error === null) return null;
  return (
    asString(error.info) ?? asString(error.code) ?? 'the Commons API returned an error'
  );
}

function metaValue(meta: Record<string, unknown>, key: string): string | null {
  const entry = asRecord(meta[key]);
  return entry === null ? null : asString(entry.value);
}
