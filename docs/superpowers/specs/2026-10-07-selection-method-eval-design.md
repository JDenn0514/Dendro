# Selection-method eval for leaf photos: design

Date: 2026-10-07. Status: design approved by the owner in conversation, spec not yet reviewed. Updated 2026-10-08 after an architecture review: a `hard` tag on ranked photos, and duplicate rows dropped from the pools.

## Goal

Choose how a content run picks the leaf photos it publishes. The owner runs content runs often, so the cheapest method that keeps photo quality pays off many times. The eval compares methods on two numbers: tokens (and price-weighted cost) and image quality.

This eval comes before the judge-cost eval in issue #22. The method decides the judge's job (a verdict on one photo, or a ranking of a contact sheet), and #22 then tunes the judge for that job.

The photo-check skill keeps "stop at 6 good photos" until this eval picks a method.

## Owner calls (2026-10-07)

1. Quality is scored against the owner's best-6 picks, with a blind set check at the end.
2. 10 leaf targets: about 6 with many good photos and 4 thin ones.
3. The winner is the cheapest method within 1 photo of the best quality, and it must survive the blind check.
4. The pools come from existing runs. No new fetch.
5. Three judge models are tested: Opus 5.5, Sonnet 5.5, and Haiku 5.5 (`claude-haiku-5-5`). Haiku 4.5 is not used. Agents get full model IDs, because the short name `sonnet` ran Sonnet 5 in a run on 2026-09-26.
6. The judge passes run as workflows. Everything else is scripts or owner clicks.
7. (2026-10-08) Rows that the source flags as another species are dropped from the pools, unless they are a variety or subspecies of the target.
8. (2026-10-08) A B or C result that P3 marks unreliable shows in the report, but it cannot enter the shortlist.
9. (2026-10-08) Method C keeps going while it holds fewer than 6 good photos.

## Facts this design rests on

- The fetch caps a target at 60 rows per run (`MAX_PER_SPECIES`, `pipeline/lib/candidates.ts:185`). Only `photos add` rows go past it.
- In `candidates.jsonl`, file order within a target is fetch order. `photosFetch` (`pipeline/lib/commands.ts:380-466`) builds rows per target, and `collect` (`candidates.ts:254`) keeps their order. A file can hold more than one block for a target, so group by target and keep file order.
- The source turn order of 2026-09-25 (`TURN_ORDER`, `commands.ts:200,406-411`) applies to runs `simple_lobed_us` and `simple_lobed_us_add`. Older runs used another order. The files of the two top-up runs of 2026-10-01 are no longer on disk.
- Those two runs fetched leaf, bark, and fruit, so a target has 24-60 leaf rows (mean 47 for the 10 targets).
- The existing verdicts use the rules from before PR #34. Every photo is judged again.
- In `simple_lobed_us`, 5 pairs of fetched rows share a target and a `file_hash`. `simple_lobed_us_add` has none. The 16 rows with no `file_hash` are all manual rows (counted 2026-10-08).
- The validator does not count a `hard` photo as in play (`inPlay`, `app/logic/content.js:38`). A method must tag `hard`, or a run publishes wrong counts.
- No token log exists. The "20M tokens" for run `simple_lobed_us` (issue #22) is an estimate of about 2,670 looks at about 7.5k tokens each.
- Reusable tools are in `.superpowers/2026-09-30-photo-labels/`: `label-r3/images.mjs` (1,200 px copies with sharp), `label-r3/server.mjs` and `index.html` (a local labelling page), and `an2/sheet.mjs` (contact sheets with sharp `composite`).
- Prices per 1M tokens, input / output: Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50 (claude-api skill, cached 2026-10-06).

## Part 1: pools and owner work

### Targets

- 10 leaf targets from `simple_lobed_us` and `simple_lobed_us_add`, chosen with a fixed seed.
- 6 rich targets and 4 thin ones. A thin target has fewer than 6 good leaf photos among its pool rows, under the old verdicts.

### The pool for each target

- The fetched rows hinted `leaf` or with no hint, in file order.
- Manual rows from `photos add` are left out, because a real judge does not see them in the first pass.
- Within each target, only the first row of each `file_hash` stays, in file order. Rows with no `file_hash`, or with `fetch_error` set, are dropped. A row with `identity_match: false` is dropped, unless its species is a variety or subspecies of the target. For example, 13 of the 24 PLHI rows are *Platanus orientalis* and drop out. The target's name comes from its PLANTS name. `pools.json` records each dropped row and the reason.
- 24-60 photos per target, about 470 in all, before duplicates are dropped.

### Best-6 picks

- One page per target shows the whole pool as a grid. Any photo opens at full size.
- The owner clicks the best 6, in order. When fewer than 6 are usable, the owner picks fewer.
- The page shows photos only, with no agent verdict.

### Blind check

- For each target, the sets of the two finalist methods show side by side, in random order, with no names.
- The owner picks the better set, or "same".

### Known bias

The owner saw some of these photos in the label rounds of 2026-09-29 and 2026-09-30. The report says so.

## Part 2: judge passes

Every judge call happens once. The methods are then replayed from the results, so a new variant costs no new tokens.

| Pass | Models | What it does | Covers |
|---|---|---|---|
| P0, model check | Opus, Sonnet, Haiku | A smoke test on 2 photos. It confirms from each agent's transcript which model ran. The Agent tool's `haiku` name must mean Haiku 5.5. | 2 photos |
| P1, one photo at a time | Opus, Sonnet, Haiku | Judges each photo in fetch order under the Quality checks of the photo-check skill: reject, hard, or good. Batches of 10, a fresh agent per batch. | All ~470 photos, once per model |
| P2, ranking | Opus, Sonnet, Haiku | One agent per target sees the whole pool as 3×3 contact sheets, and can open any photo at full size. It returns a ranked list of the photos it keeps, each tagged `good` or `hard` under the same Quality checks as P1, and a list of rejects. | 10 targets, once per model |
| P3, small-pool ranking | Opus, Sonnet, Haiku | Ranks only the first 12 photos of a target, with the same output as P2. It checks that a ranking of 12 matches the full ranking cut to 12, and it gives the second point for the cost line in Part 3. | 3 targets |

- Image size, tiles per sheet, and batch size stay as they are today. Tuning them is the work of #22.
- Each agent's input, cache, and output tokens are recorded per target and per pass.
- Rough size: P1 is about 3M tokens per model, mostly input. P2 and P3 add less than 1M in all.
- When an agent fails or a file does not open, the photo gets no verdict and is marked. The replay treats it as a reject, and the report counts these photos.

## Part 3: methods, scores, and the winner

### Methods

Each method runs once per judge model.

| Method | How it runs in the replay | Its cost |
|---|---|---|
| A, stop at 6 good | Walk the pool in fetch order, 10 photos at a time, with the model's P1 verdicts. Stop after the batch that brings the count of good photos to 6. Keep the first 6 good photos. | P1 tokens of the photos it saw |
| B, collect K, rank, keep 6 | Take the first K photos in fetch order, with K = 12, 20, 30, or all. Drop the model's rejects, order the rest by its P2 ranking, and keep the top 6 photos tagged `good`. | Ranking cost for K photos |
| C, adaptive batches | Add 12 photos at a time, and keep the top 6 `good` photos of all photos seen so far. Stop when it holds 6 good photos and a new batch does not change them, or when the pool runs out. | Ranking cost for the photos it saw |
| Filter first | The P1 rejects of Haiku or Sonnet drop out first. Then B or C runs on the rest, with any model as the ranker. | The filter's P1 cost, plus the ranker's cost on the rest |

The ranking cost for K photos is a straight line per model, fitted from P3 (12 photos) and P2 (the whole pool).

The replay of B and C cuts the full P2 ranking down to the photos seen. P3 tests that shortcut. When the P3 top 6 differs from the cut-down P2 top 6 by more than 1 photo on average, the report marks the B and C results at small K as unreliable for that model. A marked result cannot enter the shortlist.

### Scores

- **Quality:** of the 6 photos a method keeps, how many are in the owner's best 6, averaged over the 10 targets. When the owner picked fewer than 6, the score counts against that smaller number.
- **Cost:** tokens, and price-weighted cost at the rates above, per target.
- **Also reported:** rich and thin targets apart, the number of targets that end with fewer than 6 photos, the spread from target to target, the number of `hard` photos each method and model ranks above its sixth kept photo, and the rows dropped from the pools for each reason.

All methods keep `good` photos only, so they follow one rule. The `hard` tag of B and C comes from the ranking pass itself. The other option, the tag from the same model's P1 verdict, would add P1 to the cost of B and C. The owner can choose it instead.

### The winner

1. Find the best average quality, Q*.
2. Shortlist every method within 1 photo of Q*.
3. The cheapest method on the shortlist, by price-weighted cost, is the candidate.
4. The blind check compares the candidate with the best-quality method on all 10 targets. The candidate wins unless the owner prefers the other set on more targets than the candidate's set. Ties do not count.
5. When the candidate loses, the next-cheapest method on the shortlist gets one more blind check.

10 targets give a rough answer. A gap of less than 1 photo in 6 between two methods is a tie, not a win.

## Part 4: where it lives and the order of work

### Location

- This spec is in the repo, on branch `feat/selection-eval`.
- The eval work is in the git-ignored folder `.superpowers/2026-10-07-selection-eval/`: pools, images, picks, verdicts, transcripts, and scripts. The eval adds no code to the pipeline.
- After the owner rules on the result, a decision note goes in `docs/decisions/`, and a separate pull request changes the photo-check skill.

### Parts

| Part | Job |
|---|---|
| `pools.mjs` | Picks the 10 targets with a fixed seed. Writes `pools.json`, each target's photos in fetch order with file paths. Makes 1,200 px copies with the label-round image script. |
| Pick page and blind page | A local server on 127.0.0.1, as in the label rounds. The pick page saves `picks.json`. The blind page saves `blind.json`. |
| Judge prompts | P1 uses the Quality checks of the merged photo-check skill. P2 and P3 add the ranking task: the best leaf is one petiole laid flat, and photos are ranked against each other. |
| Judge runs | Workflows, one model per agent. P0 runs first as a small workflow. P1, P2, and P3 then run as one workflow. Each agent returns its verdicts or ranking in a fixed JSON shape, so judges need no Bash. A script sums each agent's tokens from its run record or transcript. |
| `replay.mjs` | A pure script. Input: the pools, verdicts, rankings, token counts, and picks. Output: the table of methods by model. It has unit tests on a small made-up pool, run with `node --test`. |
| `report.md` | The table, the shortlist, the blind-check result, and the limits. |

### Workflow size

P0-P3 are about 190 agents: P1 alone is about 48 batches × 3 models. The session guideline keeps a workflow under 10 agents, so the owner approves the size before the run.

### Fairness

- The judges never see the owner's picks.
- The owner never sees the judges' verdicts or rankings before picking.

### Order of work

1. Pools and images.
2. The owner's 10 pick pages. In parallel: P0, then P1, P2, and P3.
3. The replay, then the shortlist.
4. The owner's blind check.
5. The report, then the owner's ruling.

## Out of scope

- Image size, sheet size, batch size, and effort level. These belong to #22.
- Bark and fruit. The first version of the app is leaf only (`docs/decisions/2026-09-30-leaf-only-v1.md`).
- A new fetch, and the fetch fixes in issue #23.
- Changes to the photo-check skill before the owner rules.
