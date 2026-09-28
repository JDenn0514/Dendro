import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createHttp } from '../lib/http.ts';
import type { Http } from '../lib/http.ts';
import type { AddRow } from '../lib/powo.ts';
import { parseFlags } from '../lib/run.ts';
import {
  VT_AUTHORS,
  VT_SITE_NAME,
  parseVtImages,
  vtPhotographers,
  vtRow,
  vtSpeciesName,
} from '../lib/vt.ts';
import type { VtImage } from '../lib/vt.ts';

const USAGE =
  'usage: node pipeline/scripts/vt-rows.ts --rows <gap-rows.json> --run <name> --out-dir <dir> [--root <repo>]';
const REQUIRED = ['rows', 'run', 'out-dir'];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A gap row, as pipeline/scripts/harvest.cjs reads it. */
interface GapRow {
  symbol: string;
  sci: string;
  channel: string;
  approved: number;
}

/** One `photos add` row plus the downloaded file. mkadds.cjs does not read `local`. */
export interface VtAddRow extends AddRow {
  local: string;
}

interface SourcesFile {
  symbol?: string;
  scientific_name?: string;
  sources?: { site?: string; url?: string }[];
}

interface RowReport {
  row: GapRow;
  lines: string[];
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * The sources file of a gap row: `<SYMBOL>.json`, or else the file whose scientific name is
 * the row's `sci`. A concept row has a concept key as its symbol, so it needs the second path.
 */
function findSources(dir: string, row: GapRow): { file: string; data: SourcesFile } | null {
  const direct = path.join(dir, `${row.symbol}.json`);
  if (fs.existsSync(direct)) return { file: direct, data: readJson(direct) as SourcesFile };
  if (!fs.existsSync(dir)) return null;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    const data = readJson(file) as SourcesFile;
    if (data.scientific_name === row.sci) return { file, data };
  }
  return null;
}

/** The fact sheets are UTF-8 or windows-1252. sources.ts reads them the same way. */
function decodePage(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** The run's origins and file urls, so that a second pass adds no duplicate. */
function readSeen(file: string): Set<string> {
  const seen = new Set<string>();
  if (!fs.existsSync(file)) return seen;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const row = JSON.parse(line) as { origin?: unknown; file_url?: unknown };
    if (typeof row.origin === 'string') seen.add(row.origin.trim());
    if (typeof row.file_url === 'string') seen.add(row.file_url.trim());
  }
  return seen;
}

function safeName(text: string): string {
  return text.replace(/[^A-Za-z0-9._-]+/g, '_');
}

async function oneRow(
  row: GapRow,
  ctx: { root: string; http: Http; seen: Set<string>; imageDir: string },
  rows: VtAddRow[],
): Promise<RowReport> {
  const lines: string[] = [];
  const found = findSources(path.join(ctx.root, 'pipeline', 'sources'), row);
  const vt = found?.data.sources?.find((source) => source.site === VT_SITE_NAME);
  if (found === null || vt === undefined || typeof vt.url !== 'string' || vt.url === '') {
    lines.push('- No Virginia Tech fact sheet in the sources file.');
    return { row, lines };
  }
  const pageUrl = vt.url;
  const symbol = found.data.symbol ?? path.basename(found.file, '.json');
  const saved = path.join(ctx.root, 'pipeline', 'sources', 'raw', `${symbol}.vt.html`);
  let html: string;
  if (fs.existsSync(saved)) {
    html = fs.readFileSync(saved, 'utf8');
    lines.push(`- Fact sheet: ${pageUrl} (the saved page, ${path.relative(ctx.root, saved)}).`);
  } else {
    const result = await ctx.http.getBytes(pageUrl);
    if (!result.ok || result.bytes === null) {
      lines.push(`- Fact sheet: ${pageUrl} could not be fetched: ${result.error ?? `status ${result.status}`}.`);
      return { row, lines };
    }
    html = decodePage(result.bytes);
    lines.push(`- Fact sheet: ${pageUrl} (fetched${result.fromCache ? ', from the cache' : ''}).`);
  }
  const species = vtSpeciesName(html);
  const names = vtPhotographers(html);
  const author = names ?? VT_AUTHORS;
  if (names === null) lines.push(`- The page names no photographers. The author is the default list.`);
  else if (names !== VT_AUTHORS) lines.push(`- The page names other photographers: ${names}. Check the credit.`);
  if (species !== row.sci) lines.push(`- The page shows the name ${species ?? '(none)'}, not ${row.sci}.`);
  const images = parseVtImages(html, pageUrl);
  const describe = (image: VtImage): string => `${image.file} (${image.channel ?? `${image.organ}, no channel`})`;
  lines.push(`- Images found: ${images.length === 0 ? 'none' : images.map(describe).join(', ')}.`);
  const taken: string[] = [];
  for (const image of images) {
    if (image.channel !== row.channel) continue;
    const add = vtRow(image, pageUrl, row.symbol, species, author);
    if (ctx.seen.has(add.origin) || ctx.seen.has(add.file_url)) {
      lines.push(`- ${image.file}: skipped, the run already holds it.`);
      continue;
    }
    const result = await ctx.http.getBytes(image.url);
    if (!result.ok || result.bytes === null) {
      lines.push(`- ${image.file}: the download failed: ${result.error ?? `status ${result.status}`}.`);
      continue;
    }
    const local = path.join(ctx.imageDir, `${safeName(row.symbol)}-${safeName(image.file)}`);
    fs.writeFileSync(local, result.bytes);
    ctx.seen.add(add.origin);
    ctx.seen.add(add.file_url);
    rows.push({ ...add, local });
    taken.push(image.file);
  }
  lines.push(`- Taken for ${row.channel}: ${taken.length === 0 ? 'none' : taken.join(', ')}.`);
  return { row, lines };
}

/**
 * Reads gap rows and writes the Virginia Tech Dendrology add rows for them, the input of
 * pipeline/scripts/mkadds.cjs, into `<out-dir>/vt-rows.json`, and a report into
 * `<out-dir>/vt-report.md`. It reads the saved fact sheet first and fetches one only when the
 * saved copy is missing. Put --out-dir outside the repo, because the CLI commits every file
 * under pipeline/runs/<name>/, content/, content_src/, and pipeline/data/. `--root` names the checkout that holds pipeline/sources, pipeline/runs, and
 * pipeline/cache. Returns the exit code.
 */
export async function vtRowsMain(argv: string[], fetchImpl: typeof fetch = fetch): Promise<number> {
  let flags: Record<string, string>;
  try {
    flags = parseFlags(argv);
  } catch (error) {
    console.error((error as Error).message);
    console.error(USAGE);
    return 1;
  }
  for (const key of REQUIRED) {
    const value = flags[key];
    if (value === undefined || value.trim() === '') {
      console.error(`vt-rows needs --${key}`);
      console.error(USAGE);
      return 1;
    }
  }
  const root = path.resolve(flags.root ?? ROOT);
  const outDir = path.resolve(flags['out-dir']);
  const imageDir = path.join(outDir, 'images');
  fs.mkdirSync(imageDir, { recursive: true });
  const gapRows = readJson(flags.rows) as GapRow[];
  const http = createHttp({ cacheDir: path.join(root, 'pipeline', 'cache'), fetchImpl });
  const seen = readSeen(path.join(root, 'pipeline', 'runs', flags.run, 'candidates.jsonl'));
  const rows: VtAddRow[] = [];
  const reports: RowReport[] = [];
  for (const row of gapRows) reports.push(await oneRow(row, { root, http, seen, imageDir }, rows));

  fs.writeFileSync(path.join(outDir, 'vt-rows.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  const report = [`# Virginia Tech Dendrology rows, run \`${flags.run}\``, ''];
  for (const { row, lines } of reports) {
    report.push(`## ${row.symbol} ${row.channel} (${row.sci}, ${row.approved} approved)`, '', ...lines, '');
  }
  report.push(`${rows.length} rows written to vt-rows.json.`, '');
  fs.writeFileSync(path.join(outDir, 'vt-report.md'), report.join('\n'), 'utf8');
  console.log(`${rows.length} rows written to ${path.join(outDir, 'vt-rows.json')}`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await vtRowsMain(process.argv.slice(2));
}
