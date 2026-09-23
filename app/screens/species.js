// One species: facts, photos by channel, levels, next due dates, varieties.
import {
  cardId, conceptFor, varietyCardChannels, imageUrl
} from '../logic/content.js';
import { cardLevel, speciesLevel, LEVEL_NAMES } from '../logic/progress.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The author links to the photo's origin page, so the credit reaches the source.
function creditInto(node, photo) {
  if (photo.origin) {
    const link = el('a', null, photo.author);
    link.href = photo.origin;
    link.target = '_blank';
    link.rel = 'noopener';
    node.append(link);
  } else {
    node.append(document.createTextNode(photo.author));
  }
  node.append(document.createTextNode(`, ${photo.source}, ${photo.license}.`));
  return node;
}

// An absent field drops its whole row, so an optional field needs no guard here.
function fact(list, term, value) {
  if (value === undefined || value === null || value === '') return;
  list.append(el('dt', null, term));
  list.append(el('dd', null, String(value)));
}

export function render(root, ctx) {
  const { content, store, symbol, image_base: imageBase } = ctx;
  const record = content.species[symbol];
  if (!record) {
    root.append(el('h1', null, 'Unknown species'));
    root.append(el('p', null, `No record for ${symbol}.`));
    return;
  }
  const states = store.readCards();

  root.append(el('h1', null, record.common[0]));
  root.append(el('p', 'option-sub', record.scientific));
  root.append(el('p', null,
    `${symbol}. ${record.native_status}. Overall level ${speciesLevel(symbol, content, states)}.`));

  // A retired species keeps its record and its facts. It has no cards, so the
  // channel loop below renders no heading and no photo for it.
  if (record.retired) {
    root.append(el('p', 'notice',
      `Retired: ${record.retired_reason} (${record.retired_at})`));
  }

  const list = el('dl');
  fact(list, 'Range', record.range?.text);
  fact(list, 'States', (record.range?.states ?? []).join(', '));
  fact(list, 'Planted states', (record.planted_states ?? []).join(', '));
  // A species record may carry no elevation and no height, so guard each field first.
  if (record.elevation_ft) {
    fact(list, 'Elevation', `${record.elevation_ft[0]} to ${record.elevation_ft[1]} ft`);
  }
  if (record.height_ft) {
    fact(list, 'Height', `${record.height_ft[0]} to ${record.height_ft[1]} ft`);
  }
  fact(list, 'Habitat', record.habitat);
  fact(list, 'Audubon name', record.audubon_name);
  fact(list, 'Section', record.section);
  // `arrangement` is optional. The pipeline never writes it, so many records lack it.
  fact(list, 'Arrangement', record.arrangement);
  for (const [channel, bucket] of Object.entries(record.concepts ?? {})) {
    const concept = conceptFor(content, channel, bucket);
    fact(list, `${channel} type`, concept?.name ?? bucket);
  }
  root.append(list);

  for (const channel of content.channels) {
    const card = content.cards[cardId('species', channel, symbol)];
    if (!card) continue;
    root.append(el('h2', null, channel));
    const state = states[card.id];
    root.append(el('p', null,
      `Level ${cardLevel(state)}, ${LEVEL_NAMES[cardLevel(state)]}. Next due ${state?.due ?? 'not scheduled'}.`));
    const strip = el('div', 'photo-pair');
    for (const photo of card.photos) {
      const figure = el('figure');
      const img = document.createElement('img');
      img.className = 'photo';
      img.src = imageUrl(photo, imageBase);
      img.alt = `${record.common[0]} ${channel}`;
      figure.append(img);
      figure.append(creditInto(el('figcaption', 'attribution'), photo));
      strip.append(figure);
    }
    root.append(strip);
  }

  if ((record.varieties ?? []).length) {
    root.append(el('h2', null, 'Varieties'));
    const varieties = el('ul');
    for (const variety of record.varieties) {
      const channels = varietyCardChannels(content, symbol, variety.key);
      const status = channels.length ? `card on ${channels.join(', ')}` : 'no card';
      varieties.append(el('li', null, `${variety.name}. ${variety.note} (${status})`));
    }
    root.append(varieties);
  }
}
