# Intake pipeline, phase 4: implementation plan

> **For agentic workers:** The owner runs `/to-tickets` on this plan, which makes one GitHub issue for each task, blocked by the tasks it depends on. Then the owner runs `/implement` on each ticket whose blockers are done. The plan holds the detail (files, tests, agents, cost). The ticket tracks the work. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the owner's photo intake method, Sonnet FR, into the content pipeline and the skills. A content run then judges, ranks, and picks its photos with the frozen method, fills a quota at each difficulty step, and sends the picks to the owner's photo check before any photo reaches the manifest. Too few photos is better than bad photos: a cell that does not fill its quota stays short.

**Architecture:** The code that computes keep and the difficulty step moves into `app/logic/step.js`, byte for byte. The frozen brief V1, the ranking brief, and the judge schema go into `pipeline/intake/`, byte for byte. A test checks the sha256 of each one against the eval's `frozen.json`. A new CLI group, `intake`, builds the workflow scripts of the three passes (the Haiku reject pass, the Sonnet judge, the Sonnet ranking), collects the answers and the token costs from the workflow run records, and computes the picks with the code of the eval's replay. The session launches each workflow with the Workflow tool. The owner checks the picks on a private review sheet. `intake check` turns the owner's calls into verdict rows. `build` writes the new photo fields on each new manifest row. Two file commands for the phase 5 audit (`images fields --from`, `images retire --from`) come in this plan too.

**Tech Stack:** Node 24 type stripping (erasable TypeScript, no enums, no parameter properties, no namespaces), `node:test`, `sharp` loaded with `await import('sharp')`, the Workflow tool, the Artifact tool with the `db` capability, and the `ArtifactData` tool.

Sources, all on `main`:

- `docs/decisions/2026-11-13-intake-method.md` (here "the record"). Its Decision, Consequences, and Open lists are final.
- The intake spec, `docs/superpowers/specs/2026-10-14-intake-comparison-and-photo-audit.md` (here "the spec"): Part 1 (the fields and the rule), Part 4 (the changes of this phase), and Part 3 (the audit, phase 5).
- `docs/decisions/2026-10-17-v1-and-intake-rulings.md` and `DESIGN.md` section 19. Section 19 wins over 18 and 17.
- The phase 1 to 3 plan, `docs/superpowers/plans/2026-10-21-intake-eval.md` (here "the eval plan"), its choices 1 to 17, and its rulings.
- The eval: `evals/2026-10-14-intake-eval/` (here `EVAL`), `NOTES.md`, `report.md`, and `frozen.json`.
- The v1 spec, `docs/superpowers/specs/2026-10-14-v1-learning-model-app.md`, sections 3.5 (`depth`, `depth_feature`), 3.7 (the photo fields), and 3.11 (the validator).
- The verification review of 2026-11-17 (rulings 6 to 10). It applies the claude.dev post "How the Claude Code team thinks about verification" (2026-11-16) to this plan: a change cannot change the check that judges it, a check that fails three times stops for a person, a new gate starts in observe mode, and a rule that code can check is code, not skill text.
- `GLOSSARY.md`. This plan says "difficulty step", never "step" alone, "part", not "channel", "photo feature", and "growth stage". A **cell** is one target and one part. A **pick** is a photo that the method puts in a quota slot. The words `step`, `channel`, and `part` stay as field names in code and data.

## Facts checked on 2026-11-13

The method and its numbers (the record, `report.md`, `NOTES.md`):

- The frozen set-up (`EVAL/frozen.json`, frozen 2026-10-27): variant V1, rule `P`, calls of 20, effort `high` for all 3 models. The sha256 values: `lib/step.mjs` `b29afe49…5b6d7822c9ba`, `briefs/judge-V1.md` `aec7848d…5792bb07`, `lib/schemas.mjs` `f48fe5b6…b0cd1`. `freeze.mjs --check` tests them.
- Sonnet FR (the record, Decision 1): Haiku (`claude-haiku-5-5`, `high`) judges every candidate with brief V1. Its rejects under rule `K3` drop out (`FILTER_RULE`, `EVAL/lib/replay.mjs`). Sonnet (`claude-sonnet-5-5`, `high`) judges the rest with brief V1 in calls of 20 inside one species. `stepOf` under rule `P` gives keep and the difficulty step. One Sonnet agent at `high` ranks each cell: the photos that rule `K3` keeps, grouped by the difficulty step of rule `P` (eval plan choices 8 and 9, `rankSets` in `EVAL/lib/rank-jobs.mjs`). A cell with fewer than 2 photos to rank gets no agent.
- On the held-out set (208 photos, 3 species, 9 cells) at quota `Q332`: Haiku passed 114 photos to Sonnet (54.8%). Sonnet FR picked 51 photos, filled 51.9% of the 27 slots, and cost USD 2.68, which is USD 0.0129 per candidate and USD 0.0525 per pick. The owner kept 94.1% of the picks in the same part, and 64.7% are at the owner's difficulty step. Of its 22 picks at difficulty step 1, the owner called 18 step 1 and dropped none.
- Measured costs, calls of 20, `high`, held-out set: Haiku USD 0.26 for 208 photos (USD 0.00125 per photo), Sonnet USD 2.87 for 208 photos (USD 0.0138 per photo). The Sonnet ranking line (`tables/heldout/table.json`, `lines.sonnet`): USD 0.0757 + 0.00086 × n per cell, for n photos ranked.
- Most of the cost of an agent is its fixed context of about 150k to 170k tokens (`NOTES.md`, Task 3). So fewer, larger calls cost less per photo.
- Lessons from the eval runs (`NOTES.md`):
  - A message to the main session while a judge workflow ran reached the running judges. 27 judges went off task and tried to merge a pull request (Task 5, part 2). Their answers did not count, and the jobs ran again. "Do not send the main session a message while a judge workflow runs."
  - A judge sometimes leaves out one photo of its call. The fix was a new workflow with that job only, because a resume with `resumeFromRunId` gives the cached answer back.
  - The run records and the transcripts are under `$HOME/.claude/projects/` and go away with the container. `collect.mjs` must run in the session of the workflow, and its output must be committed at once.
  - Every good judge used only the `Read` and `StructuredOutput` tools. `collect.mjs` checks the model of each transcript.
- The judge brief is not code: `make-workflow.mjs` writes `briefs/judge-V1.md` from the photo-check skill (`extractChecks`, `EVAL/lib/prompts.mjs`), which reads the reject checks of `.claude/skills/photo-check/SKILL.md`. A change to that skill changes a brief that is written again. The held-out plans skip `writeBriefs` and run `freeze.mjs --check` first, but the key plans still call `writeBriefs`.
- `EVAL/lib/step.mjs` has no import. Its first comment says "phase 4 moves this file into app/logic/ unchanged". `EVAL/lib/schemas.mjs` has no import either.
- A second judge does not find the bad picks (replay of 2026-11-17: `stepOf` under rule `P` on the Opus and Haiku answers of `EVAL/runs/heldout-judge`, against the 51 picks of `FR/sonnet:high:V1:n20/P/Q332` in `tables/heldout/table.json`). The owner dropped 3 of the 51 picks. Opus gives the same keep and difficulty step on 36 picks (the owner kept 97.2%, 72% at the owner's difficulty step), keeps 13 at another difficulty step (92.3% kept), and drops or moves 2 (1 kept). To send each Opus disagreement to the owner is 15 picks (29%) for 2 of the 3 drops. Haiku gives the same keep and difficulty step on 34 picks (94.1% kept), another difficulty step on 14 (100% kept), and drops or moves 3 (2 kept). Three drops are too few for a firm result.
- Two of the 3 dropped picks are at difficulty step 3. Until cutover the app hides a step 3 photo (`difficulty: "hard"`), so a bad step 3 pick costs less than a bad step 1 pick.
- The statistics of a fixed bar per run, at a true keep share of 94% (the held-out picks): a sample of 12 picks has no drop with a chance of 0.48; 120 picks have 3 drops or fewer (97%) with a chance of 0.066. The Wilson 95% lower bound of the keep share, at a true 94%, is 0.875 at 100 checked picks, 0.890 at 150, and 0.898 at 200. On the held-out picks it is 0.841 (48 of 51), and 0.851 at difficulty step 1 (22 of 22).

The pipeline today:

- `node --version` is v24.22.1 in this container. The repo has `"type": "module"`. CI (`.github/workflows/check.yml`) runs `node --test "tests/**/*.test.js"`, the two validator runs, and `ids check --base origin/main`. It does not run the pipeline tests or `npm install`. So a hash test in `pipeline/tests/` does not run in CI, and a pull request that changes a frozen file and its hash in the same diff passes CI.
- `pipeline/lib/commands.ts` (2,103 lines) holds `USAGE`, `GROUPS` (`run`, `species`, `photos`, `data`, `images`, `ids`), and `COMMANDS`. There is no `intake` group.
- A verdict row (`pipeline/lib/verdicts.ts`) has `candidate_id`, `verdict` (`approve`, `reject`, `escalate`), `channel`, `tags`, `case`, `note`, `checked_by`, and `checked_at`. `photos apply` stamps `checked_by: photo_check_agent` (`CHECK_AGENT`). `run finish` stamps `owner`. The last row of a candidate wins (`lastByCandidate`).
- A manifest row (`pipeline/lib/manifest.ts`) has the 11 fields of the spec and optional `difficulty` (only `hard`), `retired`, `retired_reason`, and `retired_at`. `publishApproved` sets `difficulty: "hard"` when the approve has the `hard` tag, and never changes a row already in the manifest.
- The validator (`app/logic/content.js`) refuses a `difficulty` other than `hard` (line 222). `inPlay` hides a `hard` or retired row. It knows none of the new photo fields.
- `photos fetch` stops a part of a target at `CHANNEL_TARGET = 8` approved photos that are not hard, and keeps 60 rows per target at most (`MAX_PER_SPECIES`, `pipeline/lib/candidates.ts`). `Q332` is also 8 photos.
- The gap list of `build.json` lists a target and part with fewer than `GAP_THRESHOLD = 4` approved photos (`pipeline/lib/report.ts`).
- The images: `MAX_SIDE` 1200 and `JPEG_QUALITY` 82 (`pipeline/lib/images.ts`). A candidate's original is in `pipeline/cache/`, which git ignores. `pipeline/runs/*/staged/` is ignored too.
- No file in `content_src/species/` (58 files) has `depth` or `depth_feature`. `content/features.json` does not exist yet. The v1 spec (section 3.11) gives both checks to the validator in a v1 ticket.
- The pipeline tests use an injected `fetchImpl` and never use the network (`pipeline/lib/http.ts`, `RATE_PER_SECOND` per host).

## Global constraints

- `app/` never imports from `pipeline/` or `evals/`. The pipeline imports `app/logic/step.js` and `app/logic/content.js`. A pipeline test may read `EVAL` files as fixtures. Pipeline code does not import from `EVAL`.
- The frozen files stay byte for byte: `app/logic/step.js` equals `EVAL/lib/step.mjs`, `pipeline/intake/judge-V1.md` equals `EVAL/briefs/judge-V1.md`, `pipeline/intake/schemas.mjs` equals `EVAL/lib/schemas.mjs`, and `pipeline/intake/rank.md` equals `EVAL/briefs/rank.md`. A change to any of them is a new method, and needs a new eval and the owner's ruling.
- Change `content/species.json`, `content/images/manifest.json`, and the `.jsonl` files of a run only through the CLI. IDs are append-only: retire a published row, never delete it. Agents never retire a photo. Agents do not change `content/concepts.json`, `content/units.json`, or `content/features.json`.
- The `source` of a new manifest row comes from the candidate, as today. This plan adds no `source` value, so `app/logic/sources.js` does not change.
- Judges and rankers are agents of a workflow that the session launches. The CLI does not call a model. Every agent gets the full model ID and the effort `high`.
- Judges read the 440 px copy only, with the Read tool. Rankers read contact sheets only. Neither runs Bash, writes a file, or opens a web page.
- The owner's approval of this plan is the standing yes for the intake workflows of a content run (ruling 3 of 2026-11-13). The session tells the owner the agent count and the USD range before each launch, and does not wait for an answer. It stops and asks only when the spend of a run would pass 1.5 times its estimate. Other workflows of more than 10 agents still need the owner's yes.
- No new npm dependency. Load `sharp` and the S3 client lazily (CI does not run `npm install`). Give `spawnSync` a `maxBuffer` of 256 MB. Build file paths with `path.join`; rows store root-relative paths with `/`.
- Tests: `npm test` (app) and `npm run test:pipeline`. No test uses the network or a model. HTTP goes through an injected `fetchImpl`, image work through an injected `resize`, and the workflow record through fixture files.
- Prose, comments, skill text, and commit messages use Simplified Technical English.
- Branches `feat/intake-pipeline-<n>-<slug>` (Task 9: `skills/intake-pipeline-9-skills`). Commit scopes `feat(pipeline):`, `feat(app):`, `test:`, `docs(skills):`. Each task ends in one pull request. The owner merges.

## File structure

| File | Job | Task |
|---|---|---|
| `app/logic/step.js` | **Moved, unchanged.** `KEY_FEATURES`, `OTHER_FEATURES`, `stepOf`, `codeOrder`, `cellSteps`. | 1 |
| `tests/step.test.js` | The eval's step tests, ported to the app suite. | 1 |
| `pipeline/intake/judge-V1.md`, `rank.md`, `schemas.mjs` | **Copied, unchanged** from `EVAL`. | 1 |
| `pipeline/intake/frozen.json` | The method record: models, effort, variant, rule, calls of 20, the filter rule, and the sha256 of each frozen file. | 1 |
| `pipeline/tests/intake_frozen.test.ts` | The hash check. | 1 |
| `pipeline/lib/intake_commands.ts` | **New.** Task 1 starts it with `intake frozen` only (choice 22). `commands.ts` registers the `intake` group. | 1 |
| `.github/workflows/check.yml` | A step that runs `intake frozen --base origin/main` (choice 22). | 1 |
| `app/logic/content.js` | The photo fields: `PHOTO_FIELDS`, `photoFieldErrors`, and the `step` and `hard` rule. | 2 |
| `pipeline/lib/manifest.ts`, `verdicts.ts` | The new optional fields on a manifest row and an approve. | 2 |
| `pipeline/lib/intake.ts` | **New, pure.** Pools, photo codes, jobs, prompts, the filter, the steps, the rank sets, the quota, the picks, the reserves. | 3 |
| `pipeline/lib/intake_images.ts` | **New.** The 440 px copies and the contact sheets, with an injected `resize`. | 4 |
| `pipeline/lib/intake_collect.ts` | **New.** Run records, transcripts, tokens, USD, tool use, and coverage. | 5 |
| `pipeline/lib/intake_commands.ts` | The other `intake` commands. | 5, 6 |
| `pipeline/lib/intake_sheet.ts` | **New, pure.** The owner's review sheet: HTML and the export reader. | 6 |
| `pipeline/lib/intake_ladder.ts` | **New, pure.** The agreement rows, the pooled keep share, the Wilson lower bound, the rung, and the observe report (choices 20 and 21). | 6 |
| `pipeline/intake/ladder.json` | The owner's bar for the trust ladder. Only the owner changes it (choice 21). | 6 |
| `pipeline/lib/report.ts`, `commands.ts` | `build.json` and `report.md`: the picks per difficulty step, the quota gaps, the intake cost. | 7 |
| `pipeline/lib/commands.ts` | `images fields --from`, `images retire --from`. | 8 |
| `.claude/skills/photo-check/SKILL.md`, `.claude/skills/content-run/SKILL.md` | The new flow. | 9 |
| `CLAUDE.md` | `pipeline/intake/ladder.json` joins the files that only a person authors. | 9 |
| `EVAL/make-workflow.mjs` | `writeBriefs` stops when a frozen brief would change. | 1 |

New run files in `pipeline/runs/<name>/`, all written by the CLI:

| File | Rows | Written by |
|---|---|---|
| `intake/codes.json` | The opaque photo code of each candidate (`c0001` …), fixed at the first `intake jobs`. | `intake jobs` |
| `intake/answers.jsonl` | One row per candidate and pass: `candidate_id`, `pass` (`reject` or `judge`), `model`, `effort`, `brief_sha256`, `schema_sha256`, `job`, `wf_run`, `answers`, `at`. The last row of a candidate and pass wins. | `intake collect` |
| `intake/ranks.jsonl` | One row per ranked cell: `cell`, `target`, `channel`, `model`, `effort`, `groups` (the keys sent), `orders`, `unread`, `note`, `job`, `wf_run`, `at`. | `intake collect` |
| `intake/costs.jsonl` | One row per agent attempt: `wf_run`, `job`, `pass`, `model`, `effort`, `photos`, the input, output, cache write, and cache read tokens, `usd`, `seconds`, `counted` (false for a void attempt), `at`. | `intake collect` |
| `intake/picks.json` | Per cell: the quota, the picks and reserves of each difficulty step in order, the thin-cell photo, and the short slots. Derived: `intake pick` writes it again each time. | `intake pick` |
| `verdicts.jsonl` | As today. `intake check` appends the owner's rows and the code's rejects. | `intake check` |

The job lists, the workflow scripts, the 440 px copies, the contact sheets, and the review sheet go in a folder outside the repo: `--out <dir>`, which the skill sets to the session scratchpad. The 440 px copies and the sheets also stay in `pipeline/cache/intake/<name>/`, which git ignores.

## Choices made where the spec is silent

Each choice is the plan's default. The owner can change any of them in the plan diff.

1. **The move keeps the bytes.** `EVAL/lib/step.mjs` is copied to `app/logic/step.js`, and the eval keeps its copy, because the eval is a closed record and its tests import it. The file name changes from `.mjs` to `.js` (the app's style), and the bytes do not. The same holds for the brief, the ranking brief, and the schema in `pipeline/intake/`. The schema stays `.mjs`, so its hash holds. `pipeline/tests/intake_frozen.test.ts` reads `EVAL/frozen.json` and compares the sha256 of each copy with it, and of `rank.md` with `EVAL/briefs/rank.md`. A copy that differs fails the test and names the file.
2. **The eval cannot write a frozen brief again.** `writeBriefs` in `EVAL/make-workflow.mjs` stops with an error when `frozen.json` exists and a brief it would write differs from the file on disk. The photo-check rewrite (Task 9) would otherwise change `judge-V1.md` on the next key plan.
3. **The method is a record, not flags.** `pipeline/intake/frozen.json` holds the method: `{ "method": "sonnet-fr", "rules": "2026-10", "variant": "V1", "rule": "P", "filter_rule": "K3", "batch": 20, "models": { "reject": "claude-haiku-5-5", "judge": "claude-sonnet-5-5", "rank": "claude-sonnet-5-5" }, "effort": "high", "sha256": { … } }`. The `sha256` map names the four frozen files: `app/logic/step.js`, `pipeline/intake/judge-V1.md`, `pipeline/intake/schemas.mjs`, and `pipeline/intake/rank.md`. No CLI flag changes a model, the effort, the rule, or the call size. `run.json` gets `intake: "sonnet-fr"` at `run init`, so a run judged the old way keeps its old flow.
4. **The quota per depth.** The quota of a cell comes from the `depth` of its part in `content_src/species/<SYMBOL>.json` (v1 spec section 3.5): `species` gives `Q332` (3, 3, 2), and `subgroup`, `group`, or `none` give `Q221` (2, 2, 1). Each needs 2 or more usual-look photos at difficulty step 1 (the eval's `config.json`). A species with no `depth`, or no value for the part, gets `Q332` (the record, Open). A concept target (such as `bark/plated`) gets `Q332`. `picks.json` names the quota of each cell and where it came from (`depth` or `default`). Phase 4 reads `depth` only; the validator check of `depth` is a v1 ticket (v1 spec section 3.11).
5. **The picks.** `intake pick` fills each difficulty step of each cell in the ranked order, with the usual-look swap at difficulty step 1 (eval plan choice 12, `fill` in `EVAL/lib/replay.mjs`). A slot with no photo stays short. The pipeline never moves a photo to another difficulty step or lowers the bar to fill a slot (the record, Decision 2).
6. **Reserves.** After the picks of each difficulty step, the next 2 photos in ranked order are reserves. The review sheet shows them below the picks, so one pass of the owner can fill a slot that a drop opens. `intake check` fills each slot from the owner's keeps in ranked order: picks first, then reserves. A cell short after that stays short until the next fetch.
7. **The owner's calls win.** On each pick and reserve the owner sets keep or drop and the difficulty step, and may set `not_for`. The manifest row takes the owner's difficulty step. The judge's other answers (`usual_look`, `season`, `growth_stage`, `photo_features`, `side`, `scale`) go on the row as they are. The owner can flag one that looks wrong (spec ruling 15); a flag goes in the verdict note and in the report, and changes no field.
8. **Who writes which verdict.** `intake pick` writes no verdict. `intake check` writes, in one append: an `approve` with `checked_by: owner` for each kept pick and reserve that fills a slot; a `reject` with `checked_by: owner` for each drop; a `reject` with `checked_by: intake` for each photo that the code rejects (the Haiku `K3` rejects and the rule `P` rejects), with the reject line and the model in the note; and an `escalate` with `checked_by: intake` for each `mismatch` or `quality` escalation of the judge. A photo that the code keeps but that is not picked, not a reserve, or a reserve that no slot needs gets no verdict. It stays judged (`answers.jsonl`) and can be picked after a later fetch. So no unchecked photo can reach `build`.
9. **The approve carries the fields.** An approve of an intake run has a `photo` object: `{ step, usual_look, season, growth_stage, photo_features, side, scale, not_for, rules }`. `photo_features` lists the photo features at `clear`, the depth feature included. `side` is null except on a leaf. `rules` is `"2026-10"`, the month of the frozen brief and rule; a later brief or rule gets a new value. `publishApproved` copies the object onto a new row, in that field order after `note`, and sets `difficulty: "hard"` when `step` is 3 (spec ruling 4). An approve with no `photo` object behaves as today.
10. **The `hard` rule in the validator.** Until cutover (v1 ticket 6.2), a row with a `step` must have `difficulty: "hard"` when `step` is 3 and no `difficulty` when `step` is 1 or 2. The validator fails any other mix. A row with no `step` keeps today's rules.
11. **`not_for` before `features.json`.** The validator checks that `not_for` is an array of unique non-empty strings, each a depth (`species`, `subgroup`, `group`, `none`) or a word feature key of the form `^[a-z][a-z_]*$`. The check against the keys of `content/features.json` comes with the v1 ticket that adds that file.
12. **Photo codes.** The judges see an opaque code per candidate (`c0001` …), as on the held-out set (`h001` …). The code fixes the order of photos inside a call with the seed of the eval (`mulberry32(seed + i)`), so the prompts have the frozen shape. The prompt line is the eval's: `- <code>: <path> | tree: <scientific name> | source name: <source_species>`, plus the depth feature line when the species has a `depth_feature` (v1 spec section 3.5). A test compares the pipeline's prompt with `promptJudge` of `EVAL/lib/prompts.mjs` on the same input.
13. **Calls.** A call of the reject pass and of the judge pass holds up to 20 photos of one species, in fetch order (`candidates.jsonl` order, the last row of each `id`, no `fetch_error`, a repeated `file_hash` dropped). The judge pass takes the photos that the Haiku pass keeps under rule `K3`. A photo whose `answers.jsonl` already has a row for that pass, with the same brief and schema hash, is not judged again.
14. **The rank pass.** One Sonnet agent per cell with 2 or more photos to rank. It gets every kept photo of the cell, from earlier fetches too, minus the owner's drops, so a later fetch ranks the whole cell again. The group line is the eval's (choice 9, `groupLine`), from the other species of the genus in the same run.
15. **Collect checks.** `intake collect` reads the run record of each `--run` and the transcripts. It voids the answers of an agent that used a tool other than `Read` and `StructuredOutput`, ran another model, or left a photo out, and it lists those jobs. `intake jobs --retry` writes a new script with only those jobs. A void attempt stays in `costs.jsonl` with `counted: false`. Collect commits at once: `content(<name>): intake <pass> answers`. **A job runs 3 times at most** (ruling 8): the first attempt and 2 retries. `intake jobs --retry` counts the void attempts of each job in `costs.jsonl`. It writes no script for a job with 3 void attempts, prints the label and the reason of each attempt, and exits 1. The session stops and tells the owner. The ceiling of choice 16 stays as a second guard on the spend.
16. **The cost.** Each `intake jobs` prints the agents per model and a USD estimate with a range of 0.75 to 1.5 times: Haiku USD 0.00125 per photo, Sonnet USD 0.0138 per photo judged (55% of the candidates before the Haiku pass is known), and ranking USD 0.0757 + 0.00086 × n per cell. It prints the run's ceiling: 1.5 times the estimate of the run (ruling 3). `report.md` gives the measured tokens and USD per pass from `costs.jsonl`, and the USD per pick.
17. **Thin cells.** `cellSteps` runs the thin-cell rule (spec ruling 11). A thin-cell photo shows on the review sheet at difficulty step 3, marked as one. The owner decides it like any pick.
18. **The old flow stays for old runs.** `photos stage`, `photos apply`, and `photos verdict` stay as they are, for a run with no `intake` field and for hand fixes. `intake` commands refuse a run with no `intake` field. The photo-check skill describes the new flow only (ruling 2).
19. **The pilot.** A run of 10 agents or fewer, on a new run of one species, ends at `intake check` and does not build, so no photo reaches the manifest. It checks the scripts, the collect step, the model check, the costs, and the sheet with real agents. The branch closes without a merge unless the owner asks for the build.
20. **The agreement record.** `intake check` appends one row per run to `pipeline/runs/<name>/intake/agreement.json`. The row holds the run's rung, and for each check of a pick: the target, the part, the judge's difficulty step, how the pick came onto the sheet (`all` on rung 1, `census` for a step 1 pick on rung 2, `draw` for a random pick, `widen` for choice 23), keep or drop, and the owner's difficulty step. It also holds the **Haiku observe columns** (ruling 9): Haiku's keep and difficulty step for the pick, from the reject-pass answers under rule `P` (`judgeSteps` with Haiku's answers, as the eval's replay). No step of the method reads the Haiku columns. `report.md` shows the run's row. `intake agreement` sums the rows of every run (choice 21), and prints the owner's keep share where Haiku agrees on keep and difficulty step and where it does not. After some runs, the owner can decide from these numbers whether a second judge is worth a plan of its own.
21. **The trust ladder** (rulings 5 and 7). Three rungs set which picks go on the sheet. The random draw uses a seed from the run name, so a second `intake pick` draws the same photos.
    - Rung 1 (`full`): every pick and reserve.
    - Rung 2 (`step1`): every step 1 pick (`census`), every thin-cell photo, and a draw of the other picks: 20% of them and at least 30 (all when there are fewer), with the reserves of each cell on the sheet.
    - Rung 3 (`sample`): a draw by difficulty step: step 1 picks at 20%, step 2 picks at 10%, and step 3 picks at 5%, and at least 30 picks in all (all when there are fewer), with the reserves of each cell on the sheet. A bad step 1 pick costs the most, and the app hides a step 3 photo until cutover.

    A pick that the sheet leaves out becomes an approve with `checked_by: intake` and the judge's difficulty step, except in a widened species (choice 23).

    **The bar is pooled, not per run.** `intake_ladder.ts` reads the agreement rows of the window: the last `window` runs (`ladder.json`). It keeps two strata apart: picks at the judge's difficulty step 1, and the other picks. For each stratum it computes the owner's keep share and its Wilson 95% lower bound. It counts only checks that came by `all`, `census`, or `draw`. A `widen` check is not random, so it stays out of the pooled share; it is still in the record.

    - **Down one rung:** each stratum has at least `min_checked` checks in the runs since the last move down, and the lower bound of each stratum is at or above its `bar`.
    - **Up one rung:** the keep share (the point value) of either stratum in the window is below its `bar`.
    - A run with no rows (the pilot ends before `intake check`) does not count.

    **`pipeline/intake/ladder.json`** holds `{ "bar": { "step1": null, "other": null }, "min_checked": null, "window": 5, "rung": null }`. Only the owner changes it, as `content/concepts.json` (Task 9 adds it to that line of `CLAUDE.md`). **While a `bar` is null, the ladder stays on rung 1 and runs in observe mode** (ruling 7). On each run, `intake agreement` prints the pooled keep share and lower bound of each stratum, and for each run on rung 1, what rung 2 and rung 3 would have left off the sheet: the draw of that rung with the run's seed, the picks it leaves out, and how many of those the owner dropped. The owner sets the values from that report (Open question 1).

    `intake pick` takes the rung that `intake agreement` computes. `--check full|step1` can name a higher rung (more photos on the sheet), never a lower one: `intake pick` refuses a lower rung and exits 1. The owner can set a rung by hand with `rung` in `ladder.json`. That is the one way to a lower rung than the computed one.
22. **The frozen files cannot change in the pull request that they judge** (ruling 6). `intake frozen --base <ref>` reads `pipeline/intake/frozen.json` at `<ref>` with `git show`. When `<ref>` has no such file (the pull request of Task 1), it passes. Otherwise each file in its `sha256` map must have that sha256 on HEAD, and `pipeline/intake/frozen.json` must be byte for byte the same. Each failure names the file, and the command exits 1. CI runs it after `ids check --base origin/main`, so the check reads the record of `main`, not of the pull request. A new method is a new eval and a later plan, and that plan says how the check takes the new record. The command uses only `node:crypto` and `git`, so CI needs no `npm install`. `intake_frozen.test.ts` stays as the local check against `EVAL/frozen.json`.
23. **A drop widens its species** (ruling 7). On rung 2 or 3, when the owner drops a checked pick of a species, `intake check` writes no approve with `checked_by: intake` for that species. Its picks that the sheet left out get no verdict, so no unchecked photo of that species can reach `build`. `intake check` prints the widened species. `intake pick --widen` writes a second sheet with the unchecked picks and the reserves of those species, and `intake check --from` on its export appends the owner's rows as usual (`checked_by: owner`, how: `widen`). When the session does not widen, those picks stay unpublished and the cell stays short: too few photos is better than bad photos (the record, Decision 2). On rung 1 nothing widens, because every pick is on the sheet.
24. **The POWO files are a CLI check** (ruling 10). When the run has a candidate whose `origin` is on `powo.science.kew.org`, `intake jobs --pass reject` needs `--powo <dir>`, the folder of the `powo-harvest` skill. For each species with a POWO candidate, it needs `<dir>/<SYMBOL>-rows.json` and a saved gallery `<dir>/<SYMBOL>-<IPNI id>.html`. When one is missing, it names the species and the file, writes no script, and exits 1.
25. **Rules that code can check are code** (ruling 10). The rules of choices 15, 21, 22, 23, and 24 are in the CLI. The photo-check skill names each command and its exit, and does not restate the rule. Two rules stay in the skill text only, because no command can check them: the session waits for a running workflow and runs no other command (the owner's messages wait until the collect ends), and the session tells the owner the agent count and USD range before each launch.

## Phase 4 tasks

### Task 1: Move the step rule, copy the frozen files, and check their hashes

Pull request: `feat/intake-pipeline-1-frozen`. Agents: 0. Cost: USD 0.

Files:

- Create `app/logic/step.js` as a byte copy of `EVAL/lib/step.mjs`.
- Create `pipeline/intake/judge-V1.md`, `rank.md`, and `schemas.mjs` as byte copies. Create `pipeline/intake/frozen.json` (choice 3).
- Create `tests/step.test.js`: the cases of `EVAL/test/step.test.mjs`, importing `app/logic/step.js`.
- Create `pipeline/tests/intake_frozen.test.ts`.
- Change `EVAL/make-workflow.mjs` (`writeBriefs`, choice 2) and its test.
- Create `pipeline/lib/intake_commands.ts` with `intake frozen --base <ref>` (choice 22). Register the `intake` group and its usage line in `pipeline/lib/commands.ts`.
- Add a step to `.github/workflows/check.yml` after `ids check`: `node pipeline/cli.ts intake frozen --base origin/main`. Commit scope `ci:`.

Tests:

- `tests/step.test.js`: all 32 tests of the eval's step test pass on the app copy (the rule cases, the thin-cell cases, and `codeOrder`).
- `intake_frozen.test.ts`: the sha256 of `app/logic/step.js`, `pipeline/intake/judge-V1.md`, and `pipeline/intake/schemas.mjs` equal the values of `EVAL/frozen.json`; `rank.md` equals `EVAL/briefs/rank.md`; `pipeline/intake/frozen.json` holds the same sha256 values and `variant`, `rule`, `batch`, and effort as `EVAL/frozen.json`, and the sha256 of `rank.md`; `app/logic/step.js` has no `import`.
- `EVAL/test/workflow.test.mjs`: `writeBriefs` throws when `frozen.json` exists and the brief text differs, and writes nothing.
- `pipeline/tests/cli_intake_frozen.test.ts`, on a temporary git repo: a base with no `frozen.json` passes; a one-byte change to a frozen file fails and names it; a change to a frozen file and its hash in `frozen.json` together fails and names `frozen.json`; a new file that is not in the map passes.

Steps:

- [ ] Copy the files with `cp`, not by hand. Write the tests and see them pass.
- [ ] Run `npm test`, `npm run test:pipeline`, the eval suite, and `node pipeline/cli.ts intake frozen --base origin/main`.

Done when: the three suites pass, a one-byte change to any copy makes `intake_frozen.test.ts` fail with the file name, and the CI step passes on the pull request of this task.

### Task 2: The photo fields in the validator, the verdict, and the build

Pull request: `feat/intake-pipeline-2-fields`. Agents: 0. Cost: USD 0. Blocked by: Task 1.

Files: `app/logic/content.js`, `pipeline/lib/manifest.ts`, `pipeline/lib/verdicts.ts`, `pipeline/lib/verdict_apply.ts` (a `photo` object stays out of a staged row), and their tests.

`app/logic/content.js`:

- `PHOTO_FIELDS`: the value lists of spec Part 1 for `step` (1, 2, 3), `usual_look`, `season`, `growth_stage` (per part), `photo_features` (the key and other photo features of the part, from `KEY_FEATURES` and `OTHER_FEATURES` of `step.js`, plus a depth feature name), `side` (leaf only), `scale`, `not_for` (choice 11), and `rules`.
- `photoFieldErrors(row)` returns one message per bad field. `validateContent` runs it on every manifest row that has one of the fields, and applies the `hard` rule of choice 10.
- `inPlay` does not change.

`pipeline/lib/verdicts.ts`: the `photo` object on an approve (choice 9). `validateVerdicts` runs `photoFieldErrors` on it, and refuses a `photo` object on a reject or an escalation.

`pipeline/lib/manifest.ts`: the new optional fields on `ManifestRow`; `publishApproved` copies `photo` and sets `hard` on step 3 (choice 9). A row already in the manifest does not change, as today.

Tests:

- The validator: each field with a good and a bad value; `step` 3 with no `hard` fails; `step` 1 with `hard` fails; a row with no new field passes as today; `side` on a bark row fails; `not_for: ["subgroup", "edge"]` passes and `["Edge"]` fails.
- The build: an approve with `photo.step` 3 gives a row with `difficulty: "hard"` and all the fields in order; `photo.step` 1 gives no `difficulty`; an old approve with the `hard` tag behaves as today; a row already in the manifest keeps its fields.
- `npm run validate` and `validate:dev` pass on the content of `main`, which has none of the new fields.

Done when: both suites pass and the live content validates with no change.

### Task 3: The intake core: pools, jobs, prompts, steps, rank sets, and picks

Pull request: `feat/intake-pipeline-3-core`. Agents: 0. Cost: USD 0. Blocked by: Task 1. Can run in parallel with Task 2.

File: `pipeline/lib/intake.ts`, pure, with no file, network, or model access. It imports `app/logic/step.js` and `pipeline/intake/schemas.mjs`.

Exports:

- `speciesPools(candidates, scope)`: the photos of each target in fetch order (choice 13).
- `assignCodes(pools, codes)`: keeps the codes already given and adds new ones.
- `judgeJobs(pools, pass, answers, frozen)`: the calls of 20 of the reject pass (every photo) or the judge pass (the photos that the Haiku answers keep under rule `K3`), with the frozen prompt (choice 12). Each job: `label` (`reject:<SYMBOL>:b01`, `judge:<SYMBOL>:b01`), `model`, `effort`, `codes`, `prompt`, and `schema: JUDGE`.
- `judgeSteps(target, photos, answers)`: the port of `judgeSteps` of `EVAL/lib/replay.mjs` for one set-up, with the judge's part as the cell (eval plan, the held-out case).
- `rankSets(pools, answers, filter, drops)`: the port of `rankSets` of `EVAL/lib/rank-jobs.mjs`, less the owner's drops (choice 14). `rankJobs(...)` builds one job per set, with `groupLine` and the prompt of `promptRank`.
- `quotaOf(species, part)`: choice 4.
- `picks(pools, answers, ranks, quota)`: per cell and difficulty step, the picks (`fill`, choice 5), the reserves (choice 6), the thin-cell photo, and the short slots.
- `estimate(jobs)`: choice 16.

The fixture: a one-time script, `pipeline/scripts/intake-fixture.ts`, reads `EVAL/heldout/pools.json`, the Haiku and Sonnet answers of `EVAL/runs/heldout-judge/results.json`, and the Sonnet FR orders of `EVAL/runs/heldout-rank/results.json`. It writes `pipeline/tests/fixtures/intake/heldout-sonnet-fr.json` with the candidates in fetch order, the answers, the orders, and the 51 picks of `tables/heldout/table.json`. The fixture is committed and keeps LF.

Tests (`pipeline/tests/intake.test.ts`):

- **Parity:** on the held-out fixture at `Q332`, `picks` gives the same 51 photos, in the same cells and difficulty steps, as the eval's Sonnet FR; the judge set is the 114 photos that the Haiku `K3` pass keeps; the rank sets equal the groups of the FR jobs that ran.
- `judgeJobs`: 82 photos of one species give 5 reject calls; the judge pass skips a photo already answered with the same hashes, and does not skip one answered under another brief hash.
- The prompt of a job equals `promptJudge` (and `promptRank`) of `EVAL/lib/prompts.mjs` for the same photos, paths, and order.
- `quotaOf`: `depth.leaf: "group"` gives `Q221`; no `depth` gives `Q332` with source `default`; a concept target gives `Q332`.
- The usual-look swap at difficulty step 1; a short slot stays short; a dropped photo does not come back; reserves are the next 2 in ranked order; the thin-cell photo is at difficulty step 3 and marked.
- `estimate`: 208 photos in 3 species give 12 Haiku agents and the USD of choice 16.

Done when: the tests pass, the parity test above among them.

### Task 4: The 440 px copies and the contact sheets

Pull request: `feat/intake-pipeline-4-images`. Agents: 0. Cost: USD 0. Blocked by: Task 3.

File: `pipeline/lib/intake_images.ts`.

- `appCopy(local, out, resize)`: the 440 px copy as the eval made it (EXIF rotate, `fit: inside`, quality 85), into `pipeline/cache/intake/<name>/app/<code>.jpg`. A file that `sharp` cannot decode is a failure that names the candidate.
- A candidate whose cached original is missing is downloaded again through the run's `http` layer (the User-Agent, the per-host rate of `RATE_PER_SECOND`, an image content type only), as `photos fetch` does. A failure stops the command and names the host. The photo is never skipped or replaced.
- `contactSheets(cell, groups, out, compose)`: the port of `EVAL/lib/sheet.mjs` (3 × 3 tiles of 440 px with the code on each tile).
- `sharp` loads with `await import('sharp')` in the CLI only. The tests inject `resize` and `compose`.

Tests: the paths and names; a missing original goes through an injected `fetchImpl`; an HTML response is a failure; a sheet of 11 photos makes 2 sheets with the right codes.

Done when: the tests pass with no network and no `sharp`.

### Task 5: The `intake` commands: jobs, collect, and pick

Pull request: `feat/intake-pipeline-5-commands`. Agents: 0. Cost: USD 0. Blocked by: Tasks 2, 3, and 4.

Files: `pipeline/lib/intake_commands.ts`, `pipeline/lib/intake_collect.ts`, `pipeline/lib/commands.ts` (`COMMANDS`, `USAGE`, `run init` writes `intake: "sonnet-fr"`), `pipeline/lib/run.ts` (`intake` in the shape check).

Usage lines (Task 1 added `intake frozen`; Task 6 adds `--widen`):

```
intake frozen --base <ref>
intake jobs <name> --pass reject|judge|rank --out <dir> [--powo <dir>] [--retry]
intake collect <name> --pass reject|judge|rank --run <id> [--run <id> ...]
intake pick <name> --out <dir> [--check full|step1] [--widen]
intake agreement
intake check <name> --from <file>
```

- `intake jobs` needs HEAD on `content/<name>`. The reject pass checks the POWO files (choice 24). `--retry` writes no script for a job with 3 void attempts and exits 1 (choice 15). It writes `intake/codes.json` the first time, the images, `<dir>/<name>-<pass>.js` (a workflow script in the form of `renderScript` of `EVAL/make-workflow.mjs`), and `<dir>/<name>-<pass>.jobs.json`. It prints the agents per model, the estimate, the spend of the run so far, and the ceiling. It exits 1, and writes no script, when the spend so far plus this estimate passes the ceiling. The judge pass refuses to start while a candidate has no reject answer. The rank pass refuses to start while a photo that the Haiku pass keeps has no judge answer. `--retry` takes only the jobs that the last collect listed.
- `intake collect` finds the record under `$HOME/.claude/projects/` (the port of `findRecord`, `failedAgents`, `timeSpan`, and the token prices of `EVAL/lib/tokens.mjs`). It checks the model, the tools, and the coverage of each job (choice 15), appends `answers.jsonl` or `ranks.jsonl` and `costs.jsonl`, prints the jobs to run again, and commits the run paths.
- `intake pick` writes `intake/picks.json` and prints per cell the picks per difficulty step, the short slots, the reserves, and the USD so far.

Tests (`pipeline/tests/cli_intake.test.ts`, with the helpers of `cli_build.test.ts`): a fixture run record, a fixture transcript folder, and a fake `exec`.

- `intake jobs` writes the script and refuses a run without `intake`, and the judge pass before the reject pass is collected.
- `intake jobs --pass reject`: a run with a POWO candidate and no `--powo` exits 1; a missing rows file or gallery exits 1 and names the species and the file; a run with no POWO candidate needs no `--powo`.
- `intake jobs --retry`: a job with 2 void attempts goes in the script; a job with 3 void attempts does not, and the command prints the 3 reasons and exits 1.
- `intake collect`: a job that called `Bash` is void and listed; a job of the wrong model is void; a left-out photo is listed; tokens and USD sum as `EVAL/lib/tokens.mjs` does; the commit message; a second collect of the same run appends nothing.
- `intake pick` on the held-out fixture writes the 51 picks of the parity test.

Done when: the tests pass, and `node pipeline/cli.ts` prints the new usage lines.

### Task 6: The owner's review sheet and `intake check`

Pull request: `feat/intake-pipeline-6-check`. Agents: 0. Cost: USD 0. Blocked by: Task 5.

Files: `pipeline/lib/intake_sheet.ts`, `pipeline/lib/intake_ladder.ts`, `pipeline/intake/ladder.json` (every value null except `window: 5`), `pipeline/lib/intake_commands.ts`, and their tests.

The sheet (`intake pick --out <dir>` writes `<dir>/sheet/index.html` and the 440 px copies beside it):

- One section per cell: the picks of each difficulty step, then the reserves, then the thin-cell photo. Photos side by side, two per row on a phone.
- Each caption: the code, the proposed difficulty step, the growth stage, the season, the usual look, the side, the judge's `not_for`, the note, the source, and the credit.
- Controls: keep or drop, the difficulty step (shown on a keep), `not_for` (a short list of the depths and a text field), and a flag on a caption that looks wrong. Each tap saves `checks/<code>` to `db`. Only Editors and up read or write. A reload shows the saved answers.
- The session publishes the page with the Artifact tool, after loading the `artifact-design` and `artifact-capabilities` skills, as in the eval. A sheet with more than 200 photos splits into pages by species.

`intake check <name> --from <file>`: reads the `ArtifactData` export, refuses a keep with no difficulty step, an unknown code, or a photo that is not on the sheet, fills the slots (choice 6), and appends the verdict rows of choice 8 in one write. It runs the stop rule and the verdict check (`validateVerdicts`) before it writes. It prints the cells and the photos kept per difficulty step, and the slots still short. It appends the run's row to `intake/agreement.json`, with the Haiku observe columns (choice 20). On rung 2 or 3, it writes the approves of the picks that the sheet left out (choice 21), except in a species with an owner drop: it writes none there, and prints the widened species (choice 23).

`intake pick --widen` writes a sheet with the unchecked picks and reserves of the widened species of the last `intake check`, and nothing else.

`intake agreement` (`intake_ladder.ts`) prints, per stratum: the checks and keeps in the window, the keep share, the Wilson 95% lower bound, the checks since the last move down, the rung it computes, and why. While a `bar` in `ladder.json` is null, it prints `observe` and rung 1, and the observe report of choice 21. It prints the Haiku observe numbers of choice 20.

Tests:

- The sheet HTML holds no owner label and every code of `picks.json`. The export reader refuses each bad case above.
- The verdict rows for a fixture: an owner drop fills from a reserve; an owner step change goes on the `photo` object; the code rejects get `checked_by: intake`; a kept photo that no slot needs gets no row. A second `intake check` of the same file appends nothing.
- The draw: rung 2 puts every step 1 pick on the sheet, and the same draw each time; a draw takes at least 30 picks, or all when there are fewer; rung 3 draws step 1, 2, and 3 picks at 20%, 10%, and 5%.
- The widen: on rung 3, one owner drop in species A gives no `intake` approve for A, and the `intake` approves for species B; `intake pick --widen` puts only the unchecked picks and reserves of A on the sheet; their checks are `widen` and stay out of the pooled share.
- The ladder: with `bar` null, the rung is 1 and the report says `observe`; the observe report of a fixture rung 1 run names the picks that rung 2 and 3 would leave out and the owner's drops among them; the Wilson bound of 141 of 150 is 0.890; a move down needs `min_checked` checks of each stratum since the last move down; a stratum whose keep share falls below its bar moves the rung up; a `rung` in `ladder.json` wins; `intake pick --check full` on rung 3 is taken, and a lower rung than the computed one is refused.
- The Haiku columns: a fixture with Haiku answers gives the Haiku keep and difficulty step of each checked pick, and `intake agreement` splits the owner's keep share by Haiku agreement.

Done when: the tests pass, and a build of the fixture run writes the owner's approves with the photo fields.

### Task 7: The build report: picks per difficulty step, quota gaps, and cost

Pull request: `feat/intake-pipeline-7-report`. Agents: 0. Cost: USD 0. Blocked by: Task 6.

Files: `pipeline/lib/report.ts`, `pipeline/lib/commands.ts` (`build`, `report`), and their tests.

- `build.json` of an intake run: per cell, the approved photos at each difficulty step, the quota, and the usual-look count at difficulty step 1. A cell with a slot below its quota is a gap row: `{ symbol, channel, step, count, quota }`. The old `GAP_THRESHOLD` rows stay for a run with no `intake` field.
- The gap rows also count the usual-look photos per season and view (spec Part 4, content-run 3), with the view of `viewOf` in `EVAL/lib/rank-jobs.mjs`.
- `report.md`: a section "Intake" with the agents, tokens, and USD of each pass from `costs.jsonl` (void attempts apart), the USD per pick, the quota fill, the owner's keep share of the picks, and the flags of the owner.
- `CHANNEL_TARGET` (8) does not change. It equals `Q332`.

Tests: the gap rows of a fixture run; the cost section sums `costs.jsonl` and leaves out a void attempt; an old run's report does not change byte for byte.

Done when: the tests pass, and the reports of the runs on `main` do not change.

### Task 8: The audit file commands (for phase 5)

Pull request: `feat/intake-pipeline-8-audit-commands`. Agents: 0. Cost: USD 0. Blocked by: Task 2.

Files: `pipeline/lib/commands.ts`, `pipeline/lib/manifest.ts`, and their tests.

- `images fields --from <file>`: the file holds one object per hash with the photo fields of choice 9 (the owner's calls of the audit). The command sets the fields on every row of the hash, keeps `difficulty` in line with the difficulty step (spec ruling 4), validates once, runs the append-only check, writes `content/`, and commits once.
- `images retire --from <file>`: one object per hash with a reason. It retires each row as `images retire` does, refuses to retire the last row of a species that no confusion edge names, and refuses to retire every row of a species without `--allow-species <SYMBOL>` (spec, Risks). It validates once, runs the append-only check, removes the objects, writes `content/`, and commits once.
- Both need a `content/` branch, and run only when the owner asks, as `images retire` does today.

Tests: a fields file sets `step` 3 and `hard` together, and `step` 2 clears `hard`; a bad value writes nothing; a retire file of 3 hashes makes one commit; the last-row guard; the species guard.

Done when: the tests pass.

### Task 9: The photo-check and content-run skills

Pull request: `skills/intake-pipeline-9-skills`. Agents: 0. Cost: USD 0. Blocked by: Tasks 5 to 7. Commit scope `docs(skills):`.

The skill text follows the `writing-for-agents` guidance: ordered steps that each end on a checkable completion criterion, one source of truth for each rule, positive instructions, and leading words used the same way each time (**pass** for the reject pass, the judge pass, and the rank pass; **pick**, **reserve**, **short** for a slot with no photo). The skills point at the frozen brief and do not restate it.

`.claude/skills/photo-check/SKILL.md`, rewritten. Its steps:

1. **Reject pass.** Run `intake jobs <name> --pass reject --out <scratchpad>`, with `--powo <dir>` when the run has POWO rows. Tell the owner the printed agent count and USD range, and launch the workflow (the standing yes, ruling 3). When `intake jobs` exits 1, stop and tell the owner what it printed. Done when the workflow has ended.
2. **Collect.** Run `intake collect` with the run ID at once, in the same session. Run `intake jobs --retry` and collect again until no job is listed. When `--retry` exits 1, stop and tell the owner the jobs and reasons that it printed. Done when `intake collect` lists no job.
3. **Judge pass.** As steps 1 and 2 with `--pass judge`.
4. **Rank pass.** As steps 1 and 2 with `--pass rank`.
5. **Pick and sheet.** Run `intake agreement`, then `intake pick` with no `--check`. Publish the sheet. Send the owner the link, the rung and why, the short cells, and the USD so far. On rung 1 in observe mode, also send the observe report. Done when the owner says the check is done.
6. **Check.** Export the `checks` collection with `ArtifactData`. Run `intake check <name> --from <file>`. Done when it exits 0.
7. **Widen.** When `intake check` prints widened species, run `intake pick --widen`, publish that sheet, and repeat step 6 on its export. Done when `intake check` prints no widened species, or the owner says to leave those cells short.

Rules that the skill holds, each in one place:

- While a workflow runs, the session waits for it and runs no other command. Tell the owner before the launch that messages wait until the collect ends (the eval's lesson). The CLI cannot check this rule (choice 25).
- The CLI holds the rules of choices 15, 21, 22, 23, and 24. The skill names the command and what to do when it exits 1, and does not restate the rule (choice 25).
- The session never changes `pipeline/intake/ladder.json`.
- The judge's checks are in `pipeline/intake/judge-V1.md`. The skill names the file and the rule `P`, and says that the code computes keep and the difficulty step.
- Too few photos is better than bad photos: a short cell stays short, and the next fetch fills it.
- The spec Part 4 list: leaf, bark, and fruit (the "leaf only" sentence goes); the quota per difficulty step in place of "Stop at 6 good photos"; the five-field verdict and the Hard section go; the scale rule, the identity rules (the hybrid reject, a photo of another species of the content set is added again under that species), and the variant leaf form stay as the brief states them.
- The Channel (part), Licence, POWO, Duplicates, and escalation rules do not change. A POWO row still needs its saved files (the judge reads only the 440 px copy, so the skill confirms the files exist before the reject pass).

`.claude/skills/content-run/SKILL.md`:

- Remove "The first version is leaf only". Step 1 takes `--channels leaf,bark,fruit`. A concept run's values can start with `bark/` and `fruit/` again.
- The run's files table adds the files of `intake/`.
- Step 5 names the photo-check steps and the owner's check. Step 7 reads the gap rows per difficulty step, season, and view, and a targeted search stops when the cell fills its quota.
- "Other commands" describes the `step` field next to `images difficulty`, and the two audit commands of Task 8.

`CLAUDE.md`: add `pipeline/intake/ladder.json` to the line "A person authors … Agents do not change them."

Steps:

- [ ] Draft both skills. Check each rule against this plan and the spec Part 4 list: each item is in the skill, once.
- [ ] Ask the owner to read the skill diff in the pull request.

Done when: every item of spec Part 4 "The photo-check skill" and "The content-run skill" is in the skills or named as not changed, and the owner approves the diff.

### Task 10: The pilot

Workflow runs, 10 agents or fewer in all, so no owner's yes is needed (the owner can still say no in the plan diff). Cost: about USD 1 (0.5 to 2). Blocked by: Tasks 1 to 9. Results go on the branch `content/intake_pilot`, which closes without a merge (choice 19).

- [ ] `run init intake_pilot` with one species of about 40 candidates that has bark and fruit rows, `species list`, the trim, and `photos fetch`.
- [ ] Follow the new photo-check skill: about 2 Haiku agents, 1 or 2 Sonnet judges, and up to 3 rankers.
- [ ] Check: each transcript ran its model; each agent used only `Read` and `StructuredOutput`; the measured USD per photo is within 1.5 times the estimate; the sheet works on a phone; `intake check` writes the rows of choice 8.
- [ ] Write the result, the costs, and any fix in a comment on the pull request of Task 9 or a new ticket.

Done when: the pilot reached `intake check` with no problem line, or each problem has a ticket.

## What phase 5 needs from phase 4

Phase 5, the audit (spec Part 3), is a separate plan. Phase 4 leaves ready:

- `app/logic/step.js`, the frozen brief, schema, and ranking brief, with the hash test.
- The job builder takes any list of photos with a code, a 440 px copy, a tree, and a source name. Phase 5 feeds it the active manifest rows (images from `CDN_BASE`) in place of candidates, and keys `answers.jsonl` by hash.
- The validator checks of the photo fields and the `hard` rule.
- `images fields --from` and `images retire --from` (Task 8), with the last-row and species guards.
- The review sheet builder (Task 6), which phase 5 extends with the flag groups of spec Part 3.
- The measured cost per photo of the Haiku and Sonnet passes in `costs.jsonl`, for the phase 5 estimate.

## Cost of a content run with Sonnet FR

From the measured held-out numbers (Facts). These are the numbers each `intake jobs` prints, with a range of 0.75 to 1.5 times.

| Run | Candidates | Agents (Haiku, Sonnet judge, rank) | USD (range) |
|---|---|---|---|
| The held-out set (USD measured in the eval; agents as the pipeline would run it) | 208 in 3 species | 12, about 6, 9 | 2.68 |
| The pilot (Task 10) | about 40 in 1 species | 2, 1 to 2, up to 3 | about 1 (0.5 to 2) |
| A run of 10 species, 60 candidates each, 3 parts | 600 | 30, 20, up to 30 | about 8 (6 to 12) |
| A run of 20 species, 60 candidates each, 3 parts | 1,200 | 60, 40, up to 60 | about 16 (12 to 24) |

At the held-out fill of 51.9%, a cell gets about 4 picks of 8 slots, so a run spends about USD 0.05 to 0.07 per pick (the record, Consequences). The plan's approval is the standing yes for these runs. A run stops and asks only at 1.5 times its estimate (ruling 3).

## Summary of agents and cost

| Task | Work | Agents | USD (range) | Owner's yes |
|---|---|---|---|---|
| 1 to 9 | Code, tests, and skills | 0 | 0 | no |
| 10 | The pilot | 10 or fewer | 1 (0.5 to 2) | no, 10 agents or fewer |
| | All | 10 or fewer | 1 (0.5 to 2) | |

Code-review agents, when the owner asks for them, are not in this table, as in the eval.

## Owner work

- Read this plan diff and answer the open questions.
- Read the skill diff of Task 9.
- In the pilot, check the picks of one species on the sheet (about 3 minutes).
- In each later run: the photo check of the picks and reserves, on the rung of the trust ladder (rulings 5 and 7). At about 4 seconds per photo (spec Part 3), a run of 10 species with about 4 picks and 6 reserves per cell is about 300 photos, or about 20 minutes. On rung 2 or 3, a widen sheet when a check drops a pick.
- After the observe runs: set the values of `pipeline/intake/ladder.json` (Open question 1).

## Open questions

The owner answered the four questions of 2026-11-13. One question stays open on purpose, until the data is in:

1. **The values of the trust ladder** (ruling 7). Answer after at least 3 runs on rung 1, from the observe report of `intake agreement`: `bar.step1`, `bar.other`, and `min_checked` in `pipeline/intake/ladder.json`. A starting point from the held-out numbers (Facts): `bar` 0.88 for each stratum and `min_checked` 150. At a true keep share of 94%, the Wilson lower bound passes 0.88 at about 120 checks, so 150 gives a margin; at a true 90%, it needs about 1,000 checks, so the ladder does not move down. A run of 10 species gives about 120 to 170 picks on rung 1, and about 43% of them at difficulty step 1 (22 of 51 on the held-out set), so 150 step 1 checks take about 2 or 3 runs. A higher step 1 bar is possible: at a true 97%, the bound passes 0.92 at about 110 checks. Until the owner sets the values, every run stays on rung 1.

## Rulings of 2026-11-13

1. **The owner's photo check sits before the build** (option a). The owner checks every pick and reserve. No dropped photo reaches the bucket or the manifest. The trust ladder (rulings 5 and 7) can lower it over time.
2. **The old photo-check flow** leaves the skill (option a). Its commands stay in the CLI for hand fixes (choice 18).
3. **No yes per run.** The owner's approval of this plan is the standing yes for the intake workflows of each content run. The session tells the owner the agent count and the USD range before each launch and goes on. A guard stays: a run stops and asks when its spend would pass 1.5 times its estimate (for example, when judges go off task and run again).
4. **The reclassification of the published photos stays in phase 5** (option i). Phase 4 applies to new runs only. The phase 5 audit re-judges every published photo with Sonnet FR and sets its difficulty step.
5. **The trust ladder** (Open question 1 of the second draft, option a). The owner's check starts on rung 1 (every pick and reserve) and moves down one rung when the record meets the bar, and back up one rung when it fails it (choice 21). A better method from the owner's answers (a brief with example photos, or a rule change) is a later plan with its own eval. The bar of this ruling (3 runs in a row, 97% kept, no step 1 drop) changed on 2026-11-17 (ruling 7).

## Rulings of 2026-11-17

From the verification review (Sources).

6. **A check sits where the change cannot reach it.** CI runs `intake frozen --base origin/main`, so a pull request cannot change a frozen file and its hash together (choice 22).
7. **The trust ladder uses pooled evidence, and starts in observe mode.** It replaces the bar of ruling 5. A fixed bar per run moves the ladder on chance: at a true keep share of 94%, a run of 120 picks meets 97% with a chance of 0.066, and a sample of 12 has no drop with a chance of 0.48 (Facts). The ladder pools the last runs, keeps step 1 picks apart from the others, moves down on the Wilson 95% lower bound and a minimum count of checks, and moves up on the keep share. The draw takes at least 30 picks, and weights step 1 picks most and step 3 picks least. A drop on rung 2 or 3 widens its species: no unchecked pick of that species is approved (choice 23). The owner sets the bar values after at least 3 runs on rung 1 in observe mode (Open question 1). Until then every run is on rung 1.
8. **A job runs 3 times at most.** After the third void attempt, the session stops and tells the owner (choice 15).
9. **No second judge in phase 4.** On the held-out picks, a second judge's disagreement found 2 of the 3 drops at the cost of 15 checks, and three drops are too few to decide (Facts). The agreement record keeps Haiku's call on each checked pick in observe mode, at no cost (choice 20). A second judge, or a route by agreement, is a later plan if the record shows that it helps.
10. **A rule that code can check is code.** The POWO file check, the retry limit, the rung, and the widen are CLI checks. The skill names the command and the exit (choices 24 and 25).

## Later plans, not phase 4

- **The other skills.** Move the rules of `content-run`, `species-draft`, and `edges-draft` that code can check into the CLI, as ruling 10 does for photo-check. For `species-draft`, one candidate: each look-for line quotes the line of its reference that supports it.
- **The owner's drops as rules.** `answers.jsonl` and the owner's verdicts keep each drop with the judge's answers and difficulty step. A later eval can find the patterns that recur and test a new brief. A new brief is a new method (Global constraints).
- **A second judge**, if the Haiku observe columns show that disagreement finds drops (ruling 9).
