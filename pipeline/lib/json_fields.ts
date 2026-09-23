/**
 * The four readers for a value out of a parsed JSON body. Each one returns null when the
 * value is not of the type, so a caller writes one `=== null` check per field. An empty
 * string counts as absent, because every field these parsers read is a url, a title, a
 * name, or a code, and an empty one of those is no value at all.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}
