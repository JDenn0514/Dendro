// node repeat-labels.mjs                  ->  heldout/repeat-key.json, and images/pages/repeat/ (git-ignored): index.html and img/<repeat name>.jpg
// node repeat-labels.mjs --answers <dir>  ->  heldout/repeat.json, from an ArtifactData export of `repeat` (<dir>/<doc id>.json)
// The owner's repeat labels (plan Task 10): 40 held-out photos chosen with config.seed (lib/repeat.mjs), with
// new names r01 to r40 in a new order. The page is the label page with { best: false, collection: 'repeat' }.
// The import refuses a bad or missing answer (lib/answers.mjs, importLabels), then prints the owner's repeat
// agreement against heldout/labels.json. It reads no judge answer.
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { EVAL } from './lib/paths.mjs';
import { readJson, writeJson, readExport } from './lib/data.mjs';
import { repeatSet, repeatPool, ownerRepeat } from './lib/repeat.mjs';
import { importLabels } from './lib/answers.mjs';
import { labelPage } from './pages/label-page.mjs';
import { pageLeaks } from './pages/style.mjs';

const { values: args } = parseArgs({ options: { answers: { type: 'string' } } });
const config = readJson(path.join(EVAL, 'config.json'));
const pool = readJson(path.join(EVAL, 'heldout', 'pools.json'));
const set = repeatSet(pool, { seed: config.seed });
const repeatKey = Object.fromEntries(set.map(r => [r.id, r.key]));
const keyFile = path.join(EVAL, 'heldout', 'repeat-key.json');

if (args.answers) {
  // The committed key must be the draw, so the answers map to the photos the page showed.
  if (JSON.stringify(readJson(keyFile)) !== JSON.stringify(repeatKey)) throw new Error('heldout/repeat-key.json is not the draw of config.seed');
  const repeat = importLabels(readExport(args.answers), repeatKey);
  writeJson(path.join(EVAL, 'heldout', 'repeat.json'), repeat);
  const a = ownerRepeat(readJson(path.join(EVAL, 'heldout', 'labels.json')), repeat);
  const pct = x => (x == null ? 'n/a' : `${(100 * x).toFixed(1)}%`);
  const kept = Object.values(repeat).filter(l => l.keep);
  console.log(`repeat labels ${Object.keys(repeat).length} | kept ${kept.length} | steps ${[1, 2, 3].map(s => `${s}: ${kept.filter(l => l.step === s).length}`).join(', ')}`);
  console.log(`owner repeat agreement on ${a.n} photos: part ${pct(a.part)}, keep ${pct(a.keep)} | kept both times ${a.both}: exact difficulty step ${pct(a.exact)}, within one ${pct(a.within1)}`);
  process.exit(0);
}

// The key is committed once. A build that would change it stops, so the answers keep their photos.
if (fs.existsSync(keyFile) && JSON.stringify(readJson(keyFile)) !== JSON.stringify(repeatKey)) throw new Error('heldout/repeat-key.json is not the draw of config.seed; the build does not overwrite it');
writeJson(keyFile, repeatKey);
const out = path.join(EVAL, 'images', 'pages', 'repeat');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'img'), { recursive: true });
for (const r of set) fs.copyFileSync(path.join(EVAL, 'images', 'app', 'heldout', `${r.code}.jpg`), path.join(out, 'img', `${r.id}.jpg`));
const html = labelPage(repeatPool(pool, set), { seed: config.seed, best: false, collection: 'repeat' });
// The same check as the tests, on the real pool and for all 208 photos: no key, candidate id, or URL, and
// no judge code or blind name of the label page (whole words).
const all = pool.cells.flatMap(c => c.photos);
const leaks = pageLeaks(html, { text: all.flatMap(p => [p.key, p.id, p.url, p.fetch_url, p.credit.origin]), words: all.flatMap(p => [p.code, p.blind]) });
if (leaks.length) throw new Error(`the page shows ${leaks.length} things it must not, such as ${leaks[0]}`);
fs.writeFileSync(path.join(out, 'index.html'), html);
const by = t => set.filter(r => r.target === t).length;
console.log(`repeat page: ${set.length} photos (${pool.cells.map(c => `${c.target} ${by(c.target)}`).join(', ')}) | ${path.relative(EVAL, keyFile)} | ${out}`);
