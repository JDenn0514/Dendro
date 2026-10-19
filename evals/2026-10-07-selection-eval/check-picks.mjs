// node check-picks.mjs [--dir tracer]
import path from 'node:path';
import { EVAL, readJson } from './lib/data.mjs';
import { checkPicks } from './lib/picks.mjs';

const args = process.argv.slice(2);
const dir = path.join(EVAL, args.includes('--dir') ? args[args.indexOf('--dir') + 1] : '.');
const pools = readJson(path.join(dir, 'pools.json'));
const picks = readJson(path.join(dir, 'picks.json'));
const problems = checkPicks(pools, picks);
for (const t of pools.targets) console.log(`${t.target}: ${picks.targets?.[t.target]?.picks?.length ?? 0} picks`);
console.log(problems.length ? problems.join('\n') : 'picks complete');
process.exit(problems.length ? 1 : 0);
