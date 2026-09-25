// Progress: the finding, the legend, then three rungs per channel.
// Every number comes from app/logic/progress.js.
import { channelLabel } from '../logic/content.js';
import { dueCardIds } from '../logic/session.js';
import {
  LEVEL_NAMES, channelRungs, channelClaim,
  leadingConcept, overallFinding, overallTally
} from '../logic/progress.js';
import { numberWord, capitalize } from '../logic/words.js';
import { el, link } from '../ui/dom.js';
import { footNav, tick, levelWord } from '../ui/chrome.js';
import { glyph, glyphIdFor, conceptGlyph, FALLBACK_GLYPH } from '../ui/glyphs.js';

// The glyph size each rung's band uses. A deeper rung holds more cards, so
// its marks are smaller and the three bands still fit one column.
const BAND_SIZES = { concept: 's32', group: 's28', species: 's24' };

// The leading card of a rung: the one that stands highest. A tie goes to the
// first in the band, so the mark never flickers.
function leadingRow(rung) {
  if (rung.cards.length === 0) return null;
  let best = 0;
  for (let i = 1; i < rung.cards.length; i += 1) {
    if (rung.cards[i].level > rung.cards[best].level) best = i;
  }
  return rung.cards[best];
}

function markOf(content, row) {
  const card = row ? content.cards[row.id] : null;
  return card ? glyphIdFor(card, content) : FALLBACK_GLYPH;
}

// The species rung's own mark. `glyphIdFor` gives a species card the genus
// leaf, which is right on a card and wrong on a stack: the sheet in front
// would carry the same mark as the ghost 6 px behind it. So the leading
// species is drawn as the shape it sits in on this channel.
function speciesMark(content, channel, row) {
  if (!row) return FALLBACK_GLYPH;
  const bucket = content.species[row.key]?.concepts?.[channel];
  return conceptGlyph(channel, bucket) ?? markOf(content, row);
}

// The sheet stack. The sheets behind are pressed and out of ink, so only
// their edge reads, and the depth of the stack is the depth of the rung.
function sheetStack(content, channel, rungs, kind, level) {
  const stack = el('span', 'rmk');
  stack.setAttribute('aria-hidden', 'true');
  const shapeId = markOf(content, leadingRow(rungs[0]));
  const genusId = markOf(content, leadingRow(rungs[1]));
  const speciesId = speciesMark(content, channel, leadingRow(rungs[2]));

  if (kind === 'concept') {
    stack.append(glyph(shapeId, level, 's40'));
    return stack;
  }
  if (kind === 'group') {
    const ghost = glyph(shapeId, 0, 's40', { ghost: true });
    ghost.classList.add('g1');
    stack.append(ghost);
    stack.append(glyph(genusId, level, 's40'));
    return stack;
  }
  const far = glyph(shapeId, 0, 's40', { ghost: true });
  far.classList.add('g2');
  const near = glyph(genusId, 0, 's40', { ghost: true });
  near.classList.add('g1');
  stack.append(far, near, glyph(speciesId, level, 's40'));
  return stack;
}

// One sentence a screen reader can hear in place of the band of marks.
function bandLabel(rung) {
  if (rung.total === 0) return `No ${rung.name} cards yet.`;
  const parts = rung.counts
    .map((count, level) => ({ count, level }))
    .filter((part) => part.count > 0)
    .map((part) => `${numberWord(part.count)} ${LEVEL_NAMES[part.level]}`);
  return `${capitalize(numberWord(rung.total))} `
    + `${rung.total === 1 ? 'card' : 'cards'}: ${parts.join(', ')}.`;
}

// The band of a rung's own cards. A species band is cut into its genera, so
// the parent a card hangs from reads off the gaps.
function band(content, rung) {
  const row = el('div', 'band');
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', bandLabel(rung));
  const size = BAND_SIZES[rung.kind];
  if (rung.kind !== 'species') {
    for (const card of rung.cards) {
      row.append(glyph(glyphIdFor(content.cards[card.id], content), card.level, size));
    }
    return row;
  }
  let group = null;
  let genus = null;
  for (const card of rung.cards) {
    if (card.genus !== genus) {
      genus = card.genus;
      group = el('span', 'grp');
      row.append(group);
    }
    group.append(glyph(glyphIdFor(content.cards[card.id], content), card.level, size));
  }
  return row;
}

function waterline(share) {
  const line = el('div', 'wline');
  line.setAttribute('aria-hidden', 'true');
  const fill = el('b');
  fill.style.width = `${Math.round(share * 1000) / 10}%`;
  line.append(fill);
  return line;
}

function rungRow(content, channel, rungs, rung) {
  const row = el('div', 'rung');
  row.append(sheetStack(content, channel, rungs, rung.kind, rung.level));
  const body = el('span');
  body.append(el('span', 'cn', rung.name));
  body.append(levelWord(rung.level));
  body.append(el('span', 'figs', `${rung.at_familiar} of ${rung.total}`));
  row.append(body);
  return row;
}

function channelBlock(content, states, today, channel) {
  const block = el('section', 'chblock');
  block.append(tick());
  const head = el('div', 'cbh');
  head.append(el('h3', null, capitalize(channelLabel(channel))));
  const due = dueCardIds({ content, states, focus: channel, today }).length;
  head.append(el('span', 'due',
    `${numberWord(due)} ${due === 1 ? 'card' : 'cards'} due`));
  block.append(head);
  block.append(el('p', 'claim', channelClaim(content, states, channel)));

  // The three rungs are built once and handed to every row, so the stacks all
  // read the same three leading cards.
  const rungs = channelRungs(content, states, channel);
  for (const rung of rungs) {
    block.append(rungRow(content, channel, rungs, rung));
    block.append(band(content, rung));
    block.append(waterline(rung.share));
  }

  const leading = leadingConcept(content, states, channel);
  if (leading) {
    block.append(link(`#/progress/${channel}/${leading.key}`, 'opens',
      `Open ${leading.name.toLowerCase()}`));
  }
  return block;
}

export function render(root, ctx) {
  const { content, store, today } = ctx;
  const states = store.readCards();

  const finding = el('div', 'finding bleed');
  finding.append(tick());
  finding.append(el('h1', 'h2', overallFinding(content, states)));
  const tally = overallTally(content, states);
  finding.append(el('p', 'state',
    `${capitalize(numberWord(tally.shapes.at))} of `
    + `${numberWord(tally.shapes.total)} shapes are familiar or better, `
    + `${numberWord(tally.genera.at)} of ${numberWord(tally.genera.total)} genera, `
    + `${numberWord(tally.species.at)} of ${numberWord(tally.species.total)} species.`));
  root.append(finding);

  const legend = el('div', 'legend');
  legend.setAttribute('aria-hidden', 'true');
  for (let level = 0; level < LEVEL_NAMES.length; level += 1) {
    const cell = el('div');
    cell.append(glyph('lf-oak', level, 's24'));
    cell.append(el('span', null, LEVEL_NAMES[level]));
    legend.append(cell);
  }
  root.append(legend);

  for (const channel of content.channels) {
    root.append(channelBlock(content, states, today, channel));
  }

  root.append(footNav('progress'));
}
