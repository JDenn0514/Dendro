import fs from 'node:fs';
import path from 'node:path';

import {
  collect,
  licenseAllowed,
  makeCandidate,
  mergeFound,
  type Candidate,
} from './candidates.ts';
import { categoryUrl, commonsCandidates, parseCategoryListing } from './commons.ts';
import { SECTION_PAGES, buildSectionTable, nextPageUrl } from './fna.ts';
import type { Http, TextResult } from './http.ts';
import { sha256Hex, type Resize } from './images.ts';
import {
  FRUITING_VALUE_ID,
  PER_PAGE,
  PHENOLOGY_TERM_ID,
  inatCandidates,
  inatPasses,
  loadInatTerms,
  observationsUrl,
  parseObservations,
  parseTaxon,
  phenologyProbeUrl,
  taxaUrl,
  type InatPass,
} from './inat.ts';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  parseJson as parseJsonBody,
} from './json_fields.ts';
import { appendJsonl, readJsonl } from './jsonl.ts';
import type { ManifestRow } from './manifest.ts';
import {
  CHECKLIST_URL,
  acceptedSymbols,
  fetchDistribution,
  fetchImages,
  fetchProfile,
  parseChecklist,
  plantsCandidates,
  synonymNames,
  type PlantsProfile,
} from './plants.ts';
import {
  csvList,
  errorMessage,
  gitCheckoutBranch,
  gitCheckoutExisting,
  gitCommitAll,
  newScope,
  parseFlags,
  readConceptKeys,
  readJsonFile,
  readRun,
  runDir,
  writeRun,
  type Exec,
  type RunScope,
} from './run.ts';
import { enumerateRun } from './species.ts';
import type { Storage } from './storage.ts';
import {
  VERDICT_KINDS,
  countByTargetChannel,
  identityMatches,
  validateVerdicts,
  type EscalationCase,
  type Verdict,
  type VerdictKind,
} from './verdicts.ts';

export interface ValidationMessage {
  file: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
}

/** The four content files plus the manifest, as the app's validator reads them. */
export interface RawContent {
  species: Record<string, Record<string, unknown>>;
  concepts: { key: string; channel: string; name: string; accept: string[]; description: string }[];
  units: Record<string, unknown>[];
  confusion: { a: string; b: string; channel: string; a_not_b: string; b_not_a: string; ref: string }[];
  manifest: ManifestRow[];
}

/**
 * Every side effect a command needs. Network, the clock, object storage, and image resizing
 * arrive here. Disk does not: a function that reads or writes a file takes the path as a
 * parameter, and `root` is the directory those paths hang off.
 */
export interface CliDeps {
  root: string;
  exec: Exec;
  http: Http;
  storage: Storage;
  resize: Resize;
  validate: (raw: RawContent) => ValidationResult;
  cdnBase: string;
  now: () => Date;
}

type Handler = (rest: string[], deps: CliDeps) => Promise<number>;

/** The name every verdict this command writes carries. D11 keeps one writer. */
export const CHECK_AGENT = 'photo_check_agent';

/** The reason a species carries when its PLANTS profile did not arrive. */
export const NO_PROFILE = 'no profile';

export const MAX_COMMONS_PAGES = 4;
export const MAX_INAT_PAGES = 4;

const USAGE = `usage: node pipeline/cli.ts <command> [flags]

  run init <name> --bucket <b> --states <csv> --genera <csv> --include <csv> --channels <csv>
  run init <name> --concepts <csv>
  species list <name>
  species retire <SYMBOL> --reason "<text>"
  photos fetch <name>
  photos add <name> --target <t> --origin <url> --file-url <url> --source <s> --author <a> --license <l> [--license-url <u>] [--source-species <s>] [--channel-hint <c>] [--local <path>]
  photos verdict <name> --candidate <id> --verdict <${VERDICT_KINDS.join('|')}> [--channel <c>] [--tags a,b] [--case <case>] --note "<text>"
  build <name> [--base <ref>]
  report <name>
  run pr <name>
  run finish <name>
  images retire <hash> --reason "<text>"
  data sections
  data inat-terms
  ids check [--base <ref>]

A flag name is kebab-case. A csv value splits on commas and each part is trimmed.
--base names the ref the append-only check reads, and defaults to main.
--refresh works on every command and bypasses the cache for that command.`;

/** A first word that takes a second word. Every other command is one word. */
const GROUPS: Set<string> = new Set(['run', 'species', 'photos', 'data', 'images', 'ids']);

const ADD_REQUIRED: string[] = ['target', 'origin', 'file-url', 'source', 'author', 'license'];

const VERDICT_REQUIRED: string[] = ['candidate', 'verdict', 'note'];

export async function runCommand(argv: string[], deps: CliDeps): Promise<number> {
  const key = commandKey(argv);
  const handler = key === null ? undefined : COMMANDS[key];
  if (key === null || handler === undefined) {
    console.error(USAGE);
    return 1;
  }
  const rest = GROUPS.has(argv[0]) ? argv.slice(2) : argv.slice(1);
  try {
    return await handler(rest, deps);
  } catch (error) {
    // A TypeError's message alone says nothing about where it came from, so
    // DENDRO_DEBUG keeps the stack.
    const debug = (process.env.DENDRO_DEBUG ?? '') !== '';
    if (debug && error instanceof Error) console.error(error.stack ?? String(error));
    else console.error(errorMessage(error));
    return 1;
  }
}

async function runInit(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'run init <name> --bucket <b> --channels <csv>');
  const file = path.join(runDir(deps.root, name), 'run.json');
  if (fs.existsSync(file)) {
    // A stopped run resumes with the same command, so this is not a failure. The branch
    // already exists, so this checks it out instead of branching again.
    gitCheckoutExisting(deps.exec, name);
    console.log(`run ${name} already exists`);
    return 0;
  }
  const scope = newScope(name, parseFlags(rest.slice(1)), isoNow(deps));
  if (scope.concepts.length > 0) {
    const known = readConceptKeys(path.join(deps.root, 'content', 'concepts.json'));
    const unknown = scope.concepts.filter((key) => !known.includes(key));
    if (unknown.length > 0) {
      console.error(`unknown concept key: ${unknown.join(', ')}`);
      return 1;
    }
  }
  writeRun(deps.root, scope);
  gitCheckoutBranch(deps.exec, name);
  console.log(`run ${name} created on branch content/${name}`);
  return 0;
}

async function speciesList(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'species list <name>');
  const scope = readRun(deps.root, name);
  const now = isoNow(deps);

  const checklist = await deps.http.getText(CHECKLIST_URL);
  if (!checklist.ok) {
    console.error(`the PLANTS checklist fetch failed: ${checklist.error ?? checklist.status}`);
    printFailures(deps);
    return 1;
  }
  const rows = parseChecklist(checklist.body);

  const known = new Set(rows.map((row) => row.symbol));
  for (const symbol of scope.include) {
    // Spec section 11: an unknown symbol in include stops the run.
    if (!known.has(symbol)) {
      console.error(`unknown PLANTS symbol in include: ${symbol}`);
      return 1;
    }
  }

  const wanted = [...new Set([...acceptedSymbols(rows, scope.genera), ...scope.include])].sort();
  const profiles: Record<string, PlantsProfile> = {};
  const distribution: Record<string, string[]> = {};
  const noProfile: string[] = [];
  for (const symbol of wanted) {
    const profile = await fetchProfile(deps.http, symbol, now);
    if (profile === null) {
      console.error(`${symbol}: ${NO_PROFILE}`);
      noProfile.push(symbol);
      continue;
    }
    profiles[symbol] = profile;
    distribution[symbol] = await fetchDistribution(deps.http, profile.plants_id, now);
  }

  const enumerated = enumerateRun({
    rows,
    genera: scope.genera,
    states: scope.states,
    include: scope.include,
    profiles,
    distribution,
  });
  scope.species = enumerated.kept;
  scope.dropped = withNoProfile(enumerated.dropped, noProfile);
  scope.fetch_failures = deps.http.failures.length;
  writeRun(deps.root, scope);
  writePlantsIds(plantsIdsPath(deps.root), profiles);
  gitCommitAll(deps.exec, `content(${name}): species list`);
  printFailures(deps);
  console.log(`${enumerated.kept.length} species kept, ${scope.dropped.length} dropped`);
  return 0;
}

async function photosFetch(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'photos fetch <name>');
  const scope = readRun(deps.root, name);
  const now = isoNow(deps);
  const dir = runDir(deps.root, name);
  const candidatesPath = path.join(dir, 'candidates.jsonl');

  let existing = readJsonl<Candidate>(candidatesPath);
  const verdicts = readJsonl<Verdict>(path.join(dir, 'verdicts.jsonl'));
  const counts = countByTargetChannel(verdicts, existing);
  const terms = loadInatTerms(path.join(deps.root, 'pipeline', 'data', 'inat_terms.json'));
  const passes = inatPasses(terms.flowering_value_id);
  const ids = readPlantsIds(plantsIdsPath(deps.root));

  // `synonymNames` needs the checklist, and the disk cache already holds it from
  // `species list`, so this costs no request on a run that listed its species.
  const checklist = await deps.http.getText(CHECKLIST_URL);
  if (!checklist.ok) {
    console.error(
      `the PLANTS checklist fetch failed: ${checklist.error ?? checklist.status}. Every identity check reads the accepted name only.`,
    );
  }
  const rows = checklist.ok ? parseChecklist(checklist.body) : [];

  const noProfile: string[] = [];
  let appended = 0;
  for (const target of targetsOf(scope)) {
    if (target.lookups.length === 0) {
      console.error(`${target.key}: no exemplars in run.json`);
    }
    const found: Candidate[] = [];
    for (const symbol of target.lookups) {
      const plant = await plantOf(deps, ids, symbol, now);
      if (plant === null) {
        console.error(`${symbol}: ${NO_PROFILE}`);
        noProfile.push(symbol);
        continue;
      }
      const context: FetchContext = {
        deps,
        scope,
        target: target.key,
        scientific: plant.scientific,
        plantsId: plant.id,
        now,
      };
      const names = [plant.scientific, ...synonymNames(rows, symbol)];
      const fromSources: Candidate[] = [];
      fromSources.push(...(await plantsRows(context)));
      fromSources.push(...(await commonsRows(context)));
      fromSources.push(...(await inatRows(context, passes)));
      // D17: the script compares the source's own name with the accepted name and its
      // synonyms, so the photo-check agent reads a verdict instead of guessing.
      for (const row of fromSources) {
        row.identity_match = identityMatches(row.source_species, names);
      }
      found.push(...fromSources);
    }
    // `collect` never reads a row's target, so one call takes one target's rows only.
    const collected = collect({
      existing,
      found: mergeFound(found),
      target: target.key,
      approvedByChannel: counts[target.key] ?? {},
    });
    for (const row of collected.added) await download(deps, row);
    // The append happens per target, so a run that stops on the third target keeps the
    // rows of the first two.
    if (collected.added.length > 0) appendJsonl(candidatesPath, collected.added);
    existing = existing.concat(collected.added);
    appended += collected.added.length;
  }

  scope.dropped = withNoProfile(scope.dropped, noProfile);
  scope.fetch_failures = deps.http.failures.length;
  writeRun(deps.root, scope);
  gitCommitAll(deps.exec, `content(${name}): photo candidates`);
  printFailures(deps);
  console.log(
    `${appended} candidates appended to ${relative(deps.root, candidatesPath)}, ${scope.fetch_failures} download failures`,
  );
  return 0;
}

async function photosAdd(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'photos add <name> --target <t> --origin <url>');
  readRun(deps.root, name);
  const flags = parseFlags(rest.slice(1));
  for (const key of ADD_REQUIRED) {
    const value = flags[key];
    if (value === undefined || value.trim() === '') {
      console.error(`photos add needs --${key}`);
      return 1;
    }
  }
  if (!licenseAllowed(flags.license)) {
    console.error(`photos add license is not allowed: ${flags.license}`);
    return 1;
  }
  const row = makeCandidate({
    target: flags.target,
    source_key: 'manual',
    source: flags.source,
    origin: flags.origin,
    file_url: flags['file-url'],
    author: flags.author,
    license: flags.license,
    license_url: flags['license-url'] ?? null,
    source_species: flags['source-species'] ?? null,
    channel_hint: flags['channel-hint'] ?? null,
    local: flags.local ?? null,
    fetched_at: isoNow(deps),
  });
  if (flags.local === undefined) {
    // `build` throws on a manual row with no cached file, so the bytes arrive now and the
    // row points at the same cache directory a fetched row points at.
    await download(deps, row);
    if (row.fetch_error !== null) {
      console.error(`photos add could not download ${row.file_url}: ${row.fetch_error}`);
      return 1;
    }
  }
  appendJsonl(path.join(runDir(deps.root, name), 'candidates.jsonl'), [row]);
  console.log(`manual candidate ${row.id} added for ${row.target}`);
  return 0;
}

async function photosVerdict(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(
    rest,
    'photos verdict <name> --candidate <id> --verdict <kind> --note "<text>"',
  );
  const scope = readRun(deps.root, name);
  const flags = parseFlags(rest.slice(1));
  for (const key of VERDICT_REQUIRED) {
    const value = flags[key];
    if (value === undefined || value.trim() === '') {
      console.error(`photos verdict needs --${key}`);
      return 1;
    }
  }
  const dir = runDir(deps.root, name);
  const candidates = readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'));
  // The two casts hold because `validateVerdicts` rejects a kind outside VERDICT_KINDS and
  // a case outside the three cases, and nothing is written before it passes.
  const row: Verdict = {
    candidate_id: flags.candidate,
    verdict: flags.verdict as VerdictKind,
    channel: flags.channel ?? null,
    tags: csvList(flags.tags),
    case: (flags.case ?? null) as EscalationCase | null,
    note: flags.note,
    checked_by: CHECK_AGENT,
    checked_at: isoNow(deps),
  };
  const errors = validateVerdicts([row], candidates, scope.channels);
  if (errors.length > 0) {
    for (const message of errors) console.error(message);
    return 1;
  }
  appendJsonl(path.join(dir, 'verdicts.jsonl'), [row]);
  console.log(`${row.verdict} recorded for candidate ${row.candidate_id}`);
  return 0;
}

async function dataSections(_rest: string[], deps: CliDeps): Promise<number> {
  const pages: { section: string; html: string }[] = [];
  for (const page of SECTION_PAGES) {
    // A browse page links the next page of the same section. The seen set stops a page that
    // links itself.
    const seen = new Set<string>();
    let url: string | null = page.url;
    while (url !== null && !seen.has(url)) {
      seen.add(url);
      const result = await deps.http.getText(url);
      if (!result.ok) {
        console.error(
          `the FNA page for section ${page.section} failed: ${result.error ?? result.status}`,
        );
        printFailures(deps);
        return 1;
      }
      pages.push({ section: page.section, html: result.body });
      url = nextPageUrl(result.body, url);
    }
  }
  const table = sortKeys(buildSectionTable(pages));
  const file = path.join(deps.root, 'pipeline', 'data', 'quercus_sections.json');
  writeJson(file, table);
  console.log(`${Object.keys(table).length} rows written to ${relative(deps.root, file)}`);
  return 0;
}

async function dataInatTerms(_rest: string[], deps: CliDeps): Promise<number> {
  const now = isoNow(deps);
  const url = phenologyProbeUrl(PER_PAGE);
  const result = await deps.http.getText(url);
  if (!result.ok) {
    console.error(`the iNat phenology probe failed: ${result.error ?? result.status}`);
    printFailures(deps);
    return 1;
  }
  const json = parseJson(deps.http, url, result, now);
  if (json === null) {
    printFailures(deps);
    return 1;
  }
  const root = asRecord(json);
  const results = root === null ? null : asArray(root.results);
  if (results === null) {
    console.error(`${url} answered with no results array.`);
    return 1;
  }

  // Phenology has one value per state. Fruiting is known, so one page of observations that
  // names exactly one other value names flowering. Two values mean the vocabulary grew, and
  // a guess would mislabel every flower photo of every run.
  const values: number[] = [];
  for (const item of results) {
    const observation = asRecord(item);
    const annotations = observation === null ? null : asArray(observation.annotations);
    for (const raw of annotations ?? []) {
      const annotation = asRecord(raw);
      if (annotation === null) continue;
      if (asNumber(annotation.controlled_attribute_id) !== PHENOLOGY_TERM_ID) continue;
      const value = asNumber(annotation.controlled_value_id);
      if (value === null || value === FRUITING_VALUE_ID) continue;
      if (!values.includes(value)) values.push(value);
    }
  }
  values.sort((a, b) => a - b);
  if (values.length !== 1) {
    console.error(
      `the phenology probe found ${values.length} non-fruiting values: ${values.join(', ')}. Set flowering_value_id by hand in pipeline/data/inat_terms.json.`,
    );
    return 1;
  }

  const file = path.join(deps.root, 'pipeline', 'data', 'inat_terms.json');
  writeJson(file, { flowering_value_id: values[0] });
  console.log(`flowering_value_id is ${values[0]}`);
  return 0;
}

function notYet(name: string): Handler {
  return async () => {
    console.error(`not implemented yet: ${name}`);
    return 1;
  };
}

// Every command of the surface is named here. Task 14 replaces the last seven.
const COMMANDS: Record<string, Handler> = {
  'run init': runInit,
  'species list': speciesList,
  'photos fetch': photosFetch,
  'photos add': photosAdd,
  'photos verdict': photosVerdict,
  'data sections': dataSections,
  'data inat-terms': dataInatTerms,
  build: notYet('build'),
  report: notYet('report'),
  'run pr': notYet('run pr'),
  'run finish': notYet('run finish'),
  'images retire': notYet('images retire'),
  'species retire': notYet('species retire'),
  'ids check': notYet('ids check'),
};

interface FetchContext {
  deps: CliDeps;
  scope: RunScope;
  /** The run's target. The candidate id carries it, so a source builds with it. */
  target: string;
  scientific: string;
  plantsId: number;
  now: string;
}

interface PlantId {
  id: number;
  scientific: string;
}

function commandKey(argv: string[]): string | null {
  const first = argv[0];
  if (first === undefined || first.startsWith('--')) return null;
  if (!GROUPS.has(first)) return first;
  const second = argv[1];
  if (second === undefined || second.startsWith('--')) return null;
  return `${first} ${second}`;
}

/** A bucket run targets each species. A concept run targets the key and looks up the exemplars. */
function targetsOf(scope: RunScope): { key: string; lookups: string[] }[] {
  if (scope.concepts.length > 0) {
    return scope.concepts.map((key) => ({ key, lookups: scope.concept_exemplars[key] ?? [] }));
  }
  return scope.species.map((symbol) => ({ key: symbol, lookups: [symbol] }));
}

/** The committed table spares the profile call. D12: `species list` writes it. */
async function plantOf(
  deps: CliDeps,
  ids: Record<string, PlantId>,
  symbol: string,
  now: string,
): Promise<PlantId | null> {
  const known = ids[symbol];
  if (known !== undefined) return known;
  const profile = await fetchProfile(deps.http, symbol, now);
  if (profile === null) return null;
  return { id: profile.plants_id, scientific: profile.scientific };
}

async function plantsRows(context: FetchContext): Promise<Candidate[]> {
  const images = await fetchImages(context.deps.http, context.plantsId, context.now);
  return plantsCandidates(images, context.target, context.scientific, context.now);
}

async function commonsRows(context: FetchContext): Promise<Candidate[]> {
  const { deps, scientific, target, now } = context;
  const rows: Candidate[] = [];
  let token: string | null = null;
  for (let page = 0; page < MAX_COMMONS_PAGES; page += 1) {
    const url = categoryUrl(scientific, token);
    const result = await deps.http.getText(url);
    if (!result.ok) return rows;
    const json = parseJson(deps.http, url, result, now);
    if (json === null) return rows;
    const listing = parseCategoryListing(json);
    if (listing.error !== null) {
      recordFailure(deps.http, url, result.status, listing.error, now);
      return rows;
    }
    rows.push(...commonsCandidates(listing.files, target, scientific, now));
    if (listing.next === null) return rows;
    token = listing.next;
  }
  noteCap(context, `commons listing capped at ${MAX_COMMONS_PAGES} pages`);
  return rows;
}

async function inatRows(context: FetchContext, passes: InatPass[]): Promise<Candidate[]> {
  const { deps, scientific, target, now } = context;
  const taxonUrl = taxaUrl(scientific);
  const taxonResult = await deps.http.getText(taxonUrl);
  if (!taxonResult.ok) return [];
  const taxonJson = parseJson(deps.http, taxonUrl, taxonResult, now);
  if (taxonJson === null) return [];
  const taxon = parseTaxon(taxonJson);
  if (taxon === null) return [];

  const rows: Candidate[] = [];
  for (const pass of passes) {
    let ranOut = true;
    for (let page = 1; page <= MAX_INAT_PAGES; page += 1) {
      const url = observationsUrl(taxon.id, page, pass);
      const result = await deps.http.getText(url);
      if (!result.ok) {
        ranOut = false;
        break;
      }
      const json = parseJson(deps.http, url, result, now);
      if (json === null) {
        ranOut = false;
        break;
      }
      const parsed = parseObservations(json);
      if (parsed.error !== null) {
        recordFailure(deps.http, url, result.status, parsed.error, now);
        ranOut = false;
        break;
      }
      rows.push(...inatCandidates(parsed.photos, target, pass, now));
      if (!pageIsFull(json)) {
        ranOut = false;
        break;
      }
    }
    if (ranOut) noteCap(context, `inat ${pass.name} listing capped at ${MAX_INAT_PAGES} pages`);
  }
  return rows;
}

/**
 * iNat fills a page to `PER_PAGE`, which is the size `observationsUrl` asks for. A page with
 * fewer observations is the last one.
 */
function pageIsFull(json: unknown): boolean {
  const root = asRecord(json);
  const results = root === null ? null : asArray(root.results);
  return results !== null && results.length >= PER_PAGE;
}

/** A cut-short listing is on the reader's screen and in run.json, never only in the code. */
function noteCap(context: FetchContext, reason: string): void {
  const message = `${context.target}: ${reason}`;
  console.error(message);
  if (!context.scope.capped.includes(message)) context.scope.capped.push(message);
}

async function download(deps: CliDeps, row: Candidate): Promise<void> {
  const result = await deps.http.getBytes(row.file_url);
  if (!result.ok || result.bytes === null) {
    // The row is still appended, so the report counts the failure and a later run retries.
    row.fetch_error = result.error ?? `status ${result.status}`;
    return;
  }
  const hash = sha256Hex(result.bytes);
  const file = path.join(deps.root, 'pipeline', 'cache', row.source_key, `${hash}.jpg`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, result.bytes);
  row.local = relative(deps.root, file);
  row.file_hash = hash;
}

function plantsIdsPath(root: string): string {
  return path.join(root, 'pipeline', 'data', 'plants_ids.json');
}

function readPlantsIds(file: string): Record<string, PlantId> {
  if (!fs.existsSync(file)) return {};
  const table = asRecord(readJsonFile(file));
  if (table === null) throw new Error(`${file} does not hold an object.`);
  const ids: Record<string, PlantId> = {};
  for (const [symbol, value] of Object.entries(table)) {
    const row = asRecord(value);
    const id = row === null ? null : asNumber(row.id);
    const scientific = row === null ? null : asString(row.scientific);
    if (id === null || scientific === null) {
      throw new Error(`${file} entry ${symbol} needs an id and a scientific name.`);
    }
    ids[symbol] = { id, scientific };
  }
  return ids;
}

function writePlantsIds(file: string, profiles: Record<string, PlantsProfile>): void {
  const ids = readPlantsIds(file);
  for (const [symbol, profile] of Object.entries(profiles)) {
    ids[symbol] = { id: profile.plants_id, scientific: profile.scientific };
  }
  writeJson(file, sortKeys(ids));
}

/**
 * A symbol whose profile never arrived carries `no profile`. That reason replaces any reason
 * `enumerateRun` reached without a profile to read.
 */
function withNoProfile(
  dropped: { symbol: string; reason: string }[],
  symbols: string[],
): { symbol: string; reason: string }[] {
  const named = new Set(symbols);
  const rows = symbols.map((symbol) => ({ symbol, reason: NO_PROFILE }));
  for (const row of dropped) {
    if (!named.has(row.symbol)) rows.push(row);
  }
  return rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** D16: every url the run gave up on reaches the reader. */
function printFailures(deps: CliDeps): void {
  for (const failure of deps.http.failures) {
    console.error(`fetch failed: ${failure.status} ${failure.url}: ${failure.message}`);
  }
}

function recordFailure(
  http: Http,
  url: string,
  status: number,
  message: string,
  at: string,
): void {
  http.failures.push({ url, status, message, at });
}

/** A body that is not JSON is a failure row, not a silent null. */
function parseJson(http: Http, url: string, result: TextResult, at: string): unknown {
  const parsed = parseJsonBody(result.body);
  if (parsed.ok) return parsed.value;
  recordFailure(http, url, result.status, 'body is not JSON', at);
  return null;
}

function sortKeys<T>(table: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(table).sort()) sorted[key] = table[key];
  return sorted;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

function positional(rest: string[], usage: string): string {
  const value = rest[0];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`usage: node pipeline/cli.ts ${usage}`);
  }
  return value;
}

function isoNow(deps: CliDeps): string {
  return deps.now().toISOString().replace(/\.\d+Z$/, 'Z');
}
