// This file needs node_modules. It lives outside pipeline/tests/ so the default
// pipeline suite stays runnable with nothing installed. Run it with npm run test:live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { JPEG_QUALITY, MAX_SIDE } from '../lib/images.ts';
import { sharpResize } from '../lib/sharp_resizer.ts';

async function makeJpeg(width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 120, b: 60 } },
  }).jpeg().toBuffer();
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

test('an image wider than the maximum comes back at the maximum long side', async () => {
  const input = await makeJpeg(MAX_SIDE * 2, MAX_SIDE);
  const out = await sharpResize(input, MAX_SIDE, JPEG_QUALITY);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, MAX_SIDE);
  assert.equal(meta.height, MAX_SIDE / 2);
});

test('an image smaller than the maximum keeps its size', async () => {
  const input = await makeJpeg(400, 300);
  const out = await sharpResize(input, MAX_SIDE, JPEG_QUALITY);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 400);
  assert.equal(meta.height, 300);
});

test('the output is a jpeg in a Uint8Array', async () => {
  const input = await makeJpeg(800, 600);
  const out = await sharpResize(input, MAX_SIDE, JPEG_QUALITY);
  assert.ok(out instanceof Uint8Array);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, 'jpeg');
});

test('exif does not survive the resize', async () => {
  const buf = await sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 10, b: 10 } },
  }).withExif({ IFD0: { Copyright: 'test' } }).jpeg().toBuffer();
  const input = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  const before = await sharp(input).metadata();
  assert.ok(before.exif, 'the input carries exif');

  const out = await sharpResize(input, MAX_SIDE, JPEG_QUALITY);
  const after = await sharp(out).metadata();
  assert.equal(after.exif, undefined);
});
