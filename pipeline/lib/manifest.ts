import type { Candidate } from './candidates.ts';
import { approvedVerdicts } from './verdicts.ts';
import type { Verdict } from './verdicts.ts';
import { JPEG_QUALITY, MAX_SIDE, objectKey, sha256Hex } from './images.ts';
import type { Resize } from './images.ts';
import type { Storage } from './storage.ts';

export interface ManifestRow {
  hash: string;
  target: string;
  channel: string;
  source: string;
  author: string;
  license: string;
  origin: string;
  tags: string[];
  checked_by: string;
  checked_at: string;
  note: string;
  /** Set on a photo the app holds back for now. The file stays in the bucket. */
  difficulty?: Difficulty;
  retired?: boolean;
  retired_reason?: string;
  retired_at?: string;
}

/** The one difficulty a row can carry. A row with no field is a normal photo. */
export const DIFFICULTIES = ['hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface PublishDeps {
  storage: Storage;
  resize: Resize;
  // The caller owns the path. Task 14 builds this from deps.root.
  readLocal: (path: string) => Uint8Array;
}

// The app prints these three as the photo credit, so an empty one reaches a page.
const CREDIT_FIELDS: ('author' | 'source' | 'license')[] = ['author', 'source', 'license'];

export async function publishApproved(input: {
  deps: PublishDeps;
  candidates: Candidate[];
  verdicts: Verdict[];
  rows: ManifestRow[];
}): Promise<{
  rows: ManifestRow[];
  uploaded: string[];
  skipped: string[];
  /** Candidate id to the hash of its resized bytes, for every approved candidate. */
  hashes: Record<string, string>;
}> {
  const { deps } = input;
  const byId = new Map<string, Candidate>();
  for (const candidate of input.candidates) byId.set(candidate.id, candidate);

  const rows = input.rows.slice();
  const uploaded: string[] = [];
  const skipped: string[] = [];
  const hashes: Record<string, string> = {};

  // approvedVerdicts applies the last-row-wins rule, so an approve the owner
  // later rejected never reaches the bucket.
  for (const verdict of approvedVerdicts(input.verdicts)) {
    const candidate = byId.get(verdict.candidate_id);
    if (candidate === undefined) {
      throw new Error(`no candidate for approved verdict ${verdict.candidate_id}`);
    }
    if (candidate.local === null) {
      throw new Error(`candidate ${candidate.id} has no cached file`);
    }
    for (const field of CREDIT_FIELDS) {
      if (candidate[field].trim() === '') {
        throw new Error(`candidate ${candidate.id} has an empty ${field}`);
      }
    }
    // validateVerdicts (Task 9) rejects this before the CLI gets here. The
    // guard holds for a direct caller.
    if (verdict.channel === null) {
      throw new Error(`candidate ${candidate.id} has no channel`);
    }
    const channel = verdict.channel;

    const original = deps.readLocal(candidate.local);
    const resized = await deps.resize(original, MAX_SIDE, JPEG_QUALITY);
    const hash = sha256Hex(resized);
    hashes[candidate.id] = hash;
    const key = objectKey(hash);

    // `images retire` removed this object, and the approved verdict is still in the run.
    // Without this the next build puts the same bytes back at the same public url, which
    // is the one thing a takedown must not do. The row stays as it is.
    const retired = rows.some(
      (row) =>
        row.hash === hash
        && row.target === candidate.target
        && row.channel === channel
        && row.retired === true,
    );
    if (retired) {
      skipped.push(key);
      continue;
    }

    if (await deps.storage.head(key)) {
      skipped.push(key);
    } else {
      await deps.storage.put(key, resized, 'image/jpeg');
      uploaded.push(key);
    }

    const present = rows.some(
      (row) => row.hash === hash && row.target === candidate.target && row.channel === channel,
    );
    if (present) continue;

    // Field order is the app manifest's order. A person reads the JSON diff.
    rows.push({
      hash,
      target: candidate.target,
      channel,
      source: candidate.source,
      author: candidate.author,
      license: candidate.license,
      origin: candidate.origin,
      tags: verdict.tags.slice(),
      checked_by: verdict.checked_by,
      checked_at: verdict.checked_at,
      note: verdict.note,
    });
  }

  return { rows, uploaded, skipped, hashes };
}

// Pure. The caller removes the object after the validator and the append-only
// check pass.
export function retireRows(
  rows: ManifestRow[],
  hash: string,
  reason: string,
  at: string,
): { rows: ManifestRow[]; retired: number } {
  let retired = 0;
  const next = rows.map((row) => {
    if (row.hash !== hash) return row;
    retired += 1;
    return { ...row, retired: true, retired_reason: reason, retired_at: at };
  });
  return { rows: next, retired };
}

/**
 * Pure. Sets or clears `difficulty` on every row that carries the hash, the rows
 * `retireRows` would touch. `null` clears it. `changed` counts the rows whose value
 * moved, so a second identical call reports 0. The object in the bucket is not touched.
 */
export function setDifficulty(
  rows: ManifestRow[],
  hash: string,
  difficulty: Difficulty | null,
): { rows: ManifestRow[]; matched: number; changed: number } {
  let matched = 0;
  let changed = 0;
  const next = rows.map((row) => {
    if (row.hash !== hash) return row;
    matched += 1;
    if ((row.difficulty ?? null) === difficulty) return row;
    changed += 1;
    if (difficulty !== null) return { ...row, difficulty };
    const { difficulty: _cleared, ...rest } = row;
    return rest;
  });
  return { rows: next, matched, changed };
}

/** Pure. The rows of one target the app shows: not retired and not hard. */
export function shownRows(rows: ManifestRow[], target: string): ManifestRow[] {
  return rows.filter(
    (row) => row.target === target && row.retired !== true && row.difficulty !== 'hard',
  );
}
