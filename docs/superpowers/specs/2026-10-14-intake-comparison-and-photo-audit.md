# Photo intake comparison and audit of existing photos: design

Date: 2026-10-14. Status: draft for the owner's review. No code is written and no eval has run.

## Goal

1. Pick the photo intake method that agrees best with the owner on two calls: keep or drop, and the difficulty step. The method must also fill a quota at each step at a cost the owner accepts.
2. Use the picked method to audit the photos already in the manifest. Many photos that passed the old rules may fail the new ones. The owner makes the final call on each flagged photo.

## Owner decisions this design rests on

- `DESIGN.md` section 18 and `docs/decisions/2026-10-09-learning-model.md`:
  - Each photo gets a difficulty step from 1 to 3 at intake. 1: the feature shows alone and whole. 2: the feature is clear, among other things. 3: the learner must search, or the feature is not typical.
  - Each part has its own list of features. The judge marks which features a photo shows clearly. The code computes the step from those marks.
  - Intake fills a quota at each step. This replaces "Stop at 6 good photos".
  - Several intake methods get a close comparison before one is picked.
- `docs/decisions/2026-10-09-v1-parts-and-teach-first.md`: bark and fruit come back for the first version. A leaf photo with a scale object (a hand, a ruler, or a coin) is a better photo. "Size can be judged" joins the leaf feature list.
- `docs/decisions/2026-10-09-learning-path.md`:
  - The step measures only how hard the features are to read. It does not change with the season. An autumn leaf can be step 1.
  - Each part has a usual look: green leaves, ripe fruit, and bark that is the same all year. Photos of the usual look come first.
  - A young leaf that has not reached its full shape is step 3. A full-shape unripe fruit gets its step from clarity alone, and it is not the usual look.
  - Leaf arrangement counts as visible only when the photo shows where the leaf stalks join the twig.
  - A fruit photo must show how the fruit hangs when a card depends on it.
  - A colour line on a page must agree with the photos next to it.
  - An unusual angle, and light or shadow that changes the colour, make a photo harder.
- The owner's note on the 2026-10-11 review: bark that is too close lacks context ("It's too close to be a plain step 1").
- The owner is a learner (memory, 2026-09-29). The owner's labels judge learner clarity: keep, and step. They are not ground truth for botany: stage, species, or ripeness. Those come from the source page and the judge.
- Agents never retire photos. The owner decides on review sheets (owner, 2026-09-25).
- `CLAUDE.md`: the manifest changes only through the CLI. IDs are append-only. Retire a published row, never delete it.

## Facts this design rests on

### The manifest today

- `content/images/manifest.json` has 2,257 rows. 31 are retired, so 2,226 are active: leaf 1,253, bark 548, fruit 425.
- The active rows cover 80 targets (58 species and 22 concept targets) and 194 pairs of target and part. Per pair, leaf has 5 to 52 rows (median 17), bark 1 to 26 (median 7), and fruit 2 to 18 (median 6).
- Every row has `hash`, `target`, `channel`, `source`, `author`, `license`, `origin`, `tags`, `checked_by`, `checked_at`, and `note`. Optional fields: `difficulty`, `retired`, `retired_reason`, `retired_at`.
- `difficulty` has one value, `hard` (`DIFFICULTIES`, `pipeline/lib/manifest.ts:28` and `app/logic/content.js:33`). The app holds back a `hard` row (`inPlay`, `app/logic/content.js:38`). The validator refuses any other value (`content.js:222`).
- 650 active rows are `hard`: leaf 385, bark 196, fruit 69. The app hides all of them today.
- The build gives a new row `difficulty: "hard"` when its approve verdict has the `hard` tag (`publishApproved`, `pipeline/lib/manifest.ts:136`). A build never changes the difficulty of a row already in the manifest (`manifest.ts:118`). Only `images difficulty <hash> --set hard | --clear` changes it (`pipeline/lib/commands.ts:1383`).
- A verdict row (`pipeline/lib/verdicts.ts`) has a kind (`approve`, `reject`, or `escalate`), a channel, tags, a case, and a note. It has no step, feature, or usual-look field.
- Season is a tag (`spring`, `summer`, `autumn`, `winter`). Most bark and fruit rows have no season tag (`DESIGN.md` section 18).

### The answer key

The owner's picks of 2026-10-11 are in `prototype/photo-review/photo-picks-2026-10-11.json`. The review data is in `prototype/photo-review/data.js`. An agent wrote a suggested step, features, stage, season, scale, usual look, and a reason for each photo. The owner then set keep, step, usual look, and a note. Counts from a script that joins the two files:

- 211 photos: 7 species (ACRU, ACSA3, QUAL, QURU, LITU, PLOC, PLHI) times leaf, bark, and fruit. That is 21 pairs of 5 to 12 photos.
- 170 photos are published. 41 are not: 29 from outside the run's channels, 8 unjudged, and 4 surplus.
- The owner kept 164 and dropped 47.
- On the 164 kept photos, the owner's step equals the suggestion on 149 (91%). It is within one step on all 164.
- The suggestions were 62 at step 1, 78 at step 2, and 71 at step 3. The owner kept all 62 at step 1. The owner dropped 3 at step 2, and 44 of the 71 at step 3.
- On every kept photo, the owner's usual look equals the agent's.
- The owner dropped 39 of the 170 published photos (23%): leaf 12 of 66, bark 17 of 54, and fruit 10 of 50. Of the 131 published photos the owner kept, 24 are at step 3.
- 11 photos have a scale object (hand 7, ruler 3, person 1). The owner kept all 10 with a hand or a ruler.
- The common reasons for a drop: the feature is small or far away; a view up the trunk into the crown; light that changes the colour; dead or fallen leaves; young samaras without formed wings; fruit that is breaking apart.

The key has one weak point. The owner saw the suggested step and kept it on 91% of photos. A score against this key rewards a judge that agrees with the agent that wrote the suggestions. The key cannot show how far that agent is from a blind owner. A blind held-out set fixes this (see "The sample").

### A first test of a step rule

The `features` field in `data.js` lists the features that a photo shows. It has no mark for "alone and whole" or for the causes that make a photo harder. Three rules were tested on the 164 kept photos:

| Rule | Exact step | Within one |
|---|---|---|
| Features only: all key features and 3 or more features is step 1, all key features is step 2, else step 3 | 56% | 99% |
| Features, plus marks guessed from words in the reason text ("alone", "fills the frame", "among", "search", "distance", "angle", "light", "young") | 65% (leaf 72%, bark 67%, fruit 56%) | 99% |
| The agent's own suggested step | 91% | 100% |

Result: a list of features is not enough to compute the step. The judge must also mark whether the subject is alone and whole, and which causes make it harder. The rule below adds those marks. It can be tested only on judge output that has them, so phase 2 tests it.

### The paused selection-method eval

The eval is on draft PR #35. Its spec is `.claude/worktrees/selection-eval/docs/superpowers/specs/2026-10-07-selection-method-eval-design.md`. Its ledger is `.claude/worktrees/selection-eval/.superpowers/sdd/2026-10-07-selection-method-eval/progress.md`. Its files are in the git-ignored folder `.superpowers/2026-10-07-selection-eval/`.

- It judged 473 leaf photos of 10 targets under the old rules, at 440 px, with effort high.
- It ran 195 agents with no failures. It cost USD 17.56: Opus 11.09, Sonnet 6.01, Haiku 0.46. The estimate before the run was USD 43.
- Cost per photo, one photo at a time in batches of 10 (pass P1): Opus USD 0.0177, Sonnet 0.0096, Haiku 0.00074.
- Cost of a ranking from contact sheets (pass P2), for n photos: Opus 0.0945 + 0.00374 n, Sonnet 0.0584 + 0.00180 n, Haiku 0.0036 + 0.000144 n (USD).
- The `haiku` alias ran `claude-haiku-5-5` in every job.
- Sonnet failed to read 3 photos. Opus and Haiku read all of them.
- The rankers tagged few photos `good`: 20 to 24 of 473.
- Method C (adaptive batches) seldom stopped early. It saw about 47 photos per target.
- A ranking of 12 photos matched the full ranking cut to 12 (mean difference 0.33 photos or less).
- The blind check, round 1: Haiku ranking alone won 1 target, a Haiku reject pass then an Opus ranking won 3, and 6 were the same.

## Part 1: what the judge returns

### The feature list for each part

| Part | Key features | Other features |
|---|---|---|
| Leaf | shape, margin | venation, arrangement, size |
| Bark | texture, pattern | colour |
| Fruit | type, shape | hang, wing (samaras), cap (acorns) |

- The key features set the step. The other features only tell a card or a page what the photo can show.
- The leaf and bark lists are from `DESIGN.md` section 18. The fruit list is a proposal from the `data.js` review. The decision record leaves it open (open question 2).
- `arrangement` is `clear` only when the photo shows where the leaf stalks join the twig.
- `hang` is `clear` only when the photo shows how the fruit hangs or sits on the twig. A fruit held in a hand usually gets `no`.
- `size` is `clear` only when a scale object is in the frame.

### The fields

The judge returns one JSON object for each photo. The fields match the v1 data model of `DESIGN.md` section 18.

| Field | Values | Note |
|---|---|---|
| `part` | `leaf`, `bark`, `fruit`, `other` | The judge sets it from the photo, as the channel today. `other` is a reject. |
| `features` | for each feature of the part: `clear`, `search`, or `no` | `search`: a learner finds it only with a search. |
| `whole` | true or false | The key subject shows in full: one whole leaf outline, the whole fruit, or a bark area wide enough to show the pattern repeat. |
| `alone` | true or false | The subject is the main thing in the frame. Nothing near it competes, or the background is plain or soft. |
| `context` | true or false, bark only | The frame shows more than texture: a trunk edge, a branch, or a scale object. |
| `causes` | zero or more of `young`, `damaged`, `atypical`, `angle`, `light` | The things that make a photo harder, other than framing. |
| `scale` | `hand`, `ruler`, `coin`, `person`, `other`, or `none` | A scale object is a plus. It never makes the step harder. |
| `season` | `spring`, `summer`, `autumn`, `winter`, or `any` | From what the photo shows, not the photo date. Bark is usually `any`. |
| `stage` | leaf: `young`, `mature`, `autumn`; fruit: `young`, `unripe`, `ripe`, `after_seed_fall`; bark: `young`, `mature`, `old` | From the photo and the source page. |
| `usual_look` | true or false | Green mature leaves, ripe fruit, and mature bark are the usual look. |
| `reject` | zero or more reasons from a fixed list | The 10 reject checks of the photo-check skill, plus `feature_not_found`. |
| `escalate` | `mismatch`, `license`, `quality`, or none | The three cases of the photo-check skill do not change. |
| `note` | one or two sentences | What the judge saw, and the reason for each mark that lowers the step. |

The causes mean:

- `young`: a leaf or a fruit that has not reached its full shape.
- `damaged`: holes, galls, or tears that change the outline.
- `atypical`: a form that is not the typical one, such as a broken fruit ball or an uncommon leaf form.
- `angle`: an unusual angle, such as a view from below or a top view of a fruit.
- `light`: light or shadow that changes the colour, such as warm low sun, flash, deep shade, or backlight.

The `hard` tag goes away. The old hard checks map onto these marks:

| Old hard check | New mark |
|---|---|
| Crowded leaves | `alone: false`, or a key feature at `search` |
| The feature is small in the frame | a key feature at `search` |
| Soft photo, edges traceable | a key feature at `search` |
| Tilted leaf | `angle` |
| The frame edge cuts off part of the leaf | `whole: false` |
| A young form | `young` for a leaf; `stage: unripe` and `usual_look: false` for a full-shape fruit |
| A fruit not in its typical form | `atypical` |
| Autumn colour | `stage: autumn` and `usual_look: false`. It no longer changes the step. |
| Bark from a distance | a key feature at `search` |
| Backlight or deep shade | `light` |

### How the code computes keep and step

The judge never returns a step. A pure function computes it from the marks. The proposed rule:

1. **Reject** when any of these is true:
   - `reject` is not empty, or `part` is `other`;
   - a key feature is `no`;
   - a key feature is `search`, and `causes` is not empty.
2. **Step 3** when a key feature is `search`, or `causes` is not empty.
3. **Step 1** when every key feature is `clear`, `whole` and `alone` are true, and for bark `context` is true.
4. **Step 2** in every other case.

Notes on the rule:

- The last reject line is the least certain part. The owner kept 27 and dropped 44 of the 71 photos that the agent put at step 3, and their reasons overlap. Phase 2 tests this line against those 71 photos. It also tests the other choice: keep every step 3 photo, and let the quota cut the extra ones.
- Season does not enter the rule. `usual_look` decides when a photo appears, not its step.
- Scale does not enter the rule. It decides the order within a step: a photo with a scale object ranks first.
- The rule is code, so a change costs no new judge tokens. Phase 2 replays every variant of the rule from the stored marks.

### Where the fields go

The manifest row gets new optional fields: `step`, `usual_look`, `season`, `stage`, `features` (the features marked `clear`), `scale`, and `rules` (the version of the rules, such as `2026-10`). The plan fixes the exact names. The `features` and `causes` marks of each photo stay in the verdict files and the audit results.

`difficulty: "hard"` stays as it is until the app reads `step`. Reason: the app hides `hard` rows today. Clearing `hard` on a step 3 photo would show it in today's app before the app knows about steps. A later change removes the `hard` value (open question 4).

## Part 2: the methods to compare

### Methods

Every judge call happens once. The methods then replay from the stored results, as in the selection-method eval. A new variant of a method costs no new tokens.

| Method | How it runs | Its cost |
|---|---|---|
| S, single pass, stop at quota | Walk the pool in fetch order, 10 photos at a time. The judge marks each photo, and the code computes keep and step. Stop when every step's quota is full, or the pool runs out. Keep the first photos in fetch order at each step. | The judge's cost for the photos seen |
| F, reject pass first | Haiku marks every photo with the same schema. Its rejects drop out. The main judge marks the rest, in fetch order, and stops at the quota. | Haiku's cost, plus the main judge's cost for the photos it sees |
| R, collect K, rank in each step | The judge marks the first K photos (K = 20, 30, or all). The code computes the steps. A ranking agent orders the photos of each step from contact sheets only (owner ruling 2026-10-08). Keep the top photos of each step up to the quota. The ranking prefers the usual look, then a scale object, then the whole subject. | The judge's cost for K photos, plus the ranking cost |

- Judge models: Opus 5.5, Sonnet 5.5, and Haiku 5.5 (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`). Agents get the full model IDs.
- The reject pass uses Haiku only. Sonnet costs about half of Opus per photo, so a Sonnet reject pass saves little.
- Method C of the old eval (adaptive batches) is dropped. It seldom stopped early, so it cost the same as "collect all".
- Quotas tested in the replay: 2, 2, and 1 for steps 1, 2, and 3; and 3, 3, and 2. The replay is free, so more quotas can be added.

### Prompt variants

- **V1, checklist.** The prompt asks one question for each feature and each cause, in a fixed order, as the Quality checks of the photo-check skill do today.
- **V2, describe first.** The judge first writes two or three sentences on what the photo shows. It then answers the same checklist. V2 costs more output tokens.

Both variants have the same rules and the same JSON schema. Image size (440 px), batch size (10), and effort (high) stay as in the old eval. Tuning them is the work of issue #22.

When neither variant passes the gates, a third variant adds a reference sheet with two example photos for each step. The examples come from species outside the key and the held-out set.

### The sample

- **The key:** all 211 photos of the 2026-10-11 review. It measures the agreement on keep, step, and usual look, one photo at a time. Its pools are small (5 to 12 photos per pair) and mostly published photos, so it cannot test the quota fill.
- **The held-out set:** the full fetch-order pools of 3 species that are not in the key, from run `simple_lobed_us`. Proposal: PLRA, QULA, and QUAU, because their pools have the most rows hinted bark or fruit (24, 17, and 17). The pools mix all parts, as a real fetch does, so the judge sets the part. That is 208 photos after duplicates drop out (PLRA 82, QULA 70, QUAU 56).
  - The owner labels each photo blind, with no suggestion shown: part, keep, step, and usual look. The page is the 2026-10-11 review page with the suggestions hidden.
  - The step rule and the prompts are frozen before the held-out set is judged.
  - The held-out set measures the agreement with no anchor, the quota fill, and the cost per kept photo.
- **The feature check (optional):** 60 photos from the key, with one yes or no question per feature, in learner words. Examples: "Can you see where the leaf stalks join the twig?", "Can you see how the fruit hangs?", "Is there a hand, a ruler, or a coin?". These questions are about what a learner sees, not botany. The check takes the owner about 10 minutes.

### Metrics

| Metric | How it is measured | Where |
|---|---|---|
| Keep agreement | The share of photos where the method's keep equals the owner's | key, held-out |
| Drop recall | The share of the owner's drops that the method rejects | key, held-out |
| Step, exact and within one | On photos that both keep | key, held-out |
| Usual look | The share of kept photos where the method agrees with the owner | key (secondary, because the owner kept the agent's value on every photo) |
| Feature marks | Agreement with the owner's yes or no answers; agreement between the three models | feature check |
| Repeat agreement | The same judge on the same photos twice. The owner's own repeat agreement was 80% in label round 3. | key, leading variant only |
| Cost | Tokens, and price-weighted USD, per photo judged and per kept photo | key, held-out |
| Quota fill | The share of species, part, and step cells that the method fills, and the photos judged to fill them | held-out |
| Time | Wall-clock minutes per 100 photos, from the workflow run record | all runs |

The owner's species doubts are not in the scores. Stage and species are not scored against the owner.

### The decision rule

1. **Gates on the key.** Drop recall 80% or more, keep agreement 85% or more, exact step 80% or more, and within one step 97% or more.
2. **Shortlist.** Find the best exact step among the methods that pass the gates. Shortlist every method within 5 points of that best, on exact step and on keep agreement. On 164 kept photos, 5 points is about 8 photos, so a smaller gap is a tie.
3. **Candidate.** The shortlisted method with the lowest USD per kept photo on the held-out set.
4. **Check.** On the held-out set, the candidate must still pass the gates, and its exact step must stay within 10 points of its key score. When it fails, the next-cheapest method on the shortlist gets the same check.
5. **Ruling.** The owner reads the report and rules. A decision record goes in `docs/decisions/`.

### What is reused from the selection-method eval

The new eval folder is `.superpowers/2026-10-14-intake-eval/` (git-ignored). It starts from a copy of `.superpowers/2026-10-07-selection-eval/`.

| Part | Reused as it is | Changes |
|---|---|---|
| `images.mjs` (440 px copies) and `lib/sheet.mjs` (3×3 contact sheets) | yes | Also reads published images from the CDN. |
| `make-workflow.mjs`, `collect.mjs`, `check-run.mjs`, `lib/tokens.mjs` | yes | New job kinds (judge, reject pass, rank in step). |
| `lib/schemas.mjs` and `lib/prompts.mjs` | no | The new fields, the feature lists per part, V1 and V2. Bark and fruit checks are in scope now. |
| `pools.mjs` | no | Pools from the key and from the held-out fetch order. All three parts. |
| `lib/replay.mjs` | partly | Quota per step in place of "6 good". Methods S, F, and R. |
| `lib/score.mjs` | partly | Keep, step, and usual-look agreement in place of best-6 quality and extras. The new decision rule. |
| `estimate.mjs` | yes | Per-photo costs from the old run, not from the tracer. |
| Pick page and blind page | no | The 2026-10-11 review page, with the suggestions hidden for the held-out set. |
| A new `lib/step.mjs` | new | The keep and step function, with unit tests. The pipeline later gets the same function. |

The tests run with `node --test`, as before.

PR #35 stops at blind round 1. Its findings are in "Facts" above. Task 7 (its report) does not run (open question 7).

## Part 3: the audit of existing photos

### What it does

1. **Images.** Download the 2,226 active images from `https://img.learndendro.com/` into the eval folder. Make 440 px copies. This is the project's own bucket.
2. **Judge.** Run the picked method over every active row: the judge marks, and the code computes keep and step. Every row needs every field, so the audit uses the method's judge on every photo, with no stop at a quota.
3. **Compare.** A script compares the new result with the row today and flags each row in one or more groups:
   - **Fails the new rules:** the code rejects it. This is a proposed drop.
   - **Shown, but step 3:** the row is not `hard` today, and the new step is 3.
   - **Hidden, but step 1 or 2:** the row is `hard` today, and the new step is 1 or 2.
   - **Not the usual look:** `usual_look` is false. The row stays, and appears later in the path.
   - **No season today:** the row has no season tag, and the judge gives one.
4. **Gaps.** A script counts, for each species and part, the photos at each step after the proposed drops. It lists the cells below the quota. The list feeds the next content runs.
5. **Review sheets.** One page for each species and part, in the format of the 2026-10-11 review page. Proposed drops come first, then each step. Each photo shows the proposed step, the marks, and the note. The owner sets keep, step, and usual look, and exports a JSON file.
   - The owner reviews every flagged photo.
   - The owner also reviews a random 10% of the photos with no flag, to measure agreement.
6. **Apply.** On a `content/photo-audit-2026-10` branch, the CLI writes the owner's calls. No agent edits the manifest. Two CLI changes come first (Part 4):
   - a command that writes the new fields from the owner's file, for example `images fields --from <file>`;
   - a batch form of `images retire`, for example `images retire --from <file>`, for the owner's drops.
   Each command validates once, runs the append-only check, and commits once. Each command runs only when the owner asks, as `images retire` does today.
7. **Pull request.** The branch goes to `main` through a pull request. The owner merges it.

Agents never retire a photo. A proposed drop stays in the manifest until the owner marks it as a drop on a review sheet.

### Expected size

The key suggests the size of the review. These numbers assume that the key's drop rates hold for all species. The key's species are common trees, so the real rates may differ.

| Part | Active rows | Drop rate on published key photos | Proposed drops (estimate) |
|---|---|---|---|
| Leaf | 1,253 | 18% (12 of 66) | about 230 |
| Bark | 548 | 31% (17 of 54) | about 170 |
| Fruit | 425 | 20% (10 of 50) | about 85 |
| All | 2,226 | 23% (39 of 170) | about 485 |

With the step changes on the 650 `hard` rows and the 10% sample, the owner reviews about 900 to 1,100 photos. At about 4 seconds per photo, that is about 1 to 1.5 hours, over several sessions.

## Part 4: changes needed, listed and not made

### The photo-check skill

1. Remove the sentence "In the first version every run is leaf only". Bark and fruit return.
2. Replace "Stop at 6 good photos" with "Fill the quota at each step". A target is full when each step of each part in the run has its quota. The step 1 quota needs at least 2 usual-look photos.
3. Replace the five-field verdict with the fields of Part 1. The CLI computes keep and step. The judge does not tag `hard`.
4. Remove the Hard section. Its checks map onto the marks (table in Part 1).
5. Add the feature list for each part, with the rules for `arrangement`, `hang`, and `size`.
6. Add the new rules: bark that is too close is not step 1; an unusual angle and light that changes the colour are causes; a young leaf is step 3; a full-shape unripe fruit gets its step from clarity, and it is not the usual look; autumn colour no longer changes the step.
7. Move a scale object from "Not a fault" to "a plus".
8. Name the picked method and the judge models. When the method has a Haiku reject pass, describe the two passes.
9. The Channel, Licence, Identity, POWO, Duplicates, and escalation rules do not change.

### The content-run skill

1. Remove the paragraph "The first version is leaf only". Step 1 takes `--channels leaf,bark,fruit`.
2. Step 5: the photo-check skill stops at the quota per step, not at 6.
3. Step 7: the gap list counts photos per step. A targeted search stops when the pair fills its quotas, not at 4 approved images.
4. The concept run: values can start with `bark/` and `fruit/` again.
5. "Other commands": describe the new `step` field next to `images difficulty`, and the new commands of the audit.

### The pipeline and the app (separate plan)

- The verdict row and `photos stage` take the new marks. A shared function computes keep and step. The pipeline imports it from `app/`, because `app/logic/content.js` is the one validator.
- `publishApproved` writes the new fields on a new row.
- The validator (`app/logic/content.js`) checks the new fields: `step` is 1, 2, or 3, and so on.
- `build.json` and `cli report` count the approved photos per step.
- The CLI gets the two audit commands of Part 3.
- The app reads `step` and `usual_look` in a later change. Until then, `difficulty: "hard"` keeps its meaning.

## Part 5: cost and size

### How the numbers are made

- Per-photo cost comes from the old eval's real run (pass P1, 440 px, batches of 10, effort high).
- The new schema has more fields, so each photo writes more output. The estimates add 30% to the old per-photo cost. This is a guess. The tracer in phase 1 checks it.
- Ranking cost uses the old cost line for each model.
- The old eval's estimate (USD 43) was 2.4 times its real cost (USD 17.56). These estimates use real costs, so they should be closer. The ranges allow for error.
- Per photo with the new schema: Opus USD 0.0230, Sonnet 0.0125, Haiku 0.0010.

### Estimates

| Phase | Work | Agents | USD (range) | Owner's yes needed |
|---|---|---|---|---|
| 1 | Tracer: model check and 2 batches on the key | about 8 | 1 (0.5 to 2) | no, 10 agents or fewer |
| 2 | Key: 211 photos, 3 models, V1 and V2 | 132 | 15 (11 to 25) | yes |
| 2 | Key: repeat of the leading variant, 3 models | 66 | 8 (5 to 12) | yes, same approval |
| 2 | Key: ranking in each step, 21 pairs, 3 models | 63 | 4.5 (3 to 7) | yes, same approval |
| 3 | Held-out: 208 photos, 3 models, frozen variant | 63 | 8 (5 to 12) | yes |
| 3 | Held-out: ranking in each step, 9 pairs, 3 models | 27 | 2.5 (1.5 to 4) | yes, same approval |
| 5 | Audit: 2,226 photos, Opus alone | 223 | 51 (40 to 75) | yes |
| 5 | Audit: 2,226 photos, Sonnet alone | 223 | 28 (22 to 40) | yes |
| 5 | Audit: 2,226 photos, Haiku alone | 223 | 2 (1.5 to 4) | yes |
| 5 | Audit: Haiku reject pass, then Opus on the 80% that pass | about 400 | 43 (34 to 65) | yes |

- The eval (phases 1 to 3) is about 360 agents and USD 39 (range 27 to 62).
- The audit costs USD 2 to 51, by the method picked. A reject pass saves little in the audit, because most published photos pass it.
- Every workflow over 10 agents needs the owner's yes before launch. Phases 2, 3, and 5 each need one.

## Part 6: phases and tasks

| Phase | Tasks | Owner work |
|---|---|---|
| 0, spec review | The owner reads this spec and answers the open questions. | yes |
| 1, harness | Copy and adapt the old harness. Write `lib/step.mjs` with unit tests from the key's cases. Build the key pools and images. Run the tracer: model check, then 2 batches per model. | none |
| 2, key runs | Run the judge passes on the key (owner's yes). Replay S, F, and R for every model, variant, rule, and quota. Score. Freeze the rule and the prompt. | the yes for the run |
| 3, held-out | Build the held-out pools. The owner labels them blind. Run the frozen variant (owner's yes). Score, shortlist, check, and write the report. | about 210 blind labels (about 40 minutes); the optional feature check (about 10 minutes); the ruling |
| 4, pipeline and skills | A plan, then pull requests: data model, validator, CLI audit commands, the photo-check and content-run skills. | reads the plan diff; merges |
| 5, audit | Images, the judge run (owner's yes), flags, gaps, review sheets. The owner reviews. The CLI applies the owner's calls on a `content/` branch. | about 1 to 1.5 hours of review; merges |

The audit's judge run (phase 5, steps 1 to 5) can start when phase 3 ends. The apply step waits for the CLI commands of phase 4.

## Open questions for the owner

1. **The quota at each step, for each species and part.** Recommended: 3 at step 1 (2 or more of the usual look), 3 at step 2, and 2 at step 3. For a part with depth `group` or `none`: 2, 2, and 1. The replay tests both sizes, so this can change after phase 2.
2. **The fruit feature list.** Recommended: key features `type` and `shape`; other features `hang`, `wing`, and `cap`. This comes from the 2026-10-11 review.
3. **The blind held-out set.** Recommended: yes, 208 photos of PLRA, QULA, and QUAU, labelled with no suggestion shown. Without it, the eval measures agreement with the agent that wrote the suggestions, because the owner kept 91% of them.
4. **The `difficulty` field.** Recommended: add a new `step` field. Keep `difficulty: "hard"` with its meaning today until the app reads `step`. Then a later change removes the `hard` value.
5. **What the owner reviews in the audit.** Recommended: every flagged photo, plus a random 10% of the others. A full review of all 2,226 photos takes about 2.5 hours.
6. **Concept targets in the audit.** Recommended: audit them with the same rules as species photos. The 22 concept targets hold leaf-shape photos, which the learning path turns into word photos.
7. **PR #35.** Recommended: record the blind round 1 result in its notes, do not run Task 7, and close the pull request with a link to this spec.

## Risks

- **The key is anchored.** The owner saw the suggestions. Agreement on the key can be higher than agreement with a blind owner. The held-out set checks this.
- **The key is small.** 164 kept photos and 21 pairs give a rough answer. A gap of less than 5 points is a tie.
- **The rule can fit the key too closely.** The rule is tuned on the key and frozen before the held-out set.
- **The keep line inside step 3 is unclear.** The owner kept 27 and dropped 44 of the agent's step 3 photos. The gates may fail on drop recall. Then the owner gets a policy question with examples, not a stricter prompt.
- **Usual look and stage are botany.** The owner's usual-look labels repeat the agent's on every kept photo, so they are weak evidence. The report shows usual look as secondary.
- **Costs can differ.** The new schema adds output. The tracer checks the per-photo cost before the large runs.
- **The audit can empty a cell.** Drops can leave a species and part with no photo, or a step below its quota. The gap list shows each one before the apply. The CLI already refuses to hide the last photo of a species that no confusion edge names. A species retires only on purpose (`CLAUDE.md`), so the apply step must not retire every row of a species without the owner's explicit yes.
- **The audit does not check identity or licence.** The selection-method eval found wrong-species rows in PLHI pools. A clarity audit does not find them. A judge note that names a doubt goes to the owner, as an escalation does today.
- **The model alias.** Agents get full model IDs. The tracer confirms from the transcripts which model ran.

## Out of scope

- Twig, flower, and form photos. None exist yet.
- New photo fetches. The held-out set uses an existing run's candidates.
- Image size, batch size, and effort. These belong to issue #22.
- The app change that reads `step` and `usual_look`.
- Photo marks (arrows and labels) and the choice of photos for species pages.
- Code, skill changes, and eval runs before the owner reviews this spec.
