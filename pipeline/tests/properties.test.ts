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

// Names in the order sources write them: a genus, an optional hybrid sign, an
// epithet, optional authors (with or without brackets), and an optional rank
// marker with an infraspecific epithet and its author. Case and spacing vary.
const GENERA = ['Quercus', 'QUERCUS', 'quercus', 'Acer', 'Platanus', 'Liquidambar'];
const EPITHETS = ['alba', 'rubra', 'gambelii', 'x-bebbiana', 'saccharum', 'leucoderme'];
const AUTHORS = ['L.', 'Michx.', 'Michx. f.', '(Torr.)', '(L.) Moench', 'Nutt.', 'Sarg.', 'Nuttall'];
const RANKS = ['var.', 'var', 'subsp.', 'ssp', 'ssp.', 'f.'];

// A name, and the "genus epithet" it must normalize to: the rank marker, the
// infraspecific epithet, the hybrid sign, and every author drop out.
function randomNamed(rng: Rng): { name: string; species: string } {
  const genus = pick(rng, GENERA);
  const epithet = pick(rng, EPITHETS);
  const parts = [genus];
  if (rng() < 0.15) parts.push('×');
  parts.push(rng() < 0.15 ? epithet.toUpperCase() : epithet);
  for (let i = intIn(rng, 0, 2); i > 0; i -= 1) parts.push(pick(rng, AUTHORS));
  if (rng() < 0.5) {
    parts.push(pick(rng, RANKS), pick(rng, EPITHETS));
    if (rng() < 0.5) parts.push(pick(rng, AUTHORS));
  }
  return { name: parts.join(pick(rng, [' ', '  ', '\t'])), species: `${genus.toLowerCase()} ${epithet}` };
}

function randomName(rng: Rng): string {
  return randomNamed(rng).name;
}

function speciesOf(normal: string): string {
  return normal.split(' ').slice(0, 2).join(' ');
}

test('normalizeName gives the genus and the epithet, and nothing else', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const { name, species } = randomNamed(rng);
    assert.equal(normalizeName(name), species, JSON.stringify(name));
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

test('a source name matches its own species, at any rank', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const name = randomName(rng);
    const species = speciesOf(normalizeName(name));
    assert.equal(identityMatches(name, [species]), true, `${JSON.stringify(name)} against ${species}`);
  });
});

test('a source name never matches another species', () => {
  forEachSeed(CASES, (rng: Rng) => {
    const name = randomName(rng);
    const [genus, epithet] = speciesOf(normalizeName(name)).split(' ');
    const other = pick(rng, EPITHETS.filter((e) => e !== epithet));
    assert.equal(identityMatches(name, [`${genus} ${other}`]), false, `${JSON.stringify(name)} against ${genus} ${other}`);
  });
});
