# Photo intake comparison and audit of existing photos: design

Date: 2026-10-14. Status: reviewed on 2026-10-17 against `GLOSSARY.md` and the v1 spec. The owner answered the open questions on 2026-10-17 (see "Rulings on the open questions"). No code is written and no eval has run.

Words in this spec follow `GLOSSARY.md`. The code and the data still call a part a "channel". This spec says "part", and keeps `channel` only as a field name or a CLI flag. The judge's list of things to read in a photo is the **photo features**. The word features of the learning path (outline, edge, lobe tips, and the rest) are a different list. `content/features.json` joins the two (v1 spec section 3.2, Q3).

## Goal

1. Pick the photo intake method that agrees best with the owner on two calls: keep or drop, and the difficulty step. The method must also fill a quota at each difficulty step at a cost the owner accepts.
2. Use the picked method to audit the photos already in the manifest. Many photos that passed the old rules may fail the new ones. The owner makes the final call on each flagged photo.

## Owner decisions this design rests on

- `DESIGN.md` section 18 and `docs/decisions/2026-10-09-learning-model.md`:
  - Each photo gets a difficulty step from 1 to 3 at intake. 1: the feature shows alone and whole. 2: the feature is clear, among other things. 3: the learner must search, or the feature is not typical.
  - Each part has its own list of photo features. The judge marks which photo features a photo shows clearly. The code computes the difficulty step from those answers.
  - Intake fills a quota at each difficulty step. This replaces "Stop at 6 good photos".
  - Several intake methods get a close comparison before one is picked.
- `docs/decisions/2026-10-09-v1-parts-and-teach-first.md`: bark and fruit come back for the first version. A leaf photo with a scale object (a hand, a ruler, or a coin) is a better photo. "Size can be judged" joins the leaf photo feature list. (Changed on 2026-10-17: for leaves a scale object is neutral, and a clean frame is preferred. For fruit it stays a plus.)
- `docs/decisions/2026-10-09-learning-path.md`:
  - The difficulty step measures only how hard the features are to read. It does not change with the season. An autumn leaf can be step 1.
  - Each part has a usual look: green leaves, ripe fruit, and bark that is the same all year. Photos of the usual look come first.
  - A young leaf that has not reached its full shape is step 3. A full-shape unripe fruit gets its difficulty step from clarity alone, and it is not the usual look.
  - Leaf arrangement counts as visible only when the photo shows where the leaf stalks join the twig.
  - A fruit photo must show how the fruit hangs when a card depends on it.
  - A colour line on a page must agree with the photos next to it.
  - An unusual angle, and light or shadow that changes the colour, make a photo harder.
- The v1 spec (`docs/superpowers/specs/2026-10-14-v1-learning-model-app.md`):
  - Section 3.7 lists the photo fields the app uses, with their names. This spec follows those names.
  - Q1 (2026-10-16): the photo fields get `not_for`.
  - Q3 (2026-10-16): the judge's photo features and the word features stay two lists for version 1, joined by `photo_features` in `content/features.json`.
  - Section 6.5: a reversed tree card is a deck of four trees. The learner compares one part at a time across the four trees.
- The owner's note on the 2026-10-11 review: bark that is too close lacks context ("It's too close to be a plain step 1").
- The owner is a learner (memory, 2026-09-29). The owner's labels judge learner clarity: can a learner make out the feature? The owner labels keep and difficulty step. The labels are not ground truth for botany: growth stage, species, ripeness, or typical form. Those come from the source page and the judge.
- Agents never retire photos. The owner decides on review sheets (owner, 2026-09-25).
- Photo rulings:
  - **Best-of (2026-09-29).** The judge ranks the photos for each species and part, and keeps the best across sources.
  - **Quality is relative (2026-09-30).** The best leaf photo shows one petiole laid or hanging flat. More leaves make the features harder to see. When the best photo has several leaves but one clear leaf, it is the good photo. Difficulty is a sliding scale.
  - **The `hard` tag (2026-09-28).** A hard photo is clear but not easy to identify at once. The app hides a hard photo today, so a wrong `hard` tag hides a good photo. A photo that does not show the feature at all is retired, not tagged.
  - **Leaf traits (2026-09-28).** Separate traits are the data. The code computes anything derived from them. The traits follow the typical mature leaf. Other forms are variants.
  - **Identity.** A photo whose source names a hybrid is a reject. A photo whose source names another species in the content set is added again under that species.
- `CLAUDE.md`: the manifest changes only through the CLI. IDs are append-only. Retire a published row, never delete it.

## Facts this design rests on

### The manifest today

- `content/images/manifest.json` has 2,257 rows. 31 are retired, so 2,226 are active: leaf 1,253, bark 548, fruit 425.
- The active rows cover 80 targets (58 species and 22 concept targets) and 194 cells. A cell is one target and one part. Per cell, leaf has 5 to 52 rows (median 17), bark 1 to 26 (median 7), and fruit 2 to 18 (median 6).
- The 22 concept targets: 8 old leaf-shape targets (83 photos), 6 bark words (68 photos), and 8 fruit words (56 photos). Version 1 retires the leaf-shape rows (v1 spec section 3.2).
- Every row has `hash`, `target`, `channel`, `source`, `author`, `license`, `origin`, `tags`, `checked_by`, `checked_at`, and `note`. Optional fields: `difficulty`, `retired`, `retired_reason`, `retired_at`.
- `difficulty` has one value, `hard` (`DIFFICULTIES`, `pipeline/lib/manifest.ts:28` and `app/logic/content.js:33`). The app holds back a `hard` row (`inPlay`, `app/logic/content.js:38`). The validator refuses any other value (`content.js:222`).
- 650 active rows are `hard`: leaf 385, bark 196, fruit 69. The app hides all of them today.
- The build gives a new row `difficulty: "hard"` when its approve verdict has the `hard` tag (`publishApproved`, `pipeline/lib/manifest.ts:136`). A build never changes the difficulty of a row already in the manifest (`manifest.ts:118`). Only `images difficulty <hash> --set hard | --clear` changes it (`pipeline/lib/commands.ts:1383`).
- A verdict row (`pipeline/lib/verdicts.ts`) has a kind (`approve`, `reject`, or `escalate`), a `channel` (the part), tags, a case, and a note. It has no difficulty step, photo feature, or usual-look field.
- Season is a tag (`spring`, `summer`, `autumn`, `winter`). Most bark and fruit rows have no season tag (`DESIGN.md` section 18). Of the active rows, 363 leaf, 64 bark, and 116 fruit rows carry one (v1 spec section 2).
- Some rows carry tags that match the new answers: `young` (leaf 30, bark 4, fruit 8), `mature` (leaf 18, bark 131, fruit 16), `unripe` (fruit 1), and `underside` (leaf 14). The audit compares them with the judge's answers.

### The answer key

The owner's picks of 2026-10-11 are in `prototype/photo-review/photo-picks-2026-10-11.json`. The review data is in `prototype/photo-review/data.js`. An agent wrote a suggested difficulty step, features, growth stage, season, scale, usual look, and a reason for each photo. The owner then set keep, difficulty step, usual look, and a note. Counts from a script that joins the two files:

- 211 photos: 7 species (ACRU, ACSA3, QUAL, QURU, LITU, PLOC, PLHI) times leaf, bark, and fruit. That is 21 cells of 5 to 12 photos.
- 170 photos are published. 41 are not: 29 from parts outside the run, 8 unjudged, and 4 surplus.
- The owner kept 164 and dropped 47.
- On the 164 kept photos, the owner's difficulty step equals the suggestion on 149 (91%). It is within one step on all 164.
- The suggestions were 62 at step 1, 78 at step 2, and 71 at step 3. The owner kept all 62 at step 1. The owner dropped 3 at step 2, and 44 of the 71 at step 3.
- On every kept photo, the owner's usual look equals the agent's.
- The owner dropped 39 of the 170 published photos (23%): leaf 12 of 66, bark 17 of 54, and fruit 10 of 50. Of the 131 published photos the owner kept, 24 are at step 3.
- 11 photos have a scale object (hand 7, ruler 3, person 1). The owner kept all 10 with a hand or a ruler.
- The common reasons for a drop: the feature is small or far away; a view up the trunk into the crown; light that changes the colour; dead or fallen leaves; young samaras without formed wings; fruit that is breaking apart.

The key has one weak point. The owner saw the suggested difficulty step and kept it on 91% of photos. A score against this key rewards a judge that agrees with the agent that wrote the suggestions. The key cannot show how far that agent is from a blind owner. A blind held-out set fixes this (see "The sample").

### The label rounds

The owner labelled photos blind in three rounds. Round 3 used a random test set:

- Keep or reject: the agent agreed with the owner on 84%.
- Good or not good: 66%.
- The owner's own repeat agreement: 80%.

The gap is the line between good and hard. The agent is softer than the owner there. A blind owner and an anchored owner differ, so the held-out check in "The decision rule" uses the owner's own repeat agreement, not the gates of the key.

### A first test of a difficulty-step rule

The `features` field in `data.js` lists the features that a photo shows. It has no answer for "alone and whole" or for the causes that make a photo harder. Three rules were tested on the 164 kept photos:

| Rule | Exact difficulty step | Within one step |
|---|---|---|
| Photo features only: all key photo features and 3 or more photo features is step 1, all key photo features is step 2, else step 3 | 56% | 99% |
| Photo features, plus answers guessed from words in the reason text ("alone", "fills the frame", "among", "search", "distance", "angle", "light", "young") | 65% (leaf 72%, bark 67%, fruit 56%) | 99% |
| The agent's own suggested difficulty step | 91% | 100% |

Result: a list of photo features is not enough to compute the difficulty step. The judge must also answer whether the subject is alone and whole, and which causes make it harder. The rule below adds those answers. It can be tested only on judge output that has them, so phase 2 tests it.

### The paused selection-method eval

The eval is on draft PR #35. Its spec is `.claude/worktrees/selection-eval/docs/superpowers/specs/2026-10-07-selection-method-eval-design.md`. Its ledger is `.claude/worktrees/selection-eval/.superpowers/sdd/2026-10-07-selection-method-eval/progress.md`. Its files are in the git-ignored folder `.superpowers/2026-10-07-selection-eval/`.

- It judged 473 leaf photos of 10 targets under the old rules, at 440 px, with effort high.
- It ran 195 agents with no failures. It cost USD 17.56: Opus 11.09, Sonnet 6.01, Haiku 0.46. The estimate before the run was USD 43.
- Cost per photo, one photo at a time in calls of 10 (pass P1): Opus USD 0.0177, Sonnet 0.0096, Haiku 0.00074.
- Cost of a ranking from contact sheets (pass P2), for n photos: Opus 0.0945 + 0.00374 n, Sonnet 0.0584 + 0.00180 n, Haiku 0.0036 + 0.000144 n (USD).
- The `haiku` alias ran `claude-haiku-5-5` in every job.
- Sonnet failed to read 3 photos. Opus and Haiku read all of them.
- The rankers tagged few photos `good`: 20 to 24 of 473.
- Method C (adaptive call sizes) seldom stopped early. It saw about 47 photos per target.
- A ranking of 12 photos matched the full ranking cut to 12 (mean difference 0.33 photos or less).
- The blind check, round 1: Haiku ranking alone won 1 target, a Haiku reject pass then an Opus ranking won 3, and 6 were the same.

## Part 1: what the judge returns

### The photo features for each part

| Part | Key photo features | Other photo features |
|---|---|---|
| Leaf | `shape`, `margin` | `venation`, `arrangement`, `size` |
| Bark | `texture`, `pattern` | `colour` |
| Fruit | `kind`, `shape` | `hang`, `wing` (samaras), `cap` (acorns) |

- The key photo features set the difficulty step. The other photo features only tell a card or a page what the photo can show.
- The leaf and bark lists are from `DESIGN.md` section 18. The fruit list is the owner's ruling of 2026-10-17. `kind` matches the word feature "fruit kind".
- A photo feature is `clear` when a learner can read its value. "Smooth" is a value of the bark pattern, so a smooth trunk can have `pattern` at `clear`.
- `arrangement` is `clear` only when the photo shows where the leaf stalks join the twig.
- `hang` is `clear` only when the photo shows how the fruit hangs or sits on the twig. A fruit held in a hand usually gets `no`.
- `size` is `clear` only when a scale object is in the frame.
- **Depth feature.** When the species has a `depth_feature` on the part (v1 spec section 3.5), the judge also answers that photo feature. Example: `two_heads` on the London planetree fruit: two seed balls on one stalk show clearly.
- The photo feature names are keys. `content/features.json` uses them in `photo_features`. A later rename needs a change there too.

How the word features of version 1 map onto the photo features. The owner writes `content/features.json`. This table is a draft for that file.

| Word feature | Photo features a photo must show clearly |
|---|---|
| outline, blade, lobe tips | `shape` |
| edge | `margin` |
| arrangement | `arrangement` |
| bark pattern | `pattern` |
| fruit kind | `kind` |

### The fields

The judge returns one JSON object for each photo. The names follow v1 spec section 3.7.

| Field | Values | Note |
|---|---|---|
| `part` | `leaf`, `bark`, `fruit`, `other` | The judge sets it from the photo. It writes the manifest field `channel`. `other` is a reject, so it never reaches the manifest. |
| `photo_features` | for each photo feature of the part: `clear`, `search`, or `no` | `search`: a learner finds it only with a search. |
| `whole` | true or false | The key subject shows in full: one whole leaf outline, the whole fruit, or a bark area wide enough to show the pattern repeat. |
| `alone` | true or false | The subject is the main thing in the frame. Nothing near it competes, or the background is plain or soft. |
| `too_close` | true or false, bark only | The frame shows texture only: no trunk edge, no branch, and no scale object. |
| `side` | `upper`, `under`, or `both`, leaf only | Which side of the leaf shows. |
| `causes` | zero or more of `young`, `damaged`, `atypical`, `angle`, `light` | The things that make a photo harder, other than framing. |
| `scale` | `hand`, `ruler`, `coin`, `person`, `other`, or `none` | Fruit: a scale object is a plus. Leaf and bark: it is neutral. It never makes the difficulty step harder. A hand that covers part of the subject makes `whole` false. |
| `season` | `spring`, `summer`, `autumn`, `winter`, or `any` | From what the photo shows, not the photo date. `any` (any season) marks a part that looks the same all year. Bark usually does. A green, full-size leaf with no sign of another season is `summer`. Spring needs a sign, such as catkins, flowers, or new shoots. |
| `growth_stage` | leaf: `young`, `mature`, `autumn`; fruit: `young`, `unripe`, `ripe`, `after_seed_fall`; bark: `young`, `mature`, `old` | From the photo and the source page. The owner does not label it. |
| `usual_look` | true or false | Green mature leaves, ripe fruit, and mature or old bark are the usual look. A leaf form that is not the typical form is not the usual look. The owner does not label it. |
| `not_for` | zero or more word features or depths, such as `["edge"]` or `["subgroup"]` | The photo must not test these (v1 spec section 3.7). The judge proposes it from its `atypical` cause, a variant leaf form, and the source text. The owner sets it on the review sheet. |
| `reject` | zero or more reasons from a fixed list | The 10 reject checks of the photo-check skill, plus `feature_not_found` and `hybrid`. |
| `escalate` | `mismatch`, `license`, `quality`, or none | The three cases of the photo-check skill do not change. |
| `note` | one or two sentences | What the judge saw, and the reason for each answer that lowers the difficulty step. |

The causes mean:

- `young`: a leaf or a fruit that has not reached its full shape.
- `damaged`: holes, galls, or tears that change the outline.
- `atypical`: a form that is not the typical one, such as a broken fruit ball.
- `angle`: an unusual angle, such as a view from below or a top view of a fruit.
- `light`: light or shadow that changes the colour, such as warm low sun, flash, deep shade, or backlight.

**A variant leaf form** is a form that the source names for the mature tree, but not the typical one. It is not `atypical`. Its difficulty step comes from clarity. `usual_look` is false. `not_for` names the word features where it differs from the typical mature leaf. A form that the source does not name for the mature tree, such as a sucker leaf, stays a reject.

**Identity.**

- A photo whose source names a hybrid that is not the target is a reject (`hybrid`). The London planetree (PLHI) is itself a hybrid. A PLHI photo whose source names PLHI passes.
- A photo whose source names another species in the content set is added again under that species. At intake, it becomes a new candidate of that species. In the audit, the owner retires the row, and the photo is added again under the other species.

The `hard` tag goes away from the verdict. The old hard checks map onto these answers:

| Old hard check | New answer |
|---|---|
| Crowded leaves | `alone: false`, or a key photo feature at `search` |
| The feature is small in the frame | a key photo feature at `search` |
| Soft photo, edges traceable | a key photo feature at `search` |
| Tilted leaf | `angle` |
| The frame edge cuts off part of the leaf | `whole: false` |
| A young form | `young` for a leaf; `growth_stage: unripe` and `usual_look: false` for a full-shape fruit |
| A fruit not in its typical form | `atypical` |
| Autumn colour | `growth_stage: autumn` and `usual_look: false`. It no longer changes the difficulty step. |
| Bark from a distance | a key photo feature at `search` |
| Backlight or deep shade | `light` |

### How the code computes keep and difficulty step

The judge never returns a difficulty step. A pure function computes it from the answers. The proposed rule:

1. **Reject** when any of these is true:
   - `reject` is not empty, or `part` is `other`;
   - a key photo feature is `no`;
   - a key photo feature is `search`, and `causes` is not empty.
2. **Step 3** when a key photo feature is `search`, or `causes` is not empty.
3. **Step 1** when every key photo feature is `clear`, `whole` and `alone` are true, and for bark `too_close` is false.
4. **Step 2** in every other case.

**A thin cell.** Quality is relative (owner ruling 2026-09-30). When the last reject line would leave a cell with no photo, the best of the photos it rejects goes to the owner's review sheet at step 3. The owner decides. Photos rejected by the other lines do not come back.

Notes on the rule:

- The last reject line is the least certain part. The owner kept 27 and dropped 44 of the 71 photos that the agent put at step 3, and their reasons overlap. Phase 2 tests this line against those 71 photos. It also tests the other choice: keep every step 3 photo, and let the quota cut the extra ones.
- Season does not enter the rule. `usual_look` decides when a photo appears, not its difficulty step.
- Scale does not enter the rule. For fruit, it decides the order within a difficulty step: a photo with a scale object ranks first. For leaf and bark it does not change the order. The app shows the typical leaf and fruit size as text (v1 spec section 3.5).
- The rule is code, so a change costs no new judge tokens. Phase 2 replays every variant of the rule from the stored answers.

### Where the fields go

The manifest row gets new optional fields, with the names of v1 spec section 3.7: `step` (the difficulty step), `usual_look`, `season`, `growth_stage`, `photo_features` (the photo features marked `clear`), `side` (leaf only), `scale`, `not_for`, and `rules` (the version of the rules, such as `2026-10`). The full `photo_features` answers, `causes`, `whole`, `alone`, and `too_close` of each photo stay in the verdict files and the audit results.

`difficulty: "hard"` keeps its meaning (the app hides the row) until cutover, v1 ticket 6.2. Until then the CLI keeps it in line with the owner's calls:

- At the audit apply, the CLI clears `hard` on a row that the owner keeps at difficulty step 1 or 2. It sets `hard` on a row at step 3. Today's app then stops hiding good photos.
- A new row from intake gets `hard` when its difficulty step is 3.
- At cutover, a later change removes the `hard` value.

## Part 2: the methods to compare

### Methods

Every judge call happens once. The methods then replay from the stored results, as in the selection-method eval. A new variant of a method costs no new tokens.

| Method | How it runs | Its cost |
|---|---|---|
| S, single pass, stop at quota (baseline) | Walk the pool in fetch order, 10 photos to a call. The judge answers for each photo, and the code computes keep and difficulty step. Stop when the quota of every difficulty step is full, or the pool runs out. Keep the first photos in fetch order at each difficulty step. | The judge's cost for the photos seen |
| F, reject pass first (baseline) | Haiku answers for every photo with the same schema. Its rejects drop out. The main judge answers for the rest, in fetch order, and stops at the quota. | Haiku's cost, plus the main judge's cost for the photos it sees |
| R, collect K, rank in each difficulty step | The judge answers for the first K photos (K = 20, 30, or all). The code computes the difficulty steps. A ranking agent orders the photos of each difficulty step from contact sheets only (owner ruling 2026-10-08). Keep the top photos of each difficulty step up to the quota. The ranking prefers the usual look, then (for fruit) a scale object, then the whole subject, then the view that the other species of the group show. | The judge's cost for K photos, plus the ranking cost |

- S and F keep photos in fetch order, not the best. That breaks the best-of ruling (2026-09-29). They run as cost baselines only. Only a method that ranks can be the candidate.
- With a small K, R ranks only the first sources in fetch order. The report shows how often the best photo of "all" comes after photo K.
- Judge models: Opus 5.5, Sonnet 5.5, and Haiku 5.5 (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`). Agents get the full model IDs.
- The reject pass uses Haiku only. Sonnet costs about half of Opus per photo, so a Sonnet reject pass saves little.
- Method C of the old eval (adaptive call sizes) is dropped. It seldom stopped early, so it cost the same as "collect all".
- The quota (owner ruling 2026-10-17): for a part with depth `species`, 3 photos at step 1 (2 or more of them the usual look), 3 at step 2, and 2 at step 3. For a part with depth `subgroup`, `group`, or `none`: 2, 2, and 1. The replay is free, so it can test other sizes too.

### Prompt variants

- **V1, checklist.** The prompt asks one question for each photo feature and each cause, in a fixed order, as the Quality checks of the photo-check skill do today.
- **V2, describe first.** The judge first writes two or three sentences on what the photo shows. It then answers the same checklist. V2 costs more output tokens.

Both variants have the same rules and the same JSON schema. Image size (440 px), photos per call (10), and effort (high) stay as in the old eval. Tuning them is the work of issue #22.

When neither variant passes the gates, a third variant adds a reference sheet with two example photos for each difficulty step. The examples come from species outside the key and the held-out set.

### The sample

- **The key:** all 211 photos of the 2026-10-11 review. It measures the agreement on keep and difficulty step, one photo at a time. Its cells are small (5 to 12 photos) and hold mostly published photos, so it cannot test the quota fill.
- **The held-out set:** the full fetch-order pools of 3 species that are not in the key, from run `simple_lobed_us`: PLRA, QULA, and QUAU. Their pools have the most rows whose `channel_hint` is bark or fruit (24, 17, and 17). The pools mix all parts, as a real fetch does, so the judge sets the part. That is 208 photos after duplicates drop out (PLRA 82, QULA 70, QUAU 56).
  - The owner labels each photo blind, with no suggestion shown: part, keep, and difficulty step. The owner does not label usual look or growth stage. The page is the 2026-10-11 review page with the suggestions hidden.
  - The owner also picks the best photo of each of the 9 cells, for the top-pick score.
  - A week later, the owner labels a random 40 of the photos again, blind. This gives the owner's own repeat agreement on this set.
  - The difficulty-step rule and the prompts are frozen before the held-out set is judged.
  - The held-out set measures the agreement with no anchor, the quota fill, and the cost per kept photo.
- **The feature check (optional):** 60 photos from the key, with one yes or no question per photo feature, in learner words. Examples: "Can you see where the leaf stalks join the twig?", "Can you see how the fruit hangs?", "Can you read the bark texture?", "Is there a hand, a ruler, or a coin?". These questions are about what a learner sees, not botany. The check takes the owner about 10 minutes.

### Metrics

| Metric | How it is measured | Where |
|---|---|---|
| Keep agreement | The share of photos where the method's keep equals the owner's. A photo that the owner dropped only for a species doubt leaves this score. | key, held-out |
| Drop recall | The share of the owner's drops that the method rejects | key, held-out |
| Difficulty step, exact and within one | On photos that both keep | key, held-out |
| Top pick | The share of cells where the method's top photo is the owner's best | held-out; the key too, if the picks file marks a best photo |
| Usual look | The share of kept photos where the method agrees with the owner | key only, secondary: the owner kept the agent's value on every photo, and the owner no longer labels it |
| Photo feature answers | Agreement with the owner's yes or no answers; agreement between the three models | feature check |
| Species doubt | The judge's `mismatch` escalations and `hybrid` rejects, against the species on the source page. It is scored apart from photo quality. | key, held-out |
| Repeat agreement | The same judge on the same photos twice. The owner's own repeat agreement was 80% in label round 3; the 40 relabelled photos measure it on the held-out set. | key, leading variant only; held-out |
| Cost | Tokens, and price-weighted USD (prices in Part 5), per photo judged and per kept photo | key, held-out |
| Quota fill | The share of species, part, and difficulty step cells that the method fills, and the photos judged to fill them | held-out |
| Time | Wall-clock minutes per 100 photos, from the workflow run record | all runs |

Growth stage and species are not scored against the owner. Species doubt is scored against the source page.

### The decision rule

1. **Gates on the key.** Drop recall 80% or more, keep agreement 85% or more, exact difficulty step 80% or more, and within one step 97% or more. These gates apply to the anchored key only.
2. **Shortlist.** Among the ranking methods that pass the gates, find the best exact difficulty step. Shortlist every ranking method within 5 points of that best, on exact difficulty step and on keep agreement. On 164 kept photos, 5 points is about 8 photos, so a smaller gap is a tie.
3. **Candidate.** The shortlisted method with the lowest USD per kept photo on the held-out set.
4. **Check.** On the held-out set, the candidate's keep agreement and exact difficulty step must each be no more than 5 points below the owner's own repeat agreement on the same measure. The 40 relabelled photos give that number. When the candidate fails, the next-cheapest method on the shortlist gets the same check.
5. **Ruling.** The owner reads the report and rules. A decision record goes in `docs/decisions/`.

### What is reused from the selection-method eval

The new eval folder is `.superpowers/2026-10-14-intake-eval/` (git-ignored). It starts from a copy of `.superpowers/2026-10-07-selection-eval/`.

| Part | Reused as it is | Changes |
|---|---|---|
| `images.mjs` (440 px copies) and `lib/sheet.mjs` (3×3 contact sheets) | yes | Also reads published images from the CDN. |
| `make-workflow.mjs`, `collect.mjs`, `check-run.mjs`, `lib/tokens.mjs` | yes | New job kinds (judge, reject pass, rank in each difficulty step). |
| `lib/schemas.mjs` and `lib/prompts.mjs` | no | The new fields, the photo features per part, V1 and V2. Bark and fruit checks are in scope now. |
| `pools.mjs` | no | Pools from the key and from the held-out fetch order. All three parts. |
| `lib/replay.mjs` | partly | Quota per difficulty step in place of "6 good". Methods S and F (baselines) and R. |
| `lib/score.mjs` | partly | Keep, difficulty step, top pick, and species doubt in place of best-6 quality and extras. The new decision rule. |
| `estimate.mjs` | yes | Per-photo costs from the old run, not from the tracer. |
| Pick page and blind page | no | The 2026-10-11 review page: photos side by side, with captions. The suggestions are hidden for the held-out set. A best-photo pick for each cell. |
| A new `lib/step.mjs` | new | The keep and difficulty step function, with unit tests. The pipeline later gets the same function. |

The tests run with `node --test`, as before.

PR #35 stops at blind round 1. Its findings are in "Facts" above. The blind round 1 result goes in its notes. Task 7 (its report) does not run. The pull request closes with a link to this spec (owner ruling 2026-10-17).

## Part 3: the audit of existing photos

### What it does

1. **Images.** Download the active images in scope from `https://img.learndendro.com/` into the eval folder. Make 440 px copies. This is the project's own R2 bucket. In scope: the 58 species and the 14 bark and fruit word targets, 2,143 rows. The 8 old leaf-shape targets (83 rows) are out of scope, because version 1 retires them.
2. **Judge.** Run the picked method over every row in scope: the judge answers, and the code computes keep and difficulty step. Every row needs every field, so the audit uses the method's judge on every photo, with no stop at a quota.
3. **Compare.** A script compares the new result with the row today and flags each row in one or more groups:
   - **Fails the new rules:** the code rejects it. This is a proposed drop.
   - **Shown, but step 3:** the row is not `hard` today, and the new difficulty step is 3.
   - **Hidden, but step 1 or 2:** the row is `hard` today, and the new difficulty step is 1 or 2.
   - **Not the usual look:** `usual_look` is false. The row stays, and appears later in the path.
   - **Has `not_for`:** the judge proposes one or more values.
   - **No season today:** the row has no season tag, and the judge gives one.
   - **Season or tag differs:** the judge's season differs from the season tag, or a `young`, `mature`, `unripe`, or `underside` tag differs from the judge's growth stage or side.
4. **Gaps.** A script counts, for each species and part, the photos at each difficulty step after the proposed drops. It lists the cells below the quota. It also counts the usual-look photos for each season (with `any`) and each view. It flags a part with no photo in a season where its look-alikes have one, because a reversed tree card compares four trees one part at a time (v1 spec section 6.5). It also lists the gaps of the v1 content gate (ticket 6.1). The list feeds the next content runs.
5. **Review sheets.** One page for each cell, in the format of the 2026-10-11 review page: photos side by side, with captions. Proposed drops come first, then each difficulty step. Each caption shows the proposed difficulty step, the growth stage, the season, the usual look, the side, `not_for`, and the note. A thin-cell photo (Part 1) is marked as one.
   - The owner sets keep, difficulty step, and `not_for`. The owner can flag a growth stage or a usual look that looks wrong, but does not set them. The owner exports a JSON file.
   - The owner reviews every flagged photo.
   - The owner also reviews a random 10% of the photos with no flag, to measure agreement.
6. **Apply.** On a `content/photo-audit-2026-10` branch, the CLI writes the owner's calls. No agent edits the manifest. Two CLI changes come first (Part 4):
   - a command that writes the new fields from the owner's file and keeps `hard` in line with the difficulty step (Part 1), for example `images fields --from <file>`;
   - a form of `images retire` that takes a file, for example `images retire --from <file>`, for the owner's drops.
   Each command validates once, runs the append-only check, and commits once. Each command runs only when the owner asks, as `images retire` does today.
7. **Pull request.** The branch goes to `main` through a pull request. The owner merges it.

Agents never retire a photo. A proposed drop stays in the manifest until the owner marks it as a drop on a review sheet.

### Expected size

The key suggests the size of the review. These numbers assume that the key's drop rates hold for all species. The key's species are common trees, so the real rates may differ.

| Part | Rows in scope | Drop rate on published key photos | Proposed drops (estimate) |
|---|---|---|---|
| Leaf | 1,170 | 18% (12 of 66) | about 210 |
| Bark | 548 | 31% (17 of 54) | about 170 |
| Fruit | 425 | 20% (10 of 50) | about 85 |
| All | 2,143 | 23% (39 of 170) | about 465 |

With the difficulty step changes on the `hard` rows and the 10% sample, the owner reviews about 900 to 1,100 photos. At about 4 seconds per photo, that is about 1 to 1.5 hours, over several sessions.

## Part 4: changes needed, listed and not made

### The photo-check skill

1. Remove the sentence "In the first version every run is leaf only". Bark and fruit return.
2. Replace "Stop at 6 good photos" with "Fill the quota at each difficulty step". A target is full when each difficulty step of each part in the run has its quota. The step 1 quota needs at least 2 usual-look photos.
3. Replace the five-field verdict with the fields of Part 1. The CLI computes keep and difficulty step. The judge does not tag `hard`.
4. Remove the Hard section. Its checks map onto the answers (table in Part 1).
5. Add the photo features for each part, with the rules for `arrangement`, `hang`, `size`, a smooth bark pattern, and the depth feature.
6. Add the new rules: bark that is too close is not step 1; an unusual angle and light that changes the colour are causes; a young leaf is step 3; a full-shape unripe fruit gets its difficulty step from clarity, and it is not the usual look; autumn colour no longer changes the difficulty step; a green, full-size leaf is `summer` unless the photo shows another season; mature and old bark are the usual look; a variant leaf form gets its difficulty step from clarity, is not the usual look, and gets `not_for`.
7. Fruit: move a scale object from "Not a fault" to "a plus". Leaf and bark: it stays "Not a fault", with no rank boost. A hand that covers part of the subject makes `whole` false.
8. Identity: add the hybrid reject (except a target that is itself the hybrid, such as PLHI) and the rule that adds a photo again under another species of the content set.
9. Name the picked method and the judge models. The method ranks the photos and keeps the best across sources. When the method has a Haiku reject pass, describe the two passes.
10. The Channel (part), Licence, POWO, Duplicates, and escalation rules do not change.

### The content-run skill

1. Remove the paragraph "The first version is leaf only". content-run Step 1 takes `--channels leaf,bark,fruit`.
2. content-run Step 5: the photo-check skill stops at the quota per difficulty step, not at 6.
3. content-run Step 7: the gap list counts photos per difficulty step, season, and view. A targeted search stops when the cell fills its quotas, not at 4 approved images.
4. The concept run: values can start with `bark/` and `fruit/` again.
5. "Other commands": describe the new `step` field next to `images difficulty`, and the new commands of the audit.

### The pipeline and the app (separate plan)

- The verdict row and `photos stage` take the new answers. A shared function computes keep and difficulty step. The pipeline imports it from `app/`, because `app/logic/content.js` is the one validator.
- `publishApproved` writes the new fields on a new row. Until cutover it also sets `difficulty: "hard"` on a row at difficulty step 3.
- The validator (`app/logic/content.js`) checks the new fields: `step` is 1, 2, or 3; `side` is `upper`, `under`, or `both`; a `not_for` value is a word feature or a depth (v1 spec section 3.11); and so on.
- `build.json` and `cli report` count the approved photos per difficulty step.
- The CLI gets the two audit commands of Part 3.
- The app reads `step`, `usual_look`, and the other fields in a later change. Until then, `difficulty: "hard"` keeps its meaning.

## Part 5: cost and size

### How the numbers are made

- Prices per 1M tokens, input and output: Opus 5.5 USD 4 and 20, Sonnet 5.5 USD 2 and 10, Haiku 5.5 USD 0.10 and 0.50. The report gives each cost as tokens and as price-weighted USD.
- Per-photo cost comes from the old eval's real run (pass P1, 440 px, calls of 10, effort high).
- The new schema has more fields, so each photo writes more output. The estimates add 30% to the old per-photo cost. This is a guess. The tracer in phase 1 checks it.
- Ranking cost uses the old cost line for each model.
- The old eval's estimate (USD 43) was 2.4 times its real cost (USD 17.56). These estimates use real costs, so they should be closer. The ranges allow for error.
- Per photo with the new schema: Opus USD 0.0230, Sonnet 0.0125, Haiku 0.0010.

### Estimates

| Phase | Work | Agents | USD (range) | Owner's yes needed |
|---|---|---|---|---|
| 1 | Tracer: model check and 2 calls on the key | about 8 | 1 (0.5 to 2) | no, 10 agents or fewer |
| 2 | Key: 211 photos, 3 models, V1 and V2 | 132 | 15 (11 to 25) | yes |
| 2 | Key: repeat of the leading variant, 3 models | 66 | 8 (5 to 12) | yes, same approval |
| 2 | Key: ranking in each difficulty step, 21 cells, 3 models | 63 | 4.5 (3 to 7) | yes, same approval |
| 3 | Held-out: 208 photos, 3 models, frozen variant | 63 | 8 (5 to 12) | yes |
| 3 | Held-out: ranking in each difficulty step, 9 cells, 3 models | 27 | 2.5 (1.5 to 4) | yes, same approval |
| 5 | Audit: 2,143 photos, Opus alone | 215 | 49 (39 to 72) | yes |
| 5 | Audit: 2,143 photos, Sonnet alone | 215 | 27 (21 to 39) | yes |
| 5 | Audit: 2,143 photos, Haiku alone | 215 | 2 (1.5 to 4) | yes |
| 5 | Audit: Haiku reject pass, then Opus on the 80% that pass | about 390 | 42 (33 to 63) | yes |

- The eval (phases 1 to 3) is about 360 agents and USD 39 (range 27 to 62).
- The audit costs USD 2 to 49, by the method picked. A reject pass saves little in the audit, because most published photos pass it.
- Every workflow over 10 agents needs the owner's yes before launch. Phases 2, 3, and 5 each need one.

## Part 6: phases and tasks

| Phase | Tasks | Owner work |
|---|---|---|
| 0, spec review | The owner reads this spec and answers the open questions. Done on 2026-10-17. | done |
| 1, harness | Copy and adapt the old harness. Write `lib/step.mjs` with unit tests from the key's cases. Build the key pools and images. Run the tracer: model check, then 2 calls per model. | none |
| 2, key runs | Run the judge passes on the key (owner's yes). Replay S, F, and R for every model, variant, rule, and quota. Score. Freeze the rule and the prompt. | the yes for the run |
| 3, held-out | Build the held-out pools. The owner labels them blind. Run the frozen variant (owner's yes). Score, shortlist, check, and write the report. | about 210 blind labels (about 40 minutes); the best photo of 9 cells; 40 repeat labels a week later (about 8 minutes); the optional feature check (about 10 minutes); the ruling |
| 4, pipeline and skills | A plan, then pull requests: data model, validator, CLI audit commands, the photo-check and content-run skills. | reads the plan diff; merges |
| 5, audit | Images, the judge run (owner's yes), flags, gaps, review sheets. The owner reviews. The CLI applies the owner's calls on a `content/` branch. | about 1 to 1.5 hours of review; merges |

The audit's judge run (phase 5, items 1 to 5 of "What it does") can start when phase 3 ends. The apply (item 6) waits for the CLI commands of phase 4.

## Rulings on the open questions

The owner ruled on each question on 2026-10-17. Questions 8 to 17 came from the review of this spec against `GLOSSARY.md` and the v1 spec.

| # | Question | Ruling |
|---|---|---|
| 1 | The quota at each difficulty step, for each species and part. | As recommended. Depth `species`: 3 at step 1 (2 or more of the usual look), 3 at step 2, and 2 at step 3. Depth `subgroup`, `group`, or `none`: 2, 2, and 1. The replay can test other sizes. |
| 2 | The fruit photo features. | As recommended. Key: `kind` (renamed from `type`, to match the word feature "fruit kind") and `shape`. Other: `hang`, `wing`, and `cap`. Plus the species' depth feature when it has one. |
| 3 | The blind held-out set. | Yes: 208 photos of PLRA, QULA, and QUAU, labelled with no suggestion shown. |
| 4 | The `difficulty` field. | Add a new `step` field. `hard` keeps its meaning until cutover (v1 ticket 6.2). At the audit apply, the CLI clears `hard` on a photo the owner keeps at step 1 or 2, and sets it at step 3. A new intake row at step 3 gets `hard`. At cutover a later change removes the value. |
| 5 | What the owner reviews in the audit. | As recommended. Every flagged photo, plus a random 10% of the others. |
| 6 | Concept targets in the audit. | The 14 bark and fruit word targets only, with the same rules as species photos. The 8 old leaf-shape targets are out, because version 1 retires them. |
| 7 | PR #35. | As recommended. Record the blind round 1 result in its notes, do not run Task 7, and close the pull request with a link to this spec. |
| 8 | The held-out check, when the owner's own repeat agreement is 80%. | Keep agreement and exact difficulty step pass when each is no more than 5 points below the owner's repeat agreement. The owner relabels 40 held-out photos a week later to measure it. The 85% and 80% gates stay on the anchored key only. |
| 9 | Methods S and F keep photos in fetch order. | Cost baselines only. Only a ranking method can be the candidate, as the best-of ruling requires. |
| 10 | A top-pick score. | Yes. The owner picks the best photo of each held-out cell. |
| 11 | A cell where the last reject line would reject every photo. | The best of those photos goes to the owner's sheet at step 3. The owner decides. |
| 12 | The season of a green, full-size leaf with no other sign. | `summer`. Spring needs a sign, such as catkins, flowers, or new shoots. |
| 13 | The usual look of bark. | Mature and old bark. Young bark is not the usual look. |
| 14 | A leaf `side` answer. | Yes: `upper`, `under`, or `both`. The view uses it, so compared photos match (v1 spec section 3.7). |
| 15 | Does the owner label the usual look? | No. The owner labels part, keep, and difficulty step. The usual look and the growth stage show as captions from the judge and the source page. The owner can flag one that looks wrong. |
| 16 | A variant leaf form. | Its difficulty step comes from clarity. It is not the usual look. `not_for` names the word features where it differs. It is not `atypical`. |
| 17 | The hybrid rule, when the target PLHI is itself a hybrid. | Reject a photo whose source names a hybrid that is not the target. A PLHI photo whose source names PLHI passes. |
| 18 | Is a photo with a scale object better? | Leaf and bark: neutral. A clean frame shows the subject best, and the app gives the typical leaf size as text. Fruit: a plus. The app also gets a typical fruit size field (v1 spec section 3.5). A hand that covers part of the subject makes `whole` false. |

## Risks

- **The key is anchored.** The owner saw the suggestions. Agreement on the key can be higher than agreement with a blind owner. The held-out set checks this.
- **A blind owner is harder to match.** In label round 3 the agent agreed with the owner on 66% of good-or-not calls, and the owner agreed with themselves on 80%. The held-out check uses the owner's repeat agreement for this reason.
- **The key is small.** 164 kept photos and 21 cells give a rough answer. A gap of less than 5 points is a tie.
- **The rule can fit the key too closely.** The rule is tuned on the key and frozen before the held-out set.
- **The keep line inside step 3 is unclear.** The owner kept 27 and dropped 44 of the agent's step 3 photos. The gates may fail on drop recall. Then the owner gets a policy question with examples, not a stricter prompt.
- **Usual look and growth stage are botany.** The owner does not label them. The owner's usual-look labels on the key repeat the agent's on every kept photo, so they are weak evidence. The report shows usual look as secondary.
- **Costs can differ.** The new schema adds output. The tracer checks the per-photo cost before the large runs.
- **The audit can empty a cell.** Drops can leave a species and part with no photo, or a difficulty step below its quota. The thin-cell rule and the gap list show each one before the apply. The CLI already refuses to hide the last photo of a species that no confusion edge names. A species retires only on purpose (`CLAUDE.md`), so the apply must not retire every row of a species without the owner's explicit yes.
- **The audit does not check identity or licence.** The selection-method eval found wrong-species rows in PLHI pools. A clarity audit does not find them. A judge note that names a doubt goes to the owner, as an escalation does today.
- **The model alias.** Agents get full model IDs. The tracer confirms from the transcripts which model ran.

## Out of scope

- Twig, flower, and form photos. None exist yet.
- New photo fetches. The held-out set uses an existing run's candidates.
- Image size, photos per call, and effort. These belong to issue #22.
- The app change that reads `step`, `usual_look`, and the other fields.
- Photo marks (arrows and labels) and the choice of photos for species pages.
- Code, skill changes, and eval runs before the owner reads the plan diff.
