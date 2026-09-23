import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Candidate } from '../lib/candidates.ts';
import {
  STOP_MIN_JUDGED,
  STOP_RATIO,
  VERDICT_KINDS,
  ESCALATION_CASES,
  normalizeName,
  identityMatches,
  pendingCandidates,
  stopRule,
  decisionsToVerdicts,
  approvedVerdicts,
  countByTargetChannel,
  validateVerdicts,
} from '../lib/verdicts.ts';
import type { Verdict, VerdictKind, Decision } from '../lib/verdicts.ts';

const AT = '2026-09-22';
const CHANNELS = ['leaf', 'bark', 'fruit'];

/** One escalation more than the ratio allows, and the count that sits on it. */
const OVER_RATIO = Math.floor(STOP_MIN_JUDGED * STOP_RATIO) + 1;
const ON_RATIO = STOP_MIN_JUDGED * STOP_RATIO;

function verdict(id: string, kind: VerdictKind, extra: Partial<Verdict> = {}): Verdict {
  return {
    candidate_id: id,
    verdict: kind,
    channel: kind === 'approve' ? 'bark' : null,
    tags: [],
    case: kind === 'escalate' ? 'quality' : null,
    note: '',
    checked_by: 'photo_check_agent',
    checked_at: AT,
    ...extra,
  };
}

function batch(prefix: string, kind: VerdictKind, count: number): Verdict[] {
  const rows: Verdict[] = [];
  for (let i = 0; i < count; i += 1) rows.push(verdict(`${prefix}${i}`, kind));
  return rows;
}

function candidate(id: string, over: Partial<Candidate> = {}): Candidate {
  return {
    id,
    target: 'QUGA',
    source_key: 'commons',
    source: 'Wikimedia Commons',
    origin: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
    file_url: `https://upload.wikimedia.org/${id}.jpg`,
    author: 'A Photographer',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    source_species: 'Quercus gambelii',
    channel_hint: 'bark',
    tags_hint: [],
    identity_match: true,
    local: null,
    file_hash: null,
    fetched_at: AT,
    fetch_error: null,
    ...over,
  };
}

function candidatesFor(rows: Verdict[]): Candidate[] {
  return rows.map((row) => candidate(row.candidate_id));
}

test('the stop rule fires when more than a quarter of the judged rows escalate', () => {
  const rows = [
    ...batch('e', 'escalate', OVER_RATIO),
    ...batch('a', 'approve', STOP_MIN_JUDGED - OVER_RATIO),
  ];
  assert.deepEqual(stopRule(rows), {
    fired: true,
    judged: STOP_MIN_JUDGED,
    escalated: OVER_RATIO,
  });
});

test('the stop rule does not fire when the escalations sit exactly on the ratio', () => {
  const rows = [
    ...batch('e', 'escalate', ON_RATIO),
    ...batch('a', 'approve', STOP_MIN_JUDGED - ON_RATIO),
  ];
  assert.deepEqual(stopRule(rows), {
    fired: false,
    judged: STOP_MIN_JUDGED,
    escalated: ON_RATIO,
  });
});

test('the stop rule does not fire below STOP_MIN_JUDGED, whatever the ratio', () => {
  const escalated = STOP_MIN_JUDGED - 10;
  const rows = [
    ...batch('e', 'escalate', escalated),
    ...batch('a', 'approve', STOP_MIN_JUDGED - escalated - 1),
  ];
  assert.deepEqual(stopRule(rows), {
    fired: false,
    judged: STOP_MIN_JUDGED - 1,
    escalated,
  });
});

test('an owner decision becomes a verdict row with checked_by owner', () => {
  const decisions: Record<string, Decision> = {
    c1: { decision: 'approve', channel: 'bark', tags: ['winter'], note: 'Trunk of the tagged tree.' },
    c2: { decision: 'reject', note: 'Two species in frame.' },
  };
  const rows = decisionsToVerdicts(decisions, AT);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    candidate_id: 'c1',
    verdict: 'approve',
    channel: 'bark',
    tags: ['winter'],
    case: null,
    note: 'Trunk of the tagged tree.',
    checked_by: 'owner',
    checked_at: AT,
  });
  assert.deepEqual(rows[1], {
    candidate_id: 'c2',
    verdict: 'reject',
    channel: null,
    tags: [],
    case: null,
    note: 'Two species in frame.',
    checked_by: 'owner',
    checked_at: AT,
  });
});

test('decisionsToVerdicts throws and names the id on a decision it does not know', () => {
  const decisions = { c1: { decision: 'maybe' } } as unknown as Record<string, Decision>;
  assert.throws(
    () => decisionsToVerdicts(decisions, AT),
    /decisions\.json: c1 has an unknown decision maybe/,
  );
});

test('an owner decision overrides an earlier escalate row', () => {
  const agent = [
    ...batch('e', 'escalate', OVER_RATIO),
    ...batch('a', 'approve', STOP_MIN_JUDGED - OVER_RATIO),
  ];
  const owner = decisionsToVerdicts({ e0: { decision: 'approve', channel: 'leaf' } }, AT);
  const rows = [...agent, ...owner];

  assert.deepEqual(stopRule(rows), {
    fired: false,
    judged: STOP_MIN_JUDGED,
    escalated: OVER_RATIO - 1,
  });

  const approved = approvedVerdicts(rows);
  assert.equal(approved.length, STOP_MIN_JUDGED - OVER_RATIO + 1);
  const e0 = approved.find((row) => row.candidate_id === 'e0');
  assert.ok(e0);
  assert.equal(e0.checked_by, 'owner');
  assert.equal(e0.channel, 'leaf');
});

test('pendingCandidates returns only the candidates with no row', () => {
  const candidates = [candidate('c1'), candidate('c2'), candidate('c3')];
  const rows = [verdict('c1', 'approve'), verdict('c3', 'escalate'), verdict('c3', 'reject')];
  assert.deepEqual(
    pendingCandidates(candidates, rows).map((c) => c.id),
    ['c2'],
  );
});

test('identityMatches compares normalized names and fails on no source species', () => {
  const names = ['Quercus gambelii', 'Quercus utahensis'];
  assert.equal(identityMatches('Quercus gambelii', names), true);
  assert.equal(identityMatches('quercus GAMBELII', names), true);
  assert.equal(identityMatches('Quercus utahensis Rydb.', names), true);
  assert.equal(identityMatches('Quercus rubra', names), false);
  assert.equal(identityMatches(null, names), false);
  assert.equal(identityMatches('', names), false);
});

test('Quercus gambelii Nuttall matches Quercus gambelii', () => {
  assert.equal(normalizeName('Quercus gambelii Nuttall'), 'quercus gambelii');
  assert.equal(identityMatches('Quercus gambelii Nuttall', ['Quercus gambelii']), true);
});

test('Quercus gambelii Nutt. matches Quercus gambelii', () => {
  assert.equal(normalizeName('Quercus gambelii Nutt.'), 'quercus gambelii');
  assert.equal(identityMatches('Quercus gambelii Nutt.', ['Quercus gambelii']), true);
});

test('Quercus gambelii (Nuttall) var. gambelii matches Quercus gambelii', () => {
  assert.equal(normalizeName('Quercus gambelii (Nuttall) var. gambelii'), 'quercus gambelii');
  assert.equal(
    identityMatches('Quercus gambelii (Nuttall) var. gambelii', ['Quercus gambelii']),
    true,
  );
});

test('normalizeName folds case, collapses spacing, and drops the hybrid sign', () => {
  assert.equal(normalizeName('QUERCUS GAMBELII'), 'quercus gambelii');
  assert.equal(normalizeName('Quercus  gambelii'), 'quercus gambelii');
  assert.equal(normalizeName('×Quercus gambelii'), 'quercus gambelii');
  assert.equal(normalizeName('Quercus gambelii subsp. bonina'), 'quercus gambelii');
  assert.equal(normalizeName(''), '');
});

test('countByTargetChannel counts the approved rows per target and channel', () => {
  const rows: Verdict[] = [
    verdict('c1', 'approve', { channel: 'bark' }),
    verdict('c2', 'approve', { channel: 'bark' }),
    verdict('c3', 'approve', { channel: 'leaf' }),
    verdict('c4', 'reject', { channel: 'leaf' }),
    verdict('c5', 'approve', { channel: 'leaf' }),
  ];
  const candidates = [
    candidate('c1'),
    candidate('c2'),
    candidate('c3'),
    candidate('c4'),
    candidate('c5', { target: 'QURU' }),
  ];
  assert.deepEqual(countByTargetChannel(rows, candidates), {
    QUGA: { bark: 2, leaf: 1 },
    QURU: { leaf: 1 },
  });
});

test('countByTargetChannel skips an approve with no channel and one no candidate holds', () => {
  const rows: Verdict[] = [
    verdict('c1', 'approve', { channel: null }),
    verdict('gone', 'approve', { channel: 'bark' }),
    verdict('c2', 'approve', { channel: 'bark' }),
  ];
  assert.deepEqual(countByTargetChannel(rows, [candidate('c1'), candidate('c2')]), {
    QUGA: { bark: 1 },
  });
});

test('validateVerdicts names a candidate_id no candidate holds', () => {
  const rows = [verdict('c1', 'approve'), verdict('gone', 'reject')];
  assert.deepEqual(validateVerdicts(rows, [candidate('c1')], CHANNELS), [
    'verdicts.jsonl: gone names no candidate',
  ]);
});

test('validateVerdicts names a verdict kind it does not know', () => {
  const rows = [verdict('c1', 'sortof' as unknown as VerdictKind)];
  assert.deepEqual(validateVerdicts(rows, [candidate('c1')], CHANNELS), [
    'verdicts.jsonl: c1 has an unknown verdict sortof',
  ]);
  for (const kind of VERDICT_KINDS) {
    assert.deepEqual(validateVerdicts([verdict('c1', kind)], [candidate('c1')], CHANNELS), []);
  }
});

test('validateVerdicts names a case it does not know', () => {
  const rows = [verdict('c1', 'escalate', { case: 'blurry' as unknown as Verdict['case'] })];
  assert.deepEqual(validateVerdicts(rows, [candidate('c1')], CHANNELS), [
    'verdicts.jsonl: c1 has an unknown case blurry',
  ]);
  for (const escalationCase of ESCALATION_CASES) {
    assert.deepEqual(
      validateVerdicts([verdict('c1', 'escalate', { case: escalationCase })], [candidate('c1')], CHANNELS),
      [],
    );
  }
});

test('validateVerdicts names an approve with no channel and an approve off the run channels', () => {
  const rows = [
    verdict('c1', 'approve', { channel: null }),
    verdict('c2', 'approve', { channel: 'twig' }),
  ];
  assert.deepEqual(validateVerdicts(rows, [candidate('c1'), candidate('c2')], CHANNELS), [
    'verdicts.jsonl: c1 is an approve with no channel',
    'verdicts.jsonl: c2 is an approve on channel twig, which this run does not cover',
  ]);
});

test('validateVerdicts names an approve whose channel is not its concept target prefix', () => {
  const rows = [
    verdict('c1', 'approve', { channel: 'bark' }),
    verdict('c2', 'approve', { channel: 'leaf' }),
  ];
  const candidates = [
    candidate('c1', { target: 'leaf/needles' }),
    candidate('c2', { target: 'leaf/needles' }),
  ];
  assert.deepEqual(validateVerdicts(rows, candidates, CHANNELS), [
    'verdicts.jsonl: c1 is an approve on channel bark but its target leaf/needles names leaf',
  ]);
});

test('validateVerdicts returns no error for a clean set of rows', () => {
  const rows = [
    verdict('c1', 'approve', { channel: 'bark' }),
    verdict('c2', 'reject'),
    verdict('c3', 'escalate'),
  ];
  assert.deepEqual(validateVerdicts(rows, candidatesFor(rows), CHANNELS), []);
});
