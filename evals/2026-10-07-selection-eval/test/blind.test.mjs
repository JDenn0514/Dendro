import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { blindOutcome } from '../lib/score.mjs';

const key = {
  candidate: 'R2', other: 'R1', auto_same: ['T5'],
  sides: { T1: { L: 'R2', R: 'R1' }, T2: { L: 'R1', R: 'R2' }, T3: { L: 'R2', R: 'R1' }, T4: { L: 'R1', R: 'R2' } },
};

test('a tie goes to the candidate, and auto-same targets count as same', () => {
  const o = blindOutcome({ T1: 'L', T2: 'L', T3: 'same', T4: 'same' }, key);
  assert.deepEqual(o, { cand: 1, other: 1, same: 3, candidateWins: true });
});

test('the candidate loses when the other set wins more targets', () => {
  const o = blindOutcome({ T1: 'R', T2: 'L', T3: 'L', T4: 'L' }, key);
  assert.deepEqual(o, { cand: 1, other: 3, same: 1, candidateWins: false });
});

test('blind.html shows app-size copies only and has a box for an empty set', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'blind.html'), 'utf8');
  assert.ok(!html.match(/full size|\/full\/|\/img\//));
  assert.ok(html.includes('/images/'));
  assert.ok(html.includes('no photos kept'));
});
