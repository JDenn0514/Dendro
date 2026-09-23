import type { Candidate } from './candidates.ts';

export type VerdictKind = 'approve' | 'reject' | 'escalate';
export type EscalationCase = 'mismatch' | 'license' | 'quality';

/** The kinds a row may carry. `cli photos verdict` rejects any other --verdict value. */
export const VERDICT_KINDS: VerdictKind[] = ['approve', 'reject', 'escalate'];

/** The cases an escalation may carry. `cli photos verdict --case` rejects any other value. */
export const ESCALATION_CASES: EscalationCase[] = ['mismatch', 'license', 'quality'];

export interface Verdict {
  candidate_id: string;
  verdict: VerdictKind;
  channel: string | null;
  tags: string[];
  case: EscalationCase | null;
  note: string;
  checked_by: string;
  checked_at: string;
}

/** An approve names its channel. A reject does not need one. */
export type Decision =
  | { decision: 'approve'; channel: string; tags?: string[]; note?: string }
  | { decision: 'reject'; channel?: string; tags?: string[]; note?: string };

export const STOP_MIN_JUDGED = 20;
export const STOP_RATIO = 0.25;

const RANK_MARKERS = new Set(['subsp.', 'subsp', 'ssp.', 'ssp', 'var.', 'var', 'f.']);
const EPITHET = /^[a-z][a-z-]*$/;

/** Letters and hyphens only, and already lowercase. An author fails both halves. */
function isEpithet(token: string): boolean {
  return EPITHET.test(token);
}

/**
 * The genus and the first epithet, lower cased. After them a token survives only when it
 * is already lowercase and holds letters and hyphens alone, so an author drops out. A rank
 * marker and the epithet after it both drop out, because a variety still names the species.
 */
export function normalizeName(name: string): string {
  const tokens = name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/×/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return '';

  const parts: string[] = [tokens[0].toLowerCase()];
  if (tokens.length > 1 && isEpithet(tokens[1].toLowerCase())) {
    parts.push(tokens[1].toLowerCase());
  }
  for (let i = 2; i < tokens.length; i += 1) {
    if (RANK_MARKERS.has(tokens[i].toLowerCase())) {
      i += 1;
      continue;
    }
    if (!isEpithet(tokens[i])) break;
    parts.push(tokens[i]);
  }
  return parts.join(' ');
}

export function identityMatches(sourceSpecies: string | null, names: string[]): boolean {
  if (sourceSpecies === null) return false;
  const source = normalizeName(sourceSpecies);
  if (source === '') return false;
  return names.some((name) => normalizeName(name) === source);
}

/** The last row for a candidate id wins. Insertion order is first appearance. */
function lastByCandidate(verdicts: Verdict[]): Map<string, Verdict> {
  const last = new Map<string, Verdict>();
  for (const row of verdicts) last.set(row.candidate_id, row);
  return last;
}

export function pendingCandidates(candidates: Candidate[], verdicts: Verdict[]): Candidate[] {
  const judged = new Set(verdicts.map((row) => row.candidate_id));
  return candidates.filter((candidate) => !judged.has(candidate.id));
}

export function stopRule(verdicts: Verdict[]): { fired: boolean; judged: number; escalated: number } {
  const last = lastByCandidate(verdicts);
  const judged = last.size;
  let escalated = 0;
  for (const row of last.values()) {
    if (row.verdict === 'escalate') escalated += 1;
  }
  const fired = judged >= STOP_MIN_JUDGED && escalated / judged > STOP_RATIO;
  return { fired, judged, escalated };
}

export function decisionsToVerdicts(decisions: Record<string, Decision>, at: string): Verdict[] {
  const rows: Verdict[] = [];
  for (const [candidateId, decision] of Object.entries(decisions)) {
    // decisions.json is owner-written, so the value on disk may be anything.
    const kind = (decision as { decision: string }).decision;
    if (kind !== 'approve' && kind !== 'reject') {
      throw new Error(`decisions.json: ${candidateId} has an unknown decision ${kind}`);
    }
    rows.push({
      candidate_id: candidateId,
      verdict: kind,
      channel: decision.channel ?? null,
      tags: decision.tags ?? [],
      case: null,
      note: decision.note ?? '',
      checked_by: 'owner',
      checked_at: at,
    });
  }
  return rows;
}

export function approvedVerdicts(verdicts: Verdict[]): Verdict[] {
  return [...lastByCandidate(verdicts).values()].filter((row) => row.verdict === 'approve');
}

/** Approved images per target, then per channel. The caps read one target's row. */
export function countByTargetChannel(
  verdicts: Verdict[],
  candidates: Candidate[],
): Record<string, Record<string, number>> {
  const targetOf = new Map(candidates.map((candidate) => [candidate.id, candidate.target]));
  const counts: Record<string, Record<string, number>> = {};
  for (const row of approvedVerdicts(verdicts)) {
    if (row.channel === null) continue;
    const target = targetOf.get(row.candidate_id);
    if (target === undefined) continue;
    const byChannel = counts[target] ?? {};
    byChannel[row.channel] = (byChannel[row.channel] ?? 0) + 1;
    counts[target] = byChannel;
  }
  return counts;
}

/** One message per bad row. `cli build` and `cli run finish` print them and exit 1. */
export function validateVerdicts(
  verdicts: Verdict[],
  candidates: Candidate[],
  channels: string[],
): string[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const errors: string[] = [];

  for (const row of verdicts) {
    const candidate = byId.get(row.candidate_id);
    if (candidate === undefined) {
      errors.push(`verdicts.jsonl: ${row.candidate_id} names no candidate`);
      continue;
    }
    if (!VERDICT_KINDS.includes(row.verdict)) {
      errors.push(`verdicts.jsonl: ${row.candidate_id} has an unknown verdict ${String(row.verdict)}`);
      continue;
    }
    if (row.case !== null && !ESCALATION_CASES.includes(row.case)) {
      errors.push(`verdicts.jsonl: ${row.candidate_id} has an unknown case ${String(row.case)}`);
      continue;
    }
    if (row.verdict !== 'approve') continue;
    if (row.channel === null || row.channel.trim() === '') {
      errors.push(`verdicts.jsonl: ${row.candidate_id} is an approve with no channel`);
      continue;
    }
    if (!channels.includes(row.channel)) {
      errors.push(
        `verdicts.jsonl: ${row.candidate_id} is an approve on channel ${row.channel}, which this run does not cover`,
      );
      continue;
    }
    const slash = candidate.target.indexOf('/');
    if (slash === -1) continue;
    const prefix = candidate.target.slice(0, slash);
    if (row.channel !== prefix) {
      errors.push(
        `verdicts.jsonl: ${row.candidate_id} is an approve on channel ${row.channel} but its target ${candidate.target} names ${prefix}`,
      );
    }
  }

  return errors;
}
