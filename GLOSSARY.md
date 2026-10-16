# Dendro

Dendro teaches a learner to name North American trees from photos, at a desk.

## Language

### Cards

**Part**:
One part of a tree that a photo shows: leaf, bark, fruit, twig, flower, or form. Form is a distant view of the whole tree. The code and the older sections of `DESIGN.md` call it a channel.

**Part card**:
A review card that shows one part of one species. Part cards are the first stage of learning.
_Avoid_: Species card, channel card

**Tree card**:
A review card for one species in one season, with a button for each part. The learner can open any part at no cost.

**Look-alike section**:
The section of an introduction page about a look-alike that the learner has already met: "You have met X. Here is how they are alike, and how to tell them apart." A look-alike comes from `content/confusion.json`. A look-alike pair is a batch of 2.
_Avoid_: Look-alike set, confusion set, cluster

**Introduction page**:
The information page about one species. The app shows it before the first card on that species, and it stays open later as a reference. Each part on the page says in plain words how reliable it is.
_Avoid_: Lesson, intro card, comparison page

**Depth**:
How far one part can identify one species: `species`, `group`, or `none`. It is a content value for each species and part, not a learner level.
_Avoid_: Level, tier

### Learning path

**Group**:
A real tree group: a genus or a family, such as the oaks or the maples. The path runs from words, to groups, to species.
_Avoid_: Bucket, leaf-shape group

**Subgroup**:
A part of a large group that the path teaches between the group and its species. Examples: red oaks and white oaks; soft pines and hard pines. Small groups have none.
_Avoid_: Section (the botanical rank), red oak group

**Batch**:
The new items that the app teaches together: 4 at the start, then 3 to 5, and never more than 5. A look-alike pair is a batch of 2. The next batch opens when each card in the batch is answered right once.
_Avoid_: Lesson, set

**Practice mode**:
A mode where the learner practises one part only, such as bark, on trees already met. The main path teaches all parts together.
_Avoid_: Drill, part focus

**Placement test**:
A test at the start on words and groups, so a learner can skip what they already know.

### Photos

**Any season**:
The mark on a photo of a part that does not change through the year, such as bark. The photo can join a tree card of any season.
_Avoid_: All seasons, year-round

**Photo difficulty step**:
How hard it is to read the feature in one photo, from 1 (the feature alone and whole) to 3 (the learner must search for it, or it is not typical).
_Avoid_: Photo level, photo tier
