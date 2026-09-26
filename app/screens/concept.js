// One shape: where it sits among its siblings, its own card, then every
// genus and species under it as a printed index.
import { cardId, channelLabel } from '../logic/content.js';
import { channelRung, conceptBreakdown } from '../logic/progress.js';
import { numberWord, capitalize, plural } from '../logic/words.js';
import { el, link } from '../ui/dom.js';
import { footNav, tick, trail, levelWord } from '../ui/chrome.js';
import { plate, credit } from '../ui/plate.js';
import { glyph, glyphIdFor, FALLBACK_GLYPH } from '../ui/glyphs.js';

// One line about the shape's own card, by level.
const SHAPE_NOTES = [
  'This shape is not started. It is the first thing to learn here.',
  'You have met this shape once. It comes back soon.',
  'You name this shape more often than not. The work left is below it.',
  'This shape is nearly yours. The work left is below it.',
  'You name this shape on sight. The work left is below it.'
];

function backLink() {
  const links = el('div', 'links');
  links.append(link('#/progress', 'foot', 'All three channels'));
  return links;
}

function notFound(root, message) {
  root.append(trail([{ text: 'Progress', href: '#/progress' }, { text: 'Unknown' }]));
  root.append(el('h1', 'display', 'Unknown shape'));
  root.append(el('p', 'where2', message));
  root.append(backLink());
  root.append(footNav('progress'));
}

// The bed of every shape on this channel, with the one you opened underlined.
// A shape with no card has no cell here, so the label says so rather than
// promise a mark the reader cannot find.
function siblingStrip(content, states, channel, conceptKey) {
  const rung = channelRung(content, states, channel, 'concept');
  const index = rung.cards.findIndex((card) => card.key === conceptKey);
  const strip = el('div', 'strip');
  strip.setAttribute('role', 'img');
  const bed = `The ${numberWord(rung.total)} ${channelLabel(channel)} `
    + plural('shape', rung.total);
  strip.setAttribute('aria-label', index < 0
    ? `${bed} that carry a card. This shape carries none, so no mark here is this one.`
    : `${bed}, with this one marked.`);
  for (const card of rung.cards) {
    const cell = el('span', card.key === conceptKey ? 'here' : null);
    cell.append(glyph(glyphIdFor(content.cards[card.id], content), card.level, 's32'));
    strip.append(cell);
  }
  return { strip, index, total: rung.total };
}

function shapeCard(content, channel, breakdown) {
  const panel = el('div', 'shapecard bleed');
  const card = content.cards[cardId('concept', channel, breakdown.concept.key)];
  panel.append(card
    ? glyph(glyphIdFor(card, content), breakdown.level, 's86')
    : glyph(FALLBACK_GLYPH, 0, 's86'));
  const body = el('span');
  body.append(levelWord(breakdown.level));
  body.append(el('span', 'lvn', breakdown.has_card
    ? `level ${breakdown.level} of 4`
      + (breakdown.due ? `, due ${breakdown.due}` : ', not scheduled')
    : 'no card on this shape yet'));
  body.append(el('span', 'lvx', breakdown.has_card
    ? SHAPE_NOTES[breakdown.level]
    : 'This shape has no photo pool, so it carries no card.'));
  panel.append(body);
  return panel;
}

// The species of one genus, as a printed index: no fill, no rail, one
// hairline baseline each, so the paper carries the list.
function speciesList(content, channel, rows) {
  const list = el('div', 'splist');
  for (const row of rows) {
    const line = link(`#/species/${row.symbol}`, 'spx');
    const card = content.cards[cardId('species', channel, row.symbol)];
    line.append(card
      ? glyph(glyphIdFor(card, content), row.level, 's26')
      : glyph(FALLBACK_GLYPH, row.level, 's26'));
    line.append(el('span', 'sn', capitalize(row.common)));
    line.append(levelWord(row.level));
    list.append(line);
  }
  return list;
}

function genusBlock(content, channel, breakdown, group) {
  const block = el('div', 'gengroup');
  block.append(tick());

  const head = el('h2', 'genhead');
  const stack = el('span', 'rmk');
  stack.setAttribute('aria-hidden', 'true');
  const shapeCardNode = content.cards[cardId('concept', channel, breakdown.concept.key)];
  const ghost = glyph(
    shapeCardNode ? glyphIdFor(shapeCardNode, content) : FALLBACK_GLYPH,
    0, 's40', { ghost: true }
  );
  ghost.classList.add('g1');
  stack.append(ghost);
  const genusCard = content.cards[cardId('group', channel, group.genus)];
  stack.append(genusCard
    ? glyph(glyphIdFor(genusCard, content), group.level, 's40')
    : glyph(FALLBACK_GLYPH, group.level, 's40'));
  head.append(stack);

  const names = el('span');
  names.append(el('span', 'gnm', capitalize(plural(group.genus_common))));
  names.append(el('span', 'gsci', group.genus));
  head.append(names);
  head.append(levelWord(group.level));
  block.append(head);

  // A genus with two or more sections prints a heading per section, so the
  // red oaks and the white oaks read as the two groups they are.
  const sections = [...new Set(group.species.map((row) => row.section))];
  if (sections.length < 2) {
    block.append(speciesList(content, channel, group.species));
    return block;
  }
  for (const section of sections) {
    const rows = group.species.filter((row) => row.section === section);
    block.append(el('h3', 'secname', section ? `section ${section}` : 'no section'));
    block.append(speciesList(content, channel, rows));
  }
  return block;
}

export function render(root, ctx) {
  const { content, store, channel, concept_key: conceptKey } = ctx;
  if (!content.channels.includes(channel)) {
    notFound(root, `The content has no channel named ${channel}.`);
    return;
  }
  const states = store.readCards();
  const breakdown = conceptBreakdown(content, states, channel, conceptKey);
  if (!breakdown) {
    notFound(root, `The ${channelLabel(channel)} channel has no shape named ${conceptKey}.`);
    return;
  }

  root.append(trail([
    { text: 'Progress', href: '#/progress' },
    { text: breakdown.concept.name }
  ]));

  const head = el('div', 'pagehead');
  head.append(el('h1', 'display', breakdown.concept.name));
  const speciesCount = breakdown.genera
    .reduce((count, group) => count + group.species.length, 0);
  head.append(el('p', 'where2',
    `A ${channelLabel(channel)} shape with ${numberWord(breakdown.genera.length)} `
    + `${breakdown.genera.length === 1 ? 'genus' : 'genera'} under it, and `
    + `${numberWord(speciesCount)} species under those.`));
  root.append(head);

  const card = content.cards[cardId('concept', channel, conceptKey)];
  const photo = card?.photos[0] ?? null;
  if (photo) {
    root.append(plate(photo, {
      image_base: ctx.image_base,
      alt: `A ${breakdown.concept.name.toLowerCase()} ${channelLabel(channel)}`,
      shape: 'pl-shape',
      bleed: true
    }));
    root.append(credit(photo, `${breakdown.concept.name}, ${channelLabel(channel)}.`));
  }

  // A shape with no photo pool carries no card, so the strip has no cell for
  // it and `index` comes back -1. "Shape 0 of 1" would be a lie, so the
  // caption says what is true instead.
  const siblings = siblingStrip(content, states, channel, conceptKey);
  root.append(siblings.strip);
  root.append(el('p', 'cap strip-cap', siblings.index < 0
    ? 'This shape carries no card yet.'
    : `Shape ${siblings.index + 1} of ${siblings.total} on the `
      + `${channelLabel(channel)} channel.`));

  root.append(shapeCard(content, channel, breakdown));

  for (const group of breakdown.genera) {
    root.append(genusBlock(content, channel, breakdown, group));
  }
  if (breakdown.genera.length === 0) {
    root.append(el('p', 'note', 'No species hangs off this shape yet.'));
  }

  root.append(backLink());
  root.append(footNav('progress'));
}
