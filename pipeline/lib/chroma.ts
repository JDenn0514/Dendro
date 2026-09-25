import sharp from 'sharp';

/** The long side, in pixels, of the copy the measure reads. */
const SAMPLE_SIDE = 200;

/**
 * The mean over all pixels of max(r, g, b) - min(r, g, b), read from a copy whose long side
 * is 200 px. A grey plate scores near 0. A colour photograph scores well above
 * MONO_THRESHOLD. Throws when sharp cannot decode the bytes, and the caller decides what
 * that means.
 */
export async function chromaOf(bytes: Uint8Array): Promise<number> {
  const { data, info } = await sharp(bytes)
    .resize({ width: SAMPLE_SIDE, height: SAMPLE_SIDE, fit: 'inside' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  if (pixels === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sum += Math.max(r, g, b) - Math.min(r, g, b);
  }
  return sum / pixels;
}
