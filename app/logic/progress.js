// Card levels, species levels, unit numbers, and the unit gate.
import { cardId } from './content.js';

export const LEVEL_NAMES = ['novice', 'beginner', 'intermediate', 'advanced', 'expert'];
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
