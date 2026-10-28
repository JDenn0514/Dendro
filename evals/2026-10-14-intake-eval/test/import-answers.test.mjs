import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importLabels, importBest } from '../lib/answers.mjs';

const BLIND = { o001: 'PLRA-01', o002: 'PLRA-02', o003: 'QULA-01' };
const AT = '2026-10-28T10:00:00.000Z';

test('labels import to the key, with no difficulty step on a drop', () => {
  const out = importLabels({
    o001: { part: 'bark', keep: true, step: 2, at: AT },
    o002: { part: 'other', keep: false, step: null, at: AT },
    o003: { part: 'leaf', keep: false, step: 3, at: AT },
  }, BLIND);
  assert.deepEqual(out, {
    'PLRA-01': { part: 'bark', keep: true, step: 2, at: AT },
    'PLRA-02': { part: 'other', keep: false, step: null, at: AT },
    'QULA-01': { part: 'leaf', keep: false, step: null, at: AT },
  });
});

test('the import refuses a label with no part, a keep with no difficulty step, an unknown blind name, or a photo with no label', () => {
  const ok = { o002: { part: 'leaf', keep: false, step: null, at: AT }, o003: { part: 'leaf', keep: false, step: null, at: AT } };
  assert.throws(() => importLabels({ ...ok, o001: { part: null, keep: false, at: AT } }, BLIND), /o001: no part/);
  assert.throws(() => importLabels({ ...ok, o001: { part: 'twig', keep: false, at: AT } }, BLIND), /o001: no part/);
  assert.throws(() => importLabels({ ...ok, o001: { part: 'leaf', keep: true, step: null, at: AT } }, BLIND), /o001: a keep with no difficulty step/);
  assert.throws(() => importLabels({ ...ok, o001: { part: 'leaf', keep: true, step: 4, at: AT } }, BLIND), /o001: a keep with no difficulty step/);
  assert.throws(() => importLabels({ ...ok, o001: { part: 'leaf', at: AT } }, BLIND), /o001: no keep or drop/);
  assert.throws(() => importLabels({ ...ok, o001: { part: 'leaf', keep: false, at: AT }, o999: { part: 'leaf', keep: false, at: AT } }, BLIND), /o999: unknown blind name/);
  assert.throws(() => importLabels(ok, BLIND), /o001: no label/);
});

test('a best photo must be a photo the owner kept, of that species and part', () => {
  const labels = importLabels({
    o001: { part: 'bark', keep: true, step: 1, at: AT }, o002: { part: 'bark', keep: false, step: null, at: AT }, o003: { part: 'leaf', keep: true, step: 2, at: AT },
  }, BLIND);
  assert.deepEqual(importBest({ 'PLRA-bark': { id: 'o001', at: AT }, 'QULA-leaf': { id: 'o003', at: AT } }, BLIND, labels), {
    'PLRA-bark': { key: 'PLRA-01', at: AT }, 'QULA-leaf': { key: 'QULA-01', at: AT },
  });
  assert.throws(() => importBest({ 'PLRA-bark': { id: 'o002', at: AT }, 'QULA-leaf': { id: 'o003', at: AT } }, BLIND, labels), /PLRA-bark: o002 is not a kept photo of the cell/);
  assert.throws(() => importBest({ 'PLRA-bark': { id: 'o001', at: AT }, 'QULA-leaf': { id: 'o001', at: AT } }, BLIND, labels), /QULA-leaf: o001 is not a kept photo of the cell/);
  assert.throws(() => importBest({ 'PLRA-bark': { id: 'o001', at: AT } }, BLIND, labels), /QULA-leaf: no best photo/);
});
