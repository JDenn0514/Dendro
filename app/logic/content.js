// Loads, validates, and indexes content. Pure: no DOM, no fetch, no storage.

const LEVEL_KIND = { 1: 'concept', 2: 'group', 3: 'species', 4: 'variety' };

// A unit holds this many cards. Outside the band, validation warns.
const UNIT_CARDS_MIN = 5;
const UNIT_CARDS_MAX = 25;

// The content pipeline's bucket setup supplies the real host. See the pipeline spec, section 2.
export const CDN_BASE = 'https://REPLACE-WITH-CDN-HOST/';

export function imageUrl(photo, base) {
  return `${base}img/${photo.hash}.jpg`;
}

export function deriveChannels(concepts) {
  const seen = [];
  for (const concept of concepts) {
    if (!seen.includes(concept.channel)) seen.push(concept.channel);
  }
  return seen;
}

export function cardId(kind, channel, key) {
  if (kind === 'concept' || kind === 'group') return `${kind}:${channel}:${key}`;
  return `${kind}:${key}:${channel}`;
}

function speciesImages(raw, symbol, channel) {
  return raw.manifest.filter(
    (m) => m.target === symbol && m.channel === channel && !m.retired
  );
}

// A variety key is not a key of raw.species, so find the species that owns it.
function ownerOfVariety(raw, varietyKey) {
  for (const record of Object.values(raw.species)) {
    if ((record.varieties ?? []).some((v) => v.key === varietyKey)) return record;
  }
  return null;
}

export function photoPool(raw, kind, channel, key) {
  if (kind === 'species' || kind === 'variety') {
    const owner = kind === 'variety' ? ownerOfVariety(raw, key) : raw.species[key];
    if (owner?.retired) return [];
    return speciesImages(raw, key, channel);
  }
  const pool = [];
  for (const [symbol, record] of Object.entries(raw.species)) {
    if (record.retired) continue;
    if (kind === 'group' && record.genus !== key) continue;
    if (kind === 'concept' && record.concepts?.[channel] !== key) continue;
    pool.push(...speciesImages(raw, symbol, channel));
  }
  if (kind === 'concept') {
    pool.push(...raw.manifest.filter(
      (m) => m.target === `${channel}/${key}` && m.channel === channel && !m.retired
    ));
  }
  return pool;
}

function liveSpecies(raw) {
  return Object.entries(raw.species).filter(([, record]) => !record.retired);
}

function groupBucket(raw, genus, channel) {
  const symbols = liveSpecies(raw)
    .map(([symbol]) => symbol)
    .filter((s) => raw.species[s].genus === genus)
    .filter((s) => speciesImages(raw, s, channel).length > 0)
    .sort();
  for (const symbol of symbols) {
    const bucket = raw.species[symbol].concepts?.[channel];
    if (bucket) return bucket;
  }
  return null;
}

export function deriveCards(raw, channels) {
  const cards = {};
  const add = (kind, channel, key, bucket) => {
    const photos = photoPool(raw, kind, channel, key);
    if (photos.length === 0) return;
    const id = cardId(kind, channel, key);
    cards[id] = { id, kind, channel, key, bucket, photos };
  };

  for (const channel of channels) {
    for (const concept of raw.concepts) {
      if (concept.channel === channel) add('concept', channel, concept.key, concept.key);
    }
    const genera = [...new Set(liveSpecies(raw).map(([, s]) => s.genus))].sort();
    for (const genus of genera) add('group', channel, genus, groupBucket(raw, genus, channel));
    for (const [symbol, record] of liveSpecies(raw)) {
      const bucket = record.concepts?.[channel] ?? null;
      if (bucket) add('species', channel, symbol, bucket);
      const withPhotos = (record.varieties ?? [])
        .filter((v) => speciesImages(raw, v.key, channel).length > 0);
      if (withPhotos.length >= 2) {
        for (const variety of withPhotos) add('variety', channel, variety.key, bucket);
      }
    }
  }
  return cards;
}

export function unitMembers(raw, unit) {
  if (unit.level === 1) return [];
  const states = unit.states ?? [];
  const kept = [];
  for (const [symbol, record] of Object.entries(raw.species)) {
    if (record.concepts?.[unit.channel] !== unit.bucket) continue;
    const ranges = [...(record.range?.states ?? []), ...(record.planted_states ?? [])];
    if (!ranges.some((s) => states.includes(s))) continue;
    if (unit.genera && !unit.genera.includes(record.genus)) continue;
    if (unit.section && record.section !== unit.section) continue;
    kept.push(symbol);
  }
  for (const symbol of unit.include ?? []) {
    if (raw.species[symbol] && !kept.includes(symbol)) kept.push(symbol);
  }
  return kept.filter((symbol) => !(unit.exclude ?? []).includes(symbol));
}

export function unitCards(unit, cards, raw) {
  const kind = LEVEL_KIND[unit.level];
  if (kind === 'concept') {
    return Object.values(cards)
      .filter((c) => c.kind === 'concept' && c.channel === unit.channel)
      .map((c) => c.id);
  }
  const members = unitMembers(raw, unit);
  if (kind === 'group') {
    const genera = [...new Set(members.map((s) => raw.species[s].genus))];
    return genera
      .map((g) => cardId('group', unit.channel, g))
      .filter((id) => cards[id]);
  }
  if (kind === 'species') {
    return members
      .map((s) => cardId('species', unit.channel, s))
      .filter((id) => cards[id]);
  }
  const ids = [];
  for (const symbol of members) {
    for (const variety of raw.species[symbol].varieties ?? []) {
      const id = cardId('variety', unit.channel, variety.key);
      if (cards[id]) ids.push(id);
    }
  }
  return ids;
}

export function validateContent(raw) {
  const errors = [];
  const warnings = [];
  const fail = (file, message) => errors.push({ file, message });
  const warn = (file, message) => warnings.push({ file, message });

  const channels = deriveChannels(raw.concepts);
  const conceptKeys = new Set(raw.concepts.map((c) => `${c.channel}/${c.key}`));
  const symbols = new Set(Object.keys(raw.species));
  const varietyKeys = new Set();
  for (const record of Object.values(raw.species)) {
    for (const variety of record.varieties ?? []) varietyKeys.add(variety.key);
  }
  const namedByEdge = new Set();
  for (const edge of raw.confusion) {
    namedByEdge.add(edge.a);
    namedByEdge.add(edge.b);
  }

  for (const [symbol, record] of Object.entries(raw.species)) {
    if (!record.genus) fail('species.json', `${symbol} has no genus`);
    if (!record.family) fail('species.json', `${symbol} has no family`);
    if (!record.common || record.common.length === 0) {
      fail('species.json', `${symbol} has no common name`);
    }
    const hasImage = raw.manifest.some((m) => m.target === symbol && !m.retired);
    if (!hasImage && !namedByEdge.has(symbol) && !record.retired) {
      fail('species.json', `${symbol} has no manifest image and no confusion edge`);
    }
    for (const [channel, bucket] of Object.entries(record.concepts ?? {})) {
      if (!conceptKeys.has(`${channel}/${bucket}`)) {
        fail('species.json', `${symbol} has an unknown concept ${channel}/${bucket}`);
      }
    }
    for (const channel of channels) {
      const onChannel = raw.manifest.some(
        (m) => m.target === symbol && m.channel === channel && !m.retired
      );
      if (onChannel && !record.concepts?.[channel]) {
        fail('species.json', `${symbol} has a ${channel} image but no ${channel} concept`);
      }
    }
  }

  const seenRows = new Set();
  for (const image of raw.manifest) {
    const where = `${image.target} ${image.channel}`;
    if (typeof image.hash !== 'string' || !/^[0-9a-f]{64}$/.test(image.hash)) {
      fail('images/manifest.json', `the ${where} row has no 64 hex hash`);
    }
    if (image.file !== undefined) {
      fail('images/manifest.json', `the ${where} row carries a file field; a row names its image by hash`);
    }
    const pair = `${image.hash}|${image.target}|${image.channel}`;
    if (seenRows.has(pair)) {
      fail('images/manifest.json', `duplicate row for ${where} and hash ${image.hash}`);
    }
    seenRows.add(pair);
    const known = symbols.has(image.target)
      || varietyKeys.has(image.target)
      || conceptKeys.has(image.target);
    if (!known) fail('images/manifest.json', `unknown target ${image.target}`);
    if (conceptKeys.has(image.target)) {
      const targetChannel = image.target.split('/')[0];
      if (image.channel !== targetChannel) {
        fail('images/manifest.json',
          `the ${where} row has channel ${image.channel} but its target names ${targetChannel}`);
      }
    }
  }

  for (const edge of raw.confusion) {
    if (!symbols.has(edge.a)) fail('confusion.json', `unknown species ${edge.a}`);
    if (!symbols.has(edge.b)) fail('confusion.json', `unknown species ${edge.b}`);
    if (!channels.includes(edge.channel)) {
      fail('confusion.json', `unknown channel ${edge.channel}`);
    }
  }

  const unitByKey = Object.fromEntries(raw.units.map((u) => [u.key, u]));
  const allGenera = new Set(Object.values(raw.species).map((s) => s.genus));
  const allSections = new Set(
    Object.values(raw.species).map((s) => s.section).filter(Boolean)
  );
  for (const unit of raw.units) {
    for (const symbol of [...(unit.include ?? []), ...(unit.exclude ?? [])]) {
      if (!symbols.has(symbol)) {
        fail('units.json', `${unit.key} include or exclude names unknown ${symbol}`);
      }
    }
    if (unit.level === 1) {
      if (unit.parent !== null) fail('units.json', `${unit.key} is level 1 and needs a null parent`);
    } else {
      const parent = unitByKey[unit.parent];
      if (!parent) {
        fail('units.json', `${unit.key} has an unknown parent ${unit.parent}`);
      } else if (parent.level !== unit.level - 1 || parent.channel !== unit.channel) {
        fail('units.json', `${unit.key} parent ${unit.parent} is not one level up in the same channel`);
      }
    }
    for (const genus of unit.genera ?? []) {
      if (!allGenera.has(genus)) fail('units.json', `${unit.key} genera names unknown ${genus}`);
    }
    if (unit.section && !allSections.has(unit.section)) {
      fail('units.json', `${unit.key} section names unknown ${unit.section}`);
    }
  }

  if (errors.length === 0) {
    const cards = deriveCards(raw, channels);
    for (const unit of raw.units) {
      const count = unitCards(unit, cards, raw).length;
      if (count < UNIT_CARDS_MIN || count > UNIT_CARDS_MAX) {
        warn('units.json',
          `${unit.key} holds ${count} cards, outside the range ${UNIT_CARDS_MIN} to ${UNIT_CARDS_MAX}`);
      }
    }
  }

  return { errors, warnings };
}

export function loadContent(raw) {
  const { errors, warnings } = validateContent(raw);
  if (errors.length > 0) return { ok: false, content: null, errors, warnings };

  const channels = deriveChannels(raw.concepts);
  const cards = deriveCards(raw, channels);
  const cardsByChannel = {};
  for (const channel of channels) {
    cardsByChannel[channel] = Object.values(cards)
      .filter((c) => c.channel === channel)
      .map((c) => c.id);
  }
  const conceptsByChannel = {};
  for (const channel of channels) {
    conceptsByChannel[channel] = raw.concepts.filter((c) => c.channel === channel);
  }
  const unitMembersByKey = {};
  const unitCardsByKey = {};
  for (const unit of raw.units) {
    unitMembersByKey[unit.key] = unitMembers(raw, unit);
    unitCardsByKey[unit.key] = unitCards(unit, cards, raw);
  }

  const content = {
    species: raw.species,
    concepts: raw.concepts,
    confusion: raw.confusion,
    units: raw.units,
    manifest: raw.manifest,
    channels,
    concepts_by_channel: conceptsByChannel,
    cards,
    cards_by_channel: cardsByChannel,
    unit_members: unitMembersByKey,
    unit_cards: unitCardsByKey,
    warnings
  };
  return { ok: true, content, errors: [], warnings };
}

export function channelLabel(channel) {
  return channel.replaceAll('_', ' ');
}

export function conceptFor(content, channel, key) {
  return content.concepts.find((c) => c.channel === channel && c.key === key) ?? null;
}

export function unitFor(content, unitKey) {
  return content.units.find((u) => u.key === unitKey) ?? null;
}

export function varietyCardChannels(content, symbol, varietyKey) {
  const record = content.species[symbol];
  const owned = (record?.varieties ?? []).some((v) => v.key === varietyKey);
  if (!owned) return [];
  return content.channels
    .filter((channel) => content.cards[cardId('variety', channel, varietyKey)])
    .sort();
}

export { LEVEL_KIND };
