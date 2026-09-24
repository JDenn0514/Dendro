import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SECTION_PAGES,
  parseSectionPage,
  nextPageUrl,
  buildSectionTable,
  sectionFor,
  loadSectionTable,
} from '../lib/fna.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures');
const sampleTable = path.join(fixtures, 'quercus_sections_sample.json');

function fixture(name: string): string {
  return fs.readFileSync(path.join(fixtures, name), 'utf8');
}

const lobatae = fixture('fna_lobatae.html');
// The live section pages hold every species on one page, carry no hybrid, and
// link no genus on its own. This pair is hand-built and covers those three.
const paged = fixture('fna_hand_built_page1.html');
const lobataePage2 = fixture('fna_lobatae_page2.html');
const quercus = fixture('fna_quercus.html');
const protobalanus = fixture('fna_protobalanus.html');

// The order follows SECTION_PAGES, which follows the live taxon ids:
// 302020 is Lobatae, 302027 is Protobalanus, and 302029 is Quercus.
const LOBATAE = SECTION_PAGES[0];
const PROTOBALANUS = SECTION_PAGES[1];
const QUERCUS = SECTION_PAGES[2];
const LOBATAE_PAGE_2 = `${LOBATAE.url}&page=2`;

test('the Lobatae first page parses to its four species, in page order', () => {
  assert.deepEqual(parseSectionPage(lobatae), [
    'Quercus rubra',
    'Quercus velutina',
    'Quercus palustris',
    'Quercus acerifolia',
  ]);
});

test('the Lobatae second page parses to its two species, in page order', () => {
  assert.deepEqual(parseSectionPage(lobataePage2), [
    'Quercus shumardii',
    'Quercus texana',
  ]);
});

test('the Quercus page parses to its four species, in page order', () => {
  assert.deepEqual(parseSectionPage(quercus), [
    'Quercus alba',
    'Quercus gambelii',
    'Quercus macrocarpa',
    'Quercus bicolor',
  ]);
});

test('the Protobalanus page parses to its four species, in page order', () => {
  assert.deepEqual(parseSectionPage(protobalanus), [
    'Quercus chrysolepis',
    'Quercus palmeri',
    'Quercus tomentella',
    'Quercus vacciniifolia',
  ]);
});

// The live page links its own heading the way it links a species. Task 19 found
// three such headings in the 93 row table that the first build wrote.
test('the section heading of the page is not a species', () => {
  for (const page of [lobatae, quercus, protobalanus]) {
    assert.match(page, /Sect\./);
    for (const name of parseSectionPage(page)) assert.doesNotMatch(name, /Sect\./);
  }
});

test('a navigation anchor is not a species', () => {
  assert.match(paged, /How to use this key/);
  assert.match(paged, /start_taxon_id=302020&amp;page=2/);
  const names = parseSectionPage(protobalanus).concat(parseSectionPage(lobatae));
  assert.equal(names.length, 8);
  for (const name of names) {
    assert.doesNotMatch(name, /key|page|Home|eFloras/i);
  }
});

test('a genus-only name is dropped', () => {
  assert.match(paged, /taxon_id=233501301'[\s\S]*?<b>Quercus<\/b>/);
  assert.equal(parseSectionPage(paged).includes('Quercus'), false);
});

test('a hybrid name is dropped', () => {
  assert.match(paged, /runcinata/);
  const names = parseSectionPage(paged);
  assert.equal(names.length, 2);
  assert.equal(names.some((name) => name.includes('runcinata')), false);
  assert.equal(names.some((name) => name.includes('×')), false);
});

test('nextPageUrl gives the absolute url of the next page anchor', () => {
  assert.equal(LOBATAE.section, 'Lobatae');
  assert.equal(nextPageUrl(paged, LOBATAE.url), LOBATAE_PAGE_2);
});

// No live section page carries a next page anchor, so every walk is one page.
test('a recorded section page holds no next page anchor', () => {
  assert.equal(nextPageUrl(lobatae, LOBATAE.url), null);
  assert.equal(nextPageUrl(quercus, QUERCUS.url), null);
});

test('nextPageUrl gives null when the page holds no next page anchor', () => {
  assert.match(lobataePage2, /Previous page/);
  assert.equal(nextPageUrl(lobataePage2, LOBATAE_PAGE_2), null);
  assert.equal(nextPageUrl(protobalanus, PROTOBALANUS.url), null);
});

test('buildSectionTable gives one section per name', () => {
  const table = buildSectionTable([
    { section: 'Lobatae', html: lobatae },
    { section: 'Quercus', html: quercus },
    { section: 'Protobalanus', html: protobalanus },
  ]);
  const total =
    parseSectionPage(lobatae).length +
    parseSectionPage(quercus).length +
    parseSectionPage(protobalanus).length;
  assert.equal(Object.keys(table).length, total);
  assert.equal(total, 12);
  assert.equal(table['Quercus rubra'], 'Lobatae');
  assert.equal(table['Quercus gambelii'], 'Quercus');
  assert.equal(table['Quercus palmeri'], 'Protobalanus');
});

test('buildSectionTable joins two pages of one section', () => {
  const table = buildSectionTable([
    { section: 'Lobatae', html: paged },
    { section: 'Lobatae', html: lobataePage2 },
  ]);
  assert.equal(
    Object.keys(table).length,
    parseSectionPage(paged).length + parseSectionPage(lobataePage2).length,
  );
  assert.equal(table['Quercus rubra'], 'Lobatae');
  assert.equal(table['Quercus texana'], 'Lobatae');
});

test('a name on two sections throws, and the message names the species and both sections', () => {
  assert.throws(
    () =>
      buildSectionTable([
        { section: 'Lobatae', html: lobatae },
        { section: 'Protobalanus', html: lobatae },
      ]),
    (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /Quercus rubra/);
      assert.match(message, /Lobatae/);
      assert.match(message, /Protobalanus/);
      return true;
    },
  );
});

test('sectionFor finds a name, folds case and whitespace, and resolves a variety', () => {
  const table = buildSectionTable([
    { section: 'Lobatae', html: lobatae },
    { section: 'Quercus', html: quercus },
    { section: 'Protobalanus', html: protobalanus },
  ]);
  assert.equal(sectionFor(table, 'Quercus alba'), 'Quercus');
  assert.equal(sectionFor(table, '  quercus   RUBRA '), 'Lobatae');
  assert.equal(sectionFor(table, 'Quercus gambelii var. gambelii'), 'Quercus');
  assert.equal(sectionFor(table, 'Acer rubrum'), null);
  assert.equal(sectionFor(table, ''), null);
});

test('loadSectionTable reads a table file, and sectionFor answers from it', () => {
  const table = loadSectionTable(sampleTable);
  assert.equal(table['Quercus gambelii'], 'Quercus');
  assert.equal(table['Quercus rubra'], 'Lobatae');
  assert.equal(sectionFor(table, ' quercus GAMBELII var. gambelii '), 'Quercus');
  assert.equal(sectionFor(table, 'Acer rubrum'), null);
});

test('loadSectionTable on a missing path names the command that builds the table', () => {
  const missing = path.join(fixtures, 'no_such_sections.json');
  assert.throws(
    () => loadSectionTable(missing),
    (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /no_such_sections\.json/);
      assert.match(message, /data sections/);
      return true;
    },
  );
});

test('loadSectionTable rejects a file that is not an object of strings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-fna-'));
  try {
    const arrayFile = path.join(dir, 'array_sections.json');
    fs.writeFileSync(arrayFile, '["Quercus alba"]', 'utf8');
    assert.throws(() => loadSectionTable(arrayFile), /not a JSON object/);
    const numberFile = path.join(dir, 'number_sections.json');
    fs.writeFileSync(numberFile, '{"Quercus alba": 7}', 'utf8');
    assert.throws(() => loadSectionTable(numberFile), /non-string section for Quercus alba/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SECTION_PAGES holds three http urls, each with its taxon id', () => {
  assert.equal(SECTION_PAGES.length, 3);
  const seen = new Set<string>();
  for (const page of SECTION_PAGES) {
    assert.ok(page.url.startsWith('http://'));
    assert.equal(page.url.includes(`start_taxon_id=${page.taxonId}`), true);
    seen.add(page.section);
  }
  assert.deepEqual(
    SECTION_PAGES.map((page) => page.section),
    ['Lobatae', 'Protobalanus', 'Quercus'],
  );
  assert.deepEqual(
    SECTION_PAGES.map((page) => page.taxonId),
    ['302020', '302027', '302029'],
  );
  assert.equal(seen.size, 3);
});
