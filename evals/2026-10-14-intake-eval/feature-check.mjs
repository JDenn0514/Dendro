// node feature-check.mjs                  ->  images/pages/features/ (git-ignored): index.html and img/<id>.jpg
// node feature-check.mjs --answers <dir>  ->  key/feature-check.json, from an ArtifactData export of `features`
// The feature check (plan Task 8; owner ruling 2026-10-21): 60 key photos chosen with config.seed, 20 per part,
// with one yes or no question per photo feature (lib/features.mjs). The import compares the owner's answers
// with the stored key answers of the three leading set-ups (a photo feature at `clear` is a yes) and the
// set-ups with each other. No tokens.
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { EVAL } from './lib/paths.mjs';
import { readJson, writeJson, readExport } from './lib/data.mjs';
import { featureSet, importFeatures, compareFeatures } from './lib/features.mjs';
import { featurePage } from './pages/feature-page.mjs';
import { pageLeaks } from './pages/style.mjs';

const { values: args } = parseArgs({ options: { answers: { type: 'string' }, runs: { type: 'string', default: 'key-batch20' } } });
const config = readJson(path.join(EVAL, 'config.json'));
const pools = readJson(path.join(EVAL, 'key', 'pools.json'));
const set = featureSet(pools, { seed: config.seed, depthFeatures: config.depth_features });
const photoOf = new Map(pools.cells.flatMap(c => c.photos.map(p => [p.key, p])));

if (args.answers) {
  // The leading set-ups' answers: loaded only here, so the page build never touches a judge answer.
  const { loadKeySteps } = await import('./lib/key-steps.mjs');
  const { v, setups } = loadKeySteps(args.runs.split(','));
  const rows = importFeatures(readExport(args.answers), set);
  const answers = Object.fromEntries(setups.map(s => [s, v.answers[s]]));
  const compare = compareFeatures(rows, answers);
  const photos = rows.map(r => ({ ...r, judges: Object.fromEntries(setups.map(s => [s, Object.fromEntries(r.features.map(f => [f, answers[s][r.key]?.photo_features?.[f] ?? null]))])) }));
  writeJson(path.join(EVAL, 'key', 'feature-check.json'), { seed: config.seed, runs: args.runs.split(','), setups, photos, compare });
  const pct = t => `${(100 * t.agree / t.n).toFixed(1)}% (${t.agree}/${t.n})`;
  console.log(`feature check: ${rows.length} photos, ${compare.all_models.n} questions, owner yes ${compare.setups[setups[0]].all.owner_yes}`);
  for (const s of setups) {
    const t = compare.setups[s];
    console.log(`${s}: ${pct(t.all)} | model yes ${t.all.model_yes} | ${Object.entries(t.by_part).map(([p, x]) => `${p} ${pct(x)}`).join(', ')} | no answer ${t.no_answer} photos, left out ${t.left_out} questions`);
  }
  for (const [pair, t] of Object.entries(compare.pairs)) console.log(`${pair}: ${pct(t)}`);
  console.log(`all 3 set-ups agree: ${pct(compare.all_models)}`);
  process.exit(0);
}

const out = path.join(EVAL, 'images', 'pages', 'features');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'img'), { recursive: true });
const items = set.map(it => {
  const p = photoOf.get(it.key);
  fs.copyFileSync(path.join(EVAL, 'images', 'app', 'key', `${it.code}.jpg`), path.join(out, 'img', `${it.id}.jpg`));
  return { ...it, source: p.source, author: p.credit.author, license: p.credit.license, secrets: [p.key, p.review_key, p.url, p.fetch_url, p.credit.origin, it.species] };
});
const html = featurePage(items);
// The same check as the tests, on the real set: no key, review key, URL, or species in the page. The judge
// code is matched as a whole word, because a credit can hold it inside a name.
const leaks = pageLeaks(html, { text: items.flatMap(it => it.secrets), words: items.map(it => it.code) });
if (leaks.length) throw new Error(`the page shows ${leaks.length} things it must not, such as ${leaks[0]}`);
fs.writeFileSync(path.join(out, 'index.html'), html);
const by = part => set.filter(p => p.part === part).length;
console.log(`feature page: ${set.length} photos (leaf ${by('leaf')}, bark ${by('bark')}, fruit ${by('fruit')}), ${set.reduce((s, p) => s + p.features.length, 0)} questions | ${out}`);
