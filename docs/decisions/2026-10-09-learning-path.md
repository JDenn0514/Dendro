# Learning path: words, then groups, then species

Date: 2026-10-09. Status: decided by the owner after the notes on the first prototype. Not yet in the app. A beginner prototype comes first.

## Context

- The learning model of 2026-10-09 (`2026-10-09-learning-model.md`) sets part cards and tree cards. It does not set the order in which a learner meets the trees.
- `DESIGN.md` section 2 runs the depth from type to group to species.
- `DESIGN.md` section 17 makes a unit one leaf bucket, taken through its depth. A bucket is a leaf shape, such as `simple_lobed`, not a tree group.
- The owner used the first prototype and wrote notes. This record and the round 2 changes to `2026-10-09-v1-parts-and-teach-first.md` come from those notes.

## Decision

### Broad to specific

- The path runs from words (the vocabulary), to groups, to species.
- Each word comes just in time, a little before the first group that needs it. Examples:
  - "opposite" and "alternate" come before the maples and the ashes;
  - "acorn" comes before the oaks.
- The stages overlap. Older cards come back for review.

### Groups are genera or families

- The middle level is real tree groups: a genus or a family. Examples: the oaks, the maples.
- Leaf-shape buckets are no longer groups. Leaf shapes, such as "lobed", become words in the vocabulary.
- The owner writes `content/units.json`. This decision changes how the owner groups the units. Agents do not change the file.

### Subgroups in large groups

- A large group splits into subgroups before its species. Examples: the oaks split into red oaks and white oaks; the pines into soft pines and hard pines.
- The path for a large group runs: group, then subgroup, then species.
- A small group, such as the tuliptree, has no subgroup level.
- A per-part depth of `group` can name a subgroup. Example: most acorns tell you "red oak" or "white oak", not the species.
- Which groups are large enough to split is open.

### Common trees first

The most common trees in the learner's area come first. The counts come from two sources:

- **Forest trees: USDA Forest Service FIA** (Forest Inventory and Analysis). FIA gives the estimated number of live trees of each species in each state. It counts forest land only. Source: <https://apps.fs.usda.gov/fiadb-api>.
  - The FIA table `REF_SPECIES` has the PLANTS symbol. 53 of the 58 current species match.
  - Five species need a crosswalk, a table that maps our symbol to the FIA symbol: ACFL, PLHI (FIA uses PLHY3), QUAC2, QUBO2, and QUMA13.
- **Planted trees: the McCoy et al. dataset of city street trees.** It has 5.66 million trees in 63 US cities, under CC0. Source: <https://zenodo.org/records/6726506>.

iNaturalist counts are a fallback only. They are used for a planted tree in a state that has no city data, and that order is marked less certain.

Canada and Mexico are a gap at first. Until the gap closes, "all of North America" means the US.

### All parts together

The main path teaches every part of a group or a species together: leaf, bark, and fruit. It does not teach one part at a time.

- The page of a group or a species covers all of its parts.
- The first cards after the page are part cards, one or more for each part.
- Tree cards unlock after part cards on two parts, as the learning model says.

### The usual look first

- A species is introduced with photos of its usual look: what it shows for most of the year. Example: red maple leaves are green, not autumn red.
- Photos from other seasons come in after the learner knows the species, for example once its part cards have each been answered right a few times.
- On tree cards, they appear on cards set in that season.
- The difficulty step does not change with the season. It measures how hard the photo is to read. An autumn leaf can be step 1.
- Autumn colour can be a real clue (red maple scarlet, sugar maple orange). A short autumn-colours lesson is possible later.
- Stage works the same way as season:
  - A young leaf that has not reached its full shape is step 3, because its features are not formed yet.
  - An unripe fruit with its full shape, such as a green acorn, gets its step from clarity alone. It can be step 1. It is not the usual look, so it does not appear on the species page or in the first cards.
- The usual look differs by part:
  - Leaves: the look for most of the year. Autumn colour is not the usual look.
  - Fruit: the ripe fruit, as guides describe it. Green acorns stay on the tree for months, but guides describe the ripe acorn, and ripe fruit lasts on the ground through autumn and winter.
  - Bark: the same all year.

### First-time hints (2026-10-12)

- The app has no separate tutorial and no text block that explains the path.
- The first time a learner meets each kind of screen (word page, card, tree card, end of a batch), the app shows hints on the real page.
- A hint outlines the real button or photo and points a short callout at it. It waits for the learner to do the step, not for a "Next" button.
- One to three steps per screen. Every step has "Skip". Each set shows once. A help button plays the hints again.
- On a phone, the callout sits above or below the outlined element, so it never covers it.

### Drawings, marks, and comparisons (2026-10-12)

From the owner's notes on the beginner prototype:

- **Word pages use simple line drawings** that show only the feature, for example opposite and alternate leaves, or plated and furrowed bark. A photo of the same word follows the drawing.
- **Group and species pages put arrows and labels on the photos.** Each mark points at what the text names, for example the veins that spread from the base. An agent places the marks. The owner checks them on a review page.
- **Comparisons cross groups.** Pages and miss screens compare a tree with the most similar tree the learner has met in any group, for example sycamore leaves with maple leaves.
- **Cards get a "Compare" button** that shows the two trees side by side, with their marks.
- **Both path views stay.** The home page shows the trail. The tree is a progress screen the learner opens on purpose.
- **Photo rules from the notes:**
  - Leaf arrangement counts as visible only when the photo shows where the leaf stalks join the twig.
  - A fruit photo must show how the fruit hangs when the card depends on it. A fruit held in a hand often hides this.
  - A colour line on a page must agree with the photos next to it.

### Answer options and word cards (2026-10-13)

- **A miss compares the learner's pick with the right answer.** Example: a learner picks maples for a London planetree leaf. The miss screen shows maple against London planetree and the clue that separates them. The "most similar tree met" comparison is for pages and the Compare button only.
- **Word cards take options from one feature family only.** A leaf can be lobed and toothed at once, so a card with both words has two right answers. The families are outline (lobed or not), edge (toothed or smooth), lobe shape (rounded, pointed, bristle tip), arrangement (opposite or alternate), bark, and fruit.
- **A small family gives fewer choices.** The app never fills a card with words from another family.
- **A word gets cards only when the learner has met trees that differ on it.** Until then the word is taught on a page only. Example: every tree in the beginner prototype has lobed leaves, so "lobed" has no cards there. Its cards start when the path reaches a tree without lobes.

### Comparisons and lobe tips (2026-10-13)

These replace the cross-group comparisons and the Compare button of 2026-10-12.

- **Side-by-side comparisons show only on miss screens.** They show the learner's pick against the right answer.
  - On a part card, the comparison shows only the part the card asked about.
  - On a tree card, it shows every part.
- **Pages have no comparison sections. Cards have no Compare button.**
- **Look-alikes are per part, not per tree.** Example: London planetree leaves look like maple leaves, but its bark and fruit balls look like American sycamore's.
- **A species page says, part by part, which other trees that part looks like.** It then says which parts settle it. The aim is to teach the learner to judge the tree from all of its parts together. Example: "Leaf: looks like a maple leaf. Check the bark and the fruit balls."
- **Lobe tips are one family with three answers, where only one can be true:**
  - rounded (white oaks);
  - sharp point, no bristle (maples);
  - bristle tip (red oaks). A bristle is a thin hair past the leaf's edge.
  The word page has a close-up drawing of all three tips.
- **Small photos show numbered dots, with the labels listed under them.** Full labels stay on large photos.
- **Trail markers show drawings, not photos** (2026-10-14). A small round marker would crop a photo, and photos stay whole at their own shape.

### Practice mode

- In practice mode the learner practises one part only, for example bark, on trees already met.
- When part cards show that a part is weak, the app suggests that part for practice.

### Tree cards start at the group

- Tree cards start in the group stage. The question is "Which group is this tree in?"
- The card is the full tree card, with a button for each part.
- When the learner reaches the species stage for that group, its tree cards ask for the species.
- **Form rule, for later.** No form photos exist yet.
  - A form card asks for the shape word (conical, vase, round).
  - Where shape is a real clue to the group, a form card can ask for the group.
  - A form card never asks for the species from one distant photo.

### Batches

New material comes in batches.

- The first batch has 4 items.
- The next batch has 5 items when the learner answered most of a batch right on the first try.
- It has 3 items when the learner missed several.
- A look-alike pair is a batch of 2.
- A batch never has more than 5 items.
- The prototype notes tune these numbers.

The next batch opens when the learner has answered each card in the current batch right once. The learner can skip ahead.

### Wrong options

- In the prototype and in the app, the wrong options come only from species, groups, or words that the learner has met.
- Early cards have fewer choices.

### Placement test

The placement test stays. It is rewritten to test words and groups, so a learner can skip what they already know.

### Next: a beginner prototype

The beginner prototype runs the full path on four groups:

1. The maples: red maple and sugar maple.
2. The oaks: white oak and northern red oak.
3. The tuliptree.
4. The sycamores and planetrees: American sycamore and London planetree. They are the look-alike pair, at the end.

- The words for leaf, bark, and fruit come first.
- The photos follow the new rules. An agent proposes candidate photos, each with a difficulty step. The owner makes the final call on review sheets.
- The notes on the first prototype found two more things that make a photo harder: an unusual angle, and light or shadow that changes the colour.

## What it replaces

- `DESIGN.md` section 2, the depth levels "type, group, species". They now run words, groups, species.
- `DESIGN.md` section 2, "channel selection and depth progression are independent", for the main path. One-part study moves to practice mode.
- `DESIGN.md` section 6, the channel focus of the session builder, for the main path.
- `DESIGN.md` section 17, "Unit = one level-1 bucket taken through its depth levels". Units now follow tree groups.
- `DESIGN.md` section 17, the placement test of 20 cards, and the placement deck of one card per level-1 concept. The test now covers words and groups.
- `DESIGN.md` section 18, "the score is only whether the learner named the species", for tree cards in the group stage.
- The look-alike sets of `2026-10-09-v1-parts-and-teach-first.md`. New material comes in batches.

## Open

- The list of groups, and their order in each area.
- The FIA and city data work: loading the counts, the crosswalk of the five symbols, and how forest and planted counts combine into one order.
- Canada and Mexico.
- Where the app marks an order from iNaturalist as less certain.
- How many choices early cards have.
- How the unit rules of section 17 (5 to 25 cards, the gate on the parent at 80%, wide first) apply to groups.
- How batches fit the daily cap on new cards (section 17).
- What a placement pass sets for a word or a group card. Section 17 sets tier `mc8` and an interval of 21 days.
- Which groups are large enough to get subgroups, and the subgroup list for each.
- How the two new difficulty factors enter the computed difficulty step.
