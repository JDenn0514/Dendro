import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { loadContent } from '../app/logic/content.js';
import {
  normalize, acceptedAnswers, gradeTyped, gradeChoice, resolveTyped
} from '../app/logic/grader.js';

const { content } = loadContent(loadFixture());

test('the normalizer lowercases, drops punctuation, and turns a hyphen into a space', () => {
  assert.equal(normalize('  Gambel   Oak!  '), 'gambel oak');
  assert.equal(normalize('Scale-like'), 'scale like');
  assert.equal(normalize("Quercus  gambelii."), 'quercus gambelii');
  assert.equal(normalize('Plated / blocky'), 'plated blocky');
  assert.equal(normalize(''), '');
  assert.equal(normalize(null), '');
});

test('the normalizer collapses a tab, a newline, and a non-breaking space', () => {
  assert.equal(normalize('Gambel\toak'), 'gambel oak');
  assert.equal(normalize('Gambel\noak'), 'gambel oak');
  assert.equal(normalize('Gambel oak'), 'gambel oak');
  assert.equal(normalize('  Quercus\tgambelii \n'), 'quercus gambelii');
});

test('a species card accepts the scientific name and every common name', () => {
  const card = content.cards['species:QUGA:leaf'];
  assert.equal(gradeTyped(card, 'Quercus gambelii', content), true);
  assert.equal(gradeTyped(card, 'gambel oak', content), true);
  assert.equal(gradeTyped(card, 'Rocky-Mountain white oak', content), true);
  assert.equal(gradeTyped(card, 'Quercus rubra', content), false);
});

test('a near miss in the same genus is wrong', () => {
  const card = content.cards['species:QURU:leaf'];
  assert.equal(gradeTyped(card, 'Quercus velutina', content), false);
  assert.equal(gradeTyped(card, 'black oak', content), false);
  assert.equal(gradeTyped(card, 'oak', content), false);
});

test('a concept card accepts every entry in accept', () => {
  const card = content.cards['concept:bark:plated'];
  for (const word of ['plated', 'blocky', 'plated blocky', 'plate bark']) {
    assert.equal(gradeTyped(card, word, content), true, word);
  }
  assert.equal(gradeTyped(card, 'furrowed', content), false);
});

test('a group card accepts the genus and the group common name', () => {
  const card = content.cards['group:leaf:Quercus'];
  assert.equal(gradeTyped(card, 'Quercus', content), true);
  assert.equal(gradeTyped(card, 'oak', content), true);
  assert.equal(gradeTyped(card, 'maple', content), false);
});

test('a group with no genus_common accepts the genus alone', () => {
  // The Acer records in the fixture carry no genus_common, the oaks do.
  assert.deepEqual(acceptedAnswers(content.cards['group:leaf:Acer'], content), ['acer']);
  assert.equal(gradeTyped(content.cards['group:leaf:Acer'], 'Acer', content), true);
  assert.equal(gradeTyped(content.cards['group:leaf:Acer'], 'maple', content), false);

  const inMemory = {
    species: {
      PIPO: { genus: 'Pinus', common: ['Ponderosa pine'], scientific: 'Pinus ponderosa' },
      PIED: { genus: 'Pinus', common: ['Pinyon pine'], scientific: 'Pinus edulis' },
      PIRE: {
        genus: 'Pinus', common: ['Red pine'], scientific: 'Pinus resinosa',
        genus_common: 'pine', retired: true, retired_reason: 'no usable images',
        retired_at: '2026-09-22'
      }
    },
    concepts: [], concepts_by_channel: { leaf: [] }, cards: {}
  };
  const groupCard = { id: 'group:leaf:Pinus', kind: 'group', channel: 'leaf', key: 'Pinus' };
  assert.deepEqual(acceptedAnswers(groupCard, inMemory), ['pinus']);
  assert.equal(gradeTyped(groupCard, 'Pinus', inMemory), true);
  assert.equal(gradeTyped(groupCard, 'pine', inMemory), false);
});

test('a variety card accepts the variety name and its key', () => {
  const card = content.cards['variety:QUGAG:leaf'];
  assert.equal(gradeTyped(card, 'var. gambelii', content), true);
  assert.equal(gradeTyped(card, 'QUGAG', content), true);
  assert.equal(gradeTyped(card, 'var. bakeri', content), false);
});

test('a multiple choice answer is an exact key match', () => {
  assert.equal(gradeChoice('QUGA', 'QUGA'), true);
  assert.equal(gradeChoice('QUGA', 'QURU'), false);
});

test('a typed answer resolves back to the key it names', () => {
  assert.equal(resolveTyped('northern red oak', 'species', 'leaf', content), 'QURU');
  assert.equal(resolveTyped('Quercus rubra', 'species', 'leaf', content), 'QURU');
  assert.equal(resolveTyped('blocky', 'concept', 'bark', content), 'plated');
  assert.equal(resolveTyped('black oak', 'species', 'leaf', content), null);
  assert.equal(resolveTyped('', 'species', 'leaf', content), null);
});

test('a category with no card still resolves to its key', () => {
  assert.equal(content.cards['concept:bark:smooth'], undefined);
  assert.equal(resolveTyped('smooth bark', 'concept', 'bark', content), 'smooth');
  assert.equal(resolveTyped('shaggy', 'concept', 'bark', content), 'shaggy');
  assert.equal(resolveTyped('not a bark type', 'concept', 'bark', content), null);
});
