import fs from 'node:fs';
import path from 'node:path';

import { loadContent } from '../../app/logic/content.js';
import {
  collect,
  interleave,
  licenseAllowed,
  makeCandidate,
  mergeFound,
  type Candidate,
} from './candidates.ts';
import { categoryUrl, commonsCandidates, parseCategoryListing } from './commons.ts';
import { SECTION_PAGES, buildSectionTable, loadSectionTable, nextPageUrl, sectionFor } from './fna.ts';
import type { Http, TextResult } from './http.ts';
import { appendOnlyErrors, readPublished, type ContentSet } from './ids.ts';
import {
  JPEG_QUALITY,
  MAX_SIDE,
  objectKey,
  reviewKey,
  sha256Hex,
  type Resize,
} from './images.ts';
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
  type InatTaxon,
} from './inat.ts';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  parseJson as parseJsonBody,
} from './json_fields.ts';
import { appendJsonl, readJsonl } from './jsonl.ts';
import { publishApproved, retireRows, type ManifestRow } from './manifest.ts';
import {
  CHECKLIST_URL,
  DISTRIBUTION_URL,
  acceptedSymbols,
  fetchDistribution,
  fetchImages,
  fetchProfile,
  fetchSubordinateTaxa,
  parseChecklist,
  plantsCandidates,
  synonymNames,
  type PlantsProfile,
} from './plants.ts';
import {
  buildGaps,
  renderReport,
  type ReportData,
  type ReportEscalationRow,
  type ReportSpeciesRow,
  type ReportUnitRow,
} from './report.ts';
import {
  csvList,
  errorMessage,
  gitCheckoutBranch,
  gitCheckoutExisting,
  gitCommitAll,
  newScope,
  openPullRequest,
  parseFlags,
  readConceptKeys,
  readJsonFile,
  readRun,
  runDir,
  writeRun,
  type Exec,
  type RunScope,
} from './run.ts';
import {
  buildFetched,
  enumerateRun,
  mergeSpecies,
  readAuthored,
  validateAuthored,
  validateFetched,
  type SpeciesRecord,
} from './species.ts';
import { deferredStorage, type Storage } from './storage.ts';
import {
  VERDICT_KINDS,
  countByTargetChannel,
  decisionsToVerdicts,
  identityMatches,
  stopRule,
  validateVerdicts,
  type Decision,
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
    // One list per exemplar. `interleave` merges them round-robin below, so the cap in
    // `collect` splits across the exemplars instead of filling on the first one.
    const perSymbol: Candidate[][] = [];
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
        symbol,
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
      perSymbol.push(fromSources);
    }
    // `collect` never reads a row's target, so one call takes one target's rows only.
    const collected = collect({
      existing,
      found: mergeFound(interleave(perSymbol)),
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
    // Every fetched row carries a root-relative POSIX path. A hand-typed Windows path or
    // an absolute one is stored the same way, so `path.join(root, …)` finds it later.
    local:
      flags.local === undefined
        ? null
        : relative(deps.root, path.resolve(deps.root, flags.local)),
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

// Every command of the surface is named here.
const COMMANDS: Record<string, Handler> = {
  'run init': runInit,
  'species list': speciesList,
  'photos fetch': photosFetch,
  'photos add': photosAdd,
  'photos verdict': photosVerdict,
  'data sections': dataSections,
  'data inat-terms': dataInatTerms,
  build,
  report,
  'run pr': runPr,
  'run finish': runFinish,
  'images retire': imagesRetire,
  'species retire': speciesRetire,
  'ids check': idsCheck,
};

interface FetchContext {
  deps: CliDeps;
  scope: RunScope;
  /** The run's target. The candidate id carries it, so a source builds with it. */
  target: string;
  /** The PLANTS symbol of the species these images come from. D21: the PLANTS
   *  origin names that species' profile page, which a concept target cannot. */
  symbol: string;
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
  return plantsCandidates(
    images,
    context.target,
    context.symbol,
    context.scientific,
    context.now,
  );
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

const MANIFEST_NAME = path.join('images', 'manifest.json');
const DEFAULT_BASE = 'main';
const IMAGES_RETIRED = 'every approved image was retired';
const MISSING_FILE = 'the local file is missing';
const NO_INAT_TAXON = 'no iNat taxon';

type BuildReport = Omit<ReportData, 'escalations'>;

/** What `loadContent` hands back. The app module carries no types of its own. */
interface LoadedContent {
  unit_cards: Record<string, string[]>;
}

interface LoadResult {
  ok: boolean;
  content: LoadedContent | null;
  errors: ValidationMessage[];
}

interface SpeciesStatus {
  status: string;
  reason: string | null;
}

const CONCEPT_STATUS: SpeciesStatus = { status: 'included', reason: null };

async function build(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'build <name> [--base <ref>]');
  const data = await buildContent(name, deps, baseRef(parseFlags(rest.slice(1))));
  if (data === null) return 1;
  gitCommitAll(deps.exec, `content: build ${name}`);
  return 0;
}

async function report(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'report <name>');
  if (!(await writeReport(name, deps))) return 1;
  gitCommitAll(deps.exec, `content(${name}): report`);
  return 0;
}

async function runPr(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'run pr <name>');
  const body = path.join(runDir(deps.root, name), 'report.md');
  if (!fs.existsSync(body)) {
    console.error(`run ${name} has no report.md; run report first`);
    return 1;
  }
  gitCommitAll(deps.exec, `content(${name}): pull request`);
  if (!pushBranch(deps, name)) return 1;
  openPullRequest(deps.exec, name, body);
  console.log(`draft pull request opened for content/${name}`);
  return 0;
}

async function runFinish(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'run finish <name>');
  const dir = runDir(deps.root, name);
  const file = path.join(dir, 'decisions.json');
  if (!fs.existsSync(file)) {
    // The owner had nothing to decide. That is a finished run, not a failure.
    console.log('no decisions to apply');
    return 0;
  }

  const scope = readRun(deps.root, name);
  const decisions = readJsonOr<Record<string, Decision>>(file, {});
  const owner = decisionsToVerdicts(decisions, isoNow(deps).slice(0, 10));
  const verdictsPath = path.join(dir, 'verdicts.jsonl');
  const verdicts = readJsonl<Verdict>(verdictsPath);
  const candidates = readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'));

  // verdicts.jsonl is append-only, so a bad decision is rejected before it is written.
  const errors = validateVerdicts([...verdicts, ...owner], candidates, scope.channels);
  if (errors.length > 0) {
    for (const message of errors) console.error(message);
    return 1;
  }

  appendJsonl(verdictsPath, owner);
  console.log(`${owner.length} decision${owner.length === 1 ? '' : 's'} applied`);

  const data = await buildContent(name, deps, DEFAULT_BASE);
  if (data === null) return 1;
  gitCommitAll(deps.exec, `content: build ${name}`);
  if (!(await writeReport(name, deps))) return 1;
  gitCommitAll(deps.exec, `content(${name}): report`);
  return pushBranch(deps, name) ? 0 : 1;
}

async function imagesRetire(rest: string[], deps: CliDeps): Promise<number> {
  const hash = positional(rest, 'images retire <hash> --reason "<text>"');
  const flags = parseFlags(rest.slice(1));
  const reason = flagValue(flags, 'reason');
  if (reason === null) {
    console.error('images retire needs --reason "<text>"');
    return 1;
  }

  const at = isoNow(deps).slice(0, 10);
  const before = readManifest(deps.root);
  const result = retireRows(before, hash, reason, at);
  if (result.retired === 0) {
    console.error(`no manifest row carries hash ${hash}`);
    return 1;
  }

  const species = readSpecies(deps.root);
  markRetiredSpecies(species, result.rows, at);
  if (!(await commitRetire(deps, species, before, result.rows, `retire image ${hash}`))) {
    return 1;
  }
  const rows = `${result.retired} manifest row${result.retired === 1 ? '' : 's'}`;
  console.log(`${rows} retired for ${hash}`);
  return 0;
}

async function speciesRetire(rest: string[], deps: CliDeps): Promise<number> {
  const symbol = positional(rest, 'species retire <SYMBOL> --reason "<text>"');
  const flags = parseFlags(rest.slice(1));
  const reason = flagValue(flags, 'reason');
  if (reason === null) {
    console.error('species retire needs --reason "<text>"');
    return 1;
  }

  const species = readSpecies(deps.root);
  const current = species[symbol];
  if (current === undefined) {
    console.error(`species.json has no record ${symbol}`);
    return 1;
  }

  const at = isoNow(deps).slice(0, 10);
  const before = readManifest(deps.root);
  // The rows go too. A rebuild then sees every row retired and keeps the species retired.
  const rows = retireOwnRows(before, ownTargets(symbol, current), reason, at);
  species[symbol] = { ...current, retired: true, retired_reason: reason, retired_at: at };
  if (!(await commitRetire(deps, species, before, rows, `retire species ${symbol}`))) {
    return 1;
  }
  const count = rows.filter((one) => one.retired === true).length;
  console.log(`${symbol} retired, ${count} manifest row${count === 1 ? '' : 's'} retired`);
  return 0;
}

async function idsCheck(rest: string[], deps: CliDeps): Promise<number> {
  const base = baseRef(parseFlags(rest));
  if (!baseResolved(deps, base)) return 1;
  const raw = rawOf(deps.root, readSpecies(deps.root), readManifest(deps.root));
  const errors = appendOnlyErrors(readPublished(gitShowOf(deps, base)), contentSetOf(raw));
  for (const message of errors) console.error(message);
  if (errors.length > 0) return 1;
  console.log('content ids are append-only');
  return 0;
}

/**
 * Builds the whole content set in memory, checks it, and only then uploads and writes.
 * Spec section 11: a build that fails writes nothing to content/ and uploads nothing.
 * Returns null when it printed a failure.
 */
async function buildContent(
  name: string,
  deps: CliDeps,
  base: string,
): Promise<BuildReport | null> {
  if (!baseResolved(deps, base)) return null;
  const scope = readRun(deps.root, name);
  const dir = runDir(deps.root, name);
  const candidates = readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'));
  const verdicts = readJsonl<Verdict>(path.join(dir, 'verdicts.jsonl'));
  const now = isoNow(deps);
  const at = now.slice(0, 10);

  const verdictErrors = validateVerdicts(verdicts, candidates, scope.channels);
  if (verdictErrors.length > 0) {
    for (const message of verdictErrors) console.error(message);
    return null;
  }

  const deferred = deferredStorage(deps.storage);
  const published = await publishApproved({
    deps: {
      storage: deferred,
      resize: deps.resize,
      readLocal: (file) => fs.readFileSync(path.join(deps.root, file)),
    },
    candidates,
    verdicts,
    rows: readManifest(deps.root),
  });
  const manifest = published.rows;

  const concepts = readContentList<RawContent['concepts'][number]>(deps.root, 'concepts.json');
  const conceptKeys = new Set(concepts.map((one) => `${one.channel}/${one.key}`));
  const authoredDir = path.join(deps.root, 'content_src', 'species');
  const species: Record<string, SpeciesRecord> = {};
  const statuses: Record<string, SpeciesStatus> = {};
  const authoredErrors: string[] = [];
  let sections: Record<string, string> | null = null;

  for (const symbol of scope.species) {
    const authored = readAuthored(authoredDir, symbol);
    if (authored === null) {
      statuses[symbol] = { status: 'not_authored', reason: null };
      continue;
    }
    authoredErrors.push(...validateAuthored(authored, symbol, conceptKeys));

    // species list fetched this profile already, so the disk cache answers it. The build
    // needs the whole record, which pipeline/data/plants_ids.json does not carry.
    const profile = await fetchProfile(deps.http, symbol, now);
    if (profile === null) {
      console.error(`${symbol}: ${NO_PROFILE}. The build stopped.`);
      return null;
    }
    if (profile.genus === 'Quercus' && sections === null) {
      sections = loadSectionTable(
        path.join(deps.root, 'pipeline', 'data', 'quercus_sections.json'),
      );
    }
    const taxon = await inatTaxonOf(deps, profile.scientific, symbol, now);
    const subordinate = await fetchSubordinateTaxa(deps.http, profile.plants_id, now);
    // fetchDistribution answers a failed fetch with an empty list, and validateFetched does
    // not read the states. Without this check a PLANTS outage republishes the species with
    // an empty range.states, which is worse than a stopped build.
    const failuresBefore = deps.http.failures.length;
    const states = await fetchDistribution(deps.http, profile.plants_id, now);
    if (deps.http.failures.slice(failuresBefore).some((one) => one.url === DISTRIBUTION_URL)) {
      console.error(`${symbol}: distribution fetch failed, build stopped`);
      return null;
    }
    const fetched = buildFetched({
      profile,
      subordinate,
      states,
      section: sections === null ? null : sectionFor(sections, profile.scientific),
      inat: taxon,
    });

    const fetchedErrors = validateFetched(fetched, symbol);
    const live = manifest.filter(
      (one) => one.target === symbol && one.retired !== true,
    ).length;
    statuses[symbol] = statusOf(fetchedErrors, live, taxon === null);
    if (fetchedErrors.length > 0) {
      console.log(`${symbol}: dropped, ${statuses[symbol].reason ?? ''}`);
      continue;
    }
    // A species with no photo is still written. The app validator owns the rule that a
    // live species needs a live image or a confusion edge.
    species[symbol] = mergeSpecies(fetched, authored);
  }

  if (authoredErrors.length > 0) {
    for (const message of authoredErrors) console.error(message);
    return null;
  }

  const previous = readPublished(gitShowOf(deps, base));
  carryPublished(species, previous);
  carryRetired(species, previous);
  markRetiredSpecies(species, manifest, at);

  const raw = rawOf(deps.root, species, manifest);
  const result = validated(deps, raw);
  if (result === null) return null;

  const loaded = loadContent(raw) as LoadResult;
  if (loaded.content === null) {
    // deps.validate passed and the app loader did not. The two disagree, so stop.
    for (const one of loaded.errors) console.error(`error ${one.file}: ${one.message}`);
    return null;
  }

  const idErrors = appendOnlyErrors(previous, contentSetOf(raw));
  if (idErrors.length > 0) {
    for (const message of idErrors) console.error(message);
    return null;
  }

  await deferred.flush();
  writeJson(contentFile(deps.root, 'species.json'), raw.species);
  writeJson(contentFile(deps.root, MANIFEST_NAME), raw.manifest);

  const data = reportData({
    name,
    scope,
    statuses,
    candidates,
    verdicts,
    raw,
    loaded: loaded.content,
    warnings: result.warnings,
  });
  writeJson(path.join(dir, 'build.json'), data);
  // A cap that photos fetch recorded reaches the reader again here.
  for (const message of scope.capped) console.log(`capped: ${message}`);
  printFailures(deps);
  console.log(
    `content built: ${Object.keys(raw.species).length} species, ${raw.manifest.length} manifest rows, ${published.uploaded.length} images uploaded`,
  );
  return data;
}

/**
 * Spec section 4: a species never leaves species.json. Every published record this run
 * does not rebuild is copied as it was published. It was valid then, so it is valid now.
 */
function carryPublished(
  species: Record<string, SpeciesRecord>,
  previous: ContentSet | null,
): void {
  if (previous === null) return;
  for (const [symbol, record] of Object.entries(previous.species)) {
    if (species[symbol] !== undefined) continue;
    species[symbol] = record;
  }
}

/**
 * Plan decision 23: a species retires on purpose. `mergeSpecies` builds a fresh record with
 * no retirement, so a rebuild of a retired species copies the three fields from the published
 * record. The owner's reason and date stay the ones the owner wrote.
 */
function carryRetired(
  species: Record<string, SpeciesRecord>,
  previous: ContentSet | null,
): void {
  if (previous === null) return;
  for (const [symbol, record] of Object.entries(species)) {
    const published = previous.species[symbol];
    if (published === undefined || published.retired !== true) continue;
    const next: SpeciesRecord = { ...record, retired: true };
    if (published.retired_reason !== undefined) next.retired_reason = published.retired_reason;
    if (published.retired_at !== undefined) next.retired_at = published.retired_at;
    species[symbol] = next;
  }
}

/**
 * The second of the two retire paths: a species whose every manifest row is retired.
 * `cli species retire` is the first. This path only adds a retirement to a record that
 * carries none. It never replaces a reason or a date, and it never removes a retirement.
 */
function markRetiredSpecies(
  species: Record<string, SpeciesRecord>,
  manifest: ManifestRow[],
  at: string,
): void {
  for (const [symbol, record] of Object.entries(species)) {
    if (isRetired(record)) continue;
    const rows = manifest.filter((one) => one.target === symbol);
    if (rows.length === 0) continue;
    if (rows.some((one) => one.retired !== true)) continue;
    species[symbol] = {
      ...record,
      retired: true,
      retired_reason: IMAGES_RETIRED,
      retired_at: at,
    };
  }
}

/** A record any retire path already wrote. One of the three fields is enough. */
function isRetired(record: SpeciesRecord): boolean {
  return (
    record.retired === true
    || record.retired_reason !== undefined
    || record.retired_at !== undefined
  );
}

function statusOf(
  fetchedErrors: string[],
  liveImages: number,
  taxonMissing: boolean,
): SpeciesStatus {
  if (fetchedErrors.length > 0) {
    return { status: 'dropped', reason: fetchedErrors.join('; ') };
  }
  return {
    status: liveImages === 0 ? 'no_photos' : 'included',
    reason: taxonMissing ? NO_INAT_TAXON : null,
  };
}

function reportData(input: {
  name: string;
  scope: RunScope;
  statuses: Record<string, SpeciesStatus>;
  candidates: Candidate[];
  verdicts: Verdict[];
  raw: RawContent;
  loaded: LoadedContent;
  warnings: ValidationMessage[];
}): BuildReport {
  const { name, scope, statuses, candidates, verdicts, raw, loaded, warnings } = input;
  const counts = countByTargetChannel(verdicts, candidates);
  const rows: ReportSpeciesRow[] = [];
  // A concept run's targets are its qualified concept keys and it fills no status.
  const targets = scope.concepts.length > 0 ? scope.concepts : scope.species;
  for (const target of targets) {
    const status = statuses[target] ?? CONCEPT_STATUS;
    rows.push({
      symbol: target,
      status: status.status,
      reason: status.reason,
      counts: counts[target] ?? {},
    });
  }
  for (const dropped of scope.dropped) {
    rows.push({ symbol: dropped.symbol, status: 'dropped', reason: dropped.reason, counts: {} });
  }

  const kinds: Record<string, number> = {};
  for (const one of lastVerdicts(verdicts)) kinds[one.verdict] = (kinds[one.verdict] ?? 0) + 1;
  const sources: Record<string, number> = {};
  for (const one of candidates) sources[one.source_key] = (sources[one.source_key] ?? 0) + 1;

  return {
    run: name,
    channels: scope.channels,
    species: rows,
    gaps: buildGaps(rows, scope.channels),
    units: unitRows(raw.units, loaded, warnings),
    counts: {
      candidates_by_source: sortKeys(sources),
      verdicts_by_kind: sortKeys(kinds),
      // The fetch step owns this count. A rebuild reports it and never changes it.
      fetch_failures: scope.fetch_failures,
      stop_rule_fired: stopRule(verdicts).fired,
    },
  };
}

/** Every unit gets a row. The count is the app's own, and so is the warning text. */
function unitRows(
  units: Record<string, unknown>[],
  loaded: LoadedContent,
  warnings: ValidationMessage[],
): ReportUnitRow[] {
  return units.map((unit) => {
    const key = String(unit.key);
    const warning = warnings.find(
      (one) => one.file === 'units.json' && one.message.startsWith(`${key} `),
    );
    return {
      key,
      cards: loaded.unit_cards[key].length,
      warning: warning === undefined ? null : warning.message,
    };
  });
}

async function writeReport(name: string, deps: CliDeps): Promise<boolean> {
  const dir = runDir(deps.root, name);
  readRun(deps.root, name);
  const data = readJsonOr<BuildReport | null>(path.join(dir, 'build.json'), null);
  if (data === null) {
    console.error(`run ${name} has no build.json; run build first`);
    return false;
  }

  const candidates = readJsonl<Candidate>(path.join(dir, 'candidates.jsonl'));
  const verdicts = readJsonl<Verdict>(path.join(dir, 'verdicts.jsonl'));
  const byId = new Map(candidates.map((one) => [one.id, one]));

  const escalations: ReportEscalationRow[] = [];
  for (const one of lastVerdicts(verdicts)) {
    if (one.verdict !== 'escalate') continue;
    const candidate = byId.get(one.candidate_id);
    if (candidate === undefined) {
      console.error(`verdicts.jsonl names candidate ${one.candidate_id}, which run ${name} does not hold`);
      return false;
    }

    // The branch holds no image bytes, so the report links a copy under review/.
    const bytes = localBytes(deps.root, candidate);
    let url = '';
    let note = one.note;
    if (bytes === null) {
      note = note === '' ? MISSING_FILE : `${note} (${MISSING_FILE})`;
    } else {
      const key = reviewKey(candidate.id);
      await deps.storage.put(key, await deps.resize(bytes, MAX_SIDE, JPEG_QUALITY), 'image/jpeg');
      url = `${deps.cdnBase}${key}`;
    }
    escalations.push({
      candidate_id: candidate.id,
      image_url: url,
      origin: candidate.origin,
      case: one.case ?? '',
      note,
      target: candidate.target,
    });
  }

  const file = path.join(dir, 'report.md');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, renderReport({ ...data, escalations }), 'utf8');
  console.log(`${escalations.length} escalations in ${relative(deps.root, file)}`);
  return true;
}

/**
 * Both retire commands end the same way: validate, check the ids, remove the objects no
 * live row carries any more, write the two files, commit.
 */
async function commitRetire(
  deps: CliDeps,
  species: Record<string, SpeciesRecord>,
  before: ManifestRow[],
  after: ManifestRow[],
  subject: string,
): Promise<boolean> {
  // A retire runs on a checkout that has main. A checkout without it writes nothing.
  if (!baseResolved(deps, DEFAULT_BASE)) return false;
  const raw = rawOf(deps.root, species, after);
  if (validated(deps, raw) === null) return false;
  // A retire runs on a checkout that has main, so it needs no --base.
  const previous = readPublished(gitShowOf(deps, DEFAULT_BASE));
  const idErrors = appendOnlyErrors(previous, contentSetOf(raw));
  if (idErrors.length > 0) {
    for (const message of idErrors) console.error(message);
    return false;
  }
  for (const key of deadObjectKeys(before, after)) await deps.storage.remove(key);
  writeJson(contentFile(deps.root, 'species.json'), raw.species);
  writeJson(contentFile(deps.root, MANIFEST_NAME), raw.manifest);
  gitCommitAll(deps.exec, `content: ${subject}`);
  return true;
}

/** The species symbol and every variety key it owns. A row targets one of them. */
function ownTargets(symbol: string, record: SpeciesRecord): Set<string> {
  const targets = new Set([symbol]);
  const varieties = Array.isArray(record.varieties) ? record.varieties : [];
  for (const variety of varieties) {
    const key = (variety as Record<string, unknown>).key;
    if (typeof key === 'string') targets.add(key);
  }
  return targets;
}

function retireOwnRows(
  rows: ManifestRow[],
  targets: Set<string>,
  reason: string,
  at: string,
): ManifestRow[] {
  return rows.map((one) => {
    if (one.retired === true || !targets.has(one.target)) return one;
    return { ...one, retired: true, retired_reason: reason, retired_at: at };
  });
}

/** An object key no live row carries any more. The same bytes under two targets stay. */
function deadObjectKeys(before: ManifestRow[], after: ManifestRow[]): string[] {
  const live = new Set(after.filter((one) => one.retired !== true).map((one) => one.hash));
  const keys: string[] = [];
  for (const one of before) {
    if (one.retired === true || live.has(one.hash)) continue;
    const key = objectKey(one.hash);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** A miss is a line on the screen and a reason in the report, never a silent null. */
async function inatTaxonOf(
  deps: CliDeps,
  scientific: string,
  symbol: string,
  now: string,
): Promise<InatTaxon | null> {
  const url = taxaUrl(scientific);
  const result = await deps.http.getText(url);
  if (!result.ok) {
    console.error(`${symbol}: ${NO_INAT_TAXON}`);
    return null;
  }
  // parseJson pushes a `body is not JSON` failure row and returns null.
  const json = parseJson(deps.http, url, result, now);
  const taxon = json === null ? null : parseTaxon(json);
  if (taxon === null) console.error(`${symbol}: ${NO_INAT_TAXON}`);
  return taxon;
}

function localBytes(root: string, candidate: Candidate): Uint8Array | null {
  if (candidate.local === null) return null;
  const file = path.join(root, candidate.local);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

/** Prints every message. Returns the result, or null when the set holds an error. */
function validated(deps: CliDeps, raw: RawContent): ValidationResult | null {
  const result = deps.validate(raw);
  for (const one of result.warnings) console.log(`warning ${one.file}: ${one.message}`);
  for (const one of result.errors) console.error(`error ${one.file}: ${one.message}`);
  return result.errors.length === 0 ? result : null;
}

function pushBranch(deps: CliDeps, name: string): boolean {
  const result = deps.exec('git', ['push', '-u', 'origin', `content/${name}`]);
  if (result.code === 0) return true;
  console.error(`git push failed with code ${result.code}: ${result.out}`);
  return false;
}

/**
 * `readPublished` reads four absent files as a first run, and `git show` answers every path
 * of a ref it cannot resolve with an error. A failed fetch or a renamed branch would then
 * pass the append-only check on no content at all. Every command that reads a base resolves
 * it here first. Prints the line and returns false when the ref is not a commit.
 */
function baseResolved(deps: CliDeps, base: string): boolean {
  const result = deps.exec('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  if (result.code === 0) return true;
  console.error(`base ${base} does not resolve to a commit`);
  return false;
}

function gitShowOf(deps: CliDeps, base: string): (file: string) => string | null {
  return (file) => {
    const result = deps.exec('git', ['show', `${base}:${file}`]);
    return result.code === 0 ? result.out : null;
  };
}

/**
 * The ref that holds the published content. GitHub Actions checks out a pull request
 * without a local main, so the CI step of Task 18 passes --base origin/main.
 */
function baseRef(flags: Record<string, string>): string {
  const value = flags.base;
  return value === undefined || value === 'true' ? DEFAULT_BASE : value;
}

/** A flag with a real value. `parseFlags` gives a bare flag the value `true`. */
function flagValue(flags: Record<string, string>, key: string): string | null {
  const value = flags[key];
  return value === undefined || value === 'true' ? null : value;
}

function rawOf(
  root: string,
  species: Record<string, SpeciesRecord>,
  manifest: ManifestRow[],
): RawContent {
  return {
    species: sortKeys(species),
    concepts: readContentList<RawContent['concepts'][number]>(root, 'concepts.json'),
    units: readContentList<Record<string, unknown>>(root, 'units.json'),
    confusion: readJsonOr<RawContent['confusion']>(contentFile(root, 'confusion.json'), []),
    manifest,
  };
}

/**
 * The five ids of section 4 come from four of the five files. confusion.json carries no
 * id of its own: an edge names two species, and both ids live in species.json.
 */
function contentSetOf(raw: RawContent): ContentSet {
  return {
    species: raw.species,
    concepts: raw.concepts,
    units: raw.units.map((unit) => ({ key: String(unit.key) })),
    manifest: raw.manifest,
  };
}

/** The last row for a candidate id wins, so an owner decision beats an agent verdict. */
function lastVerdicts(verdicts: Verdict[]): Verdict[] {
  const last = new Map<string, Verdict>();
  for (const one of verdicts) last.set(one.candidate_id, one);
  return [...last.values()];
}

function contentFile(root: string, name: string): string {
  return path.join(root, 'content', name);
}

function readSpecies(root: string): Record<string, SpeciesRecord> {
  return readJsonOr<Record<string, SpeciesRecord>>(contentFile(root, 'species.json'), {});
}

function readManifest(root: string): ManifestRow[] {
  return readJsonOr<ManifestRow[]>(contentFile(root, MANIFEST_NAME), []);
}

/** An authored input the build cannot invent. Its absence is an error, not an empty list. */
function readContentList<T>(root: string, name: string): T[] {
  const file = contentFile(root, name);
  if (!fs.existsSync(file)) throw new Error(`${relative(root, file)} is missing`);
  return readJsonFile(file) as T[];
}

function readJsonOr<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return readJsonFile(file) as T;
}
