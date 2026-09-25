// Write the `photos add` commands for the images kept after the viewing step.
//
// Usage: node pipeline/scripts/mkadds.cjs --run <name> --in <rows.json> --out <adds.sh>
//
// Each row in --in has this shape. harvest.cjs and pipeline/scripts/powo-rows.ts write it.
//   target          the run target: a PLANTS symbol or a concept key
//   origin          the page that holds the image
//   file_url        the image file
//   author          the credit, as the app prints it
//   license         the licence text, as the app prints it
//   license_url     the licence url, or null
//   source          the display name of the source
//   source_species  the species that the source page names, or null
//   channel_hint    a channel, or null
// This script reads no other field. A row carries its own source_species.
//
// Put --out outside the repo, for example in the session scratchpad. The CLI commits with
// `git add -A`, so a file inside the repo reaches a commit.
const fs = require('fs');
const path = require('path');

const USAGE = 'usage: node pipeline/scripts/mkadds.cjs --run <name> --in <rows.json> --out <adds.sh>';

// A longer command line may not survive the Windows command-line limit.
const MAX_LINE_BYTES = 1500;

/** Reads the three required flags. It throws an Error with the usage line when one is missing. */
function parseArgs(argv) {
  const value = (flag) => {
    const at = argv.indexOf(flag);
    const next = at === -1 ? undefined : argv[at + 1];
    return next === undefined || next.startsWith('--') ? null : next;
  };
  const run = value('--run');
  const input = value('--in');
  const output = value('--out');
  if (run === null || input === null || output === null) throw new Error(USAGE);
  return { run, input, output };
}

// Values go inside double quotes in a shell command, so these characters are not allowed through.
function clean(s) {
  return String(s).replace(/["`$!\\]/g, '').replace(/\s+/g, ' ').trim();
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/**
 * One `photos add` command for one row, and the problems of that command. An optional flag
 * whose value is null or empty is left out.
 */
function buildCommand(row, run) {
  let origin = row.origin;
  // The candidate id is sha1(target|origin). Two photos from one Trees and Shrubs Online
  // article share the article url, so the origin carries the image file name as a fragment
  // (run 1 follow-up, 2026-09-24).
  if (/treesandshrubsonline\.org/.test(origin) && !origin.includes('#')) {
    origin = `${origin}#image=${path.posix.basename(row.file_url)}`;
  }
  const parts = [
    `node pipeline/cli.ts photos add ${run}`,
    `--target ${row.target}`,
    `--origin "${clean(origin)}"`,
    `--file-url "${clean(row.file_url)}"`,
    `--author "${clean(row.author)}"`,
    `--license "${clean(row.license)}"`,
  ];
  if (present(row.license_url)) parts.push(`--license-url "${clean(row.license_url)}"`);
  parts.push(`--source "${clean(row.source)}"`);
  if (present(row.source_species)) parts.push(`--source-species "${clean(row.source_species)}"`);
  if (present(row.channel_hint)) parts.push(`--channel-hint ${clean(row.channel_hint)}`);
  const line = parts.join(' ');
  const label = `${row.target} ${origin}`;
  const problems = [];
  if (Buffer.byteLength(line) >= MAX_LINE_BYTES) problems.push(`${label}: line too long`);
  // A letter in any script is fine. A control character is not.
  if (/\p{Cc}/u.test(line)) problems.push(`${label}: control character`);
  return { line, problems };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }
  const rows = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const lines = [];
  const problems = [];
  for (const row of rows) {
    const built = buildCommand(row, args.run);
    lines.push(built.line);
    problems.push(...built.problems);
  }
  fs.writeFileSync(args.output, lines.join('\n') + '\n');
  console.log('lines:', lines.length);
  console.log('max bytes:', lines.length === 0 ? 0 : Math.max(...lines.map((l) => Buffer.byteLength(l))));
  console.log('problems:', problems.length ? problems.join('; ') : 'none');
  if (problems.length > 0) process.exitCode = 1;
}

module.exports = { parseArgs, clean, buildCommand, MAX_LINE_BYTES };

// The tests load this file with createRequire, so main() runs only when Node starts it.
if (require.main === module) main();
