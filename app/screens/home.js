// Home: the name, one sentence of state, the next unit, two doors, two links.
// Computes nothing: every number comes from a logic module.
import { channelLabel, unitFor, conceptFor } from '../logic/content.js';
import { dueCardIds, newCardCapDone, recommendUnit } from '../logic/session.js';
import { channelRung, leadingConcept } from '../logic/progress.js';
import { channelLessons, unitOrdinal, unitThumb } from '../logic/lessons.js';
import { numberWord, capitalize } from '../logic/words.js';
import { labelFor } from '../logic/question.js';
import { el, link } from '../ui/dom.js';
import { footNav, tick } from '../ui/chrome.js';
import { plate, credit } from '../ui/plate.js';
import { glyph, glyphIdFor } from '../ui/glyphs.js';

// The one line of copy the content does not carry.
const SUBTITLE = 'Trees of the Colorado Front Range.';

// A door shows at most this many unit squares per depth, so it stays a mark
// and not a second lessons page.
const DOOR_SQUARES = 8;

function stateSentence(content, states, today) {
  const total = dueCardIds({ content, states, focus: 'all', today }).length;
  const line = el('p', 'state1');
  if (total === 0) {
    line.append(el('b', null, 'No card'));
    line.append(document.createTextNode(' is due today.'));
    return line;
  }
  const parts = content.channels
    .map((channel) => ({
      channel,
      count: dueCardIds({ content, states, focus: channel, today }).length
    }))
    .filter((part) => part.count > 0)
    .map((part) => `${numberWord(part.count)} ${channelLabel(part.channel)}`);
  line.append(el('b', null, `${capitalize(numberWord(total))} ${total === 1 ? 'card' : 'cards'}`));
  line.append(document.createTextNode(
    ` ${total === 1 ? 'is' : 'are'} due today: ${parts.join(', ')}.`
  ));
  return line;
}

// One line about the unit. A level-1 unit holds the channel's shapes; every
// deeper unit holds the cards inside one shape.
function whyLine(content, unit, cardCount, newCount) {
  const ordinal = unitOrdinal(unit.key, content);
  const opening = `Unit ${ordinal}, ${numberWord(newCount)} new `
    + `${newCount === 1 ? 'card' : 'cards'}.`;
  if (unit.level === 1) {
    return `${opening} The ${numberWord(cardCount)} ${channelLabel(unit.channel)} shapes.`;
  }
  const concept = conceptFor(content, unit.channel, unit.bucket);
  const inside = concept ? concept.name : unit.bucket;
  return `${opening} ${capitalize(numberWord(cardCount))} `
    + `${cardCount === 1 ? 'card' : 'cards'} inside ${inside}, `
    + `quizzed by ${channelLabel(unit.channel)}.`;
}

// The small print beside the unit. `.wide` on both the column and the figure
// cuts the empty lower band off the scan, so the caption sits under the print.
function thumbFor(content, unitKey, imageBase) {
  const found = unitThumb(content, unitKey);
  if (!found) return null;
  const column = el('div', 'figcol wide');
  const { label } = labelFor(content, found.kind, found.channel, found.key);
  const figure = plate(found.photo, {
    image_base: imageBase,
    alt: `Pressed specimen, ${label}`,
    shape: 'pl-thumb',
    lift: true
  });
  figure.classList.add('wide');
  column.append(figure);
  // Every photo the app prints carries its credit, the 124 px thumb included.
  const count = (content.unit_cards[unitKey] ?? []).length;
  const caption = credit(found.photo, `${label}, one of the ${numberWord(count)}.`);
  // `plate-cap` stays on: a plate that fails to load removes the caption next
  // to it by that class, and a credit for a picture that is not there must go
  // with it.
  caption.classList.add('thumbcap');
  column.append(caption);
  return column;
}

function recommendation(root, ctx, states) {
  const { content, today } = ctx;
  const box = el('div', 'rec');
  box.append(tick());
  const found = recommendUnit({ content, states, focus: 'all' });

  if (found.unit_key) {
    const unit = unitFor(content, found.unit_key);
    const ids = content.unit_cards[unit.key] ?? [];
    const newCount = ids.filter((id) => !states[id]).length;
    const thumb = thumbFor(content, unit.key, ctx.image_base);
    if (thumb) box.append(thumb);
    box.append(el('h2', 'h2', unit.name));
    box.append(el('p', 'why', whyLine(content, unit, ids.length, newCount)));
    box.append(link(`#/session?focus=${unit.channel}&unit=${unit.key}`, 'btn', 'Start'));
    root.append(box);
    return;
  }

  if (found.next_closed) {
    const next = found.next_closed;
    const parent = unitFor(content, next.parent_key);
    box.append(el('h2', 'h2', 'Nothing is open yet'));
    box.append(el('p', 'why',
      `${next.unit_name} opens when ${numberWord(next.needed_cards)} more `
      + `${next.needed_cards === 1 ? 'card' : 'cards'} in ${parent.name} reach familiar.`));
    box.append(link('#/lessons', 'btn', 'Open Lessons'));
    root.append(box);
    return;
  }

  box.append(el('h2', 'h2', 'Every unit is started'));
  const dueCount = dueCardIds({ content, states, focus: 'all', today }).length;
  box.append(el('p', 'why', dueCount > 0
    ? `${capitalize(numberWord(dueCount))} ${dueCount === 1 ? 'card is' : 'cards are'} waiting for a review.`
    : 'Nothing is waiting. Come back tomorrow.'));
  if (dueCount > 0) box.append(link('#/session?focus=all', 'btn', 'Start'));
  root.append(box);
}

function lessonsDoor(content, states) {
  const door = link('#/lessons', 'door');
  const summaries = content.channels.map((channel) => channelLessons(content, states, channel));
  const thumb = el('span', 'dthumb');
  thumb.setAttribute('aria-hidden', 'true');
  for (const depth of [1, 2, 3]) {
    const row = el('span', 'dq');
    const units = summaries
      .flatMap((summary) => summary.depths.find((item) => item.level === depth).units)
      .slice(0, DOOR_SQUARES);
    for (const unit of units) {
      const square = el('i', unit.open ? null : 'shut');
      if (unit.next_up) square.classList.add('next');
      row.append(square);
    }
    thumb.append(row);
  }
  door.append(thumb);
  door.append(el('span', 'dn', 'Lessons'));
  const total = summaries.reduce((count, summary) => count + summary.total_count, 0);
  const open = summaries.reduce((count, summary) => count + summary.open_count, 0);
  door.append(el('span', 'dd',
    `${capitalize(numberWord(total))} units, three deep, `
    + `with ${numberWord(open)} open now.`));
  return door;
}

function progressDoor(content, states) {
  const door = link('#/progress', 'door');
  const thumb = el('span', 'dthumb');
  thumb.setAttribute('aria-hidden', 'true');
  for (const channel of content.channels) {
    const leading = leadingConcept(content, states, channel);
    const species = channelRung(content, states, channel, 'species');
    const row = el('span', 'dr');
    const card = leading ? content.cards[`concept:${channel}:${leading.key}`] : null;
    row.append(card
      ? glyph(glyphIdFor(card, content), leading.level, 's20')
      : glyph('lf-entire', 0, 's20'));
    const bar = el('em');
    const fill = el('b');
    fill.style.width = `${Math.round(species.share * 1000) / 10}%`;
    bar.append(fill);
    row.append(bar);
    thumb.append(row);
  }
  door.append(thumb);
  door.append(el('span', 'dn', 'Progress'));
  door.append(el('span', 'dd',
    'Every card you hold, kept apart by shape, genus, and species.'));
  return door;
}

export function render(root, ctx) {
  const { content, store, today } = ctx;
  const states = store.readCards();
  const log = store.readLog();
  const userSettings = store.readSettings();

  const masthead = el('div', 'masthead');
  masthead.append(el('h1', 'display', 'Dendro'));
  masthead.append(el('p', 'sub', SUBTITLE));
  masthead.append(el('div', 'mastrule'));
  root.append(masthead);

  root.append(stateSentence(content, states, today));

  if (newCardCapDone({ content, states, log, settings: userSettings, focus: 'all', today })) {
    root.append(el('p', 'note',
      `Nothing is due and today's ${userSettings.new_per_day} new cards are done. `
      + 'Come back tomorrow.'));
  }

  recommendation(root, ctx, states);

  const doors = el('div', 'doors');
  doors.append(lessonsDoor(content, states));
  doors.append(progressDoor(content, states));
  root.append(doors);

  // One row, so each link keeps its own width and its own rule under it.
  const links = el('div', 'links');
  links.append(link('#/placement', 'placement', 'Take the placement test'));
  links.append(link('#/settings', 'placement', 'Settings'));
  root.append(links);

  root.append(footNav('home'));
}
