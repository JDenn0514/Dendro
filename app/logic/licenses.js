// The deed page for each license name the manifest uses. The list is the
// distinct values in content/images/manifest.json on 2026-09-25. A name
// with no entry prints as plain text: public domain has no deed page, and a
// new name waits until someone adds it here. Pure.
const CC = 'https://creativecommons.org/';

export const LICENSE_URLS = {
  'CC0': `${CC}publicdomain/zero/1.0/`,
  'CC0 1.0': `${CC}publicdomain/zero/1.0/`,
  'CC BY 2.0': `${CC}licenses/by/2.0/`,
  'CC BY 2.5': `${CC}licenses/by/2.5/`,
  'CC BY 3.0': `${CC}licenses/by/3.0/`,
  'CC BY 3.0 us': `${CC}licenses/by/3.0/us/`,
  'CC BY 4.0': `${CC}licenses/by/4.0/`,
  'CC BY-SA 2.0': `${CC}licenses/by-sa/2.0/`,
  'CC BY-SA 2.5': `${CC}licenses/by-sa/2.5/`,
  'CC BY-SA 3.0': `${CC}licenses/by-sa/3.0/`,
  'CC BY-SA 4.0': `${CC}licenses/by-sa/4.0/`
};

export function licenseUrl(name) {
  if (typeof name !== 'string' || !Object.hasOwn(LICENSE_URLS, name)) return null;
  return LICENSE_URLS[name];
}

// The four text parts of a credit line: the author, the source between its
// separators, the license, and the stop. Commas separate the parts. An author
// can hold a comma: a list of names, as for the Virginia Tech photographers,
// or a place, as in "Bruce Kirchoff from Greensboro, NC, USA". Then commas
// hide where the author stops, so semicolons separate the parts. Pure.
export function creditParts(photo) {
  const mark = String(photo.author).includes(',') ? ';' : ',';
  return [photo.author, `${mark} ${photo.source}${mark} `, photo.license, '.'];
}
