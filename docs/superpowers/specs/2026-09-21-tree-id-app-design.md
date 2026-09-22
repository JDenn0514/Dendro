# Dendro app design

Date: 2026-09-21, revised 2026-09-22
Status: approved design after review, not yet built
Source: `DESIGN.md` sections 1 to 17, the brainstorming session of 2026-09-21, and the
review session of 2026-09-22

This spec covers the learning app only. The content pipeline (photo fetch, license
filter, photo approval) and the content itself (species list, vocabularies, confusion
graph) are separate specs. The app reads content as data files and never writes them.

---

## 1. What the app does

Dendro is a desk-based learning tool for North American tree identification. The user
studies one part of the tree at a time (leaf, bark, fruit, flower, twig) and moves from
broad categories to species to variety. Learning and testing are the same activity:
a session is a set of quiz cards, scheduled by spaced repetition.

Non-goals, from `DESIGN.md` section 1: not a photo identifier, no observation log, not a
field app, not social.

### v0 scope

In v0:

- The core quiz loop: session, question, grade, reveal, summary.
- The placement test.
- Progress grid, species screen, settings with export and import.
- Range, elevation, height, and habitat shown on every reveal and on the species screen.

v0 content, authored separately:

- Level-1 concept cards for the leaf, bark, and fruit channels.
- The `simple_lobed` leaf bucket taken to species for the Colorado region. The region is
  Colorado and the states next to it.
- Planted urban species in that region: Norway maple, red oak, silver maple, London
  plane, pin oak. A planted species is a full member of the bucket.

Next after v0, in this order: the flower channel, then `twig_arrangement`, then
`twig_buds`.

Cut from the model: twig pith and twig scars. The reason is photo supply. Pith needs a
cut twig. Scars need a macro shot. Photo libraries and iNaturalist rarely hold either.

Not in v0, reserved for later:

- Field sim mode (progressive reveal, separately scored).
- Range-prior questions ("which of these eight are plausible at 9,500 ft?").
- Range as a distractor filter.
- A region setting in the app. Each unit carries its own region instead.
- A click-through breakdown on the unit progress number.

---

## 2. Core model

### Channels

Six channels: `leaf`, `bark`, `fruit`, `flower`, `twig_arrangement`, `twig_buds`. Each
one is an ordinary channel with its own level-1 bucket list.

- `twig_arrangement` buckets: opposite, alternate, whorled.
- `twig_buds` buckets: scaled, naked, `clustered_terminal`.

Leaf arrangement is also a tagged attribute on every species, so distractor building and
miss explanations can use it on any channel.

The channel list derives from `concepts.json`. A channel with no concepts and no cards
does not render anywhere: not on home, not on progress, not on the species screen, and
not in the placement deck. v0 content therefore ships three channels.

### Depth levels

1. **Type**: the level-1 category within a channel, such as "plated" bark.
2. **Group**: genus or family within that category.
3. **Species**.
4. **Variety**: subspecies or variety within a species.

### Cards

The atomic unit is a card, not a species. Four card kinds:

| Card | Key | Example |
|---|---|---|
| ConceptCard | channel, level-1 category | `concept:bark:plated` |
| GroupCard | channel, genus | `group:leaf:Quercus` |
| SpeciesCard | channel, species | `species:QUGA:bark` |
| VarietyCard | channel, variety | `variety:QUGAG:leaf` |

Card IDs keep the colon separator. Cards are derived from content at startup, never
stored. A card exists only when its image pool has at least one entry. Adding a species
is a content change, not a code change.

### Photo pools

- A species card's pool is its manifest images on that channel.
- A group card's pool is the union of the member species' images on that channel.
- A concept card's pool is the union of the images of every species in that bucket on
  that channel. A manifest image with a concept target, such as `bark/plated`, is added
  to the same pool as an override for a textbook example.

A variety card exists only when the species has two or more varieties with approved
photos on that channel. Otherwise the variety is a note on the species screen and has no
card.

### Units

A unit is a named set of cards at one level in one channel, 5 to 25 cards in size. A
channel's level-1 concept cards are that channel's first unit. Below level 1, a unit
narrows by bucket, region, and where a genus is large, by genus or section. Every unit
below level 1 names a parent unit, and the app recommends a unit only when its parent is
far enough along (section 6). Gating is soft: the user can start any unit from the home
screen.

Units are ordered wide first: every bucket to level 2 before any bucket goes to level 3.
The order is a content decision in `units.json`, not code. The reason is the interleaving
evidence for similar categories (Kornell and Bjork 2008; Carvalho and Goldstone 2014):
mixing sibling species beats studying one group at a time.

---

## 3. Architecture

Static site. One HTML page, ES modules, a `content/` folder of JSON and images. GitHub
Pages serves the repo root. No build step, no server, no dependencies. The repo is
public.

**Two layers with a hard line between them.** Logic modules know nothing about the
browser. They import and export plain objects and run in Node for tests. Screen modules
render HTML and handle events. They call logic modules and compute nothing themselves.
This rule is what makes a later move to Svelte or React a rewrite of the screen layer
only.

**Naming.** Every data name is snake_case: JSON fields, bucket keys, unit keys,
localStorage keys, and directory names. Card IDs keep the colon separator. This spec
covers data shapes only. JavaScript identifiers follow JavaScript convention.

### Fixture content

`content_dev/` is a committed fixture content set: about six species and a few photos
that are public domain or owned by the project. The app boots against it with a URL
switch, for example `?content=dev`. The tests load the same fixture, so the fixture and
the app stay in step.

The shared fixture is always valid. A validation test carries its own small bad-content
object inline and does not edit the fixture.

### Continuous check

One GitHub Actions job runs on every push to `main`:

1. Run `node --test`.
2. Run the content validation against `content/`.

Pages deploys only when both steps pass. This is not a build step. The site is still the
repo root, served as it is.

### Repo layout

```
index.html                 one page, screens swap inside it
app/
  main.js                  boots the app, routes between screens, holds no state
  logic/
    content.js             loads, validates, and indexes content/*.json; derives cards
    scheduler.js           SM-2: grade a card state, return the new state
    session.js             builds a session deck from due and new cards
    question.js            picks format, samples a photo, builds options and distractors
    grader.js              normalizes and checks a typed or chosen answer
    progress.js            card states, levels, unit numbers
    store.js               localStorage read/write, export, import, reset, migration
  screens/
    home.js
    session.js
    progress.js
    species.js
    settings.js
  style.css
content/
  species.json
  concepts.json
  confusion.json
  units.json               ordered list of units, each a channel, level, and bucket
  images/
    SYMBOL/channel/NNN.jpg
    concepts/channel/category/NNN.jpg
    manifest.json
content_dev/               fixture content set, same shape as content/
tests/
  module.test.js           one per logic module, run with node --test
.github/
  workflows/
    check.yml              node --test, then content validation, then Pages deploy
```

---

## 4. Data model

### species.json

One record per species, keyed by USDA PLANTS symbol. PLANTS is the taxonomic authority
and the species-list source. Where PLANTS and iNaturalist disagree on a split, PLANTS
wins.

```json
{
  "QUGA": {
    "scientific": "Quercus gambelii",
    "common": ["Gambel oak", "Rocky Mountain white oak"],
    "audubon_name": "Gambel Oak",
    "inat_taxon_id": 47851,
    "inat_name": null,
    "genus": "Quercus",
    "genus_common": "oak",
    "section": "Quercus",
    "family": "Fagaceae",
    "arrangement": "alternate",
    "concepts": {
      "leaf": "simple_lobed", "bark": "furrowed", "fruit": "acorn",
      "flower": "catkin", "twig_arrangement": "alternate", "twig_buds": "clustered_terminal"
    },
    "range": { "text": "Colorado Plateau and southern Rockies",
               "states": ["CO", "UT", "NM", "AZ"] },
    "planted_states": [],
    "elevation_ft": [5000, 9000],
    "height_ft": [15, 30],
    "habitat": "Dry slopes and foothills with pinyon and juniper",
    "native_status": "native",
    "varieties": [
      { "key": "QUGAG", "name": "var. gambelii", "note": "The widespread form." }
    ]
  }
}
```

Rules:

- `species.json` holds only species that have at least one card, or that a confusion edge
  or a variety needs. The file grows with the photo pool; it is not the whole flora.
- A record with no manifest images fails validation, unless a confusion edge names it.
- `concepts` places the species in each channel's level-1 bucket. A missing channel means
  no card on that channel.
- `planted_states` is an array of state codes, hand-authored for common urban species. It
  records where people plant the species, not where it grows wild.
- `inat_name` is set only when iNat uses a different name; otherwise null.
- `common[0]` is the display name. All entries are accepted as typed answers.
- Inclusion rule for the species list: PLANTS growth habit is "tree" or "tree, shrub."
  Shrub-only species are excluded. Hybrids, marked with a multiplication sign in the
  PLANTS name, are excluded. A manual include list exists for exceptions and is empty in
  v0. Non-native species are included and flagged by `native_status`.
- `genus_common` is the group's common name, such as `oak`. A group card accepts it as a
  typed answer (section 7). Every species in a genus carries the same value.
- `arrangement` is one of `opposite`, `alternate`, `whorled`. It is the tagged attribute
  from section 2, shown on the species screen and usable in miss explanations.
- `section` is optional. It names a recognized split inside a large genus, such as the
  red oaks (`Lobatae`) and the white oaks (`Quercus`). Units can filter on it. It is
  shown on the species screen when present.
- Varieties roll up to the species for levels 1 to 3.

### concepts.json

One record per channel and level-1 category: key, display name, one-paragraph
description, and `accept`. Image pools come from the manifest.

`accept` is an array of typed answers that grade as right. For plated bark:

```json
{ "key": "plated", "channel": "bark", "name": "Plated / blocky",
  "accept": ["plated", "blocky", "plated blocky", "plate bark"],
  "description": "..." }
```

Level-1 vocabularies are in `DESIGN.md` section 3.

### confusion.json

A list of edges:

```json
{ "a": "QURU", "b": "QUVE", "channel": "leaf",
  "a_not_b": "Northern red oak has shallower sinuses and shorter bristle tips than black oak.",
  "b_not_a": "Black oak has deeper sinuses, longer bristle tips, and larger hairy buds.",
  "ref": "Virginia Tech Dendrology fact sheet, Quercus velutina" }
```

`ref` names the reference the two sentences came from. Edges are per channel and
undirected for distractor building. For the reveal, `a_not_b` is shown when the correct
answer is `a` and the user picked `b`; `b_not_a` is the reverse.

### units.json

Ordered list, wide first. Each entry: `key`, `name`, `channel`, `level`, `parent`, the
level-1 `bucket` it covers, `states`, and the optional `genera`, `section`, `include`,
and `exclude` filters.

```json
[
  { "key": "leaf_types", "name": "Leaf types", "channel": "leaf", "level": 1,
    "parent": null },
  { "key": "simple_lobed_genus", "name": "Simple lobed leaves", "channel": "leaf",
    "level": 2, "parent": "leaf_types", "bucket": "simple_lobed",
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"] },
  { "key": "simple_lobed_maples_co", "name": "Maples", "channel": "leaf",
    "level": 3, "parent": "simple_lobed_genus", "bucket": "simple_lobed",
    "genera": ["Acer"], "states": ["CO", "UT", "NM", "WY", "NE", "KS"] },
  { "key": "simple_lobed_oaks_co", "name": "Oaks", "channel": "leaf",
    "level": 3, "parent": "simple_lobed_genus", "bucket": "simple_lobed",
    "genera": ["Quercus"], "states": ["CO", "UT", "NM", "WY", "NE", "KS"] },
  { "key": "simple_lobed_other_co", "name": "Sycamore, sweetgum, tulip tree",
    "channel": "leaf", "level": 3, "parent": "simple_lobed_genus",
    "bucket": "simple_lobed", "genera": ["Platanus", "Liquidambar", "Liriodendron"],
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": ["PLAC"], "exclude": [] }
]
```

Unit membership is computed, not listed:

1. Take every species in the bucket whose `range.states` or `planted_states` overlaps the
   unit's `states`.
2. Keep only species whose `genus` is in `genera`, when `genera` is present.
3. Keep only species whose `section` equals the unit's `section`, when present.
4. Add every symbol in `include`.
5. Remove every symbol in `exclude`.

Level-1 units cover a whole channel, have `parent` null, and need no `states`. A level-2
unit's parent is its channel's level-1 unit. A level-3 unit's parent is the level-2 unit
for its bucket. A level-4 unit's parent is the level-3 unit that holds its species.

The reason for `genera` and `section`: genus size varies wildly. PLANTS lists 1 tanoak,
6 chestnuts, and about 90 oak species after hybrids are removed. One unit for all lobed
leaves at level 3 would hold over 100 cards and never finish. Region is the first
splitter, genus the second, section the third for oaks. Small genera are bundled into one
unit through `genera`. Content validation warns when a unit has fewer than 5 or more than
25 cards.

### images/manifest.json

One record per image:

```json
{ "file": "images/QUGA/bark/001.jpg", "target": "QUGA", "channel": "bark",
  "source": "USDA PLANTS Database", "author": "USDA NRCS",
  "license": "public domain (US government work)",
  "origin": "https://plants.usda.gov/plant-profile/QUGA/images",
  "tags": ["winter"],
  "checked_by": "photo_check_agent",
  "checked_at": "2026-09-22",
  "note": "Bark fills the frame and is sharp. Source page names Quercus gambelii." }
```

`target` is a species symbol, a variety key, or a concept key in the form `bark/plated`.
Images are vendored into the repo, resized to about 1200 px on the long side. The app
never hotlinks. Attribution is displayed wherever the image is shown.

`license` must come from the source page and must permit redistribution: public domain, a
US government work, or a CC license. Anything else is not used.

### Photo approval

An agent, not the owner, checks each candidate image on three points:

- **Channel and quality.** The photo shows the channel. It is sharp. The subject fills the
  frame. No hand and no ruler are in the shot.
- **License.** The source page states a redistributable license, and the manifest row
  matches it.
- **Identity by source.** The source page names the same species as the manifest row.

Identity is trusted from the source, never from the agent's own recognition of the plant.
Eligible identity sources:

- iNaturalist, research grade.
- USDA PLANTS.
- US Forest Service.
- NRCS.
- Wikimedia Commons, with a species-level category.
- University dendrology collections that name the species. These are used for identity
  reference only when their license forbids vendoring.

The agent escalates to the owner in three cases, and no others:

- The species on the source page and the species in the row differ.
- The license is missing, ambiguous, or not redistributable.
- Channel or quality falls below the fixed threshold.

When more than a quarter of the images in a run escalate, the run stops. A stopped run is
a signal that the source list or the threshold is wrong.

`checked_by`, `checked_at`, and `note` record the agent run and its verdict.

### Card state (localStorage)

One object per card ID:

```json
{ "interval": 12, "ease": 2.5, "due": "2026-10-03", "reps": 9, "lapses": 1,
  "recent": ["good", "good", "hard"], "tier": "mc8", "tier_passes": 1 }
```

- `tier` is one of `mc4`, `mc8`, `inv`, `typed`. It sets the question format and the
  displayed level. See section 7.
- `tier_passes` counts `good` grades earned at the current tier.
- `recent` holds the last three grades. It is kept for logging and review only; no rule
  reads it.
- A card with no state object is at level 0.

### Review log (localStorage)

An array of rows:

```json
{ "card": "species:QUGA:bark", "at": "2026-09-21T14:03:11Z", "grade": "good",
  "format": "mc4", "options": 4, "elapsed_ms": 4200, "answer": "Gambel oak" }
```

- `format` is one of `mc4`, `mc8`, `inv`, `typed`.
- `options` is the integer count of options shown. A typed question logs 0.
- The log is capped at 20,000 rows. When it is full, the oldest row is dropped.

This log is the input a later FSRS fit needs.

### Settings (localStorage)

```json
{ "session_size": 20, "new_per_day": 10 }
```

---

## 5. Scheduler

SM-2, on individual cards. One pure function: `(state, grade, today) -> newState`.

### Grade derivation

The answer produces a grade before the scheduler runs:

| Outcome | Grade |
|---|---|
| Wrong | again |
| Right, and the guess box is checked | hard |
| Right, and `elapsed_ms` exceeds the format threshold | hard |
| Right, and neither applies | good |

Format thresholds:

| Format | Threshold |
|---|---|
| `mc4` | 8 s |
| `mc8` | 15 s |
| `inv` | 20 s |
| `typed` | 20 s |

Above 60 s the time signal is discarded. The app assumes an interruption, and only the
guess box decides between `good` and `hard`. A wrong answer is `again` whatever the time
was.

The timer starts when the photo has loaded, not when the card is built. `elapsed_ms` is
logged on every answer.

### SM-2 rules

- **New card**: first right answer sets interval 1; second sets interval 4. After that
  the normal rules apply. With ease 2.5 the chain for a card always answered `good` is
  1, 4, 10, 25 days, which is Anki's default.
- **good**: interval = round(interval x ease). Ease unchanged.
- **hard**: interval = round(interval x 1.2). Ease drops by 0.15.
- **again**: interval = 1. Lapses + 1. Ease drops by 0.2.
- Ease starts at 2.5 and has a floor of 1.3.
- `due` = today + interval, as a `YYYY-MM-DD` string. "Today" is the local calendar
  date. A card is due when `due` is today or earlier. Nothing runs during the day.
- `reps` counts every review.

---

## 6. Session builder

Input: channel focus (one channel or all), optional chosen unit, card states, content,
review log, settings, today. Output: an ordered list of card IDs.

1. Collect due cards in the focus. Sort most overdue first.
2. Take up to `session_size`.
3. If short, add level-0 cards from the target unit, in content order, until the session
   is full or today's new-card count reaches `new_per_day`. Today's count is the number of
   log rows today whose card had no prior row. The target unit is the chosen unit if
   given, otherwise the recommended unit: the first unit in the focus, in `units.json`
   order, that has level-0 cards and whose gate is open. The session builder calls these
   cards "unseen" internally.
4. Shuffle.

Multiple sessions per day are allowed. After the daily cap, sessions contain due cards
only. An empty result means nothing is due and the cap is reached; the home screen says
so.

### Unit gate

A unit's gate is open when it has no parent, or when 80 percent or more of the parent
unit's cards are at level 2 or higher. Level 2 means the card has promoted out of `mc4`,
which takes two `good` answers and an interval of 7 or more: in practice, right about
three times in a row.

The gate affects the recommendation only. A user can start a closed unit from the home
screen, and the home screen marks each unit open or closed. When every open unit in the
focus has no level-0 cards left, the recommendation is empty and the home screen says
which unit opens next and how far its parent is from the threshold.

With the default cap of 10 new cards a day and mostly right answers, the leaf channel in
v0 runs about: level 1 in week 1, level 2 from week 2, level 3 from week 3.

### Relearning

A card graded `again` is re-queued once, at the back of the current session. The
re-answer writes no log row and changes no card state. The summary counts the card as
missed whatever the re-answer was. Relearning does not apply inside the placement test.

### Distractor source

Distractors come only from species that have a card on this channel. The rule holds for
name options and for photo options, in every session and in the placement test.

### Placement test

A fixed deck: one card per level-1 concept, in every channel present in content. In v0
that is 21 cards: 8 leaf, 6 bark, 7 fruit. Format is always `mc4`.

A right answer sets that card's state to tier `mc8`, `tier_passes` 0, interval 21, ease
2.5, reps 1, due today + 21. A wrong answer leaves the card at level 0. Placement results
write card state but not the review log, so they do not count against the daily cap.

---

## 7. Questions, ladder, progress

### Tier and level are one thing

A card's tier sets its question format and its displayed level. There is no separate
mastery label.

| Level | Name | Card state |
|---|---|---|
| 0 | novice | no state object |
| 1 | beginner | tier `mc4` |
| 2 | intermediate | tier `mc8` |
| 3 | advanced | tier `inv`, or tier `typed` with `tier_passes` 0 |
| 4 | expert | tier `typed` with `tier_passes` 1 or more |

**The question format always equals the tier.** The interval gates promotion only; it
never picks the format.

### Promotion

A card promotes when both conditions hold:

- `tier_passes` reaches 2.
- The interval reaches the gate for the next tier: 7 for `mc8`, 21 for `inv`, 21 for
  `typed`.

Only a `good` grade counts as a pass. A `hard` grade does not. On promotion `tier_passes`
resets to 0.

Level 4 needs no promotion step: a card at tier `typed` reaches expert on its first `good`
at that tier.

### Demotion

A grade of `again` resets `tier_passes` to 0 and drops the card one tier: `typed` to
`inv`, `inv` to `mc8`, `mc8` to `mc4`. A card at `mc4` stays at `mc4`. There is no
exception for level 4: an expert card that lapses goes to tier `inv` and level 3, and it
must earn `typed` again to return to expert.

### The inverted tier

`inv` is a tier, not a random flavor of another question. It is never chosen at random.

An `inv` question names the answer and shows photos as options: one photo from the correct
card's pool, the rest from distractor species that have photos on this channel. The
distractor ladder below runs in full. The option count is the number of usable photos
available, up to 8.

When fewer than 4 photo options are available on a channel, the `inv` tier is skipped on
that channel. Promotion from `mc8` then goes straight to `typed`, and still needs the 2
`mc8` passes and the interval gate. Demotion from `typed` then goes to `mc8`.

### Photo sampling

One image at random from the card's pool. The same image is not shown twice in a row for
that card. The last image shown per card is held in memory for the session only.

### Prompts and options

| Card | Prompt | Options |
|---|---|---|
| Concept | "What [channel] type is this?" | other level-1 categories in the channel |
| Group | "Which genus?" | other genera in the same level-1 bucket |
| Species | "Which species?" | distractor ladder below |
| Variety | "Which variety?" | sibling varieties of the species |

Each option shows the common name with the scientific name under it.

At tier `mc8`, a channel with fewer than 8 species with cards shows as many options as
exist. For concept and group cards, below 4 options the question falls back to `typed`
for that answer only; the tier does not change. A bark concept card at tier `mc8`
therefore shows 6 options, one per bark category.

### Distractor ladder for species cards

Fill the requested option count by walking down, shuffling within each step:

1. Confusion-graph neighbors on this channel.
2. Confusion-graph neighbors on any channel.
3. Same genus.
4. Same family.
5. Same level-1 bucket on this channel.
6. Any other species in the content set.

Every step is filtered to species that have a card on this channel. A distractor for a
name question needs a card but no extra photo. The count drops from 8 to 4 only when the
whole content set has fewer than 8 other species with a card on the channel.

### Grading

Multiple choice: exact match on the option chosen.

Typed answers use one normalizer for every card kind: lowercase, remove punctuation,
hyphen becomes space, collapse whitespace, trim. The normalized answer must match:

- **Species card**: the scientific name or any entry in `common`.
- **Concept card**: any entry in the concept's `accept` array.
- **Group card**: the genus name or the group's common name, for example `Quercus` or
  `oak`.

No partial credit. A wrong species in the same genus is wrong.

The guess box is a checkbox beside the answer control, off by default, reset per card.

### Reveal

After every answer:

- **Right**: the photo, both names, one line of range text, elevation, and height, the
  attribution, and a Next button.
- **Wrong**: the photo shown, beside a photo of the species picked, same channel. Below
  them the diagnostic sentence from the confusion graph for this pair and channel, in
  the direction that matches the miss. If no edge exists, show both species' level-1
  category and genus instead, and append the pair, channel, and count to the
  `dendro_missing_edges` list in localStorage. Then the same names, range line,
  attribution, and Next.

For an `inv` question, a wrong answer shows the photo picked and the correct photo side
by side, with the same diagnostic logic.

### Progress

- **Card level**: from the table above.
- **Species level**: the lowest level among its cards.
- **Unit number**: the mean level over the unit's cards, divided by 4, shown as a percent.
  The count of expert cards is shown beside it, for example "62%, 3 of 21 expert".

The progress screen shows unit numbers above a grid: species rows grouped by unit,
channel columns. Each cell shows the digit 0 to 4 over a five-step color, so it reads
without color.

---

## 8. Screens

One page. `main.js` swaps screens and holds no state. The approved wireframe is at
<https://claude.ai/artifact/EnEkF8bnSzL3BCcqrREeKE>. Visual style and mobile layout are
decided later; the content of each screen is fixed here.

- **Home.** Channel buttons with due counts, "all channels" first. Only channels present
  in content appear. The recommended next unit with a Start button. The full unit list
  with level-0 counts, an open or closed mark from the unit gate, and a Start per unit
  (skipping ahead, closed units included). A placement test link. On an empty queue with
  the cap reached, a line saying so.
- **Session.** Progress bar (card n of N). Prompt, format chip, photo, answer control,
  guess checkbox. Reveal replaces the answer control. Summary: right count, missed count,
  due tomorrow, the cards promoted in this session, the cards demoted in this session,
  the missed cards with their confusion pair, Another session and Home buttons.
- **Progress.** Unit tiles with the unit number and the expert count, then the grid.
  Species names open the species screen.
- **Species.** Both names, PLANTS symbol, native status. Facts: range, states, planted
  states, elevation, height, habitat, Audubon name, section when present, level-1
  categories, arrangement.
  Photos by channel with attribution, and for each channel the level name and the next due
  date. Varieties list with notes and card status.
- **Settings.** Session size, new cards per day, export, import, reset behind a confirm,
  and the missing-diagnostics list.

First visit: home screen, every card at level 0, placement test suggested. No login, no
onboarding.

---

## 9. Persistence

`store.js` owns four localStorage keys: `dendro_cards`, `dendro_log`, `dendro_settings`,
`dendro_missing_edges`. Each value carries a `version` field. Every write happens right
after the event that caused it: one answer, one write to cards and one append to the log.

- **Export**: all keys to one JSON file named `dendro-progress-YYYY-MM-DD.json`. The file
  holds the full history, including the whole review log.
- **Export prompt**: once a month, the session summary screen suggests an export.
- **Import**: validate version and shape, then replace all keys. A malformed file is
  rejected with the reason shown and existing data untouched.
- **Reset**: clear all keys after a confirm step.
- **Log cap**: 20,000 rows, oldest dropped first.
- **Unknown card IDs** in stored state (species removed from content) are kept and
  ignored. A content edit never destroys progress.
- **Migration**: when the stored version is older than the code's, `store.js` migrates
  in place before the app reads it.

---

## 10. Error handling

- **Content fails to load or validate**: home screen shows the error and the file.
  Nothing else renders. Validation: every species has a genus, a family, and at least one
  common name; every species has at least one manifest image, unless a confusion edge
  names it; every manifest target exists; every `concepts` value exists in
  `concepts.json`; every confusion edge names two existing species and a valid channel;
  every unit's `include` and `exclude` symbol exists; every unit's `parent` names an
  existing unit one level up in the same channel, or is null at level 1; every `genera`
  entry and `section` value matches at least one species. Validation warns, but does not
  fail, when a unit has fewer than 5 or more than 25 cards.
- **An image fails to load**: draw another from the pool. Pool exhausted: skip the card
  this session and log to the console.
- **localStorage unavailable or full**: the app runs, shows a banner that progress is not
  saved, and offers export on the summary screen.
- **Malformed import**: see section 9.

---

## 11. Content requirements for v0

These three items are shipping requirements. v0 does not ship without them.

**Confusion edges.** 15 to 25 edges for the `simple_lobed` bucket. An agent drafts each
edge from a named dendrology reference: Sibley, a Virginia Tech fact sheet, or the USDA
silvics manual. The reference goes in the edge's `ref` field. The owner reads every edge
before it merges.

**Level-1 concept photos.** 3 to 5 photos for each of the 21 leaf, bark, and fruit
categories, about 70 photos in total. Each one passes the photo approval in section 4.

**The regional species set.** The `simple_lobed` species for Colorado and the states next
to it, wild and planted, each with photos on at least one channel.

---

## 12. Testing

Every logic module has a test file under `tests/`, run with `node --test`, no
dependencies. Tests load the `content_dev/` fixture. A validation test carries its own bad
content inline.

- **scheduler**: each grade path; new-card intervals 1 then 4; ease floor; lapse on a
  mature card; due-date arithmetic; `hard` from the guess box; `hard` from an elapsed time
  over the format threshold; the 60 s ceiling discards the time signal; a wrong answer is
  `again` at any time.
- **session**: due-first ordering; fill from level-0 cards; daily cap counted from the
  log; empty queue; chosen unit overrides recommended; a chosen unit bypasses the gate;
  the recommendation skips a unit whose parent is under 80 percent at level 2; a unit
  with no parent is always open; the recommendation is empty when every open unit is
  exhausted; an `again` card re-queues once and its re-answer writes no log row and no
  state change; relearning is off in the placement test.
- **ladder**: promotion needs 2 passes and the interval gate; `hard` is not a pass;
  demotion drops one tier and resets `tier_passes`, with no exception for level 4; the
  format always equals the tier; the `inv` tier is skipped below 4 photo
  options and promotion then goes `mc8` to `typed`.
- **question**: distractor ladder produces the requested count, never includes the answer,
  walks the steps in order, and is filtered to species with a card on this channel;
  no-repeat image rule; `mc8` shows as many options as exist.
- **grader**: normalization cases; common and scientific names accepted; hyphen as space;
  near miss rejected; a concept card accepts every entry in `accept`; a group card accepts
  the genus and the group common name.
- **content**: the channel list derives from `concepts.json` and an empty channel renders
  nowhere; unit membership is computed from `states`, `genera`, `section`, `include`,
  and `exclude`, in that order; a bad `parent` fails validation; a unit outside 5 to 25
  cards warns and does not fail; a species with no manifest images fails validation
  unless an edge names it; each validation rule fails on its own bad object; cards derive
  only where images exist.
- **progress**: card levels; species level is the lowest card level; the unit number and
  the expert count.
- **store**: export and import round trip; version check; malformed file rejected;
  unknown card IDs preserved; migration path; the log cap drops the oldest row.

Screens are checked by hand in the browser, and later on a phone.

---

## 13. Decisions and their reasons

Short form. The full log is `DESIGN.md` section 17.

- **Static JS, no framework**: no backend needs, free hosting, and a build step is a
  failure surface the owner cannot yet debug. The logic/screen split keeps the upgrade
  path open.
- **A CI job, not a build step**: the job runs the tests and the content validation before
  Pages deploys. The site is still the repo root.
- **A committed fixture content set in `content_dev/`**: the app and the tests boot
  against the same known content, so a test failure and a browser bug look the same.
- **snake_case for every data name**: one rule for JSON, keys, and localStorage removes
  the daily question of which style a field uses.
- **SM-2 now, log everything**: enough for a few hundred cards; the log is what FSRS
  needs later. The log is capped at 20,000 rows so localStorage cannot fill.
- **Fixed session size**: a session must be a known amount of work, or it does not get
  started.
- **Tier and level are one thing**: the format the user sees is the level they are on.
  Two parallel ladders, one for format and one for mastery, told the user two different
  stories about the same card.
- **Promotion needs 2 passes and an interval gate**: passes prove recall at the format,
  and the interval proves the recall lasted. Either one alone promotes too early.
- **Inverted is a tier, not a one-in-five surprise**: naming a photo and picking a photo
  are different skills, so picking the photo earns its own step on the ladder.
- **Time counts toward `hard`**: a slow right answer is a weak answer. Above 60 s the app
  assumes the user left the desk and ignores the clock.
- **Relearning re-queues once and records nothing**: the repeat is practice, not evidence.
  Logging it would tell the scheduler the card was answered twice.
- **Units carry the region, the app does not**: a unit's `states` list with `include` and
  `exclude` covers the regional set without a setting the user has to understand.
- **Units are 5 to 25 cards, split by region, then genus, then section**: PLANTS lists
  about 90 oak species after hybrids are removed and 1 tanoak. A unit has to be
  finishable, so large genera are split and small ones are bundled through `genera`.
- **Wide first**: every bucket to level 2 before any bucket to level 3. Interleaving
  similar categories beats blocking them (Kornell and Bjork 2008; Carvalho and Goldstone
  2014). No study known to the authors favors deep first for this kind of learning.
- **A unit gate on the parent, at 80 percent level 2**: without a gate, species questions
  arrived on day 2, before the genera were reliable. The gate checks the parent unit, not
  the previous unit in the list, so wide-first ordering does not stall one bucket behind
  another. Level 2 is about three right answers in a row, which the user can count.
- **Interval chain 1, 4, 10, 25**: Anki's default. With 1, 3, 8, 20 the 21-day gate for
  `inv` fell on the fifth right answer at day 32; with 1, 4, 10, 25 it falls on the fourth
  at day 15.
- **Hybrids excluded**: a hybrid oak has no stable field marks to teach and doubles the
  oak list in PLANTS.
- **Planted species are full members**: the trees on a Denver street are the trees the
  user sees most, so `planted_states` puts them in the regional unit.
- **Vendored photos, tiered sources, split trust**: a stable pool per card is what defeats
  photo memorization. Trust is split by kind. Identity comes from the source page, never
  from the agent's own recognition. Quality and license come from the agent check. Three
  named cases escalate to the owner: a species mismatch, a license that is missing or not
  redistributable, and a photo below the quality threshold.
- **Pith and leaf scars cut**: the photos do not exist in the libraries. A channel with no
  photo supply cannot hold a card.
- **PLANTS as authority**: one stable key that also supplies range, native status, and
  growth habit.
- **`species.json` grows with the photo pool**: a record with no images and no edge is a
  species the app cannot quiz, so validation rejects it.
- **Show context, do not quiz it, in v0**: range and size attach to the visual over
  repetitions with no quiz machinery.
- **Varieties as level 4**: the expert depth, gated on photo supply. A variety card needs
  two or more varieties with photos, or the comparison has nothing to compare.
- **Confusion edges are a shipping requirement**: the diagnostic sentence on a miss is the
  teaching moment. Without the edges the app only says "wrong".
