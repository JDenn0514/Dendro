export const TILE = 440, COLS = 3, PER_SHEET = 9, LABEL_H = 22;

export function sheetGroups(keys) {
  const groups = [];
  for (let i = 0; i < keys.length; i += PER_SHEET) groups.push(keys.slice(i, i + PER_SHEET));
  return groups;
}

export const sheetPaths = (evalDir, target, count, prefix) =>
  Array.from({ length: Math.ceil(count / PER_SHEET) }, (_, i) => `${evalDir}/sheets/${target}/${prefix}-${i + 1}.jpg`);

// tiles: [{ file, label }], at most PER_SHEET. Same look as an2/sheet.mjs, with 3 columns.
export async function renderSheet(sharp, tiles, out) {
  const parts = [];
  for (const [i, t] of tiles.entries()) {
    const left = (i % COLS) * TILE, top = Math.floor(i / COLS) * TILE;
    const img = await sharp(t.file).resize({ width: TILE, height: TILE - LABEL_H, fit: 'contain', background: '#222' }).toBuffer();
    const lab = Buffer.from(`<svg width="${TILE}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#000"/><text x="6" y="16" font-size="15" fill="#ff0" font-family="Arial">${t.label}</text></svg>`);
    parts.push({ input: lab, left, top }, { input: img, left, top: top + LABEL_H });
  }
  const rows = Math.ceil(tiles.length / COLS);
  await sharp({ create: { width: COLS * TILE, height: rows * TILE, channels: 3, background: '#111' } })
    .composite(parts).jpeg({ quality: 78 }).toFile(out);
}
