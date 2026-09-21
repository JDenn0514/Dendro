# Dendro app design

Date: 2026-09-21
Status: approved design, not yet built
Source: `DESIGN.md` sections 1 to 17, and the brainstorming session of 2026-09-21

This spec covers the learning app only. The content pipeline (photo fetch, license
filter, manual approval) and the content itself (species list, vocabularies, confusion
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

Not in v0, reserved for later:

- Field sim mode (progressive reveal, separately scored).
- Range-prior questions ("which of these eight are plausible at 9,500 ft?").
- Range as a distractor filter.

v0 content, authored separately: all level-1 concept cards for all channels, and the
"simple lobed" leaf bucket taken to species: maples, oaks, sycamore, sweetgum, tulip tree.

---

## 2. Core model

### Channels

Leaf, bark, fruit, flower, twig. Leaf arrangement (opposite, alternate, whorled) is part
of the twig channel and is also a tagged attribute on every species, so distractor
building and miss explanations can use it on any channel.

### Depth levels

1. **Type**: the level-1 category within a channel, such as "plated" bark.
2. **Group**: genus or family within that category.
3. **Species**.
4. **Variety**: subspecies or variety within a species. The expert level.

### Cards

The atomic unit is a card, not a species. Four card kinds:

| Card | Key | Example |
|---|---|---|
| ConceptCard | channel, level-1 category | `concept:bark:plated` |
| GroupCard | channel, genus | `group:leaf:Quercus` |
| SpeciesCard | channel, species | `species:QUGA:bark` |
| VarietyCard | channel, variety | `variety:QUGAG:leaf` |

Cards are derived from content at startup, never stored. A card exists only if its image
pool has at least one entry. Adding a species is a content change, not a code change.

### Units

A unit is one level-1 bucket taken through its depth levels. A channel's level-1 concept
cards are that channel's first unit. Units are ordered in the content file. Gating is
soft: the app recommends the next unit and allows skipping.

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
    progress.js            card states, mastery, unit percentages
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
tests/
  module.test.js           one per logic module, run with node --test
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
    "audubonName": "Gambel Oak",
    "inatTaxonId": 47851,
    "inatName": null,
    "genus": "Quercus",
    "family": "Fagaceae",
    "concepts": {
      "leaf": "simple-lobed", "bark": "furrowed", "fruit": "acorn",
      "flower": "catkin", "twig": "alternate"
    },
    "range": { "text": "Colorado Plateau and southern Rockies",
               "states": ["CO", "UT", "NM", "AZ"] },
    "elevationFt": [5000, 9000],
    "heightFt": [15, 30],
    "habitat": "Dry slopes and foothills with pinyon and juniper",
    "nativeStatus": "native",
    "varieties": [
      { "key": "QUGAG", "name": "var. gambelii", "note": "The widespread form." }
    ]
  }
}
```

Rules:

- `concepts` places the species in each channel's level-1 bucket. A missing channel means
  no card on that channel.
- `inatName` is set only when iNat uses a different name; otherwise null.
- `common[0]` is the display name. All entries are accepted as typed answers.
- Inclusion rule for the species list: PLANTS growth habit is "tree" or "tree, shrub."
  Shrub-only species are excluded. A manual include list exists for exceptions and is
  empty in v0. Non-native species are included and flagged by `nativeStatus`.
- Varieties roll up to the species for levels 1 to 3. A variety gets its own cards only
  when the manifest has at least one approved image for it on some channel.

### concepts.json

One record per channel and level-1 category: key, display name, one-paragraph
description. Image pools come from the manifest.

Level-1 vocabularies are in `DESIGN.md` section 3, with leaf arrangement folded into the
twig list.

### confusion.json

A list of edges:

```json
{ "a": "QURU", "b": "QUVE", "channel": "leaf",
  "aNotB": "Northern red oak has shallower sinuses and shorter bristle tips than black oak.",
  "bNotA": "Black oak has deeper sinuses, longer bristle tips, and larger hairy buds." }
```

Edges are per channel and undirected for distractor building. For the reveal, `aNotB`
is shown when the correct answer is `a` and the user picked `b`; `bNotA` is the
reverse. The seven seed pairs in `DESIGN.md` section 8 go here first.

### units.json

Ordered list. Each entry: key, display name, channel, level, and the level-1 bucket it
covers. Level-1 units cover a whole channel. Example:

```json
[
  { "key": "leaf-types", "name": "Leaf types", "channel": "leaf", "level": 1 },
  { "key": "simple-lobed-genus", "name": "Simple lobed leaves", "channel": "leaf",
    "level": 2, "bucket": "simple-lobed" },
  { "key": "simple-lobed-species", "name": "Simple lobed leaves", "channel": "leaf",
    "level": 3, "bucket": "simple-lobed" }
]
```

### images/manifest.json

One record per image:

```json
{ "file": "images/QUGA/bark/001.jpg", "target": "QUGA", "channel": "bark",
  "source": "Virginia Tech Dendrology", "author": "J. Doe",
  "license": "CC BY-NC 4.0", "origin": "https://example.org/photo/123",
  "tags": ["winter"] }
```

`target` is a species symbol, a variety key, or a concept key in the form
`bark/plated`. Images are vendored into the repo, resized to about 1200 px on the long
side. Every image was approved by hand before it entered the repo. Attribution is
displayed wherever the image is shown.

### Card state (localStorage)

One object per card ID:

```json
{ "interval": 12, "ease": 2.5, "due": "2026-10-03", "reps": 9, "lapses": 1,
  "recent": ["good", "good", "hard"] }
```

`recent` holds the last three grades. A card with no state object is unseen.

### Review log (localStorage)

An array of rows:

```json
{ "card": "species:QUGA:bark", "at": "2026-09-21T14:03:11Z", "grade": "good",
  "format": "mc4", "elapsedMs": 4200, "answer": "Gambel oak" }
```

`format` is one of `mc4`, `mc8`, `typed`, `inverted`. This log is the input a later
FSRS fit needs.

### Settings (localStorage)

```json
{ "sessionSize": 20, "newPerDay": 10 }
```

---

## 5. Scheduler

SM-2, on individual cards. One pure function: `(state, grade, today) -> newState`.

Grades come from automatic grading plus a guess flag:

| Outcome | Grade |
|---|---|
| Right | good |
| Right, guess flag set | hard |
| Wrong | again |

Rules:

- **New card**: first right answer sets interval 1; second sets interval 3. After that
  the normal rules apply.
- **good**: interval = round(interval x ease). Ease unchanged.
- **hard**: interval = round(interval x 1.2). Ease drops by 0.15.
- **again**: interval = 1. Lapses + 1. Ease drops by 0.2.
- Ease starts at 2.5 and has a floor of 1.3.
- `due` = today + interval, as a `YYYY-MM-DD` string. "Today" is the local calendar
  date. A card is due when `due` is today or earlier. Nothing runs during the day.
- `reps` counts every review. `recent` is the last three grades.

---

## 6. Session builder

Input: channel focus (one channel or all), optional chosen unit, card states, content,
review log, settings, today. Output: an ordered list of card IDs.

1. Collect due cards in the focus. Sort most overdue first.
2. Take up to `sessionSize`.
3. If short, add unseen cards from the target unit, in content order, until the session
   is full or today's new-card count reaches `newPerDay`. Today's count is the number of
   log rows today whose card had no prior row. The target unit is the chosen unit if
   given, otherwise the recommended unit: the first unit in the focus, in `units.json`
   order, that has unseen cards.
4. Shuffle.

Multiple sessions per day are allowed. After the daily cap, sessions contain due cards
only. An empty result means nothing is due and the cap is reached; the home screen says
so.

### Placement test

A fixed deck: one card per level-1 concept, all channels, about 30 cards. Format is
always `mc4`. A right answer sets that card's state to interval 21, ease 2.5, reps 1,
due today + 21. A wrong answer leaves the card unseen. Placement results write card
state but not the review log, so they do not count against the daily cap.

---

## 7. Questions, distractors, grading

### Format tier

Chosen per card at question time from the card's interval:

| Interval | Format |
|---|---|
| under 7 days | mc4 |
| 7 to 20 days | mc8 |
| 21 days or more | typed |

A card whose last grade is `again` drops one tier until its next right answer. An
unseen card is `mc4`.

**Inverted question**: one time in five, on `mc4` and `mc8` only, the prompt names the
answer and the options are photos. One photo from the correct card's pool and the rest
from distractor cards on the same channel. Logged as format `inverted`. If fewer than
four distractors have photos on this channel, the question is not inverted.

### Photo sampling

One image at random from the card's pool. The same image is not shown twice in a row
for that card. The last image shown per card is held in memory for the session only.

### Prompts and options

| Card | Prompt | Options |
|---|---|---|
| Concept | "What [channel] type is this?" | other level-1 categories in the channel |
| Group | "Which genus?" | other genera in the same level-1 bucket |
| Species | "Which species?" | distractor ladder below |
| Variety | "Which variety?" | sibling varieties of the species |

Each option shows the common name with the scientific name under it.

### Distractor ladder for species cards

Fill the requested option count by walking down, shuffling within each step:

1. Confusion-graph neighbors on this channel.
2. Confusion-graph neighbors on any channel.
3. Same genus.
4. Same family.
5. Same level-1 bucket on this channel.
6. Any other species in the content set.

A distractor for a normal question is a name only and needs no photo. The count drops
from 8 to 4 only when the whole content set has fewer than 8 other species.

Concept and group cards draw distractors from their own row in the table above. They
show as many options as exist, up to the tier count. Below 4 options they fall back to
typed. A bark concept card on the `mc8` tier therefore shows 6 options, one per bark
category.

### Grading

Multiple choice: exact match on the option chosen. Typed: normalize both sides, then the
answer must equal the scientific name or any entry in `common`. Normalization:
lowercase, remove punctuation, hyphen becomes space, collapse whitespace, trim. No
partial credit. A wrong species in the same genus is wrong.

The guess flag is a checkbox beside the answer control, off by default, reset per card.

### Reveal

After every answer:

- **Right**: the photo, both names, one line of range text, elevation, and height, the
  attribution, and a Next button.
- **Wrong**: the photo shown, beside a photo of the species picked, same channel. Below
  them the diagnostic sentence from the confusion graph for this pair and channel, in
  the direction that matches the miss. If no edge exists, show both species' level-1
  category and genus instead, and append the pair, channel, and count to a
  `dendro.missingEdges` list in localStorage. Then the same names, range line,
  attribution, and Next.

For an inverted question, a wrong answer shows the photo picked and the correct photo
side by side with the same diagnostic logic.

---

## 8. Progress and mastery

- **Card state label**: unseen (no state), learning (interval under 7), review (7 to 20,
  or 21 or more with an `again` in `recent`), mastered (interval 21 or more and no
  `again` in `recent`).
- **Species mastery** = the weakest channel among its cards.
- **Unit percentage** = mastered cards / total cards in the unit.

The progress screen shows unit percentages above a grid: species rows grouped by unit,
channel columns, each cell colored by state and carrying a letter code (U, L, R, M) so
it reads without color.

---

## 9. Screens

One page. `main.js` swaps screens and holds no state. The approved wireframe is at
<https://claude.ai/artifact/EnEkF8bnSzL3BCcqrREeKE>. Visual style and mobile layout are
decided later; the content of each screen is fixed here.

- **Home.** Channel buttons with due counts, "all channels" first. The recommended next
  unit with a Start button. The full unit list with unseen counts and a Start per unit
  (skipping ahead). A placement test link. On an empty queue with the cap reached, a
  line saying so.
- **Session.** Progress bar (card n of N). Prompt, format chip, photo, answer control,
  guess checkbox. Reveal replaces the answer control. Summary: right count, missed
  count, due tomorrow, the missed cards with their confusion pair, Another session and
  Home buttons.
- **Progress.** Unit tiles, legend, the grid. Species names open the species screen.
- **Species.** Both names, PLANTS symbol, native status. Facts: range, states,
  elevation, height, habitat, Audubon name, level-1 categories, arrangement. Photos by
  channel with attribution and that channel's card state and next due. Varieties list
  with notes and card status.
- **Settings.** Session size, new cards per day, export, import, reset behind a confirm,
  and the missing-diagnostics list.

First visit: home screen, everything unseen, placement test suggested. No login, no
onboarding.

---

## 10. Persistence

`store.js` owns four localStorage keys: `dendro.cards`, `dendro.log`,
`dendro.settings`, `dendro.missingEdges`. Each value carries a `version` field. Every
write happens right after the event that caused it: one answer, one write to cards and
one append to the log.

- **Export**: all keys to one JSON file named `dendro-progress-YYYY-MM-DD.json`.
- **Import**: validate version and shape, then replace all keys. A malformed file is
  rejected with the reason shown and existing data untouched.
- **Reset**: clear all keys after a confirm step.
- **Unknown card IDs** in stored state (species removed from content) are kept and
  ignored. A content edit never destroys progress.
- **Migration**: when the stored version is older than the code's, `store.js` migrates
  in place before the app reads it.

---

## 11. Error handling

- **Content fails to load or validate**: home screen shows the error and the file.
  Nothing else renders. Validation: every species has a genus, a family, and at least one
  common name; every manifest target exists; every `concepts` value exists in
  `concepts.json`; every confusion edge names two existing species and a valid channel.
- **An image fails to load**: draw another from the pool. Pool exhausted: skip the card
  this session and log to the console.
- **localStorage unavailable or full**: the app runs, shows a banner that progress is not
  saved, and offers export on the summary screen.
- **Malformed import**: see section 10.

---

## 12. Testing

Every logic module has a test file under `tests/`, run with `node --test`, no
dependencies. Tests use a small fixture content set of about six species.

- **scheduler**: each grade path; new-card intervals 1 then 3; ease floor; lapse on a
  mature card; due-date arithmetic.
- **session**: due-first ordering; fill from new cards; daily cap counted from the log;
  empty queue; chosen unit overrides recommended.
- **question**: format tier by interval; tier drop after `again`; distractor ladder
  produces the requested count, never includes the answer, and walks down the steps in
  order; no-repeat image rule; inverted question skipped when photos are short.
- **grader**: normalization cases; common and scientific names accepted; hyphen as
  space; near miss rejected.
- **progress**: state labels; weakest-channel species mastery; unit percentages.
- **store**: export and import round trip; version check; malformed file rejected;
  unknown card IDs preserved; migration path.
- **content**: each validation rule fails on a bad fixture; cards derive only where
  images exist.

Screens are checked by hand in the browser, and later on a phone.

---

## 13. Decisions and their reasons

Short form. The full log is `DESIGN.md` section 17.

- **Static JS, no framework**: no backend needs, free hosting, and a build step is a
  failure surface the owner cannot yet debug. The logic/screen split keeps the upgrade
  path open.
- **SM-2 now, log everything**: enough for a few hundred cards; the log is what FSRS
  needs later.
- **Fixed session size**: a session must be a known amount of work, or it does not get
  started.
- **Vendored photos, tiered sources, manual approval**: a stable pool per card is what
  defeats photo memorization, and trust comes from the approval step, not the source.
- **PLANTS as authority**: one stable key that also supplies range, native status, and
  growth habit.
- **Show context, do not quiz it, in v0**: range and size attach to the visual over
  repetitions with no quiz machinery.
- **Varieties as level 4**: the expert level, gated on photo supply.
