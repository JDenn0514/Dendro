// Property tests: each one states a rule that must hold for every input, and
// checks it on a few hundred seeded random inputs. A failure names its seed.
// The generator is the app tests' one, so both suites read a seed the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { forEachSeed, intIn, pick } from '../../tests/helpers/rng.js';
import { readJsonl, writeJsonl, appendJsonl } from '../lib/jsonl.ts';
import { appendOnlyErrors, collectIds } from '../lib/ids.ts';
import type { ContentSet } from '../lib/ids.ts';
import { normalizeName, identityMatches } from '../lib/verdicts.ts';

const CASES = 300;
type Rng = () => number;

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-prop-'));
  return path.join(dir, 'rows.jsonl');
}

// A JSON value with the awkward parts a row can hold: quotes, newlines,
// non-ASCII names, empty strings, nulls, nested arrays, and objects.
function randomValue(rng: Rng, depth = 0): unknown {
  const kind = intIn(rng, 0, depth > 2 ? 3 : 5);
  if (kind === 0) return null;
  if (kind === 1) return intIn(rng, -1000, 1000);
  if (kind === 2) return rng() < 0.5;
  if (kind === 3) return pick(rng, ['', 'Quercus × bebbiana', 'line\nbreak', 'a "quote"', 'tab\there', 'Ée', '{}']);
  if (kind === 4) return Array.from({ length: intIn(rng, 0, 3) }, () => randomValue(rng, depth + 1));
  const object: Record<string, unknown> = {};
  for (let i = intIn(rng, 0, 4); i > 0; i -= 1) object[`k${intIn(rng, 0, 9)}`] = randomValue(rng, depth + 1);
  return object;
}

function randomRows(rng: Rng): Record<string, unknown>[] {
  return Array.from({ length: intIn(rng, 0, 12) }, (_, i) => ({ id: `c${i}`, value: randomValue(rng) }));
}

test('writeJsonl then readJsonl gives the same rows', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const file = tempFile();
    try {
      const rows = randomRows(rng);
      writeJsonl(file, rows);
      assert.deepEqual(readJsonl(file), rows);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });
});

test('appending in parts gives the same rows as one write', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const file = tempFile();
    try {
      const rows = randomRows(rng);
      let start = 0;
      while (start < rows.length) {
        const end = intIn(rng, start + 1, rows.length);
        appendJsonl(file, rows.slice(start, end));
        start = end;
      }
      assert.deepEqual(readJsonl(file), rows);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });
});

const SYMBOLS = ['QURU', 'QUAL', 'ACRU', 'ACSA', 'PLOC', 'LIST', 'SAAL'];
const CHANNELS = ['leaf', 'bark', 'fruit'];

function randomContent(rng: Rng): ContentSet {
  const species: ContentSet['species'] = {};
  for (const symbol of SYMBOLS) {
    if (rng() < 0.6) {
      species[symbol] = rng() < 0.3 ? { varieties: [{ key: `${symbol.toLowerCase()}_var` }] } : {};
    }
  }
  const concepts = CHANNELS.flatMap((channel) =>
    ['simple_lobed', 'needles', 'samara'].filter(() => rng() < 0.5).map((key) => ({ key, channel })));
  const units = ['leaf_types', 'oaks', 'maples'].filter(() => rng() < 0.5).map((key) => ({ key }));
  const manifest = Array.from({ length: intIn(rng, 0, 10) }, (_, i) => ({
    hash: `h${i}`, target: pick(rng, SYMBOLS), channel: pick(rng, CHANNELS)
  }));
  return { species, concepts, units, manifest };
}

// The next content as a run makes it: every published item stays, some are
// retired, and new ones are added.
function grow(rng: Rng, published: ContentSet): ContentSet {
  const next = structuredClone(published);
  for (const row of next.manifest) if (rng() < 0.3) row.retired = true;
  for (let i = intIn(rng, 0, 4); i > 0; i -= 1) {
    next.manifest.push({ hash: `new${i}`, target: pick(rng, SYMBOLS), channel: pick(rng, CHANNELS) });
  }
  if (rng() < 0.5) next.species.NEW1 = {};
  if (rng() < 0.5) next.units.push({ key: 'new_unit' });
  return next;
}

test('every published item has an id', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const content = randomContent(rng);
    const ids = new Set(collectIds(content));
    for (const symbol of Object.keys(content.species)) assert.ok(ids.has(`species:${symbol}`), symbol);
    for (const c of content.concepts) assert.ok(ids.has(`concept:${c.channel}/${c.key}`), c.key);
    for (const u of content.units) assert.ok(ids.has(`unit:${u.key}`), u.key);
    for (const r of content.manifest) assert.ok(ids.has(`image:${r.hash}|${r.target}|${r.channel}`), r.hash);
  });
});

test('content that only adds or retires items passes the append-only check', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const published = randomContent(rng);
    assert.deepEqual(appendOnlyErrors(published, grow(rng, published)), []);
  });
});

test('content that loses any published id fails the append-only check and names it', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const published = randomContent(rng);
    const next = grow(rng, published);
    const ids = collectIds(published);
    if (ids.length === 0) return;
    const lost = pick(rng, ids);
    const [prefix, rest] = [lost.slice(0, lost.indexOf(':')), lost.slice(lost.indexOf(':') + 1)];
    if (prefix === 'species') delete next.species[rest];
    if (prefix === 'variety') {
      for (const record of Object.values(next.species)) {
        if (Array.isArray(record.varieties)) {
          record.varieties = record.varieties.filter((v: { key: string }) => v.key !== rest);
        }
      }
    }
    if (prefix === 'concept') next.concepts = next.concepts.filter((c) => `${c.channel}/${c.key}` !== rest);
    if (prefix === 'unit') next.units = next.units.filter((u) => u.key !== rest);
    if (prefix === 'image') next.manifest = next.manifest.filter((r) => `${r.hash}|${r.target}|${r.channel}` !== rest);

    const errors = appendOnlyErrors(published, next);
    assert.ok(errors.some((line) => line.startsWith(`${lost} `)), `lost ${lost}, errors ${JSON.stringify(errors)}`);
  });
});

// Names in the order sources write them: a genus, an optional hybrid sign (a
// token of its own, or on the epithet as USDA PLANTS writes it), an epithet,
// and then one of three tails:
//   none:     authors only, "Quercus alba L."
//   rank:     authors, a rank marker, an infraspecific epithet, and an author,
//             "Acer saccharum Marshall ssp. leucoderme (Small) Desmarais"
//   trinomial: a bare lowercase infraspecific epithet right after the epithet,
//             "Acer saccharum leucoderme"
// Case and spacing vary.
const GENERA = ['Quercus', 'QUERCUS', 'quercus', 'Acer', 'Platanus', 'Liquidambar'];
const EPITHETS = ['alba', 'rubra', 'gambelii', 'x-bebbiana', 'saccharum', 'leucoderme'];
const AUTHORS = ['L.', 'Michx.', 'Michx. f.', '(Torr.)', '(L.) Moench', 'Nutt.', 'Sarg.', 'Nuttall'];
const RANKS = ['var.', 'var', 'subsp.', 'subsp', 'ssp', 'ssp.', 'f.', 'f', 'fo.', 'fo', 'forma'];
const DOTTED_RANKS = RANKS.filter((rank) => rank.endsWith('.'));
const DOTLESS_RANKS = RANKS.filter((rank) => !rank.endsWith('.'));

interface Named {
  name: string;
  /** The "genus epithet", lowercase. */
  species: string;
  /** The infraspecific epithet, or null. */
  infra: string | null;
  /** What normalizeName must give: a rank marker and its epithet drop out, a bare one stays. */
  normal: string;
}

function randomNamed(rng: Rng, ranks: string[] = RANKS): Named {
  const genus = pick(rng, GENERA);
  const epithet = pick(rng, EPITHETS);
  const species = `${genus.toLowerCase()} ${epithet}`;
  const parts = [genus];
  const hybrid = rng();
  const shown = rng() < 0.15 ? epithet.toUpperCase() : epithet;
  if (hybrid < 0.1) parts.push('×', shown);
  else if (hybrid < 0.2) parts.push(`×${shown}`);
  else parts.push(shown);

  const tail = pick(rng, ['none', 'rank', 'trinomial']);
  let infra: string | null = null;
  if (tail === 'trinomial') {
    infra = pick(rng, EPITHETS);
    parts.push(infra);
    if (rng() < 0.5) parts.push(pick(rng, AUTHORS));
  } else {
    for (let i = intIn(rng, 0, 2); i > 0; i -= 1) parts.push(pick(rng, AUTHORS));
    if (tail === 'rank') {
      infra = pick(rng, EPITHETS);
      parts.push(pick(rng, ranks), infra);
      if (rng() < 0.5) parts.push(pick(rng, AUTHORS));
    }
  }
  const normal = tail === 'trinomial' ? `${species} ${infra}` : species;
  return { name: parts.join(pick(rng, [' ', '  ', '\t'])), species, infra, normal };
}

function randomName(rng: Rng): string {
  return randomNamed(rng).name;
}

test('normalizeName drops authors, the hybrid sign, and a rank with its epithet', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const { name, normal } = randomNamed(rng);
    assert.equal(normalizeName(name), normal, JSON.stringify(name));
  });
});

test('normalizeName gives the same name a second time', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const once = normalizeName(randomName(rng));
    assert.equal(normalizeName(once), once);
  });
});

test('normalizeName gives a lowercase name of plain tokens', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const name = normalizeName(randomName(rng));
    assert.equal(name, name.toLowerCase());
    assert.doesNotMatch(name, /[()×]|\s{2}|^\s|\s$/);
  });
});

// Owner ruling 2026-09-26 (identityMatches in pipeline/lib/verdicts.ts): a listed
// name with no infraspecific epithet matches its species at any rank. A listed
// name with one matches only a source with the same one.
test('a plain species name matches every source name of that species', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const { name, species } = randomNamed(rng);
    assert.equal(identityMatches(name, [species]), true, `${JSON.stringify(name)} against ${species}`);
  });
});

function varietyRule(rng: Rng, ranks: string[]): void {
  const { name, species, infra } = randomNamed(rng, ranks);
  const listedInfra = pick(rng, EPITHETS);
  const listed = `${species} ${pick(rng, ranks)} ${listedInfra}`;
  assert.equal(identityMatches(name, [listed]), infra === listedInfra, `${JSON.stringify(name)} against ${listed}`);
}

test('a listed variety matches a source name only with the same infraspecific epithet', () => {
  forEachSeed(CASES, (rng: Rng) => varietyRule(rng, DOTTED_RANKS));
});

// Issue #92: a rank marker with no dot ("var", "ssp", "subsp") is never the
// infraspecific epithet, so "Quercus alba var alba" matches "Quercus alba var.
// alba" and "... ssp alba" does not match "... ssp leucoderme". That holds right
// after the epithet and after the author suffix "f." ("Michx. f. subsp
// gambelii"). parseName (pipeline/lib/verdicts.ts) keeps the rank markers out of
// the epithet in both rules, as normalizeName does.
test('a listed variety matches a source name with a dotless rank marker', () => {
  forEachSeed(CASES, (rng: Rng) => varietyRule(rng, DOTLESS_RANKS));
});

test('a source name never matches another species', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const { name, species } = randomNamed(rng);
    const [genus, epithet] = species.split(' ');
    const other = pick(rng, EPITHETS.filter((e) => e !== epithet));
    assert.equal(identityMatches(name, [`${genus} ${other}`]), false, `${JSON.stringify(name)} against ${genus} ${other}`);
  });
});
