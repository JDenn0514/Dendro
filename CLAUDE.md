# CLAUDE.md

Dendro is a tree-identification app (`app/`: plain HTML, CSS, and ES modules, no runtime dependencies) and a content pipeline (`pipeline/`, TypeScript) that builds the species content for the app.

## Commands

- Node 24 or later. It runs the pipeline TypeScript through type stripping, and the test globs need it. There is no build, lint, or typecheck step.
- Keep the TypeScript erasable: no enums, no parameter properties, no namespaces.
- `npm test`: app tests. `npm run test:pipeline`: pipeline tests. `npm run test:all`: both, plus the live tests.
- One file: `node --test tests/grader.test.js`. One test: add `--test-name-pattern="<regex>"`.
- `npm run validate` checks `content/`. `npm run validate:dev` checks `content_dev/`.
- Run the pipeline CLI, `node pipeline/cli.ts <cmd>`, from the repo root. The usage text is in `pipeline/lib/commands.ts`. `--refresh` skips the cache. `DENDRO_DEBUG=1` prints stack traces.
- To see the app, serve the repo root (for example `python -m http.server 8000`) and open `index.html`. Add `?content=dev` to load `content_dev/` offline.

## Architecture

Content flows one way:

1. `content_src/species/<SYMBOL>.json`: the hand-authored species fields, keyed by the USDA PLANTS symbol.
2. `pipeline/runs/<name>/`: the files of one content run.
3. `node pipeline/cli.ts build` merges the authored layer with PLANTS and iNaturalist data into `content/species.json`. It uploads the approved photos to R2 and writes the manifest rows. It writes `content/` only after the validator and the append-only ID check pass.
4. The app reads `content/*.json`, loads images from `CDN_BASE` (`https://img.learndendro.com/`, with the trailing `/`), and keeps progress in localStorage.

Rules:

- `app/logic/content.js` is the one content validator. The pipeline imports from `app/`. `app/` never imports from `pipeline/`.
- Change `content/species.json`, `content/images/manifest.json`, and the `.jsonl` files of a run only through the CLI.
- A person authors `content/concepts.json` and `content/units.json`. Agents do not change them.
- IDs are append-only. Retire a published ID. Never delete it. `ids check --base origin/main` enforces this in CI.
- A species retires only on purpose: through `species retire`, or when all of its manifest rows are retired.
- The `source` of a manifest row is a display name that the credit prints word for word. A new value needs an entry in `app/logic/sources.js`.

## Content runs

Read the `content-run` skill before you start a run or a step of one.

- The licence allowlist is in `pipeline/lib/licenses.ts`. Two hosts give written permission for "used with permission, non-commercial": `www.wildflower.org` and `dendro.cnre.vt.edu` (`--source "VT Dendrology"`). The permissions are in `docs/decisions/`.
- Kew POWO is the last resort. Use it only in the built-in browser, with 10 seconds between pages. Stop at any challenge page.
- During a run, the CLI commits with `git add -A`. Put scratch files in the session scratchpad. Agents do not run `git commit` themselves.
- Read the credit and the licence from the source page, not through WebFetch. The species comes from the source page, not from the image.

## Tests and CI

- The pipeline tests never use the network. Every HTTP call goes through an injected `fetchImpl`. The rate limits and cache lifetimes per host are in `pipeline/lib/http.ts`.
- CI (`.github/workflows/check.yml`) does not run `npm install`. Keep `sharp` and the S3 client loaded lazily.
- On `main`, CI deploys the repo root to GitHub Pages. Keep `.nojekyll`.
- `.gitattributes` forces LF. The fixtures must stay LF.

## Environment

- `.env` (gitignored) holds the `DENDRO_S3_*` settings for R2. `process.loadEnvFile` loads it.
- On Windows, build file paths with `path.join`. Rows store root-relative paths with `/`.
- Give `spawnSync` a `maxBuffer` of 256 MB. The manifest is larger than 1 MB.

## Docs

- `docs/decisions/` holds the owner's rulings. `docs/superpowers/specs/` and `docs/superpowers/plans/` hold the design and plan of each batch.
- `DESIGN.md` section 17 (2026-09-21) wins where it disagrees with the rest of `DESIGN.md`.
- Commit scopes: `content(<run>):`, `feat(<scope>):`, `fix(<scope>):`, `docs(skills):`, `ci:`, `test:`. Branches: `content/<run>`, `feat/…`, `fix/…`, `skills/…`. Work lands through pull requests.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on JDenn0514/Dendro, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` at the repo root, with decision records in `docs/decisions/`. See `docs/agents/domain.md`.
