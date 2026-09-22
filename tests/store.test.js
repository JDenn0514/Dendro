import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_VERSION, KEYS, LOG_CAP, defaultSettings, memoryStorage, createStore
} from '../app/logic/store.js';

function row(card, at) {
  return { card, at, day: at.slice(0, 10), grade: 'good', format: 'mc4', options: 4, elapsed_ms: 1200, answer: 'x' };
}

function goodBlob() {
  return JSON.stringify({
    version: 1,
    dendro_cards: { version: 1, cards: { 'species:ACPL:leaf': { interval: 2, tier: 'mc4', tier_passes: 1 } } },
    dendro_log: { version: 1, rows: [] },
    dendro_settings: defaultSettings(),
    dendro_missing_edges: { version: 1, edges: [] }
  });
}

test('a fresh store reports defaults and is available', () => {
  const store = createStore(memoryStorage());
  assert.equal(store.available, true);
  assert.equal(store.newer_version, false);
  assert.deepEqual(store.readCards(), {});
  assert.deepEqual(store.readLog(), []);
  assert.deepEqual(store.readSettings(), defaultSettings());
  assert.deepEqual(store.readMissingEdges(), []);
  assert.equal(STORE_VERSION, 1);
  assert.equal(LOG_CAP, 5000);
  assert.equal(KEYS.cards, 'dendro_cards');
});

test('each event writes right away', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.writeCard('species:QUGA:bark', { interval: 4, tier: 'mc4', tier_passes: 1 });
  store.appendLog(row('species:QUGA:bark', '2026-03-10T09:00:00Z'));
  assert.equal(JSON.parse(storage.getItem('dendro_cards')).cards['species:QUGA:bark'].interval, 4);
  assert.equal(JSON.parse(storage.getItem('dendro_log')).rows.length, 1);
});

test('the log cap drops the oldest row', () => {
  const store = createStore(memoryStorage());
  const rows = [];
  for (let i = 0; i < LOG_CAP; i += 1) rows.push(row(`c${i}`, '2026-03-10T09:00:00Z'));
  store.replaceLog(rows);
  store.appendLog(row('newest', '2026-03-11T09:00:00Z'));
  const log = store.readLog();
  assert.equal(log.length, LOG_CAP);
  assert.equal(log[0].card, 'c1');
  assert.equal(log[LOG_CAP - 1].card, 'newest');
});

test('unknown card IDs are preserved', () => {
  const storage = memoryStorage();
  storage.setItem('dendro_cards', JSON.stringify({
    version: 1, cards: { 'species:GONE:leaf': { interval: 9, tier: 'mc8', tier_passes: 0 } }
  }));
  const store = createStore(storage);
  store.writeCard('species:QUGA:leaf', { interval: 1, tier: 'mc4', tier_passes: 1 });
  assert.ok(store.readCards()['species:GONE:leaf']);
});

test('a missing edge is recorded once and counted', () => {
  const store = createStore(memoryStorage());
  store.recordMissingEdge({ a: 'ACPL', b: 'QUGA', channel: 'leaf' });
  store.recordMissingEdge({ a: 'ACPL', b: 'QUGA', channel: 'leaf' });
  store.recordMissingEdge({ a: 'ACPL', b: 'QUGA', channel: 'bark' });
  const edges = store.readMissingEdges();
  assert.equal(edges.length, 2);
  assert.equal(edges.find((e) => e.channel === 'leaf').count, 2);
});

test('a missing edge counts the same pair in either direction', () => {
  const store = createStore(memoryStorage());
  store.recordMissingEdge({ a: 'QUGA', b: 'ACPL', channel: 'leaf' });
  store.recordMissingEdge({ a: 'ACPL', b: 'QUGA', channel: 'leaf' });
  const edges = store.readMissingEdges();
  assert.equal(edges.length, 1);
  assert.deepEqual(edges[0], { a: 'ACPL', b: 'QUGA', channel: 'leaf', count: 2 });
});

test('writeSettings ignores a value that is not a whole number of 1 or more', () => {
  const store = createStore(memoryStorage());
  assert.equal(store.writeSettings({ session_size: 15 }).session_size, 15);
  assert.equal(store.writeSettings({ session_size: 0 }).session_size, 15);
  assert.equal(store.writeSettings({ session_size: 2.5 }).session_size, 15);
  assert.equal(store.writeSettings({ new_per_day: 'abc' }).new_per_day, 10);
  assert.equal(store.readSettings().session_size, 15);
  assert.equal(store.writeSettings({ last_export: '2026-03-10' }).last_export, '2026-03-10');
});

test('export and import make a round trip', () => {
  const first = createStore(memoryStorage());
  first.writeCard('species:QUGA:leaf', { interval: 4, ease: 2.5, due: '2026-03-14', reps: 2, lapses: 0, recent: ['good'], tier: 'mc4', tier_passes: 2 });
  first.appendLog(row('species:QUGA:leaf', '2026-03-10T09:00:00Z'));
  first.writeSettings({ session_size: 15 });
  const blob = first.exportBlob('2026-03-10');
  assert.equal(blob.filename, 'dendro-progress-2026-03-10.json');

  const second = createStore(memoryStorage());
  const result = second.importBlob(blob.json);
  assert.deepEqual(result, { ok: true, errors: [] });
  assert.equal(second.readCards()['species:QUGA:leaf'].interval, 4);
  assert.equal(second.readLog().length, 1);
  assert.equal(second.readSettings().session_size, 15);
});

test('a malformed import is rejected with a reason and changes nothing', () => {
  const store = createStore(memoryStorage());
  store.writeCard('species:QUGA:leaf', { interval: 4, tier: 'mc4', tier_passes: 0 });

  const notJson = store.importBlob('{oops');
  assert.equal(notJson.ok, false);
  assert.match(notJson.errors[0], /not valid JSON/);

  const wrongVersion = store.importBlob(JSON.stringify({
    version: 99, dendro_cards: { version: 99, cards: {} }, dendro_log: { version: 99, rows: [] },
    dendro_settings: defaultSettings(), dendro_missing_edges: { version: 1, edges: [] }
  }));
  assert.equal(wrongVersion.ok, false);
  assert.match(wrongVersion.errors[0], /version 99/);

  const missingKey = store.importBlob(JSON.stringify({ version: 1, dendro_cards: { version: 1, cards: {} } }));
  assert.equal(missingKey.ok, false);
  assert.match(missingKey.errors.join(' '), /dendro_log/);

  assert.equal(store.readCards()['species:QUGA:leaf'].interval, 4);
});

test('an import with a malformed section writes nothing', () => {
  const store = createStore(memoryStorage());
  store.writeCard('species:QUGA:leaf', { interval: 4, tier: 'mc4', tier_passes: 0 });
  store.appendLog(row('species:QUGA:leaf', '2026-03-10T09:00:00Z'));
  store.recordMissingEdge({ a: 'ACPL', b: 'QUGA', channel: 'leaf' });
  const good = {
    version: 1,
    dendro_cards: { version: 1, cards: {} },
    dendro_log: { version: 1, rows: [] },
    dendro_settings: defaultSettings(),
    dendro_missing_edges: { version: 1, edges: [] }
  };

  const nullCards = store.importBlob(JSON.stringify({ ...good, dendro_cards: null }));
  assert.equal(nullCards.ok, false);
  assert.match(nullCards.errors.join(' '), /dendro_cards/);

  const arrayCards = store.importBlob(JSON.stringify({ ...good, dendro_cards: [] }));
  assert.equal(arrayCards.ok, false);

  const arrayRows = store.importBlob(JSON.stringify({ ...good, dendro_log: { version: 1, rows: {} } }));
  assert.equal(arrayRows.ok, false);

  const badSize = store.importBlob(JSON.stringify({
    ...good, dendro_settings: { ...defaultSettings(), session_size: 'abc' }
  }));
  assert.equal(badSize.ok, false);
  assert.match(badSize.errors.join(' '), /session_size/);

  assert.equal(store.readCards()['species:QUGA:leaf'].interval, 4);
  assert.equal(store.readSettings().session_size, 20);
  assert.equal(store.readLog().length, 1);
  assert.deepEqual(store.readMissingEdges(), [{ a: 'ACPL', b: 'QUGA', channel: 'leaf', count: 1 }]);
});

test('an import migrates each section from its own version', () => {
  const store = createStore(memoryStorage());
  const result = store.importBlob(JSON.stringify({
    version: 1,
    dendro_cards: {
      version: 0,
      cards: { 'species:QUGA:leaf': { interval: 10, ease: 2.5, due: '2026-03-20', reps: 3, lapses: 0, recent: [] } }
    },
    dendro_log: { version: 1, rows: [] },
    dendro_settings: defaultSettings(),
    dendro_missing_edges: { version: 1, edges: [] }
  }));
  assert.deepEqual(result, { ok: true, errors: [] });
  const card = store.readCards()['species:QUGA:leaf'];
  assert.equal(card.tier, 'mc4');
  assert.equal(card.tier_passes, 0);
  assert.equal(card.interval, 10);
});

test('reset clears every key', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.writeCard('species:QUGA:leaf', { interval: 4, tier: 'mc4', tier_passes: 0 });
  store.appendLog(row('species:QUGA:leaf', '2026-03-10T09:00:00Z'));
  store.reset();
  assert.deepEqual(store.readCards(), {});
  assert.deepEqual(store.readLog(), []);
  assert.equal(storage.getItem('dendro_cards'), null);
});

test('a version 0 card payload migrates in place', () => {
  const storage = memoryStorage();
  storage.setItem('dendro_cards', JSON.stringify({
    version: 0, cards: { 'species:QUGA:leaf': { interval: 10, ease: 2.5, due: '2026-03-20', reps: 3, lapses: 0, recent: [] } }
  }));
  const store = createStore(storage);
  const card = store.readCards()['species:QUGA:leaf'];
  assert.equal(card.tier, 'mc4');
  assert.equal(card.tier_passes, 0);
  assert.equal(JSON.parse(storage.getItem('dendro_cards')).version, 1);
});

test('a payload from a newer build is left alone and blocks every write', () => {
  const storage = memoryStorage();
  const newer = JSON.stringify({ version: 2, cards: { 'species:QUGA:leaf': { interval: 30, tier: 'typed', tier_passes: 1 } } });
  storage.setItem('dendro_cards', newer);
  const store = createStore(storage);
  assert.equal(store.readCards()['species:QUGA:leaf'].interval, 30);
  assert.equal(store.newer_version, true);
  store.writeCard('species:QURU:leaf', { interval: 1, tier: 'mc4', tier_passes: 0 });
  assert.equal(storage.getItem('dendro_cards'), newer);
  assert.equal(store.readCards()['species:QURU:leaf'], undefined);
});

test('corrupt stored JSON is copied aside once and not overwritten', () => {
  const storage = memoryStorage();
  storage.setItem('dendro_cards', '{oops');
  const store = createStore(storage);
  assert.deepEqual(store.readCards(), {});
  assert.equal(storage.getItem('dendro_cards_corrupt'), '{oops');
  store.writeCard('species:QUGA:leaf', { interval: 1, tier: 'mc4', tier_passes: 0 });
  assert.equal(store.readCards()['species:QUGA:leaf'].interval, 1);
  storage.setItem('dendro_cards', '{worse');
  assert.deepEqual(store.readCards(), {});
  assert.equal(storage.getItem('dendro_cards_corrupt'), '{oops');
});

test('the export prompt fires once a month', () => {
  const store = createStore(memoryStorage());
  assert.equal(store.shouldPromptExport('2026-03-10'), true);
  store.markExported('2026-03-10');
  assert.equal(store.shouldPromptExport('2026-03-20'), false);
  assert.equal(store.shouldPromptExport('2026-04-12'), true);
});

test('a write that fails turns available off and leaves reads working', () => {
  const inner = memoryStorage();
  let full = false;
  const storage = {
    getItem: (key) => inner.getItem(key),
    setItem: (key, value) => {
      if (full) throw new Error('QuotaExceededError');
      inner.setItem(key, value);
    },
    removeItem: (key) => inner.removeItem(key)
  };
  const store = createStore(storage);
  store.writeCard('species:QUGA:leaf', { interval: 4, tier: 'mc4', tier_passes: 0 });
  assert.equal(store.available, true);
  full = true;
  store.appendLog(row('species:QUGA:leaf', '2026-03-10T09:00:00Z'));
  assert.equal(store.available, false);
  assert.deepEqual(store.readLog(), []);
  assert.deepEqual(store.readCards(), {});
  assert.deepEqual(store.readSettings(), defaultSettings());
});

test('an import reports failure when storage refuses to write', () => {
  const inner = memoryStorage();
  let full = false;
  const storage = {
    getItem: (key) => inner.getItem(key),
    setItem: (key, value) => {
      if (full) throw new Error('QuotaExceededError');
      inner.setItem(key, value);
    },
    removeItem: (key) => inner.removeItem(key)
  };
  const store = createStore(storage);
  store.writeCard('species:QUGA:leaf', { interval: 4, tier: 'mc4', tier_passes: 0 });
  const before = inner.getItem('dendro_cards');
  full = true;
  store.appendLog(row('species:QUGA:leaf', '2026-03-10T09:00:00Z'));
  assert.equal(store.available, false);

  const result = store.importBlob(goodBlob());
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /not storing your progress/);
  assert.equal(inner.getItem('dendro_cards'), before);
});

test('an import stops when the stored data comes from a newer build', () => {
  const storage = memoryStorage();
  const newer = JSON.stringify({ version: 2, cards: { 'species:QUGA:leaf': { interval: 30, tier: 'typed', tier_passes: 1 } } });
  storage.setItem('dendro_cards', newer);
  const store = createStore(storage);
  store.readCards();
  assert.equal(store.newer_version, true);

  const result = store.importBlob(goodBlob());
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /newer version/);
  assert.equal(storage.getItem('dendro_cards'), newer);
  assert.equal(storage.getItem('dendro_log'), null);
});

test('readSettings holds the floor on a stored value below 1', () => {
  const storage = memoryStorage();
  storage.setItem('dendro_settings', JSON.stringify({
    version: 1, session_size: 0, new_per_day: -5, last_export: '2026-03-10'
  }));
  const store = createStore(storage);
  const settings = store.readSettings();
  assert.equal(settings.session_size, 20);
  assert.equal(settings.new_per_day, 10);
  assert.equal(settings.last_export, '2026-03-10');

  storage.setItem('dendro_settings', JSON.stringify({ version: 1, session_size: 2.5, new_per_day: 'abc' }));
  assert.equal(store.readSettings().session_size, 20);
  assert.equal(store.readSettings().new_per_day, 10);
});

test('an unavailable storage leaves the store running and not available', () => {
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); }
  };
  const store = createStore(broken);
  assert.equal(store.available, false);
  assert.deepEqual(store.readCards(), {});
  store.writeCard('species:QUGA:leaf', { interval: 1, tier: 'mc4', tier_passes: 0 });
  assert.deepEqual(store.readCards(), {});
});
