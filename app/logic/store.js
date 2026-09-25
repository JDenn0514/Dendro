// Owns the four localStorage keys. Pure apart from the injected storage object.
import { daysBetween } from './scheduler.js';

export const STORE_VERSION = 1;
export const LOG_CAP = 5000;
export const EXPORT_PROMPT_DAYS = 30;

export const KEYS = {
  cards: 'dendro_cards',
  log: 'dendro_log',
  settings: 'dendro_settings',
  missing_edges: 'dendro_missing_edges'
};

export const TEXT_SIZES = ['smaller', 'small', 'standard', 'large', 'largest'];

export function defaultSettings() {
  return {
    version: STORE_VERSION,
    session_size: 20,
    new_per_day: 10,
    last_export: null,
    // The name of a text size step. `standard` leaves the root size alone.
    text_size: 'standard',
    // The unit keys the user left unfolded on a channel lessons page. `null`
    // means the user has folded nothing yet, so the default rule applies.
    open_units: null
  };
}

function cleanTextSize(value, fallback) {
  return TEXT_SIZES.includes(value) ? value : fallback;
}

function cleanOpenUnits(value, fallback) {
  if (value === null) return null;
  if (Array.isArray(value) && value.every((key) => typeof key === 'string')) return value;
  return fallback;
}

function emptyPayload(key) {
  if (key === KEYS.cards) return { version: STORE_VERSION, cards: {} };
  if (key === KEYS.log) return { version: STORE_VERSION, rows: [] };
  if (key === KEYS.settings) return defaultSettings();
  return { version: STORE_VERSION, edges: [] };
}

export const MIGRATIONS = {
  0: (key, payload) => {
    if (key !== KEYS.cards) return { ...payload, version: 1 };
    const cards = {};
    for (const [id, state] of Object.entries(payload.cards ?? {})) {
      cards[id] = { tier: 'mc4', tier_passes: 0, ...state };
    }
    return { version: 1, cards };
  }
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// The one count rule for session_size and new_per_day. The settings screen
// imports it, so the screen and the store cannot drift apart: an earlier copy
// in the screen used parseInt and turned 2.5 into a valid 2.
export function isCount(value) {
  return Number.isInteger(value) && value >= 1;
}

export function sectionError(key, section) {
  if (!isPlainObject(section)) return `The ${key} section is not an object.`;
  if ((section.version ?? 0) > STORE_VERSION) {
    return `The ${key} section says version ${section.version}. This app reads version ${STORE_VERSION}.`;
  }
  if (key === KEYS.cards && !isPlainObject(section.cards)) {
    return 'The dendro_cards section has no cards object.';
  }
  if (key === KEYS.log && !Array.isArray(section.rows)) {
    return 'The dendro_log section has no rows array.';
  }
  if (key === KEYS.missing_edges && !Array.isArray(section.edges)) {
    return 'The dendro_missing_edges section has no edges array.';
  }
  if (key === KEYS.settings && !(isCount(section.session_size) && isCount(section.new_per_day))) {
    return 'The dendro_settings section needs session_size and new_per_day of 1 or more.';
  }
  return null;
}

export function migrateSection(key, section) {
  let payload = section;
  let version = payload.version ?? 0;
  while (version < STORE_VERSION && MIGRATIONS[version]) {
    payload = MIGRATIONS[version](key, payload);
    version = payload.version;
  }
  return payload;
}

export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); }
  };
}

export function createStore(storage) {
  let available = true;
  let newerVersion = false;
  try {
    storage.setItem('dendro_probe', '1');
    storage.removeItem('dendro_probe');
  } catch {
    available = false;
  }

  // The newer-version state is a fact about the stored data, not about what the
  // app has read so far. Boot checks the four keys once, so the banner appears
  // before the first screen renders. This scan reads only: it writes nothing,
  // migrates nothing, and copies no corrupt text aside.
  function scanVersions() {
    if (!available) return;
    for (const key of Object.values(KEYS)) {
      let text = null;
      try {
        text = storage.getItem(key);
      } catch {
        return;
      }
      if (!text) continue;
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        continue;
      }
      if (isPlainObject(payload) && (payload.version ?? 0) > STORE_VERSION) newerVersion = true;
    }
  }
  scanVersions();

  // Text that does not parse is copied aside once, so a user can send the file in.
  function keepCorrupt(key, text) {
    try {
      if (storage.getItem(`${key}_corrupt`) === null) storage.setItem(`${key}_corrupt`, text);
    } catch {
      available = false;
    }
  }

  function read(key) {
    if (!available) return emptyPayload(key);
    let text = null;
    try {
      text = storage.getItem(key);
    } catch {
      return emptyPayload(key);
    }
    if (!text) return emptyPayload(key);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      keepCorrupt(key, text);
      return emptyPayload(key);
    }
    if (!isPlainObject(payload)) return emptyPayload(key);
    if ((payload.version ?? 0) > STORE_VERSION) {
      newerVersion = true;
      return payload;
    }
    const migrated = migrateSection(key, payload);
    if (migrated !== payload) write(key, migrated);
    return migrated;
  }

  function write(key, payload) {
    if (!available || newerVersion) return;
    try {
      storage.setItem(key, JSON.stringify({ ...payload, version: STORE_VERSION }));
    } catch {
      available = false;
    }
  }

  const api = {
    get available() { return available; },

    get newer_version() { return newerVersion; },

    readCards() { return read(KEYS.cards).cards ?? {}; },

    writeCard(cardId, state) {
      const payload = read(KEYS.cards);
      payload.cards = { ...(payload.cards ?? {}), [cardId]: state };
      write(KEYS.cards, payload);
    },

    readLog() { return read(KEYS.log).rows ?? []; },

    replaceLog(rows) { write(KEYS.log, { version: STORE_VERSION, rows: rows.slice(-LOG_CAP) }); },

    appendLog(entry) {
      const rows = api.readLog();
      rows.push(entry);
      api.replaceLog(rows);
    },

    readSettings() {
      const defaults = defaultSettings();
      const settings = { ...defaults, ...read(KEYS.settings) };
      // Storage can hold a value from a hand edit or an older build. Hold the floor.
      for (const field of ['session_size', 'new_per_day']) {
        if (!isCount(settings[field])) settings[field] = defaults[field];
      }
      settings.text_size = cleanTextSize(settings.text_size, defaults.text_size);
      settings.open_units = cleanOpenUnits(settings.open_units, defaults.open_units);
      return settings;
    },

    writeSettings(patch) {
      const current = api.readSettings();
      const next = { ...current, ...patch };
      for (const field of ['session_size', 'new_per_day']) {
        if (!isCount(next[field])) next[field] = current[field];
      }
      next.text_size = cleanTextSize(next.text_size, current.text_size);
      next.open_units = cleanOpenUnits(next.open_units, current.open_units);
      write(KEYS.settings, next);
      return next;
    },

    readMissingEdges() { return read(KEYS.missing_edges).edges ?? []; },

    recordMissingEdge(edge) {
      const [a, b] = [edge.a, edge.b].sort();
      const edges = api.readMissingEdges();
      const found = edges.find((e) => e.a === a && e.b === b && e.channel === edge.channel);
      if (found) found.count += 1;
      else edges.push({ a, b, channel: edge.channel, count: 1 });
      write(KEYS.missing_edges, { version: STORE_VERSION, edges });
    },

    exportBlob(today) {
      const payload = {
        version: STORE_VERSION,
        exported_at: today,
        [KEYS.cards]: read(KEYS.cards),
        [KEYS.log]: read(KEYS.log),
        [KEYS.settings]: api.readSettings(),
        [KEYS.missing_edges]: read(KEYS.missing_edges)
      };
      return { filename: `dendro-progress-${today}.json`, json: JSON.stringify(payload, null, 2) };
    },

    importBlob(text) {
      // A blocked write must not report success. Import is how a user recovers.
      if (!available) {
        return { ok: false, errors: ['This browser is not storing your progress.'] };
      }
      if (newerVersion) {
        return {
          ok: false,
          errors: ['Your stored data comes from a newer version of this app, so the import stops and leaves that data alone.']
        };
      }
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        return { ok: false, errors: ['The file is not valid JSON.'] };
      }
      const errors = [];
      if (!isPlainObject(payload)) {
        return { ok: false, errors: ['The file holds no export object.'] };
      }
      if (payload.version !== STORE_VERSION) {
        errors.push(`The file says version ${payload.version}. This app reads version ${STORE_VERSION}.`);
      }
      const sections = {};
      for (const key of Object.values(KEYS)) {
        if (payload[key] === undefined) {
          errors.push(`The file has no ${key} section.`);
          continue;
        }
        const error = sectionError(key, payload[key]);
        if (error) errors.push(error);
        else sections[key] = migrateSection(key, payload[key]);
      }
      if (errors.length) return { ok: false, errors };
      for (const key of Object.values(KEYS)) write(key, sections[key]);
      return { ok: true, errors: [] };
    },

    // Reset is the only recovery path a user has. It clears the corrupt copies
    // and the newer-version flag as well, so writing works again afterwards.
    // Without that, every later write is silently dropped.
    reset() {
      if (!available) return;
      for (const key of Object.values(KEYS)) {
        try {
          storage.removeItem(key);
          storage.removeItem(`${key}_corrupt`);
        } catch {
          available = false;
        }
      }
      newerVersion = false;
    },

    shouldPromptExport(today) {
      const last = api.readSettings().last_export;
      if (!last) return true;
      return daysBetween(last, today) >= EXPORT_PROMPT_DAYS;
    },

    markExported(today) { api.writeSettings({ last_export: today }); }
  };

  return api;
}
