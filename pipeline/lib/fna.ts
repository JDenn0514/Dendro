import fs from 'node:fs';

import { isHybrid } from './plants.ts';

export interface SectionPage {
  section: string;
  taxonId: string;
  url: string;
}

const BROWSE = 'http://www.efloras.org/browse.aspx?flora_id=1&start_taxon_id=';

// The efloras certificate is self-signed, so the fetch uses http.
export const SECTION_PAGES: SectionPage[] = [
  { section: 'Lobatae', taxonId: '302020', url: `${BROWSE}302020` },
  { section: 'Protobalanus', taxonId: '302027', url: `${BROWSE}302027` },
  { section: 'Quercus', taxonId: '302029', url: `${BROWSE}302029` },
];

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;
const ITALIC = /<i\b[^>]*>([\s\S]*?)<\/i>/i;
const TAG = /<[^>]*>/g;

/** The text of the anchor that leads to the next page of a section. */
const NEXT_TEXT = 'next page';

/** A genus and an epithet. A one-word name is the genus alone, not a species. */
const BINOMIAL_WORDS = 2;

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&times;/gi, '×')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function hrefOf(attributes: string): string | null {
  const found = HREF.exec(attributes);
  if (found === null) return null;
  return decodeEntities(found[2] ?? found[3] ?? found[4] ?? '');
}

function textOf(inner: string): string {
  return squash(decodeEntities(inner.replace(TAG, ' ')));
}

/** A taxon link carries a taxon_id parameter. start_taxon_id is a browse link, not a taxon. */
function isTaxonLink(href: string): boolean {
  return /[?&]taxon_id=\d+/.test(href);
}

/** Reads the scientific names off one browse page, in page order. */
export function parseSectionPage(html: string): string[] {
  const names: string[] = [];
  ANCHOR.lastIndex = 0;
  let match: RegExpExecArray | null = ANCHOR.exec(html);
  while (match !== null) {
    const href = hrefOf(match[1]);
    const inner = match[2];
    match = ANCHOR.exec(html);
    if (href === null || !isTaxonLink(href)) continue;
    // The author sits outside the <i>, so the italic text alone is the name.
    const italic = ITALIC.exec(inner);
    const name = textOf(italic === null ? inner : italic[1]);
    if (name === '') continue;
    if (isHybrid(name)) continue;
    if (name.split(' ').length < BINOMIAL_WORDS) continue;
    names.push(name);
  }
  return names;
}

/**
 * The absolute url of the "Next page" anchor, or null when the page holds none.
 * `pageUrl` is the absolute url the html came from. `cli data sections` calls
 * this after each page and stops when it gives null.
 */
export function nextPageUrl(html: string, pageUrl: string): string | null {
  ANCHOR.lastIndex = 0;
  let match: RegExpExecArray | null = ANCHOR.exec(html);
  while (match !== null) {
    const href = hrefOf(match[1]);
    const text = textOf(match[2]).toLowerCase();
    match = ANCHOR.exec(html);
    if (href === null || href === '') continue;
    if (text !== NEXT_TEXT) continue;
    return new URL(href, pageUrl).toString();
  }
  return null;
}

/** Maps every name on every page to its section. A name in two sections is an error. */
export function buildSectionTable(pages: { section: string; html: string }[]): Record<string, string> {
  const table: Record<string, string> = {};
  for (const page of pages) {
    for (const name of parseSectionPage(page.html)) {
      const seen = table[name];
      if (seen !== undefined && seen !== page.section) {
        throw new Error(
          `${name} is on two section pages: ${seen} and ${page.section}. Fix the FNA table before you build it.`,
        );
      }
      table[name] = page.section;
    }
  }
  return table;
}

function keyOf(scientific: string): string {
  return squash(scientific).toLowerCase();
}

/** Looks a name up. A variety falls back to its first two words. A miss gives null. */
export function sectionFor(table: Record<string, string>, scientific: string): string | null {
  const wanted = keyOf(scientific);
  if (wanted === '') return null;
  const byKey: Record<string, string> = {};
  for (const [name, section] of Object.entries(table)) byKey[keyOf(name)] = section;
  const direct = byKey[wanted];
  if (direct !== undefined) return direct;
  const words = wanted.split(' ');
  if (words.length > BINOMIAL_WORDS) {
    const species = byKey[words.slice(0, BINOMIAL_WORDS).join(' ')];
    if (species !== undefined) return species;
  }
  return null;
}

/** Reads a section table from disk. A missing file names the command that writes it. */
export function loadSectionTable(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `The oak section table is missing at ${filePath}. Run: node pipeline/cli.ts data sections`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`The oak section table at ${filePath} is not a JSON object.`);
  }
  const table: Record<string, string> = {};
  for (const [name, section] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof section !== 'string') {
      throw new Error(`The oak section table at ${filePath} holds a non-string section for ${name}.`);
    }
    table[name] = section;
  }
  return table;
}
