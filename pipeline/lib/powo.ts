import { channelHint, licenseAllowed } from './candidates.ts';
import { decodeEntities, htmlText, openTags } from './html.ts';
import { licenseLabelFromUrl, normalizeLicenseUrl } from './licenses.ts';

/**
 * Kew POWO is not a fetch source. Kew returns a Cloudflare challenge to scripts, so an agent
 * saves the gallery in the built-in browser (.claude/skills/powo-harvest/SKILL.md). This
 * module reads the saved HTML.
 */
export const POWO_SOURCE = 'Plants of the World Online (Kew)';

/** One `photos add` row: the one input shape of pipeline/scripts/mkadds.cjs. */
export interface AddRow {
  target: string;
  origin: string;
  file_url: string;
  author: string;
  license: string;
  license_url: string | null;
  source: string;
  source_species: string | null;
  channel_hint: string | null;
}

/** The reason an image gives no row. */
export type PowoSkip = 'herbarium' | 'no_license' | 'license_not_allowed' | 'no_credit' | 'no_file';

export interface PowoAnchor {
  /** The full-size file, protocol-relative: `//d2seqvvyy3b8p2.cloudfront.net/<hash>.jpg`. */
  href: string;
  /** The caption with its references decoded once, so it is an HTML fragment. */
  caption: string;
}

export interface PowoResult {
  rows: AddRow[];
  skipped: Record<PowoSkip, number>;
}

const SECTION = /<section\b[^>]*\bid="all-images"/i;

/**
 * The gallery anchors, one for each full-size file. The header carousel outside
 * `section#all-images` repeats the same anchors, so only that section is read when the page
 * holds it.
 */
export function powoAnchors(html: string): PowoAnchor[] {
  const start = html.search(SECTION);
  let scope = html;
  if (start !== -1) {
    const end = html.indexOf('</section>', start);
    scope = html.slice(start, end === -1 ? html.length : end);
  }
  const anchors: PowoAnchor[] = [];
  const seen = new Set<string>();
  for (const tag of openTags(scope, 'a')) {
    const href = tag.attrs.href;
    const caption = tag.attrs['data-caption'];
    if (href === undefined || caption === undefined || seen.has(href)) continue;
    seen.add(href);
    anchors.push({ href, caption: decodeEntities(caption) });
  }
  return anchors;
}

const SMALL = /<small>([\s\S]*)<\/small>\s*$/i;
const PHOTO_ID = /^ID:(\d+)\s*([\s\S]*)$/;
const CC_LINK = /https?:\/\/(?:www\.)?creativecommons\.org\/\S+/i;
const FILE_HASH = /\/([0-9a-f]{32})\.jpg$/i;

/**
 * One add row, or the reason for no row. The caption reads
 * `<title><br>ID:<n> <licence text><small><credit></small>`.
 */
export function powoRow(anchor: PowoAnchor, pageUrl: string, target: string): AddRow | PowoSkip {
  const small = SMALL.exec(anchor.caption);
  const head = small === null ? anchor.caption : anchor.caption.slice(0, small.index);
  const [titlePart, ...restParts] = head.split(/<br\s*\/?>/i);
  // A photo carries `ID:<n>`. A herbarium sheet carries a K barcode and no ID (owner ruling
  // 2026-09-25: photographs only).
  const photo = PHOTO_ID.exec(htmlText(restParts.join(' ')));
  if (photo === null) return 'herbarium';
  const licenseText = photo[2];
  // "Not Kew Copyright. Only licensed for display purposes in POWO." carries no licence url.
  const link = CC_LINK.exec(licenseText);
  const label = link === null ? null : licenseLabelFromUrl(link[0]);
  if (link === null || label === null) return 'no_license';
  // The holder text before the url stays in front of the label: `© RBG Kew, CC BY 3.0`.
  const holder = licenseText.slice(0, link.index).trim().replace(/[,;.]$/, '').trim();
  const license = holder === '' ? label : `${holder}, ${label}`;
  if (!licenseAllowed(license)) return 'license_not_allowed';
  // A credit can start with a name link: `<a>Platanus × acerifolia</a> | <credit>`.
  const creditText = small === null ? '' : htmlText(small[1]);
  const bar = creditText.lastIndexOf(' | ');
  const author = (bar === -1 ? creditText : creditText.slice(bar + 3)).trim();
  if (author === '') return 'no_credit';
  // The site has no page for one image, so the origin carries the file hash as a fragment.
  const file = FILE_HASH.exec(anchor.href);
  if (file === null) return 'no_file';
  const title = htmlText(titlePart ?? '');
  const dash = title.indexOf(' - ');
  const species = (dash === -1 ? title : title.slice(0, dash)).trim();
  return {
    target,
    origin: `${pageUrl}#image=${file[1].toLowerCase()}`,
    file_url: anchor.href.startsWith('//') ? `https:${anchor.href}` : anchor.href,
    author,
    license,
    license_url: normalizeLicenseUrl(link[0]),
    source: POWO_SOURCE,
    source_species: species === '' ? null : species,
    channel_hint: channelHint(htmlText(anchor.caption)),
  };
}

/** The add rows of one saved gallery, and the count of images skipped for each reason. */
export function parsePowoImages(html: string, pageUrl: string, target: string): PowoResult {
  const skipped: Record<PowoSkip, number> = {
    herbarium: 0,
    no_license: 0,
    license_not_allowed: 0,
    no_credit: 0,
    no_file: 0,
  };
  const rows: AddRow[] = [];
  for (const anchor of powoAnchors(html)) {
    const result = powoRow(anchor, pageUrl, target);
    if (typeof result === 'string') skipped[result] += 1;
    else rows.push(result);
  }
  return { rows, skipped };
}
