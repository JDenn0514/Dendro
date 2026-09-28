import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { makeCandidate, type Candidate } from '../lib/candidates.ts';
import type { Verdict } from '../lib/verdicts.ts';
import {
  OWNER,
  conflictText,
  countsText,
  parseStagedLines,
  planApply,
  sameVerdict,
  stagedDir,
  stagedErrors,
  stagedPath,
  stamp,
  stopText,
  targetChannels,
  targetCounts,
  type StagedVerdict,
} from '../lib/verdict_apply.ts';

function candidate(target: string, index: number): Candidate {
  return makeCandidate({
    target,
    source_key: 'manual',
    origin: `https://example.org/${target}/${index}`,
    file_url: `https://example.org/${target}/${index}.jpg`,
  });
}

const A = candidate('QUGA', 1);
const B = candidate('QUGA', 2);
const C = candidate('QUAL', 1);
const PLATED = candidate('bark/plated', 1);
const CANDIDATES = [A, B, C, PLATED];

function row(id: string, verdict: StagedVerdict['verdict'], extra: Partial<StagedVerdict> = {}): StagedVerdict {
  return { candidate_id: id, verdict, channel: null, tags: [], case: null, note: 'a note', ...extra };
}

function recorded(one: StagedVerdict, by = 'photo_check_agent'): Verdict {
  return stamp(one, by, '2026-09-28T10:00:00Z');
}

test('stagedPath puts one file per target under staged/, with a dot for the slash of a concept key', () => {
  const dir = path.join('pipeline', 'runs', 'demo');
  assert.equal(stagedDir(dir), path.join(dir, 'staged'));
  assert.equal(stagedPath(dir, 'QUGA'), path.join(dir, 'staged', 'QUGA.jsonl'));
  assert.equal(stagedPath(dir, 'bark/plated'), path.join(dir, 'staged', 'bark.plated.jsonl'));
});

test('parseStagedLines reads each line, fills the optional fields, and skips blank lines', () => {
  const text = [
    JSON.stringify({ candidate_id: A.id, verdict: 'approve', channel: 'leaf', tags: ['winter'], note: 'Leaf.' }),
    '',
    JSON.stringify({ candidate_id: B.id, verdict: 'reject', note: 'Blurred.' }),
    JSON.stringify({ ...row(C.id, 'reject'), checked_by: 'owner', checked_at: '2026-09-01' }),
  ].join('\n');
  const parsed = parseStagedLines(text, 'QUGA.jsonl');
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows, [
    row(A.id, 'approve', { channel: 'leaf', tags: ['winter'], note: 'Leaf.' }),
    row(B.id, 'reject', { note: 'Blurred.' }),
    row(C.id, 'reject'),
  ]);
});

test('parseStagedLines names the file, the line, and the fault of each bad line', () => {
  const text = [
    'not json',
    '[1,2]',
    JSON.stringify({ candidate: A.id, verdict: 'approve', note: 'old format' }),
    JSON.stringify({ candidate_id: A.id, verdict: 'approve', tags: 'leaf', note: 'x' }),
    JSON.stringify({ candidate_id: A.id, verdict: 'approve', note: '  ' }),
  ].join('\n');
  const parsed = parseStagedLines(text, 'staged/QUGA.jsonl');
  assert.deepEqual(parsed.rows, []);
  assert.equal(parsed.errors.length, 5);
  assert.match(parsed.errors[0], /^staged\/QUGA\.jsonl:1: not JSON/);
  assert.equal(parsed.errors[1], 'staged/QUGA.jsonl:2: the line is not a JSON object');
  assert.equal(parsed.errors[2], 'staged/QUGA.jsonl:3: unknown field candidate');
  assert.equal(parsed.errors[3], 'staged/QUGA.jsonl:4: tags is not an array of strings');
  assert.equal(parsed.errors[4], 'staged/QUGA.jsonl:5: note is empty');
});

test('stagedErrors runs validateVerdicts and names the staged file', () => {
  const errors = stagedErrors(
    [row('deadbeef', 'approve', { channel: 'leaf' }), row(A.id, 'approve', { channel: 'twig' })],
    CANDIDATES,
    ['leaf', 'bark'],
    'staged/QUGA.jsonl',
  );
  assert.equal(errors.length, 2);
  assert.equal(errors[0], 'staged/QUGA.jsonl: deadbeef names no candidate');
  assert.match(errors[1], /^staged\/QUGA\.jsonl: .* channel twig, which this run does not cover/);
});

test('sameVerdict compares the kind, the channel, the case, and the tags as a set, not the note', () => {
  const one = row(A.id, 'approve', { channel: 'leaf', tags: ['a', 'b'], note: 'first' });
  assert.equal(sameVerdict(one, { ...one, tags: ['b', 'a'], note: 'second' }), true);
  assert.equal(sameVerdict(one, { ...one, channel: 'bark' }), false);
  assert.equal(sameVerdict(one, { ...one, verdict: 'reject' }), false);
  assert.equal(sameVerdict(one, { ...one, tags: ['a'] }), false);
  assert.equal(sameVerdict(row(A.id, 'escalate', { case: 'license' }), row(A.id, 'escalate', { case: 'quality' })), false);
});

test('planApply appends new rows, skips agreeing rows, and reports a changed verdict as a conflict', () => {
  const past = [recorded(row(A.id, 'reject')), recorded(row(B.id, 'approve', { channel: 'leaf' }))];
  const input = [
    row(A.id, 'approve', { channel: 'leaf' }),
    row(B.id, 'approve', { channel: 'leaf', note: 'new words' }),
    row(C.id, 'reject'),
  ];
  const plan = planApply(past, input, false);
  assert.deepEqual(plan.append, [row(C.id, 'reject')]);
  assert.deepEqual(plan.unchanged, [B.id]);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].candidate_id, A.id);
  assert.equal(plan.conflicts[0].owner, false);
  assert.deepEqual(plan.errors, []);
});

test('planApply --replace appends the changed row, but never over an owner decision', () => {
  const past = [recorded(row(A.id, 'reject')), recorded(row(B.id, 'reject'), OWNER)];
  const input = [row(A.id, 'approve', { channel: 'leaf' }), row(B.id, 'approve', { channel: 'leaf' })];
  const plan = planApply(past, input, true);
  assert.deepEqual(plan.append, [input[0]]);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].candidate_id, B.id);
  assert.equal(plan.conflicts[0].owner, true);
});

test('planApply reads the last recorded row per candidate', () => {
  const past = [recorded(row(A.id, 'escalate', { case: 'quality' })), recorded(row(A.id, 'reject'), OWNER)];
  assert.deepEqual(planApply(past, [row(A.id, 'reject')], false).unchanged, [A.id]);
});

test('planApply takes a row staged twice once, and names a row staged twice with two verdicts', () => {
  const same = planApply([], [row(A.id, 'reject'), row(A.id, 'reject', { note: 'again' })], false);
  assert.deepEqual(same.append, [row(A.id, 'reject')]);
  assert.deepEqual(same.errors, []);
  const split = planApply([], [row(A.id, 'reject'), row(A.id, 'approve', { channel: 'leaf' })], false);
  assert.deepEqual(split.errors, [`${A.id} is staged twice with two different verdicts`]);
});

test('planApply over its own output changes nothing', () => {
  const input = [row(A.id, 'approve', { channel: 'leaf' }), row(C.id, 'reject')];
  const first = planApply([], input, false);
  const after = first.append.map((one) => recorded(one));
  const second = planApply(after, input, false);
  assert.deepEqual(second.append, []);
  assert.deepEqual(second.unchanged, [A.id, C.id]);
});

test('targetChannels gives a concept target its prefix and a species target every run channel', () => {
  assert.deepEqual(targetChannels('QUGA', ['leaf', 'bark'], []), ['leaf', 'bark']);
  assert.deepEqual(targetChannels('bark/plated', ['bark', 'leaf'], ['bark/plated', 'leaf/simple_lobed']), ['bark']);
});

test('targetCounts counts the last approve per candidate of one target, and a hard photo apart', () => {
  const verdicts = [
    recorded(row(A.id, 'reject')),
    recorded(row(A.id, 'approve', { channel: 'leaf' })),
    recorded(row(B.id, 'approve', { channel: 'bark', tags: ['hard'] })),
    recorded(row(C.id, 'approve', { channel: 'leaf' })),
  ];
  const counts = targetCounts('QUGA', verdicts, CANDIDATES, new Set([B.id]));
  assert.deepEqual(counts, { approved: { leaf: 1 }, hard: 1 });
  assert.equal(countsText(counts, ['leaf', 'bark', 'fruit']), 'approved leaf 1, bark 0, fruit 0; hard 1');
});

test('stopText gives the stop-rule numbers with one decimal place', () => {
  const verdicts = [recorded(row(A.id, 'escalate', { case: 'quality' })), recorded(row(B.id, 'reject')), recorded(row(C.id, 'reject'))];
  assert.equal(stopText(verdicts), 'judged 3, escalated 1 (33.3%), stop rule not fired');
  assert.equal(stopText([]), 'judged 0, escalated 0 (0.0%), stop rule not fired');
});

test('conflictText names both verdicts and the way out', () => {
  const agent = { candidate_id: A.id, recorded: recorded(row(A.id, 'reject')), staged: row(A.id, 'approve', { channel: 'leaf', tags: ['hard'] }), owner: false };
  assert.equal(
    conflictText(agent),
    `conflict: ${A.id} is recorded as reject and staged as approve leaf [hard]. Run again with --replace to record the staged verdict.`,
  );
  const owner = { ...agent, owner: true };
  assert.match(
    conflictText(owner),
    /is an owner decision\. --replace does not change it\. Remove the staged row or change it to match\.$/,
  );
});
