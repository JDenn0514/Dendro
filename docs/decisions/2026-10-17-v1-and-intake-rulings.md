# Version 1 and photo intake: the owner's rulings

Date: 2026-10-16 and 2026-10-17. Recorded on 2026-10-19. Status: decided by the owner, not yet in the app.

## Context

Two specs of 2026-10-14 turn the learning model into a plan:

- `docs/superpowers/specs/2026-10-14-v1-learning-model-app.md` (here "the v1 spec"): the app for version 1.
- `docs/superpowers/specs/2026-10-14-intake-comparison-and-photo-audit.md` (here "the intake spec"): the comparison of photo intake methods, and the audit of the photos in the manifest.

The owner ruled on the open questions of both specs. Each spec keeps the full table of its rulings: the v1 spec in section 10, the intake spec in "Rulings on the open questions". This record lists the rulings in short. `DESIGN.md` section 19 gives the rules they replace.

## Decision

### Version 1 of the app (2026-10-16, and the size rulings of 2026-10-17)

- **Content files.** Words stay in `content/concepts.json`. A new owner file, `content/features.json`, holds the features: a prompt, the photo features, and a drawing for each one (Q3). A teaching-draft agent writes group text, pair tips, and word pair tips in `content_src/teaching/`, with sources. The owner checks learner clarity (Q2).
- **Two feature lists for version 1.** The judge's photo features (shape, margin, and the rest) and the word features (outline, edge, lobe tips, and the rest) stay apart. `photo_features` in `content/features.json` joins them (Q3).
- **Photos get `not_for`:** the word features or depths that a photo must not test (Q1).
- **Order.** One hand order of groups and species, drafted from FIA and city totals. Per-area order comes after version 1 (Q4).
- **Area.** The second choice says "All of the United States" until the app has Canada and Mexico data (Q5).
- **Subgroups follow a rule, not a list.** A group splits when some state has more than 10 of its species, botanists use the split, and a learner can see it on at least one part. In version 1 only the oaks pass. QUCE joins no subgroup (Q10).
- **Answer formats.** The interval rule of section 17 comes back, with a reversed card about one time in five. It replaces the tier ladder of the 2026-09-22 review (Q6). Early cards have 2 choices, then 3 after the first right answer, then 4 from a 4-day interval, never more than the met items allow (Q7).
- **Reversed tree cards** use the card deck with rule out (2026-10-15, v1 spec section 6.5).
- **The daily cap of new cards** stays. The first batch of a day unlocks even when it is larger than the cap (Q8).
- **Placement test.** A pass sets interval 21 days, ease 2.5, and reps 1. A group passes with both of its cards right (Q9).
- **Left out of version 1:** variety cards (their saved states stay, Q11) and a range map (the answer screen shows the range text and the elevation, Q12).
- **Credits.** Pages: a small line under each photo. Cards: the credits after the answer (Q13).
- **Look-alike lines** name met trees only, from the confusion edges of the part. With no met look-alike on a part, the part shows no look-alike line (Q14).
- **Practice mode.** A right answer to a card that is not due does not change its schedule (Q15).
- **The slow-answer rule** is off on tree cards (Q16).
- **One tree card for each species.** The app picks the season each time (Q17).
- **Drawings** state no licence until the repo picks one. The Sources screen says they are made for Dendro (Q19).
- **The new screens** ship behind `?path=1`. The old leaf app stays the default until ticket 6.2 (Q20).
- **Mastery** has four values: new, learning, known, and mastered. The progress tree shows them in full. The trail shows them only on done stops (Q21).
- **The review log cap** stays at 5,000 rows, with the monthly export prompt (Q22).
- **Sizes (2026-10-17).** Species get a typical fruit size (`fruit_length_in`) and a typical trunk diameter (`trunk_diameter_ft`), shown as a diameter. Fruit part cards show the fruit size. On a reversed card, each choice shows its own typical sizes. Crown shape waits for the form part.

### Photo intake and the audit (2026-10-17)

- **Quota per difficulty step.** Depth `species`: 3 photos at step 1 (2 or more of the usual look), 3 at step 2, and 2 at step 3. Depth `subgroup`, `group`, or `none`: 2, 2, and 1 (ruling 1).
- **Fruit photo features.** Key: `kind` and `shape`. Other: `hang`, `wing`, and `cap`, plus the species' depth feature when it has one (ruling 2).
- **The `difficulty` field.** A new `step` field holds the difficulty step. Until cutover, the CLI keeps `hard` in line with step 3: at the audit apply it clears `hard` on a photo the owner keeps at step 1 or 2, and sets it at step 3. At cutover the `hard` value goes (ruling 4).
- **The eval.** A blind held-out set of 208 photos (ruling 3). Methods S and F are cost baselines only. A ranking method wins: R, FR (a Haiku reject pass, then judge and rank), or CR (the code ranks from the judge's answers) (rulings 9 and 19). A top-pick score (ruling 10). On the held-out set, keep agreement and exact difficulty step must each be no more than 5 points below the owner's own repeat agreement (ruling 8). A source yield score. A test of the photo fetch is a later spec (ruling 20).
- **The audit.** The owner reviews every flagged photo and a random 10% of the rest (ruling 5). The 14 bark and fruit word targets are in. The 8 old leaf-shape targets are out (ruling 6).
- **The owner's labels.** Part, keep, and difficulty step. The usual look and the growth stage show as captions from the judge and the source page (ruling 15).
- **Photo rules.**
  - A thin cell sends its best rejected photo to the owner at step 3 (ruling 11).
  - A green, full-size leaf with no other sign of season is `summer` (ruling 12).
  - Mature and old bark are the usual look (ruling 13).
  - The judge answers which side of a leaf shows (ruling 14).
  - A variant leaf form gets its difficulty step from clarity, is not the usual look, and gets `not_for` (ruling 16).
  - A source that names a hybrid other than the target is a reject. PLHI photos named as PLHI pass (ruling 17).
  - A scale object is a plus for fruit, and neutral for leaf and bark (ruling 18).
- **PR #35** closed on 2026-10-17 without a merge, with a link to the intake spec (ruling 7).

## Consequences

- `DESIGN.md` section 19 records these rulings and the rules they replace. It wins over section 18 where they disagree.
- `content/features.json` joins the owner's files in `CLAUDE.md`. Agents do not change it.
- Next is ticket 0.3 of the v1 spec: the implementation plan. The intake spec's plan comes first or alongside, because the photo audit is the critical path of version 1 (v1 spec, risk 1).
- Still open: the intake method (after the eval), per-area order, Canada and Mexico, the feature lists for twig and flower, and a licence for the drawings.
