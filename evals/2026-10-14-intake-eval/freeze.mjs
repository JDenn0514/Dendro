// node freeze.mjs --variant V1 --rule P  ->  frozen.json
// node freeze.mjs --check                  exits 1 when lib/step.mjs, the judge brief, or lib/schemas.mjs differs from frozen.json.
// The efforts and the call size come from config.json leading (owner rulings 2026-10-27).
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { EVAL } from './lib/paths.mjs';
import { readJson, writeJson } from './lib/data.mjs';
import { frozenRecord, checkFrozen, frozenFiles } from './lib/freeze.mjs';

const { values: args } = parseArgs({ options: { variant: { type: 'string' }, rule: { type: 'string' }, check: { type: 'boolean', default: false } } });
const out = path.join(EVAL, 'frozen.json');
const read = names => Object.fromEntries(names.filter(f => fs.existsSync(path.join(EVAL, f))).map(f => [f, fs.readFileSync(path.join(EVAL, f), 'utf8')]));

if (args.check) {
  const frozen = readJson(out);
  const changed = checkFrozen(frozen, read(Object.keys(frozen.sha256)));
  for (const f of changed) console.log(`changed since the freeze: ${f}`);
  console.log(changed.length ? 'freeze check: FAIL' : `freeze check: pass (${frozen.variant}, rule ${frozen.rule})`);
  process.exit(changed.length ? 1 : 0);
}
if (!args.variant || !args.rule) throw new Error('give --variant and --rule, or --check');
const config = readJson(path.join(EVAL, 'config.json'));
const record = { ...frozenRecord(config, { variant: args.variant, rule: args.rule }, read(frozenFiles(args.variant))), frozen_at: new Date().toISOString().slice(0, 10) };
writeJson(out, record);
console.log(`frozen: ${record.variant}, rule ${record.rule}, calls of ${record.batch}, ${Object.entries(record.effort).map(([m, e]) => `${m} ${e}`).join(', ')}`);
