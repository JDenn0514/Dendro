// journal.jsonl of a run: one line per event. A "started" line has the agentId and the label.
// A "failed" line has the agentId only. A failed attempt is real spend that the run record does not list.
// entries: the parsed lines. Returns [{ agentId, label }] for every agent with a "failed" line,
// in journal order, once each. The label is null when the journal has no "started" line for the agent.
export function failedAgents(entries) {
  const labelOf = new Map();
  for (const e of entries) if (e.type === 'started' && e.agentId) labelOf.set(e.agentId, e.label ?? null);
  const seen = new Set(), out = [];
  for (const e of entries) {
    if (e.type !== 'failed' || !e.agentId || seen.has(e.agentId)) continue;
    seen.add(e.agentId);
    out.push({ agentId: e.agentId, label: labelOf.get(e.agentId) ?? null });
  }
  return out;
}
