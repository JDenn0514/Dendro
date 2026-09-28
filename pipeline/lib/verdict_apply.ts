import path from 'node:path';

import type { Candidate } from './candidates.ts';
import { stopRule, validateVerdicts, type Verdict } from './verdicts.ts';

/** A verdict as a judge stages it. `photos apply` adds `checked_by` and `checked_at`. */
export type StagedVerdict = Omit<Verdict, 'checked_by' | 'checked_at'>;

/** The `checked_by` of a row that `run finish` wrote from decisions.json. */
export const OWNER = 'owner';

const STAGED_FIELDS = new Set(['candidate_id', 'verdict', 'channel', 'tags', 'case', 'note']);
/** Read and dropped, so a line copied from verdicts.jsonl also parses. */
const STAMP_FIELDS = new Set(['checked_by', 'checked_at']);

export function stagedDir(runDirectory: string): string {
  return path.join(runDirectory, 'staged');
}

/** One file per target. A concept key such as bark/plated has a slash, so its file is bark.plated.jsonl. */
export function stagedPath(runDirectory: string, target: string): string {
  return path.join(stagedDir(runDirectory), `${target.replace(/\//g, '.')}.jsonl`);
}

/** Parses a staged file. Each message names the label, the line number, and the fault. */
export function parseStagedLines(
  text: string,
  label: string,
): { rows: StagedVerdict[]; errors: string[] } {
  const rows: StagedVerdict[] = [];
  const errors: string[] = [];
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') return;
    const where = `${label}:${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch (error) {
      errors.push(`${where}: not JSON: ${(error as Error).message}`);
      return;
    }
    const fault = shapeFault(value);
    if (fault !== null) {
      errors.push(`${where}: ${fault}`);
      return;
    }
    const one = value as Record<string, unknown>;
    rows.push({
      candidate_id: one.candidate_id as string,
      verdict: one.verdict as StagedVerdict['verdict'],
      channel: (one.channel ?? null) as string | null,
      tags: (one.tags ?? []) as string[],
      case: (one.case ?? null) as StagedVerdict['case'],
      note: one.note as string,
    });
  });
  return { rows, errors };
}

/** The shape only. `stagedErrors` checks the kind, the case, and the channel. */
function shapeFault(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'the line is not a JSON object';
  }
  const one = value as Record<string, unknown>;
  for (const key of Object.keys(one)) {
    if (!STAGED_FIELDS.has(key) && !STAMP_FIELDS.has(key)) return `unknown field ${key}`;
  }
  if (typeof one.candidate_id !== 'string' || one.candidate_id === '') {
    return 'candidate_id is not a string';
  }
  if (typeof one.verdict !== 'string') return 'verdict is not a string';
  if (one.channel !== undefined && one.channel !== null && typeof one.channel !== 'string') {
    return 'channel is not a string or null';
  }
  const tags = one.tags;
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))) {
    return 'tags is not an array of strings';
  }
  if (one.case !== undefined && one.case !== null && typeof one.case !== 'string') {
    return 'case is not a string or null';
  }
  if (typeof one.note !== 'string' || one.note.trim() === '') return 'note is empty';
  return null;
}

/** `validateVerdicts` on staged rows. Its messages name verdicts.jsonl, so each one names the label instead. */
export function stagedErrors(
  rows: StagedVerdict[],
  candidates: Candidate[],
  channels: string[],
  label: string,
): string[] {
  const stamped = rows.map((one) => stamp(one, '', ''));
  return validateVerdicts(stamped, candidates, channels).map((message) =>
    message.replace(/^verdicts\.jsonl: /, `${label}: `),
  );
}

export function stamp(row: StagedVerdict, by: string, at: string): Verdict {
  return { ...row, checked_by: by, checked_at: at };
}

/** Two rows agree when the kind, the channel, the case, and the set of tags agree. The note does not count. */
export function sameVerdict(a: StagedVerdict, b: StagedVerdict): boolean {
  const tags = (one: StagedVerdict): string => [...one.tags].sort().join(',');
  return a.verdict === b.verdict && a.channel === b.channel && a.case === b.case && tags(a) === tags(b);
}

export interface Conflict {
  candidate_id: string;
  recorded: Verdict;
  staged: StagedVerdict;
  /** An owner row. `--replace` does not change it. */
  owner: boolean;
}

export interface ApplyPlan {
  /** The rows to append, in input order. */
  append: StagedVerdict[];
  /** The candidates whose last recorded row agrees with the staged row. */
  unchanged: string[];
  conflicts: Conflict[];
  /** A candidate staged twice with two different verdicts. */
  errors: string[];
}

/**
 * Pure. Decides what one apply writes. The last recorded row of a candidate is its verdict.
 * `replace` lets a staged row win over an agent row, and never over an owner row.
 */
export function planApply(recorded: Verdict[], input: StagedVerdict[], replace: boolean): ApplyPlan {
  const last = new Map<string, Verdict>();
  for (const one of recorded) last.set(one.candidate_id, one);
  const seen = new Map<string, StagedVerdict>();
  const plan: ApplyPlan = { append: [], unchanged: [], conflicts: [], errors: [] };
  for (const one of input) {
    const earlier = seen.get(one.candidate_id);
    if (earlier !== undefined) {
      if (!sameVerdict(earlier, one)) {
        plan.errors.push(`${one.candidate_id} is staged twice with two different verdicts`);
      }
      continue;
    }
    seen.set(one.candidate_id, one);
    const prior = last.get(one.candidate_id);
    if (prior === undefined) {
      plan.append.push(one);
      continue;
    }
    if (sameVerdict(prior, one)) {
      plan.unchanged.push(one.candidate_id);
      continue;
    }
    const owner = prior.checked_by === OWNER;
    if (replace && !owner) {
      plan.append.push(one);
      continue;
    }
    plan.conflicts.push({ candidate_id: one.candidate_id, recorded: prior, staged: one, owner });
  }
  return plan;
}

/** A concept target fills its own prefix. A species target fills every run channel. */
export function targetChannels(target: string, runChannels: string[], concepts: string[]): string[] {
  if (!concepts.includes(target)) return runChannels;
  return [target.slice(0, target.indexOf('/'))];
}

export interface TargetCounts {
  approved: Record<string, number>;
  hard: number;
}

/** The approved photos of one target per channel, from the last row per candidate. A hard photo counts in `hard` only. */
export function targetCounts(
  target: string,
  verdicts: Verdict[],
  candidates: Candidate[],
  hard: Set<string>,
): TargetCounts {
  const own = new Set(candidates.filter((one) => one.target === target).map((one) => one.id));
  const last = new Map<string, Verdict>();
  for (const one of verdicts) {
    if (own.has(one.candidate_id)) last.set(one.candidate_id, one);
  }
  const approved: Record<string, number> = {};
  let hardCount = 0;
  for (const one of last.values()) {
    if (one.verdict !== 'approve' || one.channel === null) continue;
    if (hard.has(one.candidate_id)) {
      hardCount += 1;
      continue;
    }
    approved[one.channel] = (approved[one.channel] ?? 0) + 1;
  }
  return { approved, hard: hardCount };
}

/** `approved leaf 6, bark 4, fruit 0; hard 1`. Every channel prints, with 0 for an empty one. */
export function countsText(counts: TargetCounts, channels: string[]): string {
  const parts = channels.map((channel) => `${channel} ${counts.approved[channel] ?? 0}`);
  return `approved ${parts.join(', ')}; hard ${counts.hard}`;
}

/** The run-wide stop-rule numbers. */
export function stopText(verdicts: Verdict[]): string {
  const rule = stopRule(verdicts);
  const percent = rule.judged === 0 ? 0 : (100 * rule.escalated) / rule.judged;
  const fired = rule.fired ? 'fired' : 'not fired';
  return `judged ${rule.judged}, escalated ${rule.escalated} (${percent.toFixed(1)}%), stop rule ${fired}`;
}

/** `approve leaf [hard]`, `escalate license`, or `reject`. */
export function verdictText(row: StagedVerdict): string {
  const parts: string[] = [row.verdict];
  if (row.channel !== null) parts.push(row.channel);
  if (row.case !== null) parts.push(row.case);
  if (row.tags.length > 0) parts.push(`[${row.tags.join(',')}]`);
  return parts.join(' ');
}

export function conflictText(conflict: Conflict): string {
  const fix = conflict.owner
    ? 'The recorded row is an owner decision. --replace does not change it. Remove the staged row or change it to match.'
    : 'Run again with --replace to record the staged verdict.';
  return `conflict: ${conflict.candidate_id} is recorded as ${verdictText(conflict.recorded)} and staged as ${verdictText(conflict.staged)}. ${fix}`;
}
