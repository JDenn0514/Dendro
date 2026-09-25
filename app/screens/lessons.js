// Lessons: what is next, then one door per channel.
import { channelLabel, unitFor } from '../logic/content.js';
import { dueCardIds, recommendUnit } from '../logic/session.js';
import {
  channelLessons, defaultOpenUnits, unitLevel, unitOrdinal, unitTree
} from '../logic/lessons.js';
import { numberWord, capitalize } from '../logic/words.js';
import { el, link } from '../ui/dom.js';
import { footNav, tick, ramp, trail } from '../ui/chrome.js';
import { unitThumbColumn } from '../ui/thumb.js';
import { FALLBACK_GLYPH, glyph, glyphIdFor } from '../ui/glyphs.js';

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

  // One module, two routes. A channel that is not in the content renders a
  // panel with a way out, not a blank page.
  if (ctx.channel) {
    if (!content.channels.includes(ctx.channel)) {
      root.append(trail([
        { text: 'Lessons', href: '#/lessons' },
        { text: 'Unknown' }
      ]));
      root.append(el('h1', 'display', 'Unknown channel'));
      root.append(el('p', 'where2',
        `The content has no channel named ${ctx.channel}.`));
      root.append(footLinks());
      root.append(footNav('lessons'));
      return;
    }
    renderChannel(root, ctx);
    return;
  }

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

/* ---------- lessons, one channel ---------- */

const CHEVRON_PATH = 'M9 4 L17 12 L9 20';

function chevron() {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '2.6');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', CHEVRON_PATH);
  node.append(path);
  return node;
}

// The way back to the three channels. `#app` is a flex column, so a bare
// anchor would take the whole width. One row holds it to its own words.
function footLinks() {
  const links = el('div', 'links');
  links.append(link('#/lessons', 'foot', 'All three channels'));
  return links;
}

// The fold list is one global set of unit keys, because a unit key is unique
// across channels. `null` in storage means the user has folded nothing yet,
// so the default rule decides, for every channel at once.
function openSet(content, states, store) {
  const stored = store.readSettings().open_units;
  if (stored !== null) return new Set(stored);
  return new Set(content.channels.flatMap(
    (channel) => defaultOpenUnits(content, states, channel)
  ));
}

// The meta line under a unit name. Only a folded row adds what is inside, so
// the fold never hides a fact without leaving the count behind. An unfolded
// row prints the children themselves, so the count would only repeat them.
function metaLine(node, folded) {
  const line = el('span', 'ust');
  const cards = `${numberWord(node.new_count)} new `
    + `${node.new_count === 1 ? 'card' : 'cards'}`;
  if (!node.open) {
    line.append(document.createTextNode(node.opens_with
      ? `${cards}. Opens with ${node.opens_with}.`
      : `${cards}. Closed.`));
  } else if (node.new_count === 0) {
    const done = el('span', 'done-sq');
    done.setAttribute('aria-hidden', 'true');
    line.append(done);
    line.append(document.createTextNode(
      `complete, ${numberWord(node.card_count)} `
      + `${node.card_count === 1 ? 'card' : 'cards'}`));
  } else if (node.next_up) {
    line.append(document.createTextNode(`${cards}, next up`));
  } else {
    line.append(document.createTextNode(cards));
  }
  if (folded && node.inside_count > 0) {
    const inside = `${numberWord(node.inside_count)} `
      + `${node.inside_count === 1 ? 'unit' : 'units'} inside`
      + (node.holds_next ? `, ${numberWord(1)} next up` : '');
    // A closed row ends its line with a full stop of its own, so the tail
    // joins with a space and a capital and the line never prints two stops.
    const stopped = line.textContent.trimEnd().endsWith('.');
    line.append(el('span', 'usum',
      stopped ? ` ${capitalize(inside)}` : `. ${inside}`));
  }
  return line;
}

function unitRow(content, node, folded, onToggle) {
  const row = el('div', 'urow');
  const card = content.cards[(content.unit_cards[node.key] ?? [])[0]];
  row.append(card
    ? glyph(glyphIdFor(card, content), node.rollup, 's30')
    : glyph(FALLBACK_GLYPH, node.rollup, 's30'));

  const body = el('span', 'ubody');
  body.append(el('span', 'un', node.name));
  body.append(metaLine(node, folded));
  body.append(ramp(node.rollup, { dim: !node.open }));
  row.append(body);

  const controls = el('span', 'uctl');
  if (node.open) {
    const start = link(
      `#/session?focus=${node.channel}&unit=${node.key}`,
      node.next_up ? 'startb solid' : 'startb',
      'Start'
    );
    controls.append(start);
  } else {
    controls.append(el('span', 'shutnote', 'shut'));
  }

  if (node.children.length > 0) {
    const button = el('button', 'chev');
    button.type = 'button';
    button.setAttribute('aria-expanded', folded ? 'false' : 'true');
    button.setAttribute('aria-controls', `kids-${node.key}`);
    button.setAttribute('aria-label',
      `${folded ? 'Expand' : 'Collapse'} ${node.name}`);
    button.append(chevron());
    button.addEventListener('click', () => onToggle(node, button));
    controls.append(button);
  } else {
    const pad = el('span', 'chevpad');
    pad.setAttribute('aria-hidden', 'true');
    controls.append(pad);
  }
  row.append(controls);
  return row;
}

function unitNodeEl(content, node, open, onToggle) {
  const folded = node.children.length > 0 && !open.has(node.key);
  const box = el('div', 'node');
  if (!node.open) box.classList.add('shut');
  if (node.next_up) box.classList.add('now');
  if (folded) box.classList.add('folded');
  box.append(unitRow(content, node, folded, onToggle));
  if (node.children.length > 0) {
    const kids = el('div', 'kids');
    kids.id = `kids-${node.key}`;
    for (const child of node.children) {
      kids.append(unitNodeEl(content, child, open, onToggle));
    }
    box.append(kids);
  }
  return box;
}

function renderChannel(root, ctx) {
  const { content, store, channel } = ctx;
  const states = store.readCards();
  const open = openSet(content, states, store);

  const onToggle = (node, button) => {
    const wasOpen = button.getAttribute('aria-expanded') === 'true';
    if (wasOpen) open.delete(node.key);
    else open.add(node.key);
    button.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
    button.setAttribute('aria-label',
      `${wasOpen ? 'Expand' : 'Collapse'} ${node.name}`);
    button.closest('.node').classList.toggle('folded', wasOpen);
    // The meta line prints what is inside only while the row is folded, so it
    // is built again with the fold rather than left saying something untrue.
    // After the toggle the row is folded exactly when it was open before.
    button.closest('.urow').querySelector('.ust').replaceWith(metaLine(node, wasOpen));
    store.writeSettings({ open_units: [...open] });
    if (!store.available) ctx.banner(ctx.storage_banner);
  };

  root.append(trail([
    { text: 'Lessons', href: '#/lessons' },
    { text: capitalize(channelLabel(channel)) }
  ]));

  const head = el('div', 'pagehead');
  head.append(el('h1', 'display', capitalize(channelLabel(channel))));
  const summary = channelLessons(content, states, channel);
  head.append(el('p', 'where2',
    `${capitalize(numberWord(summary.total_count))} `
    + `${summary.total_count === 1 ? 'unit' : 'units'} on one stem, three deep.`));
  root.append(head);

  const tree = el('div', 'tree');
  for (const node of unitTree(content, states, channel)) {
    tree.append(unitNodeEl(content, node, open, onToggle));
  }
  root.append(tree);

  root.append(footLinks());
  root.append(footNav('lessons'));
}
