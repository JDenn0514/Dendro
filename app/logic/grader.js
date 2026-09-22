// Answer normalization and the match rules per card kind.

// The punctuation class keeps every whitespace character, so the collapse step
// that follows can turn a tab, a newline, or a non-breaking space into one space.
export function normalize(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[-‐-―]/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function varietyRecord(content, varietyKey) {
  for (const record of Object.values(content.species)) {
    for (const variety of record.varieties ?? []) {
      if (variety.key === varietyKey) return variety;
    }
  }
  return null;
}

export function acceptedAnswers(card, content) {
  const raw = [];
  if (card.kind === 'species') {
    const record = content.species[card.key];
    raw.push(record.scientific, ...record.common);
  } else if (card.kind === 'concept') {
    const concept = content.concepts.find(
      (c) => c.channel === card.channel && c.key === card.key
    );
    raw.push(...(concept?.accept ?? []));
  } else if (card.kind === 'group') {
    // genus_common is optional and a retired member donates nothing, so a group
    // with no live genus_common accepts the genus alone.
    raw.push(card.key);
    for (const record of Object.values(content.species)) {
      if (record.retired) continue;
      if (record.genus === card.key && record.genus_common) raw.push(record.genus_common);
    }
  } else if (card.kind === 'variety') {
    const variety = varietyRecord(content, card.key);
    raw.push(card.key);
    if (variety) raw.push(variety.name);
  }
  return [...new Set(raw.map(normalize).filter(Boolean))];
}

export function gradeTyped(card, text, content) {
  return acceptedAnswers(card, content).includes(normalize(text));
}

export function gradeChoice(answerKey, chosenKey) {
  return answerKey === chosenKey;
}

export function resolveTyped(text, kind, channel, content) {
  const target = normalize(text);
  if (!target) return null;
  for (const card of Object.values(content.cards)) {
    if (card.kind !== kind || card.channel !== channel) continue;
    if (acceptedAnswers(card, content).includes(target)) return card.key;
  }
  // A real category with no card still names itself.
  if (kind === 'concept') {
    for (const concept of content.concepts_by_channel[channel] ?? []) {
      if ((concept.accept ?? []).map(normalize).includes(target)) return concept.key;
    }
  }
  return null;
}
