import fs from 'node:fs';
import path from 'node:path';

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

// The wall-clock span of an agent: the first and the last timestamp of its transcript lines.
export function timeSpan(entries) {
  const ts = entries.map(e => e.timestamp).filter(Boolean).sort();
  if (!ts.length) return { start: null, end: null, seconds: null };
  const start = ts[0], end = ts[ts.length - 1];
  return { start, end, seconds: (Date.parse(end) - Date.parse(start)) / 1000 };
}

// The run record <runId>.json of a workflow run, in a session folder under projectsDir
// ($HOME/.claude/projects). It searches three levels down and skips the subagents folders,
// which hold the transcripts, not the record.
export function findRecord(projectsDir, runId) {
  const want = `${runId}.json`;
  const walk = (dir, depth) => {
    if (depth > 3 || !fs.existsSync(dir)) return null;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && e.name === want && depth > 0) return path.join(dir, e.name);
    }
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'subagents') continue;
      const f = walk(path.join(dir, e.name), depth + 1);
      if (f) return f;
    }
    return null;
  };
  const f = walk(projectsDir, 0);
  if (!f) throw new Error(`no run record ${want} under ${projectsDir}`);
  return f;
}
