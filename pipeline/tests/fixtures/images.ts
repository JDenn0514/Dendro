import sharp from 'sharp';

/** Each side of a fixture image, in pixels. */
const SIDE = 64;

async function flatJpeg(background: { r: number; g: number; b: number }): Promise<Uint8Array> {
  const out = await sharp({ create: { width: SIDE, height: SIDE, channels: 3, background } })
    .jpeg()
    .toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/** A flat mid-grey 64x64 JPEG. It scores near 0. */
export function greyJpeg(): Promise<Uint8Array> {
  return flatJpeg({ r: 128, g: 128, b: 128 });
}

/** A flat red 64x64 JPEG. It scores far above MONO_THRESHOLD. */
export function redJpeg(): Promise<Uint8Array> {
  return flatJpeg({ r: 200, g: 30, b: 30 });
}
