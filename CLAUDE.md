# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Dendro is a tree-identification app (`app/`, plain HTML, CSS, and ES modules, no runtime dependencies) and a content pipeline (`pipeline/`, TypeScript) that builds the species content the app ships.

## Commands

- Node 24 or later is required. The pipeline TypeScript runs through Node's built-in type stripping, and the test globs need Node 24. There is no build step, no lint, and no typecheck.
- Keep the TypeScript in the erasable subset: no enums, no parameter properties, no namespaces.
- `npm test` runs the app tests. `npm run test:pipeline` runs the pipeline tests. `npm run test:all` runs these two and the live tests.
- To run one file: `node --test tests/grader.test.js`. To run one test by name, add `--test-name-pattern="<regex>"`.
- `npm run validate` checks `content/`. `npm run validate:dev` checks the `content_dev/` fixture set.
- The pipeline CLI is `node pipeline/cli.ts <cmd>`. Run it from the repo root, because it resolves paths from `process.cwd()`. The usage text and the command table are in `pipeline/lib/commands.ts`. `--refresh` bypasses the cache on every command. `DENDRO_DEBUG=1` prints stack traces.
- To see the app, serve the repo root (for example `python -m http.server 8000`) and open `index.html`. Add `?content=dev` to load `content_dev/`, which works offline.

## Architecture

Content flows in one direction:

1. `content_src/species/<SYMBOL>.json` holds the hand-authored species fields, keyed by the USDA PLANTS symbol.
2. `pipeline/runs/<name>/` holds one content run: `run.json`, `candidates.jsonl`, `verdicts.jsonl`, `look_for.json` (agent-written), `decisions.json` (owner-written), `build.json`, and `report.md`.
3. `node pipeline/cli.ts build` merges the authored layer with the fetched layer (PLANTS, iNaturalist) into `content/species.json`. It resizes and uploads the approved photos to the R2 bucket, and it writes the manifest rows. It writes `content/` only after the validator and the append-only ID check pass.
4. The app fetches `content/*.json` and loads images from `CDN_BASE` (`https://img.learndendro.com/`, which must end in `/`). The app keeps progress in localStorage.

Rules that hold this flow together:

- `app/logic/content.js` is the single content validator. `pipeline/cli.ts` and `scripts/validate_content.js` import it. The pipeline imports from `app/`, and `app/` never imports from `pipeline/`.
- The build writes `content/species.json` and `content/images/manifest.json`. Change them through the CLI, not by hand.
- `photos add` and `photos verdict` append to the `.jsonl` files in a run. Change those files through the CLI.
- A person authors `content/concepts.json` and `content/units.json`. Agents leave them as they are.
- The edges-draft skill appends to `content/confusion.json`.
- IDs are append-only. A published ID is retired, not deleted. `ids check --base origin/main` enforces this in CI.
- A species retires only on purpose: through `species retire`, or when every manifest row for it is retired.
- A manifest row's `source` is a display name that the credit prints word for word. A new `--source` value needs an entry in `app/logic/sources.js`, or `npm test` fails.

## Content runs

A content run follows the `content-run` skill from `run init` to the merged pull request. The `species-draft`, `photo-check`, `edges-draft`, and `powo-harvest` skills cover the steps inside it. Read the skill before you start a run or a step of one.

- The CLI commits with `git add -A` during a run. Put scratch files in the session scratchpad, not in the repo. Agents do not run `git commit` themselves during a run.
- Photo licences: the allowlist is in `pipeline/lib/licenses.ts`. Two sources are accepted as "used with permission, non-commercial" by written permission: `www.wildflower.org` and `dendro.cnre.vt.edu` (`--source "VT Dendrology"`). The permissions are in `docs/decisions/`.
- Kew POWO is the last resort. Use it only in the built-in browser, with a 10-second delay between pages, and stop at any challenge page.
- Read credits and licences from the source page itself, not through WebFetch. The species identity comes from the source page, not from the image.

## Tests and CI

- The pipeline tests never touch the network. Every HTTP call goes through an injected `fetchImpl`. Per-host rate limits and cache lifetimes are in `pipeline/lib/http.ts`.
- `.github/workflows/check.yml` runs the app tests, validates `content/` and `content_dev/`, and runs `ids check`. CI does not run `npm install`, so `sharp` and the S3 client load lazily. Keep them lazy.
- On `main`, CI deploys the whole repo root to GitHub Pages. `.nojekyll` must stay.
- `.gitattributes` forces LF line endings. The fixtures must stay LF.

## Environment

- `.env` (gitignored) holds `DENDRO_S3_ENDPOINT`, `DENDRO_S3_REGION`, `DENDRO_S3_BUCKET`, `DENDRO_S3_ACCESS_KEY_ID`, and `DENDRO_S3_SECRET_ACCESS_KEY`. `process.loadEnvFile` loads it.
- On Windows, build file paths with `path.join`. Rows store root-relative paths with forward slashes.
- Calls to `spawnSync` need a `maxBuffer` of 256 MB, because the manifest is larger than 1 MB.

## Docs

- `docs/decisions/` holds the owner's rulings. `docs/superpowers/specs/` and `docs/superpowers/plans/` hold the design and the plan for each batch of work.
- `DESIGN.md` holds the original design notes. Its section 17 is the decisions log of 2026-09-21, and it wins where it disagrees with the rest of the file.
- Commit messages use a scope prefix: `content(<run>):`, `feat(<scope>):`, `fix(<scope>):`, `docs(skills):`, `ci:`, `test:`. Branch names are `content/<run>`, `feat/…`, `fix/…`, and `skills/…`. Work lands through pull requests.
