import { inPlay } from '../../app/logic/content.js';

/**
 * The reason a held-back species carries in build.json and in the report. Its status is
 * `no_photos`, the status of any species with no live photo.
 */
export const HELD_BACK = 'held back: no photo and no confusion edge';

export interface HoldBackRow {
  hash: string;
  target: string;
  channel: string;
  retired?: boolean;
  difficulty?: string;
}

export interface HoldBackInput {
  symbol: string;
  /** True when the base ref's content/species.json holds the symbol. */
  published: boolean;
  manifest: HoldBackRow[];
  confusion: { a: string; b: string }[];
  units: Record<string, unknown>[];
}

/**
 * The app validator fails a live species with no live photo and no confusion edge. A new
 * species that no other file names stays out of species.json instead, so one thin species
 * does not stop the build. A published species never stays out: species.json never loses a
 * published record, so the validator decides. When another file names the species, the
 * build writes it and the validator decides too, because leaving it out would break that file.
 *
 * A live photo is the validator's own rule: a row on the symbol that is not retired and not
 * hard. A row on a variety key does not count. Owner ruling of 2026-10-09.
 */
export function isHeldBack(input: HoldBackInput): boolean {
  if (input.published) return false;
  const own = input.manifest.filter((row) => row.target === input.symbol);
  if (own.some((row) => inPlay(row))) return false;
  // The build retires a species whose every row is retired, and the validator passes it.
  if (own.length > 0 && own.every((row) => row.retired === true)) return false;
  if (input.confusion.some((edge) => edge.a === input.symbol || edge.b === input.symbol)) {
    return false;
  }
  return !input.units.some(
    (unit) => names(unit.include, input.symbol) || names(unit.exclude, input.symbol),
  );
}

/**
 * The rows the build drops for a held-back species. The validator fails a row whose target
 * is not in species.json. `targets` is the symbol and its variety keys. A row in the published
 * manifest stays. A retired row stays too: it stops a later build from uploading a taken-down
 * file again. Such a row still stops the build, and the run owner fixes it by hand.
 */
export function heldBackRows<T extends HoldBackRow>(
  manifest: T[],
  targets: Set<string>,
  publishedRows: HoldBackRow[],
): T[] {
  const published = new Set(publishedRows.map(rowKey));
  return manifest.filter(
    (row) => targets.has(row.target) && row.retired !== true && !published.has(rowKey(row)),
  );
}

function rowKey(row: HoldBackRow): string {
  return `${row.hash}|${row.target}|${row.channel}`;
}

function names(list: unknown, symbol: string): boolean {
  return Array.isArray(list) && list.includes(symbol);
}
