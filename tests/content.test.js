import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import {
  CDN_BASE, imageUrl, deriveChannels, cardId, photoPool, deriveCards,
  unitMembers, unitCards, validateContent, loadContent,
  channelLabel, conceptFor, unitFor, varietyCardChannels
} from '../app/logic/content.js';

test('the channel list derives from concepts.json', () => {
  const raw = loadFixture();
  assert.deepEqual(deriveChannels(raw.concepts), ['leaf', 'bark', 'fruit']);
  assert.ok(!deriveChannels(raw.concepts).includes('flower'));
});

test('imageUrl builds the object URL from the base and the hash', () => {
  const photo = { hash: 'a'.repeat(64) };
  assert.ok(CDN_BASE.endsWith('/'));
  assert.equal(imageUrl(photo, 'content_dev/images/'), `content_dev/images/img/${'a'.repeat(64)}.jpg`);
  assert.equal(imageUrl(photo, CDN_BASE), `${CDN_BASE}img/${'a'.repeat(64)}.jpg`);
});

test('card IDs use the spec format', () => {
  assert.equal(cardId('concept', 'bark', 'plated'), 'concept:bark:plated');
  assert.equal(cardId('group', 'leaf', 'Quercus'), 'group:leaf:Quercus');
  assert.equal(cardId('species', 'bark', 'QUGA'), 'species:QUGA:bark');
  assert.equal(cardId('variety', 'leaf', 'QUGAG'), 'variety:QUGAG:leaf');
});

test('photo pools union the member species images', () => {
  const raw = loadFixture();
  assert.equal(photoPool(raw, 'species', 'leaf', 'QUGA').length, 2);
  assert.equal(photoPool(raw, 'group', 'leaf', 'Quercus').length, 4);
  assert.equal(photoPool(raw, 'concept', 'leaf', 'simple_lobed').length, 7);
  assert.equal(photoPool(raw, 'concept', 'bark', 'plated').length, 1);
  assert.equal(photoPool(raw, 'variety', 'leaf', 'QUGAG').length, 1);
});

test('a concept pool skips an override row from another channel', () => {
  const raw = loadFixture();
  const override = raw.manifest.find((m) => m.target === 'bark/plated');
  const stray = { ...override, hash: 'b'.repeat(64), channel: 'leaf' };
  raw.manifest = [...raw.manifest, stray];
  assert.equal(photoPool(raw, 'concept', 'bark', 'plated').length, 1);
});

test('a retired row and a retired species stay out of every pool', () => {
  const raw = loadFixture();
  assert.equal(raw.manifest.filter((m) => m.target === 'QUGA' && m.channel === 'leaf').length, 3);
  assert.equal(photoPool(raw, 'species', 'leaf', 'QUGA').length, 2);
  assert.equal(photoPool(raw, 'species', 'leaf', 'LIST2').length, 0);
  assert.equal(photoPool(raw, 'group', 'leaf', 'Liquidambar').length, 0);
  assert.equal(photoPool(raw, 'concept', 'leaf', 'simple_lobed').length, 7);
});

test('a variety of a retired species has an empty pool', () => {
  const raw = loadFixture();
  assert.equal(photoPool(raw, 'variety', 'leaf', 'QUGAG').length, 1);
  raw.species.QUGA.retired = true;
  raw.species.QUGA.retired_reason = 'No approved photo survived the license check.';
  raw.species.QUGA.retired_at = '2026-09-22';
  assert.deepEqual(photoPool(raw, 'variety', 'leaf', 'QUGAG'), []);
  assert.deepEqual(photoPool(raw, 'variety', 'leaf', 'QUGAB'), []);
  const cards = deriveCards(raw, deriveChannels(raw.concepts));
  assert.ok(!cards['variety:QUGAG:leaf']);
});

test('cards derive only where images exist', () => {
  const raw = loadFixture();
  const cards = deriveCards(raw, deriveChannels(raw.concepts));
  assert.equal(Object.keys(cards).length, 25);
  assert.ok(cards['species:ACPL:leaf']);
  assert.ok(cards['species:ACPL:fruit']);
  assert.ok(!cards['species:ACPL:bark']);
  assert.ok(!cards['species:QUVE:leaf']);
  assert.ok(cards['variety:QUGAG:leaf']);
  assert.ok(cards['variety:QUGAB:leaf']);
});

test('a retired species makes no card', () => {
  const raw = loadFixture();
  const cards = deriveCards(raw, deriveChannels(raw.concepts));
  assert.ok(!cards['species:LIST2:leaf']);
  assert.ok(!cards['group:leaf:Liquidambar']);
  for (const card of Object.values(cards)) {
    for (const photo of card.photos) assert.ok(!photo.retired);
  }
});

test('one variety with a photo makes no variety card', () => {
  const raw = loadFixture();
  raw.manifest = raw.manifest.filter((m) => m.target !== 'QUGAB');
  const cards = deriveCards(raw, deriveChannels(raw.concepts));
  assert.ok(!cards['variety:QUGAG:leaf']);
  assert.ok(!cards['variety:QUGAB:leaf']);
  assert.equal(Object.keys(cards).length, 23);
});

test('a group card takes the bucket of the first member that has one', () => {
  const raw = loadFixture();
  delete raw.species.ACPL.concepts.leaf;
  const cards = deriveCards(raw, deriveChannels(raw.concepts));
  assert.equal(cards['group:leaf:Acer'].bucket, 'simple_lobed');
});

test('unit membership applies states, genera, section, include, exclude in order', () => {
  const raw = loadFixture();
  const unit = (key) => raw.units.find((u) => u.key === key);

  assert.deepEqual(unitMembers(raw, unit('leaf_types')), []);
  assert.deepEqual(
    unitMembers(raw, unit('simple_lobed_genus')).sort(),
    ['ACPL', 'ACSA2', 'LIST2', 'PLOC', 'QUGA', 'QURU', 'QUVE']
  );
  assert.deepEqual(unitMembers(raw, unit('simple_lobed_white_oaks_co')), ['QUGA']);
  assert.deepEqual(unitMembers(raw, unit('simple_lobed_red_oaks_co')), ['QURU']);
  assert.deepEqual(unitMembers(raw, unit('simple_lobed_maples_co')).sort(), ['ACPL', 'ACSA2']);
  assert.deepEqual(unitMembers(raw, unit('simple_lobed_other_co')), ['PLOC']);
});

test('unit cards follow the unit level', () => {
  const raw = loadFixture();
  const cards = deriveCards(raw, deriveChannels(raw.concepts));
  const ids = (key) => unitCards(raw.units.find((u) => u.key === key), cards, raw).sort();

  assert.deepEqual(ids('leaf_types'), ['concept:leaf:simple_lobed']);
  assert.deepEqual(
    ids('bark_types'),
    ['concept:bark:furrowed', 'concept:bark:papery', 'concept:bark:plated']
  );
  assert.deepEqual(
    ids('simple_lobed_genus'),
    ['group:leaf:Acer', 'group:leaf:Platanus', 'group:leaf:Quercus']
  );
  assert.ok(!ids('simple_lobed_genus').includes('group:leaf:Liquidambar'));
  assert.deepEqual(ids('simple_lobed_maples_co'), ['species:ACPL:leaf', 'species:ACSA2:leaf']);
  assert.deepEqual(ids('quga_varieties'), ['variety:QUGAB:leaf', 'variety:QUGAG:leaf']);
});

function badContent(patch) {
  return {
    species: {
      QUGA: {
        scientific: 'Quercus gambelii', common: ['Gambel oak'], genus: 'Quercus',
        genus_common: 'oak', section: 'Quercus', family: 'Fagaceae',
        arrangement: 'alternate', concepts: { leaf: 'simple_lobed' },
        range: { text: 'x', states: ['CO'] }, planted_states: [],
        elevation_ft: [1, 2], height_ft: [1, 2], habitat: 'x',
        native_status: 'native', varieties: []
      }
    },
    concepts: [{ key: 'simple_lobed', channel: 'leaf', name: 'Lobed', accept: ['lobed'], description: 'x' }],
    confusion: [],
    units: [{ key: 'leaf_types', name: 'Leaf types', channel: 'leaf', level: 1, parent: null }],
    manifest: [{ hash: '1'.repeat(64), target: 'QUGA', channel: 'leaf', source: 'x', author: 'x', license: 'public domain', origin: 'x', tags: [], checked_by: 'x', checked_at: '2026-09-22', note: 'x' }],
    ...patch
  };
}

function messages(raw) {
  return validateContent(raw).errors.map((e) => e.message).join(' | ');
}

test('an empty channel renders nowhere', () => {
  const raw = loadFixture();
  const result = loadContent(raw);
  assert.equal(result.ok, true);
  assert.ok(!result.content.channels.includes('twig_buds'));
  for (const card of Object.values(result.content.cards)) {
    assert.ok(result.content.channels.includes(card.channel));
  }
  assert.deepEqual(result.content.unit_cards.leaf_types, ['concept:leaf:simple_lobed']);
});

test('the fixture validates with no errors and size warnings only', () => {
  const report = validateContent(loadFixture());
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.length > 0);
  assert.ok(report.warnings.every((w) => w.message.includes('cards')));
});

test('each validation rule fails on its own bad object', () => {
  const noGenus = badContent();
  delete noGenus.species.QUGA.genus;
  assert.match(messages(noGenus), /genus/);

  const noFamily = badContent();
  delete noFamily.species.QUGA.family;
  assert.match(messages(noFamily), /family/);

  const noCommon = badContent({});
  noCommon.species.QUGA.common = [];
  assert.match(messages(noCommon), /common name/);

  const noImage = badContent({ manifest: [] });
  assert.match(messages(noImage), /no manifest image/);

  const edgeSaves = badContent({
    manifest: [],
    confusion: [{ a: 'QUGA', b: 'QUGA', channel: 'leaf', a_not_b: 'x', b_not_a: 'y', ref: 'z' }]
  });
  assert.deepEqual(validateContent(edgeSaves).errors, []);

  const badTarget = badContent();
  badTarget.manifest[0].target = 'ZZZZ';
  assert.match(messages(badTarget), /unknown target/);

  const badConcept = badContent();
  badConcept.species.QUGA.concepts = { leaf: 'not_a_bucket' };
  assert.match(messages(badConcept), /unknown concept/);

  const badEdge = badContent({
    confusion: [{ a: 'QUGA', b: 'ZZZZ', channel: 'leaf', a_not_b: 'x', b_not_a: 'y', ref: 'z' }]
  });
  assert.match(messages(badEdge), /unknown species/);

  const badEdgeChannel = badContent({
    confusion: [{ a: 'QUGA', b: 'QUGA', channel: 'twig_buds', a_not_b: 'x', b_not_a: 'y', ref: 'z' }]
  });
  assert.match(messages(badEdgeChannel), /unknown channel/);

  const badInclude = badContent();
  badInclude.units.push({ key: 'u2', name: 'U2', channel: 'leaf', level: 2, parent: 'leaf_types', bucket: 'simple_lobed', states: ['CO'], include: ['ZZZZ'], exclude: [] });
  assert.match(messages(badInclude), /include/);

  const badParent = badContent();
  badParent.units.push({ key: 'u3', name: 'U3', channel: 'leaf', level: 3, parent: 'leaf_types', bucket: 'simple_lobed', states: ['CO'] });
  assert.match(messages(badParent), /parent/);

  const badGenera = badContent();
  badGenera.units.push({ key: 'u4', name: 'U4', channel: 'leaf', level: 2, parent: 'leaf_types', bucket: 'simple_lobed', states: ['CO'], genera: ['Nothingus'] });
  assert.match(messages(badGenera), /genera/);

  const badSection = badContent();
  badSection.units.push({ key: 'u5', name: 'U5', channel: 'leaf', level: 2, parent: 'leaf_types', bucket: 'simple_lobed', states: ['CO'], section: 'Nothingae' });
  assert.match(messages(badSection), /section/);
});

test('a concept override image on the wrong channel fails validation', () => {
  const crossed = badContent();
  crossed.manifest.push({
    hash: '2'.repeat(64), target: 'leaf/simple_lobed',
    channel: 'bark', source: 'x', author: 'x', license: 'public domain', origin: 'x',
    tags: [], checked_by: 'x', checked_at: '2026-09-22', note: 'x'
  });
  assert.match(messages(crossed), /its target names leaf/);
});

test('a species image with no concept on that channel fails validation', () => {
  const orphan = badContent();
  orphan.concepts.push({ key: 'furrowed', channel: 'bark', name: 'Furrowed', accept: ['furrowed'], description: 'x' });
  orphan.manifest.push({
    hash: '3'.repeat(64), target: 'QUGA', channel: 'bark', source: 'x',
    author: 'x', license: 'public domain', origin: 'x', tags: [], checked_by: 'x',
    checked_at: '2026-09-22', note: 'x'
  });
  assert.match(messages(orphan), /bark image but no bark concept/);

  const retiredRow = badContent();
  retiredRow.concepts.push({ key: 'furrowed', channel: 'bark', name: 'Furrowed', accept: ['furrowed'], description: 'x' });
  retiredRow.manifest.push({
    hash: '3'.repeat(64), target: 'QUGA', channel: 'bark', source: 'x',
    author: 'x', license: 'public domain', origin: 'x', tags: [], checked_by: 'x',
    checked_at: '2026-09-22', note: 'x', retired: true,
    retired_reason: 'x', retired_at: '2026-09-22'
  });
  assert.deepEqual(validateContent(retiredRow).errors, []);
});

test('a variety image with no parent concept on that channel fails validation', () => {
  const twoVarieties = [
    { key: 'QUGAG', name: 'var. gambelii', note: 'x' },
    { key: 'QUGAB', name: 'var. bakeri', note: 'x' }
  ];
  const varietyRow = (hash, key, channel) => ({
    hash, target: key, channel, source: 'x', author: 'x', license: 'public domain',
    origin: 'x', tags: [], checked_by: 'x', checked_at: '2026-09-22', note: 'x'
  });

  const orphan = badContent();
  orphan.species.QUGA.varieties = twoVarieties;
  orphan.concepts.push({ key: 'furrowed', channel: 'bark', name: 'Furrowed', accept: ['furrowed'], description: 'x' });
  orphan.manifest.push(varietyRow('4'.repeat(64), 'QUGAG', 'bark'));
  orphan.manifest.push(varietyRow('5'.repeat(64), 'QUGAB', 'bark'));
  const report = validateContent(orphan);
  assert.match(messages(orphan), /QUGA has no bark concept/);
  assert.ok(report.errors.every((e) => e.file === 'images/manifest.json'));

  const onOwnChannel = badContent();
  onOwnChannel.species.QUGA.varieties = twoVarieties;
  onOwnChannel.manifest.push(varietyRow('4'.repeat(64), 'QUGAG', 'leaf'));
  onOwnChannel.manifest.push(varietyRow('5'.repeat(64), 'QUGAB', 'leaf'));
  assert.deepEqual(validateContent(onOwnChannel).errors, []);
  const cards = deriveCards(onOwnChannel, deriveChannels(onOwnChannel.concepts));
  assert.equal(cards['variety:QUGAG:leaf'].bucket, 'simple_lobed');

  const retiredRow = badContent();
  retiredRow.species.QUGA.varieties = twoVarieties;
  retiredRow.concepts.push({ key: 'furrowed', channel: 'bark', name: 'Furrowed', accept: ['furrowed'], description: 'x' });
  retiredRow.manifest.push({
    ...varietyRow('4'.repeat(64), 'QUGAG', 'bark'),
    retired: true, retired_reason: 'x', retired_at: '2026-09-22'
  });
  assert.deepEqual(validateContent(retiredRow).errors, []);
});

test('a card and the content object keep their field names', () => {
  const { content } = loadContent(loadFixture());
  assert.deepEqual(
    Object.keys(content.cards['species:QUGA:leaf']).sort(),
    ['bucket', 'channel', 'id', 'key', 'kind', 'photos']
  );
  assert.deepEqual(
    Object.keys(content.cards['variety:QUGAG:leaf']).sort(),
    ['bucket', 'channel', 'id', 'key', 'kind', 'photos']
  );
  assert.deepEqual(
    Object.keys(content).sort(),
    [
      'cards', 'cards_by_channel', 'channels', 'concepts', 'concepts_by_channel',
      'confusion', 'manifest', 'species', 'unit_cards', 'unit_members', 'units',
      'warnings'
    ]
  );
});

test('a manifest row needs a 64 hex hash and carries no file path', () => {
  const shortHash = badContent();
  shortHash.manifest[0].hash = 'abc';
  assert.match(messages(shortHash), /64 hex hash/);

  const upperHash = badContent();
  upperHash.manifest[0].hash = 'A'.repeat(64);
  assert.match(messages(upperHash), /64 hex hash/);

  const withFile = badContent();
  withFile.manifest[0].file = 'images/QUGA/leaf/001.jpg';
  assert.match(messages(withFile), /file field/);
});

test('two rows share a hash unless the target and the channel also match', () => {
  const twoTargets = badContent();
  twoTargets.manifest.push({ ...twoTargets.manifest[0], target: 'leaf/simple_lobed' });
  assert.deepEqual(validateContent(twoTargets).errors, []);

  const samePair = badContent();
  samePair.manifest.push({ ...samePair.manifest[0] });
  assert.match(messages(samePair), /duplicate row/);
});

test('a retired species needs no live image', () => {
  const retired = badContent();
  retired.species.QUGA.retired = true;
  retired.species.QUGA.retired_reason = 'No approved photo survived the license check.';
  retired.species.QUGA.retired_at = '2026-09-22';
  retired.manifest[0].retired = true;
  retired.manifest[0].retired_reason = 'The species left the v0 pool.';
  retired.manifest[0].retired_at = '2026-09-22';
  assert.deepEqual(validateContent(retired).errors, []);

  const live = badContent();
  live.manifest[0].retired = true;
  live.manifest[0].retired_reason = 'x';
  live.manifest[0].retired_at = '2026-09-22';
  assert.match(messages(live), /no manifest image/);
});

test('a unit outside 5 to 25 cards warns and does not fail', () => {
  const report = validateContent(badContent());
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.some((w) => w.message.includes('leaf_types')));
});

test('loadContent returns errors instead of content when validation fails', () => {
  const broken = badContent();
  delete broken.species.QUGA.family;
  const result = loadContent(broken);
  assert.equal(result.ok, false);
  assert.equal(result.content, null);
  assert.equal(result.errors[0].file, 'species.json');
});

test('channelLabel spaces the channel key', () => {
  assert.equal(channelLabel('leaf'), 'leaf');
  assert.equal(channelLabel('twig_buds'), 'twig buds');
});

test('conceptFor finds the concept record or returns null', () => {
  const { content } = loadContent(loadFixture());
  assert.equal(conceptFor(content, 'bark', 'plated').name, 'Plated / blocky');
  assert.equal(conceptFor(content, 'leaf', 'plated'), null);
});

test('unitFor finds the unit record or returns null', () => {
  const { content } = loadContent(loadFixture());
  assert.equal(unitFor(content, 'simple_lobed_maples_co').name, 'Maples');
  assert.equal(unitFor(content, 'no_such_unit'), null);
});

test('varietyCardChannels lists the channels that hold a variety card', () => {
  const { content } = loadContent(loadFixture());
  assert.deepEqual(varietyCardChannels(content, 'QUGA', 'QUGAG'), ['leaf']);
  assert.deepEqual(varietyCardChannels(content, 'QURU', 'QUGAG'), []);
});
