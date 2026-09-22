// Home: channel buttons, the recommendation, the unit list, the placement link.
import { channelLabel, unitFor } from '../logic/content.js';
import {
  dueCardIds, newCardCapDone, recommendUnit, unitsForFocus
} from '../logic/session.js';
import { gateStatus, unseenCount } from '../logic/progress.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function render(root, ctx) {
  const { content, store, today, params } = ctx;
  const focus = params.get('focus') ?? 'all';
  const states = store.readCards();
  const log = store.readLog();
  const userSettings = store.readSettings();

  root.append(el('h1', null, 'Dendro'));

  const row = el('div', 'channel-row');
  const choices = [
    { key: 'all', name: 'All channels' },
    ...content.channels.map((c) => ({ key: c, name: channelLabel(c) }))
  ];
  for (const choice of choices) {
    const count = dueCardIds({ content, states, focus: choice.key, today }).length;
    const button = el('button', choice.key === focus ? 'channel is-active' : 'channel',
      `${choice.name} (${count} due)`);
    button.addEventListener('click', () => ctx.navigate(`/?focus=${choice.key}`));
    row.append(button);
  }
  root.append(row);

  const recommendation = recommendUnit({ content, states, focus });
  const box = el('section', 'card');
  if (recommendation.unit_key) {
    const unit = unitFor(content, recommendation.unit_key);
    box.append(el('h2', null, `Next up: ${unit.name}`));
    const start = el('button', 'primary', 'Start');
    start.addEventListener('click',
      () => ctx.navigate(`/session?focus=${focus}&unit=${unit.key}`));
    box.append(start);
  } else if (recommendation.next_closed) {
    const next = recommendation.next_closed;
    const parent = unitFor(content, next.parent_key);
    box.append(el('h2', null, 'No unit is open yet'));
    box.append(el('p', null,
      `${next.unit_name} opens when ${next.needed_cards} more card(s) in ${parent.name} reach level 2.`));
  } else {
    box.append(el('h2', null, 'Every unit in this focus is started'));
  }
  root.append(box);

  if (newCardCapDone({ content, states, log, settings: userSettings, focus, today })) {
    root.append(el('p', 'notice',
      `Nothing is due and today's ${userSettings.new_per_day} new cards are done. Come back tomorrow.`));
  }

  const list = el('section', 'unit-list');
  list.append(el('h2', null, 'Units'));
  for (const unit of unitsForFocus(content, focus)) {
    const ids = content.unit_cards[unit.key] ?? [];
    const unseen = unseenCount(ids, states);
    const gate = gateStatus(unit.key, content, states);
    const line = el('div', 'unit-row');
    line.append(el('span', 'unit-name', unit.name));
    line.append(el('span', 'unit-meta',
      `${unseen} of ${ids.length} not started`));
    line.append(el('span', gate.open ? 'pill pill-open' : 'pill pill-closed',
      gate.open ? 'open' : 'closed'));
    const start = el('button', null, 'Start');
    start.addEventListener('click',
      () => ctx.navigate(`/session?focus=${unit.channel}&unit=${unit.key}`));
    line.append(start);
    list.append(line);
  }
  root.append(list);

  const paragraph = el('p', 'placement-link');
  const link = el('a', null, 'Take the placement test');
  link.href = '#/placement';
  paragraph.append(link);
  root.append(paragraph);
  root.append(el('p', 'attribution',
    'The placement test sets a level on cards you have not studied yet. A retake leaves every card you have already studied as it is.'));
}
