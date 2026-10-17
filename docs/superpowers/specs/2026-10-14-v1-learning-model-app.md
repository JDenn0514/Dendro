# Version 1 of the app under the learning model: design

Date: 2026-10-14. Status: a draft for the owner to review. No code before the owner says go.

Rulings this design rests on:

- `docs/decisions/2026-10-09-learning-model.md`
- `docs/decisions/2026-10-09-v1-parts-and-teach-first.md`
- `docs/decisions/2026-10-09-learning-path.md` (rounds of 2026-10-12 to 2026-10-14 included)
- `DESIGN.md` section 18, which wins over section 17 where they disagree
- `docs/decisions/2026-09-25-hosting-and-accounts.md`, `2026-09-25-wildflower-permission.md`, and `2026-09-26-vt-dendrology-photo-permission.md`, which still hold
- `docs/superpowers/specs/2026-09-24-app-visual-design.md` and `scripts/CHECKLIST.md`

A second spec, written at the same time, covers the intake comparison and the photo audit: `docs/superpowers/specs/2026-10-14-intake-comparison-and-photo-audit.md` (here "the intake spec"). This design depends on it for every photo field. Section 3.7 lists the fields this design uses. That spec decides how the judge sets them.

The working prototype is `prototype/beginner-v2/`. It is throwaway code. The app copies its rules, not its files. Each rule below names the prototype function that shows it working.

Words in this spec follow `GLOSSARY.md`. The code and the data still call a part a "channel". This spec says "part", and keeps `channel` only as a field name.

## 1. Goal and scope

### Goal

The learner can name a real tree from what is visible that day, at a desk. The learner also learns the botany words on the way. The app teaches before it tests: a page comes before the cards on any new word, group, or species.

### What version 1 includes

- **Parts:** leaf, bark, and fruit. The app shows the 548 bark rows and 425 fruit rows again.
- **Species:** the 58 species in `content/species.json` today. All of them are in the old `simple_lobed` leaf-shape row of section 17.
- **Groups:** six, from the genera of those species: the maples (17 species), the oaks (34), the sycamores and planetrees (4), the sweetgum, the tuliptree, and the sassafras.
- **Subgroups:** the oaks only, as red oaks (PLANTS section `Lobatae`, 17 species) and white oaks (section `Quercus`, 15 species, plus QUMA13). The subgroup rule of section 3.4 gives this list (Q10). QUCE joins no subgroup.
- **The path:** words just in time, then groups, then subgroups, then species, in batches.
- **Part cards** with a depth for each species and part, and **tree cards** with their own schedule.
- **Three rules kept from section 17** (section 5): SM-2 spaced repetition with the full review log and the daily new-card cap; answer formats that change with the interval, with reversed cards; and mastery.
- **The miss comparison**, first-time hints, the enlarged view, the trail home, and the progress tree.
- **Area choice** at the start: one or more US states, or all of the United States.
- **The placement test,** rewritten for words and groups.
- **Practice mode** for one part (decided, Q38).

### What version 1 leaves out

- **Flowers.** They come after version 1 (decided).
- **Twig and form parts.** No photos exist. The form rule of the learning path waits.
- **Variety cards** (section 17). The app keeps their saved states and does not show them. See Q11.
- **A range map.** The tree card answer screen shows the range text and the elevation range. See Q12.
- **Notes and feedback inside the app.** The prototype's note boxes, notes log, "Copy notes", "Reset progress", and "Jump to stop" are prototype tools. The app does not need them. The owner reports problems through GitHub Issues. Export and import of progress stay in Settings.
- **Accounts.** Progress stays in localStorage (hosting decision of 2026-09-25).
- **Canada and Mexico.** The area screen says "All of the United States" until that gap closes (Q5).

### Common trees first: FIA and city data

The learning path orders trees by FIA forest counts and the McCoy et al. city street-tree data.

**Recommendation: version 1 ships with one hand order, and the app has no FIA code.**

- An agent reads the FIA national totals of live trees and the city dataset totals once. It drafts one order of groups and one order of species in each group.
- The owner checks the order and writes it into `content/units.json` (section 3.4).
- The area choice filters that order. It does not change it.
- Per-area order from FIA and city data comes after version 1 (phase 7).

Reasons:

- Version 1 has six groups. The order matters most inside a group. In the eastern states, where 20 to 31 of the 58 species grow, a national order puts the common species first in most cases. It fits the western states less well, but they have 2 to 11 of the species.
- Per-area order needs three open calls first: the crosswalk of five symbols (ACFL, PLHI to PLHY3, QUAC2, QUBO2, QUMA13), the rule that merges forest and planted counts, and where the app marks an order from iNaturalist as less certain.
- The hand order needs no change to the app later. A per-area order replaces only the input to the path builder.

## 2. Facts this design rests on

- `content/units.json` has three units today, one for each part: `leaf_types`, `bark_types`, `fruit_types`. Issue #16 says species cards may never enter a session because of this.
- `content/concepts.json` has 22 rows: 8 leaf-shape rows, 6 bark types, 8 fruit types. A row has `key`, `channel`, `name`, `accept`, and `description`.
- `content/confusion.json` has 136 edges on leaf, bark, and fruit. Each has `a`, `b`, `channel`, `a_not_b`, `b_not_a`, and `ref`. The sentences use botany words such as "sinus" and "midrib".
- `content/images/manifest.json` has 2,257 rows, 2,226 not retired. 650 of those carry `difficulty: "hard"`, and the app holds them back (`inPlay` in `app/logic/content.js`).
- Season is a tag today, not a field. Of the live rows, 363 of 1,253 leaf rows, 64 of 548 bark rows, and 116 of 425 fruit rows carry a season tag.
- `app/main.js` passes `ACTIVE_CHANNELS = ['leaf']` (the leaf-only decision, now replaced).
- The scheduler (`app/logic/scheduler.js`) is SM-2 with the tier ladder `mc4`, `mc8`, `inv`, `typed`. The store (`app/logic/store.js`) owns four localStorage keys: `dendro_cards`, `dendro_log`, `dendro_settings`, and `dendro_missing_edges`. `STORE_VERSION` is 1, and the log cap is 5,000 rows.
- Card IDs today: `concept:<channel>:<key>`, `group:<channel>:<Genus>`, `species:<SYMBOL>:<channel>`, `variety:<KEY>:<channel>`.
- Content IDs (`pipeline/lib/ids.ts`): `species:`, `variety:`, `concept:<channel>/<key>`, `unit:`, and `image:<hash>|<target>|<channel>`. They are append-only.
- `species.json` already has `section` from PLANTS. QUCE and QUMA13 have no section.

## 3. Data model

### 3.1 Who writes what

| Data | File | Written by | Checked by |
|---|---|---|---|
| Words and features | `content/concepts.json`, `content/features.json` (new) | the owner | the owner |
| Groups, subgroups, path order, pairs | `content/units.json` | the owner | the owner |
| Species fields, new and old | `content_src/species/<SYMBOL>.json`, built into `content/species.json` by `cli build` | the species-draft agent | a botany review agent, then the owner for learner clarity |
| Group and subgroup text, pair tips, word pair tips, drawing text | `content_src/teaching/`, built into `content/teaching.json` by `cli teaching build` (new) | a teaching-draft agent (new skill) | a botany review agent, then the owner |
| Drawings | `content/drawings/<key>.svg` | a drawing agent | the owner, on a review page |
| Marks on photos | `content_src/marks/<hash>.json`, built into `content/marks.json` by `cli teaching build` | a marks agent | the owner, on a review page |
| Photo fields | `content/images/manifest.json`, through the CLI only | the photo judge (intake spec) | the owner, on review sheets |
| Plain tip for a species pair | `content/confusion.json`, field `apart` | the edges-draft agent | the owner, before merge |

For each owner file, an agent drafts every row on a review sheet first. The owner copies the rows into the file and commits them. Agents do not change `content/concepts.json`, `content/units.json`, or `content/features.json`. A line in `CLAUDE.md` adds `content/features.json` to the owner's files.

### 3.2 Words and features

A word is a row in `content/concepts.json`. The old leaf-shape rows of section 17 that are not words, such as `simple_lobed`, stop being taught. Their rows stay, with `retired: true`, because IDs are append-only. The bark and fruit rows are already words.

New fields on a row of `concepts.json`:

| Field | Value | Rule |
|---|---|---|
| `feature` | a key in `content/features.json` | Required on a row that is not retired. The feature's `part` equals the row's `channel`. |
| `short` | one sentence | The line after a right answer. 20 words or fewer. |
| `retired` | `true` | A retired row gets no page and no card. |

- `description` stays. It is the definition on the word page.
- `accept` stays. It lists the typed answers.
- A word keeps its key when its meaning holds. The owner changes only `name`. Example: `papery` keeps its key, with the name "peeling bark". `ball` keeps its key, with the name "seed ball".
- New words get new keys. Examples from the prototype: `lobed`, `toothed`, `untoothed`, `simple`, `opposite`, `alternate`, `rounded_tips`, `sharp_tips`, `bristle_tips`, `cone_samaras`.
- Leaf arrangement is a leaf feature in version 1. Section 17 put it on the twig part, which has no photos yet.

`content/features.json` is a new owner file. A feature is one thing to read on a part (`GLOSSARY.md`). One row for each feature:

```json
{ "key": "lobe_tips", "part": "leaf", "name": "lobe tips",
  "prompt": "lobe tip", "photo_features": ["shape"], "drawing": "lobe_tips" }
```

- `prompt`: the noun in "Which word fits this lobe tip?" (`wordPrompt` in the prototype).
- `photo_features`: the judge's features (intake spec, Part 1) that a photo must show clearly before a word card on this feature can use it. Example: the edge needs `margin`.
- `drawing`: optional. A drawing of all the words of the feature side by side, shown once at the top of the word page (the lobe tips drawing).
- `one_only`: optional. A tree fits only one word of this feature. The lobe tips are `one_only` (round 5). The edge is not: a northern red oak leaf fits both edge words.

The features of the learning path: outline (lobed or not), blade (simple or compound), edge, lobe tips, and arrangement on the leaf; bark pattern (smooth, furrowed, plated, and the rest) on the bark; and fruit kind (samara, acorn, ball, and the rest) on the fruit. The features of section 18 for bark (texture, colour, pattern) come after version 1. A word belongs to one feature. A word card takes its wrong options from its own feature only.

The intake spec has its own feature list for the judge: shape, margin, venation, arrangement, and size for a leaf. The two lists differ. `photo_features` maps one onto the other. Q3 asks whether to merge them.

### 3.3 Drawings

- Each drawing is one SVG file in `content/drawings/<key>.svg`. The key is the word key, or the feature's drawing key.
- The text of each drawing is in `content_src/teaching/drawings.json`: `{ "<key>": { "alt": "...", "caption": "...", "ref": "..." } }`. `cli teaching build` copies it into `content/teaching.json`.
- `caption` says where to look. It does not repeat the definition (prototype fix pass 2).
- Rules, from `prototype/beginner-v2/content.test.js`, checked by `cli teaching build`:
  - the file parses as XML;
  - it uses palette colours only, with no white boxes;
  - text labels use Literata;
  - every drawing that the data names exists.
- **Credit.** The drawings are made for Dendro. They follow the descriptions in the sources that `ref` names. They copy no figure from a book or a site. The Sources screen gets one line: "Line drawings: made for Dendro." A drawing shows no credit line under it. The licence is question Q19.
- The 20 prototype SVGs in `prototype/beginner-v2/drawings/` are the starting set. Three of them are old names from before round 5 (`pointed_lobes`, `rounded_lobes`, `bristle`) and do not move.

### 3.4 Groups and subgroups in `content/units.json`

The learning path says units now follow tree groups. This design makes each group and each subgroup one row of `content/units.json`. The owner writes the rows.

- The three old rows (`leaf_types`, `bark_types`, `fruit_types`) stay, with `retired: true`.
- The order of the group rows is the order of the path. That is the hand order of section 1.

**Which groups get subgroups** (decided 2026-10-16, Q10). A group splits into subgroups when all three are true:

1. Some state has more than 10 of its species, so the group alone runs past 2 batches.
2. Botanists use the split: a PLANTS section or subgenus.
3. A learner can see the split on at least one part, for most members. Examples: oak acorns and bristle tips; pine needle bundles.

A species that fits no subgroup has depth `group` on the parts that show the split. In version 1 only the oaks pass. The maples fail test 3: no part shows a maple section to a learner. New large groups, such as the pines and the hickories, are checked against this rule when they come in.

A group row:

```json
{ "key": "maples", "kind": "group", "name": "maples", "one": "a maple",
  "noun": "maple", "accept": ["maple", "maples", "acer"],
  "genera": ["Acer"], "include": [], "exclude": [],
  "words": ["leaf/opposite", "leaf/alternate", "fruit/samara"],
  "species_order": ["ACRU", "ACSA3", "ACSA2"],
  "pairs": [] }
```

A subgroup row:

```json
{ "key": "red_oaks", "kind": "subgroup", "parent": "oaks", "name": "red oaks",
  "one": "a red oak", "accept": ["red oak", "red oaks"],
  "sections": ["Lobatae"], "include": [], "exclude": [],
  "words": ["leaf/bristle_tips"], "species_order": ["QURU", "QUVE"] }
```

Field rules:

- `kind`: `group` or `subgroup`. A row with no `kind` is a section 17 unit. It must be retired.
- `name` and `one`: the labels. "It is a maple." uses `one`.
- `noun`: in prompts, as in "Which kind of oak is this leaf from?".
- `accept`: the typed answers for group cards and subgroup cards.
- `genera`, `sections`, `include`, `exclude`: membership, computed as `unitMembers` computes it today. QUMA13 joins the white oaks through `include`.
- `words`: the words this group's page and cards need. The path puts each word just before the first group or subgroup that lists it (section 4.1).
- `species_order`: the hand order of the species. A member that the list leaves out comes last, by common name, and the validator warns.
- `pairs`: look-alike pairs. A pair is a batch of 2 by itself. Two pair members must be next to each other in `species_order`.

The owner authors, for version 1:

- 6 group rows and 2 subgroup rows;
- the order of groups and the order of species (from the agent's FIA draft);
- the `words` of each row (from the agent's draft);
- the look-alike pairs (from the agent's draft, out of `content/confusion.json`).

**Depth and the path groups.** Depth has four values, one for each level of the path: `species`, `subgroup`, `group`, and `none` (changed in the decision records on 2026-10-14). Example: a white oak acorn has depth `subgroup` (it says "white oak"), and oak bark that says only "an oak" has depth `group`.

### 3.5 Species fields

New fields in `content_src/species/<SYMBOL>.json`. The species-draft agent writes them from the sources it cites. The owner checks them for learner clarity. A text field holds `{ "text": "...", "ref": "<source>" }` in the authored file. `cli build` keeps only the text in `content/species.json`. The source stays in the authored file, where a reviewer reads it.

| Field | Shape | Use |
|---|---|---|
| `depth` | `{ "leaf": "species", "bark": "group", "fruit": "subgroup" }` | Which card asks about each part (section 4.3). One value for each part. |
| `depth_feature` | `{ "fruit": "two_heads" }`, optional | A photo must show this feature to ask for the species. Other photos ask for the next depth up: the subgroup, else the group. Example: a London planetree stalk with two seed balls names the species; one ball names the group (prototype `SPECIES_FRUIT_PHOTOS`). |
| `leaf_length_in` | `[2, 4]` | The typical blade length in inches, not the width. Shown on leaf part cards, on tree cards, and on the species page. |
| `fruit_length_in` | `[0.75, 1.25]` | The typical fruit size in inches: the longest side, or the width of a ball. Shown on fruit part cards, on tree cards, and on the species page (owner ruling 2026-10-17). |
| `trunk_diameter_ft` | `[1, 3]` | The typical trunk diameter of a mature tree, in feet, as the sources give it. Shown as a diameter on tree cards and on the species page (owner ruling 2026-10-17). |
| `words` | `{ "leaf": ["simple", "lobed", "toothed", "sharp_tips", "opposite"], "bark": ["plated"], "fruit": ["samara"] }` | The words that fit this species. They drive word contrast (section 4.2) and the words that are never wrong options on its photos. |
| `lines` | one text for each part | What the part looks like, on the species page and the miss comparison. |
| `looks_like` | one text for each part | The fixed half of the look-alike line: how far the part can be trusted, then "Check ..." (round 5). It names no tree. Plain words, such as "A weak clue. Check the bark." The app adds the names of the look-alikes (section 3.5 rules, Q14). |
| `description` | one text | One line on the tree card answer screen. |
| `place_tells` | `true`, optional | The typical place tells this tree from its group mates, as with American sycamore (wild, along streams) and London planetree (planted). A miss on a tree card then shows both habitat lines (prototype `placeClue`). |

Fields that stay: `range.text`, `elevation_ft`, `height_ft`, `habitat`, `arrangement`, `ref`, and the rest. `height_ft` is the typical height that tree cards show.

- `arrangement` must agree with `words.leaf`.
- `concepts` (one old concept row for each part) stays required until the old screens go (ticket 6.2). After that it is optional, and `words` replaces it.

Rules for the text, from the prototype content tests:

- Every learner sentence has 20 words or fewer.
- **A look-alike line names met trees only** (decided 2026-10-16, Q14). The look-alikes of a part come from the confusion edges of that part. The app shows the names of the met look-alikes, then the `looks_like` text. Example, for the keys of a maple: "Looks like: red maple, silver maple. A weak clue. Check the bark."
- When the learner has met no look-alike on a part, that part shows no look-alike line. The line shows once the learner meets a look-alike.
- No line says a part "settles it" when it does not.
- Every look-alike line has a "Check".
- A colour line agrees with the photos next to it.

### 3.6 Teaching text: `content_src/teaching/`

`cli teaching build` (new) reads these files, checks them, and writes `content/teaching.json`. It writes nothing when a check fails, as `cli build` does today.

- `groups/<key>.json`, one for each group and subgroup:
  - `intro`: one or two sentences at the top of the group page;
  - `lines`: one text for each part, as on the prototype group page;
  - `page`: on a group with subgroups only, the title and lines of the subgroup page ("Two kinds of oak: white oaks and red oaks").
- `pairs.json`:
  - `group`: `{ "maples|oaks": { "best": "fruit", "leaf": ..., "bark": ..., "fruit": ... } }`. The tip on a miss between two groups. `best` is the part to name first on a tree card.
  - `subgroup`: the same shape, for two subgroups.
  - `word`: `{ "toothed|untoothed": "..." }`. The tip on a miss between two words of one feature.
  - Keys are the two keys, sorted, joined by `|`.
- `drawings.json` (section 3.3).

The species pair tip is in `content/confusion.json` (section 3.8).

### 3.7 Photo fields (dependency on the intake spec)

The intake spec (`docs/superpowers/specs/2026-10-14-intake-comparison-and-photo-audit.md`, Part 1) decides how the judge sets the photo fields and how the 650 `hard` rows map onto steps. Its manifest fields are `step`, `usual_look`, `season`, `growth_stage`, `photo_features` (the photo features marked `clear`), `side`, `scale`, `not_for`, and `rules`. This design uses them as follows.

The intake spec called the growth stage field `stage`. In `GLOSSARY.md`, a stage is a level of the path. This design uses `growth_stage`. (Done on 2026-10-17: the intake spec review renamed `stage` to `growth_stage`, and the manifest field `features` to `photo_features`, because in `GLOSSARY.md` a feature is a word feature.)

| Field | Values (intake spec) | App use |
|---|---|---|
| `channel` | `leaf`, `bark`, `fruit` | The part. Exists today. |
| `step` | 1, 2, or 3 | The photo difficulty step (section 4.4). |
| `usual_look` | true or false | The usual look comes first (section 4.4). |
| `season` | `spring`, `summer`, `autumn`, `winter`, `any` | Which tree card season the photo joins. `any` joins every season. |
| `growth_stage` | leaf: `young`, `mature`, `autumn`; fruit: `young`, `unripe`, `ripe`, `after_seed_fall`; bark: `young`, `mature`, `old` | The growth stage. Matched photos have the same growth stage. |
| `photo_features` | the judge's photo features marked `clear` | Word-card photos, the view, `depth_feature`, and the arrangement rule. |
| `side` | leaf only: `upper`, `under`, `both` | The view. Matched leaf photos show the same side (owner ruling 2026-10-17). |
| `scale` | `hand`, `ruler`, `coin`, `person`, `other`, `none` | Fruit: a photo with a scale object ranks first in its difficulty step. Leaf and bark: neutral (owner ruling 2026-10-17). |

This design needs one more field. The intake spec added it on 2026-10-17 (Q1):

| Field | Values | App use |
|---|---|---|
| `not_for` | zero or more word features or depths, such as `["edge"]` or `["subgroup"]` | The photo must not test these. A word card on a listed feature leaves it out. A part card that asks at a listed depth leaves it out. Pages and tree cards still show it. |

`not_for` replaces two hand lists of the prototype:

- `WORD_CARD_EXCLUDE`: a sugar maple leaf with a few big points fits neither edge word well, so it gets `not_for: ["edge"]`.
- `SUBGROUP_CARD_EXCLUDE`: a red oak acorn with a deep, bowl-like cap looks like a white oak acorn, so it gets `not_for: ["subgroup"]`.

The judge proposes `not_for` from its `atypical` cause and the source text. The owner can set it through the CLI.

Rules that use the fields:

- **Step is computed.** The intake spec puts one pure function in `app/` that computes keep and step from the judge's marks. The pipeline imports it. The app reads the stored `step`.
- **The word a photo shows** is derived, not stored. A photo shows a word of a feature when the species' `words` has that word and the photo's `photo_features` holds every `photo_features` entry of that feature. `not_for` can take it away.
- **Arrangement.** A leaf photo shows the arrangement only when `photo_features` holds `arrangement`: the stalks show where they join the twig. The word is then the species' `arrangement`. This replaces the prototype's hand list `ARRANGEMENT`.
- **View** is derived from `photo_features` and `side`, as the prototype's `stageKey` does: a leaf on a twig when `arrangement` is clear, else one leaf, and for a leaf also its `side`; a fruit on the twig when `hang` is clear, else picked; bark close when `texture` is clear, else far.
- **Fruit hang.** A fruit card that depends on how the fruit hangs uses only photos with `hang` clear.
- **One observation.** The iNaturalist observation ID comes from the `origin` URL. It needs no new field.

**The `hard` rows.** The new app ignores `difficulty: "hard"` on a row that has a `step`. A `hard` row with no `step` stays held back, as today. The old app keeps its meaning of `hard` until cutover, as the intake spec requires.

**Before the audit is done.** A row with no `usual_look` counts as not usual. A row with no `step` counts as step 3. A row with no `season` takes its season from its season tag, else `any` for bark and `summer` for leaf and fruit. These photos then appear only late, so an unaudited species still works, poorly. The content gate (ticket 6.1) needs the audit done for every version 1 species.

### 3.8 Confusion edges

- A new optional field, `apart`: one plain sentence that tells the two trees apart on that part. It uses only words that the path teaches. 20 words or fewer.
- The edges-draft agent writes it. The owner reads it before merge.
- `a_not_b`, `b_not_a`, and `ref` stay. They are the botany source of `apart`.
- The miss comparison uses `apart` first. Without it, it uses `a_not_b` and `b_not_a`. Those are botanical, so the content gate needs `apart` on every edge between two version 1 species.

### 3.9 Marks

- One file for each photo: `content_src/marks/<hash>.json`, a list of marks.
- A mark: `{ "kind": "arrow" | "ring", "x", "y", "r"?, "tx", "ty", "label", "for": "lines.leaf" }`. Coordinates are fractions (0 to 1) of the whole image. `label` has 2 to 5 words. `for` names the text the mark supports.
- `cli teaching build` checks that the hash is in the manifest and in play, the numbers are in range, and the label has 2 to 5 words. It writes `content/marks.json`, keyed by hash.
- An agent places the marks. The owner checks them on a review page, the port of `prototype/beginner-v2/marks-review.html` (ticket 3.9).

### 3.10 IDs

Content IDs stay append-only. `ids check --base origin/main` covers the new ones.

| Content | ID | Retire with |
|---|---|---|
| A word | `concept:<part>/<key>` (as today) | `retired: true` on the row |
| A feature | `feature:<key>` (new prefix) | `retired: true` |
| A group or subgroup | `unit:<key>` (as today) | `retired: true` |
| A drawing | `drawing:<key>` (new prefix) | a `retired` entry in `drawings.json`; the file stays |

Path items use the content IDs: `concept:leaf/toothed`, `unit:maples`, `unit:red_oaks`, `species:ACRU`.

Card IDs live in localStorage. They are not content IDs, but the migration (section 7) depends on them:

| Card | ID | Today |
|---|---|---|
| Word card | `concept:<part>:<key>` | same form as the concept card |
| Group part card | `group:<part>:<group key>` | `group:<channel>:<Genus>` |
| Subgroup part card | `subgroup:<part>:<key>` | new |
| Species part card | `species:<SYMBOL>:<part>` | same |
| Tree card, group stage | `tree:group:<group key>` | new |
| Tree card, species stage | `tree:species:<SYMBOL>` | new |

A tree card is one card for each species, not one for each season. The app picks the season each time it shows the card (section 4.6). See Q17.

### 3.11 Validator changes (`app/logic/content.js`)

`validateContent` stays the one validator. The pipeline keeps importing it.

Errors:

- a word that is not retired has no `feature`, or a `feature` that `features.json` does not have, or a feature on another part;
- a feature names a drawing that `teaching.json` does not have;
- a unit row has no `kind` and is not retired; a subgroup has an unknown `parent`; `genera`, `sections`, or `include` name unknown values (as today);
- a `pairs` entry names a species that is not a member, or two members that are not next to each other in `species_order`;
- a species `depth` value is not one of the four, or names `subgroup` for a species with no subgroup;
- a `words` entry is not a word on that part, or holds two words of a feature marked `one_only` (the lobe tips);
- `arrangement` disagrees with `words.leaf`;
- a manifest `not_for` value is not a feature or a depth;
- a mark names a hash that is not in play, or has a number out of range;
- a confusion edge, a pair key, or a marks key names an unknown item.

Warnings (they do not stop a build):

- a species in a version 1 group has no `depth`, `words`, `lines`, `looks_like`, `description`, `leaf_length_in`, `fruit_length_in`, or `trunk_diameter_ft`;
- a learner sentence has more than 20 words;
- a group member is not in `species_order`;
- an edge between two version 1 species has no `apart`.

Dropped: the unit card-count warning (5 to 25 cards). Batches replace units as the size rule.

`cli teaching build` checks that files exist and that SVGs parse, because the validator runs in the browser and can not read the disk. `scripts/validate_content.js` runs both.

## 4. App logic

All of this is pure logic in `app/logic/`, with no DOM, as section 17 requires. Each rule has tests that port the matching cases of `prototype/beginner-v2/logic.test.js`.

New modules: `path.js`, `cards.js`, `photos.js`, `options.js`, `miss.js`, and `practice.js`. Changed: `content.js`, `question.js`, `grader.js`, `session.js`, `store.js`, `progress.js`. Removed at cutover: `lessons.js`.

### 4.1 The path and batches

The path builder (`app/logic/path.js`) takes the content and the area. It returns a list of chunks. A chunk is a list of items that stay in one batch.

1. **Area filter.** A species is in the area when `range.states` or `planted_states` shares a state with the area. A group or subgroup with no species in the area drops out. A word that no remaining group needs drops out.
2. **Groups, wide first.** Every group in the area, in `units.json` order, comes before any subgroup or species. The first two groups form one chunk, so the first group cards have a wrong option.
3. **Subgroups.** Then, group by group, the subgroups of a group form one chunk.
4. **Species.** Then, group by group, the species in `species_order`. A look-alike pair from `pairs` is a chunk of 2, marked `alone`.
5. **Words just in time.** Before each group or subgroup chunk, the words its rows list that are not placed yet. Words of one feature that come in together form one chunk, so their cards have options at once (the lobe tips).

The prototype path (`PATH` in `data.js`) is the expected output for its four groups. A test checks this.

Batches (prototype `cutBatch`, `nextBatchSize`):

- A batch takes whole chunks from the first item not met. A chunk never splits.
- The first batch has 4 items. After a batch, the next size depends on the first tries of the last batch:
  - 5 when 80% or more were right;
  - 3 when 3 or more were missed, or less than 50% were right;
  - else 4.
- A batch never has more than 5 items. An `alone` chunk is a batch by itself.
- **The gate.** The next batch unlocks when every card of the current batch that can be asked is right once. A card that can not be asked yet (section 4.2) does not hold the gate.
- **Skip ahead.** The learner can skip the current batch at any time. Every item of the batch counts as met. Its cards join later sessions as new cards, at most 3 for each session (prototype `skipBatch`, `buildSession` `late`). The trail lists its pages as "Read these pages".
- The store keeps the batches by their items, not by a position. When the area or the content changes, the next batch still starts at the first item not met. A species added later to a passed group comes next.

**Met.** An item is met when the learner sees its page in a batch, or skips its batch. A met item's page stays open as a reference.

**Daily limit.** The daily cap on new cards stays (section 5.1). One batch of species can hold up to 15 new part cards, so the cap acts on whole batches. See Q8.

### 4.2 Word cards and word contrast

- A word has one card, `concept:<part>:<key>`.
- **Contrast.** A word gets cards only when two trees differ on it: one has the word, one does not (`wordContrast`). The two trees come from the met species, plus the trees in the photos of the met word pages of that part. Until then the page teaches it, and its card can not be asked.
- **Options.** The wrong options are the met words of the same feature only. A word that fits the photo's tree is never a wrong option (`wrongWords`). A feature with few words gives fewer options. The app never fills in words from another feature.
- **Photo or drawing.** A word card shows a photo that shows this word (section 3.7). When a word has fewer than 2 such photos and has a drawing, the card shows the drawing (`wordCardMode`).
- A new card avoids the photo its page showed, so the first card does not test memory of the page.

### 4.3 Part cards and depth

For each met group or subgroup, one part card for each part: `group:<part>:<key>` and `subgroup:<part>:<key>`. The photo comes from any species of the group in the area.

For each met species and each part, the depth decides (prototype `speciesPartCard`, `cardAnswer`):

- `species`: a species part card that asks for the species.
- `subgroup` or `group`: the species gets no card of its own on that part when the path has the matching subgroup or group card. That card asks the same question. A right answer there also counts for each met species of the group with that depth (`alsoCountsFor`).
- `none`: no card on that part.
- With `depth_feature`, a photo without the feature asks for the next depth up: the subgroup, else the group.

Photo rules for part cards (prototype `cardPool`):

- A card that asks at subgroup or group depth leaves out photos whose `not_for` names that depth.
- A leaf part card shows the typical leaf length of the tree in the photo: "Typical leaf: 2 to 4 in long." A fruit part card shows the typical fruit size: "Typical fruit: 0.75 to 1.25 in."
- Prompts: "Which group is this leaf from?", "Which kind of oak is this leaf from?" (from `noun`), "Which tree is this leaf from?".

### 4.4 Photos: usual look, step, season

Prototype `allowedPhotos`, `cardPhotos`, `pagePhoto`, `matchedPhotos`.

- A new card shows usual-look photos at the lowest difficulty step in its pool.
- The difficulty step widens with the card's interval: interval 1 day or more adds one step, interval 4 days or more adds another. Never above 3.
- Photos that are not the usual look (autumn leaves, green acorns) join when the card's interval reaches 7 days.
- A page shows the usual look at the lowest difficulty step. For leaves, a photo with nothing else in the frame comes first. For fruit, a photo with a scale object comes first (owner ruling 2026-10-17).
- **Matched photos.** Photos shown side by side or stacked for comparison match in growth stage, season, and view. With no match among usual-look photos, the miss comparison tries every photo. With no match at all, each side shows its page photo.
- A card does not show the same photo twice in a row.

### 4.5 Wrong options and the choice count

Prototype `choiceCount`, `wrongItems`.

- Wrong options come only from items the learner has met, of the same kind as the answer.
- For a species answer, the same group comes first, then edge neighbours on the card's part, then the rest.
- **Choice count, typed answers, and reversed cards:** section 5.2.
- A card with no wrong option can not be asked.

### 4.6 Tree cards

Prototype `treeQuestion`, `treePhotos`, `openTreeCards`, `treeAsk`.

**Unlock.**

- The group tree card `tree:group:<key>` unlocks when group part cards for that group are right on two different parts, after the group is met.
- The species tree card `tree:species:<SYMBOL>` unlocks when the learner names that species right on part cards for two different parts, after the species is met. A right group or subgroup part card counts for a met species whose depth on that part is that group or subgroup.
- An answer given before the species was met does not count (prototype fix pass 2, ruling 1).
- Gating stays soft. The app recommends; the learner can skip ahead on the path.

**What a group tree card asks.**

- "Which group is this tree in?" at first.
- "Which kind of oak is this tree?" once every subgroup of the group is met.
- When a species tree card of the group unlocks, the group tree card leaves the sessions, and species tree cards take over.

**One season.**

- The app picks the season first. Then each part takes a photo from that season or `any`. A part with no such photo shows a disabled button: "No fruit".
- While the card's interval is under 7 days, the season is the usual-look season (summer for these deciduous trees).
- From 7 days, the season that covers the most parts with depth `species`, then the most parts, then the usual-look season, then spring, summer, autumn, winter. Never at random.
- When one iNaturalist observation covers two or more parts in that season, the card uses its photos for those parts.
- A species tree card must show at least one part that names the species, or the species has `place_tells`. Otherwise that season is not used.

**Free context,** labelled "typical": the season, the state, the typical place (`habitat`), the typical height, the typical leaf length, the typical fruit size, and the typical trunk diameter.

- The state is the first state of the learner's area where the tree grows. With "all of the US", it is the first state of its range.

**Parts.** A button for each part. Opening a part costs nothing. The app records which parts the learner opened before the answer. After the answer, all parts stay open for review, and opening them then is not recorded.

**Options** follow section 4.5, with two limits from section 18: the wrong options are in the learner's area, and each has a photo for that season or `any`. Confusion edge neighbours on any part come first.

**Answer screen.** "About the <tree>": the `description`, the range text, and the elevation range. With a miss, the miss comparison of section 4.7 comes first.

**Score.** Only whether the learner named the right item. In the group or subgroup stage, the card scores the group or subgroup.

### 4.7 The miss comparison

Prototype `missCompare`, `missClueLine`, `standIn`, `separatingPart`, `placeClue`.

- A miss compares the learner's pick with the right answer.
- **On a part card,** one row: the part the card asked about.
- **On a tree card,** one row for each part the card showed, the separating part first. The right side shows the card's own photos. The pick side shows the picked tree's photo of the same part and season, same growth stage and view first.
- **A word miss** shows the two drawings with their definitions, then a photo of each word.
- **Stand-in tree.** When the pick is a group or subgroup, its photos come from its met species that has a confusion edge with the card's tree on that part. Else, the first met species in `species_order`.
- **The tip,** in this order:
  1. species pair: the edge `apart` on the part;
  2. the edge `a_not_b` and `b_not_a`;
  3. two species of different groups: the group pair tip on the part;
  4. on a tree card only: an edge `apart` on another part;
  5. the right item's part line.
- Two groups or two subgroups use their pair tip. Two words use the word pair tip.
- When no shown part tells two trees of one group apart and the right tree has `place_tells`, the miss comparison shows both habitat lines.
- **Separating part** on a tree card: the group pair `best`, else a part with an edge between the two, else a part the right species names, among the parts the card showed.
- Photos on the miss comparison show their marks as numbered dots, with the labels listed under each photo.
- The teaching moment of `DESIGN.md` section 9 stays.

### 4.8 The scheduler

- SM-2 for each card, with automatic grading and the full review log: section 5.1.
- Tree cards have their own schedule. A tree card answer changes no part card. A part card answer changes no tree card.
- **New card state field `first_right`:** the date of the first right answer since the item was met. The batch gate and the unlock read it.
- **Relearning** stays: a miss comes back once at the end of the session as "to try again", with no log row and no state change.
- **Mastery:** section 5.3.

### 4.9 The session

`buildSession` takes the current batch, the met items, the card states, the log, and the date. It picks cards in this order, up to the session size (default 20, as today):

1. due cards first, most overdue first: word, part, and tree cards alike;
2. the cards of the current batch not yet right once;
3. late cards (cards of skipped items, or words whose contrast arrived later), at most 3.

Due cards come first, as section 17 says. When due cards fill the session, the batch waits for the next session. Rule 2 adds only cards that the daily new-card cap allows (section 5.1). The app then mixes the picked cards, so the learner does not meet all reviews before all new cards.

When the cap is reached and nothing is due, the trail says "No cards are due. Come back later."

### 4.10 Practice mode (decided, Q38)

- The learner picks a part: leaf, bark, or fruit.
- The session holds the word cards and part cards of that part on met items only, due cards first, then the cards with the most misses.
- **Schedule.** A practice answer writes a log row. It changes the card state only when the card is due, or when the answer is wrong. A right answer to a card that is not due does not push its interval out. See Q15.
- **Weak part.** For each part, the app takes the share of right first tries in its last 30 part-card answers. A part is weak when its share is 15 points or more below the best part, with at least 10 answers. The end-of-session screen and the progress screen suggest practice on that part.

### 4.11 Placement test

The placement test stays, rewritten for words and groups (learning path).

- It comes after the area choice, as an offer: "Do you already know some trees? Take a short test."
- The deck:
  - one word card for each feature in the area, with all of that feature's words as options;
  - two group part cards for each group in the area, on two different parts.
- About 20 cards in version 1. Section 17's rule that a placement test has no relearning stays.
- **A pass** on a word card, or on both cards of a group:
  - marks the item met and right once;
  - sets the card state as section 17 does: interval 21 days, ease 2.5, reps 1, so the next format is 8 choices;
  - for a group, also counts two parts toward the group tree card.
- The path then skips the passed items. Subgroups and species stay on the path. See Q9.

### 4.12 First-time hints

From `prototype/beginner-v2/hints.js` (owner review of 2026-10-13).

- Four hints:
  - `enlarge`: "Tap any picture to see it large.";
  - `marks`: "Arrows point at what the text describes.";
  - `answer`: "Pick an answer. A wrong pick costs nothing; the card comes back.";
  - `tree`: "Tap Leaf, Bark, or Fruit. Opening parts is free."
- Each hint shows once in the app, on the first screen that has its element.
- The hint outlines the real element, dims the rest, and points a short callout at it. It waits for the learner to tap the element. Every hint has "Skip".
- On a phone the callout sits above or below the element, never over it.
- A help button plays the current screen's hints again. A screen with no hints has no help button.
- The seen hints are in settings (`hints_seen`). Settings has "Show the hints again".

## 5. Kept from section 17: spaced repetition, formats, and mastery

The owner asked that version 1 keep three rules of `DESIGN.md` section 17. This section states each one and how it fits section 18 and the learning path. The prototype used a simple ladder of intervals (10 minutes, then 1, 3, 7, 16, and 35 days). Version 1 does not copy that ladder.

### 5.1 Spaced repetition as in Anki

- **SM-2 for each card,** as `app/logic/scheduler.js` does today: ease, interval, the interval chain 1, 4, 10, 25 days, and the due date.
- **Each card kind has its own schedule:** word cards, group and subgroup part cards, species part cards, and tree cards. A tree card answer changes no part card, and a part card answer changes no tree card (section 18).
- **Automatic grading:**
  - right maps to `good`;
  - right with the "I guessed" flag maps to `hard`;
  - wrong maps to `again`.
- **The slow-answer rule** of the 2026-09-22 review (a slow right answer grades `hard`) stays on word and part cards. It is off on tree cards, because opening parts takes time. See Q16.
- **The full review log.** Every answer writes one row: the card, the time, the grade, the time taken in ms, the format, and the option count, as today. New fields: the card kind, the photo hashes shown, and on a tree card the season and the parts opened before the answer. The log cap stays at 5,000 rows, as in the code (section 17 said 20,000; Q22).
- **Due cards first,** most overdue first (section 4.9).
- **The daily new-card cap** stays: default 10, set in Settings.
  - A card counts as new on the day of its first answer. Word, part, and tree cards all count.
  - A batch unlocks only when its cards fit in what is left of today's cap. The first batch of a day always unlocks, so a batch larger than the cap never blocks the path.
  - After the cap, sessions hold reviews only.
  - See Q8.

### 5.2 Answer formats that change as the learner improves

The format of a question depends on the card's interval, as section 17 first said.

| Interval | Format |
|---|---|
| a new card, or under 7 days | choice, from 2 options up to 4 |
| 7 to 21 days | choice, 8 options |
| over 21 days | typed recall |

- **The early choices.** Under 7 days the option count grows: 2 on a new card, 3 after its first right answer, 4 once its interval is 4 days or more.
- **Met items only.** The options come only from met items (section 18 and the learning path). The count is never more than the met items of the answer's kind allow. A card with 3 met items to choose from shows 3 options at most, at any interval.
- **A lapse drops one format.** After `again`, SM-2 sets the interval to 1 day. The format does not fall to 2 options. It drops one answer format from the one before the lapse: typed falls to 8 choices, 8 choices fall to 4. It stays there until the interval earns a higher format again.
- **Reversed cards** replace a normal question about one time in five, on the choice formats only. A reversed card names the answer and asks which of four choices shows it. It needs 4 different option items, each with a usable photo. With fewer, the app asks the normal question. A typed card is never reversed.

**How this fits the 2026-09-22 review.** That review replaced the interval rule with a tier ladder. A card moved up only after 2 `good` grades and an interval gate. The inverted question was a tier of its own. The app follows the ladder today. The owner's request brings back the interval rule and the one-in-five reversed card. This design follows the request. The stored `tier` and `tier_passes` fields go. A new field, `lapse_floor`, holds the format that a lapse set. See Q6.

Which formats each card kind gets:

| Card | Choice (2 to 4, then 8) | Reversed (about 1 in 5) | Typed |
|---|---|---|---|
| Word card | Words of the same feature | "Which photo shows a toothed edge?" The options are photos that show the other met words of the feature. No wrong photo may show the right word. A word in drawing mode asks "Which drawing shows bristle tips?" | The word, from its `accept` list |
| Group or subgroup part card | Met groups, or the subgroups of the group | "Which leaf is from a maple?" The options are photos of the same part from other met groups. | The group or subgroup, from its `accept` list |
| Species part card | Met species, the same group first | "Which leaf is red maple?" The options are photos of the same part from other met species, the same group first. | The common name or the scientific name |
| Tree card | Met species (or groups), in the area and season | "Which tree is a red maple?" The options are four whole trees, each with its own part buttons. See below. | The common name or the scientific name, or the group |

Rules for the photo options of a reversed word or part card:

- The photos match in growth stage, season, and view (section 4.4), so a difference in growth stage does not give the answer away.
- They follow the card's difficulty step and usual-look rules.
- A reversed card shows 4 photos, also at the 8-choice format. Eight photos do not fit a phone screen at a size where the learner can read them.
- No caption names a tree until the answer.
- Each photo shows the typical size of its own tree for that part: the leaf length on a leaf card, the fruit size on a fruit card (owner ruling 2026-10-17). Every photo fills its frame, so without this line the sizes can not be compared.

**Reversed tree cards** (ruling of 2026-10-14, `docs/decisions/2026-10-09-learning-model.md`):

- The card names the answer and shows four whole trees. Each tree has its own part buttons, as on a normal tree card.
- Reason: one part of two trees can look alike, and other parts settle it.
- The app prefers wrong trees that are in the card's season, in the learner's area, and look-alikes of the answer on at least one part. A wrong tree does not have to meet all three, so that enough trees are available.
- In the group stage, the card names a group and shows trees from different met groups.
- Each tree shows its own typical sizes: height, trunk diameter, leaf length, and fruit size. The season and the state stay on the card, because the four trees share them (owner ruling 2026-10-17).
- The phone layout is the card deck (decided 2026-10-15, section 6.5).

**Typed recall.**

- A species grades against any listed common name or the scientific name.
- A word grades against its `accept` list. A group or subgroup grades against its `accept` list.
- One normalizer for all, as section 17 says: lowercase, strip punctuation, collapse whitespace, and a hyphen equals a space.
- No partial credit. The same group with the wrong species is wrong.

### 5.3 Mastery

- **A card is mastered** when its interval is over 21 days and its last three reviews have no lapse (section 17).
- **A species is mastered** when its species tree card is mastered (section 18). Part cards do not set species mastery. They show which part is weak (section 4.10).
- **A word, a group, or a subgroup** takes the lowest mastery of its cards. A group's tree card counts among its cards.

Proposed mastery values that the learner sees, on the four darkest steps of the mastery ramp of the visual spec:

| Mastery | Rule for one card | Colour |
|---|---|---|
| New | no right answer yet | `#E6DFCE` |
| Learning | right at least once, interval under 7 days | `#C9D2B4` |
| Known | interval 7 days or more, not yet mastered | `#6B8F6A` |
| Mastered | interval over 21 days, no lapse in the last three reviews | `#3A5A3C` |

- The mastery values follow the answer-format bands of section 5.2: learning is the choice of 2 to 4 options, known is mostly 8 options, mastered is typed recall.
- A species before its tree card unlocks is at most "learning", once any of its part cards is right. Known and mastered need the tree card.
- These four replace the five level names of today's app (new, seen, familiar, strong, expert). `#9DB595` drops out of the ramp.

How the screens show them:

- **The trail** stays a map of the path. A done stop shows one small pressed leaf for each item, filled by its mastery. The current and later stops show no mastery. The trail shows no counts and no bars.
- **The progress tree** is where mastery shows in full. Each item's leaves take its mastery colour. A species twig takes the mastery of its tree card. A tap on an item shows its mastery by name and the mastery of each of its cards.
- **The species page** shows the species mastery by name under the name: "Known".

Decided 2026-10-16 (Q21): these four mastery values, shown as above.

## 6. Screens

The screens reuse the prototype's working designs. They follow the visual rules:

- the palette and the two fonts (Fraunces, Literata) are fixed;
- photos show plain and whole, at their own shape, on Paper, with no blend, mask, filter, or vignette;
- one bold move per screen;
- none of the tells in section 3 of the visual spec.

The running foot becomes Home, Progress, Practice. Settings and Sources stay in the header.

### 6.1 First run

1. **Area.** "Where do you look at trees?" A list of states to tick, and "All of the United States". The learner can change it later in Settings.
2. **Placement offer.** "Take a short test" or "Start from the beginning".
3. **Trail.**

### 6.2 Home: the trail

From `prototype/beginner-v2/trail.js`.

- One stop for each batch, down a winding trail. A stop is done, current, or ahead.
- Each stop has a round marker with a drawing, whole, on Paper. Never a cropped photo (2026-10-14). The drawing comes from the stop's first item: a word's own drawing; for a group or species, the drawing of its fruit word; for a subgroup, its lobe tips word. A leaf icon stands in when nothing fits.
- Only the current stop and the next show in full: the item names and a line each.
- The current stop has the one filled moss button: Continue.
- A done stop lists its pages for reading again. A skipped stop says "Read these pages".
- "Skip this stop" sits under Continue, as a plain text button.
- No progress bars and no stop totals. The counts change as batch sizes change.
- A done stop shows one small pressed leaf for each item, filled by its mastery (section 5.3).
- `scripts/CHECKLIST.md` changes its Home lines: "Continue is the one filled button" replaces "Dendro is the largest thing on the screen".

### 6.3 Pages

From `renderPage` in `prototype/beginner-v2/main.js`.

- **Word page:** the feature's drawing once at the top when the feature has one; for each word, the word large, its definition, its drawing with the caption, then "In a photo" and one photo.
- **Group page:** the group name, the intro, then for each part: the line, and matched photos of the first two species of the group in the area, by `species_order`. The prototype showed every species, but the maples have up to 11 in one state.
- **Subgroup page:** one page for all subgroups of a group: the title and lines, then for each part, each subgroup's line and a matched photo.
- **Species page:**
  - the name, the scientific name, and the mastery (section 5.3);
  - "One of the red oaks, in the oaks.";
  - a list of typical height, typical trunk diameter, typical leaf length, typical fruit size, and typical place;
  - for each part: the photo with marks, the part line, and the look-alike line when the learner has met a look-alike on that part (section 3.5).
- Pages have no comparison sections (round 5).
- Photos stack at full width. A tap opens the enlarged view.
- Each page photo has a small credit line under it. See Q13.
- In a batch, the bottom button says "Next page", then "Start the cards". As a reference, it says "Back".

### 6.4 Cards and the answer

From `renderPartCard` and `answerDock`.

- The prompt, then the photo (or drawing) in a frame of fixed height, then the choices in a bottom dock. The dock stays on screen at 375 by 667.
- A question photo has no caption and no credit until the answer. Its alt text names no tree.
- A leaf part card shows the typical leaf length under the photo. A fruit part card shows the typical fruit size.
- **Right:** "Right." and the item's part line, or the word's `short` line.
- **Miss:** the answer named once, large ("A red maple"), the tip in the dock, labelled "Tip", then "Your pick and the right answer" (section 4.7).
- The credits of every photo shown come after the answer.
- The head bar says "Card 3 of 12", then "Try again: 1 of 2".

### 6.5 Tree cards

From `renderTreeCard` and `revealTree`.

- The prompt, the context list, the part switch (Leaf, Bark, Fruit, with "No fruit" disabled), then the photo of the part on show, sized to the space left above the dock (`fitTreePhoto`).
- After the answer: the parts the learner opened, the miss comparison for every part shown, and "About the <tree>".
- **Reversed tree card: the card deck** (owner's pick, 2026-10-15). The working prototype is `prototype/reversed-tree/concepts/deck3.html`. The owner tried 11 layouts there. The others are not used.
  - **The stack.** The four trees are a stack of file cards, slightly fanned. Each card has an index tab with its letter, at its own place along the top edge, so all four tabs show. No other row of letters.
  - **Sizes.** Each card shows its own tree's typical sizes (section 5.2). The season and the state show once, above the deck.
  - **Tabs.** A tap on a tab brings that card to the top. Each tab shows three dots for the parts seen (leaf, bark, fruit; a dashed dot for a missing part), and marks the card on top and the picked card.
  - **Parts.** A tap or an upward flick on the top card turns it to its next part. The card header shows the letter, the part, and the part dots.
  - **Trees.** A sideways swipe throws the top card to the back. A short swipe springs back. "‹ Tree" and "Tree ›" buttons do the same.
  - **Same part.** The next tree opens on the part the learner was looking at, so the learner compares one part across trees. A tree with no photo of that part shows its "No fruit" face, with "Tap the card for the next part".
  - **Rule out.** A "✕ Rule out" button sits at the right end of the card header, in line with the part dots and off the photo. After the first use it shows only "✕". Its tap area is 44 px. A tap on it never turns the part or throws the card.
    - The ruled-out card leaves the deck. Swipes no longer reach it. Its tab stays, grey, with a line through the letter.
    - For 5 seconds the bottom dock shows "✕ Tree B ruled out" with "Undo", in place of the check button and at the same height. A pick ends the message at once.
    - A tap on a grey tab shows the card, greyed, with "Bring back" and "Close". A ruled-out card can not be picked. Ruling out the picked tree clears the pick.
    - When one tree is left, the dock offers "One tree left: pick tree D".
    - No drawing gesture: on a phone, a drawn line fights the swipes (owner, 2026-10-15).
  - **Pick, then check.** A full-width "Pick tree B" button under the card marks the pick. The dock then shows "Check: tree B is a red maple" ("a maple" in the group stage). No drag.
  - **After the answer.** All four cards come back with names. The right card and the pick are marked. A ruled-out tree shows "You ruled it out". When the learner ruled out the right tree, the verdict names the part on show: "You ruled out tree D, the red maple, on the bark."
  - Keys: arrows for trees and parts, P to pick, X or Delete to rule out, Escape to close a viewed card.

### 6.6 The enlarged view

From `openLightbox`.

- A modal dialog with a 44 px Close button.
- Pinch zoom. "Full size" shows the photo at its own size, 1200 px at most, centred. A photo that already shows at its own size has no "Full size".
- Escape, Close, or a tap on the space around the picture closes it.
- The large view always shows full mark labels.

### 6.7 End of session

From `renderEnd`.

- "Session done", the count right, and the state of the batch gate in one sentence.
- The stop summary of the batch.
- "Cards to look at again": each missed card with its line.
- One button: "Start the next batch" or "Continue".
- A practice suggestion when a part is weak (section 4.10).

### 6.8 Progress: the tree

From `prototype/beginner-v2/tree.js`. The learner opens it on purpose. Both path views stay.

- Words are the roots. Groups are the trunk and main branches. Subgroups and species are smaller branches and twigs.
- A branch gets leaves as its cards come right once. Each leaf takes the mastery colour of section 5.3. A species twig takes the mastery of its tree card.
- A skipped item has a dashed branch and grows leaves only from right answers.
- A tap on a part opens a sheet with the item's part line and a link to its page. On a phone, the sheet lists every part, and that list is the main way to pick.
- Under the tree, one line for each part: how often its part cards were right the first time. A weak part has a link to practice.
- **Geometry.** The prototype drew each branch by hand for 4 groups. The app computes the layout from the path: one branch for each group in the area, its subgroups and species spread along it. This is the largest new UI work. See risk 5.

### 6.9 Practice

- "Practise one part": three buttons, with the weak part marked "suggested".
- The session screens are the card screens of section 6.4.

### 6.10 Settings and Sources

- Settings: area, session size, new cards a day, text size, "Show the hints again", export and import. `open_units` goes.
- Sources: the photo sources as today, and the drawings line (section 3.3).

### 6.11 Screens removed at cutover

Lessons (`#/lessons`, `#/lessons/<channel>`), the progress grid and the concept page (`#/progress/<channel>/<concept>`). The species route `#/species/<symbol>` becomes the species page. New routes: `#/page/<item>`, `#/session`, `#/practice/<part>`, `#/progress`, `#/start`.

## 7. Migration of saved progress

The app has a few real learners, the owner among them. Their progress is in `dendro_cards`, `dendro_log`, and `dendro_settings`, all at version 1. The prototype's progress (prefix `dendro-proto-beginner-v2:`) does not move.

**Before the migration,** the store copies the four keys, as they are, into `dendro_backup_v1`. A rollback reads the backup.

`STORE_VERSION` goes to 2. `MIGRATIONS[1]` does this:

| Saved | Becomes |
|---|---|
| `concept:<part>:<key>` whose key is still a word | the same card, state kept |
| `concept:leaf:<key>` (a retired leaf-shape row) | kept in storage, not shown |
| `group:<part>:<Genus>` | `group:<part>:<group key>`, through the group's `genera`; state kept |
| `species:<SYMBOL>:<part>` | the same card, state kept; shown only when the depth gives that species a card on that part |
| `variety:*` | kept in storage, not shown |
| `dendro_log` rows | kept; new rows add `kind`, `opened`, and `season` |
| `dendro_settings` | `session_size`, `new_per_day`, `text_size`, and `last_export` kept; `open_units` dropped; `hints_seen: []` and `area: null` added |
| Card state fields | `interval`, `ease`, `due`, `reps`, `lapses`, and `recent` kept; `tier` and `tier_passes` dropped; `lapse_floor` added: the format one step below the old `tier` when that tier is below the card's interval band, else none |
| `dendro_missing_edges` | kept |

A new key, `dendro_path`, holds `met` (item to date) and `batches`.

After the migration, the app derives the rest:

- `first_right` of each card: the first right answer in the log for that card ID (old group IDs mapped).
- **Met:** every word, group, or species with a card that has a right answer. Its page counts as read.
- **Batches:** the path builder marks each chunk with only met items as done. The next batch starts at the first item not met.
- **Unlock:** from `first_right`. A learner who studied leaves only has one part right, so tree cards stay locked until bark or fruit is right. This follows the rule.
- `area: null` sends the learner to the area screen once.

An export from version 2 does not import into the old app. An export from version 1 imports into version 2 through the same migration.

## 8. Pipeline and content work

### 8.1 Skills

- **species-draft:** the new fields of section 3.5, with `fruit_length_in` and `trunk_diameter_ft` from the cited sources, the `{ text, ref }` shape, and the text rules. A new fill mode drafts the new fields into an existing file and changes no old field.
- **edges-draft:** the `apart` line, and new edges for group mates that version 1 pages and misses need.
- **teaching-draft** (new skill): the files of section 3.6.
- **photo-check:** the photo fields, through the intake spec.
- **content-run:** runs collect leaf, bark, and fruit again (decided). The rule "every run takes `--channels leaf`" ends.

### 8.2 Pipeline code

- `pipeline/lib/species.ts`: allow and check the new authored fields; flatten `{ text, ref }`.
- `pipeline/lib/ids.ts`: collect `feature:` and `drawing:` IDs.
- `cli teaching build` (new command in `pipeline/lib/commands.ts`): sections 3.3, 3.6, and 3.9.
- The manifest fields of section 3.7: the intake spec.

### 8.3 Drawings and marks

- Drawings: port the 20 prototype SVGs, less the 3 old names. Draw the new words: at least `unlobed` (sassafras has unlobed leaves), the sweetgum's star-shaped leaf if the owner makes it a word, and any word in the owner's list without one. The owner checks them on a review page.
- Marks: for each page photo of each version 1 species, group, subgroup, and word. A species page shows one photo for each part (174 photos), and the group, subgroup, and word pages add about 70. The marks agent places them group by group. The owner checks them on the review page.

### 8.4 Content runs for thin spots

The prototype found page lines that no photo shows. Each needs a targeted photo run. The owner makes the photo calls.

| Gap | Species | Photo needed |
|---|---|---|
| Ripe white oak acorns | QUAL and other white oaks | ripe, brown acorns, `usual_look`, autumn |
| Opposite leaves | ACRU, ACSA3, and other maples | a twig where the stalks show where they join, two at one spot |
| Smooth young bark | ACRU, LITU, and others whose line says "smooth when young" | young trunks, growth stage `young` |
| Pale leaf undersides | ACRU, QUAL | a leaf turned over, or both sides |
| White upper limbs | PLOC | the upper trunk and limbs, view `far` (bark until the form part exists) |
| Fruit sizes | ACRU keys, PLOC and PLHI balls, QURU acorns | fruit with a scale object |

## 9. Phases and tickets

Each ticket is one pull request. "Owner" marks a ticket that needs the owner's own work. The owner merges every pull request.

Every code ticket's definition of done includes `npm test`, `npm run test:pipeline`, `npm run validate`, and `npm run validate:dev` passing, and a CI pass on the pull request.

### Phase 0: rulings

| # | Ticket | Needs | Done when |
|---|---|---|---|
| 0.1 | **Owner:** answers the open questions of section 10. | this spec | each question has a ruling |
| 0.2 | A decision record and `DESIGN.md` section 19 for the rulings; the `CLAUDE.md` line for `content/features.json`. | 0.1 | the owner merges it |
| 0.3 | The implementation plan in `docs/superpowers/plans/`. | 0.2 | **Owner** reads the plan diff before any code |

### Phase 1: content model

| # | Ticket | Needs | Done when |
|---|---|---|---|
| 1.1 | Validator: the rules of section 3.11, with the new fields optional. | 0.3 | new cases in `tests/content.test.js` pass; today's content still validates |
| 1.2 | Fixture: `content_dev/` gets the 7 prototype species with every new field, 4 groups, 2 subgroups, the words and features, `teaching.json`, `marks.json`, and drawings. It is a port of `prototype/beginner-v2/data.js`. | 1.1 | `npm run validate:dev` passes; `tests/fixture.test.js` checks the new files |
| 1.3 | Pipeline: authored species fields and `{ text, ref }` (section 8.2); new ID prefixes. | 1.1 | new cases in `pipeline/tests/species.test.ts` and `ids.test.ts` pass |
| 1.4 | `cli teaching build`. | 1.1 | `pipeline/tests/cli_teaching.test.ts` covers each check and the write-nothing-on-failure rule |
| 1.5 | Photo fields in `ManifestRow` and the validator. | intake spec | its tests pass |

### Phase 2: the owner's structure

| # | Ticket | Needs | Done when |
|---|---|---|---|
| 2.1 | An agent drafts a review sheet: the word list with features, definitions, and `short` lines; the features; the group and subgroup rows with FIA-based order, `words`, and pairs. | 1.1 | the sheet is with the owner |
| 2.2 | **Owner:** writes the word rows in `content/concepts.json` and writes `content/features.json`. | 2.1 | `npm run validate` passes |
| 2.3 | **Owner:** writes the group and subgroup rows in `content/units.json`. | 2.1 | `npm run validate` passes |

### Phase 3: content

| # | Ticket | Needs | Done when |
|---|---|---|---|
| 3.1 | Skill updates of section 8.1, less photo-check. | 1.3, 1.4 | `docs(skills):` pull request merged |
| 3.2 | Species fields: the maples (17). | 2.2, 2.3, 3.1 | a botany review agent finds no open error; **owner** checks for learner clarity; no validator warning for these species |
| 3.3 | Species fields: the red oaks (17). | 3.2 | as 3.2 |
| 3.4 | Species fields: the white oaks and QUCE (17). | 3.2 | as 3.2 |
| 3.5 | Species fields: the planetrees, sweetgum, tuliptree, and sassafras (7). | 3.2 | as 3.2 |
| 3.6 | Teaching text: group and subgroup lines, pair tips, word pair tips. | 2.2, 2.3, 1.4 | as 3.2 |
| 3.7 | Confusion `apart` lines for every edge between version 1 species. | 3.1 | **owner** reads the edges before merge |
| 3.8 | Drawings and their review page. | 2.2 | `cli teaching build` passes; **owner** approves each drawing |
| 3.9 | Marks, group by group, with the review page port. | 3.10, 1.4 | **owner** approves the marks of each group |
| 3.10 | Photo audit of the version 1 species. | intake spec | every in-play row of the 58 species has the fields of section 3.7; **owner** photo calls |
| 3.11 | Content runs for the thin spots of section 8.4. | 3.10 | **owner** photo calls; the rows are published |

### Phase 4: app logic

All new modules are pure. Each ticket ports the matching prototype tests.

| # | Ticket | Needs | Done when |
|---|---|---|---|
| 4.1 | Store version 2 and the migration (section 7). | 1.1 | `tests/store.test.js` covers every row of the migration table, the backup, and a failed migration that leaves the old keys alone |
| 4.2 | `cards.js`: card IDs, depth, word contrast, what can be asked, unlock. | 1.2 | `tests/cards.test.js` |
| 4.3 | `path.js`: area filter, chunks, batches, gate, skip. | 1.2 | `tests/path.test.js`; the prototype `PATH` is the output for the fixture |
| 4.4 | `photos.js`: step, usual look, season, matched photos, tree card season. | 1.2, 1.5 | `tests/photos.test.js` |
| 4.5 | `options.js` and the `question.js` changes: wrong options, the format by interval, choice counts, reversed cards for each card kind (tree cards included), prompts, typed answers (section 5.2). | 4.2, 4.4 | `tests/question.test.js`, `tests/grader.test.js`; a test for each row of the format table |
| 4.6 | `miss.js`: the miss comparison and tip. | 4.4, 4.5 | `tests/miss.test.js` |
| 4.7 | `scheduler.js` and `session.js`: grading, `lapse_floor`, the tier fields removed, the daily new-card cap with the first-batch rule, due cards first, `first_right`, the tree card schedule, the slow-answer rule, practice, the new log fields (section 5.1). | 4.2, 4.3 | `tests/session.test.js`, `tests/scheduler.test.js` |
| 4.8 | Placement test logic. | 4.7 | `tests/session.test.js` placement cases |
| 4.9 | `progress.js`: the four mastery values, card mastery, species mastery from tree cards, tree progress, weak parts (section 5.3). | 4.7 | `tests/progress.test.js` |

### Phase 5: screens

The new screens ship behind `?path=1` until cutover. The old app stays the default. Each ticket runs `python scripts/audit.py` with no new line, and `python scripts/shots.py` at both phone widths.

| # | Ticket | Needs | Done when |
|---|---|---|---|
| 5.1 | Shell, routes, area screen, Settings changes. | 4.1, 4.3 | `tests/ui.test.js` route cases |
| 5.2 | The figure: photo, credit line, marks overlay with numbered dots on small photos, inline drawings, the enlarged view. | 1.2 | a test for the dots rule; the checklist lines for photos |
| 5.3 | Pages. | 5.2, 4.4 | each page kind renders from the fixture |
| 5.4 | Part and word cards, the answer, the miss screen. | 5.2, 4.6 | a card renders and answers from the fixture |
| 5.5 | Tree cards. | 5.4 | a tree card renders, opens parts, and records them |
| 5.6 | Trail home and end of session. | 5.3, 5.4 | the checklist's new Home lines |
| 5.7 | Progress tree, part lines, practice entry. | 4.9, 5.6 | the tree lays out 6 groups at 375 px |
| 5.8 | First-time hints. | 5.3, 5.4, 5.5 | hints show once; Skip works; the callout never covers its element at 375 px |
| 5.9 | Placement test screens. | 4.8, 5.4 | a placement pass skips the item on the path |
| 5.10 | Sources line for drawings; `scripts/CHECKLIST.md` and `scripts/audit.py` updated for the new screens. | 5.1 to 5.9 | **owner** walks the checklist at 390 px |

### Phase 6: cutover

| # | Ticket | Needs | Done when |
|---|---|---|---|
| 6.1 | A content gate script, `scripts/v1_gate.js`. It lists every gap: species fields, teaching text, `apart` lines, drawings, marks, and for each species and part with depth not `none`, at least one usual-look photo at step 1 or 2. | 1.1 | `tests/validate_script.test.js` cases; the gate prints no gap |
| 6.2 | Flip the default: the new app at `#/`, active parts leaf, bark, and fruit, the old screens and `lessons.js` removed, `concepts` optional on species. | 5.10, 6.1, 3.2 to 3.11 | **owner** play-tests a migrated copy of real progress and merges |

### Phase 7: after version 1

- Per-area order from FIA and city data.
- A range map on the tree card answer screen.
- Flowers, then twig and form, with the form rule of the learning path.
- Crown shape, with the form part (owner ruling 2026-10-17). Guides describe it in different words, and it changes with where the tree grows.
- Variety cards, if the owner wants them back.
- The intake method, after the intake comparison.

## 10. Open questions for the owner

The owner ruled on each question on 2026-10-16. Q18 closed on 2026-10-14.

| # | Question | Ruling |
|---|---|---|
| Q1 | Add `not_for` to the photo fields of the intake spec (section 3.7)? | Decided 2026-10-16: yes, as recommended. Without it, the two hand lists of the prototype come back as lists in `content_src`, and every new photo needs a hand check. The intake spec review adds the field. |
| Q2 | Who writes group text, pair tips, and word pair tips? | Decided 2026-10-16: as recommended. A teaching-draft agent, in `content_src/teaching/`, with sources. The owner checks learner clarity. The owner files hold structure and word definitions only. |
| Q3 | Features: a new owner file `content/features.json`, or fields on each word? And should the judge's feature list (shape, margin) and the word features (outline, edge, lobe tips) become one list? | Decided 2026-10-16: as recommended. A new file of about 7 short rows: a feature has a prompt, photo features, and a drawing, which do not belong on a word. Keep the two lists for version 1, joined by `photo_features`. "Shape" covers both outline and lobe tips, so a merge needs a new judge prompt. |
| Q4 | Common first: per-area FIA order in version 1, or one hand order? | Decided 2026-10-16: as recommended. One hand order, drafted from FIA and city totals (section 1). Per-area order after version 1. |
| Q5 | The second area choice: "All of North America" or "All of the United States"? | Decided 2026-10-16: "All of the United States", because the app has no Canada or Mexico data yet. |
| Q6 | Answer formats (section 5.2): the interval rule of section 17 with the one-in-five reversed card, in place of the tier ladder of the 2026-09-22 review? And the phone layout of a reversed tree card (section 6.5)? | Decided 2026-10-16: yes to the interval rule with the one-in-five reversed card, in place of the tier ladder. Reversed tree cards are decided (2026-10-14). Layout closed on 2026-10-15: the card deck with rule out (section 6.5), picked from 11 prototype layouts. |
| Q7 | Early choice counts: 2 on a new card, 3 after its first right answer, 4 from a 4-day interval, never more than the met items allow? | Decided 2026-10-16: yes, as the prototype. |
| Q8 | The daily cap of new cards (default 10): may the first batch of a day unlock even when it is larger than the cap? | Decided 2026-10-16: yes. Otherwise a batch of 4 species, with up to 12 new cards, never opens at the default. |
| Q9 | What a placement pass sets for a word or group card. | Decided 2026-10-16: section 17's values: interval 21 days, ease 2.5, reps 1, so the next format is 8 choices. A group passes with both of its cards right. |
| Q10 | Subgroups in version 1: the oaks only? Where does QUCE (European turkey oak, section `Cerris`) go? | Decided 2026-10-16: a rule, not a list (section 3.4). A group gets subgroups when some state has more than 10 of its species, botanists use the split, and a learner can see it on at least one part. In version 1 only the oaks pass. QUCE joins no subgroup. Its acorn and bark have depth `group`. The maples fail the third test. |
| Q11 | Variety cards in version 1? | Decided 2026-10-16: no. Keep their saved states. |
| Q12 | The range map on the answer screen? | Decided 2026-10-16: the range text and elevation in version 1. A map after version 1 needs a state map source and its licence. |
| Q13 | Credit form (open since round 2). | Decided 2026-10-16: pages: a small line under each photo. Cards: the credits after the answer, as today. |
| Q14 | Look-alike lines: fixed text, or names chosen from the trees the learner has met? | Decided 2026-10-16: names from met trees only, as decision 3 of 2026-10-09 first said. The look-alikes come from the confusion edges of each part. The fixed `looks_like` text (trust, then "Check") follows the names. With no met look-alike on a part, that part shows no look-alike line (section 3.5). |
| Q15 | Does a right practice answer on a card that is not due change its schedule? | Decided 2026-10-16: no. Only a due card or a miss changes it. |
| Q16 | The slow-answer rule on tree cards? | Decided 2026-10-16: off. Opening parts takes time. |
| Q17 | One tree card for each species, or one for each species and season? | Decided 2026-10-16: one for each species, season picked each time. Seasonal cards can come with more seasonal photos. |
| Q18 | Closed on 2026-10-14. `GLOSSARY.md` already has drawing, mark, usual look, trail, progress tree, and miss comparison. | None. |
| Q19 | A licence for the drawings? | Decided 2026-10-16: state none until the repo picks a licence. The Sources line says they are made for Dendro. |
| Q20 | Ship the new screens behind `?path=1` until the content gate passes? | Decided 2026-10-16: yes. The old leaf app stays the default until ticket 6.2. |
| Q21 | Mastery (section 5.3): new, learning, known, mastered, shown in full on the progress tree, and only on done stops of the trail? | Decided 2026-10-16: yes, as section 5.3. The four values follow the three answer-format bands, and the trail stays a map of the path. |
| Q22 | The review log cap: 5,000 rows (the code) or 20,000 (section 17)? | Decided 2026-10-16: keep 5,000 and the monthly export prompt. A photo hash is 64 characters, so a tree card row is over 200 bytes, and 20,000 rows do not fit in localStorage with the rest. The full log moves to the server when accounts come. |

## 11. Risks

1. **The photo audit is the critical path.** Every rule of sections 4.4 and 4.6 needs the fields of section 3.7. Without them, unaudited photos show late and seasons fall back to tags. Ticket 6.1 blocks cutover until the audit covers the 58 species.
2. **Botany errors in teaching text.** The prototype's first botany review found 14 errors in the text of 7 species and 4 groups, and a second review found more. Version 1 has about 600 lines. Each content ticket gets a botany review agent pass, and every line keeps its source in `content_src`.
3. **Owner time.** The owner authors 3 files, checks about 600 lines, the marks on about 250 photos, and the drawings, and makes the photo calls. The review sheets keep each call small. The phases let the owner work group by group.
4. **The oaks are large.** 34 oaks, 2 subgroups, and many look-alike pairs. The area filter helps less than hoped: 11 southern states have 16 to 20 oaks. That is 4 to 6 batches for each subgroup. If the owner's notes say this is too long, smaller subgroups are a later ruling.
5. **The progress tree layout.** The prototype drew 13 branches by hand. A computed layout for up to 6 groups and 58 species at 375 px is new work. A fallback is a list view with the same leaves.
6. **Migration.** Few learners, but a bad migration loses history. The backup key, the test of every table row, and an owner play-test on a copy of real progress (ticket 6.2) cover it.
7. **Word traps.** A photo that seems to fit two words of one feature gives a card two right answers. The species `words`, the `one_only` rule, and `not_for` on the photo guard this. The judge must propose `not_for` when the photo misleads.
8. **Pair tips in botany words.** Old edges say "sinus" and "midrib". The gate needs `apart` on every edge between version 1 species.
