import { channelHint, makeCandidate, type Candidate } from './candidates.ts';
import { htmlText, openTags } from './html.ts';
import type { Http } from './http.ts';

export const TSO_BASE = 'https://www.treesandshrubsonline.org';
export const TSO_SITEMAP_URL = `${TSO_BASE}/sitemap.xml`;

/**
 * The site licence (`/about/licence/`, read 2026-09-25). No caption states a licence of its
 * own, so every kept row carries this one.
 */
export const TSO_LICENSE = 'CC BY-SA 4.0';
export const TSO_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

export interface TsoImage {
  /** The file path, as the page writes it: `/site/assets/files/<pageId>/<file>`. */
  href: string;
  /** The raw `data-caption` value: an HTML fragment. */
  caption: string;
}

export interface TsoPage {
  /** The name in the `<h1>`, with no author. */
  species: string | null;
  images: TsoImage[];
  /** The `id` of each `<h3>`. Those sections hold cultivars and varieties. */
  sectionIds: string[];
}

/** The article path of a name: `/articles/<genus>/<genus>-<epithet>/`, lower case, `×` as `x`. */
export function tsoPath(name: string): string | null {
  const words = name
    .normalize('NFC')
    .replace(/×/g, ' x ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ');
  const genus = words[0] ?? '';
  let epithet = words[1] ?? '';
  if (epithet === 'x') epithet = words[2] === undefined ? '' : `x-${words[2]}`;
  if (!/^[a-z]+$/.test(genus) || !/^[a-z][a-z-]*$/.test(epithet)) return null;
  return `/articles/${genus}/${genus}-${epithet}/`;
}

/** The paths that the sitemap lists on the TSO host. */
export function parseSitemapPaths(xml: string): Set<string> {
  const paths = new Set<string>();
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let url: URL;
    try {
      url = new URL(match[1]);
    } catch {
      continue;
    }
    if (url.hostname === 'www.treesandshrubsonline.org') paths.add(url.pathname);
  }
  return paths;
}

const AUTHORS = /<span\s+class=["']?authors["']?>[\s\S]*?<\/span>/gi;
const HEADING = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i;
const SECTION_ID = /<h3\s+id=["']?([^"'\s>]+)["']?/gi;

/** The heading, the gallery images (one for each href), and the section ids of one article. */
export function parseTsoPage(html: string): TsoPage {
  const heading = HEADING.exec(html);
  const name = heading === null ? '' : htmlText(heading[1].replace(AUTHORS, ' '));
  const images: TsoImage[] = [];
  const seen = new Set<string>();
  for (const tag of openTags(html, 'a')) {
    const classes = (tag.attrs.class ?? '').split(/\s+/);
    const href = tag.attrs.href;
    const caption = tag.attrs['data-caption'];
    // The lightbox repeats some images in hidden anchors with no `uk-inline` class.
    if (!classes.includes('uk-inline') || href === undefined || caption === undefined) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    images.push({ href, caption });
  }
  const sectionIds = [...html.matchAll(SECTION_ID)].map((match) => match[1]);
  return { species: name === '' ? null : name, images, sectionIds };
}

const FOLDER = /^\/site\/assets\/files\/(\d+)\//;

/**
 * The images of the species itself: the files in a `/site/assets/files/<pageId>/` folder
 * whose `<pageId>` is not the id of an `<h3>` on the page.
 */
export function ownImages(page: TsoPage): TsoImage[] {
  const sections = new Set(page.sectionIds);
  return page.images.filter((image) => {
    const folder = FOLDER.exec(image.href);
    return folder !== null && !sections.has(folder[1]);
  });
}

// A caption with its own rights text may differ from the site licence, so it is skipped.
const OWN_RIGHTS = /©|\(c\)|permission|courtesy|rights reserved/i;
const CREDIT = 'Image ';
// The words in lower case that can be part of a name, as in `Jan van der Berg`.
const NAME_JOINERS = new Set([
  'and', '&', 'de', 'del', 'della', 'der', 'den', 'di', 'da', 'do', 'dos', 'du', 'la', 'le',
  'van', 'von', 'y',
]);

/** True when the text can be a name: no digit, and each word in lower case is a name joiner. */
function looksLikeName(name: string): boolean {
  if (/\d/.test(name)) return false;
  return name.split(/\s+/).every((word) => !/^\p{Ll}/u.test(word) || NAME_JOINERS.has(word));
}

/**
 * The photographer of a caption that ends `Image <Name>.`, or null. A name can hold a period,
 * as in `Paul W. Meyer`, so the name is the text after the last `Image `. When that text holds
 * a digit or a word in lower case, the caption goes on after the name, and the value is null.
 */
export function tsoCredit(text: string): string | null {
  if (OWN_RIGHTS.test(text)) return null;
  const at = text.lastIndexOf(CREDIT);
  if (at === -1 || (at > 0 && text[at - 1] !== ' ')) return null;
  const name = text.slice(at + CREDIT.length).replace(/\.\s*$/, '').trim();
  if (name === '' || !looksLikeName(name)) return null;
  return name;
}

/** One row for each credited image of the species. The origin carries the file name as a fragment. */
export function tsoCandidates(
  page: TsoPage,
  pageUrl: string,
  target: string,
  now: string,
): Candidate[] {
  const rows: Candidate[] = [];
  for (const image of ownImages(page)) {
    const text = htmlText(image.caption);
    const author = tsoCredit(text);
    if (author === null) continue;
    const fileName = image.href.split('/').pop() ?? '';
    rows.push(
      makeCandidate({
        target,
        source_key: 'tso',
        // The candidate id is sha1(target|origin), and one article holds many images.
        origin: `${pageUrl}#image=${fileName}`,
        file_url: new URL(image.href, TSO_BASE).href,
        author,
        license: TSO_LICENSE,
        license_url: TSO_LICENSE_URL,
        source_species: page.species,
        channel_hint: channelHint(text),
        fetched_at: now,
      }),
    );
  }
  return rows;
}

/** The TSO rows of one symbol. `names` holds the scientific name and the PLANTS synonyms. */
export async function tsoRows(
  http: Http,
  names: string[],
  target: string,
  now: string,
): Promise<Candidate[]> {
  const sitemap = await http.getText(TSO_SITEMAP_URL);
  if (!sitemap.ok) return [];
  const listed = parseSitemapPaths(sitemap.body);
  const rows: Candidate[] = [];
  const tried = new Set<string>();
  for (const name of names) {
    const path = tsoPath(name);
    // A path that the sitemap does not list costs no request and records no failure.
    if (path === null || tried.has(path) || !listed.has(path)) continue;
    tried.add(path);
    const pageUrl = `${TSO_BASE}${path}`;
    const page = await http.getText(pageUrl);
    if (!page.ok) continue;
    const parsed = parseTsoPage(page.body);
    // The heading must name the species, or a moved article could give another plant's photos.
    if (parsed.species === null || tsoPath(parsed.species) !== path) continue;
    rows.push(...tsoCandidates(parsed, pageUrl, target, now));
  }
  return rows;
}
