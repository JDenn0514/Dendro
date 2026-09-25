// Counts as words, for the sentences on home and progress. Pure.

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen'
];

const TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety'
];

// Above ninety-nine a word is longer than the figure it stands for, so the
// sentence prints the figure instead.
export function numberWord(count) {
  if (!Number.isInteger(count) || count < 0 || count > 99) return String(count);
  if (count < 20) return ONES[count];
  const tens = TENS[Math.floor(count / 10)];
  const ones = count % 10;
  return ones === 0 ? tens : `${tens}-${ONES[ones]}`;
}

export function capitalize(text) {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

// The content set holds a common name the way a flora does: lowercase unless
// a part of the name is a proper noun, so `silver maple` sits beside
// `Norway maple`. A heading, a button, or the start of a sentence prints the
// first letter capital. The content files keep the botanical form; every
// display position goes through here. A missing record prints nothing, so a
// caller can fall back to the symbol.
export function displayName(record) {
  const name = record?.common?.[0];
  return typeof name === 'string' ? capitalize(name) : '';
}

export function plural(word, count = 2) {
  if (count === 1) return word;
  if (/(s|x|z|ch|sh)$/u.test(word)) return `${word}es`;
  if (/[^aeiou]y$/u.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}
