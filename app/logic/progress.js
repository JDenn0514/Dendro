// Card levels, species levels, unit numbers, and the unit gate.
import { cardId, conceptFor } from './content.js';
import { numberWord } from './words.js';

export const LEVEL_NAMES = ['new', 'seen', 'familiar', 'strong', 'expert'];
export const GATE_THRESHOLD = 0.8;

export function cardLevel(state) {
  if (!state || !state.tier) return 0;
  if (state.tier === 'mc4') return 1;
  if (state.tier === 'mc8') return 2;
  if (state.tier === 'inv') return 3;
  return (state.tier_passes ?? 0) >= 1 ? 4 : 3;
}

export function speciesCardIds(symbol, content) {
  return content.channels
    .map((channel) => cardId('species', channel, symbol))
    .filter((id) => content.cards[id]);
}

export function speciesLevel(symbol, content, states) {
  const ids = speciesCardIds(symbol, content);
  if (ids.length === 0) return 0;
  return Math.min(...ids.map((id) => cardLevel(states[id])));
}

export function unseenCount(cardIds, states) {
  return cardIds.filter((id) => !states[id]).length;
}

function unitCardIds(unitKey, content) {
  const ids = content.unit_cards[unitKey];
  if (!ids) throw new Error(`unknown unit ${unitKey}`);
  return ids;
}

export function unitNumber(unitKey, content, states) {
  const ids = unitCardIds(unitKey, content);
  const levels = ids.map((id) => cardLevel(states[id]));
  const expertCount = levels.filter((l) => l === 4).length;
  const mean = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  const percent = Math.round((mean / 4) * 100);
  return {
    percent,
    expert_count: expertCount,
    card_count: ids.length,
    label: `${percent}%, ${expertCount} of ${ids.length} expert`
  };
}

export function gateStatus(unitKey, content, states) {
  const unit = content.units.find((u) => u.key === unitKey);
  if (!unit) throw new Error(`unknown unit ${unitKey}`);
  const parentKey = unit.parent ?? null;
  if (!parentKey) {
    return { open: true, parent_key: null, parent_card_count: 0, at_level_2: 0, fraction: 1, needed_cards: 0 };
  }
  const parentIds = unitCardIds(parentKey, content);
  if (parentIds.length === 0) {
    return { open: true, parent_key: parentKey, parent_card_count: 0, at_level_2: 0, fraction: 1, needed_cards: 0 };
  }
  const atLevel2 = parentIds.filter((id) => cardLevel(states[id]) >= 2).length;
  const fraction = atLevel2 / parentIds.length;
  const required = Math.ceil(GATE_THRESHOLD * parentIds.length);
  return {
    open: fraction >= GATE_THRESHOLD,
    parent_key: parentKey,
    parent_card_count: parentIds.length,
    at_level_2: atLevel2,
    fraction,
    needed_cards: Math.max(0, required - atLevel2)
  };
}

export function progressGrid(content, states) {
  const units = content.units.map((unit) => {
    const members = (content.unit_members[unit.key] ?? [])
      .filter((symbol) => speciesCardIds(symbol, content).length > 0);
    const rows = members.map((symbol) => ({
      symbol,
      common: content.species[symbol].common[0],
      scientific: content.species[symbol].scientific,
      level: speciesLevel(symbol, content, states),
      cells: content.channels.map((channel) => {
        const id = cardId('species', channel, symbol);
        return {
          channel,
          level: content.cards[id] ? cardLevel(states[id]) : 0,
          has_card: Boolean(content.cards[id])
        };
      })
    }));
    return {
      key: unit.key,
      name: unit.name,
      channel: unit.channel,
      level: unit.level,
      number: unitNumber(unit.key, content, states),
      gate: gateStatus(unit.key, content, states),
      rows
    };
  });
  return { channels: content.channels, units };
}

export const RUNG_KINDS = ['concept', 'group', 'species'];
export const RUNG_NAMES = { concept: 'shapes', group: 'genera', species: 'species' };

// A card at this level or higher counts toward a rung's waterline.
export const FAMILIAR = 2;

// A rung's own level is the mean of its cards, rounded. It is the same rule
// `unitNumber` uses for a unit, without the percent.
export function rollupLevel(levels) {
  if (levels.length === 0) return 0;
  const sum = levels.reduce((total, level) => total + level, 0);
  return Math.round(sum / levels.length);
}

function liveGenera(content) {
  const genera = new Set();
  for (const record of Object.values(content.species)) {
    if (!record.retired) genera.add(record.genus);
  }
  return [...genera].sort();
}

// The band order is the reading order. Concepts keep the order of
// concepts.json, so "the fifth of eight leaf shapes" stays true. Genera and
// species sort by genus, so the species band can be grouped by parent.
function orderedCards(content, channel, kind) {
  const find = (key) => content.cards[cardId(kind, channel, key)] ?? null;
  if (kind === 'concept') {
    return (content.concepts_by_channel[channel] ?? [])
      .map((concept) => find(concept.key))
      .filter(Boolean);
  }
  const genera = liveGenera(content);
  if (kind === 'group') return genera.map(find).filter(Boolean);
  const out = [];
  for (const genus of genera) {
    const symbols = Object.entries(content.species)
      .filter(([, record]) => !record.retired && record.genus === genus)
      .map(([symbol]) => symbol)
      .sort();
    for (const symbol of symbols) {
      const card = find(symbol);
      if (card) out.push(card);
    }
  }
  return out;
}

export function channelRung(content, states, channel, kind) {
  const cards = orderedCards(content, channel, kind);
  const rows = cards.map((card) => ({
    id: card.id,
    key: card.key,
    bucket: card.bucket,
    genus: kind === 'species' ? content.species[card.key].genus : null,
    level: cardLevel(states[card.id])
  }));
  const counts = [0, 0, 0, 0, 0];
  for (const row of rows) counts[row.level] += 1;
  const atFamiliar = rows.filter((row) => row.level >= FAMILIAR).length;
  return {
    channel,
    kind,
    name: RUNG_NAMES[kind],
    cards: rows,
    counts,
    total: rows.length,
    at_familiar: atFamiliar,
    share: rows.length === 0 ? 0 : atFamiliar / rows.length,
    level: rollupLevel(rows.map((row) => row.level))
  };
}

export function channelRungs(content, states, channel) {
  return RUNG_KINDS.map((kind) => channelRung(content, states, channel, kind));
}

// The channel's leading shape: the concept card that stands highest. A tie
// goes to the first one in concepts.json, so the answer never flickers.
export function leadingConcept(content, states, channel) {
  const rung = channelRung(content, states, channel, 'concept');
  if (rung.cards.length === 0) return null;
  let best = 0;
  for (let i = 1; i < rung.cards.length; i += 1) {
    if (rung.cards[i].level > rung.cards[best].level) best = i;
  }
  const row = rung.cards[best];
  const concept = conceptFor(content, channel, row.key);
  return {
    key: row.key,
    name: concept?.name ?? row.key,
    level: row.level,
    index: best,
    total: rung.cards.length
  };
}

export function channelClaim(content, states, channel) {
  const leading = leadingConcept(content, states, channel);
  if (!leading) return 'This channel holds no shape cards yet.';
  const species = channelRung(content, states, channel, 'species');
  if (species.total === 0) {
    return `${leading.name} sits at ${LEVEL_NAMES[leading.level]}. No species hangs off it yet.`;
  }
  const verdict = species.level >= leading.level ? 'keep up' : 'do not';
  return `${leading.name} sits at ${LEVEL_NAMES[leading.level]}. `
    + `The ${numberWord(species.total)} species behind it ${verdict}.`;
}

export function overallTally(content, states) {
  const rungs = content.channels.flatMap((channel) => channelRungs(content, states, channel));
  const add = (kind) => {
    const rows = rungs.filter((rung) => rung.kind === kind);
    return {
      at: rows.reduce((total, rung) => total + rung.at_familiar, 0),
      total: rows.reduce((total, rung) => total + rung.total, 0)
    };
  };
  return { shapes: add('concept'), genera: add('group'), species: add('species') };
}

export function overallFinding(content, states) {
  const tally = overallTally(content, states);
  const held = tally.shapes.total + tally.genera.total + tally.species.total;
  if (held === 0) return 'No cards are built yet.';
  const rungs = content.channels.flatMap((channel) => channelRungs(content, states, channel));
  const started = rungs.some((rung) => rung.counts.slice(1).some((count) => count > 0));
  if (!started) return 'Nothing is started yet. The shapes come first.';
  const share = (part) => (part.total === 0 ? 0 : part.at / part.total);
  const shapes = share(tally.shapes);
  const species = share(tally.species);
  if (shapes - species >= 0.1) return 'You know the shapes. Not the trees inside them.';
  if (species >= shapes) return 'The trees keep pace with the shapes.';
  return 'The shapes lead. The trees are close behind.';
}
