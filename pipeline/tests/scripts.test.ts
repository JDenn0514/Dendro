import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HARVEST = path.join(REPO_ROOT, 'pipeline', 'scripts', 'harvest.cjs');
const MKADDS = path.join(REPO_ROOT, 'pipeline', 'scripts', 'mkadds.cjs');

interface AddRow {
  target: string;
  origin: string;
  file_url: string;
  author: string;
  license: string;
  license_url: string | null;
  source: string;
  source_species: string | null;
  channel_hint: string | null;
}

const harvest = require(HARVEST) as {
  cleanCredit: (s: unknown) => string;
  shellSafe: (s: unknown) => string;
  parseArgs: (argv: string[]) => { rows: string; run: string; outDir: string };
  candidatesPath: (run: string) => string;
};
const mkadds = require(MKADDS) as {
  buildCommand: (row: AddRow, run: string) => { line: string; problems: string[] };
  parseArgs: (argv: string[]) => { run: string; input: string; output: string };
  MAX_LINE_BYTES: number;
};

const POWO_ORIGIN =
  'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:685854-1/images#image=4abe7780b45861c2b02ab90e585c6fb2';

const POWO_ROW: AddRow = {
  target: 'PLHI',
  origin: POWO_ORIGIN,
  file_url: 'https://d2seqvvyy3b8p2.cloudfront.net/4abe7780b45861c2b02ab90e585c6fb2.jpg',
  author: "Dr Henry Oakeley's RCP Medicinal Plants",
  license: '© RBG Kew, CC BY 3.0',
  license_url: 'https://creativecommons.org/licenses/by/3.0/',
  source: 'Plants of the World Online (Kew)',
  source_species: 'Platanus × hispanica',
  channel_hint: null,
};

test('cleanCredit keeps letters in every script', () => {
  assert.equal(harvest.cleanCredit('Jiří Dvořák'), 'Jiří Dvořák');
  assert.equal(harvest.cleanCredit('José Ñúñez'), 'José Ñúñez');
  assert.equal(harvest.cleanCredit('Egon Krogsgaard©'), 'Egon Krogsgaard©');
});

test('cleanCredit composes the text to NFC', () => {
  assert.equal(harvest.cleanCredit('Jose\u0301'), 'Jos\u00e9');
});

test('cleanCredit strips control characters and collapses white space', () => {
  assert.equal(harvest.cleanCredit('  Steven\tJ.\n Baskauf \u0007 '), 'Steven J. Baskauf');
  assert.equal(harvest.cleanCredit('A\u0000B'), 'AB');
  assert.equal(harvest.cleanCredit(null), '');
});

test('shellSafe still strips the characters a double-quoted shell value cannot hold', () => {
  assert.equal(harvest.shellSafe('A "B" `C` $D !E \\F'), 'A B C D E F');
});

test('harvest.cjs needs --rows, --run, and --out-dir', () => {
  assert.deepEqual(harvest.parseArgs(['--rows', 'r.json', '--run', 'demo', '--out-dir', 'C:/tmp/h']), {
    rows: 'r.json',
    run: 'demo',
    outDir: 'C:/tmp/h',
  });
  assert.throws(
    () => harvest.parseArgs(['--rows', 'r.json', '--run', 'demo']),
    /usage: node pipeline\/scripts\/harvest\.cjs --rows <file> --run <name> --out-dir <dir>/,
  );
  assert.throws(() => harvest.parseArgs(['--rows', '--run', 'demo', '--out-dir', 'x']), /usage/);
});

test('harvest.cjs finds the candidates file from the repo root', () => {
  assert.equal(
    harvest.candidatesPath('demo'),
    path.join(REPO_ROOT, 'pipeline', 'runs', 'demo', 'candidates.jsonl'),
  );
});

test('harvest.cjs started with no flag prints the usage line and exits 1', () => {
  const result = spawnSync(process.execPath, [HARVEST], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: node pipeline\/scripts\/harvest\.cjs/);
});

test('buildCommand writes one photos add line and leaves out a null flag', () => {
  const built = mkadds.buildCommand(POWO_ROW, 'plhi_scratch');
  assert.equal(
    built.line,
    'node pipeline/cli.ts photos add plhi_scratch --target PLHI'
      + ` --origin "${POWO_ORIGIN}"`
      + ' --file-url "https://d2seqvvyy3b8p2.cloudfront.net/4abe7780b45861c2b02ab90e585c6fb2.jpg"'
      + ` --author "Dr Henry Oakeley's RCP Medicinal Plants"`
      + ' --license "© RBG Kew, CC BY 3.0"'
      + ' --license-url "https://creativecommons.org/licenses/by/3.0/"'
      + ' --source "Plants of the World Online (Kew)"'
      + ' --source-species "Platanus × hispanica"',
  );
  assert.deepEqual(built.problems, [], 'a letter outside ASCII is not a problem');
});

test('buildCommand flags a control character and a long line', () => {
  assert.deepEqual(mkadds.buildCommand({ ...POWO_ROW, author: 'A\u0007B' }, 'r').problems, [
    `PLHI ${POWO_ORIGIN}: control character`,
  ]);
  const long = mkadds.buildCommand({ ...POWO_ROW, author: 'x'.repeat(mkadds.MAX_LINE_BYTES) }, 'r');
  assert.deepEqual(long.problems, [`PLHI ${POWO_ORIGIN}: line too long`]);
});

test('buildCommand adds the file name fragment to a Trees and Shrubs Online article', () => {
  const row: AddRow = {
    target: 'QUGA',
    origin: 'https://www.treesandshrubsonline.org/articles/quercus/quercus-gambelii/',
    file_url: 'https://www.treesandshrubsonline.org/site/assets/files/7054/quercus-gambelii-4.jpg',
    author: 'Charles Snyers',
    license: 'CC BY-SA 4.0',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    source: 'Trees and Shrubs Online',
    source_species: 'Quercus gambelii',
    channel_hint: 'bark',
  };
  const { line } = mkadds.buildCommand(row, 'r');
  assert.ok(
    line.includes(
      '--origin "https://www.treesandshrubsonline.org/articles/quercus/quercus-gambelii/#image=quercus-gambelii-4.jpg"',
    ),
  );
  assert.ok(line.endsWith('--source-species "Quercus gambelii" --channel-hint bark'));
});

test('mkadds.cjs needs --run, --in, and --out', () => {
  assert.deepEqual(mkadds.parseArgs(['--run', 'r', '--in', 'a.json', '--out', 'b.sh']), {
    run: 'r',
    input: 'a.json',
    output: 'b.sh',
  });
  assert.throws(
    () => mkadds.parseArgs(['--run', 'r', '--in', 'a.json']),
    /usage: node pipeline\/scripts\/mkadds\.cjs --run <name> --in <rows\.json> --out <adds\.sh>/,
  );
});

test('mkadds.cjs started by Node writes the command file', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-mkadds-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'rows.json');
  const output = path.join(dir, 'adds.sh');
  fs.writeFileSync(input, JSON.stringify([POWO_ROW]), 'utf8');

  const result = spawnSync(
    process.execPath,
    [MKADDS, '--run', 'plhi_scratch', '--in', input, '--out', output],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /lines: 1/);
  assert.match(result.stdout, /problems: none/);
  assert.equal(
    fs.readFileSync(output, 'utf8'),
    `${mkadds.buildCommand(POWO_ROW, 'plhi_scratch').line}\n`,
  );
});
