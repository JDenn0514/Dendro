import { decodeEntities, htmlText, openTags } from './html.ts';
import type { AddRow } from './powo.ts';

/**
 * Virginia Tech Dendrology fact sheets. The site allows non-commercial use of its photos
 * (owner ruling 2026-09-26, docs/decisions/2026-09-26-vt-dendrology-photo-permission.md).
 * This module reads a saved fact sheet. pipeline/scripts/vt-rows.ts fetches and writes.
 */
export const VT_HOST = 'dendro.cnre.vt.edu';
export const VT_SOURCE = 'Virginia Tech Dendrology';
/** `licenseAllowedAt` accepts this text for dendro.cnre.vt.edu and www.wildflower.org only. */
export const VT_LICENSE = 'used with permission, non-commercial';
/** The photographer list of the fact-sheet footer, word for word. */
export const VT_AUTHORS = 'John Seiler, Edward Jensen, Alex Niemiera, and John Peterson';

/** The organ names in the image file names that give a channel. All other organs give none. */
const ORGAN_CHANNELS: Record<string, string> = {
  leaf: 'leaf',
  bark: 'bark',
  fruit: 'fruit',
};

export interface VtImage {
  /** The file name as the page writes it, for example `fruit1.jpg`. */
  file: string;
  /** The lower-case word in front of the number, for example `fruit`. */
  organ: string;
  channel: string | null;
  /** The full image url, with the space in the folder name as `%20`. */
  url: string;
}

/** The channel of an organ name: leaf, bark, and fruit only. Flower, twig, form, and maps give null. */
export function vtOrganChannel(organ: string): string | null {
  return ORGAN_CHANNELS[organ.toLowerCase()] ?? null;
}

const IMAGE_FILE = /^([a-z]+)\d*\.jpe?g$/i;

/**
 * Each image link of a fact sheet, once, in page order. A link counts when it resolves to a
 * jpg file under `/dendrology/images/` on dendro.cnre.vt.edu. The names come from the page.
 * Nothing here builds a url that the page does not hold.
 */
export function parseVtImages(html: string, pageUrl: string): VtImage[] {
  const images: VtImage[] = [];
  const seen = new Set<string>();
  for (const tag of openTags(html, 'a')) {
    const href = tag.attrs.href;
    if (href === undefined || href === '') continue;
    let url: URL;
    try {
      url = new URL(decodeEntities(href), pageUrl);
    } catch {
      continue;
    }
    if (url.hostname !== VT_HOST || !url.pathname.startsWith('/dendrology/images/')) continue;
    const segment = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
    const file = decodeURIComponent(segment);
    const match = IMAGE_FILE.exec(file);
    if (match === null || seen.has(url.href)) continue;
    seen.add(url.href);
    const organ = match[1].toLowerCase();
    images.push({ file, organ, channel: vtOrganChannel(organ), url: url.href });
  }
  return images;
}

/** The scientific name in the page heading: the first `<em>` after the common name. */
export function vtSpeciesName(html: string): string | null {
  const match = /<\/big>[\s\S]*?<em>([\s\S]*?)<\/em>/i.exec(html);
  if (match === null) return null;
  const name = htmlText(match[1]);
  return name === '' ? null : name;
}

/** The names after "Photos and text by:" in the footer, up to the next semicolon. */
export function vtPhotographers(html: string): string | null {
  const match = /Photos and text by:\s*([^;<]+)/i.exec(html);
  if (match === null) return null;
  const names = htmlText(match[1]);
  return names === '' ? null : names;
}

/**
 * The add row of one image. The origin is the fact sheet plus `#image=<file name>`, so two
 * images of one sheet get two candidate ids.
 */
export function vtRow(
  image: VtImage,
  pageUrl: string,
  target: string,
  species: string | null,
  author: string,
): AddRow {
  return {
    target,
    origin: `${pageUrl}#image=${image.file}`,
    file_url: image.url,
    author,
    license: VT_LICENSE,
    license_url: null,
    source: VT_SOURCE,
    source_species: species,
    channel_hint: image.channel,
  };
}
