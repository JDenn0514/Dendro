/**
 * One spelling for a license url. iNat's table carries a trailing slash and Commons'
 * `LicenseUrl` field does not, so two sources would otherwise write two urls for one
 * license. A url that trims to nothing is absent.
 */
export function normalizeLicenseUrl(url: string | null): string | null {
  if (url === null) return null;
  const trimmed = url.trim();
  if (trimmed === '') return null;
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}
