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
  retired?: boolean;
  retired_reason?: string;
  retired_at?: string;
}

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
}): Promise<{ rows: ManifestRow[]; uploaded: string[]; skipped: string[] }> {
  const { deps } = input;
  const byId = new Map<string, Candidate>();
  for (const candidate of input.candidates) byId.set(candidate.id, candidate);

  const rows = input.rows.slice();
  const uploaded: string[] = [];
  const skipped: string[] = [];

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

  return { rows, uploaded, skipped };
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
