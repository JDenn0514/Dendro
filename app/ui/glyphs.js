// The pressed-object marks: one sprite of <symbol> elements, one <use> per
// mark, and the maps that pick which symbol a card gets. The level is a class
// on the <svg>, so the fill and the outline both follow it.
//
// The map functions touch no DOM, so `node --test` covers them.

export const SPRITE_PATH = 'app/ui/sprite.svg';
export const SPRITE_ID = 'dendro-sprite';

const SVG_NS = 'http://www.w3.org/2000/svg';

// The glyph sizes the sheet defines. A mark is a picture at a fixed size, so
// these are px classes and never follow the root size.
export const GLYPH_SIZES = ['s20', 's24', 's26', 's28', 's30', 's32', 's34', 's40', 's86'];

// One symbol per concept key, per channel.
export const CHANNEL_GLYPHS = {
  leaf: {
    needles: 'lf-needle',
    scale_like: 'lf-scale',
    simple_entire: 'lf-entire',
    simple_toothed: 'lf-tooth',
    simple_lobed: 'lf-oak',
    pinnately_compound: 'lf-pinnate',
    palmately_compound: 'lf-palmate',
    fan_strap: 'lf-fan'
  },
  bark: {
    smooth: 'bk-smooth',
    furrowed: 'bk-furrowed',
    plated: 'bk-plated',
    shaggy: 'bk-shaggy',
    papery: 'bk-papery',
    warty: 'bk-warty'
  },
  fruit: {
    samara: 'fr-samara',
    acorn: 'fr-acorn',
    nut: 'fr-nut',
    pod: 'fr-pod',
    berry: 'fr-berry',
    capsule: 'fr-capsule',
    cone: 'fr-cone',
    ball: 'fr-ball'
  }
};

// A genus is a tree, not a channel, so a genus keeps one leaf on every
// channel. Add a row here when the content adds a genus.
export const GENUS_GLYPHS = {
  Quercus: 'lf-oak',
  Acer: 'lf-maple',
  Platanus: 'lf-plat'
};

export const FALLBACK_GLYPH = 'lf-entire';

export function conceptGlyph(channel, conceptKey) {
  return CHANNEL_GLYPHS[channel]?.[conceptKey] ?? null;
}

export function genusGlyph(genus, content) {
  const known = GENUS_GLYPHS[genus];
  if (known) return known;
  for (const record of Object.values(content.species ?? {})) {
    if (record.retired || record.genus !== genus) continue;
    const leaf = conceptGlyph('leaf', record.concepts?.leaf);
    if (leaf) return leaf;
  }
  return FALLBACK_GLYPH;
}

function genusOfVariety(content, varietyKey) {
  for (const record of Object.values(content.species ?? {})) {
    if ((record.varieties ?? []).some((variety) => variety.key === varietyKey)) {
      return record.genus;
    }
  }
  return null;
}

export function glyphIdFor(card, content) {
  if (card.kind === 'concept') {
    return conceptGlyph(card.channel, card.key) ?? FALLBACK_GLYPH;
  }
  if (card.kind === 'group') return genusGlyph(card.key, content);
  if (card.kind === 'species') {
    return genusGlyph(content.species[card.key]?.genus ?? null, content);
  }
  return genusGlyph(genusOfVariety(content, card.key), content);
}

// One mark. `level` fills it on the five-step ramp; `ghost` draws a pressed
// sheet lying behind another one.
export function glyph(id, level, sizeClass, options = {}) {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', '0 0 112 140');
  const fill = options.ghost ? 'gh' : `v${Math.max(0, Math.min(4, level))}`;
  node.setAttribute('class', `mk ${sizeClass} ${fill}`);
  node.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  node.append(use);
  return node;
}

// The sprite goes into the document once, so `<use href="#lf-oak">` resolves.
// An external file reference on <use> does not work in every browser, so the
// app fetches the file and injects it. A failure leaves the marks empty and
// every other part of the screen intact, so this never throws.
export async function injectSprite(path = SPRITE_PATH) {
  if (document.getElementById(SPRITE_ID)) return true;
  try {
    const response = await fetch(path);
    if (!response.ok) return false;
    const holder = document.createElement('div');
    holder.id = SPRITE_ID;
    holder.setAttribute('aria-hidden', 'true');
    holder.innerHTML = await response.text();
    document.body.prepend(holder);
    return true;
  } catch {
    return false;
  }
}
