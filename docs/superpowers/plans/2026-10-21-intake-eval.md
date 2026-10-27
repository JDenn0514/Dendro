# Intake eval, phases 1 to 3: implementation plan

> **For agentic workers:** The owner runs `/to-tickets` on this plan, which makes one GitHub issue for each task, blocked by the tasks it depends on. Then the owner runs `/implement` on each ticket whose blockers are done. The plan holds the detail (files, tests, agents, cost). The ticket tracks the work. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Find the photo intake method that agrees best with the owner on keep and on the difficulty step, at a cost the owner accepts. This plan covers phases 1 to 3 of the intake spec: the harness, the runs on the key, and the blind held-out set with the report.

**Architecture:** A copy of the old selection-method eval, adapted, in `evals/2026-10-14-intake-eval/`. Scripts build the photo pools and the 440 px image copies. Judge agents answer the Part 1 fields for each photo, once per model and prompt variant, inside workflows. A pure function, `lib/step.mjs`, computes keep and the difficulty step from the answers. A pure replay then plays methods S, F, R, FR, and CR for every model, prompt variant, rule, and quota from the stored answers, at no token cost. The owner labels the held-out set on private artifact pages that work on a phone and save each answer.

**Tech Stack:** Node ES modules (`.mjs`), `node:test`, `sharp` (a dev dependency of the repo), the Workflow tool, the Artifact tool with the `db` capability, and the `ArtifactData` tool.

Sources, all on `main`:

- The intake spec: `docs/superpowers/specs/2026-10-14-intake-comparison-and-photo-audit.md` (here "the spec"). Its rulings table is final.
- `docs/decisions/2026-10-17-v1-and-intake-rulings.md` and `DESIGN.md` section 19.
- `GLOSSARY.md`. This plan says "difficulty step", never "step" alone, "part", not "channel", "photo feature", and "growth stage". A **cell** is one target and one part (spec, "The manifest today"). The words `step`, `channel`, and `part` stay as field names in code and data.
- The photo-check skill, `.claude/skills/photo-check/SKILL.md`, the Quality section.
- The v1 spec, `docs/superpowers/specs/2026-10-14-v1-learning-model-app.md`, section 3.7 (the photo fields).
- The old eval: its code in `evals/2026-10-07-selection-eval/`, and its spec and plan on the branch `feat/selection-eval` (read, not merged).

## Facts checked on 2026-10-21

The inputs:

- The key is complete. `prototype/photo-review/data.js` has 21 sections and 211 photos. `prototype/photo-review/photo-picks-2026-10-11.json` has 211 rows with `key`, `id`, `species`, `part`, `published`, `keep`, `step`, `suggested_step`, `usual_look`, and `note`. All 211 rows join on `key`.
- The owner's calls on the key: suggested difficulty step 1, 62 kept; difficulty step 2, 75 kept and 3 dropped; difficulty step 3, 27 kept and 44 dropped. These match the spec.
- No pick row marks a best photo. So the key has no top-pick score (spec, Metrics).
- Three owner notes are in the picks: "Fall foliage", "It's too close to be a plain step 1", and "Looks upside down". None names a species doubt, so every key drop counts in the keep score.
- 170 key photos are published. Their `src` is `https://img.learndendro.com/img/<hash>.jpg`.
- 41 key photos are not published. Their `src` is a local file, `img/<id>.jpg`, that is not in git. Their `key` is `cand:<candidate id>`. All 41 are rows in `pipeline/runs/leaf_topup/candidates.jsonl` (37) and `pipeline/runs/simple_lobed_co/candidates.jsonl` (4), so `file_url` gives each image. Their hosts: Bioimages 12, iNaturalist 10, wildflower.org 7, Trees and Shrubs Online 3, `plants.sc.egov.usda.gov` 3, VT Dendrology 2, `upload.wikimedia.org` 2, and `thumb.wikimedia.org` 2.
- The held-out pools are in `pipeline/runs/simple_lobed_us/candidates.jsonl`. With the last row of each `id`: PLRA 82 rows (22 of them manual), QULA 70 (10 manual), and QUAU 60. QUAU has 4 rows whose `file_hash` repeats an earlier row. No row has `fetch_error` or `identity_match: false`. After the duplicate drop: 82 + 70 + 56 = 208 photos, as the spec says. The manual rows stay in, because the spec counts them.
- The held-out hosts: iNaturalist 125, `thumb.wikimedia.org` 37, wildflower.org 33, `upload.wikimedia.org` 11, Trees and Shrubs Online 4, and VT Dendrology 2.
- No species file in `content_src/species/` has `depth` or `depth_feature` yet. The quota depends on the depth of the part (spec ruling 1). Owner ruling 2026-10-21: the headline uses the depth `species` quota (3, 3, and 2) on every cell, and the report also shows 2, 2, and 1.

The image hosts, probed from this container with a User-Agent header:

| Host | Answer | Photos that need it |
|---|---|---|
| `img.learndendro.com` | 200, image | key 170 |
| `inaturalist-open-data.s3.amazonaws.com` | 200, image | key 10, held-out 125 |
| `thumb.wikimedia.org` | 200, image | key 2, held-out 37 |
| `www.wildflower.org` | 200, image | key 7, held-out 33 |
| `www.treesandshrubsonline.org` | 200, image | key 3, held-out 4 |
| `dendro.cnre.vt.edu` | 200, image | key 2, held-out 2 |
| `bioimages.vanderbilt.edu` | 200, image | key 12 |
| `upload.wikimedia.org` | **429**, "Too many requests ... use thumbnail images" | key 2, held-out 11 |
| `plants.sc.egov.usda.gov` | 200, image (blocked at first; allowed on 2026-10-21) | key 3 |

- `plants.sc.egov.usda.gov`: the owner added it to the environment's allowed domains on 2026-10-21. After a typo fix, the 3 key photos answered 200 with images.
- `upload.wikimedia.org` is not blocked by the environment. Wikimedia refuses this container's shared address for full-size files and for thumbnails on that host. The same files at a standard thumbnail width (960 or 1280 px) on `thumb.wikimedia.org` answer 200. Owner ruling 2026-10-21: use the 1280 px thumbnail from `thumb.wikimedia.org`, then make the 440 px copy.
- wildflower.org answered with and without a User-Agent in the probe. The owner's ruling stands all the same: every download sends a User-Agent header, and a response that is not an image (such as a "Just a moment..." page) is a failure, never a saved image.

The container:

- Node is 22.22 here, not 24. The eval code is plain `.mjs` and runs on both. Node 22.22 also imports `pipeline/lib/http.ts` (type stripping is on), so the eval reads `RATE_PER_SECOND` from there.
- `npm ci` installs `sharp` 0.35.4 from the npm registry, and it loads.
- The workflow run records and agent transcripts of this session are under `/root/.claude/projects/-home-user-Dendro/<session id>/`. They go away with the container. So `collect.mjs` runs in the same session as its workflow, and its output is committed at once.

The old harness:

- `lib/data.mjs` hard-codes Windows paths (`C:/Users/jdennen/Dendro`). The copy replaces them with paths from `import.meta.url`.
- The old `images.mjs` reads local files from `pipeline/cache/`. That folder is not in git, so the copy downloads each image instead.
- Old per-photo costs (pass P1, 440 px, calls of 10, effort high): Opus USD 0.0177, Sonnet 0.0096, Haiku 0.00074. The spec adds 30% for the new schema: Opus 0.0230, Sonnet 0.0125, Haiku 0.0010.

## Global constraints

- All eval work is in `evals/2026-10-14-intake-eval/` (called `EVAL` below). Git tracks it. Git ignores only `evals/**/images/`, so every image copy, original, and contact sheet goes under `EVAL/images/`. Everything else in `EVAL` is committed: code, tests, pools, briefs, workflow scripts, run results, labels, tables, and the report.
- Do not change `pipeline/`, `app/`, `content/`, `content_src/`, or any skill. Agents never retire photos. Agents do not edit `content/concepts.json`, `content/units.json`, or `content/features.json`. Read the run files and `prototype/photo-review/` read-only.
- No new npm dependency. Load `sharp` with `await import('sharp')`. Run `npm ci` once per new container.
- `lib/step.mjs` is plain JavaScript with no import. Phase 4 moves it into `app/logic/` unchanged, and the pipeline imports it from there (spec Part 4).
- Every image download sends `User-Agent: Mozilla/5.0 (compatible; dendro-eval/0.1; +https://github.com/JDenn0514/Dendro)`. It keeps the per-host rates of `RATE_PER_SECOND` in `pipeline/lib/http.ts`. It saves a file only when the response is an image and `sharp` can decode it. It never fakes, skips, or replaces a photo that fails: the photo stays in the pool, and the task stops and names the host.
- Judges read the 440 px copy only, with the Read tool. They run no Bash, write no file, and open no web page. Ranking agents read contact sheets only, never a photo file (owner ruling 2026-10-08).
- Judge models: `claude-opus-5-5`, `claude-sonnet-5-5`, and `claude-haiku-5-5`. Every agent gets the full model ID and an explicit effort from its job. Judges run at `medium`, `high`, or `xhigh` (owner ruling 2026-10-21, see "Effort levels"). Ranking agents always run at `high`.
- Prices per 1M tokens, input and output: Opus USD 4 and 20, Sonnet 2 and 10, Haiku 0.10 and 0.50. Cache writes and reads keep the rates of the old `lib/tokens.mjs`. Every cost shows as tokens and as price-weighted USD.
- Every workflow over 10 agents needs the owner's yes before launch. The tracer (10 agents) does not. A launch over 10 agents states the agent count and the USD range first.
- Fairness:
  - Judges never see the owner's labels, picks, or notes, or the agent suggestions in `data.js`.
  - The owner sees no judge answer for a held-out photo until the owner's 40 repeat labels are in (Task 10). The blind pages show photos and credits only.
- Photo calls that need the owner's eye go on a review sheet: a private artifact page that works on a phone, with photos side by side and captions, that saves each answer.
- Prose, comments, and commit messages use Simplified Technical English: short sentences, active voice, plain words.
- Branches `feat/intake-eval-<n>-<slug>`. Commit scopes `feat(evals):` for code and `test:` for tests only. Each task ends in one pull request, or adds its result files to the pull request that the task names. The owner merges.
- Tests: `node --test "evals/2026-10-14-intake-eval/test/*.test.mjs"` from the repo root. The tests never use the network: the download code takes an injected `fetchImpl`, as the pipeline does.

## File structure

| File | Job | Task |
|---|---|---|
| `NOTES.md` | Progress log: one line per finished step group, with run IDs and costs. | 1 |
| `config.json` | Models, effort, seeds, `app_px` 440, quotas, rules, K values, depth features, the User-Agent. | 1 |
| `lib/paths.mjs` | `ROOT` and `EVAL` from `import.meta.url`, built with `path.join`. | 1 |
| `lib/data.mjs` | JSON and JSONL helpers, key building, held-out pool building. | 1, 2, 8 |
| `lib/seed.mjs` | Kept as is: `mulberry32`, `shuffle`, `pickOrder`. `chooseTargets` goes. | 1 |
| `lib/step.mjs` | **New.** `stepOf`, `codeOrder`, and `cellSteps` (with the thin-cell rule). Pure, no import. | 1 |
| `lib/fetch.mjs` | **New.** Image download with the User-Agent, the per-host rate, the image check, and the Wikimedia rule. | 2 |
| `images.mjs` | Downloads the originals, makes the 440 px copies, makes the contact sheets. | 2 |
| `lib/sheet.mjs` | Kept as is: 3 × 3 contact sheets of 440 px tiles. | 2 |
| `key-pools.mjs` | Builds `key/pools.json` from the two key files and the run candidates. | 2 |
| `lib/schemas.mjs` | The judge schema (Part 1 fields), the ranking schema, the model-check schema. | 2 |
| `lib/prompts.mjs` | Briefs V1 and V2, the ranking brief, and the agent prompts. | 2 |
| `make-workflow.mjs` | Job lists and workflow scripts for the job kinds `check`, `judge`, and `rank`. | 2, 4 |
| `collect.mjs`, `check-run.mjs`, `lib/tokens.mjs`, `lib/journal.mjs`, `lib/coverage.mjs` | Kept, with the new job kinds. Tokens and USD per job from the transcripts. | 2 |
| `lib/views.mjs` | Answers per model, variant, and photo, from `results.json`. | 2 |
| `estimate.mjs` | USD estimate of a job list, from the old per-photo costs plus 30%, then from the tracer. | 2, 3 |
| `lib/replay.mjs` | Methods S, F, R, FR, and CR with the quota per difficulty step. | 4 |
| `lib/score.mjs` | Keep, drop recall, difficulty step, top pick, species doubt, repeat, cost, quota fill, source yield, time; the decision rule. | 4 |
| `analyze.mjs` | Writes `tables/<set>/table.json` and `table.md`. | 4, 7, 11 |
| `freeze.mjs` | Writes and checks `frozen.json`. | 7 |
| `heldout-pools.mjs` | Builds `heldout/pools.json`. | 8 |
| `pages/` | Builders of the label page, the repeat page, and the review sheets. | 7, 8, 10 |
| `import-answers.mjs` | Turns an `ArtifactData` export into `heldout/labels.json`, `best.json`, or `repeat.json`. | 8 |
| `report.mjs`, `report.md` | The report. | 11 |
| `test/*.test.mjs` | Unit tests. | all |

Files of the old harness that go: `server.mjs`, `pick.html`, `blind.html`, `blind.mjs`, `check-picks.mjs`, `tracer-row.mjs`, `lib/picks.mjs`, and their tests. The owner's pages are now artifact pages (spec, "What is reused": the pick and blind pages are not reused).

Data layout in `EVAL`: `key/`, `heldout/`, `briefs/`, `wf/`, `runs/<name>/`, `tables/`, and `images/` (git-ignored: `images/orig/`, `images/app/<set>/<code>.jpg`, `images/sheets/`). The tables go in `tables/`, not `out/`, because the root `.gitignore` ignores every `out/` folder (owner ruling 2026-10-21).

## Effort levels (owner ruling 2026-10-21)

The spec keeps effort at `high` and leaves tuning to issue #22. The owner changed that on 2026-10-21: the eval also tests effort, because cost and quality both count. A judge **set-up** is one model at one effort.

- **The grid:** Opus, Sonnet, and Haiku, each at `medium`, `high`, and `xhigh`. That is 9 set-ups.
- **Cost first, from the effort tracer** (Task 3, part 2). The 6 set-ups that the first tracer does not run judge the same 10 key photos with V1. It gives the real USD and tokens per photo for all 9 set-ups before any large run.
- **Quality on the key** (Task 5, part 2). V1 and V2 run at `high` first, as the spec says. The leading variant then also runs at `medium` and `xhigh` for all 3 models. So every set-up has 211 key photos to score.
- **The replay is free across set-ups.** Every method can use any stored set-up: for example, a Haiku `medium` reject pass before Opus `xhigh`. The report shows every set-up on one chart of exact difficulty step against USD per kept photo, so the owner sees where more effort buys quality.
- **The decision rule does not change.** A set-up that is more than 5 points better than all the others is the only one on the shortlist, whatever its cost. Within 5 points, the cheapest one wins. The owner rules on the report as before.
- **The freeze** (Task 7) names one effort for each model: the effort with the best exact difficulty step on the key, or the cheaper one in a tie within 5 points. The held-out run uses those 3 set-ups.
- The repeat run (Task 6) uses the same effort for each model.

## Choices made where the spec is silent

Each choice is the plan's default. The owner can change any of them in the plan diff.

1. **The key's cells come from the key.** A key photo's cell is its `species` and `part` in the picks file. When the judge sets a different part, the photo counts as a reject for keep, and the report counts it as a part error.
2. **The key's order.** A shuffle of each cell's photos, fixed by the seed, stands in for fetch order. The order of `data.js` does not, because it lists each cell by the agent's suggested difficulty step (owner ruling 2026-10-21). The key number `<nn>` follows the shuffle. The order matters for the cost of S and F and for the ties of CR, because the key cannot test the quota fill (spec, "The sample"). The judges see neither the key nor this order: their prompts give an opaque photo code (`p001` to `p211`), and the photos of each call are in a fixed shuffled order (owner ruling 2026-10-21).
3. **Batches.** On the key, calls of 10 run across the cells in key order: 22 calls per model and prompt variant, as in the spec (132 agents for 2 variants and 3 models). On the held-out set, calls of 10 stay inside one species, so that the prompt names one tree: PLRA 9, QULA 7, and QUAU 6, which is 22 calls per model, 66 agents, not the spec's 63.
4. **The source name goes to the judge.** The hybrid rule needs the name on the source page (spec, Identity). Each photo line in the prompt gives that name: the candidate's `source_species`, or for a published key photo the target's PLANTS name. The judge opens no page. Species doubt is scored against that name.
5. **The depth feature.** `config.json` has `depth_features: { "PLHI": { "fruit": "two_heads" } }`, from the spec's example. The judge answers it on a PLHI fruit photo. It does not enter the difficulty step.
6. **The two rules that the replay tests.** `P`, the proposed rule of spec Part 1. `K3`, the same rule without the last reject line, so every difficulty step 3 photo stays and the quota cuts the extra ones (spec, "Notes on the rule").
7. **The thin-cell rule.** It runs inside `cellSteps`, after `stepOf` has run on every photo of the cell. When no photo of the cell is kept, and one or more photos were rejected by the last reject line only, the first of those in code order comes back at difficulty step 3 with `thin_cell: true`. Code order is the CR order (method CR in spec Part 2). The scores count a thin-cell photo as kept at difficulty step 3. The report lists each one, and Task 7 puts each one on a review sheet for the owner. Under rule `K3` the thin-cell rule never fires, because that line does not exist.
8. **What a ranking agent sees.** One agent per cell and judge model. It gets the cell's photos that the judge does not reject under rule `K3`, on contact sheets grouped by the difficulty step of rule `P` (photos that only the last reject line rejects sit with difficulty step 3). It returns one order for each difficulty step. The replay joins the three orders (difficulty step 1, then 2, then 3) into one list. Each method and rule then keeps that list's order inside each of its own difficulty steps. A cell with fewer than 2 photos to rank needs no agent.
9. **The ranker's group line.** The spec's ranking order ends with "the view that the other species of the group show". The code derives each photo's view from the judge's answers (v1 spec section 3.7: a leaf on a twig or one leaf, and the side; a fruit on the twig or picked; bark close or far). The prompt then gives one line: the most common view among the kept difficulty step 1 photos of the same part of the other species of the same genus in the same set. A species with no genus mate in its set gets no line.
10. **FR with Haiku as the main judge is R with Haiku.** The ranking jobs use Haiku's leading effort for the reject pass. Haiku's reject pass and Haiku's main answers are then the same stored answers, so the set to rank is the same. Those ranking jobs do not run. A cell where FR's set equals R's set for the same model reuses R's ranking. So FR ranking is at most 42 agents on the key (spec: 63) and at most 18 on the held-out set (spec: 27).
11. **The ranking cost line.** For each model, the replay fits USD and tokens as `a + b × n` (n photos ranked) from this eval's real ranking jobs: the key cells and the held-out cells give many values of n. R at K = 20 or 30 prices its ranking from that line. The old eval's line shows next to it as a check.
12. **The usual-look rule in the quota.** At difficulty step 1, a method fills the quota in its own order, then swaps in the highest usual-look photos it holds until 2 or more of the step 1 photos are the usual look. S and F stop only when every quota of the species is full, the usual-look rule included, or the pool ends.
13. **A photo with no answer** (a failed agent, a file the judge could not open) counts as a reject, and the report counts these photos per model.
14. **The leading prompt variant.** The variant whose best model at `high` has the higher exact difficulty step on the key, under rule `P`. A tie within 5 points goes to V1, because V1 writes less output. The effort runs and the repeat run use it.
15. **Keep agreement belongs to the judge set-up, not the method.** Every photo of a pool gets judged, so keep and difficulty step agreement depend on the model, the variant, the rule, and the Haiku reject pass. S, R, and CR with the same set-up have the same agreement. The methods differ in cost, quota fill, and top pick.
16. **The decision rule after the freeze.** Task 7 freezes one prompt variant and one rule from the key's gates. The shortlist (spec, decision rule step 2) is then made of the ranking methods under that variant and rule: R at each K, FR, and CR, for each model.
17. **The report goes to the owner as a private artifact page** too, so it reads on a phone. `report.md` in git is the record.

## Phase 1: the harness

### Task 1: Copy the harness, and write `lib/step.mjs` with its tests

Pull request: `feat/intake-eval-1-harness`. Agents: 0. Cost: USD 0.

Files:

- Create `EVAL` from a copy of `evals/2026-10-07-selection-eval/`. Delete the files listed under "File structure". Add `lib/paths.mjs`, `config.json` (new keys), and `NOTES.md`.
- Create `lib/step.mjs` and `test/step.test.mjs`.

`lib/step.mjs` exports:

- `KEY_FEATURES`: `{ leaf: ['shape', 'margin'], bark: ['texture', 'pattern'], fruit: ['kind', 'shape'] }`. `OTHER_FEATURES`: `{ leaf: ['venation', 'arrangement', 'size'], bark: ['colour'], fruit: ['hang', 'wing', 'cap'] }`.
- `stepOf(answers, { rule = 'P' } = {})` returns `{ keep, step, line }`. `line` names the reject line that fired (`reject_list`, `part_other`, `key_no`, `key_search_cause`) or `null`. The rule, in order:
  1. Reject when `reject` is not empty or `part` is `other`; when a key photo feature is `no`; under rule `P` only, when a key photo feature is `search` and `causes` is not empty.
  2. Difficulty step 3 when a key photo feature is `search`, or `causes` is not empty.
  3. Difficulty step 1 when every key photo feature is `clear`, `whole` and `alone` are true, and for bark `too_close` is false.
  4. Difficulty step 2 otherwise.
  Season, scale, `usual_look`, `growth_stage`, `side`, `not_for`, and the depth feature never change the result. A missing answer object returns `{ keep: false, step: null, line: 'no_answer' }`.
- `codeOrder(photos, part)` sorts the photos of one cell: usual look first, then (fruit only) a scale object other than `none`, then `whole` and `alone` both true, then the most key and other photo features at `clear`, then fetch order. Each photo is `{ key, n, answers }`.
- `cellSteps(photos, part, opts)` runs `stepOf` on each photo, then the thin-cell rule (choice 7). It returns one `{ key, keep, step, line, thin_cell }` per photo.

The tests use the key's real cases. Each test names the key photo `id` and the owner's call, and gives the answers that a judge should return for that photo under spec Part 1. The expected result is the rule's result:

| Test | Key photo, owner's call | Answers | Expected |
|---|---|---|---|
| bark that fills the frame, with a hand | `b4b650d34aff` ACRU bark, kept at 1 | texture and pattern clear, whole, alone, `too_close` false, scale `hand` | keep, 1 |
| bark too close is not difficulty step 1 | `f3e29056f94c` PLOC bark, kept at 2 (note: "It's too close to be a plain step 1") | the same, `too_close` true | keep, 2 |
| one whole green leaf | `7be548d8bdda` ACRU leaf, kept at 1 | shape and margin clear, whole, alone | keep, 1 |
| autumn colour does not change the difficulty step | `97346a0d43b8` ACRU leaf, kept at 1 | as above, `growth_stage` autumn, `usual_look` false, season autumn | keep, 1 |
| several leaves, all clear | `c956e38f4a44` QUAL leaf, kept at 2 | shape and margin clear, whole, `alone` false | keep, 2 |
| damage makes it difficulty step 3 | `6bcb29a61da9` QUAL leaf, kept at 3 | keys clear, causes `damaged` | keep, 3 |
| a young leaf is difficulty step 3 | `37066e9c9542` QURU leaf, kept at 3 | keys clear, causes `young` | keep, 3 |
| young and searched is a reject | `09092a8f8a50` QURU leaf, dropped | shape `search`, causes `young` | reject, `key_search_cause` |
| young samaras | `e19b3bcd48d2` ACRU fruit, dropped | kind clear, shape `search`, causes `young` | reject |
| flash light | `812d2a774392` ACRU fruit, kept at 3 | keys clear, causes `light` | keep, 3 |
| a view up the trunk | `c25d028896ef` ACSA3 bark, dropped | pattern `search`, causes `angle` | reject |
| the same photo under rule `K3` | `c25d028896ef` | as above, rule `K3` | keep, 3 |
| a fruit crown at a distance | `1ccd34231791` LITU fruit, dropped | kind `no` | reject, `key_no` |
| a dead leaf | `c4feb700d7c7` PLHI leaf, dropped | `reject: ['dead_leaf']` | reject, `reject_list` |
| one samara pair with a ruler | `c6411076f1ba` ACSA3 fruit, kept at 1 | keys clear, whole, alone, scale `ruler` | keep, 1 |
| a full-size unripe fruit gets its step from clarity | `4f7ca07def95` PLHI fruit, kept at 2 | keys clear, whole, `alone` false, `growth_stage` unripe, causes empty | keep, 2 |
| a variant leaf form is not `atypical` | `7b414f8084d5` LITU leaf (6 lobes), kept at 1 | keys clear, whole, alone, `usual_look` false, `not_for` `['outline']` | keep, 1 |
| the part `other` | any | `part: 'other'` | reject, `part_other` |
| the depth feature does not reject | a PLHI fruit | keys clear, whole, alone, `two_heads` `no` | keep, 1 |
| `too_close` counts for bark only | a leaf | keys clear, whole, alone, `too_close` true | keep, 1 |
| no answer | any | `null` | reject, `no_answer` |

Thin-cell tests, on the key's one cell where the owner dropped every photo (LITU bark, 6 photos):

- `e9eaa48d1274`, `a7e9e6af81cd`, and `eea9be1d848f` get `key_no` answers. `58137e0b947f` (angle) and `212bc18d9a4f` (atypical) get `key_search_cause` answers. `f4b8c38685c7` gets `reject: ['feature_unclear']`. Expected: only the first of `58137e0b947f` and `212bc18d9a4f` in code order comes back, at difficulty step 3, with `thin_cell: true`. The others stay rejects.
- The same cell with one photo kept at difficulty step 2: no photo comes back.
- The same cell where every reject is `key_no` or `reject_list`: no photo comes back.
- Rule `K3` on the first cell: the two `key_search_cause` photos are kept at difficulty step 3, and no photo has `thin_cell`.
- `codeOrder`: a usual-look photo ranks above a clearer photo that is not the usual look; a fruit with a hand ranks above the same fruit with none; a leaf with a hand does not rank above a leaf with none; fetch order breaks a tie.

Steps:

- [ ] Copy the folder. Delete the files that go. Replace `MAIN` and `EVAL` with `lib/paths.mjs`. Fix the old tests that remain until they pass.
- [ ] Write `test/step.test.mjs` and see it fail. Write `lib/step.mjs`. See the tests pass.
- [ ] Run the whole eval suite. Write a `NOTES.md` line. Commit and open the pull request.

Done when: the old tests that stay and every new step test pass with `node --test`, `lib/step.mjs` has no import, and no file in `EVAL` names a Windows path.

### Task 2: Key pools, images, prompts, schemas, and the workflow builder

Pull request: `feat/intake-eval-2-key-inputs`. Agents: 0. Cost: USD 0.

Files: `lib/fetch.mjs`, `images.mjs`, `key-pools.mjs`, `lib/data.mjs`, `lib/schemas.mjs`, `lib/prompts.mjs`, `make-workflow.mjs`, `lib/views.mjs`, `collect.mjs`, `check-run.mjs`, `lib/coverage.mjs`, `estimate.mjs`, and their tests. Output files: `key/pools.json`, `key/img-failures.json`, `briefs/judge-V1.md`, `briefs/judge-V2.md`, `briefs/rank.md`.

`key-pools.mjs`:

- Reads `REVIEW_SECTIONS` from `data.js` (it assigns `window`), and the picks.
- For each of the 211 photos: `key` `<SYMBOL>-<part>-<nn>` (key order inside the cell), the cell, the image URL (the CDN `src` for a published photo; the candidate's `file_url` for a `cand:` photo), the source, the credit, the source species name (choice 4), `published`, and the owner's `keep` and `step`.
- Writes the agent suggestions nowhere. `key/pools.json` holds no `reason`, `features`, `stage`, `season`, `scale`, `usualLook`, or `suggested_step`.

`lib/fetch.mjs`:

- `download(url, { fetchImpl, sleep, now })` sends the User-Agent header, waits per host as `RATE_PER_SECOND` says (1 per second when the host is not listed), retries a 429 or a 5xx 3 times with backoff from 2 s, and returns the bytes only when the content type is `image/*`.
- `wikimediaThumb(url, width)` turns an `upload.wikimedia.org/wikipedia/commons/<a>/<ab>/<name>` URL into `thumb.wikimedia.org/wikipedia/commons/thumb/<a>/<ab>/<name>/<width>px-<name>`. `images.mjs` uses it at 1280 px for every `upload.wikimedia.org` URL (owner ruling 2026-10-21). It drops the `?utm_...` query first. On 2026-10-21 all 13 of these photos answered 200 at 1280 px. When one fails later, the task stops and names it. The pool records the URL that was used.

`images.mjs --set key|heldout`:

- Saves each original once to `images/orig/<sha256 of the URL>.<ext>`. Makes the 440 px copy `images/app/<set>/<key>.jpg` (EXIF rotate, quality 85, `fit: inside`, as the old script). A file that `sharp` cannot decode is a failure.
- Writes `<set>/img-failures.json` with the host of each failure. Prints the count per host. Exits 1 on any failure.

`lib/schemas.mjs`, the judge schema, one item per photo:

- `key`, `description` (V2 fills it with two or three sentences; V1 sets it to `""`), `part`, `photo_features` (an object; each value `clear`, `search`, or `no`; the names of the part, plus the depth feature when the prompt names one), `whole`, `alone`, `too_close` (boolean or null), `side` (`upper`, `under`, `both`, or null), `causes`, `scale`, `season`, `growth_stage`, `usual_look`, `not_for`, `reject`, `escalate`, and `note`.
- `reject` values: the 10 reject checks of the photo-check Quality section as codes (`feature_unclear`, `leaf_mass`, `bark_up_or_dark`, `blur`, `dead_leaf`, `name_label`, `buds_or_flowers`, `sucker_leaf`, `greyscale`, `fruit_part_missing`), plus `feature_not_found`, `hybrid`, and `unread`.
- `escalate`: `mismatch`, `license`, `quality`, or `none`. `license` is in the enum but the brief says not to judge the licence.
- The model-check schema adds `model_self_report`. The ranking schema: `{ orders: { "1": [keys], "2": [keys], "3": [keys] }, unread: [keys], note }`.

`lib/prompts.mjs`:

- The judge brief is written from spec Part 1: the photo features per part and their rules (`arrangement`, `hang`, `size`, a smooth bark pattern, the depth feature), each field with its values, the causes, a variant leaf form, the scale rule, the season rule (a green full-size leaf is `summer`), the usual look (mature and old bark), and identity (the hybrid rule, PLHI). It copies the 10 reject checks, "Not a fault", and the three escalation cases from the photo-check Quality section. It does not copy the Hard checks: the spec's table of old hard checks replaces them.
- V1 asks the checklist in a fixed order: part, each key photo feature, each other photo feature, `whole`, `alone`, `too_close`, each cause, then the rest. V2 adds one first step: write two or three sentences in `description` on what the photo shows, then answer the same checklist. The rules and the schema are the same in both.
- The brief tells the judge: never return a difficulty step; use only the Read tool; do not judge the licence; trust the source name for the species.
- The ranking brief: rank the photos of each difficulty step from the contact sheets only; prefer the usual look, then for fruit a scale object, then the whole subject, then the view of the group line (choice 9).

`make-workflow.mjs --plan <name>` writes `wf/<name>.js` and `wf/<name>.jobs.json`. Job kinds: `check` (model check), `judge` (model, variant, batch), and `rank` (model, set, cell, the photos per difficulty step). It prints the agent count per kind and model, and the estimate from `estimate.mjs`.

`collect.mjs` keeps the old logic: the run record, the transcripts, the token sums, failed attempts, and the model check from the transcript. It finds the session folder from `$HOME/.claude/projects/` and the run ID. It also writes each job's wall-clock start and end for the time metric.

Tests:

- `test/key-pools.test.mjs`: on a three-photo fixture of `data.js` and the picks, the pool has the right keys, cells, and URLs, a `cand:` photo takes the candidate's `file_url`, and no suggestion field is in the output.
- `test/fetch.test.mjs`: every call sends the User-Agent; two calls to one host wait 1 s on an injected clock; an HTML 200 response is a failure; a 429 retries 3 times and then fails; `wikimediaThumb` makes the right URL.
- `test/prompts.test.mjs`: V1 and V2 differ only in the description step; the brief names every photo feature of every part and every cause; no prompt holds a word of the key's suggestions.
- `test/schemas.test.mjs` and `test/workflow.test.mjs` (adapted): the job list for a small fixture has the right labels, models, efforts, keys, and counts.
- The old `tokens`, `journal`, and `coverage` tests, adapted.

Steps:

- [ ] Write the tests and the code above, test first.
- [ ] Run `node key-pools.mjs`. Check: 211 photos, 21 cells, cell sizes 5 to 12.
- [ ] Run `node images.mjs --set key`. When a host fails, stop and tell the owner the host name. Do not go on with fewer photos.
- [ ] Commit the code, the tests, `key/pools.json`, and the briefs. Open the pull request.

Done when: the tests pass, `key/img-failures.json` is empty (211 copies at 440 px), and the briefs hold no suggestion from `data.js`.

### Task 3: The tracer

Workflow run, 10 agents, no owner's yes needed. Its results go on the Task 2 branch before that pull request merges, or on `feat/intake-eval-3-tracer` when Task 2 has merged. Cost: USD 1 (0.5 to 2).

Jobs (10 agents):

- Model check: 2 key photos, one agent for each model with the model-check schema (3 agents).
- Judge calls: 10 key photos chosen with `config.seed`, 4 leaf, 3 bark, and 3 fruit. One V1 call and one V2 call for each model (6 agents).
- Ranking: one Haiku ranking agent on one key cell (1 agent).

Steps:

- [ ] Load the `workflow-authoring` skill. Run `make-workflow.mjs --plan tracer`. Launch the workflow.
- [ ] Run `collect.mjs` at once, in the same session. Run `check-run.mjs`.
- [ ] Check: each transcript ran the model that its job names; every key came back once; no photo is `unread`; the answers pass the schema; `stepOf` runs on every answer.
- [ ] Compare the USD per photo with the estimates (Opus 0.0230, Sonnet 0.0125, Haiku 0.0010). Write the real numbers, the V2 extra output, and the minutes per 100 photos in `NOTES.md`. Run `estimate.mjs` with the tracer numbers for Tasks 5, 6, and 9.
- [ ] Commit `wf/`, `runs/tracer/`, and `NOTES.md`.

Done when: all 10 agents returned, the model check names the right model for each job, and the new estimates are in `NOTES.md`. When a model costs more than 1.5 times its estimate, the next owner's yes shows the new numbers.

**Part 2: the effort tracer.** A second workflow of 6 agents, after part 1. The owner asked for it on 2026-10-21, so it needs no other yes. Cost: about USD 1.5 (0.5 to 3).

- Jobs: the same 10 key photos, V1, one call each for Opus, Sonnet, and Haiku at `medium` and at `xhigh`. Part 1 already gives `high`.
- [ ] Run it as part 1. Collect at once.
- [ ] Write a table in `NOTES.md`: for each of the 9 set-ups, the input and output tokens per photo, the USD per photo, the minutes per 100 photos, and the agreement with the owner on the 10 photos. Ten photos are too few to judge quality. The table is for cost; the key run judges quality.
- [ ] Run `estimate.mjs` for the effort runs of Task 5 with these numbers.

Done when: all 6 agents returned, the model check passes, and the cost table for the 9 set-ups is in `NOTES.md`.

## Phase 2: the key runs

### Task 4: Replay and scores

Pull request: `feat/intake-eval-4-replay`. Agents: 0. Cost: USD 0. This task can run in parallel with Task 3.

Files: `lib/replay.mjs`, `lib/score.mjs`, `analyze.mjs`, `lib/views.mjs`, and the tests `replay.test.mjs`, `score.test.mjs`, and `decision.test.mjs`.

`lib/replay.mjs`. Each method takes one species pool in fetch order, the stored answers of its model(s), the rule, the quota, and the costs. It returns, per cell, the kept photos per difficulty step in order, the photos judged, the photos ranked, and the cost in tokens and USD.

- `S`: walk the pool in calls of 10. Stop after the call that fills every quota of the species (choice 12), or at the end. Keep the first photos in fetch order at each difficulty step.
- `F`: Haiku's answers for every photo; its rejects drop out. Then as S on the rest with the main model, priced per call of 10 (the old `roundUp`).
- `R(K)`, K = 20, 30, or all: the first K photos of the pool. The ranking order of choice 8, cut to those photos. Keep the top photos of each difficulty step up to the quota. Cost: the judge for K photos, plus the ranking line at the photos ranked.
- `FR`: Haiku's rejects drop out of the whole pool. The main judge's answers on the rest. The FR ranking order. Cost: Haiku for every photo, the main judge for the rest, and the ranking line.
- `CR(K)`: as R, but `codeOrder` orders each difficulty step. No ranking cost.
- Quotas: `Q332` (3, 3, 2, with 2 or more usual look at difficulty step 1), `Q221` (2, 2, 1, the same usual-look rule with 2), and `Q442` as a larger test. `Q332` on every cell is the headline, and `Q221` shows next to it (owner ruling 2026-10-21: no species has a `depth` yet).

`lib/score.mjs`, per method, model, variant, rule, and quota:

- Keep agreement, drop recall, exact difficulty step, and within one difficulty step, on the photos that both keep (spec, Metrics).
- Part agreement (held-out set only, where the owner labels the part).
- Top pick: the method's top photo of a cell is its first kept photo at the lowest difficulty step it fills.
- Usual look on the key, secondary.
- Species doubt: `mismatch` escalations and `hybrid` rejects, with the source name of each.
- Repeat agreement: two runs of the same model and variant, on keep and on the difficulty step.
- Batch size (owner ruling 2026-10-23): for each model, V1 at `high` in calls of 20 (set-up `<model>:high:V1:n20`) against calls of 10 (`<model>:high:V1`): keep agreement, exact difficulty step, and within one, each against the owner, and the agreement of the two with each other. Also the USD per photo of each.
- Cost per photo judged and per kept photo, in tokens and USD. Time: minutes per 100 photos.
- Quota fill: the share of cells and difficulty steps filled, and the photos judged to fill them.
- Source yield: per source, the photos kept at each difficulty step, and the cells one fetch fills.
- The decision rule: `gates(row)` (drop recall 80% or more, keep agreement 85% or more, exact difficulty step 80% or more, within one 97% or more), `shortlist(rows)` (within 5 points of the best exact difficulty step and of keep agreement, ranking methods only), `candidate(rows)` (lowest USD per kept photo on the held-out set), and `heldoutCheck(row, ownerRepeat)` (each of keep agreement and exact difficulty step no more than 5 points below the owner's repeat agreement).

Tests (made-up pools of 20 to 30 photos with fixed answers):

- S stops after the call that fills the quota; S goes to the end of the pool when a part never fills; the usual-look rule swaps a photo into difficulty step 1.
- F pays for Haiku on every photo and for the main model on the calls it reads.
- R at K = 20 uses only the first 20 photos; the joined order of choice 8 holds under rule `K3`.
- FR drops Haiku's rejects before the ranking.
- CR keeps `codeOrder`; a fruit with a scale object ranks first; a leaf with one does not.
- A thin-cell photo counts as kept at difficulty step 3.
- Each metric on a small fixture with known numbers. The gates at the exact limits (80% passes, 79.9% fails). The shortlist at exactly 5 points. A candidate that fails the check gives way to the next-cheapest one.

Steps:

- [ ] Write the tests, then the code. Run `analyze.mjs --set key` on the tracer data as a smoke test.
- [ ] Commit and open the pull request.

Done when: the tests pass and `analyze.mjs` writes a table from the tracer data with no problem lines.

### Task 5: The key judge run, V1 and V2

Workflow run. **Needs the owner's yes** (one yes covers Tasks 5 and 6). Pull request: `feat/intake-eval-5-key-runs` (Tasks 5 to 7 share it).

Agents and cost, from the tracers of Task 3 (`NOTES.md`). The owner gave the yes for Tasks 5 and 6 on 2026-10-23 at these numbers:

- Part 1, V1 and V2 at `high`, calls of 10: 132 agents (22 calls × 3 models × 2 variants). USD 26 (19 to 39).
- Part 1b, the batch-size test (owner ruling 2026-10-23): V1 at `high` in calls of 20, for all 3 models: 33 agents (11 calls × 3 models). About USD 8 (6 to 15). The photos, the prompt, and the effort are those of part 1 V1, so a difference comes from the call size alone.
- Part 2, the leading variant at `medium` and `xhigh`, calls of 10: 132 agents (22 calls × 3 models × 2 efforts). USD 22 (16 to 33).

Steps:

- [x] Ask the owner for the yes for Tasks 5 and 6, with the agent counts and the USD ranges from the tracers. (Given 2026-10-23.)
- [ ] Part 1: run `make-workflow.mjs --plan key-judge`. Launch. Run `collect.mjs` at once. Run `check-run.mjs`.
- [ ] Part 1b: run `make-workflow.mjs --plan key-batch20`. Launch. Collect at once. Run `check-run.mjs`. Parts 1 and 1b can run in one session, one after the other.
- [ ] Re-run the failed jobs once with `resumeFromRunId`. A photo still with no answer counts as a reject (choice 13).
- [ ] Run `analyze.mjs --set key`. Name the leading variant (choice 14) in `NOTES.md`. Write the batch-size result in `NOTES.md`: calls of 20 are as accurate as calls of 10 for a model when its keep agreement and exact difficulty step are each no more than 5 points below those of calls of 10. The owner then rules whether later runs use calls of 20.
- [ ] Part 2: run `make-workflow.mjs --plan key-effort`. Launch. Collect at once. Run `analyze.mjs --set key` again with all 9 set-ups. Name each model's leading effort in `NOTES.md`.
- [ ] Commit `runs/key-judge/`, `runs/key-batch20/`, `runs/key-effort/`, and `tables/key/`.

Done when: every job has a result or a recorded failure, the model check passes, the leading variant is named, each model has a leading effort, and the batch-size result is in `NOTES.md`.

### Task 6: The key repeat and the rankings

Workflow run, same yes as Task 5. Same pull request.

Agents:

- The repeat of the leading variant, 3 models, each at its leading effort: 66 agents, USD 15 at `high` (the tracer numbers; another effort or the owner's batch-size ruling changes it).
- The ranking jobs use the judge answers of each model's leading effort.
- The R ranking, 21 cells × 3 models: up to 63 agents, USD 10.6.
- The FR ranking, 21 cells × Opus and Sonnet (choice 10): up to 42 agents, USD 10.4. The spec counts 63 agents.

In all: up to 171 agents, USD 36 (27 to 54), from the tracers.

Steps:

- [ ] Make the contact sheets for each ranking job (choice 8). Run `make-workflow.mjs --plan key-rank`. Launch. Collect at once.
- [ ] Commit `runs/key-rank/`.

Done when: every ranking job returned an order for each difficulty step, or its failure is recorded, and the repeat has a result for every photo.

### Task 7: Key scores, the freeze, and the owner's calls on the key

Same pull request as Tasks 5 and 6. Agents: 0. Cost: USD 0.

Steps:

- [ ] Run `analyze.mjs --set key` on all key data: every method, model, variant, rule, and quota. Write `tables/key/table.md`.
- [ ] Apply the gates. Write which set-ups pass.
- [ ] Make a review sheet (an artifact page, see Task 8 for the page rules) for the photo calls that need the owner's eye: each thin-cell photo, and each species doubt. Photos side by side, with captions: the judge's answers, the computed difficulty step, the note, and the source name.
- [ ] When no set-up passes a gate: make a second review sheet with examples of the failing gate, and ask the owner a policy question with options. The spec's first option is a third prompt variant with a reference sheet (two example photos for each difficulty step, from species outside the key and the held-out set). That variant is a new task and a new owner's yes (about 66 agents, about USD 8).
- [ ] Freeze: `freeze.mjs` writes `frozen.json` with the prompt variant, the rule, the effort of each model, and the sha256 of `lib/step.mjs`, of the judge brief, and of `lib/schemas.mjs`. Write the key section of the report draft, with the chart of the 9 set-ups (exact difficulty step against USD per kept photo).
- [ ] Commit `tables/key/`, `frozen.json`, and the owner's answers on the review sheets. Ask the owner to merge.

Done when: the key table is committed, one variant and one rule are frozen, and the owner answered each photo call on the review sheet.

## Phase 3: the held-out set

### Task 8: Held-out pools, images, and the blind label page

Pull request: `feat/intake-eval-8-heldout`. Agents: 0. Cost: USD 0. Owner work: about 40 minutes of labels, then the best photo of each cell. This task can start once Task 2 merges. It must end before the owner sees any held-out judge answer.

Files: `heldout-pools.mjs`, `lib/data.mjs`, `pages/label-page.mjs`, `import-answers.mjs`, and the tests `heldout-pools.test.mjs`, `pages.test.mjs`, and `import-answers.test.mjs`.

`heldout-pools.mjs`:

- The last row of each candidate `id` of PLRA, QULA, and QUAU in `simple_lobed_us`, in file order (fetch order), all parts, manual rows included. Drop a row with `fetch_error`, no `file_hash`, or a `file_hash` already in the species pool, and record each drop.
- Expected: PLRA 82, QULA 70, QUAU 56 (4 duplicates dropped), 208 in all. The script exits 1 when a count differs.
- Writes `heldout/pools.json` and `heldout/blind-key.json`, which maps an opaque ID for each photo to its key. The page knows only the opaque IDs.

The label page (private artifact page, `db` and `user` capabilities):

- Load the `artifact-design` skill before the first page, and the `artifact-capabilities` skill (done for this plan on 2026-10-21).
- One section per species. In each section the photos show side by side: two per row on a phone, more on a wider screen. The order is shuffled with `pickOrder`, so fetch order does not show. The photo shows at the app size, with no full-size view.
- Each caption: the photo number in the section, the source, and the credit (author and licence).
- No suggestion: no judge answer, no `channel_hint`, no `tags_hint`, no file name, and no fetch position.
- Controls under each photo: part (leaf, bark, fruit, other), keep or drop, and the difficulty step (1, 2, or 3; shown only on a keep). A count of the photos done.
- Each tap saves a document `labels/<opaque id>` with `{ part, keep, step, at }` to `db`. Only Editors and up can read or write. A reload shows the saved answers.
- After the last label, a "Best photo" view: for each species and each part that the owner labelled, the owner's kept photos side by side. One tap saves `best/<species>-<part>`.
- The photos ship as files of the artifact (the 440 px copies, under 255 files).

Steps:

- [ ] Write the tests: the pool counts and order on a fixture; the blind key round trip; the page HTML has no key, no hint, and no judge word; `import-answers.mjs` refuses a label with no part, a keep with no difficulty step, or an unknown opaque ID.
- [ ] Build the pools. Run `images.mjs --set heldout`. Stop on any failed host and name it.
- [ ] Build and publish the page. Check it once: one `ArtifactData` list of `labels` and `best`.
- [ ] Send the owner the link. When the owner says the labels are done, export `labels` and `best` with `ArtifactData`, run `import-answers.mjs`, and commit `heldout/labels.json` and `heldout/best.json`.
- [ ] Set a reminder for the repeat labels 7 days after the last label, with `send_later`, when the owner asks for it.

Done when: all 208 photos have a part, a keep, and (on a keep) a difficulty step, each labelled cell has a best photo, and the files are committed.

**The feature check** (spec, "The sample"; owner ruling 2026-10-21: yes). After the held-out labels and best picks are in, a second page: 60 key photos chosen with `config.seed` (20 per part), with one yes or no question per photo feature in learner words, such as "Can you see where the leaf stalks join the twig?". About 10 minutes. The page saves to `features/<opaque id>`. `analyze.mjs` compares the answers with the stored key answers of the three models (a photo feature at `clear` is a yes) and between the models. No new tokens. Done when: all 60 photos have an answer to each question, and `key/feature-check.json` is committed.

### Task 9: The frozen held-out run

Workflow run. **Needs the owner's yes.** It can run while the owner labels, because the owner sees none of its answers until Task 10 ends. Results go on `feat/intake-eval-9-heldout-runs`.

Agents:

- The judge, frozen variant, 3 models, each at its frozen effort: 66 agents (choice 3; the spec counts 63). USD 8 (5 to 12).
- The R ranking, up to 9 cells × 3 models: up to 27 agents. USD 2.5 (1.5 to 4).
- The FR ranking, up to 9 cells × Opus and Sonnet: up to 18 agents. About USD 2 (1.5 to 3.5).

In all: up to 111 agents, USD 12.5 (8 to 19.5). The cells come from the judge's part, so each model has its own cells.

Steps:

- [ ] Run `freeze.mjs --check`. It exits 1 when `lib/step.mjs`, the judge brief, or the schema differs from `frozen.json`.
- [ ] Ask the owner for the yes. Launch the judge workflow. Collect at once.
- [ ] Make the ranking jobs from the judge answers. Launch. Collect at once.
- [ ] Commit `runs/heldout-judge/` and `runs/heldout-rank/`.

Done when: every job has a result or a recorded failure, and the freeze check passed before launch.

### Task 10: The owner's 40 repeat labels

Owner work: about 8 minutes, a week after the labels of Task 8. Agents: 0. Cost: USD 0. Results go on the Task 9 branch.

- [ ] Pick 40 photos with `config.seed` from the 208. Give each a new opaque ID and a new order.
- [ ] Publish the repeat page: the label page's controls, with no best-photo view, saving to `repeat/<opaque id>`. It shows no earlier answer.
- [ ] Export, import, and commit `heldout/repeat.json`.

Done when: all 40 photos have a repeat label. From this point the owner may see held-out judge answers.

### Task 11: Scores, the decision rule, and the report

Pull request: the Task 9 branch. Agents: 0. Cost: USD 0. Owner work: read the report and rule.

Steps:

- [ ] Compute the owner's repeat agreement on the 40 photos: part, keep, and the difficulty step on the photos kept both times.
- [ ] Run `analyze.mjs --set heldout`: keep agreement, drop recall, the difficulty step, part agreement, top pick, species doubt, quota fill, source yield, cost per photo judged and per kept photo, and time, for every method, model, K, and quota under the frozen variant and rule.
- [ ] Apply the decision rule: the shortlist from the key (choice 16), the candidate (lowest USD per kept photo on the held-out set), and the check against the owner's repeat agreement. When the candidate fails, check the next-cheapest method on the shortlist.
- [ ] Write `report.md`: the result, the key table, the held-out table, the decision rule step by step, the costs (tokens and USD) per phase against the estimates, the limits (the key is anchored and small; the rule was tuned on the key), how often the best photo of "all" comes after photo K, and the owner's photo calls.
- [ ] Publish the report as a private artifact page. Send the owner the link.
- [ ] After the owner rules, write the decision record in `docs/decisions/` on this branch, then ask the owner to merge.

Done when: `report.md` and its tables are committed, the owner has ruled, and the decision record is on the branch.

## Summary of agents and cost

| Task | Work | Agents | USD (range) | Owner's yes |
|---|---|---|---|---|
| 3 | Tracer, part 1 | 10 | 1.76, spent | no |
| 3 | Effort tracer, part 2 | 6 | 1.03, spent | asked for by the owner |
| 5 | Key judge, V1 and V2 at `high`, calls of 10 | 132 | 26 (19 to 39) | yes, given 2026-10-23, covers 5 and 6 |
| 5 | Batch-size test, V1 at `high`, calls of 20 | 33 | 8 (6 to 15) | same yes |
| 5 | Key effort runs, `medium` and `xhigh` | 132 | 22 (16 to 33) | same yes |
| 6 | Key repeat, R and FR rankings | up to 171 | 36 (27 to 54) | same yes |
| 9 | Held-out judge, R and FR rankings | up to 111 | 24 (18 to 36) | yes |
| | All | up to 595 | 119 (89 to 179) | |

The costs from Task 3 on are from the tracers (`NOTES.md`). Most of each agent's cost is a fixed context of about 150k to 170k tokens, which is why the batch-size test can matter.

The effort runs add 138 agents and about USD 18.5 to the spec's plan. The tracers replace these guesses with measured numbers before each yes. CR, S, and F add no tokens: they replay from stored answers. A third prompt variant, if one is needed, is a new task with its own yes.

## Rulings on the open questions (2026-10-21)

1. **Wikimedia full-size files.** `upload.wikimedia.org` refuses this container (429) for 13 photos: 2 of the key and 11 of the held-out set. Ruling: download the same file as a 1280 px thumbnail from `thumb.wikimedia.org`, then make the 440 px copy as for every photo.
2. **The quota without a depth.** Ruling: the headline uses the depth `species` quota (3, 3, and 2) on every cell, and the report also shows 2, 2, and 1.
3. **The feature check.** Ruling: yes, after the held-out labels (Task 8).
4. **The pull request for this plan.** Open after the owner's comments on the plan are settled.
5. **`plants.sc.egov.usda.gov`.** The owner added it to the allowed domains. It answers now.
6. **Effort.** Test `medium`, `high`, and `xhigh` for all 3 models (see "Effort levels").
7. **wildflower.org.** Every download sends the User-Agent header. The owner asked whether a first try without it saves work. It does not: the header costs nothing, and a failed first try costs one more request against the limit of 1 per second.

## Rulings of 2026-10-23

1. **Batch size.** Test calls of 20 photos against calls of 10: V1 at `high`, all 3 models, on the key (Task 5, part 1b). The owner rules on the result before Task 6.
2. **The yes for Tasks 5 and 6.** Given at the tracer numbers: Task 5 USD 56 with the batch-size test, Task 6 USD 36.

## Rulings of 2026-10-27

1. **Batch size.** Calls of 20 were as accurate as calls of 10 for all 3 models (Task 5, `NOTES.md`). Ruling: later judge runs use calls of 20.
2. **The repeat run (Task 6).** Each leading set-up gets two runs in calls of 20, so the repeat compares two runs at the call size that later runs use. Opus `high` compares with part 1b (`key-batch20`) and one new run. Sonnet and Haiku `medium` get two new runs (`key-n20`, `key-repeat`). 55 agents, about USD 9 (7 to 13). The ranking jobs use the first calls-of-20 run of each leading set-up.
3. **The leading efforts at calls of 20.** At calls of 20, `high` is more than 5 points better than `medium` on exact difficulty step for Sonnet and Haiku. Ruling: all 3 models use `high`. Sonnet and Haiku get a repeat run at `high` in calls of 20, and the rankings that depend on their answers run again.
4. **No set-up passes the key gates (Task 7).** The owner answered a review sheet of 49 examples, then relabelled 91 more key photos blind. On those 91, the owner's old and new labels agree on the exact difficulty step only 48% of the time, and the judges agree with the owner about as well. Ruling: freeze V1, rule `P`, `high` for all 3 models, calls of 20, without a pass of the fixed gates. Record why they failed. Task 11 judges the held-out run by `heldoutCheck` (each score no more than 5 points below the owner's repeat agreement), not by the fixed gates. Key v2 (the old labels with the owner's later calls on top, `lib/key-v2.mjs`) is the key table of the report, with the old key next to it. No third prompt variant.

## Later plans

- **Phase 4, the pipeline and the skills.** The data model, the validator, the CLI audit commands, and the photo-check and content-run skills (spec Part 4). It moves `lib/step.mjs` into `app/logic/`. A separate plan.
- **Phase 5, the audit of the photos in the manifest** (spec Part 3). A separate plan, after phase 3 ends and the owner rules on the method.
