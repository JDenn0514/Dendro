import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PlantsProfile, ChecklistRow } from '../lib/plants.ts';
import type { InatTaxon } from '../lib/inat.ts';
import {
  REQUIRED_AUTHORED,
  validateAuthored,
  validateFetched,
  readAuthored,
  buildFetched,
  mergeSpecies,
  enumerateRun,
} from '../lib/species.ts';
import type { AuthoredSpecies } from '../lib/species.ts';

const SPECIES_DIR = fileURLToPath(new URL('../../content_src/species', import.meta.url));
const CONTENT_DIR = fileURLToPath(new URL('../../content', import.meta.url));

/** The `<channel>/<key>` set the app validator builds from content/concepts.json. */
function conceptKeys(): Set<string> {
  const text = readFileSync(join(CONTENT_DIR, 'concepts.json'), 'utf8');
  const rows = JSON.parse(text) as { key: string; channel: string }[];
  return new Set(rows.map((row) => `${row.channel}/${row.key}`));
}

const KEYS = conceptKeys();

function profile(over: Partial<PlantsProfile> = {}): PlantsProfile {
  return {
    symbol: 'QUGA',
    plants_id: 32851,
    scientific: 'Quercus gambelii',
    author: 'Nutt.',
    common: 'Gambel oak',
    family: 'Fagaceae',
    genus: 'Quercus',
    rank: 'Species',
    growth_habits: ['Tree', 'Shrub'],
    native_status: 'native',
    ...over,
  };
}

function authored(over: Partial<AuthoredSpecies> = {}): AuthoredSpecies {
  return {
    concepts: { leaf: 'simple_lobed' },
    range: { text: 'Colorado Plateau and southern Rockies' },
    elevation_ft: [5000, 9000],
    height_ft: [15, 30],
    habitat: 'Dry slopes and foothills with pinyon and juniper',
    ref: ['FNA vol. 3, Quercus gambelii'],
    ...over,
  };
}

function row(symbol: string, scientific: string, synonym = ''): ChecklistRow {
  return { symbol, synonym_symbol: synonym, scientific, common: '', family: 'Fagaceae' };
}

const RUN_ROWS: ChecklistRow[] = [
  row('QUGA', 'Quercus gambelii Nutt.'),
  row('QUGAM', 'Quercus gambelii var. gambelii'),
  row('QUXBE', 'Quercus ×bebbiana C.K. Schneid.'),
  row('QURU', 'Quercus rubra L.'),
  row('QUVE', 'Quercus velutina Lam.'),
  row('QUNP', 'Quercus nigra L.'),
  row('QUGA2', 'Quercus gambelii Nutt.', 'QUGA'),
];

const RUN_PROFILES: Record<string, PlantsProfile> = {
  QUGA: profile(),
  QUGAM: profile({ symbol: 'QUGAM', growth_habits: ['Shrub'] }),
  QUXBE: profile({ symbol: 'QUXBE', scientific: 'Quercus ×bebbiana', growth_habits: ['Tree'] }),
  QURU: profile({ symbol: 'QURU', scientific: 'Quercus rubra', growth_habits: ['Tree'] }),
  QUVE: profile({ symbol: 'QUVE', scientific: 'Quercus velutina', growth_habits: ['Tree'] }),
};

const RUN_DISTRIBUTION: Record<string, string[]> = {
  QUGA: ['CO', 'UT'],
  QUGAM: ['CO'],
  QUXBE: ['CO'],
  QURU: ['NE', 'IA'],
  QUVE: ['MO', 'IA'],
};

/** A copy of the QUGA record in the app's content_dev/species.json fixture. */
const FIXTURE_QUGA: Record<string, unknown> = {
  scientific: 'Quercus gambelii',
  common: ['Gambel oak', 'Rocky Mountain white oak'],
  audubon_name: 'Gambel Oak',
  inat_taxon_id: 47851,
  inat_name: null,
  genus: 'Quercus',
  genus_common: 'oak',
  section: 'Quercus',
  family: 'Fagaceae',
  arrangement: 'alternate',
  concepts: { leaf: 'simple_lobed', bark: 'furrowed', fruit: 'acorn' },
  range: {
    text: 'Colorado Plateau and southern Rockies',
    states: ['CO', 'UT', 'NM', 'AZ'],
  },
  planted_states: [],
  elevation_ft: [5000, 9000],
  height_ft: [15, 30],
  habitat: 'Dry slopes and foothills with pinyon and juniper',
  native_status: 'native',
  varieties: [
    { key: 'QUGAG', name: 'var. gambelii', note: 'The widespread form.' },
    { key: 'QUGAB', name: 'var. bakeri', note: 'Narrower lobes, southwestern.' },
  ],
};

function reasonFor(dropped: { symbol: string; reason: string }[], symbol: string): string | null {
  const hit = dropped.find((d) => d.symbol === symbol);
  return hit ? hit.reason : null;
}

test('the merge lets authored values win and keeps the fetched states', () => {
  const fetched = buildFetched({
    profile: profile(),
    subordinate: [],
    states: ['CO', 'UT', 'NM', 'AZ'],
    section: 'Quercus',
    inat: { id: 47851, name: 'Quercus gambelii' } as InatTaxon,
  });
  const record = mergeSpecies(fetched, authored({ audubon_name: 'Gambel Oak' }));
  assert.deepEqual(record.range, {
    text: 'Colorado Plateau and southern Rockies',
    states: ['CO', 'UT', 'NM', 'AZ'],
  });
  assert.equal(record.audubon_name, 'Gambel Oak');
  assert.equal(record.section, 'Quercus');
  assert.equal(record.native_status, 'native');
});

test('common is the PLANTS name then common_extra, with no duplicate', () => {
  const fetched = buildFetched({
    profile: profile(),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  const record = mergeSpecies(
    fetched,
    authored({ common_extra: ['Rocky Mountain white oak', 'Gambel oak'] }),
  );
  assert.deepEqual(record.common, ['Gambel oak', 'Rocky Mountain white oak']);
});

test('a variety takes its note from variety_notes, and one without a note carries none', () => {
  const fetched = buildFetched({
    profile: profile(),
    subordinate: [
      { key: 'QUGAG', name: 'var. gambelii' },
      { key: 'QUGAB', name: 'var. bakeri' },
    ],
    states: [],
    section: null,
    inat: null,
  });
  const record = mergeSpecies(
    fetched,
    authored({ variety_notes: { QUGAG: 'The widespread form.' } }),
  );
  assert.deepEqual(record.varieties, [
    { key: 'QUGAG', name: 'var. gambelii', note: 'The widespread form.' },
    { key: 'QUGAB', name: 'var. bakeri' },
  ]);
});

test('mergeSpecies writes unknown when the profile carries no native status', () => {
  const fetched = buildFetched({
    profile: profile({ native_status: null }),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  const record = mergeSpecies(fetched, authored());
  assert.equal(record.native_status, 'unknown');
});

test('every required authored field, when missing, fails with a message naming the symbol and the field', () => {
  for (const field of REQUIRED_AUTHORED) {
    const short = authored() as unknown as Record<string, unknown>;
    delete short[field];
    const errors = validateAuthored(short, 'QUGA', KEYS);
    assert.equal(errors.length, 1, `${field}: ${errors.join(' | ')}`);
    assert.match(errors[0], /QUGA/);
    assert.ok(errors[0].includes(field), errors[0]);
  }
});

test('each malformed field fails', () => {
  const cases: [unknown, RegExp][] = [
    [authored({ elevation_ft: [5000] as unknown as [number, number] }), /elevation_ft/],
    [authored({ height_ft: [30, 15] }), /height_ft/],
    [authored({ concepts: {} }), /concepts/],
    [authored({ ref: [] }), /ref/],
    ['not an object', /object/],
  ];
  for (const [value, pattern] of cases) {
    const errors = validateAuthored(value, 'QUGA', KEYS);
    assert.ok(errors.length > 0, `expected an error for ${JSON.stringify(value)}`);
    assert.ok(errors.some((m) => pattern.test(m)), errors.join(' | '));
    assert.ok(errors.every((m) => m.includes('QUGA')), errors.join(' | '));
  }
});

test('an unknown top-level field fails and the message lists it', () => {
  const bad = { ...authored(), habitats: 'Dry slopes' };
  const errors = validateAuthored(bad, 'QUGA', KEYS);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /habitats/);
  assert.match(errors[0], /variety_notes/);
});

test('validateAuthored fails a concept bucket content/concepts.json does not hold', () => {
  const bad = authored({ concepts: { leaf: 'simple_lobed', bark: 'furrowd' } });
  const errors = validateAuthored(bad, 'QUGA', KEYS);
  assert.deepEqual(errors, ['QUGA: unknown concept bark/furrowd']);
  assert.equal(KEYS.has('bark/furrowed'), true);
});

test('the real content_src/species/QUGA.json passes validateAuthored against content/concepts.json', () => {
  const file = readAuthored(SPECIES_DIR, 'QUGA');
  assert.ok(file, 'QUGA.json is missing');
  assert.deepEqual(validateAuthored(file, 'QUGA', KEYS), []);
});

test('readAuthored returns null for a symbol with no file', () => {
  assert.equal(readAuthored(SPECIES_DIR, 'ZZZZ'), null);
});

test('readAuthored throws when the read fails for a reason other than a missing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dendro-authored-'));
  mkdirSync(join(dir, 'QUGA.json'));
  assert.throws(
    () => readAuthored(dir, 'QUGA'),
    (error: NodeJS.ErrnoException) => error.code !== undefined && error.code !== 'ENOENT',
  );
});

test('buildFetched sets inat_name only when the iNat name differs', () => {
  const same = buildFetched({
    profile: profile(),
    subordinate: [],
    states: [],
    section: null,
    inat: { id: 47851, name: 'Quercus gambelii' },
  });
  assert.equal(same.inat_taxon_id, 47851);
  assert.equal(same.inat_name, null);

  const differs = buildFetched({
    profile: profile(),
    subordinate: [],
    states: [],
    section: null,
    inat: { id: 47851, name: 'Quercus undulata' },
  });
  assert.equal(differs.inat_name, 'Quercus undulata');

  const none = buildFetched({
    profile: profile(),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  assert.equal(none.inat_taxon_id, null);
  assert.equal(none.inat_name, null);
});

test('validateFetched names the symbol and each profile field the record needs', () => {
  const bare = buildFetched({
    profile: profile({ family: null, common: null, genus: '' }),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  assert.deepEqual(validateFetched(bare, 'QUGA'), [
    'QUGA: profile has no family',
    'QUGA: profile has no common name',
    'QUGA: profile has no genus',
  ]);

  const blank = buildFetched({
    profile: profile({ common: '   ' }),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  assert.deepEqual(validateFetched(blank, 'QUGA'), ['QUGA: profile has no common name']);

  const full = buildFetched({
    profile: profile(),
    subordinate: [],
    states: [],
    section: null,
    inat: null,
  });
  assert.deepEqual(validateFetched(full, 'QUGA'), []);
});

test('enumerateRun drops a shrub, a hybrid, and an out-of-range species', () => {
  const out = enumerateRun({
    rows: RUN_ROWS,
    genera: ['Quercus'],
    states: ['CO'],
    include: ['QUVE'],
    profiles: RUN_PROFILES,
    distribution: RUN_DISTRIBUTION,
  });
  assert.deepEqual(out.kept, ['QUGA', 'QUVE']);
  assert.equal(reasonFor(out.dropped, 'QUGAM'), 'not a tree');
  assert.equal(reasonFor(out.dropped, 'QUXBE'), 'hybrid');
  assert.equal(reasonFor(out.dropped, 'QURU'), 'out of range');
  assert.equal(reasonFor(out.dropped, 'QUNP'), 'no profile');
  assert.equal(reasonFor(out.dropped, 'QUGA2'), null);
});

test('enumerateRun drops an include symbol that is a shrub', () => {
  const out = enumerateRun({
    rows: RUN_ROWS,
    genera: ['Quercus'],
    states: ['CO'],
    include: ['QUGAM'],
    profiles: RUN_PROFILES,
    distribution: RUN_DISTRIBUTION,
  });
  assert.equal(out.kept.includes('QUGAM'), false);
  assert.equal(reasonFor(out.dropped, 'QUGAM'), 'not a tree');
});

test('mergeSpecies emits the fields in the app fixture order', () => {
  const fetched = buildFetched({
    profile: profile(),
    subordinate: [{ key: 'QUGAG', name: 'var. gambelii' }],
    states: ['CO', 'UT'],
    section: 'Quercus',
    inat: { id: 47851, name: 'Quercus gambelii' },
  });
  const record = mergeSpecies(
    fetched,
    authored({
      audubon_name: 'Gambel Oak',
      genus_common: 'oak',
      arrangement: 'alternate',
      planted_states: ['NM'],
    }),
  );
  assert.deepEqual(Object.keys(record), Object.keys(FIXTURE_QUGA));
  assert.equal(record.ref, undefined);
});

test('the worked QUGA.json merges into the app fixture record, field for field', () => {
  const file = readAuthored(SPECIES_DIR, 'QUGA');
  assert.ok(file, 'QUGA.json is missing');
  const fetched = buildFetched({
    profile: profile(),
    subordinate: [
      { key: 'QUGAG', name: 'var. gambelii' },
      { key: 'QUGAB', name: 'var. bakeri' },
    ],
    states: ['CO', 'UT', 'NM', 'AZ'],
    section: 'Quercus',
    inat: { id: 47851, name: 'Quercus gambelii' },
  });
  assert.deepEqual(mergeSpecies(fetched, file), FIXTURE_QUGA);
});
