import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from '../lib/paths.mjs';
import { extractChecks, briefJudge, briefRank, promptJudge, promptCheck, promptRank, DEPTH_TEXT } from '../lib/prompts.mjs';
import { KEY_FEATURES, OTHER_FEATURES } from '../lib/step.mjs';
import { REJECT_CODES, CAUSES } from '../lib/schemas.mjs';

const SKILL = fs.readFileSync(path.join(ROOT, '.claude', 'skills', 'photo-check', 'SKILL.md'), 'utf8');
const checks = extractChecks(SKILL);
const V1 = briefJudge(checks, 'V1'), V2 = briefJudge(checks, 'V2'), RANK = briefRank();

test('extractChecks takes the 10 reject checks, Not a fault, and the three escalation cases', () => {
  assert.equal(checks.rejects.length, 10);
  assert.match(checks.rejects[0], /^You cannot make out the feature\./);
  assert.match(checks.rejects[7], /sucker shoot/);
  assert.match(checks.rejects[9], /^Fruit: the main part of the fruit is missing/);
  assert.match(checks.notAFault, /^\*\*Not a fault\.\*\*/);
  assert.match(checks.notAFault, /A hand or fingers that hold the leaf or the fruit/);
  assert.match(checks.escalations, /`mismatch`/);
  assert.match(checks.escalations, /`license`/);
  assert.match(checks.escalations, /`quality`: the image is sepia/);
  assert.throws(() => extractChecks('no headings here'), /not found in photo-check SKILL.md/);
  // A reordered list would put each code on the wrong check, so it throws.
  const swapped = SKILL.replace('4. Blur smears', '4. XBlur').replace('5. The subject is a dead', '4. Blur smears').replace('4. XBlur', '5. The subject is a dead');
  assert.throws(() => extractChecks(swapped), /reject check 4 is not `blur`/);
});

test('the judge brief copies each reject check with its code, and none of the hard checks', () => {
  for (const [i, text] of checks.rejects.entries()) assert.ok(V1.includes(`\`${REJECT_CODES[i]}\`: ${text}`), REJECT_CODES[i]);
  for (const code of ['feature_not_found', 'hybrid', 'unread']) assert.ok(V1.includes(`\`${code}\``), code);
  assert.ok(V1.includes(checks.notAFault));
  assert.ok(V1.includes(checks.escalations));
  assert.match(V1, /`quality` only when no reject check is yes/);
  assert.ok(!V1.includes('**Hard:**'));
  assert.ok(!V1.includes('Crowded leaves: no leaf shows its whole outline'));
});

test('V1 and V2 differ only in the description step', () => {
  const a = V1.split('\n'), b = V2.split('\n');
  const onlyA = a.filter(l => !b.includes(l)), onlyB = b.filter(l => !a.includes(l));
  assert.ok(onlyA.length >= 1 && onlyB.length >= 1);
  for (const l of [...onlyA, ...onlyB]) assert.match(l, /description/, l);
  assert.match(V2, /two or three sentences/);
  assert.match(V1, /`description`.*""/);
});

test('the judge brief names every photo feature of every part, every cause, and the depth feature text', () => {
  for (const part of ['leaf', 'bark', 'fruit']) {
    for (const f of [...KEY_FEATURES[part], ...OTHER_FEATURES[part]]) assert.ok(V1.includes(`\`${f}\``), `${part} ${f}`);
  }
  for (const c of CAUSES) assert.ok(V1.includes(`\`${c}\``), c);
  assert.match(V1, /prompt names a depth feature/);
});

test('the judge brief has the rules of the plan', () => {
  for (const b of [V1, V2]) {
    assert.match(b, /Never return a difficulty step/);
    assert.match(b, /Use only the Read tool\. Do not run Bash or PowerShell\. Do not write or edit any file\. Do not open a web page\./);
    assert.match(b, /Do not judge the licence/);
    assert.match(b, /Trust the source name for the species/);
    assert.match(b, /green, full-size leaf with no sign of another season is `summer`/);
    assert.match(b, /Platanus ×hispanica/);
    assert.match(b, /variant leaf form/i);
    assert.match(b, /`arrangement` is `clear` only when/);
    assert.match(b, /`hang` is `clear` only when/);
    assert.match(b, /`size` is `clear` only when a scale object is in the frame/);
    assert.match(b, /smooth trunk can have `pattern` at `clear`/);
  }
});

test('V1 asks the checklist in the fixed order of the plan', () => {
  const at = s => { const i = V1.indexOf(s); assert.ok(i >= 0, s); return i; };
  const order = ['1. `part`', '2. The key photo features', '3. The other photo features', '4. `whole`', '5. `alone`', '6. `too_close`', '7. `causes`', '8. `side`'];
  const places = order.map(at);
  assert.deepEqual([...places].sort((x, y) => x - y), places);
});

test('the ranking brief ranks from the contact sheets only, in the order of the spec', () => {
  assert.match(RANK, /Rank from the contact sheets only\. Do not open any photo file\./);
  assert.match(RANK, /Use only the Read tool/);
  const at = s => RANK.indexOf(s);
  const prefs = ['the usual look', 'a scale object', 'the whole subject', 'the group line'];
  for (const p of prefs) assert.ok(at(p) >= 0, p);
  assert.deepEqual([...prefs].sort((x, y) => at(x) - at(y)), prefs);
  assert.match(RANK, /Never return a difficulty step/);
});

const photo = (key, extra = {}) => ({ key, abs: `/e/images/app/key/${key}.jpg`, tree: 'Platanus ×hispanica', source_species: 'Platanus ×hispanica', ...extra });

test('the judge prompt lists each photo with its path, tree, source name, and depth feature', () => {
  const p = promptJudge([photo('PLHI-fruit-01', { depth: { fruit: 'two_heads' } }), photo('ACRU-leaf-01', { tree: 'Acer rubrum', source_species: 'Acer rubrum' })], '/e/briefs/judge-V1.md');
  assert.match(p, /^Read the brief at \/e\/briefs\/judge-V1\.md and follow it\./);
  assert.ok(p.includes('- PLHI-fruit-01: /e/images/app/key/PLHI-fruit-01.jpg | tree: Platanus ×hispanica | source name: Platanus ×hispanica | depth feature: when the part is fruit, also answer `two_heads`: ' + DEPTH_TEXT.two_heads));
  assert.ok(p.includes('- ACRU-leaf-01: /e/images/app/key/ACRU-leaf-01.jpg | tree: Acer rubrum | source name: Acer rubrum\n') || p.endsWith('source name: Acer rubrum'));
  assert.throws(() => promptJudge([photo('X', { depth: { fruit: 'unknown_feature' } })], '/b'), /no text for depth feature unknown_feature/);
  assert.match(promptCheck([photo('A')], '/b'), /fill `model_self_report` with the model name that you think you are/);
});

test('the ranking prompt lists the sheets and the groups, and no photo path', () => {
  const r = promptRank({ species: 'Acer rubrum', part: 'leaf' }, { 1: ['ACRU-leaf-01', 'ACRU-leaf-03'], 3: ['ACRU-leaf-02'] }, ['/e/images/sheets/key/ACRU-leaf/haiku-1-1.jpg'], '/e/briefs/rank.md', 'one leaf, upper side');
  assert.match(r, /^Read the brief at \/e\/briefs\/rank\.md and follow it\./);
  assert.match(r, /Cell: Acer rubrum, leaf\./);
  assert.match(r, /- \/e\/images\/sheets\/key\/ACRU-leaf\/haiku-1-1\.jpg/);
  assert.match(r, /- group "1": ACRU-leaf-01, ACRU-leaf-03/);
  assert.match(r, /- group "3": ACRU-leaf-02/);
  assert.match(r, /Group line: the other species of the genus mostly show one leaf, upper side\./);
  assert.ok(!r.includes('/images/app/'));
  assert.ok(!/Group line/.test(promptRank({ species: 'S', part: 'bark' }, { all: ['a'] }, ['/s'], '/b', null)));
});

test('no brief or prompt holds an agent suggestion or an owner note of the key', () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'prototype', 'photo-review', 'data.js'), 'utf8'), ctx);
  const sugg = ctx.window.REVIEW_SECTIONS.flatMap(s => s.photos.flatMap(p => [p.reason, p.usualLookReason, p.stage])).filter(s => s && s.length > 12);
  const picks = JSON.parse(fs.readFileSync(path.join(ROOT, 'prototype', 'photo-review', 'photo-picks-2026-10-11.json'), 'utf8')).photos;
  const notes = picks.map(p => p.note).filter(Boolean);
  const texts = [V1, V2, RANK, promptJudge([photo('A')], '/b'), promptRank({ species: 'S', part: 'leaf' }, { 1: ['A'] }, ['/s'], '/b', null)];
  for (const t of texts) {
    for (const s of [...sugg, ...notes]) assert.ok(!t.includes(s), `holds ${s}`);
    assert.ok(!/suggest/i.test(t));
  }
});
