import sharp from 'sharp';
import type { Resize } from './images.ts';

// sharp drops every metadata block unless withMetadata() is called. Never call it,
// so EXIF and GPS cannot survive into a published image.
export const sharpResize: Resize = async (bytes, maxSide, quality) => {
  const out = await sharp(bytes)
    .rotate() // applies the EXIF orientation before the EXIF block goes away
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
};
