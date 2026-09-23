export interface ContentSet {
  species: Record<string, Record<string, unknown>>;
  concepts: { key: string; channel: string }[];
  units: { key: string }[];
  manifest: { hash: string; target: string; channel: string; retired?: boolean }[];
}

const SPECIES_PATH = 'content/species.json';
const CONCEPTS_PATH = 'content/concepts.json';
const UNITS_PATH = 'content/units.json';
const MANIFEST_PATH = 'content/images/manifest.json';

// The message names the file the reader opens, not the repository path.
const FILE_OF_PREFIX: Record<string, string> = {
  species: 'species.json',
  variety: 'species.json',
  concept: 'concepts.json',
  unit: 'units.json',
  image: 'images/manifest.json',
};

export function collectIds(content: ContentSet): string[] {
  const ids = new Set<string>();

  for (const symbol of Object.keys(content.species)) {
    ids.add(`species:${symbol}`);
    const varieties = content.species[symbol].varieties;
    if (Array.isArray(varieties)) {
      for (const variety of varieties) {
        const key = (variety as { key?: unknown }).key;
        if (typeof key === 'string') ids.add(`variety:${key}`);
      }
    }
  }
  // A concept is <channel>/<key> in the app, and a card is hash, target, and
  // channel. The ids carry the same parts.
  for (const concept of content.concepts) {
    ids.add(`concept:${concept.channel}/${concept.key}`);
  }
  for (const unit of content.units) ids.add(`unit:${unit.key}`);
  for (const row of content.manifest) {
    ids.add(`image:${row.hash}|${row.target}|${row.channel}`);
  }

  return [...ids].sort();
}

export function appendOnlyErrors(previous: ContentSet | null, next: ContentSet): string[] {
  if (previous === null) return [];

  const present = new Set(collectIds(next));
  const errors: string[] = [];
  for (const id of collectIds(previous)) {
    if (present.has(id)) continue;
    const file = FILE_OF_PREFIX[id.split(':')[0]];
    errors.push(`${id} is in the published ${file} and is gone from the new content`);
  }
  return errors;
}

export function readPublished(gitShow: (path: string) => string | null): ContentSet | null {
  const speciesText = gitShow(SPECIES_PATH);
  const conceptsText = gitShow(CONCEPTS_PATH);
  const unitsText = gitShow(UNITS_PATH);
  const manifestText = gitShow(MANIFEST_PATH);

  // The first-run signal is that all four files are absent. Any other mix of
  // absent and present is a broken publish, not a first run.
  if (
    speciesText === null &&
    conceptsText === null &&
    unitsText === null &&
    manifestText === null
  ) {
    return null;
  }

  return {
    species: readRecordMap(SPECIES_PATH, speciesText),
    concepts: readKeyedRows(CONCEPTS_PATH, conceptsText, ['key', 'channel']) as {
      key: string;
      channel: string;
    }[],
    units: readKeyedRows(UNITS_PATH, unitsText, ['key']) as { key: string }[],
    manifest: readKeyedRows(MANIFEST_PATH, manifestText, ['hash', 'target', 'channel']) as {
      hash: string;
      target: string;
      channel: string;
      retired?: boolean;
    }[],
  };
}

function parseFile(path: string, text: string | null): unknown {
  if (text === null) throw new Error(`${path} is missing from the published content`);
  try {
    return JSON.parse(text);
  } catch (error) {
    // The parser says where the text stops making sense. Keep it.
    throw new Error(`${path} does not hold valid JSON: ${(error as Error).message}`);
  }
}

function readRecordMap(path: string, text: string | null): Record<string, Record<string, unknown>> {
  const parsed = parseFile(path, text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} does not hold a JSON object of records`);
  }
  return parsed as Record<string, Record<string, unknown>>;
}

function readKeyedRows(path: string, text: string | null, fields: string[]): unknown[] {
  const parsed = parseFile(path, text);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path} does not hold a JSON array of rows`);
  }
  for (const row of parsed) {
    if (row === null || typeof row !== 'object') {
      throw new Error(`${path} holds a row that is not an object`);
    }
    for (const field of fields) {
      if (typeof (row as Record<string, unknown>)[field] !== 'string') {
        throw new Error(`${path} holds a row with no ${field}`);
      }
    }
  }
  return parsed;
}
