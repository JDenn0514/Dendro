import { licenseAllowed } from './candidates.ts';

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

const CC_LICENSE =
  /^https?:\/\/(?:www\.)?creativecommons\.org\/licenses\/(by|by-sa|by-nd|by-nc|by-nc-sa|by-nc-nd)\/(\d+(?:\.\d+)?)(?:\/([a-z]{2}))?\/?$/i;
const CC_ZERO = /^https?:\/\/(?:www\.)?creativecommons\.org\/publicdomain\/zero\/(\d+(?:\.\d+)?)\/?$/i;
const CC_MARK = /^https?:\/\/(?:www\.)?creativecommons\.org\/publicdomain\/mark\/(\d+(?:\.\d+)?)\/?$/i;

/**
 * The label of a Creative Commons url: the family and the version, and the country code of a
 * ported licence. Any other url gives null. The label does not admit a row by itself.
 * `licenseAllowed` still rejects an NC or ND label.
 */
export function licenseLabelFromUrl(url: string | null): string | null {
  if (url === null) return null;
  const text = url.trim();
  const license = CC_LICENSE.exec(text);
  if (license !== null) {
    const port = license[3] === undefined ? '' : ` ${license[3].toUpperCase()}`;
    return `CC ${license[1].toUpperCase()} ${license[2]}${port}`;
  }
  const zero = CC_ZERO.exec(text);
  if (zero !== null) return `CC0 ${zero[1]}`;
  const mark = CC_MARK.exec(text);
  if (mark !== null) return `Public Domain Mark ${mark[1]}`;
  return null;
}

export interface LicensePermission {
  /** The exact licence text of a row that rests on this permission. */
  label: string;
  /** The origin hosts that the permission covers. */
  hosts: string[];
  /** The date of the owner ruling, YYYY-MM-DD. */
  granted: string;
  scope: string;
  /** The repo file that records the permission. */
  record: string;
}

/**
 * Written permissions that take the place of a licence on the allowlist. Owner rulings:
 * wildflower.org on 2026-09-25, Virginia Tech Dendrology on 2026-09-26. The two share one
 * label, so a search of the manifest for the label finds every image that rests on either.
 */
export const LICENSE_PERMISSIONS: LicensePermission[] = [
  {
    label: 'used with permission, non-commercial',
    hosts: ['www.wildflower.org'],
    granted: '2026-09-25',
    scope: 'non-commercial',
    record: 'docs/decisions/2026-09-25-wildflower-permission.md',
  },
  {
    label: 'used with permission, non-commercial',
    hosts: ['dendro.cnre.vt.edu'],
    granted: '2026-09-26',
    scope: 'non-commercial',
    record: 'docs/decisions/2026-09-26-vt-dendrology-photo-permission.md',
  },
];

/**
 * True when the allowlist admits the licence, or when the licence is a permission label, word
 * for word, and the origin's host is one that the permission covers. An origin that is not a
 * url gets no permission.
 */
export function licenseAllowedAt(license: string, origin: string): boolean {
  if (licenseAllowed(license)) return true;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  return LICENSE_PERMISSIONS.some(
    (permission) => permission.label === license && permission.hosts.includes(host),
  );
}
