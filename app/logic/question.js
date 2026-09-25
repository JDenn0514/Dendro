// Picks the format, samples a photo, builds options and distractors, builds the reveal.
import { cardId } from './content.js';
import { displayName } from './words.js';

// An inv question asks the learner to pick the photo. Below this many photo
// options the card asks mc8 instead.
const INV_OPTION_MINIMUM = 4;

// A concept or group question asks the learner to pick a name. Below this many
// name options the card asks typed instead.
const NAME_OPTION_MINIMUM = 4;

// How many options each multiple-choice format shows. An inv question shows the
// same count as mc8.
const MC4_OPTION_COUNT = 4;
const MC8_OPTION_COUNT = 8;

export function shuffle(items, rng = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function speciesCardSymbols(content, channel) {
  return Object.values(content.cards)
    .filter((c) => c.kind === 'species' && c.channel === channel)
    .map((c) => c.key);
}

export function varietyOf(content, varietyKey) {
  for (const [symbol, record] of Object.entries(content.species)) {
    for (const variety of record.varieties ?? []) {
      if (variety.key === varietyKey) return { symbol, variety };
    }
  }
  return { symbol: null, variety: null };
}

// The keys that can carry a photo option for this card, the answer included.
function invOptionKeys(content, card) {
  if (card.kind === 'concept') {
    return Object.values(content.cards)
      .filter((c) => c.kind === 'concept' && c.channel === card.channel)
      .map((c) => c.key);
  }
  if (card.kind === 'group') {
    return Object.values(content.cards)
      .filter((c) => c.kind === 'group' && c.channel === card.channel)
      .filter((c) => c.bucket === card.bucket)
      .map((c) => c.key);
  }
  if (card.kind === 'variety') {
    const { symbol } = varietyOf(content, card.key);
    return (content.species[symbol]?.varieties ?? [])
      .map((v) => v.key)
      .filter((k) => content.cards[cardId('variety', card.channel, k)]);
  }
  return speciesCardSymbols(content, card.channel);
}

export function invAvailable(content, card) {
  const keys = new Set(invOptionKeys(content, card));
  keys.add(card.key);
  return keys.size >= INV_OPTION_MINIMUM;
}

export function formatFor(state) {
  return state?.tier ?? 'mc4';
}

export function optionCountFor(format) {
  if (format === 'typed') return 0;
  return format === 'mc4' ? MC4_OPTION_COUNT : MC8_OPTION_COUNT;
}

// A photo's identity is its hash, so the same bytes under two manifest rows
// count as one image here.
export function pickPhoto(card, excludedHashes = [], rng = Math.random) {
  const usable = card.photos.filter((p) => !excludedHashes.includes(p.hash));
  if (usable.length === 0) return null;
  return usable[Math.floor(rng() * usable.length)];
}

function edgeNeighbours(content, symbol, channel, sameChannelOnly) {
  const out = [];
  for (const edge of content.confusion) {
    if (sameChannelOnly && edge.channel !== channel) continue;
    if (edge.a === symbol) out.push(edge.b);
    if (edge.b === symbol) out.push(edge.a);
  }
  return out;
}

export function speciesDistractors({ symbol, channel, count, content, rng = Math.random }) {
  const eligible = new Set(speciesCardSymbols(content, channel));
  eligible.delete(symbol);
  const record = content.species[symbol];
  const bucket = record.concepts?.[channel] ?? null;

  const steps = [
    edgeNeighbours(content, symbol, channel, true),
    edgeNeighbours(content, symbol, channel, false),
    [...eligible].filter((s) => content.species[s].genus === record.genus),
    [...eligible].filter((s) => content.species[s].family === record.family),
    [...eligible].filter((s) => content.species[s].concepts?.[channel] === bucket),
    [...eligible]
  ];

  const picked = [];
  for (const step of steps) {
    const fresh = [...new Set(step)].filter((s) => eligible.has(s) && !picked.includes(s));
    for (const candidate of shuffle(fresh, rng)) {
      if (picked.length >= count) break;
      picked.push(candidate);
    }
    if (picked.length >= count) break;
  }
  return picked;
}

function channelWords(channel) {
  return channel.replace(/_/gu, ' ');
}

function conceptRecord(content, channel, key) {
  return content.concepts.find((c) => c.channel === channel && c.key === key) ?? null;
}

export function labelFor(content, kind, channel, key) {
  if (kind === 'species') {
    const record = content.species[key];
    // Every label here is a display label: an answer button, the name on the
    // reveal, the caption under a thumb. The content keeps the botanical
    // lowercase form.
    return { label: displayName(record), sublabel: record.scientific };
  }
  if (kind === 'concept') {
    const concept = conceptRecord(content, channel, key);
    return { label: concept?.name ?? key, sublabel: '' };
  }
  if (kind === 'group') {
    // genus_common is optional. With no live member that carries one, the genus
    // fills both rows.
    const member = Object.values(content.species)
      .find((s) => s.genus === key && !s.retired && s.genus_common);
    return { label: member?.genus_common ?? key, sublabel: key };
  }
  const { symbol, variety } = varietyOf(content, key);
  return { label: variety?.name ?? key, sublabel: symbol ? content.species[symbol].scientific : '' };
}

// The question the answer card shows. A question with no image cannot be
// answered, so when the exclusion list covers the whole pool the card samples
// again with nothing excluded. Every format goes through here, so no path can
// forget the retry.
function answerPhotoFor(card, excludedHashes, rng) {
  return pickPhoto(card, excludedHashes, rng) ?? pickPhoto(card, [], rng);
}

function siblingKeys(card, content, count, rng) {
  if (card.kind === 'concept') {
    const others = content.concepts_by_channel[card.channel]
      .map((c) => c.key)
      .filter((k) => k !== card.key);
    return shuffle(others, rng).slice(0, count);
  }
  if (card.kind === 'group') {
    const others = Object.values(content.cards)
      .filter((c) => c.kind === 'group' && c.channel === card.channel)
      .filter((c) => c.bucket === card.bucket && c.key !== card.key)
      .map((c) => c.key);
    return shuffle(others, rng).slice(0, count);
  }
  if (card.kind === 'variety') {
    // Choice 15: the sibling set is the whole answer space, so every sibling shows.
    const { symbol } = varietyOf(content, card.key);
    const others = (content.species[symbol]?.varieties ?? [])
      .map((v) => v.key)
      .filter((k) => k !== card.key);
    return shuffle(others, rng);
  }
  return speciesDistractors({
    symbol: card.key, channel: card.channel, count, content, rng
  });
}

export function buildQuestion({ card, content, state, excluded_hashes = [], rng = Math.random }) {
  const tier = formatFor(state);
  // An inv question needs four photo options. Below that the card asks mc8 instead.
  const format = tier === 'inv' && !invAvailable(content, card) ? 'mc8' : tier;
  const base = {
    card_id: card.id, kind: card.kind, channel: card.channel, key: card.key,
    tier, answer_key: card.key
  };

  if (format === 'typed') {
    return {
      ...base, format: 'typed', prompt: promptFor(card.kind, card.channel),
      photo: answerPhotoFor(card, excluded_hashes, rng), options: [], option_count: 0
    };
  }

  const wanted = optionCountFor(format) - 1;
  const distractorKeys = siblingKeys(card, content, wanted, rng);

  if (format === 'inv') {
    const own = answerPhotoFor(card, excluded_hashes, rng);
    const options = [{ key: card.key, ...labelFor(content, card.kind, card.channel, card.key), photo: own }];
    for (const key of distractorKeys) {
      const other = content.cards[cardId(card.kind, card.channel, key)];
      const photo = other ? pickPhoto(other, [], rng) : null;
      if (photo) options.push({ key, ...labelFor(content, card.kind, card.channel, key), photo });
    }
    const shown = shuffle(options, rng);
    const { label } = labelFor(content, card.kind, card.channel, card.key);
    return {
      ...base, format: 'inv', prompt: `Which photo shows ${label}?`,
      photo: null, options: shown, option_count: shown.length
    };
  }

  const keys = [card.key, ...distractorKeys];
  if ((card.kind === 'concept' || card.kind === 'group') && keys.length < NAME_OPTION_MINIMUM) {
    return {
      ...base, format: 'typed', prompt: promptFor(card.kind, card.channel),
      photo: answerPhotoFor(card, excluded_hashes, rng), options: [], option_count: 0
    };
  }
  const options = shuffle(
    keys.map((key) => ({ key, ...labelFor(content, card.kind, card.channel, key), photo: null })),
    rng
  );
  return {
    ...base, format, prompt: promptFor(card.kind, card.channel),
    photo: answerPhotoFor(card, excluded_hashes, rng), options, option_count: options.length
  };
}

function promptFor(kind, channel) {
  if (kind === 'concept') return `What ${channelWords(channel)} type is this?`;
  if (kind === 'group') return 'Which genus?';
  if (kind === 'species') return 'Which species?';
  return 'Which variety?';
}

// An inv question carries its photos on the options, every other format on the
// question. The session screen and the reveal both need the answer's photo.
export function answerPhoto(question) {
  if (question.format === 'inv') {
    return question.options.find((o) => o.key === question.answer_key)?.photo ?? null;
  }
  return question.photo ?? null;
}

// Ruling R1a. Only a species card pairs by symbol. Two sibling varieties share
// one parent symbol, so resolving a variety here would pair a card with itself:
// missing_edge would hold { a: 'QUGA', b: 'QUGA' } and the species sentence
// would print twice. Choice 11 records species pairs only.
function speciesSymbolFor(kind, key) {
  return kind === 'species' ? key : null;
}

// The facts panel is a different question: a variety shows the parent species'
// range, height, and habitat. This resolves the parent, which speciesSymbolFor
// deliberately does not.
function factsSymbolFor(content, kind, key) {
  if (kind === 'species') return key;
  if (kind === 'variety') return varietyOf(content, key).symbol;
  return null;
}

function factsFor(content, kind, channel, key) {
  const symbol = factsSymbolFor(content, kind, key);
  if (symbol) {
    const record = content.species[symbol];
    return {
      range_text: record.range?.text ?? '',
      states: record.range?.states ?? [],
      planted_states: record.planted_states ?? [],
      elevation_ft: record.elevation_ft ?? null,
      height_ft: record.height_ft ?? null,
      habitat: record.habitat ?? '',
      native_status: record.native_status ?? '',
      description: ''
    };
  }
  if (kind === 'concept') {
    return { description: conceptRecord(content, channel, key)?.description ?? '' };
  }
  return { description: '' };
}

function findEdge(content, a, b, channel) {
  return content.confusion.find(
    (e) => e.channel === channel
      && ((e.a === a && e.b === b) || (e.a === b && e.b === a))
  ) ?? null;
}

function fallbackText(content, kind, channel, answerKey, chosenKey) {
  const answerSymbol = speciesSymbolFor(kind, answerKey);
  const chosenSymbol = speciesSymbolFor(kind, chosenKey);
  if (answerSymbol && chosenSymbol) {
    const describe = (symbol) => {
      const record = content.species[symbol];
      const bucket = conceptRecord(content, channel, record.concepts?.[channel]);
      return `${displayName(record)} is ${bucket?.name ?? 'uncategorised'}, genus ${record.genus}.`;
    };
    return `${describe(answerSymbol)} ${describe(chosenSymbol)}`;
  }
  const sentence = (text) => (/[.!?]$/u.test(text) ? text : `${text}.`);
  const describeKey = (key) => {
    const { label } = labelFor(content, kind, channel, key);
    const concept = kind === 'concept' ? conceptRecord(content, channel, key) : null;
    return sentence(concept ? `${label}: ${concept.description}` : label);
  };
  return `The answer is ${describeKey(answerKey)} You picked ${describeKey(chosenKey)}`;
}

export function buildReveal({ question, chosen_key, content }) {
  const { kind, channel, answer_key: answerKey } = question;
  const correct = chosen_key === answerKey;

  const answerCard = content.cards[cardId(kind, channel, answerKey)];

  const answer = {
    key: answerKey,
    ...labelFor(content, kind, channel, answerKey),
    photo: answerPhoto(question) ?? answerCard?.photos[0] ?? null,
    facts: factsFor(content, kind, channel, answerKey)
  };

  if (correct || chosen_key === null) {
    return {
      correct, card_id: question.card_id, channel, answer,
      chosen: null, diagnostic: null, missing_edge: null
    };
  }

  const chosenCard = content.cards[cardId(kind, channel, chosen_key)];
  const chosenPhoto = question.format === 'inv'
    ? question.options.find((o) => o.key === chosen_key)?.photo ?? null
    : chosenCard?.photos[0] ?? null;
  const chosen = {
    key: chosen_key,
    ...labelFor(content, kind, channel, chosen_key),
    photo: chosenPhoto
  };

  const answerSymbol = speciesSymbolFor(kind, answerKey);
  const chosenSymbol = speciesSymbolFor(kind, chosen_key);
  const edge = answerSymbol && chosenSymbol
    ? findEdge(content, answerSymbol, chosenSymbol, channel)
    : null;

  if (edge) {
    const text = edge.a === answerSymbol ? edge.a_not_b : edge.b_not_a;
    return {
      correct: false, card_id: question.card_id, channel, answer, chosen,
      diagnostic: { kind: 'edge', text, ref: edge.ref }, missing_edge: null
    };
  }

  const missing = answerSymbol && chosenSymbol
    ? { a: [answerSymbol, chosenSymbol].sort()[0], b: [answerSymbol, chosenSymbol].sort()[1], channel }
    : null;

  return {
    correct: false, card_id: question.card_id, channel, answer, chosen,
    diagnostic: { kind: 'fallback', text: fallbackText(content, kind, channel, answerKey, chosen_key), ref: null },
    missing_edge: missing
  };
}
