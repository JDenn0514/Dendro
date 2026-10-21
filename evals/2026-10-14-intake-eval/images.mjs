// node images.mjs --pools tracer/pools.json
// Writes img/<target>/<n>.jpg (1,200 px long side, quality 85, EXIF rotate, as label-r3/images.mjs)
// and images/<target>/<n>.jpg (the size the app shows a question photo: long side config.app_px = 440 px, same settings),
// and sheets/<target>/all-<i>.jpg; for P3 targets also sheets/<target>/first12-<i>.jpg.
import fs from 'node:fs';
import path from 'node:path';
import { EVAL } from './lib/paths.mjs';
import { readJson, writeJson } from './lib/data.mjs';
import { sheetGroups, renderSheet } from './lib/sheet.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const poolsFile = path.join(EVAL, opt('--pools') ?? 'pools.json');
const { default: sharp } = await import('sharp');
const P = readJson(poolsFile);
const appPx = readJson(path.join(EVAL, 'config.json')).app_px;
if (!(appPx > 0)) throw new Error('config.json has no app_px');
const failures = [];

for (const t of P.targets) {
  const imgDir = path.join(EVAL, 'img', t.target);
  const sheetDir = path.join(EVAL, 'sheets', t.target);
  fs.mkdirSync(imgDir, { recursive: true });
  fs.mkdirSync(sheetDir, { recursive: true });
  const appDir = path.join(EVAL, 'images', t.target);
  fs.mkdirSync(appDir, { recursive: true });
  for (const p of t.photos) {
    for (const [dir, px] of [[imgDir, 1200], [appDir, appPx]]) {
      const out = path.join(dir, `${p.n}.jpg`);
      if (fs.existsSync(out)) continue;
      try {
        await sharp(p.abs).rotate().resize({ width: px, height: px, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(out);
      } catch (e) { failures.push({ key: p.key, abs: p.abs, error: e.message, px }); }
    }
  }
  const ok = new Set(t.photos.filter(p => fs.existsSync(path.join(imgDir, `${p.n}.jpg`))).map(p => p.key));
  const tiles = keys => keys.filter(k => ok.has(k)).map(k => {
    const p = t.photos.find(x => x.key === k);
    return { file: path.join(imgDir, `${p.n}.jpg`), label: p.key };
  });
  const all = sheetGroups(t.photos.map(p => p.key));
  for (const [i, g] of all.entries()) await renderSheet(sharp, tiles(g), path.join(sheetDir, `all-${i + 1}.jpg`));
  if ((P.p3 ?? []).includes(t.target)) {
    const first = sheetGroups(t.photos.slice(0, 12).map(p => p.key));
    for (const [i, g] of first.entries()) await renderSheet(sharp, tiles(g), path.join(sheetDir, `first12-${i + 1}.jpg`));
  }
  const appOk = t.photos.filter(p => fs.existsSync(path.join(appDir, `${p.n}.jpg`))).length;
  console.log(`${t.target}: ${ok.size}/${t.photos.length} images, ${appOk}/${t.photos.length} app-size copies, ${all.length} sheets`);
}
writeJson(path.join(path.dirname(poolsFile), 'img-failures.json'), failures);
console.log(`failures: ${failures.length}`);
