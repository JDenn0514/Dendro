// Boots the app, routes between screens, holds no state.
import { loadContent, CDN_BASE } from './logic/content.js';
import { createStore } from './logic/store.js';
import { todayString } from './logic/session.js';
import * as home from './screens/home.js';
import * as session from './screens/session.js';
import * as progress from './screens/progress.js';
import * as species from './screens/species.js';
import * as settings from './screens/settings.js';
import { injectSprite } from './ui/glyphs.js';
import { applyTextSize } from './ui/textsize.js';

const CONTENT_FILES = {
  species: 'species.json',
  concepts: 'concepts.json',
  confusion: 'confusion.json',
  units: 'units.json',
  manifest: 'images/manifest.json'
};

const DEAD_STORAGE = {
  getItem() { throw new Error('no storage'); },
  setItem() { throw new Error('no storage'); },
  removeItem() { throw new Error('no storage'); }
};

const STORAGE_BANNER =
  'Progress is not saved. This browser blocks local storage. Export from Settings to keep a copy.';

const NEWER_VERSION_BANNER =
  'Progress is not saved. The stored progress comes from a newer version of this app, and this older version leaves it alone. Open the newer version, or reset from Settings to study in this one.';

function showBanner(text) {
  const node = document.getElementById('banner');
  node.hidden = false;
  node.textContent = text;
}

function contentDir() {
  const query = new URLSearchParams(window.location.search);
  return query.get('content') === 'dev' ? 'content_dev/' : 'content/';
}

// The live images sit in object storage behind the CDN. The fixture images sit
// in the repo, so the app runs offline against the fixture.
function imageBaseFor(dir) {
  return dir === 'content_dev/' ? 'content_dev/images/' : CDN_BASE;
}

function parseRoute() {
  const raw = window.location.hash.slice(1) || '/';
  const [path, query] = raw.split('?');
  return {
    parts: path.split('/').filter(Boolean),
    params: new URLSearchParams(query ?? '')
  };
}

// A content failure must not lock the user out of Settings, where the export
// button rescues the progress that is already stored.
function showError(title, lines) {
  const root = document.getElementById('app');
  root.textContent = '';
  const box = document.createElement('section');
  box.className = 'error';
  const heading = document.createElement('h1');
  heading.textContent = title;
  box.append(heading);
  const list = document.createElement('ul');
  for (const line of lines) {
    const item = document.createElement('li');
    item.textContent = line;
    list.append(item);
  }
  box.append(list);
  const settingsLink = document.createElement('a');
  settingsLink.className = 'placement';
  settingsLink.href = '#/settings';
  settingsLink.textContent = 'Settings';
  const homeLink = document.createElement('a');
  homeLink.className = 'placement';
  homeLink.href = '#/';
  homeLink.textContent = 'Home';
  box.append(settingsLink, homeLink);
  root.append(box);
}

// A thrown value is not always an Error, so read the message only when it has one.
function errorText(error) {
  return error && error.message ? error.message : String(error);
}

async function fetchContent(dir) {
  const raw = {};
  for (const [field, file] of Object.entries(CONTENT_FILES)) {
    const path = `${dir}${file}`;
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    try {
      raw[field] = await response.json();
    } catch (error) {
      throw new Error(`${path} is not valid JSON: ${error.message}`);
    }
  }
  return raw;
}

async function start() {
  const dir = contentDir();
  const imageBase = imageBaseFor(dir);

  let storage = DEAD_STORAGE;
  try {
    storage = window.localStorage ?? DEAD_STORAGE;
  } catch {
    storage = DEAD_STORAGE;
  }
  const store = createStore(storage);

  if (!store.available) showBanner(STORAGE_BANNER);
  else if (store.newer_version) showBanner(NEWER_VERSION_BANNER);

  // The root size goes on before the sprite fetch and the first render, so
  // nothing the boot screen shows (the nav, the loading line) ever paints at
  // the phone's size and then resizes.
  applyTextSize(store.readSettings().text_size);

  // The sprite holds every mark the screens draw. It goes in before the first
  // render and never throws, so a failed fetch costs the marks and nothing else.
  await injectSprite();

  // A content failure is kept rather than thrown away. Settings still opens;
  // every other route shows the failure again instead of a blank page.
  let content = null;
  let contentFailure = null;
  let raw = null;
  try {
    raw = await fetchContent(dir);
  } catch (error) {
    contentFailure = { title: 'Content failed to load', lines: [errorText(error)] };
  }
  if (raw) {
    const result = loadContent(raw);
    if (result.ok) {
      content = result.content;
    } else {
      contentFailure = {
        title: 'Content failed to validate',
        lines: result.errors.map((e) => `${e.file}: ${errorText(e)}`)
      };
    }
  }

  // The screen that is leaving gets to stop its own pending work first.
  let teardown = null;

  function route() {
    // A screen that throws on its way out must not hold the router. The next
    // screen still renders, and the console keeps the error.
    try {
      if (teardown) teardown();
    } catch (error) {
      console.error('The screen failed to tear down.', error);
    }
    teardown = null;
    const { parts, params } = parseRoute();
    const root = document.getElementById('app');
    root.textContent = '';
    // Settings is the one screen that runs without content.
    if (contentFailure && parts[0] !== 'settings') {
      showError(contentFailure.title, contentFailure.lines);
      return;
    }
    const ctx = {
      content,
      store,
      image_base: imageBase,
      today: todayString(),
      params,
      navigate: (hash) => { window.location.hash = hash; },
      banner: showBanner,
      storage_banner: STORAGE_BANNER,
      newer_version_banner: NEWER_VERSION_BANNER
    };
    // The root is already clear, so a screen that throws would leave a blank
    // page. The error panel goes there instead.
    let leave;
    try {
      if (parts[0] === 'session') leave = session.render(root, { ...ctx, mode: 'review' });
      else if (parts[0] === 'placement') leave = session.render(root, { ...ctx, mode: 'placement' });
      else if (parts[0] === 'progress') leave = progress.render(root, ctx);
      else if (parts[0] === 'species') leave = species.render(root, { ...ctx, symbol: parts[1] });
      else if (parts[0] === 'settings') leave = settings.render(root, ctx);
      else leave = home.render(root, ctx);
    } catch (error) {
      console.error('The screen failed to open.', error);
      showError('The screen failed to open', [errorText(error)]);
      return;
    }
    teardown = typeof leave === 'function' ? leave : null;
  }

  window.addEventListener('hashchange', route);
  route();
}

// A throw inside a screen would otherwise leave the placeholder text on screen.
start().catch((error) => showError('The app failed to start', [errorText(error)]));
