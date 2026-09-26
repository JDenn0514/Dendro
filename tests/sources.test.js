import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCES, sourceEntry, sourceHref } from '../app/logic/sources.js';

const PER_PHOTO = 'Each photo carries its own licence, shown in its credit.';

function manifestSources(dir) {
  const rows = JSON.parse(readFileSync(new URL(`../${dir}/images/manifest.json`, import.meta.url), 'utf8'));
  return new Set(rows.map((row) => row.source));
}

test('every source in the manifests has an entry', () => {
  for (const dir of ['content', 'content_dev']) {
    for (const source of manifestSources(dir)) {
      assert.ok(sourceEntry(source), `${dir}: no entry for ${source}`);
    }
  }
});

test('every entry has a short name, an id, a full name, a site, and a note', () => {
  const ids = new Set();
  const shorts = new Set();
  for (const entry of SOURCES) {
    for (const field of ['source', 'id', 'name', 'url', 'terms']) {
      assert.equal(typeof entry[field], 'string', `${entry.source} ${field}`);
      assert.notEqual(entry[field].trim(), '', `${entry.source} ${field}`);
    }
    assert.match(entry.id, /^[a-z0-9-]+$/);
    assert.match(entry.url, /^https:\/\//);
    assert.ok(!ids.has(entry.id), entry.id);
    assert.ok(!shorts.has(entry.source), entry.source);
    ids.add(entry.id);
    shorts.add(entry.source);
  }
});

test('VT Dendrology has its full name and the permission terms', () => {
  const vt = sourceEntry('VT Dendrology');
  assert.equal(vt.name,
    'Virginia Tech Dendrology, Department of Forest Resources and Environmental Conservation, Virginia Tech');
  assert.equal(vt.url, 'https://dendro.cnre.vt.edu/dendrology/');
  assert.equal(vt.terms,
    'Photos used with permission, for non-commercial use only. The photographers keep the copyright.');
  assert.equal(vt.semicolons, true);
});

test('wildflower.org rows are used with permission, and the others carry their own licence', () => {
  assert.equal(sourceEntry('Lady Bird Johnson Wildflower Center').terms,
    'Photos used with permission, for non-commercial use only.');
  const others = [
    'Wikimedia Commons', 'iNaturalist', 'Bioimages', 'Trees and Shrubs Online',
    'USDA PLANTS Database', 'Plants of the World Online (Kew)'
  ];
  for (const source of others) {
    assert.equal(sourceEntry(source).terms, PER_PHOTO, source);
    assert.equal(sourceEntry(source).semicolons, false, source);
  }
  assert.equal(SOURCES.length, others.length + 2);
});

test('sourceHref points at the entry on the Sources screen', () => {
  assert.equal(sourceHref('VT Dendrology'), '#/sources?at=vt-dendrology');
  assert.equal(sourceHref('iNaturalist'), '#/sources?at=inaturalist');
  assert.equal(sourceHref('A site with no entry'), null);
  assert.equal(sourceHref('toString'), null);
  assert.equal(sourceEntry(undefined), null);
});
