// One species as a specimen sheet: the names, the plates, two display
// numerals, one paragraph, a short fact list, the cards, and the varieties.
import {
  cardId, conceptFor, varietyCardChannels, channelLabel
} from '../logic/content.js';
import { cardLevel, speciesLevel } from '../logic/progress.js';
import { daysBetween } from '../logic/scheduler.js';
import { numberWord, capitalize, displayName } from '../logic/words.js';
import { el } from '../ui/dom.js';
import { footNav, tick, trail, ramp, levelWord } from '../ui/chrome.js';
import { plate, credit } from '../ui/plate.js';
import { glyph, glyphIdFor, FALLBACK_GLYPH } from '../ui/glyphs.js';

// The crop each channel's plate gets. A plate with its own ground dissolves
// on four sides; a bright scan multiplies into the paper.
const PLATE_SHAPES = { leaf: 'pl-leaf', bark: 'pl-bark', fruit: 'pl-bark' };

function dueText(state, today) {
  if (!state || !state.due) return 'Not started';
  const days = daysBetween(today, state.due);
  if (days <= 0) return 'Due now';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${numberWord(days)} days`;
}

// An absent field drops its whole row, so an optional field needs no guard.
function fact(list, term, value) {
  if (value === undefined || value === null || value === '') return;
  list.append(el('dt', null, term));
  list.append(el('dd', null, String(value)));
}

function statusLine(record) {
  const parts = [capitalize(record.native_status)];
  if (record.section) {
    const genus = record.genus_common ? `${record.genus_common}s` : record.genus;
    parts.push(`Section ${record.section}, the ${genus}`);
  }
  return `${parts.join('. ')}.`;
}

// The page's own trail names the shape the species hangs from, which the foot
// cannot. With no leaf concept it names the progress overview instead.
function trailFor(content, record) {
  const bucket = record.concepts?.leaf;
  const concept = bucket ? conceptFor(content, 'leaf', bucket) : null;
  const parent = concept
    ? { text: concept.name, href: `#/progress/leaf/${bucket}` }
    : { text: 'Progress', href: '#/progress' };
  return trail([parent, { text: displayName(record) }]);
}

function cardRow(content, states, symbol, channel, today) {
  const card = content.cards[cardId('species', channel, symbol)];
  if (!card) return null;
  const state = states[card.id];
  const level = cardLevel(state);
  const row = el('div', 'card-row');
  const left = el('span');
  left.append(el('span', 'cn', capitalize(channelLabel(channel))));
  left.append(levelWord(level));
  left.append(el('span', 'lvn', `level ${level} of 4`));
  row.append(left);
  const right = el('span', 'rt');
  right.append(ramp(level, { large: true }));
  right.append(el('span', 'due', dueText(state, today)));
  row.append(right);
  return row;
}

function plateSection(content, symbol, channel, imageBase, record) {
  const section = el('div', 'sec');
  section.append(tick());
  section.append(el('h3', 'sec-h', capitalize(channelLabel(channel))));
  const card = content.cards[cardId('species', channel, symbol)];
  const photo = card?.photos[0] ?? null;
  // A retired species collects nothing more, so "yet" would promise a plate
  // that is not coming.
  if (!photo) {
    section.append(el('p', 'fact-line', record.retired
      ? `No ${channelLabel(channel)} plate was collected.`
      : `No ${channelLabel(channel)} plate is collected yet.`));
    return section;
  }
  section.append(plate(photo, {
    image_base: imageBase,
    alt: `${displayName(record)}, ${channelLabel(channel)}`,
    shape: PLATE_SHAPES[channel] ?? 'pl-bark',
    bleed: true,
    soft: true,
    mono: channel === 'bark'
  }));
  section.append(credit(photo));
  return section;
}

export function render(root, ctx) {
  const { content, store, symbol, today, image_base: imageBase } = ctx;
  const record = content.species[symbol];
  if (!record) {
    root.append(trail([{ text: 'Progress', href: '#/progress' }, { text: 'Unknown' }]));
    root.append(el('h1', 'display', 'Unknown species'));
    root.append(el('p', 'where2', `The content holds no record for ${symbol}.`));
    root.append(footNav('progress'));
    return;
  }
  const states = store.readCards();

  root.append(trailFor(content, record));

  const title = el('div', 'sp-title');
  title.append(el('h1', 'display', displayName(record)));
  title.append(el('p', 'sci', record.scientific));
  title.append(el('p', 'det2', statusLine(record)));
  root.append(title);

  // A retired species keeps its record and its facts. It has no cards, so
  // every card row and plate below reads as a fact and not an error.
  if (record.retired) {
    root.append(el('p', 'note',
      `Retired: ${record.retired_reason} (${record.retired_at})`));
  }

  // The hero plate is the first channel that carries a photo. Every other
  // channel gets its own section below.
  const heroChannel = content.channels.find((channel) => {
    const card = content.cards[cardId('species', channel, symbol)];
    return Boolean(card?.photos[0]);
  }) ?? null;
  if (heroChannel) {
    const photo = content.cards[cardId('species', heroChannel, symbol)].photos[0];
    const figure = plate(photo, {
      image_base: imageBase,
      alt: `${displayName(record)}, ${channelLabel(heroChannel)}`,
      shape: PLATE_SHAPES[heroChannel] ?? 'pl-leaf',
      bleed: true,
      soft: true
    });
    // The sheet holds the hero plate clear of the title.
    figure.classList.add('sp-hero');
    root.append(figure);
    root.append(credit(photo, `${capitalize(channelLabel(heroChannel))}.`));
  }

  if (record.height_ft || record.elevation_ft) {
    const spans = el('div', 'spans');
    if (record.height_ft) {
      const cell = el('div');
      cell.append(el('b', null, `${record.height_ft[0]}–${record.height_ft[1]}`));
      cell.append(el('span', null, 'feet tall'));
      spans.append(cell);
    }
    if (record.elevation_ft) {
      const cell = el('div');
      cell.append(el('b', null,
        `${record.elevation_ft[0].toLocaleString('en-US')}–`
        + `${record.elevation_ft[1].toLocaleString('en-US')}`));
      cell.append(el('span', null, 'feet elevation'));
      spans.append(cell);
    }
    root.append(spans);
  }

  const prose = [record.range?.text, record.habitat].filter(Boolean).join('. ');
  if (prose) root.append(el('p', 'sp-prose', `${prose}.`));

  const facts = el('dl', 'facts');
  const native = record.range?.states ?? [];
  if (native.length) {
    fact(facts, 'native in', `${numberWord(native.length)} states`);
  }
  if ((record.planted_states ?? []).length) {
    fact(facts, 'planted in', record.planted_states.join(', '));
  }
  for (const channel of content.channels) {
    const bucket = record.concepts?.[channel];
    if (!bucket) continue;
    const concept = conceptFor(content, channel, bucket);
    fact(facts, channelLabel(channel), (concept?.name ?? bucket).toLowerCase());
  }
  fact(facts, 'arrangement', record.arrangement);
  fact(facts, 'family', record.family);
  fact(facts, 'Audubon', record.audubon_name);
  fact(facts, 'symbol', symbol);
  root.append(facts);

  const cards = el('div', 'sec');
  cards.append(tick());
  cards.append(el('h3', 'sec-h', 'Your cards'));
  let anyCard = false;
  for (const channel of content.channels) {
    const row = cardRow(content, states, symbol, channel, today);
    if (row) { cards.append(row); anyCard = true; }
  }
  if (!anyCard) {
    cards.append(el('p', 'fact-line', record.retired
      ? 'This species is retired and carries no card.'
      : 'This species carries no card yet.'));
  } else {
    cards.append(el('p', 'fact-line',
      `Overall level ${speciesLevel(symbol, content, states)} of 4, `
      + 'the lowest of the cards above.'));
  }
  root.append(cards);

  for (const channel of content.channels) {
    if (channel === heroChannel) continue;
    root.append(plateSection(content, symbol, channel, imageBase, record));
  }

  const varieties = el('div', 'sec');
  varieties.append(tick());
  varieties.append(el('h3', 'sec-h', 'Varieties'));
  const known = record.varieties ?? [];
  if (known.length === 0) {
    varieties.append(el('p', 'fact-line',
      'No varieties are recognized for this species.'));
  } else {
    const list = el('div', 'splist');
    for (const variety of known) {
      const channels = varietyCardChannels(content, symbol, variety.key);
      const line = el('div', 'spx');
      const card = channels.length
        ? content.cards[cardId('variety', channels[0], variety.key)]
        : null;
      line.append(card
        ? glyph(glyphIdFor(card, content), cardLevel(states[card.id]), 's26')
        : glyph(FALLBACK_GLYPH, 0, 's26'));
      const names = el('span', 'sn', variety.name);
      line.append(names);
      line.append(el('span', 'due', channels.length
        ? `card on ${channels.join(', ')}`
        : 'no card'));
      list.append(line);
      // Most varieties carry no note. An empty paragraph would print a blank
      // line and take the last row's baseline with it.
      if (typeof variety.note === 'string' && variety.note !== '') {
        list.append(el('p', 'secname', variety.note));
      }
    }
    varieties.append(list);
  }
  root.append(varieties);

  root.append(footNav('progress'));
}
