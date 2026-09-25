export interface ReportSpeciesRow {
  symbol: string;
  status: string;
  reason: string | null;
  counts: Record<string, number>;
}

export interface ReportGapRow {
  symbol: string;
  channel: string;
  count: number;
}

export interface ReportUnitRow {
  key: string;
  cards: number;
  // The app validator's units.json warning for this key, or null.
  warning: string | null;
}

export interface ReportEscalationRow {
  candidate_id: string;
  image_url: string;
  origin: string;
  case: string;
  note: string;
  target: string;
}

export interface ReportData {
  run: string;
  channels: string[];
  species: ReportSpeciesRow[];
  gaps: ReportGapRow[];
  units: ReportUnitRow[];
  escalations: ReportEscalationRow[];
  counts: {
    candidates_by_source: Record<string, number>;
    verdicts_by_kind: Record<string, number>;
    fetch_failures: number;
    stop_rule_fired: boolean;
  };
}

export const GAP_THRESHOLD = 4;

// A species the run dropped, or one with no authored file, has no gap to fill.
const GAP_STATUSES = ['included', 'no_photos'];

function compare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// A concept target such as `bark/plated` lives in one channel, the prefix of
// its key. The other run channels hold no photo for it, so they are not gaps.
// A species target does have every run channel.
function gapChannels(symbol: string, channels: string[], concepts: string[]): string[] {
  // The run's own list decides. Without one, a qualified key marks a concept.
  const isConcept = concepts.length > 0 ? concepts.includes(symbol) : symbol.includes('/');
  const slash = symbol.indexOf('/');
  if (!isConcept || slash === -1) return channels;
  return [symbol.slice(0, slash)];
}

export function buildGaps(
  species: ReportSpeciesRow[],
  channels: string[],
  concepts: string[] = [],
): ReportGapRow[] {
  const gaps: ReportGapRow[] = [];
  for (const row of species) {
    if (!GAP_STATUSES.includes(row.status)) continue;
    for (const channel of gapChannels(row.symbol, channels, concepts)) {
      const count = row.counts[channel] ?? 0;
      if (count < GAP_THRESHOLD) gaps.push({ symbol: row.symbol, channel, count });
    }
  }
  gaps.sort(
    (a, b) =>
      a.count - b.count || compare(a.symbol, b.symbol) || compare(a.channel, b.channel),
  );
  return gaps;
}

// A pipe inside a cell ends the cell, and a line break ends the row. A note
// carries either one, so both are neutralized here.
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

function tableRow(cells: string[]): string {
  return `| ${cells.map(escapeCell).join(' | ')} |`;
}

function table(headers: string[], rows: string[][]): string[] {
  const lines = [tableRow(headers), `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(tableRow(row));
  return lines;
}

function speciesTable(data: ReportData): string[] {
  const headers = ['Symbol', 'Status', 'Reason', ...data.channels];
  const rows = data.species.map((row) => [
    row.symbol,
    row.status,
    row.reason ?? '',
    ...data.channels.map((channel) => String(row.counts[channel] ?? 0)),
  ]);
  return table(headers, rows);
}

function countRows(data: ReportData): string[][] {
  const rows: string[][] = [];
  const bySource = data.counts.candidates_by_source;
  for (const source of Object.keys(bySource).sort()) {
    rows.push([`candidates_${source}`, String(bySource[source])]);
  }
  const byKind = data.counts.verdicts_by_kind;
  for (const kind of Object.keys(byKind).sort()) {
    rows.push([`verdicts_${kind}`, String(byKind[kind])]);
  }
  rows.push(['fetch_failures', String(data.counts.fetch_failures)]);
  rows.push(['stop_rule_fired', data.counts.stop_rule_fired ? 'yes' : 'no']);
  return rows;
}

export function renderReport(data: ReportData): string {
  const out: string[] = [`# Content run: ${data.run}`, ''];

  out.push('## Species', '');
  out.push(...speciesTable(data));
  out.push('');

  out.push('## Channel gaps', '');
  out.push(
    ...table(
      ['Symbol', 'Channel', 'Approved'],
      data.gaps.map((gap) => [gap.symbol, gap.channel, String(gap.count)]),
    ),
  );
  out.push('');

  out.push('## Units', '');
  out.push(
    ...table(
      ['Unit', 'Cards', 'Warning'],
      data.units.map((unit) => [unit.key, String(unit.cards), unit.warning ?? '']),
    ),
  );
  out.push('');

  out.push('## Escalations', '');
  if (data.escalations.length === 0) {
    out.push('No escalations.');
  } else {
    out.push(
      ...table(
        ['Image', 'Source', 'Case', 'Note'],
        data.escalations.map((row) => [
          `![](<${row.image_url}>)`,
          `[${row.target}](<${row.origin}>)`,
          row.case,
          row.note,
        ]),
      ),
    );
  }
  out.push('');

  out.push('## Run counts', '');
  out.push(...table(['Count', 'Value'], countRows(data)));

  return `${out.join('\n')}\n`;
}
