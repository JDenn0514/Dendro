// The photo sources. A credit names its source by the short `source` value
// that the manifest row carries. The Sources screen prints the full name, the
// site, and a note on the terms. Every `source` value in the manifest needs an
// entry here, and tests/sources.test.js checks that. Pure.
const PER_PHOTO = 'Each photo carries its own licence, shown in its credit.';

// `semicolons`: the credit puts semicolons between its parts. VT Dendrology
// credits name four photographers, so commas alone hide where the names stop.
// Every other credit keeps commas.
export const SOURCES = [
  {
    source: 'VT Dendrology',
    id: 'vt-dendrology',
    name: 'Virginia Tech Dendrology, Department of Forest Resources and Environmental Conservation, Virginia Tech',
    url: 'https://dendro.cnre.vt.edu/dendrology/',
    terms: 'Photos used with permission, for non-commercial use only. The photographers keep the copyright.',
    semicolons: true
  },
  {
    source: 'Lady Bird Johnson Wildflower Center',
    id: 'wildflower-center',
    name: 'Lady Bird Johnson Wildflower Center, The University of Texas at Austin',
    url: 'https://www.wildflower.org/gallery/',
    terms: 'Photos used with permission, for non-commercial use only.',
    semicolons: false
  },
  {
    source: 'Wikimedia Commons',
    id: 'wikimedia-commons',
    name: 'Wikimedia Commons, Wikimedia Foundation',
    url: 'https://commons.wikimedia.org/',
    terms: PER_PHOTO,
    semicolons: false
  },
  {
    source: 'iNaturalist',
    id: 'inaturalist',
    name: 'iNaturalist',
    url: 'https://www.inaturalist.org/',
    terms: PER_PHOTO,
    semicolons: false
  },
  {
    source: 'Bioimages',
    id: 'bioimages',
    name: 'Bioimages, Vanderbilt University',
    url: 'https://bioimages.vanderbilt.edu/',
    terms: PER_PHOTO,
    semicolons: false
  },
  {
    source: 'Trees and Shrubs Online',
    id: 'trees-and-shrubs-online',
    name: 'Trees and Shrubs Online, International Dendrology Society',
    url: 'https://www.treesandshrubsonline.org/',
    terms: PER_PHOTO,
    semicolons: false
  },
  {
    source: 'USDA PLANTS Database',
    id: 'usda-plants',
    name: 'PLANTS Database, Natural Resources Conservation Service, US Department of Agriculture',
    url: 'https://plants.usda.gov/',
    terms: PER_PHOTO,
    semicolons: false
  },
  {
    source: 'Plants of the World Online (Kew)',
    id: 'powo-kew',
    name: 'Plants of the World Online, Royal Botanic Gardens, Kew',
    url: 'https://powo.science.kew.org/',
    terms: PER_PHOTO,
    semicolons: false
  }
];

const BY_SOURCE = new Map(SOURCES.map((entry) => [entry.source, entry]));

// The entry of a short source name, or null when the table has none.
export function sourceEntry(source) {
  return BY_SOURCE.get(source) ?? null;
}

// The link from a credit to the entry on the Sources screen, or null.
export function sourceHref(source) {
  const entry = sourceEntry(source);
  return entry ? `#/sources?at=${entry.id}` : null;
}
