/**
 * The reason a held-back species carries in build.json and in the report. Its status is
 * `no_photos`, the status of any species with no live photo.
 */
export const HELD_BACK = 'held back: no photo and no confusion edge';

export interface HoldBackInput {
  symbol: string;
  /** The symbol and its variety keys. A manifest row on any of them names the species. */
  targets: Set<string>;
  /** True when the base ref's content/species.json holds the symbol. */
  published: boolean;
  manifest: { target: string }[];
  confusion: { a: string; b: string }[];
  units: Record<string, unknown>[];
}

/**
 * The app validator fails a live species with no live photo and no confusion edge. A new
 * species that no other file names stays out of species.json instead, so one thin species
 * does not stop the build. A published species never stays out: species.json never loses a
 * published record, so the validator decides. When another file names the species, the
 * build writes it and the validator decides too, because leaving it out would break that file.
 */
export function isHeldBack(input: HoldBackInput): boolean {
  if (input.published) return false;
  if (input.manifest.some((row) => input.targets.has(row.target))) return false;
  if (input.confusion.some((edge) => edge.a === input.symbol || edge.b === input.symbol)) {
    return false;
  }
  return !input.units.some(
    (unit) => names(unit.include, input.symbol) || names(unit.exclude, input.symbol),
  );
}

function names(list: unknown, symbol: string): boolean {
  return Array.isArray(list) && list.includes(symbol);
}
