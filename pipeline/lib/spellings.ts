/**
 * Other spellings of a PLANTS accepted name, keyed by PLANTS symbol. A source can spell a
 * name another way, and the identity check compares names exactly. Each entry is the same
 * name spelled another way, never another species. Each entry needs a reason.
 */
const SPELLINGS: Record<string, readonly string[]> = {
  // iNaturalist spells sand post oak "Quercus margaretiae". PLANTS has "Quercus margaretta".
  QUMA13: ['Quercus margaretiae'],
};

/** The other spellings of the accepted name of a symbol, or [] for a symbol with none. */
export function spellingVariants(symbol: string): string[] {
  return Object.hasOwn(SPELLINGS, symbol) ? [...SPELLINGS[symbol]] : [];
}

/** Every symbol in the table, for the tests. */
export function spellingSymbols(): string[] {
  return Object.keys(SPELLINGS);
}
