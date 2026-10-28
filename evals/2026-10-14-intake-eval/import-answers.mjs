// node import-answers.mjs --labels <dir> --best <dir>  ->  heldout/labels.json, heldout/best.json
// Turns an ArtifactData export of the label page (<dir>/<doc id>.json for each document) into the owner's
// labels and best photos, by key. lib/answers.mjs refuses a bad or missing answer, so a file is written only
// when every answer passes.
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { EVAL } from './lib/paths.mjs';
import { readJson, writeJson } from './lib/data.mjs';
import { importLabels, importBest } from './lib/answers.mjs';

const { values: args } = parseArgs({ options: { labels: { type: 'string' }, best: { type: 'string' } } });
if (!args.labels || !args.best) throw new Error('usage: node import-answers.mjs --labels <dir> --best <dir>');
const docs = dir => Object.fromEntries(fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f.slice(0, -5), readJson(path.join(dir, f))]));
const blindKey = readJson(path.join(EVAL, 'heldout', 'blind-key.json'));
const labels = importLabels(docs(args.labels), blindKey);
const best = importBest(docs(args.best), blindKey, labels);
writeJson(path.join(EVAL, 'heldout', 'labels.json'), labels);
writeJson(path.join(EVAL, 'heldout', 'best.json'), best);
const all = Object.values(labels), kept = all.filter(l => l.keep);
const parts = {};
for (const l of all) parts[l.part] = (parts[l.part] ?? 0) + 1;
console.log(`labels ${all.length} | kept ${kept.length} | parts ${JSON.stringify(parts)} | steps ${[1, 2, 3].map(s => `${s}: ${kept.filter(l => l.step === s).length}`).join(', ')} | best photos ${Object.keys(best).length}`);
