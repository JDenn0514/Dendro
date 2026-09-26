import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { makeRng } from './helpers/rng.js';
import { loadContent } from '../app/logic/content.js';
import {
  shuffle, speciesCardSymbols, varietyOf, invAvailable, formatFor,
  optionCountFor, pickPhoto, speciesDistractors,
  labelFor, buildQuestion, answerPhoto, buildReveal, revealCredits
} from '../app/logic/question.js';

const { content } = loadContent(loadFixture());

test('the format always equals the tier', () => {
  assert.equal(formatFor(null), 'mc4');
  assert.equal(formatFor({ tier: 'mc8' }), 'mc8');
  assert.equal(formatFor({ tier: 'inv' }), 'inv');
  assert.equal(formatFor({ tier: 'typed' }), 'typed');
  assert.equal(optionCountFor('mc4'), 4);
  assert.equal(optionCountFor('mc8'), 8);
  assert.equal(optionCountFor('inv'), 8);
  assert.equal(optionCountFor('typed'), 0);
});

test('inv availability counts the options the card can build', () => {
  assert.equal(invAvailable(content, content.cards['species:QUGA:leaf']), true);
  assert.equal(invAvailable(content, content.cards['species:QUGA:bark']), false);
  assert.equal(invAvailable(content, content.cards['species:QUGA:fruit']), false);
  assert.equal(invAvailable(content, content.cards['concept:leaf:simple_lobed']), false);
  assert.equal(invAvailable(content, content.cards['concept:bark:plated']), false);
  assert.equal(invAvailable(content, content.cards['group:leaf:Quercus']), false);
});

test('shuffle returns a new array and leaves the input alone', () => {
  const input = ['a', 'b', 'c', 'd', 'e'];
  const copy = [...input];
  const out = shuffle(input, makeRng(7));
  assert.notEqual(out, input);
  assert.deepEqual(input, copy);
  assert.deepEqual(out.slice().sort(), copy.slice().sort());
});

test('speciesCardSymbols lists the species with a card on the channel', () => {
  assert.deepEqual(speciesCardSymbols(content, 'leaf').sort(),
    ['ACPL', 'ACSA2', 'PLOC', 'QUGA', 'QURU']);
  assert.deepEqual(speciesCardSymbols(content, 'bark').sort(), ['PLOC', 'QUGA', 'QURU']);
  assert.ok(!speciesCardSymbols(content, 'leaf').includes('QUVE'));
});

test('varietyOf finds the species that owns the variety', () => {
  assert.equal(varietyOf(content, 'QUGAG').symbol, 'QUGA');
  assert.equal(varietyOf(content, 'QUGAG').variety.name, 'var. gambelii');
  assert.deepEqual(varietyOf(content, 'ZZZZZ'), { symbol: null, variety: null });
});

test('the same image is not shown twice in a row', () => {
  const card = content.cards['species:QUGA:leaf'];
  const first = pickPhoto(card, [], makeRng(1));
  assert.match(first.hash, /^[0-9a-f]{64}$/);
  const second = pickPhoto(card, [first.hash], makeRng(1));
  assert.notEqual(second.hash, first.hash);
});

test('an exhausted pool returns null', () => {
  const card = content.cards['species:ACSA2:leaf'];
  const every = card.photos.map((p) => p.hash);
  assert.equal(pickPhoto(card, every, makeRng(1)), null);
});

test('the distractor ladder walks the steps in order and never includes the answer', () => {
  const picks = speciesDistractors({
    symbol: 'QURU', channel: 'leaf', count: 3, content, rng: makeRng(5)
  });
  assert.equal(picks.length, 3);
  assert.ok(!picks.includes('QURU'));
  assert.ok(!picks.includes('QUVE'));
  assert.equal(picks[0], 'QUGA');
});

test('distractors are filtered to species with a card on this channel', () => {
  const picks = speciesDistractors({
    symbol: 'QUGA', channel: 'bark', count: 8, content, rng: makeRng(3)
  });
  assert.deepEqual(picks.sort(), ['PLOC', 'QURU']);
});

// Three varieties, two cards. The fixture holds two of each, so this case needs
// an object of its own.
const varietyPhoto = (digit) => [{
  hash: String(digit).repeat(64), target: 'x', channel: 'leaf',
  author: 'x', source: 'x', license: 'x', origin: 'https://example.org/x'
}];
const varietyContent = {
  species: {
    QUGA: {
      scientific: 'Quercus gambelii', common: ['Gambel oak'], genus: 'Quercus',
      genus_common: 'oak', family: 'Fagaceae', concepts: { leaf: 'simple_lobed' },
      varieties: [
        { key: 'QUGAG', name: 'var. gambelii' },
        { key: 'QUGAB', name: 'var. bakeri' },
        { key: 'QUGAX', name: 'var. rara' }
      ]
    }
  },
  concepts: [], concepts_by_channel: { leaf: [] }, confusion: [],
  cards: {
    'variety:QUGAG:leaf': {
      id: 'variety:QUGAG:leaf', kind: 'variety', channel: 'leaf', key: 'QUGAG',
      bucket: 'simple_lobed', photos: varietyPhoto(1)
    },
    'variety:QUGAB:leaf': {
      id: 'variety:QUGAB:leaf', kind: 'variety', channel: 'leaf', key: 'QUGAB',
      bucket: 'simple_lobed', photos: varietyPhoto(2)
    }
  }
};

test('a species question at mc4 shows four options including the answer', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(11) });
  assert.equal(q.format, 'mc4');
  assert.equal(q.prompt, 'Which species?');
  assert.equal(q.options.length, 4);
  assert.equal(q.option_count, 4);
  assert.equal(q.answer_key, 'QUGA');
  assert.ok(q.options.some((o) => o.key === 'QUGA'));
  assert.ok(card.photos.some((p) => p.hash === q.photo.hash));
  const answer = q.options.find((o) => o.key === 'QUGA');
  assert.equal(answer.label, 'Gambel oak');
  assert.equal(answer.sublabel, 'Quercus gambelii');
});

test('mc8 shows as many options as exist', () => {
  const card = content.cards['species:QUGA:bark'];
  const q = buildQuestion({
    card, content, state: { tier: 'mc8' }, excluded_hashes: [], rng: makeRng(2)
  });
  assert.equal(q.format, 'mc8');
  assert.equal(q.options.length, 3);
  assert.equal(q.option_count, 3);
});

test('a bark concept card at mc8 shows one option per bark category', () => {
  const card = content.cards['concept:bark:plated'];
  const q = buildQuestion({
    card, content, state: { tier: 'mc8' }, excluded_hashes: [], rng: makeRng(4)
  });
  assert.equal(q.prompt, 'What bark type is this?');
  assert.equal(q.options.length, 6);
  assert.ok(q.options.some((o) => o.key === 'plated' && o.label === 'Plated / blocky'));
});

test('a group card below four options falls back to typed without changing the tier', () => {
  const card = content.cards['group:bark:Quercus'];
  const q = buildQuestion({
    card, content, state: { tier: 'mc8' }, excluded_hashes: [], rng: makeRng(6)
  });
  assert.equal(q.tier, 'mc8');
  assert.equal(q.format, 'typed');
  assert.equal(q.options.length, 0);
  assert.equal(q.option_count, 0);
});

test('a group option shows the genus common name over the genus', () => {
  assert.deepEqual(labelFor(content, 'group', 'leaf', 'Quercus'),
    { label: 'Oak', sublabel: 'Quercus' });
  // The Acer records carry no genus_common, so the genus stands in both rows.
  assert.deepEqual(labelFor(content, 'group', 'leaf', 'Acer'),
    { label: 'Acer', sublabel: 'Acer' });
  assert.deepEqual(labelFor(content, 'species', 'leaf', 'QURU'),
    { label: 'Northern red oak', sublabel: 'Quercus rubra' });
  assert.deepEqual(labelFor(content, 'concept', 'bark', 'plated'),
    { label: 'Plated / blocky', sublabel: '' });
  assert.deepEqual(labelFor(content, 'variety', 'leaf', 'QUGAG'),
    { label: 'var. gambelii', sublabel: 'Quercus gambelii' });
});

test('a species label prints with a capital, whatever the content holds', () => {
  // The production content set holds common names the way a flora does,
  // lowercase unless a part of the name is a proper noun. Every label here is
  // a display label: an answer button, the name on a reveal.
  const lower = {
    species: { ACSA2: { common: ['silver maple'], scientific: 'Acer saccharinum' } }
  };
  assert.deepEqual(labelFor(lower, 'species', 'leaf', 'ACSA2'),
    { label: 'Silver maple', sublabel: 'Acer saccharinum' });
  // A name the content already capitalized is left as it stands.
  assert.deepEqual(labelFor(content, 'species', 'leaf', 'QURU'),
    { label: 'Northern red oak', sublabel: 'Quercus rubra' });
});

test('a leaf group card also falls back to typed, because its bucket holds three genera', () => {
  const card = content.cards['group:leaf:Quercus'];
  const q = buildQuestion({
    card, content, state: { tier: 'mc4' }, excluded_hashes: [], rng: makeRng(8)
  });
  assert.equal(q.prompt, 'Which genus?');
  assert.equal(q.format, 'typed');
  assert.equal(q.options.length, 0);
});

test('a variety question offers the sibling varieties', () => {
  const card = content.cards['variety:QUGAG:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(9) });
  assert.equal(q.prompt, 'Which variety?');
  assert.deepEqual(q.options.map((o) => o.key).sort(), ['QUGAB', 'QUGAG']);
});

test('a variety question shows every sibling, card or no card', () => {
  const card = varietyContent.cards['variety:QUGAG:leaf'];
  const q = buildQuestion({
    card, content: varietyContent, state: null, excluded_hashes: [], rng: makeRng(31)
  });
  assert.equal(q.format, 'mc4');
  assert.deepEqual(q.options.map((o) => o.key).sort(), ['QUGAB', 'QUGAG', 'QUGAX']);
  assert.equal(q.option_count, 3);
  assert.equal(q.options.find((o) => o.key === 'QUGAX').label, 'var. rara');
});

test('an inv question names the answer and offers photos', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({
    card, content, state: { tier: 'inv' }, excluded_hashes: [], rng: makeRng(13)
  });
  assert.equal(q.format, 'inv');
  assert.equal(q.prompt, 'Which photo shows Gambel oak?');
  assert.equal(q.photo, null);
  assert.equal(q.options.length, 5);
  for (const option of q.options) assert.match(option.photo.hash, /^[0-9a-f]{64}$/);
  assert.ok(q.options.some((o) => o.key === 'QUGA'));
});

test('a card at tier inv with too few photo options asks mc8 instead', () => {
  const card = content.cards['concept:bark:plated'];
  const q = buildQuestion({
    card, content, state: { tier: 'inv' }, excluded_hashes: [], rng: makeRng(15)
  });
  assert.equal(q.tier, 'inv');
  assert.equal(q.format, 'mc8');
  assert.equal(q.options.length, 6);
  assert.match(q.photo.hash, /^[0-9a-f]{64}$/);
  for (const option of q.options) assert.equal(option.photo, null);
});

test('the inv answer keeps a photo when the exclusion list covers its pool', () => {
  const card = content.cards['species:ACSA2:leaf'];
  const every = card.photos.map((p) => p.hash);
  const q = buildQuestion({
    card, content, state: { tier: 'inv' }, excluded_hashes: every, rng: makeRng(17)
  });
  assert.equal(q.format, 'inv');
  const answer = q.options.find((o) => o.key === 'ACSA2');
  assert.ok(every.includes(answer.photo.hash));
  for (const option of q.options) assert.ok(option.photo);
});

test('answerPhoto finds the photo the answer showed', () => {
  const card = content.cards['species:QUGA:leaf'];
  const inv = buildQuestion({
    card, content, state: { tier: 'inv' }, excluded_hashes: [], rng: makeRng(19)
  });
  assert.equal(answerPhoto(inv), inv.options.find((o) => o.key === 'QUGA').photo);
  const mc4 = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(19) });
  assert.equal(answerPhoto(mc4), mc4.photo);
  assert.equal(answerPhoto({ format: 'inv', answer_key: 'QUGA', options: [], photo: null }), null);
});

// Every format needs an image to identify. 18 of the fixture's 25 cards hold a
// single photo, so a session that excludes the last shown hash exhausts the
// pool on the common path, not a rare one.
test('an mc4 question keeps a photo when the exclusion list covers its pool', () => {
  const card = content.cards['species:ACSA2:leaf'];
  const every = card.photos.map((p) => p.hash);
  const q = buildQuestion({
    card, content, state: null, excluded_hashes: every, rng: makeRng(41)
  });
  assert.equal(q.format, 'mc4');
  assert.ok(every.includes(q.photo.hash));
});

test('a typed question keeps a photo when the exclusion list covers its pool', () => {
  const card = content.cards['species:ACSA2:leaf'];
  const every = card.photos.map((p) => p.hash);
  const q = buildQuestion({
    card, content, state: { tier: 'typed' }, excluded_hashes: every, rng: makeRng(42)
  });
  assert.equal(q.format, 'typed');
  assert.ok(every.includes(q.photo.hash));
});

test('a card that falls back to typed keeps a photo when the exclusion list covers its pool', () => {
  const card = content.cards['group:bark:Quercus'];
  const every = card.photos.map((p) => p.hash);
  const q = buildQuestion({
    card, content, state: { tier: 'mc8' }, excluded_hashes: every, rng: makeRng(43)
  });
  assert.equal(q.format, 'typed');
  assert.ok(every.includes(q.photo.hash));
});

test('a typed question shows no options', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({
    card, content, state: { tier: 'typed' }, excluded_hashes: [], rng: makeRng(14)
  });
  assert.equal(q.format, 'typed');
  assert.deepEqual(q.options, []);
  assert.equal(q.option_count, 0);
});

test('a wrong species answer shows the confusion sentence in the right direction', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(21) });
  const reveal = buildReveal({ question: q, chosen_key: 'QURU', content });
  assert.equal(reveal.correct, false);
  assert.equal(reveal.diagnostic.kind, 'edge');
  assert.equal(reveal.diagnostic.text, 'Gambel oak has rounded lobes with no bristle tips.');
  assert.equal(reveal.diagnostic.ref, 'USDA Silvics Manual, Quercus gambelii');
  assert.equal(reveal.missing_edge, null);
  const quruPool = content.cards['species:QURU:leaf'].photos.map((p) => p.hash);
  assert.ok(quruPool.includes(reveal.chosen.photo.hash));
});

test('the reverse direction uses b_not_a', () => {
  const card = content.cards['species:QURU:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(22) });
  const reveal = buildReveal({ question: q, chosen_key: 'QUGA', content });
  assert.equal(reveal.diagnostic.text,
    'Northern red oak has pointed lobes that end in bristle tips.');
});

test('a missing edge falls back to bucket and genus and records the pair', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(23) });
  const reveal = buildReveal({ question: q, chosen_key: 'ACPL', content });
  assert.equal(reveal.diagnostic.kind, 'fallback');
  assert.match(reveal.diagnostic.text, /Simple, lobed/);
  assert.match(reveal.diagnostic.text, /Quercus/);
  assert.match(reveal.diagnostic.text, /Acer/);
  assert.deepEqual(reveal.missing_edge, { a: 'ACPL', b: 'QUGA', channel: 'leaf' });
});

test('a right answer carries the facts and the attribution and no diagnostic', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(24) });
  const reveal = buildReveal({ question: q, chosen_key: 'QUGA', content });
  assert.equal(reveal.correct, true);
  assert.equal(reveal.chosen, null);
  assert.equal(reveal.diagnostic, null);
  assert.equal(reveal.answer.facts.range_text, 'Colorado Plateau and southern Rockies');
  assert.deepEqual(reveal.answer.facts.elevation_ft, [5000, 9000]);
  assert.deepEqual(reveal.answer.facts.height_ft, [15, 30]);
  assert.equal(reveal.answer.photo.author, 'USDA NRCS');
});

test('a concept miss uses the descriptions and records no missing edge', () => {
  const card = content.cards['concept:bark:plated'];
  const q = buildQuestion({
    card, content, state: { tier: 'mc8' }, excluded_hashes: [], rng: makeRng(25)
  });
  const reveal = buildReveal({ question: q, chosen_key: 'furrowed', content });
  assert.equal(reveal.diagnostic.kind, 'fallback');
  assert.match(reveal.diagnostic.text, /Plated \/ blocky/);
  assert.match(reveal.diagnostic.text, /Furrowed \/ ridged/);
  assert.equal(reveal.missing_edge, null);
});

test('a group miss names both genera in one sentence each', () => {
  const card = content.cards['group:leaf:Quercus'];
  const q = buildQuestion({
    card, content, state: { tier: 'mc4' }, excluded_hashes: [], rng: makeRng(27)
  });
  const reveal = buildReveal({ question: q, chosen_key: 'Acer', content });
  assert.equal(reveal.diagnostic.kind, 'fallback');
  assert.equal(reveal.diagnostic.text, 'The answer is Oak. You picked Acer.');
  assert.equal(reveal.missing_edge, null);
});

test('a null chosen key shows the answer alone', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({
    card, content, state: { tier: 'typed' }, excluded_hashes: [], rng: makeRng(26)
  });
  const reveal = buildReveal({ question: q, chosen_key: null, content });
  assert.equal(reveal.correct, false);
  assert.equal(reveal.chosen, null);
  assert.equal(reveal.diagnostic, null);
  assert.equal(reveal.missing_edge, null);
  assert.equal(reveal.answer.label, 'Gambel oak');
});

// Ruling R1a. Two sibling varieties share one parent species. A variety miss
// must not resolve both sides to the parent symbol, because that writes a
// self-pair into missing_edge and prints the species sentence twice.
test('a variety miss records no edge and names both varieties', () => {
  const card = content.cards['variety:QUGAG:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(33) });
  assert.equal(q.answer_key, 'QUGAG');
  const reveal = buildReveal({ question: q, chosen_key: 'QUGAB', content });
  assert.equal(reveal.correct, false);
  assert.equal(reveal.missing_edge, null);
  assert.equal(reveal.diagnostic.kind, 'fallback');
  assert.equal(reveal.diagnostic.text, 'The answer is var. gambelii. You picked var. bakeri.');
  assert.equal(reveal.diagnostic.ref, null);
  // The reveal still reads the parent species for its facts.
  assert.equal(reveal.answer.facts.range_text, 'Colorado Plateau and southern Rockies');
});

test('a variety miss with no named card shows the answer alone', () => {
  const card = content.cards['variety:QUGAG:leaf'];
  const q = buildQuestion({
    card, content, state: { tier: 'typed' }, excluded_hashes: [], rng: makeRng(34)
  });
  const reveal = buildReveal({ question: q, chosen_key: null, content });
  assert.equal(reveal.correct, false);
  assert.equal(reveal.chosen, null);
  assert.equal(reveal.diagnostic, null);
  assert.equal(reveal.missing_edge, null);
  assert.equal(reveal.answer.label, 'var. gambelii');
});

test('a photo grid reveal credits every photo the question showed', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({
    card, content, state: { tier: 'inv' }, excluded_hashes: [], rng: makeRng(13)
  });
  const wrong = q.options.find((o) => o.key !== 'QUGA').key;
  const reveal = buildReveal({ question: q, chosen_key: wrong, content });
  const credits = revealCredits(q, reveal);
  assert.deepEqual(credits.map((c) => c.photo.hash), q.options.map((o) => o.photo.hash));
  assert.deepEqual(credits.map((c) => c.label), q.options.map((o) => o.label));
  assert.ok(credits.every((c) => c.from === 'question'));
});

test('a wrong pick credits the question photo and the pair photo', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(21) });
  const reveal = buildReveal({ question: q, chosen_key: 'QURU', content });
  const credits = revealCredits(q, reveal);
  assert.deepEqual(credits.map((c) => [c.photo.hash, c.label, c.from]), [
    [q.photo.hash, 'Gambel oak', 'question'],
    [reveal.chosen.photo.hash, 'Northern red oak', 'reveal']
  ]);
});

test('a right answer credits its one photo once', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(21) });
  const reveal = buildReveal({ question: q, chosen_key: 'QUGA', content });
  const credits = revealCredits(q, reveal);
  assert.equal(credits.length, 1);
  assert.equal(credits[0].photo.hash, q.photo.hash);
  assert.equal(credits[0].from, 'question');
});

test('a grid photo that failed to load gets no credit', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({
    card, content, state: { tier: 'inv' }, excluded_hashes: [], rng: makeRng(13)
  });
  const lost = q.options.find((o) => o.key !== 'QUGA').photo.hash;
  const reveal = buildReveal({ question: q, chosen_key: 'QUGA', content });
  const credits = revealCredits(q, reveal, [lost]);
  assert.equal(credits.length, q.options.length - 1);
  assert.ok(!credits.some((c) => c.photo.hash === lost));
});
