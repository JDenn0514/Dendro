import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeEntities, htmlText } from '../lib/html.ts';
import { cachePath, createHttp } from '../lib/http.ts';
import type { Http } from '../lib/http.ts';
import { parseFlags } from '../lib/run.ts';

const USAGE =
  'usage: node pipeline/scripts/sources.ts --list <coverage.csv> [--out <dir>] [--only <SYMBOL,...>] [--refresh]';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const VT_SITE = 'Virginia Tech Dendrology';
export const FNA_SITE = 'Flora of North America (efloras)';

interface Site {
  name: string;
  /** The short name in the log and in the raw file name. */
  key: string;
  url(id: string): string;
  parse(html: string): Parsed | null;
}

export interface Parsed {
  sections: Record<string, string>;
  text: string;
  /** The FNA distribution and habitat paragraph. VT has none. */
  distribution?: string;
  /** The page's own symbol or name, to compare with the list. */
  pageName: string | null;
}

export interface SourceEntry {
  site: string;
  url: string;
  fetched_at: string;
  sections: Record<string, string>;
  text: string;
  distribution?: string;
}

export interface SpeciesFile {
  symbol: string;
  scientific_name: string;
  sources: SourceEntry[];
}

interface ListRow {
  symbol: string;
  scientific_name: string;
  vt_id: string;
  fna_id: string;
}

/** The lower-case heading, with each run of spaces or hyphens turned to one underscore. */
export function sectionKey(heading: string): string {
  return heading.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function addSection(sections: Record<string, string>, key: string, value: string): void {
  if (value === '') return;
  // A heading that comes twice keeps both texts, in page order.
  sections[key] = sections[key] === undefined ? value : `${sections[key]} ${value}`;
}

/**
 * A VT fact sheet. The sections sit as `<strong>Leaf:</strong> text<br>` in one `<small>`
 * block, and "Looks like" follows the block as a list of links.
 */
export function parseVt(html: string): Parsed | null {
  const start = html.search(/<small>\s*<strong>/i);
  if (start < 0) return null;
  const end = html.indexOf('</small>', start);
  if (end < 0) return null;
  const block = html.slice(start + '<small>'.length, end);
  const sections: Record<string, string> = {};
  const heading = /<strong>\s*([^<:]+?)\s*:\s*<\/strong>/gi;
  const marks = [...block.matchAll(heading)];
  marks.forEach((mark, i) => {
    const from = (mark.index ?? 0) + mark[0].length;
    const to = i + 1 < marks.length ? (marks[i + 1].index ?? block.length) : block.length;
    addSection(sections, sectionKey(mark[1]), htmlText(block.slice(from, to)));
  });
  let text = htmlText(block);
  const looks = /<strong>\s*Looks like:\s*<\/strong>([\s\S]*?)(?=<div|<\/p>|<p>)/i.exec(html.slice(end));
  if (looks !== null) {
    const value = htmlText(looks[1]);
    addSection(sections, 'looks_like', value);
    text = `${text} Looks like: ${value}`.trim();
  }
  const symbol = /symbol:\s*<a[^>]*>([^<]+)<\/a>/i.exec(html);
  return { sections, text, pageName: symbol === null ? null : symbol[1].trim() };
}

// An inline tag goes with no space, so `<I>Q</I>.` stays `Q.`. Any other tag is a break.
const INLINE_TAG = /<\/?(?:i|b|em|strong|sup|sub|a|font|span|small)\b[^>]*>/gi;

/** The text of an FNA paragraph, with the double spaces that mark a heading still in place. */
function fnaRaw(html: string): string {
  return decodeEntities(html.replace(INLINE_TAG, '').replace(/<[^>]*>/g, ' ')).replace(/\r?\n/g, ' ');
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// An FNA heading follows the end of a sentence, starts with a capital, and has two or more
// spaces or a colon after it: `mm.  Leaf blade  obovate`, `Leaves:  petiole`, `m.  Leaves : stipules`.
const FNA_HEADING = /(?:^|\.)\s+([A-Z][a-z]+(?:[ -][a-z]+){0,3})(?:\s*:\s+|\s{2,})/g;

/**
 * An efloras FNA treatment. The description is one paragraph with the organ words as plain
 * text. The paragraph after it holds the flowering time, the habitat, and the range. The text
 * before the first organ word (for example `Trees , deciduous, to 30(-50) m.`) goes under `habit`.
 */
export function parseFna(html: string): Parsed | null {
  const start = html.search(/id="lblTaxonDesc"/i);
  if (start < 0) return null;
  const endMatch = /<\/span>\s*<p>\s*<!--\s*Key/i.exec(html.slice(start));
  const end = endMatch === null ? html.indexOf('</span>', start) : start + endMatch.index;
  const panel = html.slice(html.indexOf('>', start) + 1, end < 0 ? html.length : end);
  const paragraphs = panel.split(/<\/?p\s*\/?>/i).map(fnaRaw).filter((p) => p.trim() !== '');
  const index = paragraphs.findIndex((p) => [...p.matchAll(FNA_HEADING)].length >= 2);
  if (index < 0) return null;
  const raw = paragraphs[index];
  const sections: Record<string, string> = {};
  const marks = [...raw.matchAll(FNA_HEADING)];
  const first = marks[0];
  // The match starts at the period, so the habit keeps it.
  addSection(sections, 'habit', collapse(raw.slice(0, (first.index ?? 0) + 1)));
  marks.forEach((mark, i) => {
    const from = (mark.index ?? 0) + mark[0].length;
    const to = i + 1 < marks.length ? (marks[i + 1].index ?? raw.length) + 1 : raw.length;
    addSection(sections, sectionKey(mark[1]), collapse(raw.slice(from, to)));
  });
  const parsed: Parsed = { sections, text: collapse(raw), pageName: null };
  const range = paragraphs
    .slice(index + 1)
    // A species with varieties gives only a short range line, `Varieties 2 (2 in the flora): Calif.`
    .find((p) => /^\s*(Flowering|Fruiting|Coning|Pollen|Seeds|Varieties \d|Subspecies \d)/.test(p) || /\d\s*m;/.test(p));
  if (range !== undefined) parsed.distribution = collapse(range);
  const name = /<b>([^<]+)<\/b>/i.exec(panel);
  parsed.pageName = name === null ? null : collapse(name[1]);
  return parsed;
}

const SITES: { vt: Site; fna: Site } = {
  vt: {
    name: VT_SITE,
    key: 'vt',
    url: (id) => `https://dendro.cnre.vt.edu/dendrology/syllabus/factsheet.cfm?ID=${id}`,
    parse: parseVt,
  },
  fna: {
    name: FNA_SITE,
    key: 'fna',
    url: (id) => `http://www.efloras.org/florataxon.aspx?flora_id=1&taxon_id=${id}`,
    parse: parseFna,
  },
};

/** The coverage file: symbol, scientific_name, existing, vt, fna, vt_id, fna_efloras_taxon_id. */
export function readList(text: string): ListRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const head = lines[0].split(',').map((cell) => cell.trim());
  const col = (name: string): number => {
    const at = head.indexOf(name);
    if (at < 0) throw new Error(`the list has no ${name} column`);
    return at;
  };
  const [sym, sci, vt, fna] = [col('symbol'), col('scientific_name'), col('vt_id'), col('fna_efloras_taxon_id')];
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    return { symbol: cells[sym], scientific_name: cells[sci], vt_id: cells[vt] ?? '', fna_id: cells[fna] ?? '' };
  });
}

/** A page is UTF-8 when it decodes as UTF-8; VT pages say iso-8859-1, so any other page is windows-1252. */
function decodePage(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function fetchedAt(cacheDir: string, url: string, fallback: string): string {
  try {
    const row = JSON.parse(fs.readFileSync(cachePath(cacheDir, url, '.bin.json'), 'utf8')) as { fetched_at?: unknown };
    if (typeof row.fetched_at === 'string') return row.fetched_at.slice(0, 10);
  } catch {
    // No head file: the date of this run stands.
  }
  return fallback;
}

interface Tally {
  fetched: number;
  cached: number;
  skipped: number;
  failed: number;
}

interface Context {
  http: Http;
  cacheDir: string;
  outDir: string;
  refresh: boolean;
  today: string;
  tally: Record<string, Tally>;
  failures: string[];
  warnings: string[];
}

async function fetchSite(ctx: Context, site: Site, row: ListRow, id: string, have: SourceEntry | undefined): Promise<SourceEntry | undefined> {
  const tally = ctx.tally[site.key];
  const tag = `${site.key.toUpperCase().padEnd(3)} ${row.symbol.padEnd(7)}`;
  if (have !== undefined && !ctx.refresh) {
    tally.skipped += 1;
    console.log(`${tag} skip: the file already holds this site`);
    return have;
  }
  const url = site.url(id);
  const result = await ctx.http.getBytes(url);
  if (!result.ok || result.bytes === null) {
    tally.failed += 1;
    ctx.failures.push(`${site.key} ${row.symbol}: ${result.error ?? 'no body'} (${url})`);
    console.log(`${tag} FAIL ${result.status} ${result.error ?? ''}`);
    return have;
  }
  if (result.fromCache) tally.cached += 1;
  else tally.fetched += 1;
  const html = decodePage(result.bytes);
  fs.writeFileSync(path.join(ctx.outDir, 'raw', `${row.symbol}.${site.key}.html`), html, 'utf8');
  const parsed = site.parse(html);
  if (parsed === null) {
    tally.failed += 1;
    ctx.failures.push(`${site.key} ${row.symbol}: no description block on the page (${url})`);
    console.log(`${tag} ${result.status} PARSE FAIL: no description block`);
    return have;
  }
  const want = site.key === 'vt' ? row.symbol : row.scientific_name;
  if (parsed.pageName !== null && !parsed.pageName.startsWith(want)) {
    ctx.warnings.push(`${site.key} ${row.symbol}: the page names ${parsed.pageName}`);
  }
  const keys = Object.keys(parsed.sections).join(',');
  console.log(`${tag} ${result.status}${result.fromCache ? ' (cache)' : ''} ${keys}`);
  const entry: SourceEntry = {
    site: site.name,
    url,
    fetched_at: fetchedAt(ctx.cacheDir, url, ctx.today),
    sections: parsed.sections,
    text: parsed.text,
  };
  if (parsed.distribution !== undefined) entry.distribution = parsed.distribution;
  return entry;
}

function readSpeciesFile(file: string): SpeciesFile | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SpeciesFile;
  } catch {
    return null;
  }
}

/**
 * Saves the species text from the VT fact sheets and the efloras FNA pages, one JSON file for
 * each species and the raw HTML beside it. The text stays out of git. Returns the exit code.
 */
export async function sourcesMain(argv: string[]): Promise<number> {
  let flags: Record<string, string>;
  try {
    flags = parseFlags(argv);
  } catch (error) {
    console.error((error as Error).message);
    console.error(USAGE);
    return 1;
  }
  if (flags.list === undefined || flags.list.trim() === '') {
    console.error('sources needs --list');
    console.error(USAGE);
    return 1;
  }
  const outDir = path.resolve(flags.out ?? path.join(ROOT, 'pipeline', 'sources'));
  const cacheDir = path.join(ROOT, 'pipeline', 'cache');
  const only = flags.only === undefined ? null : new Set(flags.only.split(',').map((s) => s.trim()).filter((s) => s !== ''));
  let rows = readList(fs.readFileSync(flags.list, 'utf8'));
  if (only !== null) rows = rows.filter((row) => only.has(row.symbol));
  fs.mkdirSync(path.join(outDir, 'raw'), { recursive: true });
  const refresh = flags.refresh === 'true';
  const ctx: Context = {
    http: createHttp({ cacheDir, fetchImpl: fetch, refresh }),
    cacheDir,
    outDir,
    refresh,
    today: new Date().toISOString().slice(0, 10),
    tally: {
      vt: { fetched: 0, cached: 0, skipped: 0, failed: 0 },
      fna: { fetched: 0, cached: 0, skipped: 0, failed: 0 },
    },
    failures: [],
    warnings: [],
  };
  let written = 0;
  let empty = 0;
  for (const row of rows) {
    const file = path.join(outDir, `${row.symbol}.json`);
    const old = readSpeciesFile(file);
    const find = (name: string): SourceEntry | undefined => old?.sources.find((s) => s.site === name);
    // The two hosts have separate limits, so their requests go at the same time.
    const [vt, fna] = await Promise.all([
      row.vt_id === '' ? Promise.resolve(find(VT_SITE)) : fetchSite(ctx, SITES.vt, row, row.vt_id, find(VT_SITE)),
      row.fna_id === '' ? Promise.resolve(find(FNA_SITE)) : fetchSite(ctx, SITES.fna, row, row.fna_id, find(FNA_SITE)),
    ]);
    const sources = [vt, fna].filter((s): s is SourceEntry => s !== undefined);
    if (sources.length === 0) {
      empty += 1;
      console.log(`--- ${row.symbol.padEnd(7)} no source id on the list`);
    }
    const out: SpeciesFile = { symbol: row.symbol, scientific_name: row.scientific_name, sources };
    fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    written += 1;
  }
  const line = (key: string): string => {
    const t = ctx.tally[key];
    return `${key} ${t.fetched} fetched, ${t.cached} from cache, ${t.skipped} skipped, ${t.failed} failed`;
  };
  console.log(`\n${written} files written to ${outDir} (${empty} with no source); ${line('vt')}; ${line('fna')}`);
  for (const warning of ctx.warnings) console.log(`warning: ${warning}`);
  for (const failure of ctx.failures) console.log(`failure: ${failure}`);
  return ctx.failures.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await sourcesMain(process.argv.slice(2));
}
