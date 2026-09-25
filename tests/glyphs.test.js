import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFixture } from './helpers/fixture.js';
import { loadContent } from '../app/logic/content.js';
import {
  CHANNEL_GLYPHS, GENUS_GLYPHS, FALLBACK_GLYPH,
  conceptGlyph, genusGlyph, glyphIdFor
} from '../app/ui/glyphs.js';

const { content } = loadContent(loadFixture());
const SPRITE = readFileSync(new URL('../app/ui/sprite.svg', import.meta.url), 'utf8');

test('every glyph the maps name is a symbol in the sprite', () => {
  const named = new Set([
    ...Object.values(CHANNEL_GLYPHS).flatMap((map) => Object.values(map)),
    ...Object.values(GENUS_GLYPHS),
    FALLBACK_GLYPH
  ]);
  for (const id of named) {
    assert.ok(SPRITE.includes(`id="${id}"`), `the sprite has no symbol ${id}`);
  }
});

test('every concept key in the content has a glyph', () => {
  for (const concept of content.concepts) {
    assert.ok(conceptGlyph(concept.channel, concept.key),
      `no glyph for ${concept.channel}/${concept.key}`);
  }
});

test('a concept card carries its own shape on its own channel', () => {
  assert.equal(glyphIdFor(content.cards['concept:leaf:simple_lobed'], content), 'lf-oak');
  assert.equal(glyphIdFor(content.cards['concept:bark:furrowed'], content), 'bk-furrowed');
  assert.equal(glyphIdFor(content.cards['concept:fruit:acorn'], content), 'fr-acorn');
});

test('a genus, species, or variety card carries the genus leaf', () => {
  assert.equal(glyphIdFor(content.cards['group:leaf:Acer'], content), 'lf-maple');
  assert.equal(glyphIdFor(content.cards['group:bark:Quercus'], content), 'lf-oak');
  assert.equal(glyphIdFor(content.cards['species:PLOC:bark'], content), 'lf-plat');
  assert.equal(glyphIdFor(content.cards['species:ACPL:fruit'], content), 'lf-maple');
  assert.equal(glyphIdFor(content.cards['variety:QUGAG:leaf'], content), 'lf-oak');
});

test('a genus outside the table falls back to its leaf concept', () => {
  const stub = {
    species: {
      LIQ: { genus: 'Liquidambar', concepts: { leaf: 'simple_lobed' }, varieties: [] }
    }
  };
  assert.equal(genusGlyph('Liquidambar', stub), 'lf-oak');
  assert.equal(genusGlyph('Nothosuchus', stub), FALLBACK_GLYPH);
  assert.equal(genusGlyph(null, stub), FALLBACK_GLYPH);
});

test('an unknown concept key falls back rather than throwing', () => {
  assert.equal(conceptGlyph('leaf', 'no_such_shape'), null);
  assert.equal(conceptGlyph('no_such_channel', 'needles'), null);
  const card = { kind: 'concept', channel: 'leaf', key: 'no_such_shape' };
  assert.equal(glyphIdFor(card, content), FALLBACK_GLYPH);
});
