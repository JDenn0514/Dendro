/**
 * Text helpers for the HTML pages that the photo sources read: Trees and Shrubs Online,
 * wildflower.org, and the saved Kew POWO gallery. Each page is plain server-rendered HTML,
 * so no DOM library is needed.
 */

// One entry for each named reference that the saved pages use. A name that is not in this
// table stays as it is.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  copy: '©',
  reg: '®',
  deg: '°',
  times: '×',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
};

const ENTITY = /&([a-zA-Z]+);|&#(\d+);|&#[xX]([0-9a-fA-F]+);/g;

/**
 * Decodes each character reference once. One pass never reads a replacement again, so
 * `&amp;lt;` gives the text `&lt;`, not `<`.
 */
export function decodeEntities(text: string): string {
  return text.replace(
    ENTITY,
    (match: string, name: string | undefined, dec: string | undefined, hex: string | undefined) => {
      if (name !== undefined) return NAMED_ENTITIES[name] ?? match;
      const code = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? '', 16);
      try {
        return String.fromCodePoint(code);
      } catch {
        // A code point out of range stays as it was.
        return match;
      }
    },
  );
}

/**
 * The text of an HTML fragment. The tags go first, then each reference is decoded once, then
 * each run of white space becomes one space.
 */
export function htmlText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export interface HtmlTag {
  /** The attribute values as written, with no reference decoded. A bare attribute gives ''. */
  attrs: Record<string, string>;
  /** The index of `<` in the page. */
  start: number;
  /** The index after `>`. */
  end: number;
}

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*"([^"]*)")?/g;

/**
 * Every opening tag of one element whose attribute values are all in double quotes. A quoted
 * value can hold `<` and `>`, which a plain `<[^>]*>` scan cuts. A tag with an unquoted or a
 * single-quoted value is not returned.
 */
export function openTags(html: string, name: string): HtmlTag[] {
  const pattern = new RegExp(
    `<${name}((?:\\s+[^\\s"'<>/=]+(?:\\s*=\\s*"[^"]*")?)*)\\s*/?>`,
    'gi',
  );
  const tags: HtmlTag[] = [];
  for (const match of html.matchAll(pattern)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[1].matchAll(ATTRIBUTE)) attrs[attr[1].toLowerCase()] = attr[2] ?? '';
    const start = match.index ?? 0;
    tags.push({ attrs, start, end: start + match[0].length });
  }
  return tags;
}
