import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  GAP_THRESHOLD,
  buildGaps,
  renderReport,
  type ReportData,
  type ReportEscalationRow,
  type ReportSpeciesRow,
} from '../lib/report.ts';

const runFixture = new URL('./fixtures/report_run.json', import.meta.url);
const expectedFixture = new URL('./fixtures/report_expected.md', import.meta.url);

function fixtureData(): ReportData {
  return JSON.parse(fs.readFileSync(runFixture, 'utf8')) as ReportData;
}

function makeData(over: Partial<ReportData> = {}): ReportData {
  return {
    run: 'v0-oaks',
    channels: ['leaf'],
    species: [],
    gaps: [],
    units: [],
    escalations: [],
    counts: {
      candidates_by_source: {},
      verdicts_by_kind: {},
      fetch_failures: 0,
      stop_rule_fired: false,
    },
    ...over,
  };
}

function speciesRow(
  symbol: string,
  status: string,
  counts: Record<string, number>,
): ReportSpeciesRow {
  return { symbol, status, reason: null, counts };
}

function escalation(over: Partial<ReportEscalationRow> = {}): ReportEscalationRow {
  return {
    candidate_id: 'a1b2c3',
    image_url: 'https://images.dendro.test/review/a1b2c3.jpg',
    origin: 'https://www.inaturalist.org/observations/123456',
    case: 'mismatch',
    note: 'Leaf reads Quercus rubra, not Quercus alba.',
    target: 'QUAL',
    ...over,
  };
}

// The table lines of one section, header and divider included.
function sectionLines(text: string, heading: string): string[] {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  assert.notEqual(start, -1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = end === -1 ? rest : rest.slice(0, end);
  return body.filter((line) => line.startsWith('|'));
}

function bodyRows(text: string, heading: string): string[] {
  return sectionLines(text, heading).slice(2);
}

test('the fixture run renders the stored report, byte for byte', () => {
  const expected = fs.readFileSync(expectedFixture, 'utf8');
  assert.equal(renderReport(fixtureData()), expected);
});

test('the fixture gaps are what buildGaps returns for its species and channels', () => {
  const data = fixtureData();
  assert.deepEqual(buildGaps(data.species, data.channels), data.gaps);
});

test('the report holds the five headings in the order section 9 gives', () => {
  const headings = renderReport(fixtureData())
    .split('\n')
    .filter((line) => line.startsWith('## '));
  assert.deepEqual(headings, [
    '## Species',
    '## Channel gaps',
    '## Units',
    '## Escalations',
    '## Run counts',
  ]);
});

test('each table holds one row per species, gap, unit, and escalation', () => {
  const data = fixtureData();
  const text = renderReport(data);
  assert.equal(bodyRows(text, 'Species').length, data.species.length);
  assert.equal(bodyRows(text, 'Channel gaps').length, data.gaps.length);
  assert.equal(bodyRows(text, 'Units').length, data.units.length);
  assert.equal(bodyRows(text, 'Escalations').length, data.escalations.length);
});

test('the run counts list the sources and the kinds sorted, then the two totals', () => {
  const labels = bodyRows(renderReport(fixtureData()), 'Run counts').map(
    (line) => line.slice(2).split(' | ')[0],
  );
  assert.deepEqual(labels, [
    'candidates_commons',
    'candidates_inat',
    'candidates_manual',
    'candidates_plants',
    'verdicts_approve',
    'verdicts_escalate',
    'verdicts_reject',
    'fetch_failures',
    'stop_rule_fired',
  ]);
});

test('buildGaps sorts the lowest count first and skips a dropped species', () => {
  const species: ReportSpeciesRow[] = [
    speciesRow('QUAL', 'included', { leaf: 3, bark: 1 }),
    speciesRow('QURU', 'included', { leaf: 2, bark: GAP_THRESHOLD }),
    { symbol: 'QUST', status: 'dropped', reason: 'shrub habit only', counts: { leaf: 0, bark: 0 } },
  ];

  assert.deepEqual(buildGaps(species, ['leaf', 'bark']), [
    { symbol: 'QUAL', channel: 'bark', count: 1 },
    { symbol: 'QURU', channel: 'leaf', count: 2 },
    { symbol: 'QUAL', channel: 'leaf', count: 3 },
  ]);
});

test('buildGaps counts a channel the species has no entry for as 0', () => {
  const species: ReportSpeciesRow[] = [speciesRow('QUMA2', 'no_photos', { leaf: 9 })];

  assert.deepEqual(buildGaps(species, ['leaf', 'bark', 'fruit']), [
    { symbol: 'QUMA2', channel: 'bark', count: 0 },
    { symbol: 'QUMA2', channel: 'fruit', count: 0 },
  ]);
});

test('a concept target gets a gap row for its own channel only', () => {
  const species: ReportSpeciesRow[] = [
    speciesRow('bark/plated', 'included', { bark: 2 }),
    speciesRow('fruit/cone', 'included', { fruit: 5 }),
  ];
  const channels = ['bark', 'fruit', 'leaf'];

  assert.deepEqual(buildGaps(species, channels, ['bark/plated', 'fruit/cone']), [
    { symbol: 'bark/plated', channel: 'bark', count: 2 },
  ]);
  // Without the run's list, the qualified key alone marks the concept.
  assert.deepEqual(buildGaps(species, channels), [
    { symbol: 'bark/plated', channel: 'bark', count: 2 },
  ]);
});

test('a species target keeps one gap row per run channel under the threshold', () => {
  const species: ReportSpeciesRow[] = [speciesRow('QUAL', 'included', { bark: 2, fruit: 5 })];

  assert.deepEqual(buildGaps(species, ['bark', 'fruit', 'leaf'], []), [
    { symbol: 'QUAL', channel: 'leaf', count: 0 },
    { symbol: 'QUAL', channel: 'bark', count: 2 },
  ]);
});

test('an empty escalation list renders a sentence and no table header', () => {
  const text = renderReport(makeData());

  assert.match(text, /## Escalations\n\nNo escalations\.\n/);
  assert.equal(text.includes('| Image | Source | Case | Note |'), false);
});

test('a pipe in a note is escaped and the row keeps four cells', () => {
  const text = renderReport(
    makeData({
      escalations: [escalation({ note: 'Leaf reads Quercus rubra | not Quercus alba.' })],
    }),
  );

  const line = text.split('\n').find((l) => l.includes('Leaf reads')) as string;
  assert.ok(line.includes('rubra \\| not'));
  // Four cells give five unescaped pipes, so the split yields six pieces.
  assert.equal(line.split(/(?<!\\)\|/).length, 6);
});

test('a line break in a note becomes one space and the row stays on one line', () => {
  const text = renderReport(
    makeData({
      escalations: [escalation({ note: 'Leaf reads Quercus rubra.\r\nThe cup is wrong too.' })],
    }),
  );

  const rows = bodyRows(text, 'Escalations');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].includes('Quercus rubra. The cup is wrong too.'));
});

test('a link destination with a space and a parenthesis stays angle-bracketed and the row keeps its cells', () => {
  const origin = 'https://commons.wikimedia.org/wiki/File:Quercus (velutina) bark.jpg';
  const imageUrl = 'https://images.dendro.test/review/a b.jpg';
  const text = renderReport(
    makeData({
      escalations: [escalation({ origin, image_url: imageUrl })],
    }),
  );

  const rows = bodyRows(text, 'Escalations');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].includes(`[QUAL](<${origin}>)`));
  assert.ok(rows[0].includes(`![](<${imageUrl}>)`));
  // Four cells give five unescaped pipes, so the split yields six pieces.
  assert.equal(rows[0].split(/(?<!\\)\|/).length, 6);
});

test('a unit warning fills the Warning cell and a null warning leaves it empty', () => {
  const text = renderReport(
    makeData({
      units: [
        {
          key: 'leaf_types',
          cards: 27,
          warning: 'leaf_types holds 27 cards, outside the range 5 to 25',
        },
        { key: 'bark_types', cards: 12, warning: null },
      ],
    }),
  );

  assert.ok(text.includes('| Unit | Cards | Warning |'));
  assert.ok(
    text.includes('| leaf_types | 27 | leaf_types holds 27 cards, outside the range 5 to 25 |'),
  );
  assert.ok(text.includes('| bark_types | 12 |  |'));
});

test('the stop rule row reads yes when it fired and no when it did not', () => {
  const fired = makeData({
    counts: {
      candidates_by_source: {},
      verdicts_by_kind: {},
      fetch_failures: 0,
      stop_rule_fired: true,
    },
  });

  assert.ok(renderReport(fired).includes('| stop_rule_fired | yes |'));
  assert.ok(renderReport(makeData()).includes('| stop_rule_fired | no |'));
});

test('the fetch failure count from the run reaches the table', () => {
  const data = makeData({
    counts: {
      candidates_by_source: {},
      verdicts_by_kind: {},
      fetch_failures: 3,
      stop_rule_fired: false,
    },
  });

  assert.ok(renderReport(data).includes('| fetch_failures | 3 |'));
});
