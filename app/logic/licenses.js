import { sourceEntry } from './sources.js';

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

// The mark between the parts of a credit line. Commas separate the parts. A
// source whose entry in sources.js sets `semicolons`, VT Dendrology only, gets
// semicolons, because its author is a list of names. Pure.
export function creditMark(photo) {
  return sourceEntry(photo.source)?.semicolons ? ';' : ',';
}

// The four text parts of a credit line: the author, the source between its
// marks, the license, and the stop. `credit` in app/ui/plate.js prints the
// same text. Pure.
export function creditParts(photo) {
  const mark = creditMark(photo);
  return [photo.author, `${mark} ${photo.source}${mark} `, photo.license, '.'];
}
