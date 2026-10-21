import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/paths.mjs';
import { extractQuality, briefP1, briefRank, promptP1, promptRank, LABELS } from '../lib/prompts.mjs';

const SKILL = 'intro\n\n**Quality.** Answer each check.\n\n**Reject** when any of these is yes:\n\n1. Blur.\n\n**Duplicates.** When two candidates...\n';

test('extractQuality takes the text from Quality up to Duplicates', () => {
  const q = extractQuality(SKILL);
  assert.ok(q.startsWith('**Quality.**'));
  assert.ok(q.includes('1. Blur.'));
  assert.ok(!q.includes('Duplicates'));
});

test('extractQuality throws when a heading is missing', () => {
  assert.throws(() => extractQuality('no headings here'), /Quality section not found/);
});

test('extractQuality works on the merged photo-check skill', () => {
  const text = fs.readFileSync(path.join(ROOT, '.claude', 'skills', 'photo-check', 'SKILL.md'), 'utf8');
  const q = extractQuality(text);
  assert.match(q, /\*\*Reject\*\* when any of these is yes/);
  assert.match(q, /\*\*Hard:\*\*/);
  assert.match(q, /\*\*Leaf forms:\*\*/);
  assert.match(q, /sucker shoot/);
});

test('briefs forbid Bash and carry the quality text', () => {
  for (const b of [briefP1('QTEXT'), briefRank('QTEXT', 'P2'), briefRank('QTEXT', 'P3')]) {
    assert.match(b, /Do not run Bash or PowerShell/);
    assert.match(b, /QTEXT/);
  }
  assert.match(briefRank('Q', 'P3'), /first 12 photos/);
  assert.match(briefRank('Q', 'P2'), /one petiole laid flat/);
  assert.match(briefRank('Q', 'P3'), /tag `good` or `hard`/);
  assert.deepEqual(LABELS, ['good', 'hard', 'reject', 'escalate', 'unread']);
});

test('every brief limits the run to leaf and tells the judge to ignore the skill flags', () => {
  for (const b of [briefP1('Q'), briefRank('Q', 'P2'), briefRank('Q', 'P3')]) {
    assert.match(b, /leaf channel only/);
    assert.match(b, /bark, a trunk, fruit, acorns, buds, flowers, and a whole tree/);
    assert.match(b, /Ignore the command-line flags .*`--case`, `--tags`/);
    assert.match(b, /references to Identity and the source page/);
  }
});

test('the P1 brief says to judge at the size given and to open no other file', () => {
  const b = briefP1('Q');
  assert.match(b, /Judge the photo at the size given\. This is the size that the learner sees\. Do not open any other file\./);
  assert.match(b, /only with a bigger view is `hard` at most, or a `reject`/);
});

test('ranking briefs say to rank from the sheets and not to open a photo', () => {
  for (const b of [briefRank('Q', 'P2'), briefRank('Q', 'P3')]) {
    assert.match(b, /Rank from the contact sheets only\. Do not open any photo file\./);
    assert.ok(!/read the original file/i.test(b));
  }
  assert.ok(!/Rank from the contact sheets only/.test(briefP1('Q')));
});

test('prompts list keys with paths for P1 and sheets with keys only for a ranking', () => {
  const t = { target: 'QUAC2', species: 'Quercus acutissima' };
  const photos = [{ key: 'QUAC2-01', abs: '/x/1.jpg' }, { key: 'QUAC2-02', abs: '/x/2.jpg' }];
  const p = promptP1(t, photos, '/e/briefs/P1.md');
  assert.match(p, /^Read the brief at \/e\/briefs\/P1\.md and follow it\./);
  assert.match(p, /QUAC2 \(Quercus acutissima\)/);
  assert.match(p, /- QUAC2-02: \/x\/2\.jpg/);
  const r = promptRank(t, photos, ['/e/sheets/QUAC2/all-1.jpg'], '/e/briefs/P2.md');
  assert.match(r, /- \/e\/sheets\/QUAC2\/all-1\.jpg/);
  assert.match(r, /- QUAC2-02$/m);
  assert.ok(!r.includes('/x/'), 'a ranking prompt holds no path of an original photo');
});
