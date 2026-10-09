# Selection-method eval for leaf photos: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find the cheapest way for a content run to pick its 6 leaf photos per target that stays within 1 photo of the best quality, and survives the owner's blind check.

**Architecture:** Scripts build fixed photo pools for 10 targets from two existing runs. Judge agents run once per pass and per model inside workflows, and return verdicts or rankings as structured output. A pure replay script then plays every selection method from those results, scores each one against the owner's best-6 picks, and prices it from the token counts in the agent transcripts. A local page on 127.0.0.1 collects the owner's picks and the blind check.

**Tech Stack:** Node 24, ES modules (`.mjs`), `node:test`, `sharp` (already in the repo), the Workflow tool, plain HTML pages served by `node:http`.

Spec: `docs/superpowers/specs/2026-10-07-selection-method-eval-design.md`.

## Global Constraints

- Node 24 or later. ES modules (`.mjs`). Tests use `node:test` and `node:assert/strict`.
- No new npm dependency. Load `sharp` with a dynamic import: `const { default: sharp } = await import('sharp')`. The eval folder is inside the repo, so Node finds `C:/Users/jdennen/Dendro/node_modules/sharp`. (The label-round scripts load it with `createRequire`. Both ways work. This plan uses the dynamic import.)
- All eval work lives in `C:/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval/` (called `EVAL` below). `.gitignore` line 2 (`.superpowers/`) ignores it. Nothing in `EVAL` is committed. Each task ends with a progress line in `EVAL/NOTES.md`, not a commit.
- Do not edit any file outside `EVAL`. Do not change `pipeline/`, `app/`, `content/`, or the photo-check skill. Read the run files and `pipeline/cache/` from the main checkout, read-only.
- Local servers bind `127.0.0.1` only and use Node built-ins only. On Windows, a stopped Bash task does not stop `node server.mjs`. Stop it by port in PowerShell: `Get-NetTCPConnection -LocalPort 8770 | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Confirm:$false }`.
- Judges need no Bash and no PowerShell. They read images with the Read tool and return results through the workflow schema. Every script that touches the filesystem runs in the orchestrating session.
- Fairness: judges never see the owner's picks. The owner never sees any judge verdict, ranking, or note before Task 3's check passes. The pick page shows photos only (no verdict, no old verdict, no rich or thin label). The blind page shows two photo sets with no method names.
- Models: Opus 5.5 (`claude-opus-5-5`), Sonnet 5.5 (`claude-sonnet-5-5`), Haiku 5.5 (`claude-haiku-5-5`). Never Haiku 4.5. Never Sonnet 5.
- Prices per 1M tokens, from the claude-api skill (cached 2026-10-06, `shared/model-migration.md`):
  - Opus 5.5: input $4, output $20, cache write 5 min $5, cache write 1 h $8, cache read $0.20.
  - Sonnet 5.5: input $2, output $10, cache write 5 min $2.50, cache write 1 h $4, cache read $0.20.
  - Haiku 5.5, prompt of 100K tokens or fewer: input $0.10, output $0.50; cache read 0.1x input ($0.01), cache write 5 min 1.25x ($0.125), cache write 1 h 2x ($0.20).
  - Haiku 5.5, prompt over 100K tokens: input $0.50, output $2.50, and the same multipliers ($0.05, $0.625, $1.00).
- Image size, sheet size (3 x 3 tiles of 440 px), and P1 batch size (10) stay fixed. Every pass judges photos at the size the app shows a learner (owner ruling 2026-10-08): about 400 x 380 CSS px, so the long side of an app-size copy is `app_px` = 440 px. P0 and P1 judges read the app-size copy `app/<target>/<n>.jpg`, never the original. Ranking judges (P2, P3) read the contact sheets only, whose tiles are 440 px, and open no photo (owner ruling 2026-10-08, after the tracer P2 agent opened about 35 originals and filled its context). The owner's pick page shows the app-size copy at its natural size, with no full-size link. The 1,200 px copies feed the sheet tiles and the app-size copies are made from the originals.
- Effort: the workflow-authoring skill documents `agent(..., { effort })` with `'low' | 'medium' | 'high' | 'xhigh' | 'max'`. Every judge agent gets an explicit effort from `config.json` `effort` (`high` for all three models), so no judge inherits the session effort. The generated script carries the effort in its job list, so the run record's `script` field holds it; `collect.mjs` copies it into `results.json`, and the report states it.
- Bash commands stay under 5,000 bytes. Write files with the Write tool, not heredocs. Edit with the Edit tool.
- Prose and code comments use Simplified Technical English: short sentences, active voice, plain words. Comments are sparse.
- To run the tests: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/*.test.mjs"`.

## What the workflow-authoring skill documents, and what it does not

The skill was loaded for this plan. It documents:

- `agent(prompt, { label, phase, schema, model, effort, isolation, agentType })`. `schema` forces a StructuredOutput call and returns the validated object. `model` "overrides the model for this agent call". It does not list the accepted values.
- `parallel(thunks)` returns `null` for an agent that fails. `log()`, `phase()`, `args`, `budget`.
- `Workflow({ scriptPath, resumeFromRunId })` resumes a run. `<transcriptDir>/journal.jsonl` holds each agent's return value. `agent-<id>.jsonl` files in the transcript directory hold each agent's transcript.
- `budget.spent()` returns the output tokens of the whole turn. It is not per agent.

It does not document:

1. Which strings `model` accepts, or that `'haiku'` or `'sonnet'` means a 5.5 model. A run record of 2026-09-26 (`wf_7532e286-2b6`) shows that `model: 'sonnet'` ran `claude-sonnet-5`, not Sonnet 5.5. So this plan passes full model IDs and Task 1 tests them.
2. Per-agent token counts. This plan reads them from the agent transcripts. Facts found in earlier runs (Task 1 confirms them on a new run):
   - The run record is `C:/Users/jdennen/.claude/projects/<project dir>/<session id>/workflows/<runId>.json`. Its `workflowProgress` entries with `type: "workflow_agent"` carry `label`, `agentId`, `model` (the full ID, for example `claude-opus-5-5`), `state`, and `tokens`. Its `result` field holds the script's return value.
   - The transcript is `<same session dir>/subagents/workflows/<runId>/agent-<agentId>.jsonl`. Each `assistant` line carries `message.model`, `message.id`, and `message.usage` with `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`, and `cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`.
   - One API message is split over several lines with the same `message.id`. The lines repeat the input counts, and `output_tokens` grows. Keep the line with the largest `output_tokens` for each `message.id`. Skip lines whose model is `<synthetic>`.
   - The record's `tokens` value does not equal the transcript sums (for example 159,403 against 166,802 without cache reads). Use the transcript sums. Keep the record value for reference only.
3. That a first launch from `scriptPath` works. The skill shows `scriptPath` for a re-run and for `workflow({ scriptPath })` inside a script. Task 1 tests a first launch from `scriptPath`. When the tool refuses it, launch a small inline script whose body is `return await workflow({ scriptPath: '<path>' })`.

## Facts checked in the data (2026-10-08)

- Candidate rows have `id, target, source_key, source, origin, file_url, author, license, license_url, source_species, channel_hint, tags_hint, identity_match, local, file_hash, fetched_at, fetch_error`. Verdict rows have `candidate_id, verdict, channel, tags, case, note, checked_by, checked_at`.
- `simple_lobed_us` has 39 targets in 98 blocks. `simple_lobed_us_add` has 5 targets in 15 blocks. No target is in both runs.
- Every candidate of both runs has a verdict. Every `local` file of the pool rows exists.
- Owner ruling 2026-10-08: a fetched row with `identity_match: false` leaves the pool (reason `wrong_species`) unless its `source_species` is a variety or subspecies of the target's PLANTS name (`content/species.json` `scientific`). The PLANTS name is also the target's display name. `config.json` `same_species` lists other spellings of the same species: `{"QUMA13": ["Quercus margaretiae"]}` (iNaturalist's spelling of `Quercus margaretta`, sand post oak). Counted 2026-10-08 with that rule: 25 rows drop, `PLHI` 13 (`Platanus orientalis`), `QUMA13` 6 (`Quercus stellata`; the 7th stellata row is hinted `bark` and is out of the pool already), `QUSI2` 6 (`Quercus stellata`). These rows stay: the trinomials `QUSI` 33 (`Quercus sinuata sinuata` and `breviloba`), `QUGA4` 13, `ACPA2` 3, and `QUMA13` 53 (`Quercus margaretiae`).
- 38 targets have a pool of 24 or more photos (leaf hint or no hint, not `manual`). `PLHI` drops to 11 and is out; `QUMA13` keeps 53. 5 targets (`ACSA3`, `QUSH`, `QUST`, `QURU`, `ACSA2`) have only manual rows and no pool.
- Pool sizes of the eligible targets run from 33 to 60 (`QUSI`), mean 47.2. 10 targets give about 470 photos, not about 400.
- `simple_lobed_us` has 5 duplicate target + `file_hash` pairs among fetched rows; `simple_lobed_us_add` has none. Only 1 pair is inside the pool (`ACPA2`, both rows unhinted), so the duplicate drop takes `ACPA2` from 56 to 55 photos. In the other 4 pairs (`QUAU`) the second row is hinted `fruit`, so it is out of the pool already. The 16 rows with no `file_hash` are all manual rows. No row has `fetch_error` set.
- The validator does not count a `hard` photo as in play (`inPlay`, `app/logic/content.js:38`). So every method keeps `good` photos only.
- Thin targets (fewer than 6 good leaf photos among the pool rows, last verdict wins): `ACMA3` 5, `ACPS` 4, `ACRU` 5, `LITU` 3, `PLRA` 5. That is 5 to choose 4 from. When the count uses all non-manual rows of a target, `ACPS` has 7 and is rich. This plan counts the pool rows, because the pool is what the methods see.
- The seeded draw (seed 20261007), worked out by hand-written code on 2026-10-08 with the rules of this plan: rich `QULO` 40, `QUBO2` 54, `QUAU` 43, `QUSI` 60, `ACPE` 49, `QULA` 53; thin `ACRU` 45, `PLRA` 53, `ACPS` 42, `LITU` 34; P3 `QUAU`, `QULO`, `LITU`. 473 photos, 52 P1 batches per model. Task 2 prints the draw from the plan's own code and checks it against this list.
- P1 needs 52 batches per model, so 156 agents in all. With P2 (30) and P3 (9), Task 4 is 195 agents, not about 160. Task 4 prints the exact count.

## File structure

All paths are under `EVAL = C:/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval/`.

| File | Job | Task |
|---|---|---|
| `NOTES.md` | Progress log, one line per finished step group. | 1 |
| `config.json` | Seed, model options, tracer target, port. | 1 |
| `lib/data.mjs` | Paths, JSON helpers, pool building, old-verdict counts. Pure except the file helpers. | 1 |
| `lib/seed.mjs` | Seeded random numbers, target choice, P3 choice. Pure. | 1 (helpers), 2 (`chooseTargets`) |
| `lib/sheet.mjs` | 3 x 3 contact-sheet layout and render. | 1 |
| `lib/prompts.mjs` | Quality text from the skill, briefs, agent prompts. Pure. | 1 |
| `lib/schemas.mjs` | Structured-output schemas for P0, P1, and the rankings. | 1 |
| `lib/tokens.mjs` | Transcript token sums and prices. Pure. | 1 |
| `lib/views.mjs` | Turns collected results into per-model verdicts, rankings, and costs. Pure. | 1 |
| `lib/replay.mjs` | Methods A, B, C (Task 1) and filter-first (Task 5). Pure. | 1, 5 |
| `lib/score.mjs` | Quality score (Task 1); cost line, P3 check, row summary, winner, blind outcome (Task 5). Pure. | 1, 5 |
| `lib/coverage.mjs`, `lib/journal.mjs` | Key coverage of a job result; failed agents of a run journal. Pure. | 1 |
| `lib/picks.mjs` | Checks that `picks.json` is complete. Pure. | 1 |
| `pools.mjs` | CLI. Writes a pools file and the public pick list. | 1, 2 |
| `images.mjs` | CLI. Writes 1,200 px copies, app-size (440 px) copies, and contact sheets. | 1 |
| `make-workflow.mjs` | CLI. Writes the briefs, the workflow script, and its job list. | 1 |
| `collect.mjs` | CLI. Reads run records and transcripts. Writes results, tokens, and problems. | 1 |
| `tracer-row.mjs` | CLI. One report row for the tracer target. | 1 |
| `check-picks.mjs` | CLI. Runs `lib/picks.mjs` on a picks file. | 1 |
| `server.mjs`, `pick.html`, `blind.html` | Local pages for the picks and the blind check. | 1 (pick), 6 (blind) |
| `analyze.mjs` | CLI. Full replay, table, shortlist. | 5 |
| `blind.mjs` | CLI. Builds and scores a blind round. | 6 |
| `report.mjs` | CLI. Writes `report.md` and `decision-draft.md`. | 7 |
| `test/*.test.mjs` | Unit tests on small made-up data. | 1, 2, 5 |
| `tracer/` | Tracer pools, public list, test picks. | 1 |
| `img/<target>/<n>.jpg`, `app/<target>/<n>.jpg`, `sheets/<target>/*.jpg` | Generated images. | 1, 2 |
| `briefs/P1.md`, `briefs/P2.md`, `briefs/P3.md` | Judge briefs, generated from the skill. | 1 |
| `wf/<name>.js`, `wf/<name>.jobs.json` | Generated workflow script and its job list. | 1, 4 |
| `runs/<name>/results.json`, `tokens.json`, `problems.txt` | Collected judge output. | 1, 4 |
| `pools.json`, `pick-public.json`, `picks.json` | The 10 targets, the public list, the owner's picks. | 2, 3 |
| `out/table.json`, `out/table.md`, `out/shortlist.json` | Replay output. | 5 |
| `blind-public.json`, `blind-r<N>.json`, `out/blind-key-r<N>.json`, `out/blind-result-r<N>.json` | Blind check. | 6 |
| `report.md`, `decision-draft.md` | The report and the draft decision note. | 7 |

## Data shapes

These names are shared by every task.

- A photo key is `<TARGET>-<nn>`, where `nn` is the 1-based place in the pool in fetch order, two digits (`QUAC2-07`).
- `pools.json` (and `tracer/pools.json`):
  `{ seed, runs, p3: [target], eligible: [{ target, run, pool, good_old }], dropped_counts: { <reason>: n }, targets: [{ target, run, species, kind: 'rich'|'thin'|'tracer', good_old, photos: [{ key, n, id, run, target, source_key, local, abs }], dropped: [{ id, target, reason, kept_id? }] }] }`.
  `abs` is `C:/Users/jdennen/Dendro/<local>`. `dropped_counts` covers every target of both runs. A dropped row is a fetched leaf or unhinted row that left the pool. Its `reason` is `fetch_error`, `no_hash`, `no_local`, `wrong_species`, or `duplicate_hash`; `species` is the target's PLANTS name; a `duplicate_hash` row names the `kept_id` of the first row with that hash.
- `pick-public.json`: `{ targets: [{ target, species, photos: [{ key, n }] }] }`. No verdicts, no `kind`, no `good_old`. Each target's photos are in a seeded random order (`pickOrder` with `config.json` `pick_seed`), so the page does not show fetch order. Keys and `n` keep their fetch numbers.
- `picks.json`: `{ targets: { <TARGET>: { picks: [key], done: boolean } }, saved_at }`.
- `wf/<name>.jobs.json`: `[{ label, pass: 'P0'|'P1'|'P2'|'P3', phase, model: 'opus'|'sonnet'|'haiku', model_opt, target, keys: [key], schema: 'P0'|'P1'|'RANK', prompt }]`. Labels: `P0:<model>`, `P1:<model>:<TARGET>:b<i>`, `P2:<model>:<TARGET>`, `P3:<model>:<TARGET>`.
- P1 label set: `good`, `hard`, `reject`, `escalate`, `unread`. The replay keeps only `good` for method A. Filter-first drops `reject`, `escalate`, and `unread`. A photo with no verdict counts as `unread`.
- `runs/<name>/results.json`: `{ runIds, jobs: [{ label, pass, model, target, keys, agentIds, states, result }] }`.
- `runs/<name>/tokens.json`: `{ <label>: { models, messages, input, cw5m, cw1h, cread, output, tokens, usd, unpriced, record_tokens } }`. `tokens` is the sum of the five counts.
- A cost is `{ tokens, usd }`. A cost line is `{ tokens: { a, b }, usd: { a, b } }` with `cost(n) = a + b * n`.
- A P2 or P3 agent returns `{ ranked: [{ key, tag: 'good'|'hard' }], rejects: [key], unread: [key], note }`.
- A ranking (after `buildViews`) is `{ ranked: [key], tags: { <key>: 'good'|'hard' }, rejects: [key] }`. Keys that the agent left out, or put in `unread`, are in `rejects`. A ranked key with no valid tag gets `hard`.
- Every method keeps only `good` photos: A from the P1 labels, B, C, and filter-first from the ranking tags.

---

### Task 1: Tracer, one target end to end

One target (`QUAC2`, rich, pool 43) goes through every part once: pool, images, pick page, P0 model check, P1 and P2 with Haiku 5.5, token sums, replay of A, B, and C, and one report row. The tracer run has 10 agents (P0 4: three full model IDs and one check of the short name `haiku`; P1 5; P2 1), at the session limit of 10. The owner approves the launch first. Its results are a test only. The full run in Task 4 judges every photo again.

**Files:**
- Create: `EVAL/NOTES.md`, `EVAL/config.json`
- Create: `EVAL/lib/data.mjs`, `EVAL/lib/seed.mjs`, `EVAL/lib/sheet.mjs`, `EVAL/lib/prompts.mjs`, `EVAL/lib/schemas.mjs`, `EVAL/lib/tokens.mjs`, `EVAL/lib/coverage.mjs`, `EVAL/lib/journal.mjs`, `EVAL/lib/views.mjs`, `EVAL/lib/replay.mjs`, `EVAL/lib/score.mjs`, `EVAL/lib/picks.mjs`
- Create: `EVAL/pools.mjs`, `EVAL/images.mjs`, `EVAL/make-workflow.mjs`, `EVAL/collect.mjs`, `EVAL/tracer-row.mjs`, `EVAL/check-picks.mjs`, `EVAL/server.mjs`, `EVAL/pick.html`
- Test: `EVAL/test/data.test.mjs`, `EVAL/test/prompts.test.mjs`, `EVAL/test/workflow.test.mjs`, `EVAL/test/tokens.test.mjs`, `EVAL/test/coverage.test.mjs`, `EVAL/test/journal.test.mjs`, `EVAL/test/views.test.mjs`, `EVAL/test/replay.test.mjs`, `EVAL/test/score.test.mjs`, `EVAL/test/picks.test.mjs`, `EVAL/test/server.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces (later tasks use these exact names):
  - `lib/data.mjs`: `MAIN`, `EVAL`, `RUNS`, `readJsonl(file)`, `readJson(file)`, `writeJson(file, obj)`, `keyOf(target, n)`, `fetchedLeaf(row)`, `inPool(row)`, `isInfraOf(source, plantsName) -> boolean`, `splitPool(rows, plantsName, sameNames = []) -> { kept, dropped }`, `isGoodLeaf(verdict)`, `lastVerdicts(verdicts) -> Map`, `buildTargets(run, candidates, verdicts, plantsNames, sameSpecies = {}) -> [{ target, run, species, good_old, photos, dropped }]` (`species` is the PLANTS name).
  - `lib/seed.mjs`: `mulberry32(seed) -> () => number`, `shuffle(items, rng) -> items`, `pickOrder(photos, seed, target) -> photos` (seeded display order for the pick page), `MIN_POOL = 24`.
  - `lib/sheet.mjs`: `TILE`, `COLS`, `PER_SHEET`, `sheetGroups(keys) -> [[key]]`, `sheetPaths(evalDir, target, count, prefix) -> [path]`, `renderSheet(sharp, tiles, out)`.
  - `lib/prompts.mjs`: `LABELS`, `extractQuality(skillText)`, `briefP1(quality)`, `briefRank(quality, pass)`, `promptP0(t, photos, briefPath)`, `promptP1(t, photos, briefPath)`, `promptRank(t, photos, sheets, briefPath)`.
  - `lib/schemas.mjs`: `SCHEMAS = { P0, P1, RANK }`.
  - `make-workflow.mjs`: `MODELS = ['opus', 'sonnet', 'haiku']`, `buildJobs(pools, plan, config) -> jobs`, `renderScript(name, jobs) -> string`. CLI: `node make-workflow.mjs --plan tracer|full`.
  - `lib/tokens.mjs`: `MODEL_IDS`, `RATES`, `messagesFrom(entries)`, `priceMessage(msg)`, `sumMessages(msgs)`.
  - `lib/coverage.mjs`: `keyProblems(job, result) -> [problem]` (every key of the job comes back exactly once; no other key appears).
  - `lib/journal.mjs`: `failedAgents(entries) -> [{ agentId, label }]` (agents with a `failed` line in `journal.jsonl`).
  - `collect.mjs` CLI: `node collect.mjs --name <workflow name> --record <run record path> [--record <path> ...]`.
  - `lib/views.mjs`: `buildViews(jobs, tokens) -> { p1, p1Cost, p2, p2Cost, p3, p3Cost, unread, tags, problems }`. `tags` counts `good` and `hard` ranked photos per pass and model.
  - `lib/replay.mjs`: `KEEP = 6`, `BATCH_A = 10`, `BATCH_C = 12`, `NOT_KEPT`, `lineAt(line, n)`, `cutOf(candidateSet, rank) -> [key]`, `topOf(candidateSet, rank) -> [key]` (top 6 tagged `good`), `hardAbove(order, isHard, picks) -> number`, `replayA(pool, p1, p1Cost)`, `replayB(pool, K, rank, line)`, `replayC(pool, rank, line)`. Each replay returns `{ picks, seen, cost, hardAbove }`.
  - `lib/score.mjs`: `quality(picks, best) -> number | null`.
  - `lib/picks.mjs`: `checkPicks(pools, picks) -> [problem]`.
  - `server.mjs`: `createServer({ dir, evalDir }) -> http.Server`. CLI: `node server.mjs [--dir <sub dir>] [--port 8770]`.

#### Part 1a: setup, pools, and images

- [ ] **Step 1: Create the folder, the notes, and the config**

Create `EVAL/NOTES.md`:

```markdown
# Selection-method eval: progress notes

Plan: docs/superpowers/plans/2026-10-07-selection-method-eval.md (branch feat/selection-eval).
This folder is git-ignored. Nothing here is committed.

## Log
```

Create `EVAL/config.json`:

```json
{
  "seed": 20261007,
  "tracer_target": "QUAC2",
  "tracer_model": "haiku",
  "port": 8770,
  "app_px": 440,
  "pick_seed": 20261008,
  "same_species": { "QUMA13": ["Quercus margaretiae"] },
  "effort": { "opus": "high", "sonnet": "high", "haiku": "high" },
  "model_opt": {
    "opus": "claude-opus-5-5",
    "sonnet": "claude-sonnet-5-5",
    "haiku": "claude-haiku-5-5"
  }
}
```

- [ ] **Step 2: Write the failing data tests**

Create `EVAL/test/data.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTargets, keyOf, inPool, splitPool, isInfraOf, isGoodLeaf } from '../lib/data.mjs';
import { mulberry32, shuffle, pickOrder } from '../lib/seed.mjs';
import { sheetGroups, sheetPaths } from '../lib/sheet.mjs';

const row = (id, target, extra = {}) => ({ id, target, source_key: 'inat', channel_hint: null, local: `pipeline/cache/inat/${id}.jpg`, file_hash: `h-${id}`, fetch_error: null, source_species: 'Quercus alba', ...extra });

test('keyOf pads the place to two digits', () => {
  assert.equal(keyOf('QUAC2', 7), 'QUAC2-07');
  assert.equal(keyOf('QUAC2', 43), 'QUAC2-43');
});

test('inPool keeps leaf and unhinted fetched rows only', () => {
  assert.equal(inPool(row('a', 'T')), true);
  assert.equal(inPool(row('a', 'T', { channel_hint: 'leaf' })), true);
  assert.equal(inPool(row('a', 'T', { channel_hint: 'bark' })), false);
  assert.equal(inPool(row('a', 'T', { source_key: 'manual' })), false);
  assert.equal(inPool(row('a', 'T', { local: null })), false);
  assert.equal(inPool(row('a', 'T', { fetch_error: 'http 404' })), false);
});

test('isGoodLeaf needs approve, leaf, and no hard tag', () => {
  assert.equal(isGoodLeaf({ verdict: 'approve', channel: 'leaf', tags: [] }), true);
  assert.equal(isGoodLeaf({ verdict: 'approve', channel: 'leaf', tags: ['hard'] }), false);
  assert.equal(isGoodLeaf({ verdict: 'approve', channel: 'bark', tags: [] }), false);
  assert.equal(isGoodLeaf({ verdict: 'reject', channel: null, tags: [] }), false);
  assert.equal(isGoodLeaf(undefined), false);
});

test('buildTargets groups blocks by target in file order and counts old good leaves', () => {
  const cands = [
    row('a1', 'A'), row('b1', 'B'), row('a2', 'A', { channel_hint: 'fruit' }),
    row('a3', 'A', { source_key: 'manual' }), row('b2', 'B'), row('a4', 'A', { channel_hint: 'leaf' }),
  ];
  const verdicts = [
    { candidate_id: 'a1', verdict: 'approve', channel: 'leaf', tags: ['hard'] },
    { candidate_id: 'a1', verdict: 'approve', channel: 'leaf', tags: [] },
    { candidate_id: 'a4', verdict: 'approve', channel: 'leaf', tags: [] },
    { candidate_id: 'b1', verdict: 'approve', channel: 'leaf', tags: [] },
    { candidate_id: 'b1', verdict: 'reject', channel: null, tags: [] },
  ];
  const [A, B] = buildTargets('run1', cands, verdicts, { A: 'Quercus montana', B: 'Quercus rubra' });
  assert.equal(A.target, 'A');
  assert.deepEqual(A.photos.map(p => [p.key, p.id]), [['A-01', 'a1'], ['A-02', 'a4']]);
  assert.equal(A.good_old, 2);
  assert.equal(A.species, 'Quercus montana');
  assert.equal(A.photos[0].abs, 'C:/Users/jdennen/Dendro/pipeline/cache/inat/a1.jpg');
  assert.deepEqual(B.photos.map(p => p.id), ['b1', 'b2']);
  assert.equal(B.good_old, 0);
  assert.deepEqual(A.dropped, []);
});

test('splitPool keeps the first row of a file_hash and drops the second', () => {
  const rows = [row('d1', 'A', { file_hash: 'same' }), row('x', 'A'), row('d2', 'A', { file_hash: 'same' })];
  const { kept, dropped } = splitPool(rows, 'Quercus alba');
  assert.deepEqual(kept.map(r => r.id), ['d1', 'x']);
  assert.deepEqual(dropped, [{ id: 'd2', target: 'A', reason: 'duplicate_hash', kept_id: 'd1' }]);
  const [A] = buildTargets('run1', rows, [], { A: 'Quercus alba' });
  assert.deepEqual(A.photos.map(p => p.key), ['A-01', 'A-02']);
  assert.equal(A.dropped.length, 1);
});

test('splitPool drops a row with no hash or with a fetch error, and ignores manual and other-hint rows', () => {
  const rows = [
    row('n1', 'A', { file_hash: null }), row('e1', 'A', { fetch_error: 'http 404' }), row('ok', 'A'),
    row('m1', 'A', { source_key: 'manual', file_hash: null }), row('f1', 'A', { channel_hint: 'fruit' }),
  ];
  const { kept, dropped } = splitPool(rows, 'Quercus alba');
  assert.deepEqual(kept.map(r => r.id), ['ok']);
  assert.deepEqual(dropped.map(d => [d.id, d.reason]), [['n1', 'no_hash'], ['e1', 'fetch_error']]);
});

test('splitPool drops a row of a different species (owner ruling 2026-10-08)', () => {
  const rows = [
    row('s1', 'QUSI2', { source_species: 'Quercus similis', identity_match: true }),
    row('s2', 'QUSI2', { source_species: 'Quercus stellata', identity_match: false }),
    row('p1', 'QUSI2', { source_species: 'Platanus orientalis', identity_match: false }),
  ];
  const { kept, dropped } = splitPool(rows, 'Quercus similis');
  assert.deepEqual(kept.map(r => r.id), ['s1']);
  assert.deepEqual(dropped.map(d => [d.id, d.reason]), [['s2', 'wrong_species'], ['p1', 'wrong_species']]);
});

test('splitPool keeps a subspecies or variety row of the target', () => {
  const rows = [
    row('v1', 'QUSI', { source_species: 'Quercus sinuata breviloba', identity_match: false }),
    row('v2', 'QUSI', { source_species: 'Quercus sinuata var. breviloba', identity_match: false }),
    row('v3', 'QUSI', { source_species: 'Quercus sinuata subsp. sinuata', identity_match: false }),
    row('x1', 'QUSI', { source_species: 'Quercus similis breviloba', identity_match: false }),
  ];
  const { kept, dropped } = splitPool(rows, 'Quercus sinuata');
  assert.deepEqual(kept.map(r => r.id), ['v1', 'v2', 'v3']);
  assert.deepEqual(dropped.map(d => [d.id, d.reason]), [['x1', 'wrong_species']]);
  assert.equal(isInfraOf('Platanus orientalis', 'Platanus ×hispanica'), false);
});

test('splitPool keeps a row whose name is in same_species, and still drops another species', () => {
  const rows = [
    row('m1', 'QUMA13', { source_species: 'Quercus margaretiae', identity_match: false }),
    row('m2', 'QUMA13', { source_species: 'Quercus stellata', identity_match: false }),
    row('m3', 'QUMA13', { source_species: 'Quercus margaretta', identity_match: true }),
  ];
  const { kept, dropped } = splitPool(rows, 'Quercus margaretta', ['Quercus margaretiae']);
  assert.deepEqual(kept.map(r => r.id), ['m1', 'm3']);
  assert.deepEqual(dropped.map(d => [d.id, d.reason]), [['m2', 'wrong_species']]);
  assert.deepEqual(splitPool(rows, 'Quercus margaretta').kept.map(r => r.id), ['m3']);
  const [T] = buildTargets('run1', rows, [], { QUMA13: 'Quercus margaretta' }, { QUMA13: ['Quercus margaretiae'] });
  assert.equal(T.photos.length, 2);
});

test('mulberry32 and shuffle are fixed for a fixed seed', () => {
  const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(42));
  const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(42));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('pickOrder is a permutation of the photos and stable for a seed and target', () => {
  const photos = Array.from({ length: 40 }, (_, i) => ({ key: keyOf('QUAC2', i + 1), n: i + 1 }));
  const a = pickOrder(photos, 20261008, 'QUAC2');
  assert.deepEqual(a, pickOrder(photos, 20261008, 'QUAC2'));
  assert.deepEqual([...a].sort((x, y) => x.n - y.n), photos);
  assert.notDeepEqual(a.map(p => p.n), photos.map(p => p.n));
  assert.notDeepEqual(pickOrder(photos, 20261008, 'QUAL').map(p => p.n), a.map(p => p.n));
  assert.equal(a.find(p => p.n === 7).key, 'QUAC2-07');
});

test('sheetGroups cuts 9 per sheet and sheetPaths names them', () => {
  const keys = Array.from({ length: 20 }, (_, i) => `T-${i + 1}`);
  assert.deepEqual(sheetGroups(keys).map(g => g.length), [9, 9, 2]);
  assert.deepEqual(sheetPaths('E', 'T', 12, 'first12'), ['E/sheets/T/first12-1.jpg', 'E/sheets/T/first12-2.jpg']);
});
```

- [ ] **Step 3: Run the tests and see them fail**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/data.test.mjs"`
Expected: FAIL with `Cannot find module` for `../lib/data.mjs`.

- [ ] **Step 4: Write `lib/data.mjs`, `lib/seed.mjs`, and `lib/sheet.mjs`**

Create `EVAL/lib/data.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';

export const MAIN = 'C:/Users/jdennen/Dendro';
export const EVAL = 'C:/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval';
export const RUNS = ['simple_lobed_us', 'simple_lobed_us_add'];

export const readJsonl = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

export const keyOf = (target, n) => `${target}-${String(n).padStart(2, '0')}`;

export const fetchedLeaf = r => r.source_key !== 'manual' && (r.channel_hint === 'leaf' || r.channel_hint == null);
export const inPool = r => fetchedLeaf(r) && !!r.local && !r.fetch_error;

const RANKS = new Set(['var.', 'var', 'subsp.', 'subsp', 'ssp.', 'ssp']);
const nameTokens = s => (s || '').normalize('NFC').replace(/×/g, ' ').toLowerCase().split(/\s+/).filter(t => t && !RANKS.has(t));

// True when `source` is a variety or subspecies of the PLANTS binomial, with or without the rank word
// ("Quercus sinuata breviloba", "Quercus sinuata var. breviloba").
export function isInfraOf(source, plantsName) {
  const s = nameTokens(source), p = nameTokens(plantsName);
  return p.length === 2 && s.length === 3 && s[0] === p[0] && s[1] === p[1];
}

// rows: one target, file order. plantsName: the target's PLANTS name.
// sameNames: other spellings of the same species (config.json same_species), such as iNaturalist's.
// Keeps the first row of each file_hash; records every other drop with its reason.
// Owner ruling 2026-10-08: a row whose identity_match is false leaves the pool unless it names a variety
// or subspecies, or a name in sameNames.
export function splitPool(rows, plantsName, sameNames = []) {
  const same = new Set(sameNames.map(n => nameTokens(n).join(' ')));
  const isTarget = src => isInfraOf(src, plantsName) || same.has(nameTokens(src).join(' '));
  const kept = [], dropped = [], first = new Map();
  for (const r of rows.filter(fetchedLeaf)) {
    let reason = null;
    if (r.fetch_error) reason = 'fetch_error';
    else if (!r.file_hash) reason = 'no_hash';
    else if (!r.local) reason = 'no_local';
    else if (r.identity_match === false && !isTarget(r.source_species)) reason = 'wrong_species';
    else if (first.has(r.file_hash)) reason = 'duplicate_hash';
    if (!reason) { first.set(r.file_hash, r.id); kept.push(r); continue; }
    dropped.push(reason === 'duplicate_hash' ? { id: r.id, target: r.target, reason, kept_id: first.get(r.file_hash) } : { id: r.id, target: r.target, reason });
  }
  return { kept, dropped };
}

export const isGoodLeaf = v => !!v && v.verdict === 'approve' && v.channel === 'leaf' && !(v.tags || []).includes('hard');

export function lastVerdicts(verdicts) {
  const last = new Map();
  for (const v of verdicts) last.set(v.candidate_id, v);
  return last;
}

// File order within a target is fetch order. A target can have several blocks in the file.
// plantsNames: { <symbol>: PLANTS scientific name }, from content/species.json. It is also the display name.
// sameSpecies: { <symbol>: [other spelling] }, from config.json same_species.
export function buildTargets(run, candidates, verdicts, plantsNames, sameSpecies = {}) {
  const last = lastVerdicts(verdicts);
  const by = new Map();
  for (const r of candidates) {
    if (!by.has(r.target)) by.set(r.target, []);
    by.get(r.target).push(r);
  }
  const out = [];
  for (const [target, rows] of by) {
    const species = plantsNames[target] ?? null;
    const { kept: pool, dropped } = splitPool(rows, species, sameSpecies[target] ?? []);
    out.push({
      target, run, species,
      good_old: pool.filter(r => isGoodLeaf(last.get(r.id))).length,
      photos: pool.map((r, i) => ({ key: keyOf(target, i + 1), n: i + 1, id: r.id, run, target, source_key: r.source_key, local: r.local, abs: `${MAIN}/${r.local}` })),
      dropped,
    });
  }
  return out;
}
```

Create `EVAL/lib/seed.mjs`:

```js
export const MIN_POOL = 24;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, rng) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Display order for the pick page: fixed per seed and target, so the owner does not see fetch order.
export function pickOrder(photos, seed, target) {
  let h = seed >>> 0;
  for (const ch of target) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return shuffle(photos, mulberry32(h));
}
```

Create `EVAL/lib/sheet.mjs`:

```js
export const TILE = 440, COLS = 3, PER_SHEET = 9, LABEL_H = 22;

export function sheetGroups(keys) {
  const groups = [];
  for (let i = 0; i < keys.length; i += PER_SHEET) groups.push(keys.slice(i, i + PER_SHEET));
  return groups;
}

export const sheetPaths = (evalDir, target, count, prefix) =>
  Array.from({ length: Math.ceil(count / PER_SHEET) }, (_, i) => `${evalDir}/sheets/${target}/${prefix}-${i + 1}.jpg`);

// tiles: [{ file, label }], at most PER_SHEET. Same look as an2/sheet.mjs, with 3 columns.
export async function renderSheet(sharp, tiles, out) {
  const parts = [];
  for (const [i, t] of tiles.entries()) {
    const left = (i % COLS) * TILE, top = Math.floor(i / COLS) * TILE;
    const img = await sharp(t.file).resize({ width: TILE, height: TILE - LABEL_H, fit: 'contain', background: '#222' }).toBuffer();
    const lab = Buffer.from(`<svg width="${TILE}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#000"/><text x="6" y="16" font-size="15" fill="#ff0" font-family="Arial">${t.label}</text></svg>`);
    parts.push({ input: lab, left, top }, { input: img, left, top: top + LABEL_H });
  }
  const rows = Math.ceil(tiles.length / COLS);
  await sharp({ create: { width: COLS * TILE, height: rows * TILE, channels: 3, background: '#111' } })
    .composite(parts).jpeg({ quality: 78 }).toFile(out);
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/data.test.mjs"`
Expected: PASS, 12 tests.

- [ ] **Step 6: Write `pools.mjs` (tracer mode now, seeded mode in Task 2)**

Create `EVAL/pools.mjs`:

```js
// node pools.mjs --tracer QUAC2 --out tracer/pools.json
// node pools.mjs --out pools.json            (seeded choice, Task 2)
import fs from 'node:fs';
import path from 'node:path';
import { MAIN, EVAL, RUNS, readJsonl, readJson, writeJson, buildTargets } from './lib/data.mjs';
import { MIN_POOL, pickOrder } from './lib/seed.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const config = readJson(path.join(EVAL, 'config.json'));
// The PLANTS name of each symbol, as the build wrote it into content/species.json (`scientific`).
const species = readJson(path.join(MAIN, 'content/species.json'));
const plantsNames = Object.fromEntries(Object.entries(species).map(([symbol, s]) => [symbol, s.scientific]));

const all = RUNS.flatMap(run => buildTargets(run,
  readJsonl(path.join(MAIN, 'pipeline/runs', run, 'candidates.jsonl')),
  readJsonl(path.join(MAIN, 'pipeline/runs', run, 'verdicts.jsonl')),
  plantsNames, config.same_species ?? {}));
const noName = all.filter(t => t.photos.length && !t.species).map(t => t.target);
if (noName.length) throw new Error(`no PLANTS name for: ${noName.join(', ')}`);
const eligible = all.filter(t => t.photos.length >= MIN_POOL)
  .map(t => ({ target: t.target, run: t.run, pool: t.photos.length, good_old: t.good_old }));

let targets, p3;
const tracer = opt('--tracer');
if (tracer) {
  const t = all.find(x => x.target === tracer);
  if (!t) throw new Error(`no target ${tracer}`);
  targets = [{ ...t, kind: 'tracer' }];
  p3 = [];
} else {
  const { chooseTargets } = await import('./lib/seed.mjs');
  ({ chosen: targets, p3 } = chooseTargets(all, config.seed));
}

const missing = targets.flatMap(t => t.photos).filter(p => !fs.existsSync(p.abs));
if (missing.length) throw new Error(`${missing.length} files missing, first: ${missing[0].abs}`);

const dropped_counts = {};
for (const d of all.flatMap(t => t.dropped)) dropped_counts[d.reason] = (dropped_counts[d.reason] || 0) + 1;

const out = path.join(EVAL, opt('--out') ?? 'pools.json');
writeJson(out, { seed: config.seed, runs: RUNS, p3, eligible, dropped_counts, targets });
writeJson(path.join(path.dirname(out), 'pick-public.json'), {
  targets: targets.map(t => ({ target: t.target, species: t.species, photos: pickOrder(t.photos.map(p => ({ key: p.key, n: p.n })), config.pick_seed, t.target) })),
});
for (const t of targets) console.log(`${t.target} ${t.kind} pool=${t.photos.length} good_old=${t.good_old} dropped=${t.dropped.length}`);
console.log(`p3: ${p3.join(', ') || 'none'} | photos: ${targets.reduce((s, t) => s + t.photos.length, 0)} | eligible targets: ${eligible.length}`);
console.log(`dropped from all pools: ${JSON.stringify(dropped_counts)}`);
```

- [ ] **Step 7: Run it for the tracer target**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node pools.mjs --tracer QUAC2 --out tracer/pools.json`
Expected output:

```
QUAC2 tracer pool=43 good_old=13 dropped=0
p3: none | photos: 43 | eligible targets: 38
dropped from all pools: {"duplicate_hash":1,"wrong_species":25}
```
 The one `duplicate_hash` row is in `ACPA2`. The 25 `wrong_species` rows are `PLHI` 13, `QUMA13` 6, `QUSI2` 6. When a count differs, stop and compare with the facts list at the top of this plan.

- [ ] **Step 8: Write `images.mjs`**

Create `EVAL/images.mjs`:

```js
// node images.mjs --pools tracer/pools.json
// Writes img/<target>/<n>.jpg (1,200 px long side, quality 85, EXIF rotate, as label-r3/images.mjs)
// and app/<target>/<n>.jpg (the size the app shows a question photo: long side config.app_px = 440 px, same settings),
// and sheets/<target>/all-<i>.jpg; for P3 targets also sheets/<target>/first12-<i>.jpg.
import fs from 'node:fs';
import path from 'node:path';
import { EVAL, readJson, writeJson } from './lib/data.mjs';
import { sheetGroups, renderSheet } from './lib/sheet.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const poolsFile = path.join(EVAL, opt('--pools') ?? 'pools.json');
const { default: sharp } = await import('sharp');
const P = readJson(poolsFile);
const appPx = readJson(path.join(EVAL, 'config.json')).app_px;
if (!(appPx > 0)) throw new Error('config.json has no app_px');
const failures = [];

for (const t of P.targets) {
  const imgDir = path.join(EVAL, 'img', t.target);
  const sheetDir = path.join(EVAL, 'sheets', t.target);
  fs.mkdirSync(imgDir, { recursive: true });
  fs.mkdirSync(sheetDir, { recursive: true });
  const appDir = path.join(EVAL, 'app', t.target);
  fs.mkdirSync(appDir, { recursive: true });
  for (const p of t.photos) {
    for (const [dir, px] of [[imgDir, 1200], [appDir, appPx]]) {
      const out = path.join(dir, `${p.n}.jpg`);
      if (fs.existsSync(out)) continue;
      try {
        await sharp(p.abs).rotate().resize({ width: px, height: px, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(out);
      } catch (e) { failures.push({ key: p.key, abs: p.abs, error: e.message, px }); }
    }
  }
  const ok = new Set(t.photos.filter(p => fs.existsSync(path.join(imgDir, `${p.n}.jpg`))).map(p => p.key));
  const tiles = keys => keys.filter(k => ok.has(k)).map(k => {
    const p = t.photos.find(x => x.key === k);
    return { file: path.join(imgDir, `${p.n}.jpg`), label: p.key };
  });
  const all = sheetGroups(t.photos.map(p => p.key));
  for (const [i, g] of all.entries()) await renderSheet(sharp, tiles(g), path.join(sheetDir, `all-${i + 1}.jpg`));
  if ((P.p3 ?? []).includes(t.target)) {
    const first = sheetGroups(t.photos.slice(0, 12).map(p => p.key));
    for (const [i, g] of first.entries()) await renderSheet(sharp, tiles(g), path.join(sheetDir, `first12-${i + 1}.jpg`));
  }
  const appOk = t.photos.filter(p => fs.existsSync(path.join(appDir, `${p.n}.jpg`))).length;
  console.log(`${t.target}: ${ok.size}/${t.photos.length} images, ${appOk}/${t.photos.length} app-size copies, ${all.length} sheets`);
}
writeJson(path.join(path.dirname(poolsFile), 'img-failures.json'), failures);
console.log(`failures: ${failures.length}`);
```

A failed copy leaves a gap in a sheet tile list. The judge still gets the original path, and can mark it `unread`.

- [ ] **Step 9: Run it for the tracer target and look at one sheet**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node images.mjs --pools tracer/pools.json`
Expected: `QUAC2: 43/43 images, 43/43 app-size copies, 5 sheets` and `failures: 0`. Every file in `EVAL/app/QUAC2/` has a long side of 440 px or less.

Then open `EVAL/sheets/QUAC2/all-1.jpg` with the Read tool. Expected: a 1320 x 1320 image, 9 photos in 3 columns, each with a yellow key label `QUAC2-01` to `QUAC2-09`.

#### Part 1b: briefs, prompts, and the workflow script

- [ ] **Step 10: Write the failing prompt and workflow tests**

Create `EVAL/test/prompts.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractQuality, briefP1, briefRank, promptP1, promptRank, LABELS } from '../lib/prompts.mjs';

const SKILL = 'intro\n\n**Quality.** Answer each check.\n\n**Reject** when any of these is yes:\n\n1. Blur.\n\n**Duplicates.** When two candidates...\n';

test('extractQuality takes the text from Quality up to Duplicates', () => {
  const q = extractQuality(SKILL);
  assert.ok(q.startsWith('**Quality.**'));
  assert.ok(q.includes('1. Blur.'));
  assert.ok(!q.includes('Duplicates'));
});

test('extractQuality throws when a heading is missing', () => {
  assert.throws(() => extractQuality('no headings here'), /Quality section not found/);
});

test('extractQuality works on the merged photo-check skill', () => {
  const text = fs.readFileSync('C:/Users/jdennen/Dendro/.claude/skills/photo-check/SKILL.md', 'utf8');
  const q = extractQuality(text);
  assert.match(q, /\*\*Reject\*\* when any of these is yes/);
  assert.match(q, /\*\*Hard:\*\*/);
  assert.match(q, /\*\*Leaf forms:\*\*/);
  assert.match(q, /sucker shoot/);
});

test('briefs forbid Bash and carry the quality text', () => {
  for (const b of [briefP1('QTEXT'), briefRank('QTEXT', 'P2'), briefRank('QTEXT', 'P3')]) {
    assert.match(b, /Do not run Bash or PowerShell/);
    assert.match(b, /QTEXT/);
  }
  assert.match(briefRank('Q', 'P3'), /first 12 photos/);
  assert.match(briefRank('Q', 'P2'), /one petiole laid flat/);
  assert.match(briefRank('Q', 'P3'), /tag `good` or `hard`/);
  assert.deepEqual(LABELS, ['good', 'hard', 'reject', 'escalate', 'unread']);
});

test('every brief limits the run to leaf and tells the judge to ignore the skill flags', () => {
  for (const b of [briefP1('Q'), briefRank('Q', 'P2'), briefRank('Q', 'P3')]) {
    assert.match(b, /leaf channel only/);
    assert.match(b, /bark, a trunk, fruit, acorns, buds, flowers, and a whole tree/);
    assert.match(b, /Ignore the command-line flags .*`--case`, `--tags`/);
    assert.match(b, /references to Identity and the source page/);
  }
});

test('the P1 brief says to judge at the size given and to open no other file', () => {
  const b = briefP1('Q');
  assert.match(b, /Judge the photo at the size given\. This is the size that the learner sees\. Do not open any other file\./);
  assert.match(b, /only with a bigger view is `hard` at most, or a `reject`/);
});

test('ranking briefs say to rank from the sheets and not to open a photo', () => {
  for (const b of [briefRank('Q', 'P2'), briefRank('Q', 'P3')]) {
    assert.match(b, /Rank from the contact sheets only\. Do not open any photo file\./);
    assert.ok(!/read the original file/i.test(b));
  }
  assert.ok(!/Rank from the contact sheets only/.test(briefP1('Q')));
});

test('prompts list keys with paths for P1 and sheets with keys only for a ranking', () => {
  const t = { target: 'QUAC2', species: 'Quercus acutissima' };
  const photos = [{ key: 'QUAC2-01', abs: 'C:/x/1.jpg' }, { key: 'QUAC2-02', abs: 'C:/x/2.jpg' }];
  const p = promptP1(t, photos, 'C:/e/briefs/P1.md');
  assert.match(p, /^Read the brief at C:\/e\/briefs\/P1\.md and follow it\./);
  assert.match(p, /QUAC2 \(Quercus acutissima\)/);
  assert.match(p, /- QUAC2-02: C:\/x\/2\.jpg/);
  const r = promptRank(t, photos, ['C:/e/sheets/QUAC2/all-1.jpg'], 'C:/e/briefs/P2.md');
  assert.match(r, /- C:\/e\/sheets\/QUAC2\/all-1\.jpg/);
  assert.match(r, /- QUAC2-02$/m);
  assert.ok(!r.includes('C:/x/'), 'a ranking prompt holds no path of an original photo');
});
```

Create `EVAL/test/workflow.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJobs, renderScript, MODELS } from '../make-workflow.mjs';
import { SCHEMAS } from '../lib/schemas.mjs';

const photos = (t, n) => Array.from({ length: n }, (_, i) => ({ key: `${t}-${String(i + 1).padStart(2, '0')}`, n: i + 1, abs: `C:/x/${t}/${i + 1}.jpg` }));
const config = {
  tracer_model: 'haiku',
  effort: { opus: 'high', sonnet: 'high', haiku: 'high' },
  model_opt: { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' },
};

test('tracer plan: P0 for 3 full IDs and the short name haiku, P1 batches of 10, one P2', () => {
  const jobs = buildJobs({ p3: [], targets: [{ target: 'QUAC2', species: 'Q', photos: photos('QUAC2', 43) }] }, 'tracer', config);
  assert.deepEqual(jobs.filter(j => j.pass === 'P0' && !j.check_only).map(j => j.model), MODELS);
  const alias = jobs.find(j => j.check_only);
  assert.equal(alias.label, 'P0:haiku-alias');
  assert.equal(alias.model_opt, 'haiku');
  assert.equal(jobs.find(j => j.pass === 'P0').keys.length, 2);
  const p1 = jobs.filter(j => j.pass === 'P1');
  assert.deepEqual(p1.map(j => j.keys.length), [10, 10, 10, 10, 3]);
  assert.ok(p1.every(j => j.model === 'haiku' && j.model_opt === 'claude-haiku-5-5'));
  assert.ok(jobs.every(j => j.effort === 'high'));
  assert.equal(jobs.filter(j => j.pass === 'P2').length, 1);
  assert.equal(jobs.length, 10);
  assert.equal(new Set(jobs.map(j => j.label)).size, jobs.length);
});

test('P0 and P1 prompts list the app-size copies; P2 lists sheets and keys only', () => {
  const jobs = buildJobs({ p3: [], targets: [{ target: 'QUAC2', species: 'Q', photos: photos('QUAC2', 12) }] }, 'tracer', config);
  for (const j of jobs.filter(x => x.pass === 'P0' || x.pass === 'P1')) {
    assert.ok(/\/app\/QUAC2\/\d+\.jpg/.test(j.prompt), j.label);
    assert.ok(!j.prompt.includes('C:/x/'), `${j.label} lists an original`);
  }
  const p1 = jobs.find(j => j.label === 'P1:haiku:QUAC2:b2');
  assert.ok(p1.prompt.includes('- QUAC2-11: ') && p1.prompt.includes('/app/QUAC2/11.jpg') && p1.prompt.includes('/app/QUAC2/12.jpg'));
  assert.ok(!p1.prompt.includes('/app/QUAC2/10.jpg'));
  const p2 = jobs.find(j => j.pass === 'P2');
  assert.ok(!p2.prompt.includes('/app/') && !p2.prompt.includes('C:/x/'));
});

test('full plan: P1 and P2 for every model and target, P3 on the P3 targets with 12 photos', () => {
  const pools = { p3: ['B'], targets: [{ target: 'A', photos: photos('A', 25) }, { target: 'B', photos: photos('B', 31) }] };
  const jobs = buildJobs(pools, 'full', config);
  assert.equal(jobs.filter(j => j.pass === 'P1').length, 3 * (3 + 4));
  assert.equal(jobs.filter(j => j.pass === 'P2').length, 6);
  const p3 = jobs.filter(j => j.pass === 'P3');
  assert.equal(p3.length, 3);
  assert.ok(p3.every(j => j.target === 'B' && j.keys.length === 12));
  assert.ok(p3[0].prompt.includes('/sheets/B/first12-2.jpg'));
});

test('renderScript writes a pure-literal meta and the job list', () => {
  const jobs = buildJobs({ p3: [], targets: [{ target: 'T', photos: photos('T', 3) }] }, 'tracer', config);
  const s = renderScript('selection-eval-tracer', jobs);
  const lines = s.split('\n');
  assert.ok(lines[0].startsWith('export const meta = {'));
  const meta = JSON.parse(lines[0].slice('export const meta = '.length));
  assert.equal(meta.name, 'selection-eval-tracer');
  assert.deepEqual(meta.phases.map(p => p.title), ['P0', 'P1', 'P2']);
  const slim = JSON.parse(lines[1].slice('const JOBS = '.length));
  assert.equal(slim.length, jobs.length);
  assert.equal(slim[0].model, 'claude-opus-5-5');
  assert.equal(slim[0].effort, 'high');
  assert.ok(s.includes('agent(j.prompt, { label: j.label, phase: j.phase, model: j.model, effort: j.effort, schema: SCHEMAS[j.schema] })'));
  const tagged = SCHEMAS.RANK.properties.ranked.items;
  assert.deepEqual(tagged.required, ['key', 'tag']);
  assert.deepEqual(tagged.properties.tag.enum, ['good', 'hard']);
  assert.ok(s.includes('"enum":["good","hard"]'));
});
```

- [ ] **Step 11: Run the tests and see them fail**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/prompts.test.mjs" "test/workflow.test.mjs"`
Expected: FAIL with `Cannot find module` for `../lib/prompts.mjs` and `../make-workflow.mjs`.

- [ ] **Step 12: Write `lib/prompts.mjs` and `lib/schemas.mjs`**

Create `EVAL/lib/prompts.mjs`:

```js
export const LABELS = ['good', 'hard', 'reject', 'escalate', 'unread'];

export function extractQuality(skill) {
  const a = skill.indexOf('**Quality.**');
  const b = skill.indexOf('**Duplicates.**');
  if (a < 0 || b < 0 || b < a) throw new Error('Quality section not found in photo-check SKILL.md');
  return skill.slice(a, b).trim();
}

const RULES = [
  'Use only the Read tool. Do not run Bash or PowerShell. Do not write or edit any file.',
  'Read only the files that this brief and your prompt name.',
  'The run covers the leaf channel only. A photo whose main subject is not a leaf is a reject. This holds for bark, a trunk, fruit, acorns, buds, flowers, and a whole tree.',
  'The quality checks below come from a skill that has other uses. Ignore the command-line flags in them (`--case`, `--tags`) and the references to Identity and the source page. Answer only with the label or the tag that this brief asks for.',
  'Do not judge the licence or the species. Trust the source for the species.',
];

export function briefP1(quality) {
  return [
    '# Leaf photo judge, one photo at a time (P1)',
    '',
    'You judge leaf photos for a tree-identification app. Each photo gets one label.',
    '',
    ...RULES.map(r => `- ${r}`),
    '',
    '## Steps for each photo',
    '',
    '1. Read the image file at its path. Judge the photo at the size given. This is the size that the learner sees. Do not open any other file.',
    '2. Answer the reject checks below, in order. When one is yes, the label is `reject`. A photo whose feature you can make out only with a bigger view is `hard` at most, or a `reject`.',
    '3. When no reject check is yes and the image is sepia, toned, tinted, or heavily filtered, the label is `escalate`.',
    '4. Otherwise answer the hard checks. When one is yes, the label is `hard`. A photo that the checks call "one clear leaf:" is `hard`.',
    '5. When every check is no, the label is `good`.',
    '6. When the file does not open, the label is `unread`.',
    '',
    'Return one result per photo, in the order given, with its key, its label, and a note of one short sentence.',
    '',
    '## Quality checks (from the photo-check skill)',
    '',
    quality,
    '',
  ].join('\n');
}

export function briefRank(quality, pass) {
  const scope = pass === 'P3' ? 'the first 12 photos of one tree' : 'all the photos of one tree';
  return [
    `# Leaf photo judge, ranking (${pass})`,
    '',
    `You rank ${scope} for a tree-identification app. The app shows the best 6.`,
    '',
    ...RULES.map(r => `- ${r}`),
    '',
    '## Steps',
    '',
    '1. Read each contact sheet. A sheet holds up to 9 photos in a 3 by 3 grid. The yellow label on each tile is the photo key.',
    '2. Rank from the contact sheets only. Do not open any photo file. Read only the sheets that your prompt lists.',
    '3. Put each photo that fails a reject check below in `rejects`. A sepia, toned, tinted, or heavily filtered photo also goes in `rejects`.',
    '4. Put every other photo in `ranked`, best first. Rank the photos against each other.',
    '5. Give each ranked photo the tag `good` or `hard` under the same checks as a one-photo judge: the tag is `hard` when a hard check below is yes (a photo that the checks call "one clear leaf:" is `hard`), and `good` when every check is no.',
    '6. The best leaf photo shows one petiole laid flat or hanging flat: one whole leaf, sharp and large in the frame. A good photo ranks above a hard photo. Among hard photos, the clearer leaf ranks higher.',
    '7. When a sheet does not open, put the keys of its photos in `unread`.',
    '',
    'Every key in your prompt goes in exactly one of `ranked`, `rejects`, or `unread`. Each `ranked` item is `{ "key": ..., "tag": "good" }` or `{ "key": ..., "tag": "hard" }`.',
    '',
    '## Quality checks (from the photo-check skill)',
    '',
    quality,
    '',
  ].join('\n');
}

const head = t => `Tree: ${t.target}${t.species ? ` (${t.species})` : ''}.`;

export function promptP1(t, photos, briefPath) {
  return [`Read the brief at ${briefPath} and follow it.`, head(t), 'Photos (key: path):', ...photos.map(p => `- ${p.key}: ${p.abs}`)].join('\n');
}

export function promptP0(t, photos, briefPath) {
  return [promptP1(t, photos, briefPath), '', 'This is a test run. Also fill `model_self_report` with the model name that you think you are.'].join('\n');
}

export function promptRank(t, photos, sheets, briefPath) {
  return [
    `Read the brief at ${briefPath} and follow it.`, head(t),
    'Contact sheets:', ...sheets.map(s => `- ${s}`),
    'Photo keys:', ...photos.map(p => `- ${p.key}`),
  ].join('\n');
}
```

Create `EVAL/lib/schemas.mjs`:

```js
import { LABELS } from './prompts.mjs';

const ITEM = {
  type: 'object',
  properties: { key: { type: 'string' }, label: { type: 'string', enum: LABELS }, note: { type: 'string' } },
  required: ['key', 'label', 'note'],
};
const KEYS = { type: 'array', items: { type: 'string' } };
const RANKED = {
  type: 'array',
  items: { type: 'object', properties: { key: { type: 'string' }, tag: { type: 'string', enum: ['good', 'hard'] } }, required: ['key', 'tag'] },
};

export const SCHEMAS = {
  P0: { type: 'object', properties: { model_self_report: { type: 'string' }, results: { type: 'array', items: ITEM } }, required: ['model_self_report', 'results'] },
  P1: { type: 'object', properties: { results: { type: 'array', items: ITEM } }, required: ['results'] },
  RANK: { type: 'object', properties: { ranked: RANKED, rejects: KEYS, unread: KEYS, note: { type: 'string' } }, required: ['ranked', 'rejects', 'unread'] },
};
```

- [ ] **Step 13: Write `make-workflow.mjs`**

Create `EVAL/make-workflow.mjs`:

```js
// node make-workflow.mjs --plan tracer|full
// Writes briefs/P1.md, P2.md, P3.md, wf/<name>.js, and wf/<name>.jobs.json.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAIN, EVAL, readJson, writeJson } from './lib/data.mjs';
import { SCHEMAS } from './lib/schemas.mjs';
import { extractQuality, briefP1, briefRank, promptP0, promptP1, promptRank } from './lib/prompts.mjs';
import { sheetPaths } from './lib/sheet.mjs';

export const MODELS = ['opus', 'sonnet', 'haiku'];

export function buildJobs(pools, plan, config) {
  const jobs = [];
  const brief = name => `${EVAL}/briefs/${name}.md`;
  // P0 and P1 judges read the app-size copy (app/<target>/<n>.jpg): the size the learner sees. Ranking judges read sheets only.
  const appCopy = (t, list) => list.map(p => ({ ...p, abs: `${EVAL}/app/${t.target}/${p.n}.jpg` }));
  const base = (pass, m, t) => ({ pass, phase: pass, model: m, model_opt: config.model_opt[m], effort: config.effort[m], target: t.target });
  const p1 = (m, t) => {
    for (let i = 0; i < t.photos.length; i += 10) {
      const b = appCopy(t, t.photos.slice(i, i + 10));
      jobs.push({ label: `P1:${m}:${t.target}:b${i / 10 + 1}`, ...base('P1', m, t), keys: b.map(p => p.key), schema: 'P1', prompt: promptP1(t, b, brief('P1')) });
    }
  };
  const rank = (pass, m, t, photos, prefix) => jobs.push({
    label: `${pass}:${m}:${t.target}`, ...base(pass, m, t), keys: photos.map(p => p.key), schema: 'RANK',
    prompt: promptRank(t, photos, sheetPaths(EVAL, t.target, photos.length, prefix), brief(pass)),
  });
  if (plan === 'tracer') {
    const t = pools.targets[0];
    const two = appCopy(t, t.photos.slice(0, 2));
    for (const m of MODELS) jobs.push({ label: `P0:${m}`, ...base('P0', m, t), keys: two.map(p => p.key), schema: 'P0', prompt: promptP0(t, two, brief('P1')) });
    // A check only: which model the short name runs. The eval itself uses full IDs.
    jobs.push({ label: 'P0:haiku-alias', ...base('P0', 'haiku', t), model_opt: 'haiku', check_only: true, keys: two.map(p => p.key), schema: 'P0', prompt: promptP0(t, two, brief('P1')) });
    p1(config.tracer_model, t);
    rank('P2', config.tracer_model, t, t.photos, 'all');
  } else if (plan === 'full') {
    for (const m of MODELS) for (const t of pools.targets) p1(m, t);
    for (const m of MODELS) for (const t of pools.targets) rank('P2', m, t, t.photos, 'all');
    for (const m of MODELS) for (const t of pools.targets.filter(x => pools.p3.includes(x.target))) rank('P3', m, t, t.photos.slice(0, 12), 'first12');
  } else throw new Error(`unknown plan ${plan}`);
  return jobs;
}

export function renderScript(name, jobs) {
  const phases = [...new Set(jobs.map(j => j.phase))].map(title => ({ title }));
  const meta = { name, description: `Selection-method eval judges (${jobs.length} agents)`, phases };
  const slim = jobs.map(j => ({ label: j.label, phase: j.phase, model: j.model_opt, effort: j.effort, schema: j.schema, prompt: j.prompt }));
  return [
    `export const meta = ${JSON.stringify(meta)}`,
    `const JOBS = ${JSON.stringify(slim)}`,
    `const SCHEMAS = ${JSON.stringify(SCHEMAS)}`,
    'const res = await parallel(JOBS.map(j => () => agent(j.prompt, { label: j.label, phase: j.phase, model: j.model, effort: j.effort, schema: SCHEMAS[j.schema] })))',
    'log(`${res.filter(r => r == null).length} of ${JOBS.length} agents returned nothing`)',
    'return JOBS.map((j, i) => ({ label: j.label, result: res[i] ?? null }))',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const plan = args[args.indexOf('--plan') + 1];
  const name = `selection-eval-${plan}`;
  const config = readJson(path.join(EVAL, 'config.json'));
  const pools = readJson(path.join(EVAL, plan === 'tracer' ? 'tracer/pools.json' : 'pools.json'));
  const quality = extractQuality(fs.readFileSync(`${MAIN}/.claude/skills/photo-check/SKILL.md`, 'utf8'));
  fs.mkdirSync(path.join(EVAL, 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(EVAL, 'briefs', 'P1.md'), briefP1(quality));
  fs.writeFileSync(path.join(EVAL, 'briefs', 'P2.md'), briefRank(quality, 'P2'));
  fs.writeFileSync(path.join(EVAL, 'briefs', 'P3.md'), briefRank(quality, 'P3'));
  const jobs = buildJobs(pools, plan, config);
  fs.mkdirSync(path.join(EVAL, 'wf'), { recursive: true });
  fs.writeFileSync(path.join(EVAL, 'wf', `${name}.js`), renderScript(name, jobs));
  writeJson(path.join(EVAL, 'wf', `${name}.jobs.json`), jobs);
  const count = {};
  for (const j of jobs) count[`${j.pass} ${j.model}`] = (count[`${j.pass} ${j.model}`] || 0) + 1;
  console.log(JSON.stringify(count, null, 1));
  console.log(`agents: ${jobs.length} | script: ${path.join(EVAL, 'wf', `${name}.js`)}`);
}
```

- [ ] **Step 14: Run the tests and see them pass**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/prompts.test.mjs" "test/workflow.test.mjs"`
Expected: PASS, 12 tests.

- [ ] **Step 15: Generate the tracer workflow and read one brief**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node make-workflow.mjs --plan tracer`
Expected: counts `P0 opus 1, P0 sonnet 1, P0 haiku 2, P1 haiku 5, P2 haiku 1` and `agents: 10`. (`P0 haiku 2` is the full ID and the short-name check.)

Read `EVAL/briefs/P1.md`. Check that it holds the reject checks 1 to 10, the escalate rule, **Not a fault**, the hard checks 1 to 10, **Good**, and **Leaf forms**, and that it does not hold **Duplicates** or **License**.

#### Part 1c: P0 model check and the tracer run

- [ ] **Step 16: Write the failing token tests**

Create `EVAL/test/tokens.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messagesFrom, priceMessage, sumMessages, MODEL_IDS } from '../lib/tokens.mjs';

const line = (id, model, u) => ({ type: 'assistant', message: { id, model, usage: { input_tokens: 2, cache_creation_input_tokens: u.cw ?? 0, cache_read_input_tokens: u.cr ?? 0, output_tokens: u.out, cache_creation: { ephemeral_5m_input_tokens: u.cw ?? 0, ephemeral_1h_input_tokens: 0 } } } });

test('messagesFrom keeps one entry per message id, the one with the most output', () => {
  const entries = [
    { type: 'user', message: { content: 'x' } },
    line('m1', 'claude-haiku-5-5', { cw: 1000, out: 16 }),
    line('m1', 'claude-haiku-5-5', { cw: 1000, out: 332 }),
    line('m2', 'claude-haiku-5-5', { cr: 1000, out: 50 }),
    { type: 'assistant', message: { id: 'm3', model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } },
  ];
  const msgs = messagesFrom(entries);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].output, 332);
  assert.equal(msgs[0].cw5m, 1000);
  assert.equal(msgs[1].cread, 1000);
});

test('a message with no cache split puts all cache writes in the 5 minute bucket', () => {
  const [m] = messagesFrom([{ type: 'assistant', message: { id: 'a', model: 'claude-opus-5-5', usage: { input_tokens: 1, cache_creation_input_tokens: 700, cache_read_input_tokens: 0, output_tokens: 3 } } }]);
  assert.equal(m.cw5m, 700);
  assert.equal(m.cw1h, 0);
  assert.equal(m.split_known, false);
});

test('priceMessage uses the documented rates', () => {
  const m = { model: 'claude-opus-5-5', input: 1e6, output: 1e6, cw5m: 1e6, cw1h: 1e6, cread: 1e6 };
  assert.ok(Math.abs(priceMessage(m) - 37.2) < 1e-9);
  const s = { ...m, model: 'claude-sonnet-5-5' };
  assert.ok(Math.abs(priceMessage(s) - 18.7) < 1e-9);
  const h = { model: 'claude-haiku-5-5', input: 50000, output: 1e6, cw5m: 0, cw1h: 0, cread: 50000 };
  assert.ok(Math.abs(priceMessage(h) - (0.05 * 0.10 + 0.5 + 0.05 * 0.01)) < 1e-12);
  const big = { model: 'claude-haiku-5-5', input: 150000, output: 0, cw5m: 0, cw1h: 0, cread: 0 };
  assert.ok(Math.abs(priceMessage(big) - 0.15 * 0.5) < 1e-12);
  assert.equal(priceMessage({ ...m, model: 'claude-haiku-4-5' }), null);
});

test('sumMessages adds the five counts and the price, and lists the models', () => {
  const s = sumMessages([
    { model: 'claude-haiku-5-5', input: 10, cw5m: 20, cw1h: 0, cread: 30, output: 40 },
    { model: 'claude-haiku-5-5', input: 1, cw5m: 0, cw1h: 0, cread: 0, output: 2 },
  ]);
  assert.equal(s.tokens, 103);
  assert.deepEqual(s.models, ['claude-haiku-5-5']);
  assert.equal(s.messages, 2);
  assert.equal(s.unpriced, 0);
  assert.equal(MODEL_IDS.haiku, 'claude-haiku-5-5');
});
```

- [ ] **Step 17: Run the tests and see them fail**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/tokens.test.mjs"`
Expected: FAIL with `Cannot find module` for `../lib/tokens.mjs`.

- [ ] **Step 18: Write `lib/tokens.mjs`**

Create `EVAL/lib/tokens.mjs`:

```js
export const MODEL_IDS = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' };

// USD per 1M tokens. Source: claude-api skill, cached 2026-10-06, shared/model-migration.md.
// Haiku 5.5 has two rate cards, chosen by the prompt length of each request.
export const RATES = {
  'claude-opus-5-5': [{ upTo: Infinity, input: 4, output: 20, cw5m: 5, cw1h: 8, cread: 0.20 }],
  'claude-sonnet-5-5': [{ upTo: Infinity, input: 2, output: 10, cw5m: 2.5, cw1h: 4, cread: 0.20 }],
  'claude-haiku-5-5': [
    { upTo: 100000, input: 0.10, output: 0.50, cw5m: 0.125, cw1h: 0.20, cread: 0.01 },
    { upTo: Infinity, input: 0.50, output: 2.50, cw5m: 0.625, cw1h: 1.00, cread: 0.05 },
  ],
};

// One API message is split over several transcript lines with the same id. Keep the line with the most output.
export function messagesFrom(entries) {
  const byId = new Map();
  for (const e of entries) {
    if (e.type !== 'assistant' || !e.message?.usage || e.message.model === '<synthetic>') continue;
    const prev = byId.get(e.message.id);
    if (!prev || (e.message.usage.output_tokens ?? 0) >= (prev.usage.output_tokens ?? 0)) byId.set(e.message.id, e.message);
  }
  return [...byId.values()].map(m => {
    const u = m.usage, cc = u.cache_creation;
    const cw = u.cache_creation_input_tokens ?? 0;
    return {
      model: m.model,
      input: u.input_tokens ?? 0,
      cw5m: cc ? (cc.ephemeral_5m_input_tokens ?? 0) : cw,
      cw1h: cc ? (cc.ephemeral_1h_input_tokens ?? 0) : 0,
      cread: u.cache_read_input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      split_known: !!cc,
    };
  });
}

export function priceMessage(m) {
  const cards = RATES[m.model];
  if (!cards) return null;
  const prompt = m.input + m.cw5m + m.cw1h + m.cread;
  const r = cards.find(c => prompt <= c.upTo);
  return (m.input * r.input + m.output * r.output + m.cw5m * r.cw5m + m.cw1h * r.cw1h + m.cread * r.cread) / 1e6;
}

export function sumMessages(msgs) {
  const s = { models: [...new Set(msgs.map(m => m.model))], messages: msgs.length, input: 0, cw5m: 0, cw1h: 0, cread: 0, output: 0, usd: 0, unpriced: 0 };
  for (const m of msgs) {
    for (const k of ['input', 'cw5m', 'cw1h', 'cread', 'output']) s[k] += m[k];
    const p = priceMessage(m);
    if (p == null) s.unpriced++; else s.usd += p;
  }
  s.tokens = s.input + s.cw5m + s.cw1h + s.cread + s.output;
  return s;
}
```

- [ ] **Step 19: Run the tests and see them pass**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/tokens.test.mjs"`
Expected: PASS, 4 tests.

- [ ] **Step 20: Write `lib/coverage.mjs` and `collect.mjs`**

Create `EVAL/test/coverage.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyProblems } from '../lib/coverage.mjs';

const item = key => ({ key, label: 'good', note: '' });

test('P1 and P0: a complete result has no problem', () => {
  const job = { label: 'P1:x', pass: 'P1', keys: ['a', 'b'] };
  assert.deepEqual(keyProblems(job, { results: [item('b'), item('a')] }), []);
  assert.deepEqual(keyProblems({ ...job, pass: 'P0' }, { results: [item('a'), item('b')] }), []);
});

test('P1: a missing key, a repeated key, and an unknown key are each a problem', () => {
  const job = { label: 'P1:x', pass: 'P1', keys: ['a', 'b', 'c'] };
  const p = keyProblems(job, { results: [item('a'), item('a'), item('z')] });
  assert.deepEqual(p, ['P1:x: key a returned 2 times', 'P1:x: key b missing', 'P1:x: key c missing', 'P1:x: unknown key z']);
});

test('P2 and P3: ranked plus rejects cover the keys; a key in both is a problem', () => {
  const job = { label: 'P2:x', pass: 'P2', keys: ['a', 'b', 'c'] };
  const ok = { ranked: [{ key: 'b', tag: 'good' }, { key: 'a', tag: 'hard' }], rejects: ['c'], unread: [] };
  assert.deepEqual(keyProblems(job, ok), []);
  assert.deepEqual(keyProblems({ ...job, pass: 'P3' }, ok), []);
  const bad = { ranked: [{ key: 'a', tag: 'good' }], rejects: ['a', 'q'], unread: [] };
  assert.deepEqual(keyProblems(job, bad), ['P2:x: key a returned 2 times', 'P2:x: key b missing', 'P2:x: key c missing', 'P2:x: unknown key q']);
});

test('P2: a key in unread counts as covered', () => {
  const job = { label: 'P2:x', pass: 'P2', keys: ['a', 'b'] };
  assert.deepEqual(keyProblems(job, { ranked: [{ key: 'a', tag: 'good' }], rejects: [], unread: ['b'] }), []);
});

test('a job with no result returns no key problem', () => {
  assert.deepEqual(keyProblems({ label: 'x', pass: 'P1', keys: ['a'] }, null), []);
});
```

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/coverage.test.mjs"`
Expected: FAIL with `Cannot find module` for `../lib/coverage.mjs`.

Create `EVAL/lib/coverage.mjs`:

```js
// Key coverage of one job. Every key of the job comes back exactly once, and no other key appears.
// P0 and P1: the keys of result.results. P2 and P3: the keys of result.ranked plus result.rejects
// (a key in result.unread counts as covered, because the judge says it could not read it).
// Returns a list of problem strings. A job with no result returns [] (the caller reports that).
export function keyProblems(job, result) {
  if (result == null) return [];
  const got = job.pass === 'P0' || job.pass === 'P1'
    ? (result.results ?? []).map(x => x?.key)
    : [...(result.ranked ?? []).map(x => x?.key), ...(result.rejects ?? []), ...(result.unread ?? [])];
  const want = new Set(job.keys), count = new Map();
  for (const k of got) count.set(k, (count.get(k) ?? 0) + 1);
  const problems = [];
  for (const k of job.keys) {
    if (!count.has(k)) problems.push(`${job.label}: key ${k} missing`);
    else if (count.get(k) > 1) problems.push(`${job.label}: key ${k} returned ${count.get(k)} times`);
  }
  for (const k of count.keys()) if (!want.has(k)) problems.push(`${job.label}: unknown key ${k}`);
  return problems;
}
```

Run the same test command. Expected: PASS, 5 tests.

Create `EVAL/test/journal.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failedAgents } from '../lib/journal.mjs';

test('failedAgents lists each failed agent once, with the label of its started line', () => {
  const entries = [
    { type: 'launched' },
    { type: 'started', agentId: 'a1', label: 'P2:haiku:T', phase: 'P2' },
    { type: 'started', agentId: 'a2', label: 'P1:haiku:T:b1', phase: 'P1' },
    { type: 'result', agentId: 'a2', result: {} },
    { type: 'failed', agentId: 'a1' },
    { type: 'failed', agentId: 'a1' },
    { type: 'started', agentId: 'a3', label: 'P2:haiku:T', phase: 'P2' },
    { type: 'result', agentId: 'a3', result: {} },
    { type: 'failed', agentId: 'a9' },
  ];
  assert.deepEqual(failedAgents(entries), [{ agentId: 'a1', label: 'P2:haiku:T' }, { agentId: 'a9', label: null }]);
});

test('failedAgents returns an empty list when nothing failed', () => {
  assert.deepEqual(failedAgents([{ type: 'launched' }, { type: 'started', agentId: 'a', label: 'x' }]), []);
});
```

Create `EVAL/lib/journal.mjs`:

```js
// journal.jsonl of a run: one line per event. A "started" line has the agentId and the label.
// A "failed" line has the agentId only. A failed attempt is real spend that the run record does not list.
// entries: the parsed lines. Returns [{ agentId, label }] for every agent with a "failed" line,
// in journal order, once each. The label is null when the journal has no "started" line for the agent.
export function failedAgents(entries) {
  const labelOf = new Map();
  for (const e of entries) if (e.type === 'started' && e.agentId) labelOf.set(e.agentId, e.label ?? null);
  const seen = new Set(), out = [];
  for (const e of entries) {
    if (e.type !== 'failed' || !e.agentId || seen.has(e.agentId)) continue;
    seen.add(e.agentId);
    out.push({ agentId: e.agentId, label: labelOf.get(e.agentId) ?? null });
  }
  return out;
}
```

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/journal.test.mjs"`
Expected: PASS, 2 tests (after the file exists; before it, FAIL with `Cannot find module`).

Create `EVAL/collect.mjs`:

```js
// node collect.mjs --name selection-eval-tracer --record <run record> [--record <resumed run record> ...] [--fail-on-unread]
// Reads the job list, the run records, and the agent transcripts.
// Writes runs/<name>/results.json, tokens.json, tool-errors.json, problems.txt.
// A job that had a failed attempt (a "failed" line in the run's journal.jsonl) gets `failed_attempts` in tokens.json.
// The total line on the console includes the failed attempts.
// Exits 1 on a model problem, or on any unread photo with --fail-on-unread. A check_only job never fails the model check.
import fs from 'node:fs';
import path from 'node:path';
import { EVAL, readJson, readJsonl, writeJson } from './lib/data.mjs';
import { MODEL_IDS, messagesFrom, sumMessages } from './lib/tokens.mjs';
import { keyProblems } from './lib/coverage.mjs';
import { failedAgents } from './lib/journal.mjs';

const args = process.argv.slice(2);
const name = args[args.indexOf('--name') + 1];
const recordFiles = args.flatMap((a, i) => (a === '--record' ? [args[i + 1]] : []));
const jobs = readJson(path.join(EVAL, 'wf', `${name}.jobs.json`));

const records = recordFiles.map(f => {
  const rec = readJson(f);
  return {
    rec,
    tdir: path.join(path.dirname(path.dirname(f)), 'subagents', 'workflows', rec.runId),
    progress: Object.values(rec.workflowProgress ?? {}).filter(e => e && e.type === 'workflow_agent'),
    results: new Map((Array.isArray(rec.result) ? rec.result : []).map(r => [r.label, r.result])),
    // The journal lists the agents that failed. The run record does not, but they cost real tokens.
    failed: (() => {
      const j = path.join(path.dirname(path.dirname(f)), 'subagents', 'workflows', rec.runId, 'journal.jsonl');
      return fs.existsSync(j) ? failedAgents(readJsonl(j)) : [];
    })(),
  };
});

// Tool errors in a transcript, such as a refused Read of a file outside the session's folder.
const toolErrors = entries => entries.flatMap(e => (e.type === 'user' && Array.isArray(e.message?.content) ? e.message.content : []))
  .filter(c => c?.type === 'tool_result' && c.is_error)
  .map(c => (typeof c.content === 'string' ? c.content : JSON.stringify(c.content)).slice(0, 200));
const PERMISSION = /permission|denied|not allowed|outside|blocked|refused/i;
const unreadIn = r => (r?.results ?? []).filter(x => x.label === 'unread').length + (r?.unread ?? []).length;

const out = [], tokens = {}, problems = [], checks = [];
let modelProblems = 0, unread = 0;
const failedTotal = { count: 0, tokens: 0, usd: 0 };
const errors = [];
for (const j of jobs) {
  const want = MODEL_IDS[j.model];
  let result = null;
  for (const r of records) if (r.results.get(j.label) != null) result = r.results.get(j.label);
  const seen = new Set(), msgs = [], states = [];
  let recordTokens = 0;
  for (const r of records) {
    for (const e of r.progress.filter(x => x.label === j.label)) {
      states.push(e.state);
      if (e.model && e.model !== want && !j.check_only) { problems.push(`${j.label}: run record model ${e.model}, want ${want}`); modelProblems++; }
      if (seen.has(e.agentId)) continue;
      seen.add(e.agentId);
      recordTokens += e.tokens ?? 0;
      const f = path.join(r.tdir, `agent-${e.agentId}.jsonl`);
      if (fs.existsSync(f)) {
        const entries = readJsonl(f);
        msgs.push(...messagesFrom(entries));
        for (const text of toolErrors(entries)) errors.push({ label: j.label, text });
      } else problems.push(`${j.label}: no transcript ${f}`);
    }
  }
  const sum = sumMessages(msgs);
  sum.record_tokens = recordTokens;
  // Failed attempts of this job: priced from their transcripts, kept apart from the result's own tokens.
  const failedIds = new Set();
  const failedMsgs = [];
  for (const r of records) {
    for (const fa of r.failed.filter(x => x.label === j.label && !seen.has(x.agentId) && !failedIds.has(x.agentId))) {
      failedIds.add(fa.agentId);
      const f = path.join(r.tdir, `agent-${fa.agentId}.jsonl`);
      if (fs.existsSync(f)) failedMsgs.push(...messagesFrom(readJsonl(f)));
      else problems.push(`${j.label}: no transcript for failed agent ${fa.agentId}`);
    }
  }
  if (failedIds.size) {
    const fs_ = sumMessages(failedMsgs);
    sum.failed_attempts = { agents: [...failedIds], count: failedIds.size, tokens: fs_.tokens, usd: fs_.usd, models: fs_.models };
    failedTotal.count += failedIds.size; failedTotal.tokens += fs_.tokens; failedTotal.usd += fs_.usd;
  }
  tokens[j.label] = sum;
  if (j.check_only) checks.push(`${j.label}: model option "${j.model_opt}" ran ${sum.models.join('+') || 'nothing'}`);
  else if (sum.models.some(m => m !== want)) { problems.push(`${j.label}: transcript model ${sum.models.join('+')}, want ${want}`); modelProblems++; }
  if (!seen.size) problems.push(`${j.label}: not in any run record`);
  if (result == null) problems.push(`${j.label}: no result`);
  problems.push(...keyProblems(j, result));
  if (sum.unpriced) problems.push(`${j.label}: ${sum.unpriced} messages with no price`);
  unread += unreadIn(result);
  out.push({ label: j.label, pass: j.pass, model: j.model, model_opt: j.model_opt, effort: j.effort, check_only: !!j.check_only, target: j.target, keys: j.keys, agentIds: [...seen], states, result });
}

const dir = path.join(EVAL, 'runs', name);
writeJson(path.join(dir, 'results.json'), { runIds: records.map(r => r.rec.runId), jobs: out });
writeJson(path.join(dir, 'tokens.json'), tokens);
writeJson(path.join(dir, 'tool-errors.json'), errors);
fs.writeFileSync(path.join(dir, 'problems.txt'), problems.join('\n') + '\n');
const total = Object.values(tokens).reduce((s, t) => ({ tokens: s.tokens + t.tokens, usd: s.usd + t.usd }), { tokens: failedTotal.tokens, usd: failedTotal.usd });
console.log(`jobs ${jobs.length} | with result ${out.filter(o => o.result != null).length} | tokens ${total.tokens} | usd ${total.usd.toFixed(4)} | problems ${problems.length}`);
console.log(`failed attempts: ${failedTotal.count} | usd ${failedTotal.usd.toFixed(4)} | tokens ${failedTotal.tokens}`);
for (const c of checks) console.log(`check: ${c}`);
const refused = errors.filter(e => PERMISSION.test(e.text));
console.log(`unread photos: ${unread} | tool errors: ${errors.length} | permission refusals: ${refused.length}`);
if (refused.length) console.log(`first refusal (${refused[0].label}): ${refused[0].text}`);
if (problems.length) console.log(problems.slice(0, 20).join('\n'));
const failOnUnread = args.includes('--fail-on-unread') && unread > 0;
process.exit(modelProblems || failOnUnread ? 1 : 0);
```

- [ ] **Step 21: Ask the owner, then launch the tracer workflow**

Send the owner this text, and wait for a clear yes in chat:

> The tracer run is one workflow of 10 agents on tree QUAC2: 4 model checks on 2 photos each (Opus 5.5 `claude-opus-5-5`, Sonnet 5.5 `claude-sonnet-5-5`, Haiku 5.5 `claude-haiku-5-5`, and one agent with the short name `haiku` to see which model it runs), 5 Haiku 5.5 agents that judge the 43 photos in batches of 10, and 1 Haiku 5.5 agent that ranks them. Every agent runs at effort `high`. May I start it?

Write the yes and its date in `NOTES.md`, with the effort values from `config.json`.

Launch with the Workflow tool: `Workflow({ scriptPath: "C:/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval/wf/selection-eval-tracer.js" })`.

When the tool refuses a first launch from `scriptPath`, launch this inline script instead, and write in `NOTES.md` that Task 4 must use it too:

```js
export const meta = { name: 'selection-eval-tracer-wrap', description: 'Runs the generated tracer script', phases: [{ title: 'P0' }, { title: 'P1' }, { title: 'P2' }] }
return await workflow({ scriptPath: 'C:/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval/wf/selection-eval-tracer.js' })
```

When an agent call fails because `model` does not accept a full model ID, stop and ask the owner before you use the short names. Send:

> The workflow refused the full model IDs. The fallback is the short names `opus`, `sonnet`, and `haiku`. On 2026-09-26 (run `wf_7532e286-2b6`), `model: 'sonnet'` ran `claude-sonnet-5`, not Sonnet 5.5, so the short names may run older models. The P0 check will show which model each name runs, and I stop if one is not a 5.5 model. May I switch to the short names and launch again?

Only after a clear yes: change `config.json` `model_opt` to `{ "opus": "opus", "sonnet": "sonnet", "haiku": "haiku" }`, run Step 15 again, and launch again. Write the yes and the change in `NOTES.md`.

Expected: the run completes with 10 agents. Keep the `runId` from the tool result.

- [ ] **Step 22: Find the run record, collect, and check that every photo was read**

Find the record with the Glob tool: pattern `C:/Users/jdennen/.claude/projects/*/*/workflows/<runId>.json`. When a wrap script ran, collect from the child run record if it is a separate file; check the `workflowProgress` labels.

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node collect.mjs --name selection-eval-tracer --record "<record path>" --fail-on-unread`
Expected: `jobs 10 | with result 10 | ... | problems 0`, a line `check: P0:haiku-alias: model option "haiku" ran <model ID>`, a line `failed attempts: <n> | usd <x> | tokens <t>` (agents with a `failed` line in the run's `journal.jsonl`, priced from their transcripts and added to the total line; the tracer had 1, USD 0.0309), a line `unread photos: 0 | tool errors: <n> | permission refusals: 0`, and exit code 0.

This step fails when any photo comes back `unread` (exit code 1). Read the `permission refusals` count and the first refusal line:

- Refusals above 0: the judges could not read files in the main checkout (`C:/Users/jdennen/Dendro/pipeline/cache/...` or the eval folder) because the session works in a worktree. Fallback: start a new Claude session whose working directory is the main checkout `C:\Users\jdennen\Dendro`, and launch the workflow from there (Step 21 again, with a new owner yes). No file in the main checkout changes; the eval folder is git-ignored. Write the cause and the fallback in `NOTES.md`.
- Refusals 0 but unread above 0: read `runs/selection-eval-tracer/tool-errors.json` and the P1 notes of the unread photos, and fix the cause (for example a broken file) before Part 1d.

- [ ] **Step 23: Check the P0 gate by hand**

Read `EVAL/runs/selection-eval-tracer/tokens.json`. For each of `P0:opus`, `P0:sonnet`, and `P0:haiku`, check:

1. `models` is exactly `["claude-opus-5-5"]`, `["claude-sonnet-5-5"]`, or `["claude-haiku-5-5"]`.
2. `input`, `output`, and `tokens` are above 0, and `usd` is above 0.
3. `cw5m + cw1h + cread` is above 0 (the cache split is read).

Read `EVAL/runs/selection-eval-tracer/results.json`. Check that each P0 result has 2 results with keys `QUAC2-01` and `QUAC2-02`. Write each `model_self_report` in `NOTES.md` (it is not proof; the transcript is).

Write in `NOTES.md` the model ID that `P0:haiku-alias` ran (from the `check:` line of Step 22). This is a check only: the eval still uses full IDs. When the short name ran a model other than `claude-haiku-5-5`, tell the owner, because the photo-check skill and other workflows may use the short name.

When a model check fails with full IDs and with the short names, stop. Tell the owner which model ran for which name. Do not continue to Part 1d. The skill documents no other way to pin a model.

#### Part 1d: views, replay, picks, and the pick page

- [ ] **Step 24: Write the failing view, replay, and score tests**

Create `EVAL/test/views.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildViews } from '../lib/views.mjs';

test('buildViews spreads P1 tokens over the batch and marks missing verdicts unread', () => {
  const jobs = [
    { label: 'P1:haiku:T:b1', pass: 'P1', model: 'haiku', target: 'T', keys: ['T-01', 'T-02'], result: { results: [{ key: 'T-01', label: 'good', note: '' }] } },
    { label: 'P2:haiku:T', pass: 'P2', model: 'haiku', target: 'T', keys: ['T-01', 'T-02', 'T-03', 'T-04'], result: { ranked: [{ key: 'T-02', tag: 'good' }, { key: 'T-02', tag: 'hard' }, { key: 'X-09', tag: 'good' }, { key: 'T-04', tag: 'odd' }], rejects: ['T-01'], unread: [] } },
    { label: 'P3:haiku:T', pass: 'P3', model: 'haiku', target: 'T', keys: ['T-01', 'T-02'], result: null },
  ];
  const tokens = { 'P1:haiku:T:b1': { tokens: 100, usd: 0.2 }, 'P2:haiku:T': { tokens: 900, usd: 0.9 } };
  const v = buildViews(jobs, tokens);
  assert.deepEqual(v.p1.haiku, { 'T-01': 'good', 'T-02': 'unread' });
  assert.deepEqual(v.p1Cost.haiku['T-02'], { tokens: 50, usd: 0.1 });
  assert.deepEqual(v.p2.haiku.T, { ranked: ['T-02', 'T-04'], tags: { 'T-02': 'good', 'T-04': 'hard' }, rejects: ['T-01', 'T-03'] });
  assert.deepEqual(v.p2Cost.haiku.T, { tokens: 900, usd: 0.9, n: 4 });
  assert.deepEqual(v.p3.haiku.T, { ranked: [], tags: {}, rejects: ['T-01', 'T-02'] });
  assert.deepEqual(v.tags.P2.haiku, { good: 1, hard: 1 });
  assert.deepEqual(v.p3Cost.haiku.T, { tokens: 0, usd: 0, n: 2 });
  assert.equal(v.unread.P1.haiku, 1);
  assert.equal(v.unread.P2.haiku, 1);
  assert.equal(v.unread.P3.haiku, 2);
  assert.ok(v.problems.some(p => /T-04: no valid tag/.test(p)));
  assert.ok(v.problems.length >= 4);
});

test('a key that is ranked and rejected stays rejected, and a problem is logged', () => {
  const jobs = [{ label: 'P2:haiku:T', pass: 'P2', model: 'haiku', target: 'T', keys: ['T-01', 'T-02', 'T-03'], result: { ranked: [{ key: 'T-01', tag: 'good' }, { key: 'T-02', tag: 'good' }], rejects: ['T-02', 'T-03'], unread: [] } }];
  const v = buildViews(jobs, { 'P2:haiku:T': { tokens: 10, usd: 0.1 } });
  assert.deepEqual(v.p2.haiku.T.rejects, ['T-02', 'T-03']);
  assert.ok(v.problems.some(p => /T-02: ranked and rejected/.test(p)));
  assert.equal(v.unread.P2.haiku, 0);
});

test('a P1 label outside the list and a missing tokens entry each log a problem', () => {
  const jobs = [{ label: 'P1:haiku:T:b1', pass: 'P1', model: 'haiku', target: 'T', keys: ['T-01', 'T-02'], result: { results: [{ key: 'T-01', label: 'great', note: '' }, { key: 'T-02', label: 'good', note: '' }] } }];
  const v = buildViews(jobs, {});
  assert.equal(v.p1.haiku['T-01'], 'unread');
  assert.equal(v.unread.P1.haiku, 1);
  assert.ok(v.problems.some(p => /T-01: label "great" is not valid/.test(p)));
  assert.ok(v.problems.some(p => /P1:haiku:T:b1: no tokens entry/.test(p)));
});
```

Create `EVAL/test/replay.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayA, replayB, replayC, lineAt } from '../lib/replay.mjs';

const k = n => `k${String(n).padStart(2, '0')}`;
const POOL = Array.from({ length: 25 }, (_, i) => k(i + 1));
const unit = Object.fromEntries(POOL.map(x => [x, { tokens: 1, usd: 0.01 }]));
const LINE = { tokens: { a: 100, b: 10 }, usd: { a: 1, b: 0.1 } };
// A ranking with every photo tagged good, except the keys in `hard`.
const rk = (ranked, rejects = [], hard = []) => ({ ranked, rejects, tags: Object.fromEntries(ranked.map(x => [x, hard.includes(x) ? 'hard' : 'good'])) });
const RANK = rk([k(20), k(3), k(11), k(25), k(7), k(1), k(14), k(9), k(2), k(16)], [k(5), k(12)]);
const RANK2 = rk([...POOL]);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('A stops after the batch that brings the good count to 6', () => {
  const p1 = Object.fromEntries(POOL.map(x => [x, 'hard']));
  for (const n of [2, 5, 9, 12, 15, 18, 19, 22]) p1[k(n)] = 'good';
  const r = replayA(POOL, p1, unit);
  assert.deepEqual(r.picks, [k(2), k(5), k(9), k(12), k(15), k(18)]);
  assert.equal(r.seen, 20);
  assert.equal(r.hardAbove, null);
  near(r.cost.tokens, 20);
  near(r.cost.usd, 0.2);
});

test('A walks the whole pool when it never reaches 6, and a missing verdict is not good', () => {
  const r = replayA(POOL, { [k(4)]: 'good', [k(24)]: 'good', [k(6)]: 'hard' }, unit);
  assert.deepEqual(r.picks, [k(4), k(24)]);
  assert.equal(r.seen, 25);
});

test('B(K) ranks the first K photos without the rejects, cost from the line at K', () => {
  const r = replayB(POOL, 12, RANK, LINE);
  assert.deepEqual(r.picks, [k(3), k(11), k(7), k(1), k(9), k(2)]);
  assert.equal(r.seen, 12);
  near(r.cost.tokens, 220);
  near(r.cost.usd, 2.2);
  const all = replayB(POOL, 'all', RANK, LINE);
  assert.deepEqual(all.picks, [k(20), k(3), k(11), k(25), k(7), k(1)]);
  near(all.cost.tokens, 350);
});

test('B drops a photo that is in both ranked and rejects', () => {
  const r = replayB(POOL, 12, { ...RANK, rejects: [k(3)] }, LINE);
  assert.ok(!r.picks.includes(k(3)));
});

test('B and C do not keep a hard photo ranked first, and count it above the sixth kept photo', () => {
  const rank = rk([k(3), k(11), k(7), k(1), k(9), k(2), k(4)], [], [k(3)]);
  const b = replayB(POOL, 12, rank, LINE);
  assert.deepEqual(b.picks, [k(11), k(7), k(1), k(9), k(2), k(4)]);
  assert.equal(b.hardAbove, 1);
  const c = replayC(POOL, rank, LINE);
  assert.ok(!c.picks.includes(k(3)));
  assert.equal(c.hardAbove, 1);
});

test('a target with fewer than 6 good photos keeps fewer than 6', () => {
  const rank = rk([k(1), k(2), k(3), k(4), k(5)], [], [k(2), k(5)]);
  const b = replayB(POOL, 'all', rank, LINE);
  assert.deepEqual(b.picks, [k(1), k(3), k(4)]);
  assert.equal(b.hardAbove, 1);
  // C holds only 3 good photos, so it does not stop at 24 when the top stays the same; it runs to the end.
  const c = replayC(POOL, rank, LINE);
  assert.deepEqual(c.picks, [k(1), k(3), k(4)]);
  assert.equal(c.seen, 25);
  near(c.cost.tokens, 350);
  const a = replayA(POOL, { [k(1)]: 'good', [k(2)]: 'hard', [k(3)]: 'good' }, unit);
  assert.deepEqual(a.picks, [k(1), k(3)]);
  assert.equal(a.hardAbove, null);
});

test('B with K above the pool size uses the whole pool', () => {
  assert.equal(replayB(POOL, 30, RANK, LINE).seen, 25);
});

test('C stops when a new batch of 12 does not change the top 6', () => {
  const r = replayC(POOL, RANK2, LINE);
  assert.deepEqual(r.picks, [k(1), k(2), k(3), k(4), k(5), k(6)]);
  assert.equal(r.seen, 24);
  near(r.cost.tokens, 340);
});

test('C runs to the end of the pool when the top 6 keeps changing', () => {
  const r = replayC(POOL, RANK, LINE);
  assert.equal(r.seen, 25);
  assert.deepEqual(r.picks, [k(20), k(3), k(11), k(25), k(7), k(1)]);
});

test('lineAt is a + b * n', () => {
  const c = lineAt(LINE, 3);
  near(c.tokens, 130);
  near(c.usd, 1.3);
});
```

Create `EVAL/test/score.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quality } from '../lib/score.mjs';

test('quality counts the overlap against min(6, best)', () => {
  assert.equal(quality(['a', 'b', 'c', 'd', 'e', 'f'], ['a', 'b', 'x', 'y', 'z', 'w']), 2 / 6);
  assert.equal(quality(['a', 'b', 'q'], ['a', 'b', 'c']), 2 / 3);
  assert.equal(quality([], ['a']), 0);
  assert.equal(quality(['a'], []), null);
});
```

- [ ] **Step 25: Run the tests and see them fail**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/views.test.mjs" "test/replay.test.mjs" "test/score.test.mjs"`
Expected: FAIL with `Cannot find module` for `../lib/views.mjs`, `../lib/replay.mjs`, and `../lib/score.mjs`.

- [ ] **Step 26: Write `lib/views.mjs`, `lib/replay.mjs`, and `lib/score.mjs`**

Create `EVAL/lib/views.mjs`:

```js
import { LABELS } from './prompts.mjs';

const zero = { tokens: 0, usd: 0 };

// jobs: results.json jobs. tokens: tokens.json. A missing verdict or rank place counts as unread.
// A ranked photo keeps the tag of its first place in the list. A missing or wrong tag counts as hard.
// A key that is both ranked and rejected stays rejected (the reject wins) and logs a problem.
export function buildViews(jobs, tokens) {
  const v = { p1: {}, p1Cost: {}, p2: {}, p2Cost: {}, p3: {}, p3Cost: {}, unread: { P1: {}, P2: {}, P3: {} }, tags: { P2: {}, P3: {} }, problems: [] };
  for (const j of jobs) {
    const r = j.result, t = tokens[j.label] ?? zero, m = j.model;
    if (!tokens[j.label] && ['P1', 'P2', 'P3'].includes(j.pass)) v.problems.push(`${j.label}: no tokens entry`);
    if (j.pass === 'P1') {
      v.p1[m] ??= {}; v.p1Cost[m] ??= {};
      const got = new Map((r?.results ?? []).map(x => [x.key, x.label]));
      for (const key of j.keys) {
        const lab = LABELS.includes(got.get(key)) ? got.get(key) : 'unread';
        if (!got.has(key)) v.problems.push(`${j.label}: no verdict for ${key}`);
        else if (!LABELS.includes(got.get(key))) v.problems.push(`${j.label}: ${key}: label ${JSON.stringify(got.get(key))} is not valid`);
        if (lab === 'unread') v.unread.P1[m] = (v.unread.P1[m] ?? 0) + 1;
        v.p1[m][key] = lab;
        v.p1Cost[m][key] = { tokens: t.tokens / j.keys.length, usd: t.usd / j.keys.length };
      }
    } else if (j.pass === 'P2' || j.pass === 'P3') {
      const keys = new Set(j.keys);
      const ranked = [], tags = {};
      for (const item of r?.ranked ?? []) {
        const key = item?.key;
        if (!keys.has(key) || key in tags) continue;
        if (item.tag !== 'good' && item.tag !== 'hard') v.problems.push(`${j.label}: ${key}: no valid tag`);
        tags[key] = item.tag === 'good' ? 'good' : 'hard';
        ranked.push(key);
      }
      const inRanked = new Set(ranked);
      const rejects = [...new Set((r?.rejects ?? []).filter(key => keys.has(key)))];
      for (const key of rejects) if (inRanked.has(key)) v.problems.push(`${j.label}: ${key}: ranked and rejected`);
      const missing = j.keys.filter(key => !inRanked.has(key) && !rejects.includes(key));
      const unread = missing.length;
      if (r == null) v.problems.push(`${j.label}: no result`);
      else if (missing.length) v.problems.push(`${j.label}: ${missing.length} keys unread or left out`);
      const P = j.pass === 'P2' ? 'p2' : 'p3';
      v[P][m] ??= {}; v[`${P}Cost`][m] ??= {};
      v[P][m][j.target] = { ranked, tags, rejects: [...rejects, ...missing] };
      v[`${P}Cost`][m][j.target] = { tokens: t.tokens, usd: t.usd, n: j.keys.length };
      v.unread[j.pass][m] = (v.unread[j.pass][m] ?? 0) + unread;
      v.tags[j.pass][m] ??= { good: 0, hard: 0 };
      for (const tag of Object.values(tags)) v.tags[j.pass][m][tag]++;
    }
  }
  return v;
}
```

Create `EVAL/lib/replay.mjs`:

```js
export const KEEP = 6, BATCH_A = 10, BATCH_C = 12;
export const NOT_KEPT = new Set(['reject', 'escalate', 'unread']);

const zero = () => ({ tokens: 0, usd: 0 });
const add = (x, y) => ({ tokens: x.tokens + y.tokens, usd: x.usd + y.usd });
const sumCost = (keys, costOf) => keys.reduce((c, key) => add(c, costOf[key] ?? zero()), zero());
const sameSet = (a, b) => a.length === b.length && a.every(key => b.includes(key));

export const lineAt = (line, n) => ({ tokens: line.tokens.a + line.tokens.b * n, usd: line.usd.a + line.usd.b * n });

// The ranker's order, cut to the photos it saw, without its rejects.
export function cutOf(candidates, rank) {
  const rej = new Set(rank.rejects);
  return rank.ranked.filter(key => candidates.has(key) && !rej.has(key));
}

// Every method keeps good photos only: the validator does not count a hard photo.
export const topOf = (candidates, rank) => cutOf(candidates, rank).filter(key => rank.tags[key] === 'good').slice(0, KEEP);

// Hard photos placed above the last kept photo (the sixth, or the last one when fewer are kept).
export function hardAbove(order, isHard, picks) {
  if (!picks.length) return 0;
  return order.slice(0, order.indexOf(picks[picks.length - 1])).filter(isHard).length;
}

const rankedHard = (candidates, rank, picks) => hardAbove(cutOf(candidates, rank), key => rank.tags[key] === 'hard', picks);

// A: stop at 6 good. Walk in batches of 10, stop after the batch that brings good to 6.
// A has no ranking, so hardAbove is null (not applicable).
export function replayA(pool, p1, p1Cost) {
  const good = [];
  let seen = 0;
  for (let i = 0; i < pool.length; i += BATCH_A) {
    const batch = pool.slice(i, i + BATCH_A);
    seen += batch.length;
    for (const key of batch) if (p1[key] === 'good') good.push(key);
    if (good.length >= KEEP) break;
  }
  const picks = good.slice(0, KEEP);
  return { picks, seen, cost: sumCost(pool.slice(0, seen), p1Cost), hardAbove: null };
}

// B(K): first K photos, ranked by the cut-down P2 ranking.
export function replayB(pool, K, rank, line) {
  const n = K === 'all' ? pool.length : Math.min(K, pool.length);
  const set = new Set(pool.slice(0, n));
  const picks = topOf(set, rank);
  return { picks, seen: n, cost: lineAt(line, n), hardAbove: rankedHard(set, rank, picks) };
}

// C: add 12 at a time. Stop when it holds 6 good photos and a new batch leaves that top 6 the same (as a set),
// or at the end of the pool. While it holds fewer than 6, it goes on (owner ruling 2026-10-08).
export function replayC(pool, rank, line) {
  let seen = 0, top = null;
  while (seen < pool.length) {
    seen = Math.min(seen + BATCH_C, pool.length);
    const next = topOf(new Set(pool.slice(0, seen)), rank);
    const stop = top !== null && next.length === KEEP && sameSet(next, top);
    top = next;
    if (stop) break;
  }
  const picks = top ?? [];
  return { picks, seen, cost: lineAt(line, seen), hardAbove: rankedHard(new Set(pool.slice(0, seen)), rank, picks) };
}
```

Create `EVAL/lib/score.mjs`:

```js
import { KEEP } from './replay.mjs';

// Share of the owner's best picks that the method kept. Null when the owner picked none.
export function quality(picks, best) {
  if (!best.length) return null;
  const b = new Set(best);
  return picks.filter(key => b.has(key)).length / Math.min(KEEP, best.length);
}
```

- [ ] **Step 27: Run the tests and see them pass**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/views.test.mjs" "test/replay.test.mjs" "test/score.test.mjs"`
Expected: PASS, 14 tests.

- [ ] **Step 28: Write the failing picks and server tests**

Create `EVAL/test/picks.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPicks } from '../lib/picks.mjs';

const pools = { targets: [{ target: 'A', photos: ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06', 'A-07'].map(key => ({ key })) }, { target: 'B', photos: [{ key: 'B-01' }] }] };

test('a complete picks file has no problems', () => {
  const picks = { targets: { A: { picks: ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06'], done: false }, B: { picks: [], done: true } } };
  assert.deepEqual(checkPicks(pools, picks), []);
});

test('checkPicks names each problem', () => {
  const picks = { targets: { A: { picks: ['A-01', 'A-01', 'Z-09'], done: false } } };
  const p = checkPicks(pools, picks).join('\n');
  assert.match(p, /A: a photo is picked twice/);
  assert.match(p, /A: Z-09 is not in the pool/);
  assert.match(p, /A: 3 picks and not marked done/);
  assert.match(p, /B: no picks/);
});

test('checkPicks names more than 6 picks', () => {
  const picks = { targets: { A: { picks: ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06', 'A-07'], done: true }, B: { picks: [], done: true } } };
  assert.deepEqual(checkPicks(pools, picks), ['A: 7 picks, more than 6']);
});
```

Create `EVAL/test/server.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';

test('server saves picks, serves the app-size copies only, and hides private files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sel-'));
  const photo = path.join(dir, 'x.jpg');
  fs.writeFileSync(photo, 'jpgbytes');
  fs.mkdirSync(path.join(dir, 'app', 'QUAC2'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'img', 'QUAC2'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'app', 'QUAC2', '1.jpg'), 'appbytes');
  fs.writeFileSync(path.join(dir, 'img', 'QUAC2', '1.jpg'), 'bigbytes');
  fs.writeFileSync(path.join(dir, 'pools.json'), JSON.stringify({ targets: [{ target: 'QUAC2', photos: [{ key: 'QUAC2-01', n: 1, abs: photo }] }] }));
  fs.writeFileSync(path.join(dir, 'pick-public.json'), JSON.stringify({ targets: [] }));
  const srv = createServer({ dir, evalDir: dir }).listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal((await fetch(`${base}/pools.json`)).status, 404);
    assert.equal((await fetch(`${base}/picks.json`)).status, 404);
    const appRes = await fetch(`${base}/app/QUAC2/1.jpg`);
    assert.equal(appRes.status, 200);
    assert.equal(await appRes.text(), 'appbytes');
    assert.equal((await fetch(`${base}/app/QUAC2/2.jpg`)).status, 404);
    // No route gives a bigger photo: not the 1,200 px copy, not the original.
    assert.equal((await fetch(`${base}/full/QUAC2-01`)).status, 404);
    assert.equal((await fetch(`${base}/img/QUAC2/1.jpg`)).status, 404);
    assert.equal((await fetch(`${base}/x.jpg`)).status, 404);
    assert.ok(!fs.readFileSync(path.join(import.meta.dirname, '..', 'pick.html'), 'utf8').match(/full size|\/full\/|\/img\//));
    assert.equal((await fetch(`${base}/pick-public.json`)).status, 200);
    const body = { targets: { QUAC2: { picks: ['QUAC2-01'], done: true } } };
    assert.equal((await fetch(`${base}/picks`, { method: 'POST', body: JSON.stringify(body) })).status, 200);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'picks.json'), 'utf8'));
    assert.deepEqual(saved.targets, body.targets);
    assert.ok(saved.saved_at);
    assert.deepEqual((await (await fetch(`${base}/picks`)).json()).targets, body.targets);
    assert.equal((await fetch(`${base}/picks`, { method: 'POST', body: '[1]' })).status, 400);
  } finally { srv.close(); }
});
```

- [ ] **Step 29: Run the tests and see them fail**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/picks.test.mjs" "test/server.test.mjs"`
Expected: FAIL with `Cannot find module` for `../lib/picks.mjs` and `../server.mjs`.

- [ ] **Step 30: Write `lib/picks.mjs`, `check-picks.mjs`, `server.mjs`, and `pick.html`**

Create `EVAL/lib/picks.mjs`:

```js
export function checkPicks(pools, picks) {
  const problems = [];
  for (const t of pools.targets) {
    const e = picks?.targets?.[t.target];
    if (!e) { problems.push(`${t.target}: no picks`); continue; }
    if (!Array.isArray(e.picks)) { problems.push(`${t.target}: picks is not a list`); continue; }
    const keys = new Set(t.photos.map(p => p.key));
    if (e.picks.length > 6) problems.push(`${t.target}: ${e.picks.length} picks, more than 6`);
    if (new Set(e.picks).size !== e.picks.length) problems.push(`${t.target}: a photo is picked twice`);
    for (const key of e.picks) if (!keys.has(key)) problems.push(`${t.target}: ${key} is not in the pool`);
    if (e.picks.length < 6 && e.done !== true) problems.push(`${t.target}: ${e.picks.length} picks and not marked done`);
  }
  return problems;
}
```

Create `EVAL/check-picks.mjs`:

```js
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
```

Create `EVAL/server.mjs`:

```js
// node server.mjs [--dir tracer] [--port 8770]  ->  http://127.0.0.1:8770/
// Serves the pick page, the blind page, their public JSON, and the app-size copies (app/<target>/<n>.jpg).
// It has no route for a full-size photo or an original.
// Never serves pools.json, runs/, out/, wf/, or briefs/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EVAL } from './lib/data.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const MAX_BODY = 1024 * 1024;

export function createServer({ dir, evalDir = EVAL }) {
  const readJ = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; } };
  const send = (res, code, body, type = 'text/plain; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  const sendFile = (res, file) => fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  const round = () => readJ(path.join(dir, 'blind-public.json'), {}).round ?? 0;
  const store = p => (p === '/picks' ? path.join(dir, 'picks.json') : path.join(dir, `blind-r${round()}.json`));

  return http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { return send(res, 400, 'bad path'); }
    if (p === '/picks' || p === '/blind-answers') {
      const file = store(p);
      if (req.method === 'GET') return fs.readFile(file, 'utf8', (err, txt) => send(res, 200, err ? '{}' : txt, TYPES['.json']));
      if (req.method !== 'POST') return send(res, 405, 'method not allowed');
      const chunks = [];
      let size = 0, over = false;
      req.on('data', c => {
        if (over) return;
        size += c.length;
        if (size > MAX_BODY) { over = true; send(res, 413, 'body over 1 MB'); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (over) return;
        let obj;
        try { obj = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, 'bad JSON'); }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return send(res, 400, 'not an object');
        obj.saved_at = new Date().toISOString();
        try {
          if (fs.existsSync(file)) fs.copyFileSync(file, file.replace(/\.json$/, '.backup.json'));
          const tmp = `${file}.${process.pid}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
          fs.renameSync(tmp, file);
          send(res, 200, JSON.stringify({ ok: true }), TYPES['.json']);
        } catch (e) { send(res, 500, 'write failed: ' + e.message); }
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    if (p === '/' || p === '/pick.html') return sendFile(res, path.join(evalDir, 'pick.html'));
    if (p === '/blind' || p === '/blind.html') return sendFile(res, path.join(evalDir, 'blind.html'));
    if (p === '/pick-public.json' || p === '/blind-public.json') return sendFile(res, path.join(dir, p.slice(1)));
    const app = p.match(/^\/app\/([A-Z0-9]+)\/(\d+)\.jpg$/);
    if (app) return sendFile(res, path.join(evalDir, 'app', app[1], `${app[2]}.jpg`));
    send(res, 404, 'not found');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const dir = path.resolve(EVAL, opt('--dir', '.'));
  const port = Number(opt('--port', 8770));
  createServer({ dir }).listen(port, '127.0.0.1', () => console.log(`selection-eval pages on http://127.0.0.1:${port}/ (dir ${dir})`));
}
```

Create `EVAL/pick.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Best-6 picks</title>
<style>
body { font: 15px system-ui, sans-serif; margin: 16px; background: #faf8f2; color: #222; }
header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; position: sticky; top: 0; background: #faf8f2; padding: 8px 0; z-index: 1; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(446px, 1fr)); gap: 10px; }
.tile { position: relative; border: 3px solid transparent; cursor: pointer; background: #eee; }
.tile img { display: block; margin: 0 auto; }
.tile.on { border-color: #c60; }
.badge { position: absolute; top: 4px; left: 4px; background: #c60; color: #fff; font-weight: bold; padding: 2px 8px; border-radius: 10px; }
#status { color: #666; }
</style>
</head>
<body>
<header>
  <select id="target"></select>
  <span id="species"></span>
  <span id="count"></span>
  <label><input type="checkbox" id="done"> Done with this tree (check it also when fewer than 6 photos are usable)</label>
  <span id="status"></span>
</header>
<p>Click a photo to add it to your best 6, in order. Click it again to remove it. Each photo shows at the size that the app shows it to a learner (440 px on the long side).</p>
<div class="grid" id="grid"></div>
<script>
let pub, picks = { targets: {} }, cur;
const $ = id => document.getElementById(id);
async function save() {
  $('status').textContent = 'saving...';
  const r = await fetch('/picks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(picks) });
  $('status').textContent = r.ok ? 'saved' : 'SAVE FAILED: ' + await r.text();
}
const entry = () => (picks.targets[cur.target] ??= { picks: [], done: false });
function draw() {
  const e = entry();
  $('species').textContent = cur.species || '';
  $('count').textContent = e.picks.length + ' of 6 picked';
  $('done').checked = e.done;
  $('grid').replaceChildren(...cur.photos.map(p => {
    const d = document.createElement('div');
    const i = e.picks.indexOf(p.key);
    d.className = 'tile' + (i >= 0 ? ' on' : '');
    d.innerHTML = `<img loading="lazy" src="/app/${cur.target}/${p.n}.jpg" alt="${p.key}">`
      + (i >= 0 ? `<span class="badge">${i + 1}</span>` : '');
    d.onclick = () => {
      if (i >= 0) e.picks.splice(i, 1);
      else if (e.picks.length < 6) e.picks.push(p.key);
      else return;
      draw(); save();
    };
    return d;
  }));
}
$('done').onchange = () => { entry().done = $('done').checked; draw(); save(); };
$('target').onchange = () => { cur = pub.targets[$('target').selectedIndex]; draw(); scrollTo(0, 0); };
(async () => {
  pub = await (await fetch('/pick-public.json')).json();
  picks = await (await fetch('/picks')).json();
  picks.targets ??= {};
  $('target').replaceChildren(...pub.targets.map((t, i) => new Option(`${i + 1}. ${t.target}`)));
  cur = pub.targets[0];
  draw();
})();
</script>
</body>
</html>
```

- [ ] **Step 31: Run all tests**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/*.test.mjs"`
Expected: PASS, 53 tests, 0 failures.

- [ ] **Step 32: Try the pick page on the tracer target and save test picks**

Start the server in the background (Bash, `run_in_background: true`):
`cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node server.mjs --dir tracer`

Open `http://127.0.0.1:8770/` in the built-in browser. Check: 43 photos show; a click adds an orange badge 1; a second click removes it; each photo shows at its natural size (440 px long side), with no full-size link; the status says `saved`. Check that the grid is not in key order (the seeded display order). Click any 6 photos. These are test picks, not owner picks.

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node check-picks.mjs --dir tracer`
Expected: `QUAC2: 6 picks` and `picks complete`.

Stop the server by port (see Global Constraints).

- [ ] **Step 33: Write `tracer-row.mjs` and print the tracer row**

Create `EVAL/tracer-row.mjs`:

```js
// node tracer-row.mjs  ->  one report row per method for the tracer target (test data only)
import path from 'node:path';
import { EVAL, readJson } from './lib/data.mjs';
import { buildViews } from './lib/views.mjs';
import { replayA, replayB, replayC } from './lib/replay.mjs';
import { quality } from './lib/score.mjs';

const config = readJson(path.join(EVAL, 'config.json'));
const R = readJson(path.join(EVAL, 'runs/selection-eval-tracer/results.json'));
const T = readJson(path.join(EVAL, 'runs/selection-eval-tracer/tokens.json'));
const pools = readJson(path.join(EVAL, 'tracer/pools.json'));
const picks = readJson(path.join(EVAL, 'tracer/picks.json'));
const v = buildViews(R.jobs.filter(j => j.pass !== 'P0'), T);
const m = config.tracer_model, t = pools.targets[0], pool = t.photos.map(p => p.key);
const c2 = v.p2Cost[m][t.target];
// Tracer only: no P3 point, so the line goes through 0.
const line = { tokens: { a: 0, b: c2.tokens / c2.n }, usd: { a: 0, b: c2.usd / c2.n } };
const best = picks.targets[t.target]?.picks ?? [];
console.log('| method | model | kept | seen | quality | hard above last kept | tokens | USD |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [id, r] of [['A', replayA(pool, v.p1[m], v.p1Cost[m])], ['B(all)', replayB(pool, 'all', v.p2[m][t.target], line)], ['C', replayC(pool, v.p2[m][t.target], line)]]) {
  console.log(`| ${id} | ${m} | ${r.picks.length} | ${r.seen} | ${quality(r.picks, best)?.toFixed(2)} | ${r.hardAbove ?? 'n/a'} | ${Math.round(r.cost.tokens)} | ${r.cost.usd.toFixed(4)} |`);
}
console.log(`unread: P1 ${v.unread.P1[m] ?? 0}, P2 ${v.unread.P2[m] ?? 0} | P2 tags: ${JSON.stringify(v.tags.P2[m])} | problems: ${v.problems.length}`);
```

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node tracer-row.mjs`
Expected: a table with 3 rows (A, B(all), C) for `haiku`. Every value is a number, except "hard above" of A, which is `n/a` (A has no ranking). The B(all) row has `seen` 43. The tokens of A are the P1 tokens of the batches it saw. The P2 tags line shows `good` and `hard` counts that add up to the ranked photos; when every ranked photo is `good`, read the P2 result and check that the agent tagged at all.

- [ ] **Step 34: Record progress**

Add to `EVAL/NOTES.md`:
- the date and `Task 1 done`;
- the `model_opt` values that worked, and the model ID each P0 transcript shows;
- whether a first launch from `scriptPath` worked, or the wrap script was needed;
- the record path pattern that held, and the tracer token totals per pass (P0, P1, P2) with USD;
- the tracer row table from Step 33.

---

### Task 2: Pools and images for all 10 targets

Blocked by: Task 1.

**Files:**
- Modify: `EVAL/lib/seed.mjs` (add `chooseTargets`)
- Test: `EVAL/test/seed.test.mjs`
- Output: `EVAL/pools.json`, `EVAL/pick-public.json`, `EVAL/img/<target>/`, `EVAL/app/<target>/`, `EVAL/sheets/<target>/`, `EVAL/img-failures.json`

**Interfaces:**
- Consumes: `buildTargets`, `mulberry32`, `shuffle`, `MIN_POOL` (Task 1); `pools.mjs` and `images.mjs` (Task 1).
- Produces: `chooseTargets(targets, seed, nRich = 6, nThin = 4) -> { chosen: [target with kind], p3: [target name] }`; `pools.json` and `pick-public.json` in the shapes of **Data shapes**.

- [ ] **Step 1: Write the failing test**

Create `EVAL/test/seed.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseTargets } from '../lib/seed.mjs';

const t = (name, good_old, n = 30) => ({ target: name, good_old, photos: Array.from({ length: n }, (_, i) => ({ key: `${name}-${i + 1}` })) });
const ALL = [
  ...Array.from({ length: 10 }, (_, i) => t(`R${i}`, 6 + i)),
  ...Array.from({ length: 5 }, (_, i) => t(`T${i}`, i)),
  t('SMALL1', 9, 10), t('SMALL2', 1, 23),
];

test('chooseTargets takes 6 rich and 4 thin eligible targets, and 2 rich plus 1 thin for P3', () => {
  const { chosen, p3 } = chooseTargets(ALL, 20261007);
  assert.equal(chosen.filter(x => x.kind === 'rich').length, 6);
  assert.equal(chosen.filter(x => x.kind === 'thin').length, 4);
  assert.ok(chosen.every(x => x.photos.length >= 24));
  assert.ok(chosen.filter(x => x.kind === 'rich').every(x => x.good_old >= 6));
  assert.ok(chosen.filter(x => x.kind === 'thin').every(x => x.good_old < 6));
  assert.equal(p3.length, 3);
  const kindOf = name => chosen.find(x => x.target === name)?.kind;
  assert.deepEqual(p3.map(kindOf), ['rich', 'rich', 'thin']);
});

test('chooseTargets gives the same answer for the same seed and any input order', () => {
  const a = chooseTargets(ALL, 7);
  const b = chooseTargets([...ALL].reverse(), 7);
  assert.deepEqual(a.chosen.map(x => x.target), b.chosen.map(x => x.target));
  assert.deepEqual(a.p3, b.p3);
});

test('chooseTargets throws when there are too few thin targets', () => {
  assert.throws(() => chooseTargets(ALL.filter(x => !x.target.startsWith('T')), 1), /not enough targets/);
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/seed.test.mjs"`
Expected: FAIL with `chooseTargets is not a function` (or a missing export error).

- [ ] **Step 3: Add `chooseTargets` to `lib/seed.mjs`**

Append to `EVAL/lib/seed.mjs`:

```js
// Thin: fewer than 6 good leaf photos in the pool under the old verdicts. Eligible: a pool of 24 or more.
export function chooseTargets(targets, seed, nRich = 6, nThin = 4) {
  const rng = mulberry32(seed);
  const ok = targets.filter(t => t.photos.length >= MIN_POOL).sort((a, b) => a.target.localeCompare(b.target));
  const rich = shuffle(ok.filter(t => t.good_old >= 6), rng).slice(0, nRich).map(t => ({ ...t, kind: 'rich' }));
  const thin = shuffle(ok.filter(t => t.good_old < 6), rng).slice(0, nThin).map(t => ({ ...t, kind: 'thin' }));
  if (rich.length < nRich || thin.length < nThin) throw new Error(`not enough targets: rich ${rich.length}, thin ${thin.length}`);
  const p3 = [...shuffle(rich, rng).slice(0, 2), ...shuffle(thin, rng).slice(0, 1)].map(t => t.target);
  return { chosen: [...rich, ...thin], p3 };
}
```

- [ ] **Step 4: Run all tests and see them pass**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/*.test.mjs"`
Expected: PASS, 56 tests.

- [ ] **Step 5: Build the pools**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node pools.mjs --out pools.json`
Expected:
- 10 lines: 6 with `rich`, 4 with `thin`. Every `thin` target is one of `ACMA3`, `ACPS`, `ACRU`, `LITU`, `PLRA`.
- The draw matches the one in the facts list: rich `QULO` 40, `QUBO2` 54, `QUAU` 43, `QUSI` 60, `ACPE` 49, `QULA` 53; thin `ACRU` 45, `PLRA` 53, `ACPS` 42, `LITU` 34; `p3: QUAU, QULO, LITU`; `photos: 473`. When it does not match, stop: compare `eligible` in `pools.json` with the facts list, and tell the owner before you go on. Do not change the seed to get a draw.
- `p3:` names 3 targets, 2 rich and 1 thin.
- `eligible targets: 38`.
- `dropped from all pools: {"duplicate_hash":1,"wrong_species":25}`. None of the 10 targets has a dropped row (`dropped=0` on every line).

Read `EVAL/pick-public.json` and check that it has no `kind`, `good_old`, `id`, `local`, or `abs` field, and that the photos of each target are not in key order (the seeded display order).

- [ ] **Step 6: Make the images and sheets**

Run (allow up to 10 minutes): `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node images.mjs --pools pools.json`
Expected: 10 lines `<target>: <n>/<n> images, <ceil(n/9)> sheets`, and `failures: 0`. When there are failures, read `img-failures.json` and write the keys in `NOTES.md`. The photos stay in the pool. A judge marks them `unread`, and the replay counts them as rejects.

Check with the Glob tool: `EVAL/sheets/<P3 target>/first12-*.jpg` gives 2 files for each of the 3 P3 targets. Read one `first12-2.jpg`: it shows 3 tiles.

- [ ] **Step 7: Record progress**

Add to `EVAL/NOTES.md`: the date, `Task 2 done`, the 10 targets with kind, pool size, `good_old`, and dropped rows, the dropped counts per reason, the 3 P3 targets, the total photo count, and the image failures. Do not write any judge output in this file before Task 3 is done, because the owner may read it.

---

### Task 3: OWNER CHECKPOINT, best-6 picks for all 10 targets

Blocked by: Task 2. Task 4 can run at the same time.

This task is owner work. The agent starts the page, tells the owner what to do, and checks the result. The agent does not pick photos.

**Files:**
- Output (written by the page): `EVAL/picks.json`, `EVAL/picks.backup.json`

**Interfaces:**
- Consumes: `server.mjs`, `pick.html`, `check-picks.mjs` (Task 1); `pools.json`, `pick-public.json`, `img/` (Task 2).
- Produces: `picks.json` that `check-picks.mjs` passes.

- [ ] **Step 1: Start the page**

Start the server in the background (Bash, `run_in_background: true`):
`cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node server.mjs`
Expected: `selection-eval pages on http://127.0.0.1:8770/`.

- [ ] **Step 2: Give the owner the instructions**

Send the owner this text, and nothing about judge results:

> The pick page is at http://127.0.0.1:8770/. It has 10 trees. For each tree:
> 1. Look at all the photos. Each shows at the size that the app shows a learner.
> 2. Click the best photo for learning this leaf, then the second best, up to 6. The orange number is the order. Click a photo again to remove it.
> 3. When fewer than 6 photos are usable, pick only those, and tick "Done with this tree".
> 4. Pick the next tree from the list at the top.
> Each click saves. Tell me when all 10 trees are done.

- [ ] **Step 3: Check that the picks are complete**

When the owner says the picks are done, run:
`cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node check-picks.mjs`
Expected: 10 lines `<target>: <n> picks` and `picks complete`, exit code 0.

When it prints problems, send the problem lines to the owner (they name only trees and photo keys), and run the check again after the owner fixes them.

- [ ] **Step 4: Stop the server and record progress**

Stop the server by port 8770 (see Global Constraints). Add to `EVAL/NOTES.md`: the date, `Task 3 done`, and the pick count per target. From now on, judge results may be shown to the owner.

---

### Task 4: Full judge run, P1, P2, and P3 for three models

Blocked by: Task 2. Task 3 can run at the same time. The owner must approve the size before the launch.

One workflow runs every judge agent: P1 for each model, target, and batch of 10; P2 for each model and target; P3 for each model on the 3 P3 targets (Haiku included). With the draw in the facts list it is 195 agents (P1 156, P2 30, P3 9). Each agent returns its verdicts or its ranking through the schema.

**Files:**
- Create: `EVAL/estimate.mjs`, `EVAL/check-run.mjs`
- Output: `EVAL/wf/selection-eval-full.js`, `EVAL/wf/selection-eval-full.jobs.json`, `EVAL/runs/selection-eval-full/results.json`, `tokens.json`, `problems.txt`

**Interfaces:**
- Consumes: `make-workflow.mjs`, `collect.mjs`, `lib/views.mjs`, `lib/tokens.mjs` (Task 1); `pools.json` and the sheets (Task 2); the tracer token record `runs/selection-eval-tracer/tokens.json` (Task 1); `config.json` `model_opt` as fixed in Task 1.
- Produces: `runs/selection-eval-full/results.json` and `tokens.json` in the shapes of **Data shapes**. Task 5 reads them through `buildViews`.

- [ ] **Step 1: Generate the full workflow**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node make-workflow.mjs --plan full`
Expected: counts per pass and model. `P1 <model>` is the same for the 3 models and equals the sum of `ceil(pool/10)` over the 10 targets (52). `P2 <model>` is 10. `P3 <model>` is 3. `agents: 195`.

- [ ] **Step 2: Write `estimate.mjs` and run it**

Create `EVAL/estimate.mjs`:

```js
// node estimate.mjs  ->  rough USD for the full run, from the Haiku tracer token mix.
// It assumes every model uses the same tokens per photo. Opus and Sonnet often write more output, so read it as a floor.
import path from 'node:path';
import { EVAL, readJson } from './lib/data.mjs';
import { RATES, MODEL_IDS } from './lib/tokens.mjs';

const T = readJson(path.join(EVAL, 'runs/selection-eval-tracer/tokens.json'));
const tracer = readJson(path.join(EVAL, 'wf/selection-eval-tracer.jobs.json'));
const full = readJson(path.join(EVAL, 'wf/selection-eval-full.jobs.json'));
const FIELDS = ['input', 'cw5m', 'cw1h', 'cread', 'output'];
const perPhoto = pass => {
  const js = tracer.filter(j => j.pass === pass);
  const n = js.reduce((s, j) => s + j.keys.length, 0);
  return Object.fromEntries(FIELDS.map(f => [f, js.reduce((s, j) => s + T[j.label][f], 0) / n]));
};
const mix = { P1: perPhoto('P1'), P2: perPhoto('P2'), P3: perPhoto('P2') };
const rows = {};
let total = 0;
for (const j of full) {
  const r = RATES[MODEL_IDS[j.model]][0], m = mix[j.pass];
  const usd = j.keys.length * FIELDS.reduce((s, f) => s + m[f] * r[f], 0) / 1e6;
  const k = `${j.pass} ${j.model}`;
  rows[k] ??= { agents: 0, photos: 0, usd: 0 };
  rows[k].agents++; rows[k].photos += j.keys.length; rows[k].usd += usd;
  total += usd;
}
for (const r of Object.values(rows)) r.usd = Number(r.usd.toFixed(2));
console.table(rows);
console.log(`estimate: about ${total.toFixed(2)} USD for ${full.length} agents (a floor; see the note at the top of this file)`);
```

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node estimate.mjs`
Expected: a table of `P1/P2/P3 x opus/sonnet/haiku` rows and one `estimate:` line.

- [ ] **Step 3: Ask the owner to approve the size**

Send the owner the agent count per pass and model from Step 1, the `estimate:` line from Step 2, and this text:

> The full judge run is one workflow of <N> agents, more than the usual limit of 10 per workflow. About 10 run at a time. It judges every pool photo once per model (P1), ranks each tree once per model (P2), and ranks the first 12 photos of 3 trees once per model (P3). The estimate is about <USD> USD, and Opus and Sonnet may cost more than the estimate. May I start it?

Wait for a clear yes in chat. Do not launch without it. Write the approval and its date in `NOTES.md`.

- [ ] **Step 4: Check the effort and launch**

Check that `config.json` `effort` is the same as for the tracer run (`high` for all three models), and that the generated `wf/selection-eval-full.jobs.json` has that `effort` on every job. Write the values in `NOTES.md`.

Launch with the Workflow tool: `Workflow({ scriptPath: "C:/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval/wf/selection-eval-full.js" })`. When Task 1 found that a first launch from `scriptPath` is refused, use the wrap script from Task 1 Step 21 with `selection-eval-full.js` in place of `selection-eval-tracer.js`, and phases `P1`, `P2`, `P3`.

Keep the `runId`. While the run is on, do not tell the owner any verdict, label, ranking, or note, until Task 3 Step 4 is done. Progress counts (agents done, agents failed) are fine.

- [ ] **Step 5: When the run stops early, resume it**

When the run is killed or paused before it completes, relaunch with `Workflow({ scriptPath: "<same path>", resumeFromRunId: "<runId>" })`. Keep every `runId`. Each one has its own run record. Do not edit the script between the first launch and the resume. A changed script runs the changed agents and every agent after them again.

Agents that fail inside a completed run are not run again. They count as `unread`, and the replay treats their photos as rejects (spec, Part 2).

- [ ] **Step 6: Collect**

Find each run record with the Glob tool: `C:/Users/jdennen/.claude/projects/*/*/workflows/<runId>.json`.

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node collect.mjs --name selection-eval-full --record "<record 1>" [--record "<record 2>"]`
Expected: `jobs <N> | with result <M> | tokens ... | usd ... | problems <P>` and exit code 0. Exit code 1 means a model problem: stop, and tell the owner which labels ran on which model.

- [ ] **Step 7: Write `check-run.mjs` and check the run**

Create `EVAL/check-run.mjs`:

```js
// node check-run.mjs [name]  ->  agents, failures, tokens, and USD per pass and model; unread counts.
import path from 'node:path';
import { EVAL, readJson } from './lib/data.mjs';
import { buildViews } from './lib/views.mjs';

const name = process.argv[2] ?? 'selection-eval-full';
const R = readJson(path.join(EVAL, 'runs', name, 'results.json'));
const T = readJson(path.join(EVAL, 'runs', name, 'tokens.json'));
const v = buildViews(R.jobs, T);
const agg = {};
for (const j of R.jobs) {
  const k = `${j.pass} ${j.model}`, s = T[j.label];
  agg[k] ??= { agents: 0, failed: 0, input: 0, cw5m: 0, cw1h: 0, cread: 0, output: 0, usd: 0 };
  agg[k].agents++;
  if (j.result == null) agg[k].failed++;
  for (const f of ['input', 'cw5m', 'cw1h', 'cread', 'output', 'usd']) agg[k][f] += s?.[f] ?? 0;
}
for (const a of Object.values(agg)) a.usd = Number(a.usd.toFixed(2));
console.table(agg);
console.log('unread photos per pass and model:', JSON.stringify(v.unread));
console.log('ranked photo tags per pass and model:', JSON.stringify(v.tags));
console.log(`view problems: ${v.problems.length} (untagged ranked photos: ${v.problems.filter(p => p.includes('no valid tag')).length})`);
```

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node check-run.mjs`
Expected:
- 9 rows (`P1`, `P2`, `P3` for each model). Every row has `usd` above 0 and `output` above 0.
- `failed` is small. When more than 10 percent of the agents of one row failed, stop and tell the owner before Task 5.
- The unread line gives the counts that the report needs.
- The tags line has both `good` and `hard` counts for each `P2` and `P3` model. The untagged count is small; an untagged ranked photo counts as `hard`.

- [ ] **Step 8: Record progress**

Now add to `EVAL/NOTES.md` only: the date, `Task 4 done`, the run IDs and record paths, the agent counts, and the total USD.

Hold the rest of this step until Task 3 Step 4 is done (the owner may read `NOTES.md` while picking). Then add the `check-run.mjs` table, the unread counts, and the tag counts.

---

### Task 5: Full replay and shortlist

Blocked by: Task 3 and Task 4.

Every method runs once per judge model in the replay, plus the filter-first variants. The script fits a cost line per model, checks P3, scores quality and extras against the owner's picks, and picks the shortlist and the candidate.

Rules pinned in this task (each one is in the code and in a test):

- **Good only.** B, C, and filter-first keep the top 6 photos that the ranker tagged `good`, as A keeps the first 6 `good` photos. C's stop test compares the sets of top 6 `good` photos, and C stops only when it holds 6 `good` photos (owner ruling 2026-10-08); with fewer, it goes on to the end of the pool. The tag comes from the ranking pass itself, not from P1 (spec, Part 3).
- **Hard above.** For each row and target: the number of `hard` photos placed above the sixth kept photo, or above the last kept photo when fewer than 6 are kept (0 when none is kept). The order is the ranker's order cut to the photos it saw. Method A has no ranking, so its value is `n/a` (null in the code), and it is left out of the means and totals (owner ruling 2026-10-08).
- **Filter first.** The filter model (Haiku or Sonnet) judges the pool in fetch order, in batches of 10, and drops its `reject`, `escalate`, and `unread` photos. The ranker then runs B(K) or C on the survivors, in fetch order. For B(K), the filter stops after the batch that holds the K-th survivor; when there are fewer than K survivors, or K is `all`, it judges the whole pool. For C, the filter stops after the batch that holds the last survivor that C used; when C used every survivor, the filter judged the whole pool. Cost = the filter's P1 cost of the photos it judged + the ranker's cost line at the number of survivors it ranked (0 when there are none).
- **Cost line.** For each model and each P3 target: `b_t = (c2 - c3) / (n2 - 12)` and `a_t = c3 - 12 * b_t`, where `c3` is the P3 cost (12 photos) and `c2` the P2 cost (`n2` = pool size). `a` and `b` are the means over the 3 P3 targets. This is done for tokens and for USD apart. A negative `a` is kept, and the table notes it.
- **P3 check.** For each model and P3 target: top 6 of the P3 ranking against the top 6 of the P2 ranking cut to the same 12 photos, rejects dropped from both. The difference is half the size of the symmetric difference. When the mean over the 3 targets is more than 1 photo, the rows of that ranker for B(12), B(20), and C (also as filter-first rankers) are marked unreliable. C is marked because its stop test compares rankings of 12 and 24 photos.
- **Quality.** `|picks ∩ ownerBest| / min(6, |ownerBest|)`, mean over the targets where the owner picked at least 1 photo. A target with 0 picks has no quality score.
- **Extras** (owner ruling 2026-10-08). On each target where the owner picked fewer than 6 and marked it done, the owner's picks are every photo the owner would show. `extras = |picks \ ownerBest|`, the kept photos not in the picks. A target with 0 picks counts. A target with 6 picks has no extras score. The mean is over the targets with a score, and the table also gives it for rich and thin targets apart.
- **Winner.** Rows marked unreliable stay in the table, but they are not used for Q*, E*, or the shortlist. Q* = the best mean quality. E* = the lowest mean extras. Shortlist = rows with quality `>= Q* - 1/6` (one photo) and extras `<= E* + 1` (one photo per target). Candidate = the cheapest shortlist row by USD per target (ties: fewer tokens, then the row ID). Best quality = the cheapest row with quality Q*. Best (the blind-check opponent) = the best-quality row, or `config.json` `blind_opponent` when it is set (owner ruling 2026-10-09: `Fhaiku>Ball|opus` for this run). Next = the cheapest shortlist row that keeps another set of photos than the candidate and than the opponent on at least 1 target. `blind_needed` is false when there is no candidate, or when the candidate keeps the same sets as the opponent on every target.
- **Report data** (not in the winner rule). Each B(all) row also gives the real P2 USD per target; the cost line runs about 15-17% above it, because it is fitted from the 3 P3 targets. Each C row is marked "cost is a lower bound": a real C run calls the ranker once per batch of 12.

**Files:**
- Modify: `EVAL/lib/replay.mjs` (add `survivors`, `replayFilterB`, `replayFilterC`)
- Modify: `EVAL/lib/score.mjs` (add `extras`, `P3_LIMIT`, `costLine`, `p3Diff`, `summarizeRow`, `pickWinner`)
- Modify: `EVAL/config.json` (add `"blind_opponent": "Fhaiku>Ball|opus"`, owner ruling 2026-10-09)
- Create: `EVAL/analyze.mjs`
- Test: `EVAL/test/filter.test.mjs`, `EVAL/test/winner.test.mjs`
- Output: `EVAL/out/table.json`, `EVAL/out/table.md`, `EVAL/out/shortlist.json`

**Interfaces:**
- Consumes: `buildViews`, `replayA`, `replayB`, `replayC`, `topOf`, `lineAt`, `quality`, `checkPicks` (Task 1); `pools.json` (Task 2); `picks.json` (Task 3); `runs/selection-eval-full/*` (Task 4).
- Produces:
  - `replayFilterB(pool, K, fP1, fCost, rank, line)` and `replayFilterC(pool, fP1, fCost, rank, line)`, each `-> { picks, seen, ranked, cost, hardAbove }` (`seen` = photos the filter judged, `ranked` = survivors the ranker saw).
  - `costLine(points) -> { tokens: { a, b }, usd: { a, b } }`, with `points = [{ n3, c3, n2, c2 }]`.
  - `p3Diff(p3Rank, p2Rank, first12) -> number`.
  - `extras(picks, best, done) -> number | null` (null for a target with 6 picks, or with fewer than 6 and not done).
  - `summarizeRow(id, per, unreliable) -> { id, unreliable, q_mean, q_rich, q_thin, q_min, q_max, q_sd, x_mean, x_rich, x_thin, short, usd_mean, tokens_mean, seen_mean, hard_above_mean, hard_above_total, per }`, with `per = [{ target, kind, picks, seen, cost, q, x, hard_above }]`.
  - `pickWinner(rows, { opponent }) -> { qStar, eStar, shortlist: [id], excluded: [id], candidate, best, best_quality, next, blind_needed }`. `candidate` is null when the shortlist is empty. `best_quality` is the cheapest reliable row with quality Q*, on the shortlist or not. `best` is the blind-check opponent: `opponent` when it is set, else `best_quality`.
  - `out/table.json`: `{ lines, p3, cost_line_vs_p2, unread, problems, rows }`; a B(all) row has `usd_p2_real`, a C row has `cost_lower_bound: true`. `out/shortlist.json`: the `pickWinner` result. Row IDs: `A|<m>`, `B<K>|<m>`, `C|<m>`, `F<f>>B<K>|<m>`, `F<f>>C|<m>`, with `K` in `12, 20, 30, all`.

- [ ] **Step 1: Write the failing tests**

Create `EVAL/test/filter.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayFilterB, replayFilterC, survivors } from '../lib/replay.mjs';

const k = n => `k${String(n).padStart(2, '0')}`;
const pool = n => Array.from({ length: n }, (_, i) => k(i + 1));
const POOL = pool(25);
const unit = Object.fromEntries(pool(40).map(x => [x, { tokens: 1, usd: 0.01 }]));
const LINE = { tokens: { a: 100, b: 10 }, usd: { a: 1, b: 0.1 } };
const rk = (ranked, rejects = [], hard = []) => ({ ranked, rejects, tags: Object.fromEntries(ranked.map(x => [x, hard.includes(x) ? 'hard' : 'good'])) });
const RANK = rk([k(20), k(3), k(11), k(25), k(7), k(1), k(14), k(9), k(2), k(16)], [k(5), k(12)]);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const F = Object.fromEntries(POOL.map(x => [x, 'hard']));
Object.assign(F, { [k(1)]: 'reject', [k(2)]: 'reject', [k(3)]: 'escalate', [k(10)]: 'good' });
delete F[k(4)];

test('survivors drop reject, escalate, and unread, and keep fetch order', () => {
  assert.deepEqual(survivors(POOL, F), pool(25).slice(4));
});

test('filter then B(12): the filter stops after the batch of the 12th survivor', () => {
  const r = replayFilterB(POOL, 12, F, unit, RANK, LINE);
  assert.equal(r.ranked, 12);
  assert.equal(r.seen, 20);
  assert.deepEqual(r.picks, [k(11), k(7), k(14), k(9), k(16)]);
  near(r.cost.tokens, 20 + 220);
  near(r.cost.usd, 0.2 + 2.2);
});

test('filter then B(all) or B(K above the survivors) judges the whole pool', () => {
  for (const K of ['all', 30]) {
    const r = replayFilterB(POOL, K, F, unit, RANK, LINE);
    assert.equal(r.ranked, 21);
    assert.equal(r.seen, 25);
    assert.deepEqual(r.picks, [k(20), k(11), k(25), k(7), k(14), k(9)]);
    near(r.cost.tokens, 25 + 310);
  }
});

test('filter then C that uses every survivor judges the whole pool', () => {
  const r = replayFilterC(POOL, F, unit, rk([...POOL]), LINE);
  assert.equal(r.ranked, 21);
  assert.equal(r.seen, 25);
  assert.deepEqual(r.picks, pool(10).slice(4));
  near(r.cost.tokens, 25 + 310);
});

test('filter then C that stops early: the filter stops after the batch of the last survivor used', () => {
  const P40 = pool(40);
  const f = Object.fromEntries(P40.map((x, i) => [x, i < 4 ? 'reject' : 'hard']));
  const r = replayFilterC(P40, f, unit, rk([...P40]), LINE);
  assert.equal(r.ranked, 24);
  assert.equal(r.seen, 30);
  near(r.cost.tokens, 30 + 340);
});

test('filter first keeps good photos only: a hard photo ranked first is not kept', () => {
  const rank = rk([k(5), k(6), k(7), k(8), k(9), k(10), k(11)], [], [k(5)]);
  for (const r of [replayFilterB(POOL, 12, F, unit, rank, LINE), replayFilterC(POOL, F, unit, rank, LINE)]) {
    assert.deepEqual(r.picks, [k(6), k(7), k(8), k(9), k(10), k(11)]);
    assert.equal(r.hardAbove, 1);
  }
});

test('no survivors: no picks, the ranker costs nothing', () => {
  const none = Object.fromEntries(POOL.map(x => [x, 'reject']));
  for (const r of [replayFilterB(POOL, 12, none, unit, RANK, LINE), replayFilterC(POOL, none, unit, RANK, LINE)]) {
    assert.deepEqual(r.picks, []);
    assert.equal(r.ranked, 0);
    assert.equal(r.hardAbove, 0);
    near(r.cost.tokens, 25);
  }
});
```

Create `EVAL/test/winner.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costLine, p3Diff, extras, summarizeRow, pickWinner, P3_LIMIT } from '../lib/score.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const six = ['a', 'b', 'c', 'd', 'e', 'f'];

test('costLine averages the per-target lines through the P3 and P2 points', () => {
  const line = costLine([
    { n3: 12, c3: { tokens: 30000, usd: 0.3 }, n2: 42, c2: { tokens: 90000, usd: 0.9 } },
    { n3: 12, c3: { tokens: 20000, usd: 0.2 }, n2: 32, c2: { tokens: 60000, usd: 0.6 } },
  ]);
  near(line.tokens.b, 2000);
  near(line.tokens.a, 1000);
  near(line.usd.b, 0.02);
  near(line.usd.a, 0.01);
});

test('p3Diff is half the symmetric difference of the two top 6 sets', () => {
  const first12 = Array.from({ length: 12 }, (_, i) => `k${String(i + 1).padStart(2, '0')}`);
  const good = ranked => Object.fromEntries(ranked.map(x => [x, 'good']));
  const p3 = { ranked: ['k01', 'k02', 'k03', 'k04', 'k05', 'k06', 'k07'], rejects: [], tags: good(['k01', 'k02', 'k03', 'k04', 'k05', 'k06', 'k07']) };
  const p2r = ['k02', 'k01', 'k03', 'k04', 'k08', 'k09', 'k05', 'k40'];
  const p2 = { ranked: p2r, rejects: ['k06'], tags: good(p2r) };
  assert.equal(p3Diff(p3, p2, first12), 2);
  assert.equal(p3Diff(p3, p3, first12), 0);
  // A hard tag takes a photo out of the top 6 on that side.
  assert.equal(p3Diff({ ...p3, tags: { ...p3.tags, k01: 'hard' } }, p3, first12), 1);
  assert.equal(P3_LIMIT, 1);
});

test('extras: with fewer than 6 picks and done, it counts the kept photos not in the picks', () => {
  assert.equal(extras(six, ['a', 'x'], true), 5);
  assert.equal(extras(['a', 'b'], ['a', 'b', 'c'], true), 0);
  // Fewer than 6 picks and not done: the picks are not every photo the owner would show.
  assert.equal(extras(six, ['a', 'x'], false), null);
});

test('extras: with 0 picks and done, every kept photo is an extra', () => {
  assert.equal(extras(['a', 'b', 'c'], [], true), 3);
  assert.equal(extras([], [], true), 0);
});

test('extras: a target with 6 picks has no extras score', () => {
  assert.equal(extras(six, ['a', 'b', 'x', 'y', 'z', 'w'], true), null);
  assert.equal(extras(six, ['a', 'b', 'x', 'y', 'z', 'w'], false), null);
});

test('summarizeRow gives the means, the splits, the short count, and the spread', () => {
  const r = summarizeRow('B20|opus', [
    { target: 'A', kind: 'rich', picks: six, seen: 20, cost: { tokens: 100, usd: 1 }, q: 0.5, x: null, hard_above: 2 },
    { target: 'B', kind: 'thin', picks: ['a', 'b', 'c'], seen: 30, cost: { tokens: 300, usd: 3 }, q: 1, x: 1, hard_above: 1 },
    { target: 'C', kind: 'thin', picks: [], seen: 10, cost: { tokens: 0, usd: 0 }, q: null, x: 0, hard_above: 0 },
  ], true);
  near(r.hard_above_mean, 1);
  assert.equal(r.hard_above_total, 3);
  assert.equal(r.unreliable, true);
  near(r.q_mean, 0.75);
  near(r.q_rich, 0.5);
  near(r.q_thin, 1);
  near(r.x_mean, 0.5);
  assert.equal(r.x_rich, null);
  near(r.x_thin, 0.5);
  assert.equal(r.short, 2);
  near(r.q_min, 0.5);
  near(r.q_max, 1);
  near(r.q_sd, 0.25);
  near(r.usd_mean, 4 / 3);
  near(r.seen_mean, 20);
});

test('summarizeRow skips a null hard_above, and gives null when every target is null', () => {
  const per = h => ({ target: 'A', kind: 'rich', picks: ['a'], seen: 10, cost: { tokens: 1, usd: 1 }, q: 1, x: null, hard_above: h });
  const some = summarizeRow('B|x', [per(2), per(null), per(4)]);
  near(some.hard_above_mean, 3);
  assert.equal(some.hard_above_total, 6);
  assert.equal(some.x_mean, null);
  const none = summarizeRow('A|x', [per(null), per(null)]);
  assert.equal(none.hard_above_mean, null);
  assert.equal(none.hard_above_total, null);
});

const row = (id, q, usd, unreliable = false, x = 0) => ({ id, q_mean: q, x_mean: x, usd_mean: usd, tokens_mean: usd * 1000, unreliable });

test('pickWinner: shortlist within 1/6 of Q*, cheapest is the candidate, unreliable rows left out', () => {
  const rows = [row('R1', 0.8, 1.0), row('R2', 0.7, 0.2), row('R3', 0.6, 0.05), row('R4', 0.9, 0.5, true)];
  const w = pickWinner(rows);
  near(w.qStar, 0.8);
  near(w.eStar, 0);
  assert.deepEqual(w.shortlist, ['R2', 'R1']);
  assert.deepEqual(w.excluded, ['R4']);
  assert.equal(w.candidate, 'R2');
  assert.equal(w.best, 'R1');
  assert.equal(w.next, null);
  const w2 = pickWinner([...rows, row('R5', 0.75, 0.3)]);
  assert.deepEqual(w2.shortlist, ['R2', 'R5', 'R1']);
  assert.equal(w2.next, 'R5');
});

test('pickWinner: a row with top quality but more than E* + 1 extras is left off the shortlist', () => {
  const rows = [row('Q1', 0.9, 1.0, false, 3), row('Q2', 0.8, 0.5, false, 1), row('Q3', 0.75, 0.1, false, 2.5), row('Q4', 0.5, 0.01, false, 0), row('Q5', 0.95, 0.02, true, 0)];
  const w = pickWinner(rows);
  near(w.qStar, 0.9);
  near(w.eStar, 0);
  assert.deepEqual(w.shortlist, ['Q2']);
  assert.deepEqual(w.excluded, ['Q5']);
  assert.equal(w.candidate, 'Q2');
  // The best-quality row goes to the blind check, though it is off the shortlist.
  assert.equal(w.best, 'Q1');
  assert.equal(w.next, null);
  assert.equal(w.blind_needed, true);
});

test('pickWinner: a set blind opponent replaces best, and the highest-Q row stays as best_quality', () => {
  const rows = [row('R1', 0.8, 1.0), row('R2', 0.7, 0.2), row('R3', 0.6, 0.05), row('R5', 0.75, 0.3)];
  const plain = pickWinner(rows);
  assert.equal(plain.best, 'R1');
  assert.equal(plain.best_quality, 'R1');
  const w = pickWinner(rows, { opponent: 'R5' });
  assert.equal(w.candidate, 'R2');
  assert.equal(w.best, 'R5');
  assert.equal(w.best_quality, 'R1');
  // Next skips the candidate and the opponent.
  assert.equal(w.next, 'R1');
  assert.equal(w.blind_needed, true);
  assert.throws(() => pickWinner(rows, { opponent: 'R9' }), /R9/);
});

// per: { target: picks }.
const rowP = (id, q, usd, per) => ({ ...row(id, q, usd), per: Object.entries(per).map(([target, picks]) => ({ target, picks })) });

test('pickWinner: a row with the same picks as the candidate or the best row on every target is not chosen as next', () => {
  const rows = [
    rowP('C1', 0.8, 0.1, { T1: ['a', 'b'], T2: ['c'] }),
    rowP('D1', 0.8, 0.2, { T1: ['b', 'a'], T2: ['c'] }),
    rowP('B2', 0.85, 0.3, { T1: ['a'], T2: ['d'] }),
    rowP('N1', 0.8, 0.5, { T1: ['a', 'b'], T2: ['e'] }),
    rowP('B1', 0.9, 1.0, { T1: ['a'], T2: ['d'] }),
  ];
  const w = pickWinner(rows);
  assert.equal(w.candidate, 'C1');
  assert.equal(w.best, 'B1');
  assert.equal(w.next, 'N1');
  assert.equal(w.blind_needed, true);
});

test('pickWinner: blind_needed is false when the candidate is the best row, has its picks, or is null', () => {
  const same = pickWinner([row('R1', 0.9, 0.1), row('R2', 0.8, 0.2)]);
  assert.equal(same.candidate, 'R1');
  assert.equal(same.best, 'R1');
  assert.equal(same.blind_needed, false);
  const twin = pickWinner([rowP('S1', 0.8, 0.1, { T1: ['a'] }), rowP('S2', 0.8, 0.5, { T1: ['a'] })]);
  assert.equal(twin.candidate, 'S1');
  assert.equal(twin.best, 'S1');
  assert.equal(twin.blind_needed, false);
  const dup = pickWinner([rowP('P1', 0.8, 0.1, { T1: ['a'] }), rowP('P2', 0.85, 0.5, { T1: ['a'] })]);
  assert.equal(dup.candidate, 'P1');
  assert.equal(dup.best, 'P2');
  assert.equal(dup.blind_needed, false);
  const empty = pickWinner([row('Q1', 0.9, 1.0, false, 3), row('Q4', 0.5, 0.01, false, 0)]);
  assert.equal(empty.candidate, null);
  assert.equal(empty.next, null);
  assert.equal(empty.blind_needed, false);
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/filter.test.mjs" "test/winner.test.mjs"`
Expected: FAIL with missing exports (`replayFilterB`, `costLine`, and the others).

- [ ] **Step 3: Add the filter-first replays to `lib/replay.mjs`**

Append to `EVAL/lib/replay.mjs`:

```js
export const survivors = (pool, p1) => pool.filter(key => !NOT_KEPT.has(p1[key] ?? 'unread'));

// The filter judges in batches of 10, so it pays for the whole batch that holds its last needed photo.
const roundUp = (n, len) => Math.min(len, Math.ceil(n / BATCH_A) * BATCH_A);

export function replayFilterB(pool, K, fP1, fCost, rank, line) {
  const surv = survivors(pool, fP1);
  const whole = K === 'all' || K > surv.length;
  const m = whole ? surv.length : K;
  const seen = whole || m === 0 ? pool.length : roundUp(pool.indexOf(surv[m - 1]) + 1, pool.length);
  const cost = add(sumCost(pool.slice(0, seen), fCost), m ? lineAt(line, m) : zero());
  const set = new Set(surv.slice(0, m));
  const picks = topOf(set, rank);
  return { picks, seen, ranked: m, cost, hardAbove: rankedHard(set, rank, picks) };
}

export function replayFilterC(pool, fP1, fCost, rank, line) {
  const surv = survivors(pool, fP1);
  if (!surv.length) return { picks: [], seen: pool.length, ranked: 0, cost: sumCost(pool, fCost), hardAbove: 0 };
  const r = replayC(surv, rank, line);
  const seen = r.seen >= surv.length ? pool.length : roundUp(pool.indexOf(surv[r.seen - 1]) + 1, pool.length);
  return { picks: r.picks, seen, ranked: r.seen, cost: add(sumCost(pool.slice(0, seen), fCost), r.cost), hardAbove: r.hardAbove };
}
```

- [ ] **Step 4: Add the scoring functions to `lib/score.mjs`**

Replace the first line of `EVAL/lib/score.mjs` (`import { KEEP } from './replay.mjs';`) with:

```js
import { KEEP, topOf } from './replay.mjs';
```

Append to `EVAL/lib/score.mjs`:

```js
// Owner ruling 2026-10-08: when the owner picked fewer than 6 and marked the target done, the picks are
// every photo the owner would show. Extras = kept photos not in the picks. A target with 0 picks counts.
// Null for a target with 6 picks, or with fewer than 6 and not done.
export function extras(picks, best, done) {
  if (best.length >= KEEP || done !== true) return null;
  const b = new Set(best);
  return picks.filter(key => !b.has(key)).length;
}

export const P3_LIMIT = 1;

const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

// points: one per P3 target: { n3, c3: { tokens, usd }, n2, c2: { tokens, usd } }.
export function costLine(points) {
  const fit = f => {
    const ls = points.filter(p => p.n2 !== p.n3).map(p => {
      const b = (p.c2[f] - p.c3[f]) / (p.n2 - p.n3);
      return { a: p.c3[f] - p.n3 * b, b };
    });
    return { a: mean(ls.map(l => l.a)), b: mean(ls.map(l => l.b)) };
  };
  return { tokens: fit('tokens'), usd: fit('usd') };
}

export function p3Diff(p3Rank, p2Rank, first12) {
  const set = new Set(first12);
  const a = topOf(set, p3Rank), b = topOf(set, p2Rank);
  return (a.filter(k => !b.includes(k)).length + b.filter(k => !a.includes(k)).length) / 2;
}

export function summarizeRow(id, per, unreliable = false) {
  const scored = per.filter(p => p.q != null);
  const q = scored.map(p => p.q);
  const m = mean(q);
  const xs = kind => per.filter(p => p.x != null && (!kind || p.kind === kind)).map(p => p.x);
  return {
    id, unreliable,
    q_mean: m,
    q_rich: mean(scored.filter(p => p.kind === 'rich').map(p => p.q)),
    q_thin: mean(scored.filter(p => p.kind === 'thin').map(p => p.q)),
    q_min: q.length ? Math.min(...q) : null,
    q_max: q.length ? Math.max(...q) : null,
    q_sd: q.length ? Math.sqrt(mean(q.map(x => (x - m) ** 2))) : null,
    // Extras: mean over the targets with an extras score (null x is skipped).
    x_mean: mean(xs()),
    x_rich: mean(xs('rich')),
    x_thin: mean(xs('thin')),
    short: per.filter(p => p.picks.length < KEEP).length,
    usd_mean: mean(per.map(p => p.cost.usd)),
    tokens_mean: mean(per.map(p => p.cost.tokens)),
    seen_mean: mean(per.map(p => p.seen)),
    // A null hard_above (method A) is skipped. When every target is null, both values are null.
    hard_above_mean: mean(per.filter(p => p.hard_above != null).map(p => p.hard_above)),
    hard_above_total: per.some(p => p.hard_above != null) ? per.reduce((s, p) => s + (p.hard_above ?? 0), 0) : null,
    per,
  };
}

// Q* = best mean quality; E* = lowest mean extras, both over the reliable rows.
// Shortlist: quality >= Q* - 1/6 (one photo) and extras <= E* + 1 (one photo per target).
// When no row has an extras score, E* is null and the extras test is skipped.
// best = the blind-check opponent: the cheapest row with quality Q*, or opts.opponent when it is set
// (owner ruling 2026-10-09, config.json blind_opponent). best_quality is always the cheapest row with Q*.
export function pickWinner(rows, opts = {}) {
  const ok = rows.filter(r => !r.unreliable && r.q_mean != null);
  const byCost = (a, b) => a.usd_mean - b.usd_mean || a.tokens_mean - b.tokens_mean || a.id.localeCompare(b.id);
  const qStar = Math.max(...ok.map(r => r.q_mean));
  const withX = ok.filter(r => r.x_mean != null);
  const eStar = withX.length ? Math.min(...withX.map(r => r.x_mean)) : null;
  const xOk = r => eStar == null || (r.x_mean != null && r.x_mean <= eStar + 1 + 1e-9);
  const short = ok.filter(r => r.q_mean >= qStar - 1 / 6 - 1e-9 && xOk(r)).sort(byCost);
  const bestQ = ok.filter(r => Math.abs(r.q_mean - qStar) < 1e-9).sort(byCost)[0];
  const best = opts.opponent ? rows.find(r => r.id === opts.opponent) : bestQ;
  if (!best) throw new Error(`blind opponent ${opts.opponent} is not a row`);
  // The two tests can leave the shortlist empty; then there is no candidate.
  const candidate = short[0] ?? null;
  // Next: skip rows that show the same sets as the candidate or the best row on every target
  // (for example C, when it sees the whole pool, keeps the same photos as B(all)).
  const isDup = (r, s) => r.id === s.id || samePicks(r, s);
  const next = short.find(r => !(candidate && isDup(r, candidate)) && !isDup(r, best)) ?? null;
  // No blind check when there is no candidate, or when the candidate shows the same sets as the best row.
  const blind_needed = candidate != null && !isDup(candidate, best);
  return {
    qStar, eStar, shortlist: short.map(r => r.id), excluded: rows.filter(r => r.unreliable).map(r => r.id),
    candidate: candidate ? candidate.id : null, best: best.id, best_quality: bestQ.id, next: next ? next.id : null, blind_needed,
  };
}

// True when two rows keep the same set of photos on every target. False when a row has no per-target picks.
function samePicks(a, b) {
  if (!a.per || !b.per || a.per.length !== b.per.length) return false;
  const of = r => new Map(r.per.map(p => [p.target, [...p.picks].sort().join('\n')]));
  const pa = of(a), pb = of(b);
  return [...pa].every(([t, k]) => pb.get(t) === k);
}
```

- [ ] **Step 5: Run all tests and see them pass**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/*.test.mjs"`
Expected: PASS, 75 tests.

- [ ] **Step 6: Write `analyze.mjs`**

Create `EVAL/analyze.mjs`:

```js
// node analyze.mjs  ->  out/table.json, out/table.md, out/shortlist.json
import path from 'node:path';
import fs from 'node:fs';
import { EVAL, readJson, writeJson } from './lib/data.mjs';
import { buildViews } from './lib/views.mjs';
import { replayA, replayB, replayC, replayFilterB, replayFilterC } from './lib/replay.mjs';
import { quality, extras, costLine, p3Diff, summarizeRow, pickWinner, P3_LIMIT } from './lib/score.mjs';
import { checkPicks } from './lib/picks.mjs';

const MODELS = ['opus', 'sonnet', 'haiku'], FILTERS = ['haiku', 'sonnet'], KS = [12, 20, 30, 'all'];
const config = readJson(path.join(EVAL, 'config.json'));
const pools = readJson(path.join(EVAL, 'pools.json'));
const picks = readJson(path.join(EVAL, 'picks.json'));
const bad = checkPicks(pools, picks);
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
const R = readJson(path.join(EVAL, 'runs/selection-eval-full/results.json'));
const T = readJson(path.join(EVAL, 'runs/selection-eval-full/tokens.json'));
const v = buildViews(R.jobs, T);
const tOf = name => pools.targets.find(t => t.target === name);

const lines = {}, p3 = {};
for (const m of MODELS) {
  lines[m] = costLine(pools.p3.map(t => ({ n3: v.p3Cost[m][t].n, c3: v.p3Cost[m][t], n2: v.p2Cost[m][t].n, c2: v.p2Cost[m][t] })));
  const diffs = pools.p3.map(t => p3Diff(v.p3[m][t], v.p2[m][t], tOf(t).photos.slice(0, 12).map(p => p.key)));
  const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  p3[m] = { diffs, mean, unreliable: mean > P3_LIMIT };
  if (lines[m].tokens.a < 0 || lines[m].usd.a < 0) console.log(`note: the cost line of ${m} has a negative a`);
}

const small = K => K !== 'all' && K <= 20;
const methods = [];
for (const m of MODELS) {
  methods.push({ id: `A|${m}`, unreliable: false, run: (pool, t) => replayA(pool, v.p1[m], v.p1Cost[m]) });
  for (const K of KS) methods.push({ id: `B${K}|${m}`, unreliable: p3[m].unreliable && small(K), run: (pool, t) => replayB(pool, K, v.p2[m][t], lines[m]) });
  methods.push({ id: `C|${m}`, unreliable: p3[m].unreliable, run: (pool, t) => replayC(pool, v.p2[m][t], lines[m]) });
}
for (const f of FILTERS) for (const m of MODELS) {
  for (const K of KS) methods.push({ id: `F${f}>B${K}|${m}`, unreliable: p3[m].unreliable && small(K), run: (pool, t) => replayFilterB(pool, K, v.p1[f], v.p1Cost[f], v.p2[m][t], lines[m]) });
  methods.push({ id: `F${f}>C|${m}`, unreliable: p3[m].unreliable, run: (pool, t) => replayFilterC(pool, v.p1[f], v.p1Cost[f], v.p2[m][t], lines[m]) });
}

const rows = methods.map(meth => summarizeRow(meth.id, pools.targets.map(t => {
  const r = meth.run(t.photos.map(p => p.key), t.target);
  const own = picks.targets[t.target];
  return { target: t.target, kind: t.kind, picks: r.picks, seen: r.seen, cost: r.cost, q: quality(r.picks, own.picks), x: extras(r.picks, own.picks, own.done), hard_above: r.hardAbove };
}), meth.unreliable));
// Owner ruling 2026-10-09: config.json blind_opponent sets the blind-check opponent (shortlist.json best).
const win = pickWinner(rows, { opponent: config.blind_opponent });

// Report data only (the winner rule does not use it).
// B(all): the real P2 USD per target, next to the cost-line USD. The line is fitted from 3 P3 targets.
const p2Real = m => pools.targets.reduce((s, t) => s + v.p2Cost[m][t.target].usd, 0) / pools.targets.length;
const costLineVsP2 = {};
for (const r of rows) {
  const m = r.id.split('|')[1];
  if (r.id === `Ball|${m}`) {
    r.usd_p2_real = p2Real(m);
    costLineVsP2[m] = { line_usd: r.usd_mean, p2_usd: r.usd_p2_real, over: r.usd_mean / r.usd_p2_real - 1 };
  }
  // A real C run calls the ranker once per batch of 12, so the cost line at the photos seen is a lower bound.
  if (/(^|>)C\|/.test(r.id)) r.cost_lower_bound = true;
}

writeJson(path.join(EVAL, 'out/table.json'), { lines, p3, cost_line_vs_p2: costLineVsP2, unread: v.unread, problems: v.problems, rows });
writeJson(path.join(EVAL, 'out/shortlist.json'), win);

const f = (x, d = 2) => (x == null ? '-' : x.toFixed(d));
const pct = x => `${Math.round(x * 100)}%`;
const tags = r => [r.unreliable ? 'P3: unreliable' : '', win.shortlist.includes(r.id) ? 'shortlist' : '', r.id === win.candidate ? 'candidate' : '', r.id === win.best_quality ? 'best quality' : '', r.id === win.best ? 'blind opponent' : '', r.cost_lower_bound ? 'cost is a lower bound' : ''].filter(Boolean).join(', ');
const md = [
  'Row IDs: `A` stop at 6 good; `B<K>` rank the first K; `C` adaptive batches of 12; `F<filter>>` the filter model drops its P1 rejects first. After `|`: the judge or ranker model. Every method keeps `good` photos only. "Q" is the share of the owner\'s picks kept, over the targets with at least 1 pick. "E" (extras) is the number of kept photos not in the picks, over the targets where the owner picked fewer than 6 and marked done (a target with 0 picks counts). "Hard above" is the number of `hard` photos placed above the sixth kept photo (or the last kept photo when fewer than 6), summed over the 10 targets. It is `n/a` for method A, which has no ranking.',
  '',
  `Q* ${f(win.qStar)}, E* ${f(win.eStar)}. Shortlist: Q >= Q* - 1/6 and E <= E* + 1, P3-reliable rows only. Blind check needed: ${win.blind_needed ? 'yes' : 'no'}. Blind opponent: ${win.best}${config.blind_opponent ? ' (set in config.json)' : ''}. Best quality: ${win.best_quality}.`,
  '',
  `Cost line against the real P2 cost (B(all), USD per target): ${Object.entries(costLineVsP2).map(([m, c]) => `${m} ${f(c.line_usd, 4)} against ${f(c.p2_usd, 4)} (${pct(c.over)} above)`).join('; ')}. The line is fitted from the 3 P3 targets, so it runs above the real P2 cost. C's cost is a lower bound: a real C run calls the ranker once per batch of 12, and the line prices one call at the photos seen.`,
  '',
  '| method | Q | E | Q rich | Q thin | E rich | E thin | under 6 | Q min-max (sd) | hard above | photos seen | tokens per target | USD per target | real P2 USD per target | note |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...[...rows].sort((a, b) => (b.q_mean ?? -1) - (a.q_mean ?? -1) || a.usd_mean - b.usd_mean)
    .map(r => `| ${r.id} | ${f(r.q_mean)} | ${f(r.x_mean)} | ${f(r.q_rich)} | ${f(r.q_thin)} | ${f(r.x_rich)} | ${f(r.x_thin)} | ${r.short} | ${f(r.q_min)}-${f(r.q_max)} (${f(r.q_sd)}) | ${r.hard_above_total ?? 'n/a'} | ${f(r.seen_mean, 1)} | ${Math.round(r.tokens_mean)} | ${f(r.usd_mean, 4)} | ${f(r.usd_p2_real, 4)} | ${tags(r)} |`),
  '',
];
fs.writeFileSync(path.join(EVAL, 'out/table.md'), md.join('\n'));
console.log(`rows ${rows.length} | Q* ${f(win.qStar)} | E* ${f(win.eStar)} | shortlist ${win.shortlist.length} | candidate ${win.candidate} | best_quality ${win.best_quality} | opponent ${win.best} | next ${win.next} | blind_needed ${win.blind_needed}`);
console.log('cost line above real P2 (B(all)):', Object.entries(costLineVsP2).map(([m, c]) => `${m} ${pct(c.over)}`).join(', '));
console.log('P3 mean difference:', MODELS.map(m => `${m} ${f(p3[m].mean)}${p3[m].unreliable ? ' (unreliable)' : ''}`).join(', '));
```

- [ ] **Step 7: Run the replay**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node analyze.mjs`
Expected: `rows 48 | Q* <value> | E* <value> | shortlist <n> | candidate <id> | best_quality <id> | opponent <id> | next <id or null> | blind_needed <true or false>`, one line with the cost line against the real P2 cost, and one P3 line.

Read `EVAL/out/table.md`. Check: 48 rows; every `Q` is between 0 and 1; every `A` row has a `photos seen` that is a multiple of 10 or a pool size; every `B12` row has `photos seen` 12; every USD value is above 0 (a negative `a` can make a small-K value low; when a value is negative, write it in `NOTES.md`).

- [ ] **Step 8: Record progress**

Add to `EVAL/NOTES.md`: the date, `Task 5 done`, the console output of Step 7, and the cost line of each model.

---

### Task 6: OWNER CHECKPOINT, blind check

Blocked by: Task 5.

The owner compares the candidate's 6 photos with the blind opponent's 6 photos (`shortlist.json` `best`: the best-quality method, or `config.json` `blind_opponent` when it is set) for each target, without names, in a random order per target. The candidate wins unless the owner prefers the other set on more targets than the candidate's set. "Same" does not count. When the candidate loses, the next-cheapest shortlist row gets one more round against the best-quality method. When that row also loses, or there is no such row, the best-quality method wins.

Rules pinned in this task:

- When `shortlist.json` `blind_needed` is false, there is no blind check. The candidate wins; when there is no candidate (an empty shortlist), the opponent wins.
- A target where the two sets hold the same photos is "same" without a question to the owner.
- Left and right come from `mulberry32(seed + round)`, one draw per shown target, in pool order.

**Files:**
- Modify: `EVAL/lib/score.mjs` (add `blindOutcome`)
- Create: `EVAL/blind.mjs`, `EVAL/blind.html`
- Test: `EVAL/test/blind.test.mjs`
- Output: `EVAL/blind-public.json`, `EVAL/blind-r<N>.json` (written by the page), `EVAL/out/blind-key-r<N>.json`, `EVAL/out/blind-result-r<N>.json`, `EVAL/out/winner.json`

**Interfaces:**
- Consumes: `out/table.json` and `out/shortlist.json` (Task 5); `server.mjs` (Task 1), which already serves `/blind`, `/blind-public.json`, and `/blind-answers`; `mulberry32` (Task 1).
- Produces: `blindOutcome(answers, key) -> { cand, other, same, candidateWins }`; `out/winner.json`: `{ winner, decided_in_round, qStar, candidate, best, next }`.

- [ ] **Step 1: Write the failing test**

Create `EVAL/test/blind.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blindOutcome } from '../lib/score.mjs';

const key = {
  candidate: 'R2', other: 'R1', auto_same: ['T5'],
  sides: { T1: { L: 'R2', R: 'R1' }, T2: { L: 'R1', R: 'R2' }, T3: { L: 'R2', R: 'R1' }, T4: { L: 'R1', R: 'R2' } },
};

test('a tie goes to the candidate, and auto-same targets count as same', () => {
  const o = blindOutcome({ T1: 'L', T2: 'L', T3: 'same', T4: 'same' }, key);
  assert.deepEqual(o, { cand: 1, other: 1, same: 3, candidateWins: true });
});

test('the candidate loses when the other set wins more targets', () => {
  const o = blindOutcome({ T1: 'R', T2: 'L', T3: 'L', T4: 'L' }, key);
  assert.deepEqual(o, { cand: 1, other: 3, same: 1, candidateWins: false });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/blind.test.mjs"`
Expected: FAIL with a missing export `blindOutcome`.

- [ ] **Step 3: Add `blindOutcome` to `lib/score.mjs`**

Append to `EVAL/lib/score.mjs`:

```js
// answers: { target: 'L' | 'R' | 'same' }. key.sides: { target: { L: rowId, R: rowId } }.
export function blindOutcome(answers, key) {
  let cand = 0, other = 0, same = (key.auto_same ?? []).length;
  for (const t of Object.keys(key.sides)) {
    const a = answers[t];
    if (a === 'same') same++;
    else if (key.sides[t][a] === key.candidate) cand++;
    else if (a === 'L' || a === 'R') other++;
  }
  return { cand, other, same, candidateWins: !(other > cand) };
}
```

- [ ] **Step 4: Run all tests and see them pass**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/*.test.mjs"`
Expected: PASS, 77 tests.

- [ ] **Step 5: Write `blind.mjs` and `blind.html`**

Create `EVAL/blind.mjs`:

```js
// node blind.mjs --round 1          builds round 1 (candidate against best quality)
// node blind.mjs --round 2          builds round 2 (next-cheapest against best quality)
// node blind.mjs --score <round>    scores a round from blind-r<round>.json
import path from 'node:path';
import { EVAL, readJson, writeJson } from './lib/data.mjs';
import { mulberry32 } from './lib/seed.mjs';
import { blindOutcome } from './lib/score.mjs';

const args = process.argv.slice(2);
const scoring = args.includes('--score');
const round = Number(args[args.indexOf(scoring ? '--score' : '--round') + 1]);
const config = readJson(path.join(EVAL, 'config.json'));
const pools = readJson(path.join(EVAL, 'pools.json'));
const table = readJson(path.join(EVAL, 'out/table.json'));
const sl = readJson(path.join(EVAL, 'out/shortlist.json'));
const picksOf = (id, t) => table.rows.find(r => r.id === id).per.find(p => p.target === t).picks;
const decide = (winner, r) => {
  writeJson(path.join(EVAL, 'out/winner.json'), { winner, decided_in_round: r, qStar: sl.qStar, candidate: sl.candidate, best: sl.best, best_quality: sl.best_quality, next: sl.next, blind_needed: sl.blind_needed });
  console.log(`winner: ${winner} (round ${r})`);
};

if (!scoring) {
  // No blind check: the candidate keeps the opponent's sets, or there is no candidate.
  if (round === 1 && !sl.blind_needed) { decide(sl.candidate ?? sl.best, 0); process.exit(0); }
  const challenger = round === 1 ? sl.candidate : sl.next;
  if (!challenger) throw new Error(`round ${round}: no row to check`);
  const rng = mulberry32(config.seed + round);
  const sides = {}, auto_same = [], targets = [];
  for (const t of pools.targets) {
    const a = picksOf(challenger, t.target), b = picksOf(sl.best, t.target);
    if (a.length === b.length && a.every(k => b.includes(k))) { auto_same.push(t.target); continue; }
    sides[t.target] = rng() < 0.5 ? { L: challenger, R: sl.best } : { L: sl.best, R: challenger };
    const asPhotos = id => picksOf(id, t.target).map(key => ({ key, n: Number(key.split('-').pop()) }));
    targets.push({ target: t.target, species: t.species, L: asPhotos(sides[t.target].L), R: asPhotos(sides[t.target].R) });
  }
  writeJson(path.join(EVAL, 'blind-public.json'), { round, targets });
  writeJson(path.join(EVAL, `out/blind-key-r${round}.json`), { round, candidate: challenger, other: sl.best, sides, auto_same });
  console.log(`round ${round}: ${targets.length} targets to show, ${auto_same.length} same without a question`);
} else {
  const key = readJson(path.join(EVAL, `out/blind-key-r${round}.json`));
  const answers = readJson(path.join(EVAL, `blind-r${round}.json`)).answers ?? {};
  const missing = Object.keys(key.sides).filter(t => !answers[t]);
  if (missing.length) { console.error(`no answer for: ${missing.join(', ')}`); process.exit(1); }
  const o = blindOutcome(answers, key);
  writeJson(path.join(EVAL, `out/blind-result-r${round}.json`), { round, challenger: key.candidate, opponent: key.other, ...o });
  console.log(`round ${round}: ${key.candidate} ${o.cand}, ${key.other} ${o.other}, same ${o.same}`);
  if (o.candidateWins) decide(key.candidate, round);
  else if (round === 1 && sl.next) console.log('the candidate lost: run round 2 with --round 2');
  else decide(sl.best, round);
}
```

Create `EVAL/blind.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blind set check</title>
<style>
body { font: 15px system-ui, sans-serif; margin: 16px; background: #faf8f2; color: #222; }
header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.sets { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 800px) { .sets { grid-template-columns: 1fr; } }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.grid div { display: block; background: #eee; }
.grid img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
button { font-size: 15px; padding: 6px 14px; }
button.on { background: #c60; color: #fff; }
#status { color: #666; }
</style>
</head>
<body>
<header><select id="target"></select><span id="species"></span><span id="status"></span></header>
<p>Each tree shows two sets of photos. Pick the set that is better for learning this leaf, or "Same" when neither set is better. Each photo shows at the size that the app shows a learner.</p>
<div class="sets">
  <section><h2>Set 1</h2><div class="grid" id="L"></div></section>
  <section><h2>Set 2</h2><div class="grid" id="R"></div></section>
</div>
<p>
  <button data-a="L">Set 1 is better</button>
  <button data-a="same">Same</button>
  <button data-a="R">Set 2 is better</button>
</p>
<script>
let pub, ans, cur;
const $ = id => document.getElementById(id);
async function save() {
  $('status').textContent = 'saving...';
  const r = await fetch('/blind-answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ans) });
  $('status').textContent = r.ok ? `saved (${Object.keys(ans.answers).length} of ${pub.targets.length} answered)` : 'SAVE FAILED: ' + await r.text();
}
function fill(id, photos) {
  $(id).replaceChildren(...photos.map(p => {
    const a = document.createElement('div');
    a.innerHTML = `<img src="/app/${cur.target}/${p.n}.jpg" alt="">`;
    return a;
  }));
}
function draw() {
  $('species').textContent = cur.species || '';
  fill('L', cur.L); fill('R', cur.R);
  for (const b of document.querySelectorAll('button[data-a]')) b.className = ans.answers[cur.target] === b.dataset.a ? 'on' : '';
}
for (const b of document.querySelectorAll('button[data-a]')) b.onclick = async () => {
  ans.answers[cur.target] = b.dataset.a;
  draw();
  await save();
  const i = pub.targets.indexOf(cur);
  if (i + 1 < pub.targets.length) { $('target').selectedIndex = i + 1; cur = pub.targets[i + 1]; draw(); scrollTo(0, 0); }
};
$('target').onchange = () => { cur = pub.targets[$('target').selectedIndex]; draw(); };
(async () => {
  pub = await (await fetch('/blind-public.json')).json();
  const old = await (await fetch('/blind-answers')).json();
  ans = old.round === pub.round && old.answers ? old : { round: pub.round, answers: {} };
  $('target').replaceChildren(...pub.targets.map((t, i) => new Option(`${i + 1}. ${t.target}`)));
  cur = pub.targets[0];
  draw();
})();
</script>
</body>
</html>
```

The page shows no method name, and `blind-public.json` holds no row ID. The server never serves `out/`.

- [ ] **Step 6: Build round 1**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node blind.mjs --round 1`
Expected: either `winner: <id> (round 0)` (`blind_needed` is false; go to Step 10), or `round 1: <n> targets to show, <m> same without a question`.

Read `EVAL/blind-public.json` and check that it holds no row ID (no `|` character and no `opus`, `sonnet`, or `haiku`).

- [ ] **Step 7: Run the blind page with the owner**

Start the server in the background: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node server.mjs`. Open `http://127.0.0.1:8770/blind` once yourself to check that it loads, and do not answer.

Send the owner:

> The blind check is at http://127.0.0.1:8770/blind. For each tree it shows two sets of photos. Pick the set that is better for learning this leaf, or "Same" when neither set is better. The page goes to the next tree after each answer, and each answer saves. Tell me when every tree has an answer.

- [ ] **Step 8: Score round 1**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node blind.mjs --score 1`
Expected: `round 1: <candidate> <a>, <best> <b>, same <c>`, then `winner: ...` or `the candidate lost: run round 2 with --round 2`. When it lists targets with no answer, ask the owner to answer them, and run the score again.

- [ ] **Step 9: Round 2, only when the candidate lost and a next row exists**

Run `node blind.mjs --round 2`. The server reads the round from `blind-public.json` on each request, so it needs no restart. Send the owner the text of Step 7 again, with "a second round" in it. Then run `node blind.mjs --score 2`. Expected: `winner: <id> (round 2)`. There is no round 3.

- [ ] **Step 10: Stop the server and record progress**

Stop the server by port 8770. Add to `EVAL/NOTES.md`: the date, `Task 6 done`, each round result line, and the content of `out/winner.json`.

---

### Task 7: report.md and a draft decision note

Blocked by: Task 6.

A script writes the report and the draft from the files of Tasks 1 to 6. The draft stays in `EVAL`. It is not put in `docs/decisions/`. After the owner rules, a separate pull request adds the note to `docs/decisions/` and changes the photo-check skill. That pull request is not part of this plan.

**Files:**
- Create: `EVAL/lib/describe.mjs`, `EVAL/report.mjs`
- Test: `EVAL/test/describe.test.mjs`
- Output: `EVAL/report.md`, `EVAL/decision-draft.md`

**Interfaces:**
- Consumes: `pools.json`, `picks.json`, `out/table.json`, `out/table.md`, `out/shortlist.json`, `out/winner.json`, `out/blind-result-r<N>.json` (`{ round, challenger, opponent, cand, other, same, candidateWins }`), `runs/selection-eval-full/*`, `runs/selection-eval-tracer/tokens.json`.
- Produces: `describe(rowId) -> string` (plain words for a row ID); `report.md`; `decision-draft.md`.

- [ ] **Step 1: Write the failing test**

Create `EVAL/test/describe.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe } from '../lib/describe.mjs';

test('describe turns row IDs into plain words', () => {
  assert.equal(describe('A|opus'), 'judge the fetched photos one at a time with Opus 5.5, in batches of 10, and stop at 6 good photos');
  assert.equal(describe('B20|sonnet'), 'rank the first 20 fetched photos with Sonnet 5.5 and keep the top 6');
  assert.equal(describe('Ball|haiku'), 'rank all fetched photos with Haiku 5.5 and keep the top 6');
  assert.equal(describe('C|opus'), 'rank 12 more fetched photos at a time with Opus 5.5, and stop when it holds 6 good photos and the top 6 does not change');
  assert.equal(describe('Fhaiku>C|opus'), 'Haiku 5.5 drops its rejects first, one photo at a time; then rank 12 more kept photos at a time with Opus 5.5, and stop when it holds 6 good photos and the top 6 does not change');
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/describe.test.mjs"`
Expected: FAIL with `Cannot find module` for `../lib/describe.mjs`.

- [ ] **Step 3: Write `lib/describe.mjs`**

Create `EVAL/lib/describe.mjs`:

```js
const NAMES = { opus: 'Opus 5.5', sonnet: 'Sonnet 5.5', haiku: 'Haiku 5.5' };

export function describe(id) {
  const [method, model] = id.split('|');
  const who = NAMES[model];
  const inner = m => {
    if (m === 'A') return `judge the fetched photos one at a time with ${who}, in batches of 10, and stop at 6 good photos`;
    if (m === 'C') return `rank 12 more fetched photos at a time with ${who}, and stop when it holds 6 good photos and the top 6 does not change`;
    const K = m.slice(1);
    return K === 'all' ? `rank all fetched photos with ${who} and keep the top 6` : `rank the first ${K} fetched photos with ${who} and keep the top 6`;
  };
  const f = method.match(/^F(haiku|sonnet)>(.+)$/);
  return f ? `${NAMES[f[1]]} drops its rejects first, one photo at a time; then ${inner(f[2]).replace('fetched photos', 'kept photos')}` : inner(method);
}
```

- [ ] **Step 4: Run all tests and see them pass**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node --test "test/*.test.mjs"`
Expected: PASS, 78 tests.

- [ ] **Step 5: Write `report.mjs`**

Create `EVAL/report.mjs`:

```js
// node report.mjs  ->  report.md and decision-draft.md
import fs from 'node:fs';
import path from 'node:path';
import { EVAL, readJson } from './lib/data.mjs';
import { describe } from './lib/describe.mjs';

const J = p => readJson(path.join(EVAL, p));
const pools = J('pools.json'), picks = J('picks.json'), table = J('out/table.json'), sl = J('out/shortlist.json'), winner = J('out/winner.json');
const R = J('runs/selection-eval-full/results.json'), T = J('runs/selection-eval-full/tokens.json'), T0 = J('runs/selection-eval-tracer/tokens.json');
const blind = [1, 2].map(r => path.join(EVAL, `out/blind-result-r${r}.json`)).filter(f => fs.existsSync(f)).map(f => readJson(f));
const f = (x, d = 2) => (x == null ? '-' : Number(x).toFixed(d));
const rowOf = id => table.rows.find(r => r.id === id);
const w = rowOf(winner.winner), best = rowOf(sl.best_quality), opponent = rowOf(sl.best), today = rowOf('A|opus');
const withPicks = pools.targets.filter(t => picks.targets[t.target].picks.length).length;
const costText = r => `${f(r.usd_mean, 4)} USD and ${Math.round(r.tokens_mean)} tokens per target`;
const blindText = blind.length
  ? blind.map(b => `round ${b.round}: ${b.challenger} preferred on ${b.cand} targets, ${b.opponent} preferred on ${b.other}, same on ${b.same}; ${b.candidateWins ? `${b.challenger} wins` : `${b.challenger} loses`}`).join('. ')
  : 'not needed, because the candidate keeps the same photos as the blind opponent, or there is no candidate';
const today_date = new Date().toISOString().slice(0, 10);
const effortText = ['opus', 'sonnet', 'haiku'].map(m => `${m} ${[...new Set(R.jobs.filter(j => j.model === m).map(j => j.effort))].join('+')}`).join(', ');

const agg = {};
for (const j of R.jobs) {
  const k = `${j.pass} | ${j.model}`, s = T[j.label];
  agg[k] ??= { agents: 0, failed: 0, input: 0, cw5m: 0, cw1h: 0, cread: 0, output: 0, usd: 0 };
  agg[k].agents++;
  if (j.result == null) agg[k].failed++;
  for (const x of ['input', 'cw5m', 'cw1h', 'cread', 'output', 'usd']) agg[k][x] += s?.[x] ?? 0;
}

const LIMITS = [
  'The owner saw some of these photos in the label rounds of 2026-09-29 and 2026-09-30. That can raise the agreement for methods that keep those photos.',
  '10 targets give a rough answer. A gap of less than 1 photo in 6 between two methods is a tie, not a win.',
  'Each judge call ran once. A second run of the same model can give other verdicts and rankings.',
  'The cost line of each model rests on 3 targets. B and C at small K read the line far from the P2 point.',
  'The replay of B and C cuts one full P2 ranking down to the photos seen. A real run ranks only those photos. P3 tests this shortcut on 3 targets only.',
  'Token counts come from the agent transcripts, not from a bill. Prices are the rates of the claude-api skill of 2026-10-06. Haiku 5.5 uses a higher rate card above 100K prompt tokens in one request; the price uses the card of each request.',
  `All judges ran at one fixed effort level per model (${effortText}). Effort, image size, sheet size, and batch size belong to issue #22.`,
  'The pools drop rows with the same file_hash as an earlier row of the target. A crop or a resize of the same photo has another hash and stays in the pool. The judges did not get the duplicate rule of the photo-check skill.',
  'B, C, and filter-first take the good or hard tag from the ranking pass itself. The other option, the tag from the same model\'s P1 verdict, would add P1 to their cost. The owner can choose it instead.',
  'A thin target has fewer than 6 good leaf photos in its pool under the old verdicts, which use the rules from before PR #34.',
  'Failed agents and photos that did not open count as rejects. Their counts are under "Unread and failed photos".',
  'Rows marked unreliable by the P3 check are in the table, but not in Q* or the shortlist.',
];

const out = [
  '# Selection-method eval for leaf photos: report', '',
  `Date: ${today_date}. Spec: docs/superpowers/specs/2026-10-07-selection-method-eval-design.md. Plan: docs/superpowers/plans/2026-10-07-selection-method-eval.md. Progress log: NOTES.md.`, '',
  '## Result', '',
  `- Winner: \`${w.id}\`: ${describe(w.id)}. Quality ${f(w.q_mean)} (rich ${f(w.q_rich)}, thin ${f(w.q_thin)}). Cost ${costText(w)}. Hard photos above the last kept photo: ${w.hard_above_total ?? 'n/a (no ranking)'} over ${pools.targets.length} targets.`,
  `- Best quality (Q*): \`${best.id}\` at ${f(sl.qStar)}. Cost ${costText(best)}.`,
  `- Blind opponent: \`${opponent.id}\`, quality ${f(opponent.q_mean)}, extras ${f(opponent.x_mean)}. Cost ${costText(opponent)}.`,
  `- Shortlist (within 1/6 of Q* and within 1 extra photo per target of E*), cheapest first: ${sl.shortlist.map(id => `\`${id}\``).join(', ')}.`,
  `- Blind check: ${blindText}.`,
  `- Today's method for comparison, \`A|opus\`: quality ${f(today.q_mean)}, cost ${costText(today)}.`, '',
  '## Targets', '',
  '| target | run | kind | pool | old good leaf | owner picks | P3 |', '|---|---|---|---|---|---|---|',
  ...pools.targets.map(t => `| ${t.target} | ${t.run} | ${t.kind} | ${t.photos.length} | ${t.good_old} | ${picks.targets[t.target].picks.length} | ${pools.p3.includes(t.target) ? 'yes' : ''} |`), '',
  `Seed ${pools.seed}. ${pools.eligible.length} targets had a pool of 24 or more photos.`, '',
  '## Rows dropped from the pools', '',
  'A fetched row hinted `leaf` or with no hint leaves the pool when it has a fetch error, no `file_hash`, no local file, or the same `file_hash` as an earlier row of its target.', '',
  '| reason | all targets of both runs | the 10 targets |', '|---|---|---|',
  ...[...new Set([...Object.keys(pools.dropped_counts), ...pools.targets.flatMap(t => t.dropped.map(d => d.reason))])].map(reason =>
    `| ${reason} | ${pools.dropped_counts[reason] ?? 0} | ${pools.targets.flatMap(t => t.dropped).filter(d => d.reason === reason).length} |`),
  ...(Object.keys(pools.dropped_counts).length ? [] : ['| none | 0 | 0 |']), '',
  '## Judge passes', '',
  `P0 model check (tracer): ${['opus', 'sonnet', 'haiku'].map(m => `${m} ran ${(T0[`P0:${m}`]?.models ?? []).join('+')}`).join('; ')}; the short name \`haiku\` ran ${(T0['P0:haiku-alias']?.models ?? []).join('+') || 'nothing'} (a check only).`, '',
  `Effort per model (from the job list in the run record): ${effortText}.`, '',
  '| pass and model | agents | failed | input | cache write 5 min | cache write 1 h | cache read | output | USD |', '|---|---|---|---|---|---|---|---|---|',
  ...Object.entries(agg).map(([k, a]) => `| ${k} | ${a.agents} | ${a.failed} | ${a.input} | ${a.cw5m} | ${a.cw1h} | ${a.cread} | ${a.output} | ${f(a.usd)} |`), '',
  '## Cost lines and the P3 check', '',
  '| model | a (tokens) | b (tokens per photo) | a (USD) | b (USD per photo) | P3 differences | P3 mean | marked unreliable |', '|---|---|---|---|---|---|---|---|',
  ...Object.keys(table.lines).map(m => `| ${m} | ${Math.round(table.lines[m].tokens.a)} | ${Math.round(table.lines[m].tokens.b)} | ${f(table.lines[m].usd.a, 4)} | ${f(table.lines[m].usd.b, 5)} | ${table.p3[m].diffs.join(', ')} | ${f(table.p3[m].mean)} | ${table.p3[m].unreliable ? 'yes' : 'no'} |`), '',
  '## Unread and failed photos', '',
  ...['P1', 'P2', 'P3'].map(p => `- ${p}: ${Object.entries(table.unread[p] ?? {}).map(([m, n]) => `${m} ${n}`).join(', ') || 'none'}.`),
  `- Failed agents: ${R.jobs.filter(j => j.result == null).length} of ${R.jobs.length}.`, '',
  '## Methods', '',
  fs.readFileSync(path.join(EVAL, 'out/table.md'), 'utf8'),
  '## Limits', '',
  ...LIMITS.map((l, i) => `${i + 1}. ${l}`), '',
];
fs.writeFileSync(path.join(EVAL, 'report.md'), out.join('\n'));

const job = w.id.startsWith('A|') ? 'a verdict on one photo'
  : w.id.startsWith('F') ? 'a verdict on one photo (the filter) and a ranking of a contact sheet (the ranker)'
  : 'a ranking of a contact sheet';
const draft = [
  '# Leaf photo selection method', '',
  `Date: ${today_date}. Status: DRAFT. The owner has not ruled. After the ruling, a pull request copies this note into docs/decisions/.`, '',
  '## Ruling asked for', '',
  `Content runs pick the leaf photos of a target this way: ${describe(w.id)}.`, '',
  '## Evidence', '',
  '- Report: `.superpowers/2026-10-07-selection-eval/report.md` (git-ignored). Spec: `docs/superpowers/specs/2026-10-07-selection-method-eval-design.md`.',
  `- Quality: the method kept ${f(w.q_mean)} of the owner's best 6 photos, mean over the ${withPicks} targets with picks. The best method (\`${best.id}\`) kept ${f(sl.qStar)}.`,
  `- Cost: ${costText(w)}. Today's method (stop at 6 good, Opus 5.5): ${costText(today)}.`,
  `- Blind check: ${blindText}.`,
  '- Limits: see the Limits section of the report.', '',
  '## What changes after the ruling', '',
  '- A separate pull request changes the photo-check skill. "Stop at 6 good photos" gives way to the method above.',
  `- Issue #22 tunes the judge for this job: ${job}.`, '',
];
fs.writeFileSync(path.join(EVAL, 'decision-draft.md'), draft.join('\n'));
console.log(`wrote report.md and decision-draft.md | winner ${w.id}`);
```

- [ ] **Step 6: Write the report and the draft**

Run: `cd /c/Users/jdennen/Dendro/.superpowers/2026-10-07-selection-eval && node report.mjs`
Expected: `wrote report.md and decision-draft.md | winner <id>`.

- [ ] **Step 7: Check the report**

Read `EVAL/report.md` once against the writing rules of the user's CLAUDE.md (STE, flat register). Check:
- every section of the spec's `report.md` row is there: the table, the shortlist, the blind-check result, and the limits;
- the rich and thin split, the count of targets under 6, the spread, and the "hard above" count are in the methods table;
- the section "Rows dropped from the pools" gives the count per reason (expected: `duplicate_hash` 1 over all targets);
- the known bias is the first limit;
- no number is `NaN` or `undefined`.

Fix a wording problem in `report.mjs`, not in `report.md`, and run Step 6 again.

- [ ] **Step 8: Give the result to the owner**

Send the owner the `## Result` section of `report.md`, the path of `report.md`, and the path of `decision-draft.md`. Say that the draft goes into `docs/decisions/` only after the owner rules, through a separate pull request that also changes the photo-check skill.

- [ ] **Step 9: Record progress**

Add to `EVAL/NOTES.md`: the date, `Task 7 done`, the winner, and `waiting for the owner's ruling`.

---

## Self-review

Checked against the spec on 2026-10-08.

**Spec coverage**

| Spec part | Where |
|---|---|
| Goal, owner calls 1-6 | Task 3 (best-6 picks), Task 6 (blind check), Task 2 (10 targets, 6 rich, 4 thin), Task 1 and 2 (pools from existing runs, no fetch), Task 1 P0 and Task 4 (3 models, full IDs, never Haiku 4.5), Task 1 and 4 (judges in workflows; the rest is scripts or owner clicks) |
| Facts: fetch order, blocks per target | `buildTargets` and its test (Task 1) |
| Targets: fixed seed, thin definition | `chooseTargets` (Task 2), `config.json` seed |
| Pool: leaf or no hint, file order, no manual rows | `fetchedLeaf`, `inPool` and their tests (Task 1) |
| Pool: first row of each `file_hash`; drop no hash and fetch error; record each drop and reason | `splitPool` and its 2 tests (Task 1); `dropped` and `dropped_counts` in `pools.json` |
| P2 and P3: each ranked photo tagged `good` or `hard` | `briefRank` step 5, `SCHEMAS.RANK`, `buildViews` tag parsing and their tests (Task 1) |
| B, C, filter-first keep the top 6 `good` | `topOf`, `replayB`, `replayC` tests (Task 1); `replayFilterB/C` test (Task 5) |
| Report: hard photos above the sixth kept photo; dropped rows per reason | `hardAbove` (Task 1, 5), "hard above" column in `out/table.md`, "Rows dropped from the pools" in `report.md` (Task 7) |
| Best-6 picks page: grid at app size, order, fewer than 6, photos only | `pick.html`, `server.mjs` (Task 1), Task 3 |
| Blind check: two sets, random order, no names, "same" | `blind.mjs`, `blind.html` (Task 6) |
| Known bias in the report | `report.mjs` limit 1 (Task 7) |
| P0 model check from the transcript | Task 1 Steps 21-23, `collect.mjs` model check |
| P1 batches of 10, fresh agent per batch, Quality checks | `buildJobs`, `briefP1`, `extractQuality` (Task 1), Task 4 |
| P2 contact sheets 3 x 3 (sheets only, no photo opened), ranked list and rejects | `renderSheet`, `briefRank`, `SCHEMAS.RANK` (Task 1), Task 4 |
| P3 first 12 photos on 3 targets, all 3 models | `buildJobs` full plan (Task 1), `chooseTargets` P3 pick (Task 2), Task 4 |
| Image size, tiles per sheet, batch size fixed | Global Constraints; `TILE`, `PER_SHEET`, batch 10 in `buildJobs` |
| Tokens per agent: input, cache, output, per target and pass | `lib/tokens.mjs`, `collect.mjs` (Task 1); `check-run.mjs` (Task 4); report table (Task 7) |
| Failed agent or file: no verdict, marked, a reject, counted | `buildViews` unread counts, `NOT_KEPT`; report section "Unread and failed photos" |
| Methods A, B(K), C | `replayA`, `replayB`, `replayC` with tests (Task 1) |
| Filter first with Haiku or Sonnet, any ranker | `replayFilterB`, `replayFilterC` with tests (Task 5), `analyze.mjs` |
| Cost line from P3 and P2 | `costLine` with test (Task 5) |
| P3 reliability mark | `p3Diff`, `P3_LIMIT`, `analyze.mjs` (Task 5) |
| Quality score, fewer than 6 picks | `quality` with test (Task 1); a target with 0 picks has no quality score |
| Extras score (owner ruling 2026-10-08) | `extras` with 3 tests, `summarizeRow` `x_mean`, `x_rich`, `x_thin` (Task 5), `out/table.md` |
| Also reported: rich and thin, under 6, spread | `summarizeRow` (Task 5), `out/table.md` |
| Winner steps 1-5 | `pickWinner` (Task 5), `blind.mjs` and `blindOutcome` (Task 6) |
| Eval in the git-ignored folder, no pipeline code | Global Constraints |
| Decision note after the ruling | Task 7 draft; the move to `docs/decisions/` is a separate pull request |
| Workflow size approved by the owner | Task 4 Step 3 |
| Fairness | Global Constraints; Task 3 and Task 4 Step 4; `pick-public.json` and `blind-public.json` checks |

**Interpretations that the spec does not fix.** Each one is in the code and in a test:

1. Thin is counted on the pool rows, not on all fetched rows. `ACPS` is thin under this count (4) and rich under the other (7).
2. A target needs a pool of 24 or more photos to be eligible. This takes out the 5 manual-only targets, and `PLHI` after the identity ruling.
2a. A variety or subspecies name is one with the PLANTS binomial plus one more word, with or without `var.`, `subsp.`, or `ssp.` (`isInfraOf`). The PLANTS name comes from `content/species.json` `scientific`.
3. Filter-first: B and C run on the survivors in fetch order. The filter pays for whole batches of 10.
4. The P3 mark covers B(12), B(20), and C, also as filter-first rankers. Marked rows stay out of Q* and the shortlist.
5. P1 `escalate` (sepia) counts as not kept, like `reject`.
6. When `blind_needed` is false (the candidate keeps the opponent's sets, or there is no candidate), there is no blind check. A target with the same 6 photos in both sets is "same" without a question. After a lost round 2, the best-quality method wins.
7. The quality mean leaves out a target where the owner picked no photo.
8. A pool drop has a fourth reason, `no_local`, as a guard; no row has it today.
9. A ranked photo with a missing or wrong tag counts as `hard`, and `buildViews` lists it as a problem. A sepia or tinted photo goes in a ranking's `rejects`.
10. "Hard above" is 0 when a ranked method keeps no photo. Method A has no ranking: "hard above" is `n/a` and is skipped in means and totals.
11. The pick page shows each target's photos in a seeded random order (`pick_seed`), not fetch order.
12. Every judge runs at an explicit effort (`high`) from `config.json`, not at the session effort.

**Owner rulings of 2026-10-08** (in the code and tests):

1. A fetched row with `identity_match: false` leaves the pool as `wrong_species`, unless it names a variety or subspecies of the target's PLANTS name, or a name in `config.json` `same_species` (`QUMA13`: `Quercus margaretiae`). The PLANTS name is the display name. `PLHI` (11 photos) drops out of the eligible targets; the draw is in the facts list.
2. Rows that the P3 check marks unreliable stay out of Q* and the shortlist. The report shows them in the table, marked "P3: unreliable".
3. Method C stops only when it holds 6 `good` photos and a new batch does not change the top 6, or when the pool runs out.
4. Extras: on a target where the owner picked fewer than 6 and marked it done, the picks are every photo the owner would show, and each other kept photo is an extra. E* is the lowest mean extras. The shortlist needs quality within 1/6 of Q* and extras within 1 of E*. A target with 0 picks has no quality score, but it has an extras score.
5. (2026-10-09) The blind opponent for this run is `Fhaiku>Ball|opus` (`config.json` `blind_opponent`). `shortlist.json` `best` is the opponent, and `best_quality` is the highest-Q row. `next` skips a row with the same sets as the candidate or the opponent. Q* and E* use only P3-reliable rows.

**Facts that differ from the spec**

1. The 10 pools hold 473 photos (eligible pools: mean 47.2, range 33-60), not about 400. Task 4 is 195 agents, not about 160.
2. A run record of 2026-09-26 shows that `model: 'sonnet'` ran `claude-sonnet-5`. The short names may not mean the 5.5 models. This plan passes full model IDs, and Task 1 P0 checks them.
3. The workflow-authoring skill does not document per-agent token counts. The spec's "run record or transcript" is right: the run record holds a single `tokens` number that does not match the transcript sums, so the plan uses the transcripts.

**Placeholder scan.** No step says "TBD", "add error handling", or "similar to". Every code step shows the code. Values in angle brackets (`<runId>`, `<record path>`, `<date>`) are values that exist only at run time.

**Name check.** `buildViews`, `replayA/B/C`, `replayFilterB/C`, `topOf`, `lineAt`, `quality`, `extras`, `costLine`, `p3Diff`, `summarizeRow`, `pickWinner`, `blindOutcome`, `checkPicks`, `buildJobs`, `renderScript`, `messagesFrom`, `sumMessages`, `describe` keep the same names and arguments in every task that uses them. `splitPool`, `isInfraOf`, `pickOrder`, `cutOf`, and `hardAbove` also keep their names. Test totals: 53 (Task 1), 56 (Task 2), 75 (Task 5), 77 (Task 6), 78 (Task 7).

Updated 2026-10-08 for the spec change of commit f02bc8f (duplicate rows dropped from the pools; a `hard` tag on ranked photos), the review fixes (owner yes before the tracer, explicit effort, seeded pick order, short-name P0 check, unread check, NOTES hold), and the three owner rulings above.








