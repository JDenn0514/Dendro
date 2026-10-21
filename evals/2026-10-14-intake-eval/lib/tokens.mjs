export const MODEL_IDS = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' };

// USD per 1M tokens. Source: claude-api skill, cached 2026-10-06, shared/model-migration.md.
// Haiku 5.5 has two rate cards, chosen by the prompt length of each request.
export const RATES = {
  'claude-opus-5-5': [{ upTo: Infinity, input: 4, output: 20, cw5m: 5, cw1h: 8, cread: 0.20 }],
  'claude-sonnet-5-5': [{ upTo: Infinity, input: 2, output: 10, cw5m: 2.5, cw1h: 4, cread: 0.20 }],
  'claude-haiku-5-5': [
    { upTo: 100000, input: 0.10, output: 0.50, cw5m: 0.125, cw1h: 0.20, cread: 0.01 },
    { upTo: Infinity, input: 0.50, output: 2.50, cw5m: 0.625, cw1h: 1.00, cread: 0.05 },
  ],
};

// One API message is split over several transcript lines with the same id. Keep the line with the most output.
export function messagesFrom(entries) {
  const byId = new Map();
  for (const e of entries) {
    if (e.type !== 'assistant' || !e.message?.usage || e.message.model === '<synthetic>') continue;
    const prev = byId.get(e.message.id);
    if (!prev || (e.message.usage.output_tokens ?? 0) >= (prev.usage.output_tokens ?? 0)) byId.set(e.message.id, e.message);
  }
  return [...byId.values()].map(m => {
    const u = m.usage, cc = u.cache_creation;
    const cw = u.cache_creation_input_tokens ?? 0;
    return {
      model: m.model,
      input: u.input_tokens ?? 0,
      cw5m: cc ? (cc.ephemeral_5m_input_tokens ?? 0) : cw,
      cw1h: cc ? (cc.ephemeral_1h_input_tokens ?? 0) : 0,
      cread: u.cache_read_input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      split_known: !!cc,
    };
  });
}

export function priceMessage(m) {
  const cards = RATES[m.model];
  if (!cards) return null;
  const prompt = m.input + m.cw5m + m.cw1h + m.cread;
  const r = cards.find(c => prompt <= c.upTo);
  return (m.input * r.input + m.output * r.output + m.cw5m * r.cw5m + m.cw1h * r.cw1h + m.cread * r.cread) / 1e6;
}

export function sumMessages(msgs) {
  const s = { models: [...new Set(msgs.map(m => m.model))], messages: msgs.length, input: 0, cw5m: 0, cw1h: 0, cread: 0, output: 0, usd: 0, unpriced: 0 };
  for (const m of msgs) {
    for (const k of ['input', 'cw5m', 'cw1h', 'cread', 'output']) s[k] += m[k];
    const p = priceMessage(m);
    if (p == null) s.unpriced++; else s.usd += p;
  }
  s.tokens = s.input + s.cw5m + s.cw1h + s.cread + s.output;
  return s;
}
