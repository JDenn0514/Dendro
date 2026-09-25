import { channelHint, makeCandidate, type Candidate } from './candidates.ts';
import { htmlText } from './html.ts';
import type { Http } from './http.ts';
import { licenseAllowedAt } from './licenses.ts';

export const WILDFLOWER_BASE = 'https://www.wildflower.org';

/**
 * The image pages read for one symbol, at most, in list order. Each image costs one page
 * request for its credit, and the policy forbids bulk harvesting. QUGA lists 59 images.
 */
export const WILDFLOWER_MAX_IMAGES = 20;

/**
 * The licence text of every row. `licenseAllowedAt` accepts it for www.wildflower.org only
 * (owner ruling 2026-09-25, docs/decisions/2026-09-25-wildflower-permission.md).
 */
export const WILDFLOWER_LICENSE = 'used with permission, non-commercial';

/** The one value of the `Restrictions:` field that this source keeps. */
export const WILDFLOWER_UNRESTRICTED = 'Unrestricted';

const NO_IMAGE = 'Sorry, no image for this plant';
const CONTENT = 'id="fullpage_content"';
const INFORMATION = '<h4>Image Information</h4>';

/** The gallery list of one PLANTS symbol. The site keys plants by PLANTS symbol. */
export function wildflowerGalleryUrl(symbol: string): string {
  return `${WILDFLOWER_BASE}/gallery/species.php?id_plant=${encodeURIComponent(symbol)}`;
}

/** The page of one image. Each image has its own page, so the origin needs no fragment. */
export function wildflowerImageUrl(id: string): string {
  return `${WILDFLOWER_BASE}/gallery/result.php?id_image=${encodeURIComponent(id)}`;
}

/**
 * The pages say iso-8859-1, and browsers read that label as windows-1252, so this does too.
 * `Http.getText` would read the bytes as UTF-8 and break each byte above 0x7F.
 */
export function decodeWindows1252(bytes: Uint8Array): string {
  return new TextDecoder('windows-1252').decode(bytes);
}

export interface WildflowerGallery {
  /** The image ids, in list order, each once. */
  ids: string[];
  /** True on the page that says the plant has no image. That page answers HTTP 200. */
  empty: boolean;
}

export function parseWildflowerGallery(html: string): WildflowerGallery {
  const start = html.indexOf(CONTENT);
  const body = start === -1 ? html : html.slice(start);
  const ids: string[] = [];
  for (const match of body.matchAll(/result\.php\?id_image=(\d+)/g)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return { ids, empty: body.includes(NO_IMAGE) };
}

export interface WildflowerImage {
  /** The species name in `<h2 class="tax_sn">`. */
  species: string | null;
  /** `Photographer:` as the page writes it, `Last, First`. */
  photographer: string | null;
  restrictions: string | null;
  shot: string | null;
  /** The 640x480 file, the largest public size. */
  fileUrl: string | null;
}

/**
 * The `Label: value` lines of the Image Information section. The search form above it also
 * says `Photographer:`, so the scan starts at the section heading. The first line of a label
 * wins. A Map, not a plain object, so a label such as `constructor` cannot hit a prototype key.
 */
function imageFields(html: string): Map<string, string> {
  const fields = new Map<string, string>();
  const start = html.indexOf(INFORMATION);
  if (start === -1) return fields;
  const from = start + INFORMATION.length;
  const end = html.indexOf('</div>', from);
  const section = html.slice(from, end === -1 ? html.length : end);
  for (const part of section.split(/<br\s*\/?>/i)) {
    const line = /^([A-Za-z ]+):\s*(.*)$/.exec(htmlText(part));
    if (line !== null && !fields.has(line[1])) fields.set(line[1], line[2].trim());
  }
  return fields;
}

export function parseWildflowerImage(html: string): WildflowerImage {
  const heading = /<h2 class="tax_sn">([\s\S]*?)<\/h2>/i.exec(html);
  const species = heading === null ? '' : htmlText(heading[1]);
  const fields = imageFields(html);
  const image = /<img\s+src="(\/image_archive\/640x480\/[^"]+)"/i.exec(html);
  return {
    species: species === '' ? null : species,
    photographer: fields.get('Photographer') ?? null,
    restrictions: fields.get('Restrictions') ?? null,
    shot: fields.get('Shot') ?? null,
    fileUrl: image === null ? null : new URL(image[1], WILDFLOWER_BASE).href,
  };
}

/** `Last, First` as `First Last`. It splits at the first `, `. A name with no comma stays. */
export function photographerName(text: string): string {
  const at = text.indexOf(', ');
  if (at === -1) return text.trim();
  return `${text.slice(at + 2).trim()} ${text.slice(0, at).trim()}`.trim();
}

/**
 * One row, or null. Only an `Unrestricted` image with a photographer and a file is kept. The
 * app prints `<First Last>, Lady Bird Johnson Wildflower Center, used with permission,
 * non-commercial.`, which names the photographer and the Center, as the policy asks.
 */
export function wildflowerCandidate(
  image: WildflowerImage,
  origin: string,
  target: string,
  now: string,
): Candidate | null {
  if (image.restrictions !== WILDFLOWER_UNRESTRICTED) return null;
  if (image.fileUrl === null) return null;
  const photographer = (image.photographer ?? '').trim();
  if (photographer === '') return null;
  // The permission covers one host. The same check as `photos add` keeps the rule in one place.
  if (!licenseAllowedAt(WILDFLOWER_LICENSE, origin)) return null;
  return makeCandidate({
    target,
    source_key: 'wildflower',
    origin,
    file_url: image.fileUrl,
    author: photographerName(photographer),
    license: WILDFLOWER_LICENSE,
    license_url: null,
    source_species: image.species,
    channel_hint: image.shot === null ? null : channelHint(image.shot),
    fetched_at: now,
  });
}

/** The wildflower.org rows of one PLANTS symbol. */
export async function wildflowerRows(
  http: Http,
  symbol: string,
  target: string,
  now: string,
): Promise<Candidate[]> {
  // getBytes, not getText: see decodeWindows1252. getBytes also keeps each page with no
  // expiry, and the policy asks an app not to ask for a page again.
  const list = await http.getBytes(wildflowerGalleryUrl(symbol));
  if (!list.ok || list.bytes === null) return [];
  const gallery = parseWildflowerGallery(decodeWindows1252(list.bytes));
  if (gallery.empty) return [];
  const rows: Candidate[] = [];
  for (const id of gallery.ids.slice(0, WILDFLOWER_MAX_IMAGES)) {
    const origin = wildflowerImageUrl(id);
    const page = await http.getBytes(origin);
    if (!page.ok || page.bytes === null) continue;
    const row = wildflowerCandidate(
      parseWildflowerImage(decodeWindows1252(page.bytes)),
      origin,
      target,
      now,
    );
    if (row !== null) rows.push(row);
  }
  return rows;
}
