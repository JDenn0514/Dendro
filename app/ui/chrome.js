// The printed furniture: the running foot, the trail, the printer's tick, the
// five level squares, and the level word sized by level.
import { el, link } from './dom.js';
import { LEVEL_NAMES } from '../logic/progress.js';

export const FOOT_ITEMS = [
  { key: 'home', text: 'Home', href: '#/' },
  { key: 'lessons', text: 'Lessons', href: '#/lessons' },
  { key: 'progress', text: 'Progress', href: '#/progress' }
];

// A printed foot, not a tab bar: three words, a hairline above, and a 3px
// moss rule under the word you are on. The pusher in front of it holds the
// foot at the bottom of a short page and 36px clear of a long one.
export function footNav(current) {
  const frame = document.createDocumentFragment();
  frame.append(el('div', 'footpush'));
  const nav = el('nav', 'footnav');
  for (const item of FOOT_ITEMS) {
    const anchor = link(item.href, item.key === current ? 'on' : null);
    anchor.append(el('span', null, item.text));
    if (item.key === current) anchor.setAttribute('aria-current', 'page');
    nav.append(anchor);
  }
  frame.append(nav);
  return frame;
}

// The trail names a parent the foot cannot. The last part is the page itself
// and carries no link.
export function trail(parts) {
  const nav = el('nav', 'trail');
  parts.forEach((part, index) => {
    if (index > 0) nav.append(el('i'));
    if (part.href) nav.append(link(part.href, null, part.text));
    else nav.append(el('strong', null, part.text));
  });
  return nav;
}

// A short printer's tick marks a new section. It is not a full rule.
export function tick(className) {
  return el('div', className ? `tick ${className}` : 'tick');
}

// Five squares. A square fills when the level reaches it. Level 4 fills the
// fifth square too, so expert reads as full. A lost square is the outline the
// reveal prints on the level a card just fell from.
export function rampClasses(level, lost = false) {
  const filled = level >= 4 ? 5 : Math.max(0, level);
  const out = [];
  for (let i = 0; i < 5; i += 1) {
    if (i < filled) out.push(`f${Math.min(i + 1, 4)}`);
    else if (lost && i === filled) out.push('lost');
    else out.push('');
  }
  return out;
}

export function ramp(level, options = {}) {
  const classes = ['ramp'];
  if (options.large) classes.push('lg');
  if (options.dim) classes.push('dim');
  const node = el('span', classes.join(' '));
  node.setAttribute('aria-hidden', 'true');
  for (const fill of rampClasses(level, options.lost === true)) {
    node.append(el('b', fill || null));
  }
  return node;
}

// The level word, sized by the level it names. Type carries the reading, so
// the answer never rests on telling two greens apart.
export function levelWord(level) {
  const step = Math.max(0, Math.min(4, level));
  return el('span', `lvw l${step}`, LEVEL_NAMES[step]);
}
