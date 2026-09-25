import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MONO_THRESHOLD } from '../lib/candidates.ts';
import { chromaOf } from '../lib/chroma.ts';
import { greyJpeg, redJpeg } from './fixtures/images.ts';

test('MONO_THRESHOLD is 3', () => {
  assert.equal(MONO_THRESHOLD, 3);
});

test('a flat grey image scores under the threshold', async () => {
  const score = await chromaOf(await greyJpeg());
  assert.ok(score < MONO_THRESHOLD, `grey scored ${score}`);
});

test('a red image scores above the threshold', async () => {
  const score = await chromaOf(await redJpeg());
  assert.ok(score > MONO_THRESHOLD, `red scored ${score}`);
});

test('bytes that are not an image make chromaOf throw', async () => {
  await assert.rejects(chromaOf(new Uint8Array([1, 2, 3, 4])));
});
