import fs from 'node:fs';
import path from 'node:path';

import { CHANNELS } from './candidates.ts';
import { asArray, asNumber, asRecord, asString } from './json_fields.ts';

export interface RunScope {
  name: string;
  bucket: string | null;
  concepts: string[];
  /** Concept key to the exemplar species the photo lookup uses. Empty on a bucket run. */
  concept_exemplars: Record<string, string[]>;
  states: string[];
  genera: string[];
  include: string[];
  channels: string[];
  created_at: string;
  species: string[];
  dropped: { symbol: string; reason: string }[];
  /** How many urls this run gave up on. The report prints it. */
  fetch_failures: number;
  /** How many fetched rows the last `photos fetch` dropped as monochrome. */
  mono_dropped: number;
  /** One message per listing this run cut short at a page cap. */
  capped: string[];
}

export type Exec = (command: string, args: string[]) => { code: number; out: string };

const CO_AUTHOR = 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>';

/** The only flag that takes no value. Every other flag needs one. */
export const BOOLEAN_FLAGS: string[] = ['refresh'];

const LIST_FIELDS: string[] = [
  'concepts',
  'states',
  'genera',
  'include',
  'channels',
  'species',
  'capped',
];

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Splits a comma-separated flag value, trims each part, and drops the empty parts. */
export function csvList(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * `--key value` gives `{ key: 'value' }`. A key keeps its hyphens, so `--file-url` is the
 * key `file-url`. A flag outside `BOOLEAN_FLAGS` with no value is an error: a bare
 * `--author` used to become the string `true` and reached the manifest as a credit.
 * A value that itself starts with `--` is unreachable, and no flag of this CLI takes one.
 */
export function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === '') throw new Error('-- is not a flag name.');
    if (BOOLEAN_FLAGS.includes(key)) {
      flags[key] = 'true';
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`the flag --${key} needs a value.`);
    }
    flags[key] = next;
    i += 1;
  }
  return flags;
}

/** The caller passes `createdAt`, so this function stays pure. */
export function newScope(
  name: string,
  flags: Record<string, string>,
  createdAt: string,
): RunScope {
  const hasBucket = flags.bucket !== undefined;
  const hasConcepts = flags.concepts !== undefined;
  if (hasBucket && hasConcepts) {
    throw new Error('--bucket and --concepts are exclusive. Give one of them, not both.');
  }
  if (!hasBucket && !hasConcepts) {
    throw new Error('run init needs --bucket or --concepts. Give one of them.');
  }

  const concepts = csvList(flags.concepts);
  let channels: string[];
  if (hasConcepts) {
    if (concepts.length === 0) throw new Error('--concepts needs at least one concept key.');
    if (flags.channels !== undefined) {
      throw new Error('a concept run takes its channels from --concepts. Drop --channels.');
    }
    for (const key of concepts) {
      if (!key.includes('/')) {
        throw new Error(
          `the concept ${key} needs the form <channel>/<key>, as content/concepts.json writes it.`,
        );
      }
    }
    channels = [...new Set(concepts.map((key) => key.split('/')[0]))];
  } else {
    channels = csvList(flags.channels);
    if (channels.length === 0) {
      throw new Error('run init needs --channels with at least one channel.');
    }
  }
  for (const channel of channels) {
    if (!CHANNELS.includes(channel)) {
      throw new Error(`${channel} is not a channel. The channels are ${CHANNELS.join(', ')}.`);
    }
  }

  return {
    name,
    bucket: flags.bucket ?? null,
    concepts,
    concept_exemplars: {},
    states: csvList(flags.states),
    genera: csvList(flags.genera),
    include: csvList(flags.include),
    channels,
    created_at: createdAt,
    species: [],
    dropped: [],
    fetch_failures: 0,
    mono_dropped: 0,
    capped: [],
  };
}

export function runDir(root: string, name: string): string {
  return path.join(root, 'pipeline', 'runs', name);
}

/** One message per field that is not the shape `RunScope` declares. */
export function validateScope(raw: unknown): string[] {
  const scope = asRecord(raw);
  if (scope === null) return ['run.json does not hold an object.'];

  const errors: string[] = [];
  if (asString(scope.name) === null) errors.push('name is not a string.');
  if (scope.bucket !== null && asString(scope.bucket) === null) {
    errors.push('bucket is not a string and not null.');
  }
  if (asString(scope.created_at) === null) errors.push('created_at is not a string.');
  if (asNumber(scope.fetch_failures) === null) errors.push('fetch_failures is not a number.');
  if (asNumber(scope.mono_dropped) === null) errors.push('mono_dropped is not a number.');
  for (const field of LIST_FIELDS) {
    if (!isStringList(scope[field])) errors.push(`${field} is not an array of strings.`);
  }

  const exemplars = asRecord(scope.concept_exemplars);
  if (exemplars === null) {
    errors.push('concept_exemplars is not an object.');
  } else {
    for (const [key, value] of Object.entries(exemplars)) {
      if (!isStringList(value)) {
        errors.push(`concept_exemplars.${key} is not an array of strings.`);
      }
    }
  }

  const dropped = asArray(scope.dropped);
  if (dropped === null) {
    errors.push('dropped is not an array.');
  } else {
    for (const item of dropped) {
      const row = asRecord(item);
      if (row === null || asString(row.symbol) === null || asString(row.reason) === null) {
        errors.push('a dropped row needs a symbol and a reason.');
      }
    }
  }
  return errors;
}

export function readRun(root: string, name: string): RunScope {
  const file = path.join(runDir(root, name), 'run.json');
  if (!fs.existsSync(file)) {
    throw new Error(`run ${name} does not exist. Run "cli run init ${name}" first.`);
  }
  const raw = readJsonFile(file);
  const errors = validateScope(raw);
  if (errors.length > 0) {
    throw new Error(`${file} is not a run scope: ${errors.join(' ')}`);
  }
  return raw as RunScope;
}

export function writeRun(root: string, scope: RunScope): void {
  const dir = runDir(root, scope.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run.json'), `${JSON.stringify(scope, null, 2)}\n`, 'utf8');
}

/** Every concept of the content set, as the qualified key `<channel>/<key>`, sorted. */
export function readConceptKeys(file: string): string[] {
  const rows = asArray(readJsonFile(file));
  if (rows === null) throw new Error(`${file} does not hold an array.`);
  const keys: string[] = [];
  for (const item of rows) {
    const row = asRecord(item);
    const key = row === null ? null : asString(row.key);
    const channel = row === null ? null : asString(row.channel);
    if (key === null || channel === null) {
      throw new Error(`${file} holds a concept with no key or no channel.`);
    }
    keys.push(`${channel}/${key}`);
  }
  return keys.sort();
}

export function gitCheckoutBranch(exec: Exec, name: string): void {
  mustRun(exec, 'git', ['checkout', '-b', `content/${name}`, 'main']);
}

/** A resumed run already has its branch, so this checks it out instead of creating it. */
export function gitCheckoutExisting(exec: Exec, name: string): void {
  mustRun(exec, 'git', ['checkout', `content/${name}`]);
}

export function gitCommitAll(exec: Exec, message: string): void {
  mustRun(exec, 'git', ['add', '-A']);
  const result = exec('git', ['commit', '-m', message, '-m', CO_AUTHOR]);
  if (result.code === 0) return;
  // git exits non-zero on a clean tree. A step that changed nothing is not a failure.
  if (result.out.includes('nothing to commit')) return;
  throw new Error(`git commit failed with code ${result.code}: ${result.out}`);
}

export function openPullRequest(exec: Exec, name: string, bodyPath: string): void {
  mustRun(exec, 'gh', [
    'pr',
    'create',
    '--draft',
    '--title',
    `content: ${name}`,
    '--body-file',
    bodyPath,
  ]);
}

function isStringList(value: unknown): boolean {
  const list = asArray(value);
  if (list === null) return false;
  return list.every((item) => asString(item) !== null);
}

export function readJsonFile(file: string): unknown {
  const text = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`cannot parse ${file}: ${errorMessage(error)}`);
  }
}

function mustRun(exec: Exec, command: string, args: string[]): string {
  const result = exec(command, args);
  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with code ${result.code}: ${result.out}`,
    );
  }
  return result.out;
}
