import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parsePowoImages } from '../lib/powo.ts';
import { parseFlags } from '../lib/run.ts';

const USAGE =
  'usage: node pipeline/scripts/powo-rows.ts --html <file> --page-url <url> --target <SYMBOL> --out <rows.json>';
const REQUIRED = ['html', 'page-url', 'target', 'out'];

/**
 * Reads one saved POWO gallery and writes its add rows as a JSON array, the input of
 * pipeline/scripts/mkadds.cjs. Put --out outside the repo, because the CLI commits with
 * `git add -A`. Returns the exit code.
 */
export function powoRowsMain(argv: string[]): number {
  let flags: Record<string, string>;
  try {
    flags = parseFlags(argv);
  } catch (error) {
    console.error((error as Error).message);
    console.error(USAGE);
    return 1;
  }
  for (const key of REQUIRED) {
    const value = flags[key];
    if (value === undefined || value.trim() === '') {
      console.error(`powo-rows needs --${key}`);
      console.error(USAGE);
      return 1;
    }
  }
  const html = fs.readFileSync(flags.html, 'utf8');
  const result = parsePowoImages(html, flags['page-url'], flags.target);
  fs.mkdirSync(path.dirname(path.resolve(flags.out)), { recursive: true });
  fs.writeFileSync(flags.out, `${JSON.stringify(result.rows, null, 2)}\n`, 'utf8');
  const skipped = Object.entries(result.skipped)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(', ');
  console.log(`${result.rows.length} rows written to ${flags.out}; skipped: ${skipped}`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = powoRowsMain(process.argv.slice(2));
}
