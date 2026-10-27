import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyV2 } from '../lib/key-v2.mjs';

const owner = { a: { keep: true, step: 2 }, b: { keep: true, step: 1 }, c: { keep: false, step: 3 }, d: { keep: true, step: 1 }, e: { keep: true, step: 3 } };
const examples = { photos: [
  { key: 'a', group: 'step-2-1', judges: ['step 1', 'step 1', 'step 1'], verdict: 'judges' },
  { key: 'b', group: 'keep-dropped', judges: ['reject', 'reject', 'reject'], verdict: 'judges' },
  { key: 'c', group: 'keep-kept', judges: ['step 3', 'step 3', 'step 1'], verdict: 'judges' },
  { key: 'd', group: 'step-1-2', judges: ['step 2', 'step 2', 'step 2'], verdict: 'mine' },
] };
const relabel = { photos: [{ key: 'e', label: { keep: false, step: null } }] };

test('key v2 takes the judges\' call where the owner agreed, the blind label, and else the old label', () => {
  const { owner: v2, source } = keyV2(owner, examples, relabel);
  assert.deepEqual(v2, {
    a: { keep: true, step: 1 }, b: { keep: false, step: null }, c: { keep: true, step: 3 },
    d: { keep: true, step: 1 }, e: { keep: false, step: null },
  });
  assert.deepEqual(source, { a: 'examples', b: 'examples', c: 'examples', d: 'key', e: 'relabel' });
});

test('key v2 refuses a photo in both sheets or not in the key', () => {
  assert.throws(() => keyV2(owner, examples, { photos: [{ key: 'a', label: { keep: true, step: 1 } }] }), /a: on both sheets/);
  assert.throws(() => keyV2(owner, examples, { photos: [{ key: 'zz', label: { keep: true, step: 1 } }] }), /zz: not in the key/);
});
