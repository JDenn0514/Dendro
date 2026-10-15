# Dendro

Dendro teaches a learner to name North American trees from photos, at a desk.

## Language

### Cards

**Part**:
One part of a tree that a photo shows: leaf, bark, fruit, twig, flower, or form. Form is a distant view of the whole tree.
_Avoid_: Channel (the name in the code and the older sections of `DESIGN.md`)

**Word card**:
A review card that shows a photo and asks for a word. The choices come from one feature only.

**Part card**:
A review card that shows one part of one species and asks for its group, subgroup, or species. It never asks deeper than the depth of that part. Part cards come before tree cards.
_Avoid_: Species card, channel card

**Tree card**:
A review card for one species in one season, with a button for each part. It asks for the group, the subgroup, or the species, from the stage the learner is at for that group. The learner can open any part at no cost. Its context is free.

**Context**:
The facts that a tree card gives at no cost: the state, the season, and the typical habitat, height, and leaf or needle size.
_Avoid_: Clue (a clue is read from a photo), hint

**Depth**:
How far one part can identify one species: `species`, `subgroup`, `group`, or `none`. Each value matches one stage of the path. It is a content value for each species and part, not a learner level.
_Avoid_: Level, tier

**Answer format**:
How a card takes the answer: 4 choices, 8 choices, reversed, or typed. A reversed card names the answer and asks which of four choices shows it. On a reversed tree card each choice is a whole tree, with a button for each part.
_Avoid_: Tier, level, inverted

**Miss comparison**:
The learner's pick and the right answer side by side on the miss screen. On a part card it shows only the part that the card asked about. On a tree card it shows every part.
_Avoid_: Compare button, contrast, most similar tree met

**Mastery**:
How well the learner knows a species. It comes only from tree cards.

**Weak part**:
A part whose part cards the learner often misses. The app suggests it for practice mode.

### Pages

**Page**:
The information page about one item: a word page, a group page, a subgroup page, or a species page. The app shows it before the first card on that item, and it stays open later as a reference.
_Avoid_: Lesson, intro card

**Species page**:
The page about one species. Each part on it has a part line and a look-alike line.
_Avoid_: Introduction page, comparison page

**Look-alike**:
A species whose part looks like the same part of another species. Look-alikes are per part: London planetree leaves look like maple leaves, but its bark and fruit balls look like American sycamore's. Each look-alike comes from one confusion edge in the content.
_Avoid_: Look-alike set (now a batch), confusion set, cluster

**Part line**:
The line for one part on a species page that says what the part looks like. Example: "7 to 10 rounded, finger-like lobes. No bristle tips."

**Look-alike line**:
The line for one part on a species page that says how far the part can be trusted, which trees share it, and which parts settle it. Example: "Leaf: looks like a maple leaf. Check the bark and the fruit balls."
_Avoid_: Look-alike section, reliability line

**Drawing**:
A simple line drawing that shows only one feature. Word pages and trail stops use drawings.

**Mark**:
An arrow, a label, or a numbered dot on a page photo that points at what the text names.
_Avoid_: Annotation, callout (a hint is a callout)

**Look-alike pair**:
Two species of the same group that look alike on most parts, such as American sycamore and London planetree. The app teaches them as one batch of 2.

### Words

**Feature**:
One thing to read on a part, such as the outline, the edge, the lobe tip, or the arrangement of a leaf.
_Avoid_: Feature family, word family, family (a family is a group)

**Word**:
One botany term for one value of a feature, such as lobed, toothed, or bristle tip. Leaf shapes are words.
_Avoid_: Concept, level-1 concept, bucket, vocabulary item

### Learning path

**Area**:
The US states that the learner picks at the start, or all of North America (for now, the US).
_Avoid_: Region

**Range**:
Where one species grows naturally. The answer screen of a tree card shows it.

**Path**:
The order of items for the learner's area, from words, to groups, to subgroups, to species. Common trees come first.
_Avoid_: Unit, map

**Item**:
One word, group, subgroup, or species on the path. Each item has one page.

**Stage**:
One level of the path: words, groups, subgroups, or species. The stages overlap.
_Avoid_: Growth stage (a photo value), level

**Group**:
A real tree group: a genus or a family, such as the oaks or the maples.
_Avoid_: Unit, bucket, leaf-shape group

**Subgroup**:
A part of a large group that the path teaches between the group and its species. Examples: red oaks and white oaks; soft pines and hard pines. Small groups have none.
_Avoid_: Section (the botanical rank), red oak group

**Batch**:
The new items that the app teaches together: 4 at the start, then 3 to 5, and never more than 5. A look-alike pair is a batch of 2. The next batch unlocks when each card in the batch is answered right once.
_Avoid_: Lesson, set, look-alike set

**Unlock**:
A batch or a tree card becomes available to the learner. The tree cards of an item unlock when its part cards are right on two different parts.
_Avoid_: Open (the learner opens a part or a page)

**Skip ahead**:
To unlock the next batch before each card in the current batch is answered right once.

**Met**:
An item is met when the learner has seen its page, or has skipped ahead past its batch.
_Avoid_: Seen, learned

**Trail**:
The home-page view of the path, with one stop for each batch.
_Avoid_: Map

**Stop**:
One batch, as the trail shows it.

**Progress tree**:
The progress screen that the learner opens on purpose.
_Avoid_: Tree (that is the plant)

**Practice mode**:
A mode where the learner practises one part only, such as bark, on trees already met. The main path teaches all parts together.
_Avoid_: Drill, part focus

**Placement test**:
A test at the start on words and groups, so a learner can skip what they already know.

**Hint**:
A first-time callout on the real page that outlines one button or photo and waits for the learner to tap it. A screen has 1 to 3 hints.
_Avoid_: Step, tutorial, coach mark

### Photos

**Season**:
Spring, summer, autumn, or winter, from the season tags of a photo. A tree card has one season.
_Avoid_: Fall

**Any season**:
The mark on a photo of a part that does not change through the year, such as bark. The photo can join a tree card of any season.
_Avoid_: All seasons, year-round

**Usual look**:
How a part looks for most of the year. For leaves it is the summer look, not autumn colour. For fruit it is the ripe fruit. Pages and first cards show only the usual look.

**Growth stage**:
How far a part has grown in one photo: a young leaf, an unripe fruit, or a ripe fruit.
_Avoid_: Stage (a level of the path)

**View**:
The angle and distance of one photo, such as a close-up or an underside. Photos that the learner compares match in season, growth stage, and view.

**Difficulty step**:
How hard it is to read the feature in one photo, from 1 (the feature alone and whole) to 3 (the learner must search for it, or it is not typical). It does not change with the season.
_Avoid_: Photo level, photo tier, step (alone)
