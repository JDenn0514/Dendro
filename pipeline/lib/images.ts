export const MAX_SIDE = 1200;
export const JPEG_QUALITY = 82;

// Task 16 builds the real Resize on sharp. A test passes a fake, so no test needs sharp.
export type Resize = (bytes: Uint8Array, maxSide: number, quality: number) => Promise<Uint8Array>;

export { sha256Hex } from './hash.ts';

export function objectKey(hash: string): string {
  return `img/${hash}.jpg`;
}

export function reviewKey(candidateId: string): string {
  return `review/${candidateId}.jpg`;
}
