// The photo sources: one section for each source, with its full name, the
// short name the credits print, the terms, and a link to its site. The table
// is in app/logic/sources.js. Like Settings, the screen opens with no content.
import { SOURCES } from '../logic/sources.js';
import { el, link } from '../ui/dom.js';
import { footNav, tick, trail } from '../ui/chrome.js';

function entryGroup(entry) {
  const group = el('div', 'setgroup');
  group.id = `source-${entry.id}`;
  group.append(tick());
  group.append(el('h2', 'sec-h', entry.name));
  group.append(el('p', 'sub2', `On a photo credit: ${entry.source}.`));
  group.append(el('p', 'sub2', entry.terms));
  const links = el('div', 'links');
  // The host is the link text, so each of the links on the page reads apart.
  const site = link(entry.url, 'foot', new URL(entry.url).hostname);
  site.target = '_blank';
  site.rel = 'noopener';
  links.append(site);
  group.append(links);
  return group;
}

// `?at=<id>` names the entry that a credit link opened. The screen scrolls to
// it.
export function render(root, ctx) {
  root.append(trail([
    { text: 'Home', href: '#/' },
    { text: 'Settings', href: '#/settings' },
    { text: 'Photo sources' }
  ]));

  const head = el('div', 'pagehead');
  head.append(el('h1', 'display', 'Photo sources'));
  head.append(el('p', 'where2',
    'Each photo credit names its source by a short name. Here is the full name '
    + 'of each source and the terms of its photos.'));
  root.append(head);

  for (const entry of SOURCES) root.append(entryGroup(entry));

  root.append(footNav(null));

  const at = ctx.params?.get('at');
  const target = at ? document.getElementById(`source-${at}`) : null;
  if (target) target.scrollIntoView();
}
