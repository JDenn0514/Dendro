// node images.mjs --set key|heldout   ->  images/orig/, images/app/<set>/<code>.jpg, images/sheets/<set>/<cell>/all-<i>.jpg
// The copy is named by the photo code, not the key: the judges read it, and the key names the part.
// node images.mjs --set key --jobs <plan>   ->  also the ranking sheets of the rank jobs in wf/<plan>.jobs.json
// Downloads each original once (lib/fetch.mjs) to images/orig/<sha256 of the fetch URL>.<ext>, and makes the
// 440 px copy (config.app_px; EXIF rotate, fit inside, quality 85). A file is saved only when the response is
// an image and sharp can decode it. A failure is never replaced: it goes in <set>/img-failures.json with its
// host, and the script exits 1.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EVAL } from './lib/paths.mjs';
import { readJson, writeJson } from './lib/data.mjs';
import { download } from './lib/fetch.mjs';
import { sheetsFor, renderSheet } from './lib/sheet.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const set = opt('--set');
if (!['key', 'heldout'].includes(set)) throw new Error('usage: node images.mjs --set key|heldout [--jobs <plan>]');
const { default: sharp } = await import('sharp');
const appPx = readJson(path.join(EVAL, 'config.json')).app_px;
if (!(appPx > 0)) throw new Error('config.json has no app_px');
const pool = readJson(path.join(EVAL, set, 'pools.json'));

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/tiff': 'tif' };
const origDir = path.join(EVAL, 'images', 'orig');
const appDir = path.join(EVAL, 'images', 'app', set);
fs.mkdirSync(origDir, { recursive: true });
fs.mkdirSync(appDir, { recursive: true });
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const savedOrig = url => {
  const h = hash(url);
  const f = fs.readdirSync(origDir).find(n => n.startsWith(`${h}.`));
  return f ? path.join(origDir, f) : null;
};
const appCopy = input => sharp(input).rotate().resize({ width: appPx, height: appPx, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();

const failures = [];
async function one(p) {
  const out = path.join(appDir, `${p.code}.jpg`);
  const host = new URL(p.fetch_url).hostname;
  const fail = (status, error) => failures.push({ key: p.key, host, url: p.fetch_url, status, error });
  let orig = savedOrig(p.fetch_url);
  if (orig && fs.existsSync(out)) return;
  let bytes;
  if (orig) bytes = fs.readFileSync(orig);
  else {
    const r = await download(p.fetch_url);
    if (!r.ok) return fail(r.status, r.error);
    bytes = Buffer.from(r.bytes);
    const ext = EXT[r.contentType.split(';')[0].trim().toLowerCase()] ?? 'img';
    orig = path.join(origDir, `${hash(p.fetch_url)}.${ext}`);
  }
  let copy;
  try { copy = await appCopy(bytes); } catch (e) { return fail(null, `sharp cannot decode: ${e.message}`); }
  if (!fs.existsSync(orig)) fs.writeFileSync(orig, bytes);
  fs.writeFileSync(out, copy);
}

// One queue per host, the hosts in parallel. lib/fetch.mjs keeps the rate inside each host group.
const photos = pool.cells.flatMap(c => c.photos);
const byHost = new Map();
for (const p of photos) {
  const h = new URL(p.fetch_url).hostname;
  if (!byHost.has(h)) byHost.set(h, []);
  byHost.get(h).push(p);
}
await Promise.all([...byHost.values()].map(async list => { for (const p of list) await one(p); }));

const codeOf = new Map(photos.map(p => [p.key, p.code]));
const done = new Set(photos.filter(p => fs.existsSync(path.join(appDir, `${p.code}.jpg`))).map(p => p.key));
// The tiles show the key: the ranking agents and the owner read the sheets, not the judges.
const tile = key => ({ file: path.join(appDir, `${codeOf.get(key)}.jpg`), label: key });
let sheets = 0;
for (const c of pool.cells) {
  for (const s of sheetsFor(EVAL, set, c.cell, 'all', c.photos.map(p => p.key))) {
    const tiles = s.keys.filter(k => done.has(k)).map(tile);
    if (!tiles.length) continue;
    fs.mkdirSync(path.dirname(s.file), { recursive: true });
    await renderSheet(sharp, tiles, s.file);
    sheets++;
  }
}
const jobsName = opt('--jobs');
if (jobsName) {
  for (const j of readJson(path.join(EVAL, 'wf', `${jobsName}.jobs.json`)).filter(x => x.kind === 'rank')) {
    for (const s of j.sheets) {
      if (s.keys.some(k => !done.has(k))) throw new Error(`${j.label}: a photo of ${s.file} has no copy`);
      fs.mkdirSync(path.dirname(s.file), { recursive: true });
      await renderSheet(sharp, s.keys.map(tile), s.file);
      sheets++;
    }
  }
}

writeJson(path.join(EVAL, set, 'img-failures.json'), failures);
const perHost = {};
for (const f of failures) perHost[f.host] = (perHost[f.host] ?? 0) + 1;
console.log(`${set}: ${done.size}/${photos.length} copies at ${appPx} px | sheets ${sheets} | failures ${failures.length}`);
if (failures.length) {
  console.log('failures per host:', JSON.stringify(perHost));
  process.exit(1);
}
