// The entry point. It builds the real CliDeps and hands the argv to runCommand.
// Every global the pipeline reads is read here: process.argv, process.env,
// process.cwd, the clock, fetch, and spawnSync. No lib/ module reads one.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The one import that crosses from pipeline/ into app/. The validator is shared,
// never copied, and CDN_BASE is the app's own value, so the two cannot drift.
import { CDN_BASE, validateContent } from '../app/logic/content.js';
import { runCommand, type CliDeps } from './lib/commands.ts';
import { createHttp } from './lib/http.ts';
import type { Resize } from './lib/images.ts';
import type { Exec } from './lib/run.ts';
import type { Storage } from './lib/storage.ts';

const nodeExec: Exec = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.error !== undefined) {
    return { code: 1, out: `${out} ${result.error.message}`.trim() };
  }
  return { code: result.status ?? 1, out };
};

// sharp and the S3 client load on first use. CI runs `ids check` with no
// node_modules, so neither package may be imported at the top of this file.
const lazyResize: Resize = async (bytes, maxSide, quality) => {
  const { sharpResize } = await import('./lib/sharp_resizer.ts');
  return sharpResize(bytes, maxSide, quality);
};

function lazyStorage(): Storage {
  let real: Storage | null = null;
  const load = async (): Promise<Storage> => {
    if (real === null) {
      const { s3Storage, s3ConfigFromEnv } = await import('./lib/s3_storage.ts');
      real = s3Storage(s3ConfigFromEnv(process.env));
    }
    return real;
  };
  return {
    async head(key) {
      return (await load()).head(key);
    },
    async put(key, bytes, contentType) {
      return (await load()).put(key, bytes, contentType);
    },
    async remove(key) {
      return (await load()).remove(key);
    },
  };
}

async function main(): Promise<void> {
  // The five DENDRO_S3_* values live in .env at the repo root, which git ignores.
  // A machine that only runs ids check needs no .env, and CI has none, so a
  // missing file is not an error. Any other read error still stops the command.
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }

  // imageUrl builds `${base}img/${hash}.jpg`, so a base with no trailing slash
  // publishes a report full of broken links. Stop before any command runs.
  if (!CDN_BASE.endsWith('/')) {
    console.error(`CDN_BASE is "${CDN_BASE}". It must end in a slash.`);
    process.exitCode = 1;
    return;
  }

  const argv = process.argv.slice(2);
  const root = process.cwd();
  // --refresh belongs to the Http, not to a command, so the guard reads it here
  // and every command of this process gets a cache that honours it.
  const refresh = argv.includes('--refresh');
  const deps: CliDeps = {
    root,
    exec: nodeExec,
    http: createHttp({
      cacheDir: path.join(root, 'pipeline', 'cache'),
      fetchImpl: fetch,
      refresh,
    }),
    storage: lazyStorage(),
    resize: lazyResize,
    validate: validateContent,
    cdnBase: CDN_BASE,
    now: () => new Date(),
  };
  process.exitCode = await runCommand(argv, deps);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
