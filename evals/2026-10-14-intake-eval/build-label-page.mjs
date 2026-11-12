// node build-label-page.mjs  ->  images/pages/label/ (git-ignored): index.html and img/<blind name>.jpg
// The blind label page of the held-out set (Task 8, pages/label-page.mjs). The Artifact tool publishes the folder.
// The photo copies take the blind name, so neither the judge code nor the key reaches the page.
import path from 'node:path';
import fs from 'node:fs';
import { EVAL } from './lib/paths.mjs';
import { readJson } from './lib/data.mjs';
import { labelPage } from './pages/label-page.mjs';
import { pageLeaks } from './pages/style.mjs';

const config = readJson(path.join(EVAL, 'config.json'));
const pool = readJson(path.join(EVAL, 'heldout', 'pools.json'));
const out = path.join(EVAL, 'images', 'pages', 'label');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'img'), { recursive: true });
const photos = pool.cells.flatMap(c => c.photos);
for (const p of photos) fs.copyFileSync(path.join(EVAL, 'images', 'app', 'heldout', `${p.code}.jpg`), path.join(out, 'img', `${p.blind}.jpg`));
const html = labelPage(pool, { seed: config.pick_seed });
// The same check as the tests, on the real pool: no key, code, candidate id, or URL in the page.
// The code is matched as a whole word, because a credit can hold it inside a name ("Awinch1001" holds h100).
const leaks = pageLeaks(html, { text: photos.flatMap(p => [p.key, p.id, p.url, p.fetch_url, p.credit.origin]), words: photos.map(p => p.code) });
if (leaks.length) throw new Error(`the page shows ${leaks.length} things it must not, such as ${leaks[0]}`);
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(`label page: ${photos.length} photos in ${pool.cells.length} sections | ${out}`);
