# Learning model: part cards, then tree cards

Date: 2026-10-09. Status: decided by the owner, not yet in the app. A prototype comes first.

## Context

- Real identification uses the whole tree, not one part.
- A tree looks different through the year. Leaves fall and change colour, and flowers open.
- Place, habitat, size, and elevation help identification.
- How the leaves sit on the branch helps as much as one leaf.
- Photo intake is weak. Today the difficulty of a question depends only on its answer format, not on how hard the photo is.

## Decision

The goal: the learner can name a real tree from what is visible that day. The app stays a desk tool. The learner also learns the botany words, as a planned side effect.

- **Part cards stay as the first stage.** A part card shows one part of one species: leaf, bark, fruit, twig, flower, or form. Part cards teach the words and show which part a learner is weak on.
- **Each part has a depth for each species:** `species`, `group`, or `none`. A part card asks only as deep as that part can tell. Example: most acorns give only the red oak group or the white oak group.
- **Tree cards come next.** A tree card is one species in one season, with a button for each part. Form is a distant photo of the whole tree. A tree card can combine photos from several trees of the species. It uses one real iNaturalist observation when that observation has enough parts.
- **Season comes from the manifest season tags,** not from the photo date. A part that does not change through the year is marked "any season" and can join a tree card of any season.
- **Free context on a tree card:** the state, the season, and the typical habitat, height, and leaf or needle size. The range map, the elevation range, and the description show only on the answer screen.
- **Opening a part costs nothing.** The score is only whether the learner named the species. The app records which parts the learner opened.
- **Tree cards have their own spaced-repetition schedule.** A tree-card answer does not change any part card.
- **Unlock:** the tree cards of a species unlock after the learner names it right on part cards for two or more different parts. Gating stays soft.
- **Species mastery comes from tree cards.** Part cards show weak parts only.
- **Answer formats:** 4 choices, then 8 choices, then typed, as on part cards. The wrong options come from `content/confusion.json`, limited to the same season and area.
- **After a miss,** the app shows the right species and the part that best separates it from the learner's answer, with a link to a clear photo of that part.
- **Area:** at the start, the learner picks "trees in my area" (one or more US states, matched against USDA PLANTS) or "all of North America".
- **Photo difficulty step, 1 to 3,** set for each photo at intake. 1: the feature alone and whole. 2: the feature clear, among other things. 3: the learner must search, or the feature is not typical. The judge marks which features a photo shows clearly, and the code computes the step.
- **Intake fills a quota at each step,** in place of "Stop at 6 good photos".
- **New species fields:** a depth for each part, and a typical leaf or needle size. The species-draft skill writes them. The owner checks them for learner clarity.

The full list, with the rules it replaces, is `DESIGN.md` section 18.

## Consequences

- `DESIGN.md` section 18 wins over sections 2, 10, 11, and 12, and over section 17's mastery, region, wrong-option, and scheduling rules where they disagree.
- The selection-method eval (PR #35) stays paused before Task 5. It tuned the "Stop at 6 good photos" rule.
- Next is a throwaway prototype page outside `app/`: 10 species, leaf, bark, and fruit only. The owner uses it in three or four short sessions and writes notes. The choice of intake method waits for those notes.
- **Relation to `2026-09-30-leaf-only-v1.md`.** This record does not withdraw the leaf-only decision, and leaf work in content runs continues. The two conflict in the app: a tree card unlocks only after part cards on two or more parts, so leaf part cards alone never unlock one. When the app brings back bark and fruit is open.
- Open: how the manifest records "any season", how steps 1 to 3 map onto the `difficulty` field (only `hard` today), the quota size, and the feature lists for fruit, twig, and flower.
