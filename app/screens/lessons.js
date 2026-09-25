// Lessons: what is next, then one door per channel.
import { channelLabel, unitFor } from '../logic/content.js';
import { dueCardIds, recommendUnit } from '../logic/session.js';
import { channelLessons, unitLevel, unitOrdinal } from '../logic/lessons.js';
import { numberWord, capitalize } from '../logic/words.js';
import { el, link } from '../ui/dom.js';
import { footNav, tick, ramp } from '../ui/chrome.js';
import { unitThumbColumn } from '../ui/thumb.js';
import { glyph, glyphIdFor } from '../ui/glyphs.js';

// The row of outline leaves shows at most this many new cards, so the block
// keeps its size whatever the unit holds.
const NEW_LEAVES = 12;

const KEYLINE = 'Each square below is one unit: filled if you can start it '
  + 'now, outlined if it waits on its parent, ticked in moss if it is next.';

function newRow(content, unitKey, states) {
  const ids = (content.unit_cards[unitKey] ?? []).filter((id) => !states[id]);
  if (ids.length === 0) return null;
  const row = el('div', 'newrow');
  row.setAttribute('aria-hidden', 'true');
  for (const id of ids.slice(0, NEW_LEAVES)) {
    row.append(glyph(glyphIdFor(content.cards[id], content), 0, 's34'));
  }
  return row;
}

function nextBlock(root, ctx, states) {
  const { content } = ctx;
  const box = el('div', 'nextu');
  box.append(tick());
  const found = recommendUnit({ content, states, focus: 'all' });

  // Two different states. A closed unit waits on its parent; with no closed
  // unit left, every unit is started and there is nothing to open.
  if (!found.unit_key) {
    if (found.next_closed) {
      box.append(el('h1', 'display', 'Nothing is open'));
      box.append(el('p', 'why',
        `${found.next_closed.unit_name} opens when `
        + `${numberWord(found.next_closed.needed_cards)} more `
        + `${found.next_closed.needed_cards === 1 ? 'card' : 'cards'} reach familiar.`));
    } else {
      box.append(el('h1', 'display', 'Every unit is started'));
      box.append(el('p', 'why', 'Nothing in the content is waiting to open.'));
    }
    root.append(box);
    return;
  }

  const unit = unitFor(content, found.unit_key);
  const ids = content.unit_cards[unit.key] ?? [];
  const newCount = ids.filter((id) => !states[id]).length;

  const thumb = unitThumbColumn(content, unit.key, ctx.image_base);
  if (thumb) box.append(thumb);

  box.append(el('h1', 'display', unit.name));
  const parent = unit.parent ? unitFor(content, unit.parent) : null;
  box.append(el('p', 'why', parent
    ? `Unit ${unitOrdinal(unit.key, content)}, inside ${parent.name}.`
    : `Unit ${unitOrdinal(unit.key, content)}, the `
      + `${channelLabel(unit.channel)} shapes.`));

  const leaves = newRow(content, unit.key, states);
  if (leaves) {
    leaves.style.clear = 'both';
    box.append(leaves);
    box.append(el('p', 'cap newcap',
      `${capitalize(numberWord(newCount))} `
      + `${newCount === 1 ? 'card' : 'cards'} in this unit you have not met yet.`));
  }

  const level = unitLevel(unit.key, content, states);
  const rampLine = el('div', 'rampline');
  rampLine.append(ramp(level));
  rampLine.append(el('span', null, `Unit level ${level} of 4.`));
  box.append(rampLine);

  box.append(link(`#/session?focus=${unit.channel}&unit=${unit.key}`, 'btn', 'Start'));
  root.append(box);
}

function channelDoor(content, states, today, channel) {
  const summary = channelLessons(content, states, channel);
  const due = dueCardIds({ content, states, focus: channel, today }).length;
  const door = link(`#/lessons/${channel}`, 'chdoor');
  const head = el('span', 'cdh');
  head.append(el('span', 'dn', capitalize(channelLabel(channel))));
  // Every count on this screen is a word, so the door's counts are too.
  head.append(el('span', 'cdd',
    `${numberWord(due)} ${due === 1 ? 'card' : 'cards'} due, `
    + `${numberWord(summary.open_count)} of `
    + `${numberWord(summary.total_count)} units open`));
  door.append(head);

  const strip = el('span', 'ustrip');
  for (const depth of summary.depths) {
    strip.append(el('span', 'dn2', depth.name));
    const squares = el('span', 'sqs');
    if (depth.units.length === 0) {
      squares.append(el('span', 'none', 'none yet'));
    } else {
      for (const unit of depth.units) {
        const square = el('i', unit.open ? null : 'shut');
        if (unit.next_up) square.classList.add('next');
        squares.append(square);
      }
    }
    strip.append(squares);
  }
  door.append(strip);
  return door;
}

export function render(root, ctx) {
  const { content, store, today } = ctx;
  const states = store.readCards();

  nextBlock(root, ctx, states);
  root.append(el('p', 'keyline', KEYLINE));
  for (const channel of content.channels) {
    root.append(channelDoor(content, states, today, channel));
  }
  // One row, so the link keeps its own width and the rule under the words
  // stops where the words stop.
  const links = el('div', 'links');
  links.append(link('#/placement', 'placement', 'Take the placement test'));
  root.append(links);

  root.append(footNav('lessons'));
}
