# Dendro App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Dendro learning app: a static site that quizzes North American tree identification with spaced repetition over species, genus, level-1 concept, and variety cards.

**Architecture:** One HTML page. Pure logic modules under `app/logic/` take data in and return data out, and run in Node for tests. Screen modules under `app/screens/` render HTML, handle events, and compute nothing. Content is JSON plus vendored images under `content/`, with a committed fixture set under `content_dev/`.

**Tech Stack:** Plain HTML, CSS, and ES modules. Node 20 or later for `node --test`. GitHub Actions for the check job and the Pages deploy. No libraries.

## Global Constraints

- Static site. No build step, no runtime dependencies, no dev dependencies.
- Node 20 or later. Tests run with the built-in runner: `node --test tests/`.
- Logic modules never touch `document`, `window`, `localStorage`, or `fetch`. They take data in and return data out.
- Screen modules compute nothing. Every number, list, and string they show comes from a logic module.
- Every data name is snake_case: JSON fields, bucket keys, unit keys, localStorage keys, directory names. Card IDs keep the colon separator. JavaScript identifiers follow JavaScript convention (camelCase functions and variables).
- The repo is public and GitHub Pages deploys the repo root.
- `content/` is the live content set. `content_dev/` is the committed fixture. The URL switch `?content=dev` boots the app against the fixture. Tests always load the fixture.
- The shared fixture is always valid. A validation test carries its own bad content object inline and never edits the fixture.
- Commit messages end with the line: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

## For agentic workers

- The machine is Windows 11 with Git Bash. Any single shell command must stay under 5,000 bytes.
- Write file contents with the Write tool. Edit files with the Edit tool. Never use heredocs, `cat > file`, `echo >`, or `sed -i` for file content.
- Run one test file with `node --test tests/<module>.test.js`. Run all tests with `npm test`.
- Commit with two `-m` flags so the command stays short:
  `git commit -m "feat: subject line" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`
- The fixture images are 1x1 placeholder JPEGs written by `scripts/make_placeholder_jpegs.js` in Task 1. Do not hand-create binary files.

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | The one page. A banner slot and an `#app` slot. |
| `app/main.js` | Fetches content, builds the store, routes on the hash. Holds no state. |
| `app/style.css` | All styling. |
| `app/logic/content.js` | Validates raw JSON, derives channels, cards, photo pools, and unit membership. |
| `app/logic/scheduler.js` | Grade derivation, SM-2, and the tier ladder. |
| `app/logic/grader.js` | Answer normalizer and the match rules per card kind. |
| `app/logic/question.js` | Format, photo sampling, prompts, options, distractors, reveal. |
| `app/logic/progress.js` | Card level, species level, unit number, unit gate. |
| `app/logic/session.js` | Due collection, fill, daily cap, recommendation, relearning, placement. |
| `app/logic/store.js` | The four localStorage keys, export, import, reset, migration. |
| `app/screens/home.js` | Channel buttons, recommendation, unit list, placement link. |
| `app/screens/session.js` | The quiz loop and the summary. |
| `app/screens/progress.js` | Unit tiles and the grid. |
| `app/screens/species.js` | One species: facts, photos, levels, varieties. |
| `app/screens/settings.js` | Settings, export, import, reset, missing diagnostics. |
| `scripts/make_placeholder_jpegs.js` | Writes a 1x1 JPEG to every fixture manifest path. |
| `scripts/validate_content.js` | CLI wrapper over `validateContent`, plus a file-exists check. |
| `tests/helpers/fixture.js` | Reads `content_dev/` from disk for tests. |
| `tests/helpers/rng.js` | A seeded pseudo-random generator for deterministic tests. |
| `.github/workflows/check.yml` | Tests, content validation, then the Pages deploy. |

## Choices made where the spec is silent

Each choice is the simplest option that satisfies the surrounding rules.

1. **Group card existence.** A group card exists for every genus with at least one species image on that channel. Its bucket is the level-1 concept of its first member in symbol sort order, when members disagree.
2. **Group common name.** `species.json` gains an optional `genus_common` field, for example `"oak"`. A group card accepts the genus plus every distinct `genus_common` among its members.
3. **Leaf arrangement.** `species.json` gains an `arrangement` field, one of `opposite`, `alternate`, `whorled`. Section 2 tags it on every species and section 8 shows it.
4. **Concept and group photo pools** hold species images only, not variety images.
5. **The unit gate lives in `progress.js`** and `session.js` imports it. One definition, no duplicate.
6. **A parent unit with zero cards counts as open.** There is nothing to learn there.
7. **`shuffle(items, rng)` lives in `question.js`** and `session.js` imports it. The spec's module list has no shared helper module, so the plan does not add one.
8. **Placement state** sets `recent: []` and `lapses: 0` alongside the values the spec names.
9. **`last_export`** is a field inside `dendro_settings`.
10. **A typed fallback on a concept or group card** logs `format: "typed"` and `options: 0`. The card's `tier` is unchanged, so the ladder still counts the pass at the card's real tier.
11. **`missing_edge` records species pairs only.** A concept, group, or variety miss gets the fallback sentence and no record.
12. **`content/` ships with the 21 real level-1 concepts, three level-1 units, and no species.** Validation passes, the CI job is meaningful, and the content spec fills in the rest.
13. **A variety card's typed answers** are the variety `name` and the variety `key`.
14. **A wrong typed answer is resolved back to a key** with `resolveTyped`, so the reveal can still show the confusion sentence. Text that matches nothing gives `chosen_key: null`, and the reveal then shows the answer alone.
15. **Variety options show every sibling** with no typed fallback below four. The sibling set is the whole answer space, so a short list is correct rather than degenerate.

---

### Task 1: Repo scaffold and the fixture content set

**Files:**
- Create: `package.json`, `.gitignore`, `.nojekyll`, `index.html`
- Create: `content/concepts.json`, `content/species.json`, `content/confusion.json`, `content/units.json`, `content/images/manifest.json`
- Create: `content_dev/concepts.json`, `content_dev/species.json`, `content_dev/confusion.json`, `content_dev/units.json`, `content_dev/images/manifest.json`
- Create: `scripts/make_placeholder_jpegs.js`
- Create: `tests/helpers/fixture.js`, `tests/helpers/rng.js`
- Test: `tests/fixture.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `loadFixture()` returns `{ species, concepts, confusion, units, manifest }`, all parsed JSON.
  - `FIXTURE_DIR` is the absolute path of `content_dev/`.
  - `makeRng(seed)` returns a function with no arguments that returns a number in `[0, 1)`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "dendro",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "A desk-based learning tool for North American tree identification.",
  "scripts": {
    "test": "node --test tests/",
    "validate": "node scripts/validate_content.js content/",
    "validate:dev": "node scripts/validate_content.js content_dev/",
    "images:dev": "node scripts/make_placeholder_jpegs.js"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `.gitignore` and `.nojekyll`**

`.gitignore`:

```
node_modules/
.DS_Store
Thumbs.db
*.log
```

`.nojekyll` is an empty file. Create it with the Write tool and a single newline as its content.

- [ ] **Step 3: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dendro</title>
  <link rel="stylesheet" href="app/style.css">
</head>
<body>
  <div id="banner" class="banner" hidden></div>
  <nav id="nav" class="nav" hidden>
    <a href="#/">Home</a>
    <a href="#/progress">Progress</a>
    <a href="#/settings">Settings</a>
  </nav>
  <main id="app">Loading content.</main>
  <script type="module" src="app/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `content/concepts.json`**

This is the real level-1 vocabulary from `DESIGN.md` section 3. The fixture reuses this exact file.

```json
[
  { "key": "needles", "channel": "leaf", "name": "Needles", "accept": ["needles", "needle", "needle like", "conifer needles"], "description": "Narrow stiff leaves, in bundles, single along the twig, or in clusters." },
  { "key": "scale_like", "channel": "leaf", "name": "Scale-like", "accept": ["scale", "scales", "scale like", "scaly"], "description": "Tiny overlapping scales pressed flat against the twig." },
  { "key": "simple_entire", "channel": "leaf", "name": "Simple, untoothed", "accept": ["entire", "simple entire", "simple untoothed", "untoothed", "smooth margin"], "description": "One blade per stalk with a smooth unbroken edge." },
  { "key": "simple_toothed", "channel": "leaf", "name": "Simple, toothed", "accept": ["toothed", "simple toothed", "serrated", "serrate"], "description": "One blade per stalk with teeth along the edge." },
  { "key": "simple_lobed", "channel": "leaf", "name": "Simple, lobed", "accept": ["lobed", "simple lobed", "lobes"], "description": "One blade per stalk cut into lobes by sinuses." },
  { "key": "pinnately_compound", "channel": "leaf", "name": "Pinnately compound", "accept": ["pinnately compound", "pinnate", "compound pinnate"], "description": "Leaflets in two rows along a central stalk." },
  { "key": "palmately_compound", "channel": "leaf", "name": "Palmately compound", "accept": ["palmately compound", "palmate", "compound palmate"], "description": "Leaflets spread from one point like fingers." },
  { "key": "fan_strap", "channel": "leaf", "name": "Fan / strap", "accept": ["fan", "strap", "fan strap", "palm"], "description": "Long strap blades or fan blades, as on palms and yuccas." },
  { "key": "smooth", "channel": "bark", "name": "Smooth", "accept": ["smooth", "smooth bark"], "description": "An unbroken surface with no ridges or plates." },
  { "key": "furrowed", "channel": "bark", "name": "Furrowed / ridged", "accept": ["furrowed", "ridged", "furrowed ridged", "ridges"], "description": "Long ridges separated by deep vertical grooves." },
  { "key": "plated", "channel": "bark", "name": "Plated / blocky", "accept": ["plated", "blocky", "plated blocky", "plate bark"], "description": "The surface breaks into square or rectangular plates." },
  { "key": "shaggy", "channel": "bark", "name": "Shaggy / strip-peeling", "accept": ["shaggy", "strip peeling", "peeling strips", "shaggy strip peeling"], "description": "Long strips lift away at one or both ends." },
  { "key": "papery", "channel": "bark", "name": "Papery / exfoliating", "accept": ["papery", "exfoliating", "papery exfoliating", "flaking"], "description": "Thin sheets or flakes peel off and show a paler layer." },
  { "key": "warty", "channel": "bark", "name": "Warty / lenticelled", "accept": ["warty", "lenticelled", "warty lenticelled", "lenticels"], "description": "Raised corky bumps or horizontal lenticel lines." },
  { "key": "samara", "channel": "fruit", "name": "Samara", "accept": ["samara", "samaras", "winged seed", "key"], "description": "A dry seed with a papery wing." },
  { "key": "acorn", "channel": "fruit", "name": "Acorn", "accept": ["acorn", "acorns"], "description": "A single nut seated in a scaly cup." },
  { "key": "nut", "channel": "fruit", "name": "Nut / husk", "accept": ["nut", "husk", "nut husk"], "description": "A hard nut inside a thick husk that splits." },
  { "key": "pod", "channel": "fruit", "name": "Pod / legume", "accept": ["pod", "legume", "pod legume", "bean pod"], "description": "A flat or round pod holding a row of seeds." },
  { "key": "berry", "channel": "fruit", "name": "Berry / drupe", "accept": ["berry", "drupe", "berry drupe"], "description": "A fleshy fruit around one stone or several seeds." },
  { "key": "capsule", "channel": "fruit", "name": "Capsule", "accept": ["capsule", "capsules"], "description": "A dry case that splits open along seams." },
  { "key": "cone", "channel": "fruit", "name": "Cone", "accept": ["cone", "cones", "woody cone", "fleshy cone"], "description": "Overlapping scales on an axis, woody or fleshy." }
]
```

- [ ] **Step 5: Create the other three `content/` files and the empty manifest**

`content/species.json`:

```json
{}
```

`content/confusion.json`:

```json
[]
```

`content/units.json`:

```json
[
  { "key": "leaf_types", "name": "Leaf types", "channel": "leaf", "level": 1, "parent": null },
  { "key": "bark_types", "name": "Bark types", "channel": "bark", "level": 1, "parent": null },
  { "key": "fruit_types", "name": "Fruit types", "channel": "fruit", "level": 1, "parent": null }
]
```

`content/images/manifest.json`:

```json
[]
```

- [ ] **Step 6: Copy the concept vocabulary into the fixture**

Run:

```bash
mkdir -p content_dev/images && cp content/concepts.json content_dev/concepts.json
```

Expected: no output, and `content_dev/concepts.json` exists.

- [ ] **Step 7: Create `content_dev/species.json`**

Six species. QUVE carries no images and exists only because a confusion edge names it. ACPL has leaf and fruit cards but no bark card. PLOC's range misses every unit state, so only an `include` puts it in a unit.

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
    "concepts": { "leaf": "simple_lobed", "bark": "furrowed", "fruit": "acorn" },
    "range": { "text": "Colorado Plateau and southern Rockies", "states": ["CO", "UT", "NM", "AZ"] },
    "planted_states": [],
    "elevation_ft": [5000, 9000],
    "height_ft": [15, 30],
    "habitat": "Dry slopes and foothills with pinyon and juniper",
    "native_status": "native",
    "varieties": [
      { "key": "QUGAG", "name": "var. gambelii", "note": "The widespread form." },
      { "key": "QUGAB", "name": "var. bakeri", "note": "Narrower lobes, southwestern." }
    ]
  },
  "QURU": {
    "scientific": "Quercus rubra",
    "common": ["Northern red oak", "Red oak"],
    "audubon_name": "Northern Red Oak",
    "inat_taxon_id": 49009,
    "inat_name": null,
    "genus": "Quercus",
    "genus_common": "oak",
    "section": "Lobatae",
    "family": "Fagaceae",
    "arrangement": "alternate",
    "concepts": { "leaf": "simple_lobed", "bark": "furrowed", "fruit": "acorn" },
    "range": { "text": "Eastern North America", "states": ["NE", "KS", "MO", "IA"] },
    "planted_states": ["CO", "UT", "WY"],
    "elevation_ft": [0, 5500],
    "height_ft": [60, 90],
    "habitat": "Moist upland woods and city streets",
    "native_status": "native",
    "varieties": []
  },
  "QUVE": {
    "scientific": "Quercus velutina",
    "common": ["Black oak"],
    "audubon_name": "Black Oak",
    "inat_taxon_id": 48453,
    "inat_name": null,
    "genus": "Quercus",
    "genus_common": "oak",
    "section": "Lobatae",
    "family": "Fagaceae",
    "arrangement": "alternate",
    "concepts": { "leaf": "simple_lobed", "bark": "furrowed" },
    "range": { "text": "Eastern United States", "states": ["KS", "MO", "IA"] },
    "planted_states": [],
    "elevation_ft": [0, 4000],
    "height_ft": [50, 80],
    "habitat": "Dry upland slopes and ridges",
    "native_status": "native",
    "varieties": []
  },
  "ACPL": {
    "scientific": "Acer platanoides",
    "common": ["Norway maple"],
    "audubon_name": "Norway Maple",
    "inat_taxon_id": 54859,
    "inat_name": null,
    "genus": "Acer",
    "genus_common": "maple",
    "section": null,
    "family": "Sapindaceae",
    "arrangement": "opposite",
    "concepts": { "leaf": "simple_lobed", "fruit": "samara" },
    "range": { "text": "Europe, widely planted in North America", "states": [] },
    "planted_states": ["CO", "UT", "WY", "NE", "KS"],
    "elevation_ft": [4000, 7000],
    "height_ft": [40, 60],
    "habitat": "Street plantings and city parks",
    "native_status": "introduced",
    "varieties": []
  },
  "ACSA2": {
    "scientific": "Acer saccharinum",
    "common": ["Silver maple"],
    "audubon_name": "Silver Maple",
    "inat_taxon_id": 48360,
    "inat_name": null,
    "genus": "Acer",
    "genus_common": "maple",
    "section": null,
    "family": "Sapindaceae",
    "arrangement": "opposite",
    "concepts": { "leaf": "simple_lobed", "fruit": "samara" },
    "range": { "text": "Eastern North America along rivers", "states": ["NE", "KS", "MO", "IA"] },
    "planted_states": ["CO", "WY"],
    "elevation_ft": [3500, 6500],
    "height_ft": [50, 80],
    "habitat": "River bottoms and wet city soils",
    "native_status": "native",
    "varieties": []
  },
  "PLOC": {
    "scientific": "Platanus occidentalis",
    "common": ["American sycamore", "Buttonwood"],
    "audubon_name": "American Sycamore",
    "inat_taxon_id": 51260,
    "inat_name": null,
    "genus": "Platanus",
    "genus_common": "sycamore",
    "section": null,
    "family": "Platanaceae",
    "arrangement": "alternate",
    "concepts": { "leaf": "simple_lobed", "bark": "papery" },
    "range": { "text": "Eastern United States bottomlands", "states": ["MO", "IA", "AR"] },
    "planted_states": [],
    "elevation_ft": [0, 3000],
    "height_ft": [75, 100],
    "habitat": "Stream banks and bottomland forest",
    "native_status": "native",
    "varieties": []
  }
}
```

- [ ] **Step 8: Create `content_dev/confusion.json`**

```json
[
  { "a": "QURU", "b": "QUVE", "channel": "leaf",
    "a_not_b": "Northern red oak has shallower sinuses and shorter bristle tips than black oak.",
    "b_not_a": "Black oak has deeper sinuses, longer bristle tips, and larger hairy buds.",
    "ref": "Virginia Tech Dendrology fact sheet, Quercus velutina" },
  { "a": "QUGA", "b": "QURU", "channel": "leaf",
    "a_not_b": "Gambel oak has rounded lobes with no bristle tips.",
    "b_not_a": "Northern red oak has pointed lobes that end in bristle tips.",
    "ref": "USDA Silvics Manual, Quercus gambelii" },
  { "a": "ACPL", "b": "ACSA2", "channel": "leaf",
    "a_not_b": "Norway maple has five broad lobes and milky sap in the leaf stalk.",
    "b_not_a": "Silver maple has deep narrow sinuses and a silver-white leaf underside.",
    "ref": "Virginia Tech Dendrology fact sheet, Acer saccharinum" }
]
```

- [ ] **Step 9: Create `content_dev/units.json`**

`simple_lobed_other_co` reaches PLOC only through `include`. `simple_lobed_red_oaks_co` drops QUVE through `exclude`. `simple_lobed_white_oaks_co` and `simple_lobed_red_oaks_co` split the oaks with `section`.

```json
[
  { "key": "leaf_types", "name": "Leaf types", "channel": "leaf", "level": 1, "parent": null },
  { "key": "bark_types", "name": "Bark types", "channel": "bark", "level": 1, "parent": null },
  { "key": "fruit_types", "name": "Fruit types", "channel": "fruit", "level": 1, "parent": null },
  { "key": "simple_lobed_genus", "name": "Simple lobed leaves", "channel": "leaf", "level": 2,
    "parent": "leaf_types", "bucket": "simple_lobed",
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": ["PLOC"], "exclude": [] },
  { "key": "simple_lobed_white_oaks_co", "name": "White oaks", "channel": "leaf", "level": 3,
    "parent": "simple_lobed_genus", "bucket": "simple_lobed", "genera": ["Quercus"],
    "section": "Quercus", "states": ["CO", "UT", "NM", "WY", "NE", "KS"],
    "include": [], "exclude": [] },
  { "key": "simple_lobed_red_oaks_co", "name": "Red oaks", "channel": "leaf", "level": 3,
    "parent": "simple_lobed_genus", "bucket": "simple_lobed", "genera": ["Quercus"],
    "section": "Lobatae", "states": ["CO", "UT", "NM", "WY", "NE", "KS"],
    "include": [], "exclude": ["QUVE"] },
  { "key": "simple_lobed_maples_co", "name": "Maples", "channel": "leaf", "level": 3,
    "parent": "simple_lobed_genus", "bucket": "simple_lobed", "genera": ["Acer"],
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": [], "exclude": [] },
  { "key": "simple_lobed_other_co", "name": "Sycamore", "channel": "leaf", "level": 3,
    "parent": "simple_lobed_genus", "bucket": "simple_lobed", "genera": ["Platanus"],
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": ["PLOC"], "exclude": [] },
  { "key": "quga_varieties", "name": "Gambel oak varieties", "channel": "leaf", "level": 4,
    "parent": "simple_lobed_white_oaks_co", "bucket": "simple_lobed", "genera": ["Quercus"],
    "section": "Quercus", "states": ["CO", "UT", "NM", "WY", "NE", "KS"],
    "include": [], "exclude": [] }
]
```

- [ ] **Step 10: Create `content_dev/images/manifest.json`**

Fifteen records. QUGA and QURU each carry two leaf images, so the no-repeat rule has something to work with. The last record is a concept override with the target `bark/plated`.

```json
[
  { "file": "images/QUGA/leaf/001.jpg", "target": "QUGA", "channel": "leaf", "source": "USDA PLANTS Database", "author": "USDA NRCS", "license": "public domain (US government work)", "origin": "https://plants.usda.gov/plant-profile/QUGA/images", "tags": ["summer"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/QUGA/leaf/002.jpg", "target": "QUGA", "channel": "leaf", "source": "USDA PLANTS Database", "author": "USDA NRCS", "license": "public domain (US government work)", "origin": "https://plants.usda.gov/plant-profile/QUGA/images", "tags": ["autumn"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/QUGA/bark/001.jpg", "target": "QUGA", "channel": "bark", "source": "USDA PLANTS Database", "author": "USDA NRCS", "license": "public domain (US government work)", "origin": "https://plants.usda.gov/plant-profile/QUGA/images", "tags": ["winter"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/QUGA/fruit/001.jpg", "target": "QUGA", "channel": "fruit", "source": "USDA PLANTS Database", "author": "USDA NRCS", "license": "public domain (US government work)", "origin": "https://plants.usda.gov/plant-profile/QUGA/images", "tags": ["autumn"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/QUGAG/leaf/001.jpg", "target": "QUGAG", "channel": "leaf", "source": "Wikimedia Commons", "author": "Public domain contributor", "license": "public domain", "origin": "https://commons.wikimedia.org/wiki/Category:Quercus_gambelii", "tags": [], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/QUGAB/leaf/001.jpg", "target": "QUGAB", "channel": "leaf", "source": "Wikimedia Commons", "author": "Public domain contributor", "license": "public domain", "origin": "https://commons.wikimedia.org/wiki/Category:Quercus_gambelii", "tags": [], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/QURU/leaf/001.jpg", "target": "QURU", "channel": "leaf", "source": "USDA PLANTS Database", "author": "USDA NRCS", "license": "public domain (US government work)", "origin": "https://plants.usda.gov/plant-profile/QURU/images", "tags": ["summer"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/QURU/leaf/002.jpg", "target": "QURU", "channel": "leaf", "source": "USDA PLANTS Database", "author": "USDA NRCS", "license": "public domain (US government work)", "origin": "https://plants.usda.gov/plant-profile/QURU/images", "tags": ["autumn"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/QURU/bark/001.jpg", "target": "QURU", "channel": "bark", "source": "USDA PLANTS Database", "author": "USDA NRCS", "license": "public domain (US government work)", "origin": "https://plants.usda.gov/plant-profile/QURU/images", "tags": ["winter"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/ACPL/leaf/001.jpg", "target": "ACPL", "channel": "leaf", "source": "Wikimedia Commons", "author": "Public domain contributor", "license": "public domain", "origin": "https://commons.wikimedia.org/wiki/Category:Acer_platanoides", "tags": ["summer"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/ACPL/fruit/001.jpg", "target": "ACPL", "channel": "fruit", "source": "Wikimedia Commons", "author": "Public domain contributor", "license": "public domain", "origin": "https://commons.wikimedia.org/wiki/Category:Acer_platanoides", "tags": ["summer"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/ACSA2/leaf/001.jpg", "target": "ACSA2", "channel": "leaf", "source": "USDA PLANTS Database", "author": "USDA NRCS", "license": "public domain (US government work)", "origin": "https://plants.usda.gov/plant-profile/ACSA2/images", "tags": ["summer"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/PLOC/leaf/001.jpg", "target": "PLOC", "channel": "leaf", "source": "USDA PLANTS Database", "author": "USDA NRCS", "license": "public domain (US government work)", "origin": "https://plants.usda.gov/plant-profile/PLOC/images", "tags": ["summer"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/PLOC/bark/001.jpg", "target": "PLOC", "channel": "bark", "source": "USDA PLANTS Database", "author": "USDA NRCS", "license": "public domain (US government work)", "origin": "https://plants.usda.gov/plant-profile/PLOC/images", "tags": ["winter"], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder." },
  { "file": "images/concepts/bark/plated/001.jpg", "target": "bark/plated", "channel": "bark", "source": "Wikimedia Commons", "author": "Public domain contributor", "license": "public domain", "origin": "https://commons.wikimedia.org/wiki/Category:Tree_bark", "tags": [], "checked_by": "fixture", "checked_at": "2026-09-22", "note": "Fixture placeholder, textbook example of plated bark." }
]
```

- [ ] **Step 11: Create `scripts/make_placeholder_jpegs.js`**

The base64 string is a 1x1 grey baseline JPEG, 160 bytes, verified to decode.

```js
// Writes a 1x1 placeholder JPEG to every path in a manifest.
// Usage: node scripts/make_placeholder_jpegs.js [content_dir]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const MIN_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
  'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB' +
  'AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const contentDir = resolve(process.argv[2] ?? 'content_dev');
const manifestPath = join(contentDir, 'images', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const bytes = Buffer.from(MIN_JPEG_BASE64, 'base64');

let written = 0;
for (const record of manifest) {
  const target = join(contentDir, record.file);
  if (existsSync(target)) continue;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  written += 1;
}
console.log(`wrote ${written} placeholder images under ${contentDir}`);
```

- [ ] **Step 12: Generate the fixture images**

Run: `node scripts/make_placeholder_jpegs.js content_dev`
Expected: `wrote 15 placeholder images under ...\content_dev`

- [ ] **Step 13: Create `tests/helpers/fixture.js` and `tests/helpers/rng.js`**

`tests/helpers/fixture.js`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

export const FIXTURE_DIR = fileURLToPath(new URL('content_dev/', ROOT));

export function loadFixture() {
  return {
    species: readJson('content_dev/species.json'),
    concepts: readJson('content_dev/concepts.json'),
    confusion: readJson('content_dev/confusion.json'),
    units: readJson('content_dev/units.json'),
    manifest: readJson('content_dev/images/manifest.json')
  };
}
```

`tests/helpers/rng.js`:

```js
// A small linear congruential generator, so tests are deterministic.
export function makeRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
```

- [ ] **Step 14: Write the failing test**

`tests/fixture.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadFixture, FIXTURE_DIR } from './helpers/fixture.js';
import { makeRng } from './helpers/rng.js';

test('the fixture parses and holds six species', () => {
  const raw = loadFixture();
  assert.equal(Object.keys(raw.species).length, 6);
  assert.equal(raw.concepts.length, 21);
  assert.equal(raw.confusion.length, 3);
  assert.equal(raw.units.length, 9);
  assert.equal(raw.manifest.length, 15);
});

test('every manifest image exists on disk', () => {
  const raw = loadFixture();
  for (const record of raw.manifest) {
    assert.ok(existsSync(join(FIXTURE_DIR, record.file)), `missing ${record.file}`);
  }
});

test('the rng helper is deterministic', () => {
  const a = makeRng(7);
  const b = makeRng(7);
  assert.equal(a(), b());
  assert.equal(a(), b());
});
```

- [ ] **Step 15: Run the test**

Run: `node --test tests/fixture.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 16: Commit**

```bash
git add -A && git commit -m "feat: scaffold the repo and the content_dev fixture" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `app/logic/content.js`

**Files:**
- Create: `app/logic/content.js`
- Test: `tests/content.test.js`

**Interfaces:**
- Consumes: `loadFixture()` from `tests/helpers/fixture.js`.
- Produces:
  - `deriveChannels(concepts)` returns `string[]` in first-seen order.
  - `cardId(kind, channel, key)` returns the card ID string.
  - `photoPool(raw, kind, channel, key)` returns a manifest record array.
  - `deriveCards(raw, channels)` returns `{ [card_id]: card }`.
  - `unitMembers(raw, unit)` returns a symbol array.
  - `unitCards(unit, cards, raw)` returns a card ID array.
  - `validateContent(raw)` returns `{ errors, warnings }`, each entry `{ file, message }`.
  - `loadContent(raw)` returns `{ ok, content, errors, warnings }`.
  - A `card` is `{ id, kind, channel, key, bucket, photos }`. `kind` is `concept`, `group`, `species`, or `variety`. `photos` is a manifest record array with one or more entries.
  - A `content` object is `{ species, concepts, confusion, units, manifest, channels, concepts_by_channel, cards, cards_by_channel, unit_members, unit_cards, warnings }`.

**Card ID format.** Concept and group cards put the channel second. Species and variety cards put the channel last. Copy this exactly:

| Kind | Format | Example |
|---|---|---|
| concept | `concept:{channel}:{concept_key}` | `concept:bark:plated` |
| group | `group:{channel}:{genus}` | `group:leaf:Quercus` |
| species | `species:{symbol}:{channel}` | `species:QUGA:bark` |
| variety | `variety:{variety_key}:{channel}` | `variety:QUGAG:leaf` |

- [ ] **Step 1: Write the failing test for channels, cards, and pools**

`tests/content.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import {
  deriveChannels, cardId, photoPool, deriveCards,
  unitMembers, unitCards, validateContent, loadContent
} from '../app/logic/content.js';

test('the channel list derives from concepts.json', () => {
  const raw = loadFixture();
  assert.deepEqual(deriveChannels(raw.concepts), ['leaf', 'bark', 'fruit']);
  assert.ok(!deriveChannels(raw.concepts).includes('flower'));
});

test('an empty channel renders nowhere', () => {
  const raw = loadFixture();
  const result = loadContent(raw);
  assert.equal(result.ok, true);
  assert.ok(!result.content.channels.includes('twig_buds'));
  for (const card of Object.values(result.content.cards)) {
    assert.ok(result.content.channels.includes(card.channel));
  }
});

test('card IDs use the spec format', () => {
  assert.equal(cardId('concept', 'bark', 'plated'), 'concept:bark:plated');
  assert.equal(cardId('group', 'leaf', 'Quercus'), 'group:leaf:Quercus');
  assert.equal(cardId('species', 'bark', 'QUGA'), 'species:QUGA:bark');
  assert.equal(cardId('variety', 'leaf', 'QUGAG'), 'variety:QUGAG:leaf');
});

test('photo pools union the member species images', () => {
  const raw = loadFixture();
  assert.equal(photoPool(raw, 'species', 'leaf', 'QUGA').length, 2);
  assert.equal(photoPool(raw, 'group', 'leaf', 'Quercus').length, 4);
  assert.equal(photoPool(raw, 'concept', 'leaf', 'simple_lobed').length, 7);
  assert.equal(photoPool(raw, 'concept', 'bark', 'plated').length, 1);
  assert.equal(photoPool(raw, 'variety', 'leaf', 'QUGAG').length, 1);
});

test('cards derive only where images exist', () => {
  const raw = loadFixture();
  const cards = deriveCards(raw, deriveChannels(raw.concepts));
  assert.equal(Object.keys(cards).length, 25);
  assert.ok(cards['species:ACPL:leaf']);
  assert.ok(cards['species:ACPL:fruit']);
  assert.ok(!cards['species:ACPL:bark']);
  assert.ok(!cards['species:QUVE:leaf']);
  assert.ok(cards['variety:QUGAG:leaf']);
  assert.ok(cards['variety:QUGAB:leaf']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/content.test.js`
Expected: FAIL with `Cannot find module ... app/logic/content.js`.

- [ ] **Step 3: Write the channel, card, and pool half of `app/logic/content.js`**

```js
// Loads, validates, and indexes content. Pure: no DOM, no fetch, no storage.

const KIND_LEVEL = { concept: 1, group: 2, species: 3, variety: 4 };
const LEVEL_KIND = { 1: 'concept', 2: 'group', 3: 'species', 4: 'variety' };

export function deriveChannels(concepts) {
  const seen = [];
  for (const concept of concepts) {
    if (!seen.includes(concept.channel)) seen.push(concept.channel);
  }
  return seen;
}

export function cardId(kind, channel, key) {
  if (kind === 'concept' || kind === 'group') return `${kind}:${channel}:${key}`;
  return `${kind}:${key}:${channel}`;
}

function varietyOwner(raw, varietyKey) {
  for (const [symbol, record] of Object.entries(raw.species)) {
    for (const variety of record.varieties ?? []) {
      if (variety.key === varietyKey) return symbol;
    }
  }
  return null;
}

function speciesImages(raw, symbol, channel) {
  return raw.manifest.filter((m) => m.target === symbol && m.channel === channel);
}

export function photoPool(raw, kind, channel, key) {
  if (kind === 'species' || kind === 'variety') {
    return speciesImages(raw, key, channel);
  }
  const pool = [];
  for (const [symbol, record] of Object.entries(raw.species)) {
    if (kind === 'group' && record.genus !== key) continue;
    if (kind === 'concept' && record.concepts?.[channel] !== key) continue;
    pool.push(...speciesImages(raw, symbol, channel));
  }
  if (kind === 'concept') {
    pool.push(...raw.manifest.filter((m) => m.target === `${channel}/${key}`));
  }
  return pool;
}

function groupBucket(raw, genus, channel) {
  const symbols = Object.keys(raw.species)
    .filter((s) => raw.species[s].genus === genus)
    .filter((s) => speciesImages(raw, s, channel).length > 0)
    .sort();
  return symbols.length ? (raw.species[symbols[0]].concepts?.[channel] ?? null) : null;
}

export function deriveCards(raw, channels) {
  const cards = {};
  const add = (kind, channel, key, bucket) => {
    const photos = photoPool(raw, kind, channel, key);
    if (photos.length === 0) return;
    const id = cardId(kind, channel, key);
    cards[id] = { id, kind, channel, key, bucket, photos };
  };

  for (const channel of channels) {
    for (const concept of raw.concepts) {
      if (concept.channel === channel) add('concept', channel, concept.key, concept.key);
    }
    const genera = [...new Set(Object.values(raw.species).map((s) => s.genus))].sort();
    for (const genus of genera) add('group', channel, genus, groupBucket(raw, genus, channel));
    for (const [symbol, record] of Object.entries(raw.species)) {
      const bucket = record.concepts?.[channel] ?? null;
      if (bucket) add('species', channel, symbol, bucket);
      const withPhotos = (record.varieties ?? [])
        .filter((v) => speciesImages(raw, v.key, channel).length > 0);
      if (withPhotos.length >= 2) {
        for (const variety of withPhotos) add('variety', channel, variety.key, bucket);
      }
    }
  }
  return cards;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/content.test.js`
Expected: FAIL on the two tests that call `loadContent`, `unitMembers`, `unitCards`, and `validateContent`. The channel, card ID, pool, and card-count tests pass.

- [ ] **Step 5: Write the failing test for unit membership**

Append to `tests/content.test.js`:

```js
test('unit membership applies states, genera, section, include, exclude in order', () => {
  const raw = loadFixture();
  const unit = (key) => raw.units.find((u) => u.key === key);

  assert.deepEqual(unitMembers(raw, unit('leaf_types')), []);
  assert.deepEqual(
    unitMembers(raw, unit('simple_lobed_genus')).sort(),
    ['ACPL', 'ACSA2', 'PLOC', 'QUGA', 'QURU', 'QUVE']
  );
  assert.deepEqual(unitMembers(raw, unit('simple_lobed_white_oaks_co')), ['QUGA']);
  assert.deepEqual(unitMembers(raw, unit('simple_lobed_red_oaks_co')), ['QURU']);
  assert.deepEqual(unitMembers(raw, unit('simple_lobed_maples_co')).sort(), ['ACPL', 'ACSA2']);
  assert.deepEqual(unitMembers(raw, unit('simple_lobed_other_co')), ['PLOC']);
});

test('unit cards follow the unit level', () => {
  const raw = loadFixture();
  const { content } = loadContent(raw);
  assert.deepEqual(content.unit_cards.leaf_types, ['concept:leaf:simple_lobed']);
  assert.deepEqual(
    content.unit_cards.bark_types.sort(),
    ['concept:bark:furrowed', 'concept:bark:papery', 'concept:bark:plated']
  );
  assert.deepEqual(
    content.unit_cards.simple_lobed_genus.sort(),
    ['group:leaf:Acer', 'group:leaf:Platanus', 'group:leaf:Quercus']
  );
  assert.deepEqual(content.unit_cards.simple_lobed_maples_co.sort(),
    ['species:ACPL:leaf', 'species:ACSA2:leaf']);
  assert.deepEqual(content.unit_cards.quga_varieties.sort(),
    ['variety:QUGAB:leaf', 'variety:QUGAG:leaf']);
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `node --test tests/content.test.js`
Expected: FAIL with `unitMembers is not a function`.

- [ ] **Step 7: Add unit membership to `app/logic/content.js`**

```js
export function unitMembers(raw, unit) {
  if (unit.level === 1) return [];
  const states = unit.states ?? [];
  const kept = [];
  for (const [symbol, record] of Object.entries(raw.species)) {
    if (record.concepts?.[unit.channel] !== unit.bucket) continue;
    const ranges = [...(record.range?.states ?? []), ...(record.planted_states ?? [])];
    if (!ranges.some((s) => states.includes(s))) continue;
    if (unit.genera && !unit.genera.includes(record.genus)) continue;
    if (unit.section && record.section !== unit.section) continue;
    kept.push(symbol);
  }
  for (const symbol of unit.include ?? []) {
    if (raw.species[symbol] && !kept.includes(symbol)) kept.push(symbol);
  }
  return kept.filter((symbol) => !(unit.exclude ?? []).includes(symbol));
}

export function unitCards(unit, cards, raw) {
  const kind = LEVEL_KIND[unit.level];
  if (kind === 'concept') {
    return Object.values(cards)
      .filter((c) => c.kind === 'concept' && c.channel === unit.channel)
      .map((c) => c.id);
  }
  const members = unitMembers(raw, unit);
  if (kind === 'group') {
    const genera = [...new Set(members.map((s) => raw.species[s].genus))];
    return genera
      .map((g) => cardId('group', unit.channel, g))
      .filter((id) => cards[id]);
  }
  if (kind === 'species') {
    return members
      .map((s) => cardId('species', unit.channel, s))
      .filter((id) => cards[id]);
  }
  const ids = [];
  for (const symbol of members) {
    for (const variety of raw.species[symbol].varieties ?? []) {
      const id = cardId('variety', unit.channel, variety.key);
      if (cards[id]) ids.push(id);
    }
  }
  return ids;
}
```

- [ ] **Step 8: Write the failing test for validation**

Append to `tests/content.test.js`. Each bad object is inline, so the fixture stays valid.

```js
function badContent(patch) {
  return {
    species: {
      QUGA: {
        scientific: 'Quercus gambelii', common: ['Gambel oak'], genus: 'Quercus',
        genus_common: 'oak', section: 'Quercus', family: 'Fagaceae',
        arrangement: 'alternate', concepts: { leaf: 'simple_lobed' },
        range: { text: 'x', states: ['CO'] }, planted_states: [],
        elevation_ft: [1, 2], height_ft: [1, 2], habitat: 'x',
        native_status: 'native', varieties: []
      }
    },
    concepts: [{ key: 'simple_lobed', channel: 'leaf', name: 'Lobed', accept: ['lobed'], description: 'x' }],
    confusion: [],
    units: [{ key: 'leaf_types', name: 'Leaf types', channel: 'leaf', level: 1, parent: null }],
    manifest: [{ file: 'images/QUGA/leaf/001.jpg', target: 'QUGA', channel: 'leaf', source: 'x', author: 'x', license: 'public domain', origin: 'x', tags: [], checked_by: 'x', checked_at: '2026-09-22', note: 'x' }],
    ...patch
  };
}

function messages(raw) {
  return validateContent(raw).errors.map((e) => e.message).join(' | ');
}

test('the fixture validates with no errors and size warnings only', () => {
  const report = validateContent(loadFixture());
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.length > 0);
  assert.ok(report.warnings.every((w) => w.message.includes('cards')));
});

test('each validation rule fails on its own bad object', () => {
  const noGenus = badContent();
  delete noGenus.species.QUGA.genus;
  assert.match(messages(noGenus), /genus/);

  const noFamily = badContent();
  delete noFamily.species.QUGA.family;
  assert.match(messages(noFamily), /family/);

  const noCommon = badContent({});
  noCommon.species.QUGA.common = [];
  assert.match(messages(noCommon), /common name/);

  const noImage = badContent({ manifest: [] });
  assert.match(messages(noImage), /no manifest image/);

  const edgeSaves = badContent({
    manifest: [],
    confusion: [{ a: 'QUGA', b: 'QUGA', channel: 'leaf', a_not_b: 'x', b_not_a: 'y', ref: 'z' }]
  });
  assert.deepEqual(validateContent(edgeSaves).errors, []);

  const badTarget = badContent();
  badTarget.manifest[0].target = 'ZZZZ';
  assert.match(messages(badTarget), /unknown target/);

  const badConcept = badContent();
  badConcept.species.QUGA.concepts = { leaf: 'not_a_bucket' };
  assert.match(messages(badConcept), /unknown concept/);

  const badEdge = badContent({
    confusion: [{ a: 'QUGA', b: 'ZZZZ', channel: 'leaf', a_not_b: 'x', b_not_a: 'y', ref: 'z' }]
  });
  assert.match(messages(badEdge), /unknown species/);

  const badEdgeChannel = badContent({
    confusion: [{ a: 'QUGA', b: 'QUGA', channel: 'twig_buds', a_not_b: 'x', b_not_a: 'y', ref: 'z' }]
  });
  assert.match(messages(badEdgeChannel), /unknown channel/);

  const badInclude = badContent();
  badInclude.units.push({ key: 'u2', name: 'U2', channel: 'leaf', level: 2, parent: 'leaf_types', bucket: 'simple_lobed', states: ['CO'], include: ['ZZZZ'], exclude: [] });
  assert.match(messages(badInclude), /include/);

  const badParent = badContent();
  badParent.units.push({ key: 'u3', name: 'U3', channel: 'leaf', level: 3, parent: 'leaf_types', bucket: 'simple_lobed', states: ['CO'] });
  assert.match(messages(badParent), /parent/);

  const badGenera = badContent();
  badGenera.units.push({ key: 'u4', name: 'U4', channel: 'leaf', level: 2, parent: 'leaf_types', bucket: 'simple_lobed', states: ['CO'], genera: ['Nothingus'] });
  assert.match(messages(badGenera), /genera/);

  const badSection = badContent();
  badSection.units.push({ key: 'u5', name: 'U5', channel: 'leaf', level: 2, parent: 'leaf_types', bucket: 'simple_lobed', states: ['CO'], section: 'Nothingae' });
  assert.match(messages(badSection), /section/);
});

test('a unit outside 5 to 25 cards warns and does not fail', () => {
  const report = validateContent(badContent());
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.some((w) => w.message.includes('leaf_types')));
});

test('loadContent returns errors instead of content when validation fails', () => {
  const broken = badContent();
  delete broken.species.QUGA.family;
  const result = loadContent(broken);
  assert.equal(result.ok, false);
  assert.equal(result.content, null);
  assert.equal(result.errors[0].file, 'species.json');
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `node --test tests/content.test.js`
Expected: FAIL with `validateContent is not a function`.

- [ ] **Step 10: Add validation and `loadContent` to `app/logic/content.js`**

```js
export function validateContent(raw) {
  const errors = [];
  const warnings = [];
  const fail = (file, message) => errors.push({ file, message });
  const warn = (file, message) => warnings.push({ file, message });

  const channels = deriveChannels(raw.concepts);
  const conceptKeys = new Set(raw.concepts.map((c) => `${c.channel}/${c.key}`));
  const symbols = new Set(Object.keys(raw.species));
  const varietyKeys = new Set();
  for (const record of Object.values(raw.species)) {
    for (const variety of record.varieties ?? []) varietyKeys.add(variety.key);
  }
  const namedByEdge = new Set();
  for (const edge of raw.confusion) {
    namedByEdge.add(edge.a);
    namedByEdge.add(edge.b);
  }

  for (const [symbol, record] of Object.entries(raw.species)) {
    if (!record.genus) fail('species.json', `${symbol} has no genus`);
    if (!record.family) fail('species.json', `${symbol} has no family`);
    if (!record.common || record.common.length === 0) {
      fail('species.json', `${symbol} has no common name`);
    }
    const hasImage = raw.manifest.some((m) => m.target === symbol);
    if (!hasImage && !namedByEdge.has(symbol)) {
      fail('species.json', `${symbol} has no manifest image and no confusion edge`);
    }
    for (const [channel, bucket] of Object.entries(record.concepts ?? {})) {
      if (!conceptKeys.has(`${channel}/${bucket}`)) {
        fail('species.json', `${symbol} has an unknown concept ${channel}/${bucket}`);
      }
    }
  }

  for (const image of raw.manifest) {
    const known = symbols.has(image.target)
      || varietyKeys.has(image.target)
      || conceptKeys.has(image.target);
    if (!known) fail('images/manifest.json', `unknown target ${image.target}`);
  }

  for (const edge of raw.confusion) {
    if (!symbols.has(edge.a)) fail('confusion.json', `unknown species ${edge.a}`);
    if (!symbols.has(edge.b)) fail('confusion.json', `unknown species ${edge.b}`);
    if (!channels.includes(edge.channel)) {
      fail('confusion.json', `unknown channel ${edge.channel}`);
    }
  }

  const unitByKey = Object.fromEntries(raw.units.map((u) => [u.key, u]));
  const allGenera = new Set(Object.values(raw.species).map((s) => s.genus));
  const allSections = new Set(
    Object.values(raw.species).map((s) => s.section).filter(Boolean)
  );
  for (const unit of raw.units) {
    for (const symbol of [...(unit.include ?? []), ...(unit.exclude ?? [])]) {
      if (!symbols.has(symbol)) {
        fail('units.json', `${unit.key} include or exclude names unknown ${symbol}`);
      }
    }
    if (unit.level === 1) {
      if (unit.parent !== null) fail('units.json', `${unit.key} is level 1 and needs a null parent`);
    } else {
      const parent = unitByKey[unit.parent];
      if (!parent) {
        fail('units.json', `${unit.key} has an unknown parent ${unit.parent}`);
      } else if (parent.level !== unit.level - 1 || parent.channel !== unit.channel) {
        fail('units.json', `${unit.key} parent ${unit.parent} is not one level up in the same channel`);
      }
    }
    for (const genus of unit.genera ?? []) {
      if (!allGenera.has(genus)) fail('units.json', `${unit.key} genera names unknown ${genus}`);
    }
    if (unit.section && !allSections.has(unit.section)) {
      fail('units.json', `${unit.key} section names unknown ${unit.section}`);
    }
  }

  if (errors.length === 0) {
    const cards = deriveCards(raw, channels);
    for (const unit of raw.units) {
      const count = unitCards(unit, cards, raw).length;
      if (count < 5 || count > 25) {
        warn('units.json', `${unit.key} holds ${count} cards, outside the range 5 to 25`);
      }
    }
  }

  return { errors, warnings };
}

export function loadContent(raw) {
  const { errors, warnings } = validateContent(raw);
  if (errors.length > 0) return { ok: false, content: null, errors, warnings };

  const channels = deriveChannels(raw.concepts);
  const cards = deriveCards(raw, channels);
  const cardsByChannel = {};
  for (const channel of channels) {
    cardsByChannel[channel] = Object.values(cards)
      .filter((c) => c.channel === channel)
      .map((c) => c.id);
  }
  const conceptsByChannel = {};
  for (const channel of channels) {
    conceptsByChannel[channel] = raw.concepts.filter((c) => c.channel === channel);
  }
  const unitMembersByKey = {};
  const unitCardsByKey = {};
  for (const unit of raw.units) {
    unitMembersByKey[unit.key] = unitMembers(raw, unit);
    unitCardsByKey[unit.key] = unitCards(unit, cards, raw);
  }

  const content = {
    species: raw.species,
    concepts: raw.concepts,
    confusion: raw.confusion,
    units: raw.units,
    manifest: raw.manifest,
    channels,
    concepts_by_channel: conceptsByChannel,
    cards,
    cards_by_channel: cardsByChannel,
    unit_members: unitMembersByKey,
    unit_cards: unitCardsByKey,
    warnings
  };
  return { ok: true, content, errors: [], warnings };
}

export { KIND_LEVEL, LEVEL_KIND };
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `node --test tests/content.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 12: Validate the fixture and the live content set**

Both directories must pass. `scripts/validate_content.js` arrives in Task 13, so use a one-line check now.

Run: `node --input-type=module -e "import {loadFixture} from './tests/helpers/fixture.js'; import {validateContent} from './app/logic/content.js'; console.log(JSON.stringify(validateContent(loadFixture()).errors))"`
Expected: `[]`

- [ ] **Step 13: Commit**

```bash
git add -A && git commit -m "feat: add content loading, validation, and card derivation" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `app/logic/scheduler.js`

**Files:**
- Create: `app/logic/scheduler.js`
- Test: `tests/scheduler.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `FORMAT_THRESHOLDS_MS` is `{ mc4: 8000, mc8: 15000, inv: 20000, typed: 20000 }`.
  - `TIME_CEILING_MS` is `60000`.
  - `PROMOTION_GATES` is `{ mc8: 7, inv: 21, typed: 21 }`, keyed by the tier being entered.
  - `deriveGrade({ correct, guess, elapsed_ms, format })` returns `'again' | 'hard' | 'good'`.
  - `newCardState()` returns a fresh state at tier `mc4`.
  - `nextTier(tier, invAvailable)` returns the tier above, or `null` at `typed`.
  - `previousTier(tier, invAvailable)` returns the tier below, or `'mc4'` at `mc4`.
  - `addDays(dateString, days)` returns a `YYYY-MM-DD` string.
  - `isDue(state, today)` returns a boolean. A missing state is not due.
  - `scheduleCard(state, grade, today, { inv_available })` returns a new state object. It never mutates the input.
  - A card state is `{ interval, ease, due, reps, lapses, recent, tier, tier_passes }`.

**Learning steps.** The spec fixes the chain 1, 4, 10, 25. The rule that produces it: a right answer on a new card sets interval 1, a right answer at interval 1 sets interval 4, and every later right answer uses the normal multiplier. A `hard` answer at interval 1 also moves to 4, so the card cannot stall.

- [ ] **Step 1: Write the failing test for grade derivation**

`tests/scheduler.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveGrade, scheduleCard, newCardState, addDays, isDue,
  nextTier, previousTier, FORMAT_THRESHOLDS_MS, TIME_CEILING_MS, PROMOTION_GATES
} from '../app/logic/scheduler.js';

test('a wrong answer is again at any time', () => {
  assert.equal(deriveGrade({ correct: false, guess: false, elapsed_ms: 500, format: 'mc4' }), 'again');
  assert.equal(deriveGrade({ correct: false, guess: true, elapsed_ms: 90000, format: 'typed' }), 'again');
});

test('a checked guess box makes a right answer hard', () => {
  assert.equal(deriveGrade({ correct: true, guess: true, elapsed_ms: 900, format: 'mc4' }), 'hard');
});

test('an elapsed time over the format threshold makes a right answer hard', () => {
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 8001, format: 'mc4' }), 'hard');
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 7999, format: 'mc4' }), 'good');
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 15001, format: 'mc8' }), 'hard');
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 20001, format: 'inv' }), 'hard');
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 20001, format: 'typed' }), 'hard');
});

test('above 60 seconds the time signal is discarded', () => {
  assert.equal(deriveGrade({ correct: true, guess: false, elapsed_ms: 61000, format: 'mc4' }), 'good');
  assert.equal(deriveGrade({ correct: true, guess: true, elapsed_ms: 61000, format: 'mc4' }), 'hard');
  assert.equal(TIME_CEILING_MS, 60000);
  assert.equal(FORMAT_THRESHOLDS_MS.mc8, 15000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/scheduler.test.js`
Expected: FAIL with `Cannot find module ... app/logic/scheduler.js`.

- [ ] **Step 3: Write the grade half of `app/logic/scheduler.js`**

```js
// SM-2 plus the tier ladder. Pure: no DOM, no fetch, no storage.

export const FORMAT_THRESHOLDS_MS = { mc4: 8000, mc8: 15000, inv: 20000, typed: 20000 };
export const TIME_CEILING_MS = 60000;
export const PROMOTION_GATES = { mc8: 7, inv: 21, typed: 21 };
export const TIER_ORDER = ['mc4', 'mc8', 'inv', 'typed'];
const EASE_START = 2.5;
const EASE_FLOOR = 1.3;

export function deriveGrade({ correct, guess, elapsed_ms, format }) {
  if (!correct) return 'again';
  if (guess) return 'hard';
  if (elapsed_ms > TIME_CEILING_MS) return 'good';
  return elapsed_ms > FORMAT_THRESHOLDS_MS[format] ? 'hard' : 'good';
}

export function newCardState() {
  return {
    interval: 0, ease: EASE_START, due: null, reps: 0, lapses: 0,
    recent: [], tier: 'mc4', tier_passes: 0
  };
}

export function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const base = Date.UTC(year, month - 1, day) + days * 86400000;
  return new Date(base).toISOString().slice(0, 10);
}

export function isDue(state, today) {
  if (!state || !state.due) return false;
  return state.due <= today;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/scheduler.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing test for SM-2**

Append to `tests/scheduler.test.js`:

```js
const OPTS = { inv_available: true };

test('a new card runs the 1, 4, 10, 25 chain on good', () => {
  let state = scheduleCard(null, 'good', '2026-01-01', OPTS);
  assert.equal(state.interval, 1);
  assert.equal(state.due, '2026-01-02');
  assert.equal(state.reps, 1);
  state = scheduleCard(state, 'good', '2026-01-02', OPTS);
  assert.equal(state.interval, 4);
  state = scheduleCard(state, 'good', '2026-01-06', OPTS);
  assert.equal(state.interval, 10);
  state = scheduleCard(state, 'good', '2026-01-16', OPTS);
  assert.equal(state.interval, 25);
});

test('hard multiplies by 1.2 and drops ease by 0.15', () => {
  const start = { ...newCardState(), interval: 10, reps: 3, tier: 'mc8', ease: 2.5 };
  const state = scheduleCard(start, 'hard', '2026-01-01', OPTS);
  assert.equal(state.interval, 12);
  assert.equal(state.ease, 2.35);
});

test('again resets the interval to 1, adds a lapse, and drops ease by 0.2', () => {
  const start = { ...newCardState(), interval: 25, reps: 5, lapses: 1, tier: 'inv', ease: 2.5 };
  const state = scheduleCard(start, 'again', '2026-01-01', OPTS);
  assert.equal(state.interval, 1);
  assert.equal(state.lapses, 2);
  assert.equal(state.ease, 2.3);
  assert.equal(state.due, '2026-01-02');
});

test('ease has a floor of 1.3', () => {
  let state = { ...newCardState(), interval: 4, reps: 2, ease: 1.4 };
  state = scheduleCard(state, 'again', '2026-01-01', OPTS);
  assert.equal(state.ease, 1.3);
  state = scheduleCard(state, 'again', '2026-01-02', OPTS);
  assert.equal(state.ease, 1.3);
});

test('recent holds the last three grades and reps counts every review', () => {
  let state = null;
  for (const grade of ['good', 'hard', 'good', 'again']) {
    state = scheduleCard(state, grade, '2026-01-01', OPTS);
  }
  assert.deepEqual(state.recent, ['hard', 'good', 'again']);
  assert.equal(state.reps, 4);
});

test('scheduleCard does not mutate its input', () => {
  const start = { ...newCardState(), interval: 10, reps: 3, tier: 'mc8' };
  const copy = JSON.parse(JSON.stringify(start));
  scheduleCard(start, 'good', '2026-01-01', OPTS);
  assert.deepEqual(start, copy);
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `node --test tests/scheduler.test.js`
Expected: FAIL with `scheduleCard is not a function`.

- [ ] **Step 7: Add SM-2 and the ladder to `app/logic/scheduler.js`**

```js
export function nextTier(tier, invAvailable) {
  if (tier === 'mc4') return 'mc8';
  if (tier === 'mc8') return invAvailable ? 'inv' : 'typed';
  if (tier === 'inv') return 'typed';
  return null;
}

export function previousTier(tier, invAvailable) {
  if (tier === 'typed') return invAvailable ? 'inv' : 'mc8';
  if (tier === 'inv') return 'mc8';
  return 'mc4';
}

function nextInterval(state, grade) {
  if (grade === 'again') return 1;
  if (state.interval < 1) return 1;
  if (state.interval === 1) return 4;
  if (grade === 'hard') return Math.round(state.interval * 1.2);
  return Math.round(state.interval * state.ease);
}

function nextEase(state, grade) {
  const delta = grade === 'good' ? 0 : grade === 'hard' ? -0.15 : -0.2;
  return Math.max(EASE_FLOOR, Math.round((state.ease + delta) * 100) / 100);
}

export function scheduleCard(state, grade, today, options = {}) {
  const invAvailable = options.inv_available !== false;
  const prior = state ? { ...state, recent: [...(state.recent ?? [])] } : newCardState();

  const interval = nextInterval(prior, grade);
  const ease = nextEase(prior, grade);
  const recent = [...prior.recent, grade].slice(-3);

  let tier = prior.tier;
  let passes = prior.tier_passes;

  if (grade === 'again') {
    tier = previousTier(prior.tier, invAvailable);
    passes = 0;
  } else {
    if (grade === 'good') passes += 1;
    const upper = nextTier(tier, invAvailable);
    if (upper && passes >= 2 && interval >= PROMOTION_GATES[upper]) {
      tier = upper;
      passes = 0;
    }
  }

  return {
    interval,
    ease,
    due: addDays(today, interval),
    reps: prior.reps + 1,
    lapses: prior.lapses + (grade === 'again' ? 1 : 0),
    recent,
    tier,
    tier_passes: passes
  };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test tests/scheduler.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 9: Write the failing test for the tier ladder**

Append to `tests/scheduler.test.js`:

```js
test('promotion needs two good passes and the interval gate', () => {
  let state = { ...newCardState(), interval: 10, reps: 3, tier: 'mc4', tier_passes: 0 };
  state = scheduleCard(state, 'good', '2026-01-01', OPTS);
  assert.equal(state.tier, 'mc4');
  assert.equal(state.tier_passes, 1);
  state = scheduleCard(state, 'good', '2026-01-02', OPTS);
  assert.equal(state.tier, 'mc8');
  assert.equal(state.tier_passes, 0);
});

test('the interval gate blocks a promotion that has the passes', () => {
  let state = { ...newCardState(), interval: 1, reps: 1, tier: 'mc4', tier_passes: 1 };
  state = scheduleCard(state, 'good', '2026-01-01', OPTS);
  assert.equal(state.interval, 4);
  assert.equal(state.tier_passes, 2);
  assert.equal(state.tier, 'mc4');
  assert.equal(PROMOTION_GATES.mc8, 7);
});

test('a hard grade is not a pass', () => {
  let state = { ...newCardState(), interval: 10, reps: 3, tier: 'mc4', tier_passes: 1 };
  state = scheduleCard(state, 'hard', '2026-01-01', OPTS);
  assert.equal(state.tier_passes, 1);
  assert.equal(state.tier, 'mc4');
});

test('demotion drops one tier and resets tier_passes, with no exception at level 4', () => {
  const expert = { ...newCardState(), interval: 60, reps: 9, tier: 'typed', tier_passes: 3 };
  const after = scheduleCard(expert, 'again', '2026-01-01', OPTS);
  assert.equal(after.tier, 'inv');
  assert.equal(after.tier_passes, 0);
  const floor = scheduleCard({ ...newCardState(), tier: 'mc4', tier_passes: 2 }, 'again', '2026-01-01', OPTS);
  assert.equal(floor.tier, 'mc4');
  assert.equal(floor.tier_passes, 0);
});

test('typed keeps counting passes and never promotes further', () => {
  let state = { ...newCardState(), interval: 40, reps: 8, tier: 'typed', tier_passes: 0 };
  state = scheduleCard(state, 'good', '2026-01-01', OPTS);
  assert.equal(state.tier, 'typed');
  assert.equal(state.tier_passes, 1);
  assert.equal(nextTier('typed', true), null);
});

test('the inv tier is skipped when the channel has fewer than four photo options', () => {
  const noInv = { inv_available: false };
  assert.equal(nextTier('mc8', false), 'typed');
  assert.equal(previousTier('typed', false), 'mc8');
  let state = { ...newCardState(), interval: 25, reps: 5, tier: 'mc8', tier_passes: 1 };
  state = scheduleCard(state, 'good', '2026-01-01', noInv);
  assert.equal(state.tier, 'typed');
  const demoted = scheduleCard({ ...newCardState(), interval: 40, reps: 9, tier: 'typed', tier_passes: 2 }, 'again', '2026-01-01', noInv);
  assert.equal(demoted.tier, 'mc8');
});

test('isDue compares the due date against today', () => {
  assert.equal(isDue({ due: '2026-01-01' }, '2026-01-01'), true);
  assert.equal(isDue({ due: '2025-12-31' }, '2026-01-01'), true);
  assert.equal(isDue({ due: '2026-01-02' }, '2026-01-01'), false);
  assert.equal(isDue(null, '2026-01-01'), false);
});

test('addDays crosses a month and a year boundary', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `node --test tests/scheduler.test.js`
Expected: PASS, 18 tests. The ladder code is already in place from Step 7, so this cycle confirms it rather than driving new code. If any assertion fails, fix `scheduleCard` before moving on.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat: add the SM-2 scheduler and the tier ladder" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `app/logic/grader.js`

**Files:**
- Create: `app/logic/grader.js`
- Test: `tests/grader.test.js`

**Interfaces:**
- Consumes: a `content` object and a `card` object from `app/logic/content.js`.
- Produces:
  - `normalize(text)` returns a normalized string.
  - `acceptedAnswers(card, content)` returns an array of normalized strings.
  - `gradeTyped(card, text, content)` returns a boolean.
  - `gradeChoice(answerKey, chosenKey)` returns a boolean.
  - `resolveTyped(text, kind, channel, content)` returns the card key the text names, or null.

**Accepted answers per kind:**

| Kind | Accepted |
|---|---|
| species | the scientific name, and every entry in `common` |
| concept | every entry in the concept's `accept` array |
| group | the genus, and every distinct `genus_common` among its members |
| variety | the variety `name` and the variety `key` |

- [ ] **Step 1: Write the failing test**

`tests/grader.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { loadContent } from '../app/logic/content.js';
import {
  normalize, acceptedAnswers, gradeTyped, gradeChoice, resolveTyped
} from '../app/logic/grader.js';

const { content } = loadContent(loadFixture());

test('the normalizer lowercases, drops punctuation, and turns a hyphen into a space', () => {
  assert.equal(normalize('  Gambel   Oak!  '), 'gambel oak');
  assert.equal(normalize('Scale-like'), 'scale like');
  assert.equal(normalize("Quercus  gambelii."), 'quercus gambelii');
  assert.equal(normalize('Plated / blocky'), 'plated blocky');
  assert.equal(normalize(''), '');
  assert.equal(normalize(null), '');
});

test('a species card accepts the scientific name and every common name', () => {
  const card = content.cards['species:QUGA:leaf'];
  assert.equal(gradeTyped(card, 'Quercus gambelii', content), true);
  assert.equal(gradeTyped(card, 'gambel oak', content), true);
  assert.equal(gradeTyped(card, 'Rocky-Mountain white oak', content), true);
  assert.equal(gradeTyped(card, 'Quercus rubra', content), false);
});

test('a near miss in the same genus is wrong', () => {
  const card = content.cards['species:QURU:leaf'];
  assert.equal(gradeTyped(card, 'Quercus velutina', content), false);
  assert.equal(gradeTyped(card, 'black oak', content), false);
  assert.equal(gradeTyped(card, 'oak', content), false);
});

test('a concept card accepts every entry in accept', () => {
  const card = content.cards['concept:bark:plated'];
  for (const word of ['plated', 'blocky', 'plated blocky', 'plate bark']) {
    assert.equal(gradeTyped(card, word, content), true, word);
  }
  assert.equal(gradeTyped(card, 'furrowed', content), false);
});

test('a group card accepts the genus and the group common name', () => {
  const card = content.cards['group:leaf:Quercus'];
  assert.equal(gradeTyped(card, 'Quercus', content), true);
  assert.equal(gradeTyped(card, 'oak', content), true);
  assert.equal(gradeTyped(card, 'maple', content), false);
  assert.deepEqual(acceptedAnswers(content.cards['group:leaf:Acer'], content).sort(), ['acer', 'maple']);
});

test('a variety card accepts the variety name and its key', () => {
  const card = content.cards['variety:QUGAG:leaf'];
  assert.equal(gradeTyped(card, 'var. gambelii', content), true);
  assert.equal(gradeTyped(card, 'QUGAG', content), true);
  assert.equal(gradeTyped(card, 'var. bakeri', content), false);
});

test('a multiple choice answer is an exact key match', () => {
  assert.equal(gradeChoice('QUGA', 'QUGA'), true);
  assert.equal(gradeChoice('QUGA', 'QURU'), false);
});

test('a typed answer resolves back to the key it names', () => {
  assert.equal(resolveTyped('northern red oak', 'species', 'leaf', content), 'QURU');
  assert.equal(resolveTyped('Quercus rubra', 'species', 'leaf', content), 'QURU');
  assert.equal(resolveTyped('blocky', 'concept', 'bark', content), 'plated');
  assert.equal(resolveTyped('black oak', 'species', 'leaf', content), null);
  assert.equal(resolveTyped('', 'species', 'leaf', content), null);
});
```

`resolveTyped('black oak', ...)` returns null because QUVE has no leaf card.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/grader.test.js`
Expected: FAIL with `Cannot find module ... app/logic/grader.js`.

- [ ] **Step 3: Write `app/logic/grader.js`**

```js
// Answer normalization and the match rules per card kind.

export function normalize(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[-‐-―]/gu, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function varietyRecord(content, varietyKey) {
  for (const record of Object.values(content.species)) {
    for (const variety of record.varieties ?? []) {
      if (variety.key === varietyKey) return variety;
    }
  }
  return null;
}

export function acceptedAnswers(card, content) {
  const raw = [];
  if (card.kind === 'species') {
    const record = content.species[card.key];
    raw.push(record.scientific, ...record.common);
  } else if (card.kind === 'concept') {
    const concept = content.concepts.find(
      (c) => c.channel === card.channel && c.key === card.key
    );
    raw.push(...(concept?.accept ?? []));
  } else if (card.kind === 'group') {
    raw.push(card.key);
    for (const record of Object.values(content.species)) {
      if (record.genus === card.key && record.genus_common) raw.push(record.genus_common);
    }
  } else if (card.kind === 'variety') {
    const variety = varietyRecord(content, card.key);
    raw.push(card.key);
    if (variety) raw.push(variety.name);
  }
  return [...new Set(raw.map(normalize).filter(Boolean))];
}

export function gradeTyped(card, text, content) {
  return acceptedAnswers(card, content).includes(normalize(text));
}

export function gradeChoice(answerKey, chosenKey) {
  return answerKey === chosenKey;
}

export function resolveTyped(text, kind, channel, content) {
  const target = normalize(text);
  if (!target) return null;
  for (const card of Object.values(content.cards)) {
    if (card.kind !== kind || card.channel !== channel) continue;
    if (acceptedAnswers(card, content).includes(target)) return card.key;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/grader.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add the answer normalizer and the grading rules" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `app/logic/question.js`

**Files:**
- Create: `app/logic/question.js`
- Test: `tests/question.test.js`

**Interfaces:**
- Consumes: `content` and `card` from `app/logic/content.js`; a card state from `app/logic/scheduler.js`.
- Produces:
  - `shuffle(items, rng)` returns a new shuffled array. `session.js` imports this.
  - `invAvailable(content, channel)` returns true when the channel holds four or more species cards.
  - `formatFor(state)` returns the card's tier, or `'mc4'` when there is no state.
  - `optionCountFor(format)` returns 4 for `mc4`, and 8 for `mc8` and `inv`.
  - `pickPhoto(card, excludedFiles, rng)` returns a manifest record, or `null` when the pool is exhausted.
  - `speciesCardSymbols(content, channel)` returns the symbols with a species card on the channel.
  - `speciesDistractors({ symbol, channel, count, content, rng })` returns a symbol array.
  - `labelFor(content, kind, channel, key)` returns `{ label, sublabel }`.
  - `varietyOf(content, varietyKey)` returns `{ symbol, variety }`.
  - `buildQuestion({ card, content, state, excluded_files, rng })` returns a question.
  - `buildReveal({ question, chosen_key, content })` returns a reveal. A `chosen_key` of null means the user typed something that names no card.
  - A question is `{ card_id, kind, channel, key, tier, format, prompt, photo, options, answer_key, option_count }`.
  - An option is `{ key, label, sublabel, photo }`. `photo` is null except on `inv`.
  - A reveal is `{ correct, card_id, channel, answer, chosen, diagnostic, missing_edge }`.

**Prompts:**

| Kind | Prompt |
|---|---|
| concept | `What leaf type is this?` (the channel key, underscores as spaces) |
| group | `Which genus?` |
| species | `Which species?` |
| variety | `Which variety?` |
| any kind at `inv` | `Which photo shows <label>?` |

- [ ] **Step 1: Write the failing test for sampling, format, and distractors**

`tests/question.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { makeRng } from './helpers/rng.js';
import { loadContent } from '../app/logic/content.js';
import {
  shuffle, invAvailable, formatFor, optionCountFor, pickPhoto,
  speciesDistractors, labelFor, buildQuestion, buildReveal
} from '../app/logic/question.js';

const { content } = loadContent(loadFixture());

test('the format always equals the tier', () => {
  assert.equal(formatFor(null), 'mc4');
  assert.equal(formatFor({ tier: 'mc8' }), 'mc8');
  assert.equal(formatFor({ tier: 'inv' }), 'inv');
  assert.equal(formatFor({ tier: 'typed' }), 'typed');
  assert.equal(optionCountFor('mc4'), 4);
  assert.equal(optionCountFor('mc8'), 8);
  assert.equal(optionCountFor('inv'), 8);
});

test('inv availability follows the species card count on the channel', () => {
  assert.equal(invAvailable(content, 'leaf'), true);
  assert.equal(invAvailable(content, 'bark'), false);
  assert.equal(invAvailable(content, 'fruit'), false);
});

test('the same image is not shown twice in a row', () => {
  const card = content.cards['species:QUGA:leaf'];
  const first = pickPhoto(card, [], makeRng(1));
  const second = pickPhoto(card, [first.file], makeRng(1));
  assert.notEqual(second.file, first.file);
});

test('an exhausted pool returns null', () => {
  const card = content.cards['species:ACSA2:leaf'];
  assert.equal(pickPhoto(card, ['images/ACSA2/leaf/001.jpg'], makeRng(1)), null);
});

test('the distractor ladder walks the steps in order and never includes the answer', () => {
  const picks = speciesDistractors({
    symbol: 'QURU', channel: 'leaf', count: 3, content, rng: makeRng(5)
  });
  assert.equal(picks.length, 3);
  assert.ok(!picks.includes('QURU'));
  assert.ok(!picks.includes('QUVE'));
  assert.equal(picks[0], 'QUGA');
});

test('distractors are filtered to species with a card on this channel', () => {
  const picks = speciesDistractors({
    symbol: 'QUGA', channel: 'bark', count: 8, content, rng: makeRng(3)
  });
  assert.deepEqual(picks.sort(), ['PLOC', 'QURU']);
});
```

Note on the first ladder assertion: QURU's leaf confusion neighbours are QUVE and QUGA. QUVE has no leaf card, so step 1 yields QUGA alone and QUGA must come first.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/question.test.js`
Expected: FAIL with `Cannot find module ... app/logic/question.js`.

- [ ] **Step 3: Write the sampling and distractor half of `app/logic/question.js`**

```js
// Picks the format, samples a photo, builds options and distractors, builds the reveal.
import { cardId } from './content.js';

export function shuffle(items, rng = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function speciesCardSymbols(content, channel) {
  return Object.values(content.cards)
    .filter((c) => c.kind === 'species' && c.channel === channel)
    .map((c) => c.key);
}

export function invAvailable(content, channel) {
  return speciesCardSymbols(content, channel).length >= 4;
}

export function formatFor(state) {
  return state?.tier ?? 'mc4';
}

export function optionCountFor(format) {
  return format === 'mc4' ? 4 : 8;
}

export function pickPhoto(card, excludedFiles = [], rng = Math.random) {
  const usable = card.photos.filter((p) => !excludedFiles.includes(p.file));
  if (usable.length === 0) return null;
  return usable[Math.floor(rng() * usable.length)];
}

function edgeNeighbours(content, symbol, channel, sameChannelOnly) {
  const out = [];
  for (const edge of content.confusion) {
    if (sameChannelOnly && edge.channel !== channel) continue;
    if (edge.a === symbol) out.push(edge.b);
    if (edge.b === symbol) out.push(edge.a);
  }
  return out;
}

export function speciesDistractors({ symbol, channel, count, content, rng = Math.random }) {
  const eligible = new Set(speciesCardSymbols(content, channel));
  eligible.delete(symbol);
  const record = content.species[symbol];
  const bucket = record.concepts?.[channel] ?? null;

  const steps = [
    edgeNeighbours(content, symbol, channel, true),
    edgeNeighbours(content, symbol, channel, false),
    [...eligible].filter((s) => content.species[s].genus === record.genus),
    [...eligible].filter((s) => content.species[s].family === record.family),
    [...eligible].filter((s) => content.species[s].concepts?.[channel] === bucket),
    [...eligible]
  ];

  const picked = [];
  for (const step of steps) {
    const fresh = [...new Set(step)].filter((s) => eligible.has(s) && !picked.includes(s));
    for (const candidate of shuffle(fresh, rng)) {
      if (picked.length >= count) break;
      picked.push(candidate);
    }
    if (picked.length >= count) break;
  }
  return picked;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/question.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing test for question building**

Append to `tests/question.test.js`:

```js
test('a species question at mc4 shows four options including the answer', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_files: [], rng: makeRng(11) });
  assert.equal(q.format, 'mc4');
  assert.equal(q.prompt, 'Which species?');
  assert.equal(q.options.length, 4);
  assert.equal(q.option_count, 4);
  assert.equal(q.answer_key, 'QUGA');
  assert.ok(q.options.some((o) => o.key === 'QUGA'));
  assert.ok(q.photo.file.startsWith('images/QUGA/leaf/'));
  const answer = q.options.find((o) => o.key === 'QUGA');
  assert.equal(answer.label, 'Gambel oak');
  assert.equal(answer.sublabel, 'Quercus gambelii');
});

test('mc8 shows as many options as exist', () => {
  const card = content.cards['species:QUGA:bark'];
  const q = buildQuestion({
    card, content, state: { tier: 'mc8' }, excluded_files: [], rng: makeRng(2)
  });
  assert.equal(q.format, 'mc8');
  assert.equal(q.options.length, 3);
  assert.equal(q.option_count, 3);
});

test('a bark concept card at mc8 shows one option per bark category', () => {
  const card = content.cards['concept:bark:plated'];
  const q = buildQuestion({
    card, content, state: { tier: 'mc8' }, excluded_files: [], rng: makeRng(4)
  });
  assert.equal(q.prompt, 'What bark type is this?');
  assert.equal(q.options.length, 6);
  assert.ok(q.options.some((o) => o.key === 'plated' && o.label === 'Plated / blocky'));
});

test('a group card below four options falls back to typed without changing the tier', () => {
  const card = content.cards['group:bark:Quercus'];
  const q = buildQuestion({
    card, content, state: { tier: 'mc8' }, excluded_files: [], rng: makeRng(6)
  });
  assert.equal(q.tier, 'mc8');
  assert.equal(q.format, 'typed');
  assert.equal(q.options.length, 0);
  assert.equal(q.option_count, 0);
});

test('a group option shows the genus common name over the genus', () => {
  assert.deepEqual(labelFor(content, 'group', 'leaf', 'Quercus'),
    { label: 'oak', sublabel: 'Quercus' });
  assert.deepEqual(labelFor(content, 'species', 'leaf', 'QURU'),
    { label: 'Northern red oak', sublabel: 'Quercus rubra' });
  assert.deepEqual(labelFor(content, 'concept', 'bark', 'plated'),
    { label: 'Plated / blocky', sublabel: '' });
  assert.deepEqual(labelFor(content, 'variety', 'leaf', 'QUGAG'),
    { label: 'var. gambelii', sublabel: 'Quercus gambelii' });
});

test('a leaf group card also falls back to typed, because its bucket holds three genera', () => {
  const card = content.cards['group:leaf:Quercus'];
  const q = buildQuestion({
    card, content, state: { tier: 'mc4' }, excluded_files: [], rng: makeRng(8)
  });
  assert.equal(q.prompt, 'Which genus?');
  assert.equal(q.format, 'typed');
  assert.equal(q.options.length, 0);
});

test('a variety question offers the sibling varieties', () => {
  const card = content.cards['variety:QUGAG:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_files: [], rng: makeRng(9) });
  assert.equal(q.prompt, 'Which variety?');
  assert.deepEqual(q.options.map((o) => o.key).sort(), ['QUGAB', 'QUGAG']);
});

test('an inv question names the answer and offers photos', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({
    card, content, state: { tier: 'inv' }, excluded_files: [], rng: makeRng(13)
  });
  assert.equal(q.format, 'inv');
  assert.equal(q.prompt, 'Which photo shows Gambel oak?');
  assert.equal(q.photo, null);
  assert.equal(q.options.length, 5);
  for (const option of q.options) assert.ok(option.photo.file.endsWith('.jpg'));
  assert.ok(q.options.some((o) => o.key === 'QUGA'));
});

test('a typed question shows no options', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({
    card, content, state: { tier: 'typed' }, excluded_files: [], rng: makeRng(14)
  });
  assert.equal(q.format, 'typed');
  assert.deepEqual(q.options, []);
  assert.equal(q.option_count, 0);
});
```

The group test on the leaf channel expects `typed` because the fixture holds three genera with a leaf card and only two share the `simple_lobed` bucket with Quercus, which is under four options.

- [ ] **Step 6: Run the test to verify it fails**

Run: `node --test tests/question.test.js`
Expected: FAIL with `buildQuestion is not a function` and `labelFor is not a function`.

- [ ] **Step 7: Add question building to `app/logic/question.js`**

```js
function channelWords(channel) {
  return channel.replace(/_/gu, ' ');
}

function conceptRecord(content, channel, key) {
  return content.concepts.find((c) => c.channel === channel && c.key === key) ?? null;
}

export function varietyOf(content, varietyKey) {
  for (const [symbol, record] of Object.entries(content.species)) {
    for (const variety of record.varieties ?? []) {
      if (variety.key === varietyKey) return { symbol, variety };
    }
  }
  return { symbol: null, variety: null };
}

export function labelFor(content, kind, channel, key) {
  if (kind === 'species') {
    const record = content.species[key];
    return { label: record.common[0], sublabel: record.scientific };
  }
  if (kind === 'concept') {
    const concept = conceptRecord(content, channel, key);
    return { label: concept?.name ?? key, sublabel: '' };
  }
  if (kind === 'group') {
    const member = Object.values(content.species).find((s) => s.genus === key);
    return { label: member?.genus_common ?? key, sublabel: key };
  }
  const { symbol, variety } = varietyOf(content, key);
  return { label: variety?.name ?? key, sublabel: symbol ? content.species[symbol].scientific : '' };
}

function siblingKeys(card, content, count, rng) {
  if (card.kind === 'concept') {
    const others = content.concepts_by_channel[card.channel]
      .map((c) => c.key)
      .filter((k) => k !== card.key);
    return shuffle(others, rng).slice(0, count);
  }
  if (card.kind === 'group') {
    const others = Object.values(content.cards)
      .filter((c) => c.kind === 'group' && c.channel === card.channel)
      .filter((c) => c.bucket === card.bucket && c.key !== card.key)
      .map((c) => c.key);
    return shuffle(others, rng).slice(0, count);
  }
  if (card.kind === 'variety') {
    const { symbol } = varietyOf(content, card.key);
    const others = (content.species[symbol]?.varieties ?? [])
      .map((v) => v.key)
      .filter((k) => k !== card.key)
      .filter((k) => content.cards[cardId('variety', card.channel, k)]);
    return shuffle(others, rng).slice(0, count);
  }
  return speciesDistractors({
    symbol: card.key, channel: card.channel, count, content, rng
  });
}

export function buildQuestion({ card, content, state, excluded_files = [], rng = Math.random }) {
  const tier = formatFor(state);
  const base = {
    card_id: card.id, kind: card.kind, channel: card.channel, key: card.key,
    tier, answer_key: card.key
  };

  if (tier === 'typed') {
    return {
      ...base, format: 'typed', prompt: promptFor(card.kind, card.channel),
      photo: pickPhoto(card, excluded_files, rng), options: [], option_count: 0
    };
  }

  const wanted = optionCountFor(tier) - 1;
  const distractorKeys = siblingKeys(card, content, wanted, rng);

  if (tier === 'inv') {
    const own = pickPhoto(card, excluded_files, rng);
    const options = [{ key: card.key, ...labelFor(content, card.kind, card.channel, card.key), photo: own }];
    for (const key of distractorKeys) {
      const other = content.cards[cardId(card.kind, card.channel, key)];
      const photo = other ? pickPhoto(other, [], rng) : null;
      if (photo) options.push({ key, ...labelFor(content, card.kind, card.channel, key), photo });
    }
    const shown = shuffle(options, rng);
    const { label } = labelFor(content, card.kind, card.channel, card.key);
    return {
      ...base, format: 'inv', prompt: `Which photo shows ${label}?`,
      photo: null, options: shown, option_count: shown.length
    };
  }

  const keys = [card.key, ...distractorKeys];
  if ((card.kind === 'concept' || card.kind === 'group') && keys.length < 4) {
    return {
      ...base, format: 'typed', prompt: promptFor(card.kind, card.channel),
      photo: pickPhoto(card, excluded_files, rng), options: [], option_count: 0
    };
  }
  const options = shuffle(
    keys.map((key) => ({ key, ...labelFor(content, card.kind, card.channel, key), photo: null })),
    rng
  );
  return {
    ...base, format: tier, prompt: promptFor(card.kind, card.channel),
    photo: pickPhoto(card, excluded_files, rng), options, option_count: options.length
  };
}

function promptFor(kind, channel) {
  if (kind === 'concept') return `What ${channelWords(channel)} type is this?`;
  if (kind === 'group') return 'Which genus?';
  if (kind === 'species') return 'Which species?';
  return 'Which variety?';
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test tests/question.test.js`
Expected: PASS, 15 tests.

- [ ] **Step 9: Write the failing test for the reveal**

Append to `tests/question.test.js`:

```js
test('a wrong species answer shows the confusion sentence in the right direction', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_files: [], rng: makeRng(21) });
  const reveal = buildReveal({ question: q, chosen_key: 'QURU', content });
  assert.equal(reveal.correct, false);
  assert.equal(reveal.diagnostic.kind, 'edge');
  assert.equal(reveal.diagnostic.text, 'Gambel oak has rounded lobes with no bristle tips.');
  assert.equal(reveal.diagnostic.ref, 'USDA Silvics Manual, Quercus gambelii');
  assert.equal(reveal.missing_edge, null);
  assert.ok(reveal.chosen.photo.file.startsWith('images/QURU/leaf/'));
});

test('the reverse direction uses b_not_a', () => {
  const card = content.cards['species:QURU:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_files: [], rng: makeRng(22) });
  const reveal = buildReveal({ question: q, chosen_key: 'QUGA', content });
  assert.equal(reveal.diagnostic.text,
    'Northern red oak has pointed lobes that end in bristle tips.');
});

test('a missing edge falls back to bucket and genus and records the pair', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_files: [], rng: makeRng(23) });
  const reveal = buildReveal({ question: q, chosen_key: 'ACPL', content });
  assert.equal(reveal.diagnostic.kind, 'fallback');
  assert.match(reveal.diagnostic.text, /Simple, lobed/);
  assert.match(reveal.diagnostic.text, /Quercus/);
  assert.match(reveal.diagnostic.text, /Acer/);
  assert.deepEqual(reveal.missing_edge, { a: 'ACPL', b: 'QUGA', channel: 'leaf' });
});

test('a right answer carries the facts and the attribution and no diagnostic', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_files: [], rng: makeRng(24) });
  const reveal = buildReveal({ question: q, chosen_key: 'QUGA', content });
  assert.equal(reveal.correct, true);
  assert.equal(reveal.chosen, null);
  assert.equal(reveal.diagnostic, null);
  assert.equal(reveal.answer.facts.range_text, 'Colorado Plateau and southern Rockies');
  assert.deepEqual(reveal.answer.facts.elevation_ft, [5000, 9000]);
  assert.deepEqual(reveal.answer.facts.height_ft, [15, 30]);
  assert.equal(reveal.answer.photo.author, 'USDA NRCS');
});

test('a concept miss uses the descriptions and records no missing edge', () => {
  const card = content.cards['concept:bark:plated'];
  const q = buildQuestion({
    card, content, state: { tier: 'mc8' }, excluded_files: [], rng: makeRng(25)
  });
  const reveal = buildReveal({ question: q, chosen_key: 'furrowed', content });
  assert.equal(reveal.diagnostic.kind, 'fallback');
  assert.match(reveal.diagnostic.text, /Plated \/ blocky/);
  assert.match(reveal.diagnostic.text, /Furrowed \/ ridged/);
  assert.equal(reveal.missing_edge, null);
});

test('a null chosen key shows the answer alone', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({
    card, content, state: { tier: 'typed' }, excluded_files: [], rng: makeRng(26)
  });
  const reveal = buildReveal({ question: q, chosen_key: null, content });
  assert.equal(reveal.correct, false);
  assert.equal(reveal.chosen, null);
  assert.equal(reveal.diagnostic, null);
  assert.equal(reveal.missing_edge, null);
  assert.equal(reveal.answer.label, 'Gambel oak');
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `node --test tests/question.test.js`
Expected: FAIL with `buildReveal is not a function`.

- [ ] **Step 11: Add the reveal to `app/logic/question.js`**

```js
function speciesSymbolFor(content, kind, key) {
  if (kind === 'species') return key;
  if (kind === 'variety') return varietyOf(content, key).symbol;
  return null;
}

function factsFor(content, kind, channel, key) {
  const symbol = speciesSymbolFor(content, kind, key);
  if (symbol) {
    const record = content.species[symbol];
    return {
      range_text: record.range?.text ?? '',
      states: record.range?.states ?? [],
      planted_states: record.planted_states ?? [],
      elevation_ft: record.elevation_ft ?? null,
      height_ft: record.height_ft ?? null,
      habitat: record.habitat ?? '',
      native_status: record.native_status ?? '',
      description: ''
    };
  }
  if (kind === 'concept') {
    return { description: conceptRecord(content, channel, key)?.description ?? '' };
  }
  return { description: '' };
}

function findEdge(content, a, b, channel) {
  return content.confusion.find(
    (e) => e.channel === channel
      && ((e.a === a && e.b === b) || (e.a === b && e.b === a))
  ) ?? null;
}

function fallbackText(content, kind, channel, answerKey, chosenKey) {
  const answerSymbol = speciesSymbolFor(content, kind, answerKey);
  const chosenSymbol = speciesSymbolFor(content, kind, chosenKey);
  if (answerSymbol && chosenSymbol) {
    const describe = (symbol) => {
      const record = content.species[symbol];
      const bucket = conceptRecord(content, channel, record.concepts?.[channel]);
      return `${record.common[0]} is ${bucket?.name ?? 'uncategorised'}, genus ${record.genus}.`;
    };
    return `${describe(answerSymbol)} ${describe(chosenSymbol)}`;
  }
  const describeKey = (key) => {
    const { label } = labelFor(content, kind, channel, key);
    const concept = kind === 'concept' ? conceptRecord(content, channel, key) : null;
    return concept ? `${label}: ${concept.description}` : label;
  };
  return `${describeKey(answerKey)} You picked ${describeKey(chosenKey)}`;
}

export function buildReveal({ question, chosen_key, content }) {
  const { kind, channel, answer_key: answerKey } = question;
  const correct = chosen_key === answerKey;

  const answerCard = content.cards[cardId(kind, channel, answerKey)];
  const answerPhoto = question.format === 'inv'
    ? question.options.find((o) => o.key === answerKey)?.photo ?? null
    : question.photo;

  const answer = {
    key: answerKey,
    ...labelFor(content, kind, channel, answerKey),
    photo: answerPhoto ?? answerCard?.photos[0] ?? null,
    facts: factsFor(content, kind, channel, answerKey)
  };

  if (correct || chosen_key === null) {
    return {
      correct, card_id: question.card_id, channel, answer,
      chosen: null, diagnostic: null, missing_edge: null
    };
  }

  const chosenCard = content.cards[cardId(kind, channel, chosen_key)];
  const chosenPhoto = question.format === 'inv'
    ? question.options.find((o) => o.key === chosen_key)?.photo ?? null
    : chosenCard?.photos[0] ?? null;
  const chosen = {
    key: chosen_key,
    ...labelFor(content, kind, channel, chosen_key),
    photo: chosenPhoto
  };

  const answerSymbol = speciesSymbolFor(content, kind, answerKey);
  const chosenSymbol = speciesSymbolFor(content, kind, chosen_key);
  const edge = answerSymbol && chosenSymbol
    ? findEdge(content, answerSymbol, chosenSymbol, channel)
    : null;

  if (edge) {
    const text = edge.a === answerSymbol ? edge.a_not_b : edge.b_not_a;
    return {
      correct: false, card_id: question.card_id, channel, answer, chosen,
      diagnostic: { kind: 'edge', text, ref: edge.ref }, missing_edge: null
    };
  }

  const missing = answerSymbol && chosenSymbol
    ? { a: [answerSymbol, chosenSymbol].sort()[0], b: [answerSymbol, chosenSymbol].sort()[1], channel }
    : null;

  return {
    correct: false, card_id: question.card_id, channel, answer, chosen,
    diagnostic: { kind: 'fallback', text: fallbackText(content, kind, channel, answerKey, chosen_key), ref: null },
    missing_edge: missing
  };
}
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `node --test tests/question.test.js`
Expected: PASS, 21 tests.

- [ ] **Step 13: Commit**

```bash
git add -A && git commit -m "feat: add question building, distractors, and the reveal" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `app/logic/progress.js`

**Files:**
- Create: `app/logic/progress.js`
- Test: `tests/progress.test.js`

**Interfaces:**
- Consumes: `content` from `app/logic/content.js`; card states from `app/logic/scheduler.js`.
- Produces:
  - `LEVEL_NAMES` is `['novice', 'beginner', 'intermediate', 'advanced', 'expert']`.
  - `cardLevel(state)` returns 0 to 4.
  - `speciesLevel(symbol, content, states)` returns 0 to 4.
  - `unitNumber(unitKey, content, states)` returns `{ percent, expert_count, card_count, label }`.
  - `gateStatus(unitKey, content, states)` returns `{ open, parent_key, parent_card_count, at_level_2, fraction, needed_cards }`.
  - `progressGrid(content, states)` returns `{ channels, units }` for the progress screen.
  - `states` is a plain object mapping a card ID to a card state.

**Level table.** 0 no state. 1 tier `mc4`. 2 tier `mc8`. 3 tier `inv`, or tier `typed` with `tier_passes` 0. 4 tier `typed` with `tier_passes` 1 or more.

- [ ] **Step 1: Write the failing test**

`tests/progress.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { loadContent } from '../app/logic/content.js';
import {
  LEVEL_NAMES, cardLevel, speciesLevel, unitNumber, gateStatus, progressGrid
} from '../app/logic/progress.js';

const { content } = loadContent(loadFixture());

test('the card level comes from the tier table', () => {
  assert.equal(cardLevel(undefined), 0);
  assert.equal(cardLevel({ tier: 'mc4', tier_passes: 1 }), 1);
  assert.equal(cardLevel({ tier: 'mc8', tier_passes: 0 }), 2);
  assert.equal(cardLevel({ tier: 'inv', tier_passes: 1 }), 3);
  assert.equal(cardLevel({ tier: 'typed', tier_passes: 0 }), 3);
  assert.equal(cardLevel({ tier: 'typed', tier_passes: 1 }), 4);
  assert.equal(LEVEL_NAMES[4], 'expert');
});

test('the species level is the lowest of its cards', () => {
  const states = {
    'species:QUGA:leaf': { tier: 'typed', tier_passes: 2 },
    'species:QUGA:bark': { tier: 'mc8', tier_passes: 0 }
  };
  assert.equal(speciesLevel('QUGA', content, states), 0);
  states['species:QUGA:fruit'] = { tier: 'mc4', tier_passes: 0 };
  assert.equal(speciesLevel('QUGA', content, states), 1);
  assert.equal(speciesLevel('QUVE', content, states), 0);
});

test('the unit number is the mean level over four as a percent', () => {
  const states = {
    'species:ACPL:leaf': { tier: 'typed', tier_passes: 3 },
    'species:ACSA2:leaf': { tier: 'mc8', tier_passes: 0 }
  };
  const number = unitNumber('simple_lobed_maples_co', content, states);
  assert.equal(number.card_count, 2);
  assert.equal(number.percent, 75);
  assert.equal(number.expert_count, 1);
  assert.equal(number.label, '75%, 1 of 2 expert');
});

test('a unit with no parent is always open', () => {
  const status = gateStatus('leaf_types', content, {});
  assert.equal(status.open, true);
  assert.equal(status.parent_key, null);
});

test('the gate opens at 80 percent of the parent cards at level 2 or higher', () => {
  const closed = gateStatus('simple_lobed_genus', content, {});
  assert.equal(closed.open, false);
  assert.equal(closed.parent_key, 'leaf_types');
  assert.equal(closed.parent_card_count, 1);
  assert.equal(closed.at_level_2, 0);
  assert.equal(closed.needed_cards, 1);

  const states = { 'concept:leaf:simple_lobed': { tier: 'mc8', tier_passes: 0 } };
  const open = gateStatus('simple_lobed_genus', content, states);
  assert.equal(open.open, true);
  assert.equal(open.fraction, 1);
  assert.equal(open.needed_cards, 0);
});

test('a level-4 unit gates on its level-3 parent', () => {
  const closed = gateStatus('quga_varieties', content, {});
  assert.equal(closed.parent_key, 'simple_lobed_white_oaks_co');
  assert.equal(closed.parent_card_count, 1);
  assert.equal(closed.open, false);
  const open = gateStatus('quga_varieties', content,
    { 'species:QUGA:leaf': { tier: 'inv', tier_passes: 0 } });
  assert.equal(open.open, true);
});

test('a parent with no cards counts as open', () => {
  const stub = {
    units: [
      { key: 'p', name: 'P', channel: 'leaf', level: 1, parent: null },
      { key: 'c', name: 'C', channel: 'leaf', level: 2, parent: 'p' }
    ],
    unit_cards: { p: [], c: ['group:leaf:Quercus'] }
  };
  const status = gateStatus('c', stub, {});
  assert.equal(status.open, true);
  assert.equal(status.parent_card_count, 0);
  assert.equal(status.needed_cards, 0);
});

test('the grid groups species rows by unit with one cell per channel', () => {
  const states = { 'species:ACPL:leaf': { tier: 'mc8', tier_passes: 0 } };
  const grid = progressGrid(content, states);
  assert.deepEqual(grid.channels, ['leaf', 'bark', 'fruit']);
  const maples = grid.units.find((u) => u.key === 'simple_lobed_maples_co');
  assert.equal(maples.number.card_count, 2);
  const acpl = maples.rows.find((r) => r.symbol === 'ACPL');
  assert.equal(acpl.common, 'Norway maple');
  assert.deepEqual(acpl.cells, [
    { channel: 'leaf', level: 2, has_card: true },
    { channel: 'bark', level: 0, has_card: false },
    { channel: 'fruit', level: 0, has_card: true }
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/progress.test.js`
Expected: FAIL with `Cannot find module ... app/logic/progress.js`.

- [ ] **Step 3: Write `app/logic/progress.js`**

```js
// Card levels, species levels, unit numbers, and the unit gate.
import { cardId } from './content.js';

export const LEVEL_NAMES = ['novice', 'beginner', 'intermediate', 'advanced', 'expert'];
export const GATE_THRESHOLD = 0.8;

export function cardLevel(state) {
  if (!state || !state.tier) return 0;
  if (state.tier === 'mc4') return 1;
  if (state.tier === 'mc8') return 2;
  if (state.tier === 'inv') return 3;
  return (state.tier_passes ?? 0) >= 1 ? 4 : 3;
}

export function speciesCardIds(symbol, content) {
  return content.channels
    .map((channel) => cardId('species', channel, symbol))
    .filter((id) => content.cards[id]);
}

export function speciesLevel(symbol, content, states) {
  const ids = speciesCardIds(symbol, content);
  if (ids.length === 0) return 0;
  return Math.min(...ids.map((id) => cardLevel(states[id])));
}

export function unitNumber(unitKey, content, states) {
  const ids = content.unit_cards[unitKey] ?? [];
  const levels = ids.map((id) => cardLevel(states[id]));
  const expertCount = levels.filter((l) => l === 4).length;
  const mean = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  const percent = Math.round((mean / 4) * 100);
  return {
    percent,
    expert_count: expertCount,
    card_count: ids.length,
    label: `${percent}%, ${expertCount} of ${ids.length} expert`
  };
}

export function gateStatus(unitKey, content, states) {
  const unit = content.units.find((u) => u.key === unitKey);
  const parentKey = unit?.parent ?? null;
  if (!parentKey) {
    return { open: true, parent_key: null, parent_card_count: 0, at_level_2: 0, fraction: 1, needed_cards: 0 };
  }
  const parentIds = content.unit_cards[parentKey] ?? [];
  if (parentIds.length === 0) {
    return { open: true, parent_key: parentKey, parent_card_count: 0, at_level_2: 0, fraction: 1, needed_cards: 0 };
  }
  const atLevel2 = parentIds.filter((id) => cardLevel(states[id]) >= 2).length;
  const fraction = atLevel2 / parentIds.length;
  const required = Math.ceil(GATE_THRESHOLD * parentIds.length);
  return {
    open: fraction >= GATE_THRESHOLD,
    parent_key: parentKey,
    parent_card_count: parentIds.length,
    at_level_2: atLevel2,
    fraction,
    needed_cards: Math.max(0, required - atLevel2)
  };
}

export function progressGrid(content, states) {
  const units = content.units.map((unit) => {
    const members = content.unit_members[unit.key] ?? [];
    const rows = members.map((symbol) => ({
      symbol,
      common: content.species[symbol].common[0],
      scientific: content.species[symbol].scientific,
      level: speciesLevel(symbol, content, states),
      cells: content.channels.map((channel) => {
        const id = cardId('species', channel, symbol);
        return {
          channel,
          level: content.cards[id] ? cardLevel(states[id]) : 0,
          has_card: Boolean(content.cards[id])
        };
      })
    }));
    return {
      key: unit.key,
      name: unit.name,
      channel: unit.channel,
      level: unit.level,
      number: unitNumber(unit.key, content, states),
      gate: gateStatus(unit.key, content, states),
      rows
    };
  });
  return { channels: content.channels, units };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/progress.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add card levels, unit numbers, and the unit gate" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `app/logic/session.js`

**Files:**
- Create: `app/logic/session.js`
- Test: `tests/session.test.js`

**Interfaces:**
- Consumes: `isDue` and `addDays` from `app/logic/scheduler.js`; `shuffle` from `app/logic/question.js`; `gateStatus` from `app/logic/progress.js`; `content` from `app/logic/content.js`.
- Produces:
  - `dueCardIds({ content, states, focus, today })` returns card IDs, most overdue first.
  - `newCardCountToday(log, today)` returns an integer.
  - `recommendUnit({ content, states, focus })` returns `{ unit_key, next_closed }`.
  - `buildSession({ content, states, log, settings, today, focus, chosen_unit, rng })` returns `{ card_ids, unit_key, due_card_ids, new_card_ids, capped }`.
  - `requeueCard(cardIds, index, cardId)` returns a new array.
  - `buildPlacementDeck(content)` returns card IDs.
  - `placementState(correct, today)` returns a card state or null.
  - `focus` is `'all'` or a channel key. `settings` is `{ session_size, new_per_day }`.

- [ ] **Step 1: Write the failing test for due collection and the fill**

`tests/session.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { makeRng } from './helpers/rng.js';
import { loadContent } from '../app/logic/content.js';
import {
  dueCardIds, newCardCountToday, recommendUnit, buildSession,
  requeueCard, buildPlacementDeck, placementState
} from '../app/logic/session.js';

const { content } = loadContent(loadFixture());
const SETTINGS = { session_size: 20, new_per_day: 10 };
const TODAY = '2026-03-10';

function reviewed(due) {
  return { interval: 5, ease: 2.5, due, reps: 2, lapses: 0, recent: ['good'], tier: 'mc4', tier_passes: 1 };
}

test('due cards come back most overdue first and only in the focus', () => {
  const states = {
    'species:QUGA:leaf': reviewed('2026-03-10'),
    'species:QURU:leaf': reviewed('2026-03-01'),
    'species:QUGA:bark': reviewed('2026-03-05'),
    'species:ACSA2:leaf': reviewed('2026-03-20')
  };
  assert.deepEqual(dueCardIds({ content, states, focus: 'all', today: TODAY }),
    ['species:QURU:leaf', 'species:QUGA:bark', 'species:QUGA:leaf']);
  assert.deepEqual(dueCardIds({ content, states, focus: 'leaf', today: TODAY }),
    ['species:QURU:leaf', 'species:QUGA:leaf']);
});

test('the deck fills from level-0 cards in the target unit', () => {
  const states = {};
  const result = buildSession({
    content, states, log: [], settings: SETTINGS, today: TODAY,
    focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(31)
  });
  assert.equal(result.unit_key, 'simple_lobed_maples_co');
  assert.deepEqual(result.new_card_ids.sort(), ['species:ACPL:leaf', 'species:ACSA2:leaf']);
  assert.deepEqual(result.card_ids.sort(), ['species:ACPL:leaf', 'species:ACSA2:leaf']);
  assert.equal(result.capped, false);
});

test('the daily cap is counted from the log and stops the fill', () => {
  const log = [
    { card: 'species:QUGA:leaf', at: '2026-03-10T09:00:00Z', grade: 'good', format: 'mc4', options: 4, elapsed_ms: 1000, answer: 'x' },
    { card: 'species:QURU:leaf', at: '2026-03-10T09:01:00Z', grade: 'good', format: 'mc4', options: 4, elapsed_ms: 1000, answer: 'x' },
    { card: 'species:QURU:leaf', at: '2026-03-10T09:02:00Z', grade: 'good', format: 'mc4', options: 4, elapsed_ms: 1000, answer: 'x' },
    { card: 'species:PLOC:leaf', at: '2026-03-09T09:00:00Z', grade: 'good', format: 'mc4', options: 4, elapsed_ms: 1000, answer: 'x' }
  ];
  assert.equal(newCardCountToday(log, '2026-03-10'), 2);
  const result = buildSession({
    content, states: {}, log, settings: { session_size: 20, new_per_day: 2 },
    today: '2026-03-10', focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(32)
  });
  assert.deepEqual(result.card_ids, []);
  assert.equal(result.capped, true);
});

test('the session never exceeds session_size', () => {
  const result = buildSession({
    content, states: {}, log: [], settings: { session_size: 1, new_per_day: 10 },
    today: TODAY, focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(33)
  });
  assert.equal(result.card_ids.length, 1);
});

test('an empty queue with the cap reached returns no cards', () => {
  const result = buildSession({
    content, states: {}, log: [], settings: { session_size: 20, new_per_day: 0 },
    today: TODAY, focus: 'bark', chosen_unit: null, rng: makeRng(34)
  });
  assert.deepEqual(result.card_ids, []);
  assert.equal(result.capped, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/session.test.js`
Expected: FAIL with `Cannot find module ... app/logic/session.js`.

- [ ] **Step 3: Write `app/logic/session.js`**

```js
// Builds a session deck from due and level-0 cards. Pure.
import { isDue, addDays } from './scheduler.js';
import { shuffle } from './question.js';
import { gateStatus } from './progress.js';

function inFocus(card, focus) {
  return focus === 'all' || card.channel === focus;
}

export function dueCardIds({ content, states, focus, today }) {
  return Object.values(content.cards)
    .filter((card) => inFocus(card, focus))
    .filter((card) => isDue(states[card.id], today))
    .sort((a, b) => {
      const byDue = states[a.id].due.localeCompare(states[b.id].due);
      return byDue !== 0 ? byDue : a.id.localeCompare(b.id);
    })
    .map((card) => card.id);
}

export function newCardCountToday(log, today) {
  const firstSeen = new Map();
  for (const row of log) {
    const day = row.at.slice(0, 10);
    if (!firstSeen.has(row.card)) firstSeen.set(row.card, day);
  }
  let count = 0;
  for (const day of firstSeen.values()) if (day === today) count += 1;
  return count;
}

export function recommendUnit({ content, states, focus }) {
  let nextClosed = null;
  for (const unit of content.units) {
    if (focus !== 'all' && unit.channel !== focus) continue;
    const ids = content.unit_cards[unit.key] ?? [];
    const hasNew = ids.some((id) => !states[id]);
    if (!hasNew) continue;
    const gate = gateStatus(unit.key, content, states);
    if (gate.open) return { unit_key: unit.key, next_closed: null };
    if (!nextClosed) {
      nextClosed = {
        unit_key: unit.key,
        unit_name: unit.name,
        parent_key: gate.parent_key,
        fraction: gate.fraction,
        needed_cards: gate.needed_cards
      };
    }
  }
  return { unit_key: null, next_closed: nextClosed };
}

export function buildSession({
  content, states, log, settings, today, focus, chosen_unit = null, rng = Math.random
}) {
  const due = dueCardIds({ content, states, focus, today });
  const picked = due.slice(0, settings.session_size);

  let unitKey = chosen_unit;
  if (!unitKey) unitKey = recommendUnit({ content, states, focus }).unit_key;

  const allowance = Math.max(0, settings.new_per_day - newCardCountToday(log, today));
  const newIds = [];
  if (unitKey) {
    for (const id of content.unit_cards[unitKey] ?? []) {
      if (picked.length + newIds.length >= settings.session_size) break;
      if (newIds.length >= allowance) break;
      if (states[id]) continue;
      if (!inFocus(content.cards[id], focus)) continue;
      newIds.push(id);
    }
  }

  const remainingRoom = settings.session_size - picked.length;
  const capped = allowance === 0 || (newIds.length < remainingRoom && allowance <= newIds.length);

  return {
    card_ids: shuffle([...picked, ...newIds], rng),
    unit_key: unitKey,
    due_card_ids: picked,
    new_card_ids: newIds,
    capped
  };
}

export function requeueCard(cardIds, index, cardId) {
  const rest = cardIds.filter((_, i) => i !== index);
  return [...rest, cardId];
}

export function buildPlacementDeck(content) {
  return Object.values(content.cards)
    .filter((card) => card.kind === 'concept')
    .sort((a, b) => {
      const byChannel = content.channels.indexOf(a.channel) - content.channels.indexOf(b.channel);
      return byChannel !== 0 ? byChannel : a.key.localeCompare(b.key);
    })
    .map((card) => card.id);
}

export function placementState(correct, today) {
  if (!correct) return null;
  return {
    interval: 21,
    ease: 2.5,
    due: addDays(today, 21),
    reps: 1,
    lapses: 0,
    recent: [],
    tier: 'mc8',
    tier_passes: 0
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/session.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing test for the gate, relearning, and placement**

Append to `tests/session.test.js`:

```js
test('the recommendation skips a unit whose parent is under 80 percent at level 2', () => {
  const result = recommendUnit({ content, states: {}, focus: 'leaf' });
  assert.equal(result.unit_key, 'leaf_types');
  const learned = { 'concept:leaf:simple_lobed': { tier: 'mc8', tier_passes: 0 } };
  assert.equal(recommendUnit({ content, states: learned, focus: 'leaf' }).unit_key,
    'simple_lobed_genus');
});

test('the recommendation is empty when every open unit is exhausted, and names the next one', () => {
  const learned = { 'concept:leaf:simple_lobed': { tier: 'mc4', tier_passes: 0 } };
  const result = recommendUnit({ content, states: learned, focus: 'leaf' });
  assert.equal(result.unit_key, null);
  assert.equal(result.next_closed.unit_key, 'simple_lobed_genus');
  assert.equal(result.next_closed.parent_key, 'leaf_types');
  assert.equal(result.next_closed.needed_cards, 1);
});

test('a chosen unit bypasses the gate', () => {
  const result = buildSession({
    content, states: {}, log: [], settings: SETTINGS, today: TODAY,
    focus: 'leaf', chosen_unit: 'simple_lobed_other_co', rng: makeRng(41)
  });
  assert.deepEqual(result.card_ids, ['species:PLOC:leaf']);
});

test('a chosen unit overrides the recommended unit', () => {
  const result = buildSession({
    content, states: {}, log: [], settings: SETTINGS, today: TODAY,
    focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(42)
  });
  assert.equal(result.unit_key, 'simple_lobed_maples_co');
  assert.ok(!result.card_ids.includes('concept:leaf:simple_lobed'));
});

test('an again card re-queues once at the back', () => {
  const deck = ['a', 'b', 'c'];
  assert.deepEqual(requeueCard(deck, 0, 'a'), ['b', 'c', 'a']);
  assert.deepEqual(requeueCard(deck, 2, 'c'), ['a', 'b', 'c']);
});

test('the placement deck holds one card per level-1 concept in channel order', () => {
  const deck = buildPlacementDeck(content);
  assert.deepEqual(deck, [
    'concept:leaf:simple_lobed',
    'concept:bark:furrowed',
    'concept:bark:papery',
    'concept:bark:plated',
    'concept:fruit:acorn',
    'concept:fruit:samara'
  ]);
});

test('a right placement answer writes the 21 day state and a wrong one writes nothing', () => {
  const state = placementState(true, '2026-03-10');
  assert.equal(state.tier, 'mc8');
  assert.equal(state.tier_passes, 0);
  assert.equal(state.interval, 21);
  assert.equal(state.ease, 2.5);
  assert.equal(state.reps, 1);
  assert.equal(state.due, '2026-03-31');
  assert.equal(placementState(false, '2026-03-10'), null);
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test tests/session.test.js`
Expected: PASS, 12 tests. If the recommendation tests fail, check that `recommendUnit` walks `content.units` in file order.

- [ ] **Step 7: Note the relearning contract in the module**

Relearning belongs to the session screen: the screen calls `requeueCard`, and on the repeat it writes no log row and calls no scheduler function. Add this comment above `requeueCard` in `app/logic/session.js`:

```js
// Re-queues a card graded again, once, at the back of the deck.
// The caller must not log the repeat and must not re-run the scheduler on it.
// The placement screen never calls this.
```

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS. All test files green.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: add the session builder, the unit gate, and the placement deck" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `app/logic/store.js`

**Files:**
- Create: `app/logic/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `STORE_VERSION` is `1`.
  - `KEYS` is `{ cards: 'dendro_cards', log: 'dendro_log', settings: 'dendro_settings', missing_edges: 'dendro_missing_edges' }`.
  - `LOG_CAP` is `20000`.
  - `defaultSettings()` returns `{ version: 1, session_size: 20, new_per_day: 10, last_export: null }`.
  - `memoryStorage()` returns an in-memory object with `getItem`, `setItem`, `removeItem`.
  - `createStore(storage)` returns a store object.
  - Store methods: `available`, `readCards()`, `writeCard(cardId, state)`, `readLog()`, `replaceLog(rows)`, `appendLog(row)`, `readSettings()`, `writeSettings(patch)`, `readMissingEdges()`, `recordMissingEdge(edge)`, `exportBlob(today)`, `importBlob(text)`, `reset()`, `shouldPromptExport(today)`, `markExported(today)`.
  - `exportBlob(today)` returns `{ filename, json }`.
  - `importBlob(text)` returns `{ ok, errors }`.

**Stored shapes.** Each key holds one object with a `version` field.

```json
{ "version": 1, "cards": { "species:QUGA:bark": { } } }
{ "version": 1, "rows": [] }
{ "version": 1, "session_size": 20, "new_per_day": 10, "last_export": null }
{ "version": 1, "edges": [{ "a": "ACPL", "b": "QUGA", "channel": "leaf", "count": 2 }] }
```

**Migration 0 to 1.** A version 0 card record has no `tier` and no `tier_passes`. The migration adds `tier: 'mc4'` and `tier_passes: 0`.

- [ ] **Step 1: Write the failing test**

`tests/store.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_VERSION, KEYS, LOG_CAP, defaultSettings, memoryStorage, createStore
} from '../app/logic/store.js';

function row(card, at) {
  return { card, at, grade: 'good', format: 'mc4', options: 4, elapsed_ms: 1200, answer: 'x' };
}

test('a fresh store reports defaults and is available', () => {
  const store = createStore(memoryStorage());
  assert.equal(store.available, true);
  assert.deepEqual(store.readCards(), {});
  assert.deepEqual(store.readLog(), []);
  assert.deepEqual(store.readSettings(), defaultSettings());
  assert.deepEqual(store.readMissingEdges(), []);
  assert.equal(STORE_VERSION, 1);
  assert.equal(KEYS.cards, 'dendro_cards');
});

test('each event writes right away', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.writeCard('species:QUGA:bark', { interval: 4, tier: 'mc4', tier_passes: 1 });
  store.appendLog(row('species:QUGA:bark', '2026-03-10T09:00:00Z'));
  assert.equal(JSON.parse(storage.getItem('dendro_cards')).cards['species:QUGA:bark'].interval, 4);
  assert.equal(JSON.parse(storage.getItem('dendro_log')).rows.length, 1);
});

test('the log cap drops the oldest row', () => {
  const store = createStore(memoryStorage());
  const rows = [];
  for (let i = 0; i < LOG_CAP; i += 1) rows.push(row(`c${i}`, '2026-03-10T09:00:00Z'));
  store.replaceLog(rows);
  store.appendLog(row('newest', '2026-03-11T09:00:00Z'));
  const log = store.readLog();
  assert.equal(log.length, LOG_CAP);
  assert.equal(log[0].card, 'c1');
  assert.equal(log[LOG_CAP - 1].card, 'newest');
});

test('unknown card IDs are preserved', () => {
  const storage = memoryStorage();
  storage.setItem('dendro_cards', JSON.stringify({
    version: 1, cards: { 'species:GONE:leaf': { interval: 9, tier: 'mc8', tier_passes: 0 } }
  }));
  const store = createStore(storage);
  store.writeCard('species:QUGA:leaf', { interval: 1, tier: 'mc4', tier_passes: 1 });
  assert.ok(store.readCards()['species:GONE:leaf']);
});

test('a missing edge is recorded once and counted', () => {
  const store = createStore(memoryStorage());
  store.recordMissingEdge({ a: 'ACPL', b: 'QUGA', channel: 'leaf' });
  store.recordMissingEdge({ a: 'ACPL', b: 'QUGA', channel: 'leaf' });
  store.recordMissingEdge({ a: 'ACPL', b: 'QUGA', channel: 'bark' });
  const edges = store.readMissingEdges();
  assert.equal(edges.length, 2);
  assert.equal(edges.find((e) => e.channel === 'leaf').count, 2);
});

test('export and import make a round trip', () => {
  const first = createStore(memoryStorage());
  first.writeCard('species:QUGA:leaf', { interval: 4, ease: 2.5, due: '2026-03-14', reps: 2, lapses: 0, recent: ['good'], tier: 'mc4', tier_passes: 2 });
  first.appendLog(row('species:QUGA:leaf', '2026-03-10T09:00:00Z'));
  first.writeSettings({ session_size: 15 });
  const blob = first.exportBlob('2026-03-10');
  assert.equal(blob.filename, 'dendro-progress-2026-03-10.json');

  const second = createStore(memoryStorage());
  const result = second.importBlob(blob.json);
  assert.deepEqual(result, { ok: true, errors: [] });
  assert.equal(second.readCards()['species:QUGA:leaf'].interval, 4);
  assert.equal(second.readLog().length, 1);
  assert.equal(second.readSettings().session_size, 15);
});

test('a malformed import is rejected with a reason and changes nothing', () => {
  const store = createStore(memoryStorage());
  store.writeCard('species:QUGA:leaf', { interval: 4, tier: 'mc4', tier_passes: 0 });

  const notJson = store.importBlob('{oops');
  assert.equal(notJson.ok, false);
  assert.match(notJson.errors[0], /not valid JSON/);

  const wrongVersion = store.importBlob(JSON.stringify({
    version: 99, dendro_cards: { version: 99, cards: {} }, dendro_log: { version: 99, rows: [] },
    dendro_settings: defaultSettings(), dendro_missing_edges: { version: 1, edges: [] }
  }));
  assert.equal(wrongVersion.ok, false);
  assert.match(wrongVersion.errors[0], /version 99/);

  const missingKey = store.importBlob(JSON.stringify({ version: 1, dendro_cards: { version: 1, cards: {} } }));
  assert.equal(missingKey.ok, false);
  assert.match(missingKey.errors.join(' '), /dendro_log/);

  assert.equal(store.readCards()['species:QUGA:leaf'].interval, 4);
});

test('reset clears every key', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.writeCard('species:QUGA:leaf', { interval: 4, tier: 'mc4', tier_passes: 0 });
  store.appendLog(row('species:QUGA:leaf', '2026-03-10T09:00:00Z'));
  store.reset();
  assert.deepEqual(store.readCards(), {});
  assert.deepEqual(store.readLog(), []);
  assert.equal(storage.getItem('dendro_cards'), null);
});

test('a version 0 card payload migrates in place', () => {
  const storage = memoryStorage();
  storage.setItem('dendro_cards', JSON.stringify({
    version: 0, cards: { 'species:QUGA:leaf': { interval: 10, ease: 2.5, due: '2026-03-20', reps: 3, lapses: 0, recent: [] } }
  }));
  const store = createStore(storage);
  const card = store.readCards()['species:QUGA:leaf'];
  assert.equal(card.tier, 'mc4');
  assert.equal(card.tier_passes, 0);
  assert.equal(JSON.parse(storage.getItem('dendro_cards')).version, 1);
});

test('the export prompt fires once a month', () => {
  const store = createStore(memoryStorage());
  assert.equal(store.shouldPromptExport('2026-03-10'), true);
  store.markExported('2026-03-10');
  assert.equal(store.shouldPromptExport('2026-03-20'), false);
  assert.equal(store.shouldPromptExport('2026-04-12'), true);
});

test('an unavailable storage leaves the store running and not available', () => {
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); }
  };
  const store = createStore(broken);
  assert.equal(store.available, false);
  assert.deepEqual(store.readCards(), {});
  store.writeCard('species:QUGA:leaf', { interval: 1, tier: 'mc4', tier_passes: 0 });
  assert.deepEqual(store.readCards(), {});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/store.test.js`
Expected: FAIL with `Cannot find module ... app/logic/store.js`.

- [ ] **Step 3: Write `app/logic/store.js`**

```js
// Owns the four localStorage keys. Pure apart from the injected storage object.

export const STORE_VERSION = 1;
export const LOG_CAP = 20000;
export const EXPORT_PROMPT_DAYS = 30;

export const KEYS = {
  cards: 'dendro_cards',
  log: 'dendro_log',
  settings: 'dendro_settings',
  missing_edges: 'dendro_missing_edges'
};

export function defaultSettings() {
  return { version: STORE_VERSION, session_size: 20, new_per_day: 10, last_export: null };
}

function emptyPayload(key) {
  if (key === KEYS.cards) return { version: STORE_VERSION, cards: {} };
  if (key === KEYS.log) return { version: STORE_VERSION, rows: [] };
  if (key === KEYS.settings) return defaultSettings();
  return { version: STORE_VERSION, edges: [] };
}

export const MIGRATIONS = {
  0: (key, payload) => {
    if (key !== KEYS.cards) return { ...payload, version: 1 };
    const cards = {};
    for (const [id, state] of Object.entries(payload.cards ?? {})) {
      cards[id] = { tier: 'mc4', tier_passes: 0, ...state };
    }
    return { version: 1, cards };
  }
};

export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); }
  };
}

function daysBetween(fromDate, toDate) {
  const parse = (d) => Date.UTC(...d.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((parse(toDate) - parse(fromDate)) / 86400000);
}

export function createStore(storage) {
  let available = true;
  try {
    storage.setItem('dendro_probe', '1');
    storage.removeItem('dendro_probe');
  } catch {
    available = false;
  }

  function read(key) {
    if (!available) return emptyPayload(key);
    let text = null;
    try {
      text = storage.getItem(key);
    } catch {
      return emptyPayload(key);
    }
    if (!text) return emptyPayload(key);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return emptyPayload(key);
    }
    let version = payload.version ?? 0;
    while (version < STORE_VERSION && MIGRATIONS[version]) {
      payload = MIGRATIONS[version](key, payload);
      version = payload.version;
      write(key, payload);
    }
    return payload;
  }

  function write(key, payload) {
    if (!available) return;
    try {
      storage.setItem(key, JSON.stringify({ ...payload, version: STORE_VERSION }));
    } catch {
      available = false;
    }
  }

  const api = {
    get available() { return available; },

    readCards() { return read(KEYS.cards).cards ?? {}; },

    writeCard(cardId, state) {
      const payload = read(KEYS.cards);
      payload.cards = { ...(payload.cards ?? {}), [cardId]: state };
      write(KEYS.cards, payload);
    },

    readLog() { return read(KEYS.log).rows ?? []; },

    replaceLog(rows) { write(KEYS.log, { version: STORE_VERSION, rows: rows.slice(-LOG_CAP) }); },

    appendLog(entry) {
      const rows = api.readLog();
      rows.push(entry);
      api.replaceLog(rows);
    },

    readSettings() { return { ...defaultSettings(), ...read(KEYS.settings) }; },

    writeSettings(patch) { write(KEYS.settings, { ...api.readSettings(), ...patch }); },

    readMissingEdges() { return read(KEYS.missing_edges).edges ?? []; },

    recordMissingEdge(edge) {
      const edges = api.readMissingEdges();
      const found = edges.find((e) => e.a === edge.a && e.b === edge.b && e.channel === edge.channel);
      if (found) found.count += 1;
      else edges.push({ a: edge.a, b: edge.b, channel: edge.channel, count: 1 });
      write(KEYS.missing_edges, { version: STORE_VERSION, edges });
    },

    exportBlob(today) {
      const payload = {
        version: STORE_VERSION,
        exported_at: today,
        [KEYS.cards]: read(KEYS.cards),
        [KEYS.log]: read(KEYS.log),
        [KEYS.settings]: api.readSettings(),
        [KEYS.missing_edges]: read(KEYS.missing_edges)
      };
      return { filename: `dendro-progress-${today}.json`, json: JSON.stringify(payload, null, 2) };
    },

    importBlob(text) {
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        return { ok: false, errors: ['The file is not valid JSON.'] };
      }
      const errors = [];
      if (payload.version !== STORE_VERSION) {
        errors.push(`The file says version ${payload.version}. This app reads version ${STORE_VERSION}.`);
      }
      for (const key of Object.values(KEYS)) {
        if (!payload[key] || typeof payload[key] !== 'object') errors.push(`The file has no ${key} section.`);
      }
      if (!errors.length && typeof payload[KEYS.cards].cards !== 'object') {
        errors.push('The dendro_cards section has no cards object.');
      }
      if (!errors.length && !Array.isArray(payload[KEYS.log].rows)) {
        errors.push('The dendro_log section has no rows array.');
      }
      if (errors.length) return { ok: false, errors };
      for (const key of Object.values(KEYS)) write(key, payload[key]);
      return { ok: true, errors: [] };
    },

    reset() {
      if (!available) return;
      for (const key of Object.values(KEYS)) {
        try {
          storage.removeItem(key);
        } catch {
          available = false;
        }
      }
    },

    shouldPromptExport(today) {
      const last = api.readSettings().last_export;
      if (!last) return true;
      return daysBetween(last, today) >= EXPORT_PROMPT_DAYS;
    },

    markExported(today) { api.writeSettings({ last_export: today }); }
  };

  return api;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/store.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. Eight test files green.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add the localStorage store with export, import, and migration" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `app/main.js`, `app/style.css`, and the home screen

**Files:**
- Create: `app/main.js`, `app/style.css`, `app/screens/home.js`
- Create: `app/screens/session.js`, `app/screens/progress.js`, `app/screens/species.js`, `app/screens/settings.js` as one-line stubs, so the imports in `main.js` resolve. Tasks 10 to 12 fill them in.

**Interfaces:**
- Consumes: `loadContent` from `content.js`; `createStore` from `store.js`; `dueCardIds`, `newCardCountToday`, `recommendUnit` from `session.js`; `gateStatus` from `progress.js`.
- Produces:
  - Every screen module exports `render(root, ctx)`.
  - `ctx` is `{ content, store, image_base, today, params, mode, symbol, navigate }`. `params` is a `URLSearchParams`. `navigate(hash)` sets `window.location.hash`.
  - Routes: `#/` home, `#/session?focus=&unit=` session, `#/placement` placement, `#/progress` progress, `#/species/<symbol>` species, `#/settings` settings.
  - `todayString()` returns the local calendar date as `YYYY-MM-DD`.

Screens are hand-tested. Each screen task ends with a manual checklist.

- [ ] **Step 1: Create the four screen stubs**

Each file holds one line, so `main.js` imports resolve. Replace them in Tasks 10 to 12.

`app/screens/session.js`, `app/screens/progress.js`, `app/screens/species.js`, `app/screens/settings.js`:

```js
export function render(root) { root.textContent = 'Not built yet.'; }
```

- [ ] **Step 2: Create `app/main.js`**

```js
// Boots the app, routes between screens, holds no state.
import { loadContent } from './logic/content.js';
import { createStore } from './logic/store.js';
import * as home from './screens/home.js';
import * as session from './screens/session.js';
import * as progress from './screens/progress.js';
import * as species from './screens/species.js';
import * as settings from './screens/settings.js';

const CONTENT_FILES = {
  species: 'species.json',
  concepts: 'concepts.json',
  confusion: 'confusion.json',
  units: 'units.json',
  manifest: 'images/manifest.json'
};

const DEAD_STORAGE = {
  getItem() { throw new Error('no storage'); },
  setItem() { throw new Error('no storage'); },
  removeItem() { throw new Error('no storage'); }
};

export function todayString() {
  return new Date().toLocaleDateString('en-CA');
}

function contentDir() {
  const query = new URLSearchParams(window.location.search);
  return query.get('content') === 'dev' ? 'content_dev/' : 'content/';
}

function parseRoute() {
  const raw = window.location.hash.slice(1) || '/';
  const [path, query] = raw.split('?');
  return {
    parts: path.split('/').filter(Boolean),
    params: new URLSearchParams(query ?? '')
  };
}

function showError(title, lines) {
  const root = document.getElementById('app');
  root.textContent = '';
  const box = document.createElement('section');
  box.className = 'error';
  const heading = document.createElement('h1');
  heading.textContent = title;
  box.append(heading);
  const list = document.createElement('ul');
  for (const line of lines) {
    const item = document.createElement('li');
    item.textContent = line;
    list.append(item);
  }
  box.append(list);
  root.append(box);
}

async function fetchContent(dir) {
  const raw = {};
  for (const [field, file] of Object.entries(CONTENT_FILES)) {
    const response = await fetch(`${dir}${file}`);
    if (!response.ok) throw new Error(`${dir}${file} returned ${response.status}`);
    raw[field] = await response.json();
  }
  return raw;
}

async function start() {
  const dir = contentDir();
  let raw;
  try {
    raw = await fetchContent(dir);
  } catch (error) {
    showError('Content failed to load', [error.message]);
    return;
  }

  const result = loadContent(raw);
  if (!result.ok) {
    showError('Content failed to validate',
      result.errors.map((e) => `${e.file}: ${e.message}`));
    return;
  }

  let storage = DEAD_STORAGE;
  try {
    storage = window.localStorage ?? DEAD_STORAGE;
  } catch {
    storage = DEAD_STORAGE;
  }
  const store = createStore(storage);

  const banner = document.getElementById('banner');
  if (!store.available) {
    banner.hidden = false;
    banner.textContent =
      'Progress is not saved. This browser blocks local storage. Export from Settings to keep a copy.';
  }
  document.getElementById('nav').hidden = false;

  function route() {
    const { parts, params } = parseRoute();
    const root = document.getElementById('app');
    root.textContent = '';
    const ctx = {
      content: result.content,
      store,
      image_base: dir,
      today: todayString(),
      params,
      navigate: (hash) => { window.location.hash = hash; }
    };
    if (parts[0] === 'session') session.render(root, { ...ctx, mode: 'review' });
    else if (parts[0] === 'placement') session.render(root, { ...ctx, mode: 'placement' });
    else if (parts[0] === 'progress') progress.render(root, ctx);
    else if (parts[0] === 'species') species.render(root, { ...ctx, symbol: parts[1] });
    else if (parts[0] === 'settings') settings.render(root, ctx);
    else home.render(root, ctx);
  }

  window.addEventListener('hashchange', route);
  route();
}

start();
```

- [ ] **Step 3: Create `app/screens/home.js`**

```js
// Home: channel buttons, the recommendation, the unit list, the placement link.
import { dueCardIds, newCardCountToday, recommendUnit } from '../logic/session.js';
import { gateStatus } from '../logic/progress.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function render(root, ctx) {
  const { content, store, today, params } = ctx;
  const focus = params.get('focus') ?? 'all';
  const states = store.readCards();
  const log = store.readLog();
  const userSettings = store.readSettings();

  root.append(el('h1', null, 'Dendro'));

  const row = el('div', 'channel-row');
  const choices = [
    { key: 'all', name: 'All channels' },
    ...content.channels.map((c) => ({ key: c, name: c.replace(/_/gu, ' ') }))
  ];
  for (const choice of choices) {
    const count = dueCardIds({ content, states, focus: choice.key, today }).length;
    const button = el('button', choice.key === focus ? 'channel is-active' : 'channel',
      `${choice.name} (${count} due)`);
    button.addEventListener('click', () => ctx.navigate(`/?focus=${choice.key}`));
    row.append(button);
  }
  root.append(row);

  const recommendation = recommendUnit({ content, states, focus });
  const box = el('section', 'card');
  if (recommendation.unit_key) {
    const unit = content.units.find((u) => u.key === recommendation.unit_key);
    box.append(el('h2', null, `Next up: ${unit.name}`));
    const start = el('button', 'primary', 'Start');
    start.addEventListener('click',
      () => ctx.navigate(`/session?focus=${focus}&unit=${unit.key}`));
    box.append(start);
  } else if (recommendation.next_closed) {
    const next = recommendation.next_closed;
    const parent = content.units.find((u) => u.key === next.parent_key);
    box.append(el('h2', null, 'No unit is open yet'));
    box.append(el('p', null,
      `${next.unit_name} opens when ${next.needed_cards} more card(s) in ${parent.name} reach level 2.`));
  } else {
    box.append(el('h2', null, 'Every unit in this focus is started'));
  }
  root.append(box);

  const dueNow = dueCardIds({ content, states, focus, today }).length;
  if (dueNow === 0 && newCardCountToday(log, today) >= userSettings.new_per_day) {
    root.append(el('p', 'notice',
      `Nothing is due and today's ${userSettings.new_per_day} new cards are done. Come back tomorrow.`));
  }

  const list = el('section', 'unit-list');
  list.append(el('h2', null, 'Units'));
  for (const unit of content.units) {
    if (focus !== 'all' && unit.channel !== focus) continue;
    const ids = content.unit_cards[unit.key] ?? [];
    const unseen = ids.filter((id) => !states[id]).length;
    const gate = gateStatus(unit.key, content, states);
    const line = el('div', 'unit-row');
    line.append(el('span', 'unit-name', unit.name));
    line.append(el('span', 'unit-meta',
      `${unseen} of ${ids.length} not started`));
    line.append(el('span', gate.open ? 'pill pill-open' : 'pill pill-closed',
      gate.open ? 'open' : 'closed'));
    const start = el('button', null, 'Start');
    start.addEventListener('click',
      () => ctx.navigate(`/session?focus=${unit.channel}&unit=${unit.key}`));
    line.append(start);
    list.append(line);
  }
  root.append(list);

  const paragraph = el('p', 'placement-link');
  const link = el('a', null, 'Take the placement test');
  link.href = '#/placement';
  paragraph.append(link);
  root.append(paragraph);
}
```

- [ ] **Step 4: Create `app/style.css`**

```css
:root {
  --ink: #1b1b1b;
  --paper: #fbfaf7;
  --line: #d8d4cc;
  --accent: #2f6f4e;
  --warn: #8a4b1f;
  --level-0: #eeeae2;
  --level-1: #d7e4d2;
  --level-2: #b2cfae;
  --level-3: #7fb389;
  --level-4: #3f8b5e;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0 1rem 3rem;
  font: 16px/1.5 system-ui, sans-serif;
  color: var(--ink);
  background: var(--paper);
}

main { max-width: 52rem; margin: 0 auto; }

h1 { font-size: 1.6rem; }
h2 { font-size: 1.15rem; }

.banner {
  background: var(--warn);
  color: #fff;
  padding: 0.6rem 1rem;
  margin: 0 -1rem 1rem;
}

.nav {
  display: flex;
  gap: 1rem;
  max-width: 52rem;
  margin: 0 auto;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--line);
}

.nav a { color: var(--accent); text-decoration: none; }

button {
  font: inherit;
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
button:disabled { opacity: 0.5; cursor: default; }

.channel-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0; }
.channel.is-active { background: var(--accent); color: #fff; border-color: var(--accent); }

.card {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 1rem;
  margin: 1rem 0;
  background: #fff;
}

.notice { background: #fff4e0; border-left: 4px solid var(--warn); padding: 0.75rem; }

.unit-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--line);
}

.unit-meta { color: #5c5850; font-size: 0.9rem; }

.pill { font-size: 0.8rem; padding: 0.1rem 0.5rem; border-radius: 999px; border: 1px solid var(--line); }
.pill-open { background: var(--level-2); }
.pill-closed { background: var(--level-0); }

.chip {
  display: inline-block;
  font-size: 0.8rem;
  padding: 0.1rem 0.5rem;
  border: 1px solid var(--accent);
  border-radius: 999px;
  color: var(--accent);
}

.progress-bar { height: 6px; background: var(--level-0); border-radius: 3px; margin: 0.5rem 0 1rem; }
.progress-bar > div { height: 100%; background: var(--accent); border-radius: 3px; }

.photo { max-width: 100%; max-height: 22rem; border: 1px solid var(--line); background: #fff; }
.photo-pair { display: flex; gap: 1rem; flex-wrap: wrap; }
.attribution { font-size: 0.8rem; color: #5c5850; }

.options { display: flex; flex-direction: column; gap: 0.5rem; margin: 1rem 0; }
.options.inv { flex-direction: row; flex-wrap: wrap; }
.options.inv img { width: 9rem; height: 9rem; object-fit: cover; }
.option-sub { display: block; font-style: italic; color: #5c5850; font-size: 0.85rem; }

.grid { border-collapse: collapse; width: 100%; }
.grid th, .grid td { border: 1px solid var(--line); padding: 0.3rem 0.5rem; text-align: left; }
.grid td.cell { text-align: center; width: 3rem; }
.lv-0 { background: var(--level-0); }
.lv-1 { background: var(--level-1); }
.lv-2 { background: var(--level-2); }
.lv-3 { background: var(--level-3); }
.lv-4 { background: var(--level-4); color: #fff; }
.cell-empty { background: repeating-linear-gradient(45deg, #fff, #fff 4px, #eee 4px, #eee 8px); }

.error { border: 2px solid var(--warn); padding: 1rem; margin-top: 1rem; }

label { display: block; margin: 0.75rem 0; }
input[type="number"], input[type="text"] { font: inherit; padding: 0.3rem; border: 1px solid var(--line); border-radius: 4px; }
```

- [ ] **Step 5: Run the whole suite to prove the logic is untouched**

Run: `npm test`
Expected: PASS, eight test files green.

- [ ] **Step 6: Serve the site and run the manual checklist**

Run in one terminal: `python -m http.server 8000`
If Python is missing, run `npx serve .` and use the port it prints.

Open `http://localhost:8000/?content=dev#/` and check each line:

1. The page title is "Dendro" and the nav shows Home, Progress, Settings.
2. Four channel buttons appear: "All channels (0 due)", "leaf (0 due)", "bark (0 due)", "fruit (0 due)". No "flower" button and no "twig" button.
3. "All channels" has the active green background.
4. The recommendation card reads "Next up: Leaf types" with a Start button.
5. The unit list shows nine rows. "Leaf types" is marked open. "Simple lobed leaves" is marked closed.
6. Every unit row shows "N of M not started" and a Start button.
7. Click the "bark" channel button. The URL becomes `#/?focus=bark` and the unit list shows only "Bark types".
8. Click "All channels" to go back.
9. Click "Take the placement test". The URL becomes `#/placement` and the page reads "Not built yet."
10. Open `http://localhost:8000/#/` with no query. The page loads, the channel buttons appear, and every unit shows "0 of 0 not started", because `content/` holds no images yet.
11. Open the browser console. There are no errors.

- [ ] **Step 7: Check the content-error screen**

Temporarily break the fixture, reload, then put it back.

Run: `node -e "const f='content_dev/species.json';const fs=require('fs');const d=JSON.parse(fs.readFileSync(f));delete d.QUGA.family;fs.writeFileSync(f+'.bak',JSON.stringify(d,null,2))"`

Then swap the files by hand with the Bash tool:

```bash
mv content_dev/species.json content_dev/species.good.json && mv content_dev/species.json.bak content_dev/species.json
```

Reload `http://localhost:8000/?content=dev#/`.
Expected: the page shows only "Content failed to validate" and the line `species.json: QUGA has no family`. No channel buttons and no unit list.

Restore:

```bash
mv content_dev/species.good.json content_dev/species.json
```

Reload and confirm the home screen returns.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add the app shell, the router, and the home screen" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The session screen

**Files:**
- Modify: `app/screens/session.js` (replace the stub)

**Interfaces:**
- Consumes: `buildSession`, `buildPlacementDeck`, `placementState`, `requeueCard` from `logic/session.js`; `buildQuestion`, `buildReveal`, `invAvailable` from `logic/question.js`; `gradeChoice`, `gradeTyped`, `resolveTyped` from `logic/grader.js`; `deriveGrade`, `scheduleCard`, `addDays` from `logic/scheduler.js`; `cardLevel` from `logic/progress.js`.
- Produces: `render(root, ctx)`. `ctx.mode` is `'review'` or `'placement'`.

**Rules this screen carries:**
- The timer starts when the photo has loaded, not when the card is built.
- An image that fails to load is replaced from the pool. An exhausted pool skips the card and logs to the console.
- A card graded `again` in review mode re-queues once. The repeat writes no log row, no card state, and no second re-queue. The summary counts the card as missed.
- Placement mode writes card state through `placementState` and writes no log row. It never re-queues.

- [ ] **Step 1: Replace `app/screens/session.js`**

```js
// The quiz loop and the summary. Computes nothing: every value comes from a logic module.
import {
  buildSession, buildPlacementDeck, placementState, requeueCard
} from '../logic/session.js';
import { buildQuestion, buildReveal, invAvailable } from '../logic/question.js';
import { gradeChoice, gradeTyped, resolveTyped } from '../logic/grader.js';
import { deriveGrade, scheduleCard, addDays } from '../logic/scheduler.js';
import { cardLevel } from '../logic/progress.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function render(root, ctx) {
  const { content, store, today, image_base: imageBase } = ctx;
  const mode = ctx.mode ?? 'review';
  const focus = ctx.params.get('focus') ?? 'all';
  const chosenUnit = ctx.params.get('unit') || null;
  const userSettings = store.readSettings();

  const deck = mode === 'placement'
    ? buildPlacementDeck(content)
    : buildSession({
      content, states: store.readCards(), log: store.readLog(),
      settings: userSettings, today, focus, chosen_unit: chosenUnit
    }).card_ids;

  const totalPlanned = deck.length;
  const lastFile = {};
  const failedFiles = {};
  const requeuedOnce = new Set();
  const answered = new Set();
  const results = { right: 0, missed: 0, promoted: [], demoted: [], misses: [] };
  let index = 0;
  let shown = 0;

  if (totalPlanned === 0) {
    root.append(el('h1', null, 'Nothing to study'));
    root.append(el('p', null,
      'Nothing is due in this focus and the daily new-card cap is reached.'));
    const back = el('button', 'primary', 'Home');
    back.addEventListener('click', () => ctx.navigate('/'));
    root.append(back);
    return;
  }

  function excludedFor(cardId) {
    return [...(failedFiles[cardId] ?? []), lastFile[cardId]].filter(Boolean);
  }

  function answerCard(question, card, chosenKey, typedText, guess, elapsedMs) {
    const correct = question.format === 'typed'
      ? gradeTyped(card, typedText, content)
      : gradeChoice(question.answer_key, chosenKey);
    const grade = deriveGrade({
      correct, guess, elapsed_ms: elapsedMs, format: question.format
    });
    const repeat = answered.has(card.id);
    answered.add(card.id);

    if (!repeat) {
      if (mode === 'placement') {
        const state = placementState(correct, today);
        if (state) store.writeCard(card.id, state);
      } else {
        const before = store.readCards()[card.id];
        const after = scheduleCard(before, grade, today, {
          inv_available: invAvailable(content, card.channel)
        });
        store.writeCard(card.id, after);
        store.appendLog({
          card: card.id,
          at: new Date().toISOString(),
          grade,
          format: question.format,
          options: question.option_count,
          elapsed_ms: elapsedMs,
          answer: question.format === 'typed' ? typedText : chosenKey
        });
        if (cardLevel(after) > cardLevel(before)) results.promoted.push(card.id);
        if (cardLevel(after) < cardLevel(before)) results.demoted.push(card.id);
      }
      if (correct) results.right += 1;
      else results.missed += 1;
    }

    let revealKey = chosenKey;
    if (correct) revealKey = question.answer_key;
    else if (question.format === 'typed') {
      revealKey = resolveTyped(typedText, card.kind, card.channel, content);
    }
    const reveal = buildReveal({ question, chosen_key: revealKey, content });
    if (!repeat && reveal.missing_edge) store.recordMissingEdge(reveal.missing_edge);
    if (!repeat && !correct) {
      results.misses.push({
        card_id: card.id,
        label: reveal.answer.label,
        chosen: reveal.chosen ? reveal.chosen.label : typedText,
        diagnostic: reveal.diagnostic ? reveal.diagnostic.text : ''
      });
    }

    if (grade === 'again' && mode === 'review' && !requeuedOnce.has(card.id)) {
      requeuedOnce.add(card.id);
      deck.splice(0, deck.length, ...requeueCard(deck, index, card.id));
      index -= 1;
    }
    showReveal(question, reveal, typedText, correct);
  }

  function showReveal(question, reveal, typedText, correct) {
    root.textContent = '';
    header(question);
    root.append(el('h2', null, correct ? 'Right' : 'Wrong'));

    const pair = el('div', 'photo-pair');
    pair.append(photoBlock(reveal.answer.photo, `${reveal.answer.label} (the answer)`));
    if (!correct && reveal.chosen && reveal.chosen.photo) {
      pair.append(photoBlock(reveal.chosen.photo, `${reveal.chosen.label} (you picked)`));
    }
    root.append(pair);

    if (!correct && question.format === 'typed') {
      root.append(el('p', null, `You typed: ${typedText}`));
    }
    if (reveal.diagnostic) {
      root.append(el('p', 'notice', reveal.diagnostic.text));
      if (reveal.diagnostic.ref) root.append(el('p', 'attribution', reveal.diagnostic.ref));
    }

    root.append(el('p', null, reveal.answer.label));
    if (reveal.answer.sublabel) root.append(el('p', 'option-sub', reveal.answer.sublabel));
    const facts = reveal.answer.facts;
    if (facts.range_text) {
      root.append(el('p', null, facts.range_text));
      root.append(el('p', null,
        `Elevation ${facts.elevation_ft[0]} to ${facts.elevation_ft[1]} ft. Height ${facts.height_ft[0]} to ${facts.height_ft[1]} ft.`));
      root.append(el('p', null, facts.habitat));
    } else if (facts.description) {
      root.append(el('p', null, facts.description));
    }

    const next = el('button', 'primary', 'Next');
    next.addEventListener('click', () => { index += 1; showCard(); });
    root.append(next);
  }

  function photoBlock(photo, caption) {
    const box = el('figure', null);
    if (photo) {
      const img = document.createElement('img');
      img.className = 'photo';
      img.src = imageBase + photo.file;
      img.alt = caption;
      box.append(img);
      box.append(el('figcaption', 'attribution',
        `${caption}. ${photo.author}, ${photo.source}, ${photo.license}.`));
    } else {
      box.append(el('p', 'attribution', `${caption}. No photo.`));
    }
    return box;
  }

  // A re-queued card does not add to the total, so the counter is clamped.
  function header(question) {
    const position = Math.min(Math.max(shown, 1), deck.length);
    const bar = el('div', 'progress-bar');
    const fill = el('div');
    fill.style.width = `${Math.round((position / deck.length) * 100)}%`;
    bar.append(fill);
    root.append(el('p', null, `Card ${position} of ${deck.length}`));
    root.append(bar);
    const line = el('p', null, question.prompt);
    line.append(document.createTextNode(' '));
    line.append(el('span', 'chip', question.format));
    root.append(line);
  }

  function showCard() {
    if (index >= deck.length) { showSummary(); return; }
    shown += 1;
    const cardId = deck[index];
    const card = content.cards[cardId];
    const state = mode === 'placement' ? null : store.readCards()[cardId];
    const question = buildQuestion({
      card, content, state, excluded_files: excludedFor(cardId)
    });

    if (question.format !== 'inv' && !question.photo) {
      console.warn(`Photo pool exhausted for ${cardId}. Skipping the card this session.`);
      index += 1;
      showCard();
      return;
    }

    root.textContent = '';
    header(question);

    let startedAt = 0;
    const guessBox = document.createElement('input');
    guessBox.type = 'checkbox';
    guessBox.id = 'guess_box';
    const guessLabel = el('label', null, ' I guessed');
    guessLabel.prepend(guessBox);

    const answerArea = el('div', 'answer-area');

    const submit = (chosenKey, typedText) => {
      const elapsed = startedAt ? Date.now() - startedAt : 0;
      answerCard(question, card, chosenKey, typedText, guessBox.checked, elapsed);
    };

    if (question.format === 'inv') {
      const list = el('div', 'options inv');
      let pending = question.options.length;
      for (const option of question.options) {
        const button = el('button', null);
        const img = document.createElement('img');
        img.src = imageBase + option.photo.file;
        img.alt = 'Option photo';
        img.addEventListener('load', () => {
          pending -= 1;
          if (pending === 0 && !startedAt) startedAt = Date.now();
        });
        img.addEventListener('error', () => {
          pending -= 1;
          if (option.key === question.answer_key) {
            console.warn(`Answer photo failed for ${cardId}. Skipping the card this session.`);
            index += 1;
            showCard();
            return;
          }
          button.remove();
          if (pending === 0 && !startedAt) startedAt = Date.now();
        });
        button.append(img);
        button.addEventListener('click', () => submit(option.key, ''));
        list.append(button);
      }
      root.append(list);
      root.append(guessLabel);
      lastFile[cardId] = question.options
        .find((o) => o.key === question.answer_key)?.photo.file ?? null;
    } else {
      const img = document.createElement('img');
      img.className = 'photo';
      img.src = imageBase + question.photo.file;
      img.alt = question.prompt;
      img.addEventListener('load', () => { startedAt = Date.now(); });
      img.addEventListener('error', () => {
        failedFiles[cardId] = [...(failedFiles[cardId] ?? []), question.photo.file];
        console.warn(`Image failed: ${question.photo.file}`);
        showCard();
      });
      root.append(img);
      root.append(el('p', 'attribution',
        `${question.photo.author}, ${question.photo.source}, ${question.photo.license}.`));
      lastFile[cardId] = question.photo.file;

      if (question.format === 'typed') {
        const field = document.createElement('input');
        field.type = 'text';
        field.id = 'typed_answer';
        field.autocomplete = 'off';
        const go = el('button', 'primary', 'Answer');
        go.addEventListener('click', () => submit(null, field.value));
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') submit(null, field.value);
        });
        answerArea.append(field, go);
      } else {
        const list = el('div', 'options');
        for (const option of question.options) {
          const button = el('button', null, option.label);
          if (option.sublabel) button.append(el('span', 'option-sub', option.sublabel));
          button.addEventListener('click', () => submit(option.key, ''));
          list.append(button);
        }
        answerArea.append(list);
      }
      root.append(answerArea);
      root.append(guessLabel);
    }
  }

  function showSummary() {
    root.textContent = '';
    root.append(el('h1', null, 'Session summary'));
    root.append(el('p', null, `Right: ${results.right}. Missed: ${results.missed}.`));

    const tomorrow = addDays(today, 1);
    const dueTomorrow = Object.values(store.readCards())
      .filter((s) => s.due === tomorrow).length;
    root.append(el('p', null, `Due tomorrow: ${dueTomorrow}.`));

    const name = (id) => content.cards[id] ? `${content.cards[id].kind} ${content.cards[id].key} (${content.cards[id].channel})` : id;
    root.append(el('p', null,
      `Promoted: ${results.promoted.length ? results.promoted.map(name).join(', ') : 'none'}.`));
    root.append(el('p', null,
      `Demoted: ${results.demoted.length ? results.demoted.map(name).join(', ') : 'none'}.`));

    if (results.misses.length) {
      root.append(el('h2', null, 'Missed cards'));
      const list = el('ul');
      for (const miss of results.misses) {
        list.append(el('li', null, `${miss.label} against ${miss.chosen}. ${miss.diagnostic}`));
      }
      root.append(list);
    }

    if (!store.available) {
      root.append(el('p', 'notice',
        'This browser blocks local storage, so nothing was saved. Open Settings and export before you close the tab.'));
    } else if (store.shouldPromptExport(today)) {
      root.append(el('p', 'notice',
        'It has been a month since your last export. Open Settings and export your progress.'));
    }

    const again = el('button', 'primary', 'Another session');
    again.addEventListener('click', () => {
      ctx.navigate(`/session?focus=${focus}${chosenUnit ? `&unit=${chosenUnit}` : ''}`);
      window.location.reload();
    });
    const home = el('button', null, 'Home');
    home.addEventListener('click', () => ctx.navigate('/'));
    root.append(again, home);
  }

  showCard();
}
```

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: PASS, eight test files green. The screen carries no logic the tests cover, so nothing changes here.

- [ ] **Step 3: Manual checklist, review mode**

Serve with `python -m http.server 8000`. Open `http://localhost:8000/?content=dev#/`.
Clear storage first: open the console and run `localStorage.clear()`, then reload.

1. Click Start on "Next up: Leaf types". The URL becomes `#/session?focus=all&unit=leaf_types`.
2. The page shows "Card 1 of 1", a progress bar, the prompt "What leaf type is this?", a chip reading "mc4", a photo, and four option buttons.
3. Each option button shows a bold category name. The correct option is "Simple, lobed".
4. The guess checkbox reads "I guessed" and starts unchecked.
5. Click a wrong option, for example "Needles". The page shows "Wrong", the answer photo, the fallback sentence naming both concepts, and a Next button.
6. Click Next. The card re-queues at the back of the deck, so the same card appears again. The counter still reads "Card 1 of 1", because a re-queue adds no work to the total.
7. Answer it right. The page shows "Right", the range line, and Next.
8. Click Next. The summary shows "Right: 0. Missed: 1." The re-answer did not change the count.
9. In the console run `JSON.parse(localStorage.dendro_log).rows.length`. It returns 1, not 2.
10. In the console run `JSON.parse(localStorage.dendro_cards).cards`. The concept card shows `tier: "mc4"`, `interval: 1`, `lapses: 1`.
11. Click Home. Click Start again and answer right three times across three sessions. After the third, the summary lists the card under Promoted.
12. Go Home with focus "bark" and start "Bark types". With three bark concept cards the deck holds three. Answer each. The chip reads "mc4" for all three.
13. Set a card to tier `inv` by hand in the console, then start a leaf session:
    `const c=JSON.parse(localStorage.dendro_cards); c.cards['species:QUGA:leaf']={interval:25,ease:2.5,due:'2020-01-01',reps:5,lapses:0,recent:[],tier:'inv',tier_passes:0}; localStorage.dendro_cards=JSON.stringify(c);`
    Reload, open `#/session?focus=leaf`, and check that the prompt reads "Which photo shows Gambel oak?", the chip reads "inv", and five photo buttons appear with no prompt photo above them.
14. Set the same card to tier `typed` the same way. The session shows a text field and an Answer button. Type "gambel oak" and press Enter. The reveal says "Right".
15. Type "quercus rubra" on a later typed card. The reveal says "Wrong" and shows the line "You typed: quercus rubra".
16. Open the console. There are no errors.

- [ ] **Step 4: Manual checklist, image failure**

1. Rename one fixture image so it 404s:
   `mv content_dev/images/QUGA/leaf/001.jpg content_dev/images/QUGA/leaf/001.hidden`
2. Reload and start a leaf session that includes `species:QUGA:leaf`. The console logs `Image failed: images/QUGA/leaf/001.jpg` and the card shows the second QUGA leaf photo instead.
3. Rename the second one too:
   `mv content_dev/images/QUGA/leaf/002.jpg content_dev/images/QUGA/leaf/002.hidden`
4. Reload and start the session again. The console logs the pool-exhausted warning and the deck moves past that card.
5. Restore both:
   `mv content_dev/images/QUGA/leaf/001.hidden content_dev/images/QUGA/leaf/001.jpg && mv content_dev/images/QUGA/leaf/002.hidden content_dev/images/QUGA/leaf/002.jpg`

- [ ] **Step 5: Manual checklist, placement mode**

1. Run `localStorage.clear()` in the console and reload.
2. Click "Take the placement test". The URL becomes `#/placement`.
3. The deck holds 6 cards, one per level-1 concept with photos. Every chip reads "mc4".
4. Answer the first one wrong. The reveal appears and Next moves on. The card does not re-queue, so the count still reads "Card 2 of 6".
5. Answer the rest right and reach the summary.
6. In the console run `JSON.parse(localStorage.dendro_log).rows.length`. It returns 0.
7. Run `JSON.parse(localStorage.dendro_cards).cards`. The five right cards show `tier: "mc8"`, `interval: 21`, `tier_passes: 0`. The wrong one is absent.
8. Go Home. The leaf channel now shows 0 due, and "Simple lobed leaves" is marked open, because the one leaf concept card is at level 2.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add the session screen, the quiz loop, and the summary" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: The progress screen and the species screen

**Files:**
- Modify: `app/screens/progress.js` (replace the stub)
- Modify: `app/screens/species.js` (replace the stub)

**Interfaces:**
- Consumes: `progressGrid`, `unitNumber`, `cardLevel`, `speciesLevel`, `LEVEL_NAMES` from `logic/progress.js`; `cardId` from `logic/content.js`.
- Produces: `render(root, ctx)` in each file. The species screen reads `ctx.symbol`.

- [ ] **Step 1: Replace `app/screens/progress.js`**

```js
// Unit tiles and the grid. Every number comes from logic/progress.js.
import { progressGrid } from '../logic/progress.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function render(root, ctx) {
  const { content, store } = ctx;
  const grid = progressGrid(content, store.readCards());

  root.append(el('h1', null, 'Progress'));

  const tiles = el('div', 'channel-row');
  for (const unit of grid.units) {
    const tile = el('div', 'card');
    tile.append(el('h2', null, unit.name));
    tile.append(el('p', null, unit.number.label));
    tiles.append(tile);
  }
  root.append(tiles);

  for (const unit of grid.units) {
    if (unit.rows.length === 0) continue;
    root.append(el('h2', null, `${unit.name} (${unit.number.label})`));
    const table = el('table', 'grid');
    const head = el('tr');
    head.append(el('th', null, 'Species'));
    for (const channel of grid.channels) head.append(el('th', null, channel));
    table.append(head);
    for (const row of unit.rows) {
      const line = el('tr');
      const nameCell = el('td');
      const link = el('a', null, row.common);
      link.href = `#/species/${row.symbol}`;
      nameCell.append(link);
      line.append(nameCell);
      for (const cell of row.cells) {
        const box = el('td', cell.has_card ? `cell lv-${cell.level}` : 'cell cell-empty',
          cell.has_card ? String(cell.level) : '');
        line.append(box);
      }
      table.append(line);
    }
    root.append(table);
  }
}
```

- [ ] **Step 2: Replace `app/screens/species.js`**

```js
// One species: facts, photos by channel, levels, next due dates, varieties.
import { cardId } from '../logic/content.js';
import { cardLevel, speciesLevel, LEVEL_NAMES } from '../logic/progress.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fact(list, term, value) {
  if (value === undefined || value === null || value === '') return;
  list.append(el('dt', null, term));
  list.append(el('dd', null, String(value)));
}

export function render(root, ctx) {
  const { content, store, symbol, image_base: imageBase } = ctx;
  const record = content.species[symbol];
  if (!record) {
    root.append(el('h1', null, 'Unknown species'));
    root.append(el('p', null, `No record for ${symbol}.`));
    return;
  }
  const states = store.readCards();

  root.append(el('h1', null, record.common[0]));
  root.append(el('p', 'option-sub', record.scientific));
  root.append(el('p', null,
    `${symbol}. ${record.native_status}. Overall level ${speciesLevel(symbol, content, states)}.`));

  const list = el('dl');
  fact(list, 'Range', record.range?.text);
  fact(list, 'States', (record.range?.states ?? []).join(', '));
  fact(list, 'Planted states', (record.planted_states ?? []).join(', '));
  fact(list, 'Elevation', `${record.elevation_ft[0]} to ${record.elevation_ft[1]} ft`);
  fact(list, 'Height', `${record.height_ft[0]} to ${record.height_ft[1]} ft`);
  fact(list, 'Habitat', record.habitat);
  fact(list, 'Audubon name', record.audubon_name);
  fact(list, 'Section', record.section);
  fact(list, 'Arrangement', record.arrangement);
  for (const [channel, bucket] of Object.entries(record.concepts ?? {})) {
    const concept = content.concepts.find((c) => c.channel === channel && c.key === bucket);
    fact(list, `${channel} type`, concept?.name ?? bucket);
  }
  root.append(list);

  for (const channel of content.channels) {
    const card = content.cards[cardId('species', channel, symbol)];
    if (!card) continue;
    root.append(el('h2', null, channel));
    const state = states[card.id];
    root.append(el('p', null,
      `Level ${cardLevel(state)}, ${LEVEL_NAMES[cardLevel(state)]}. Next due ${state?.due ?? 'not scheduled'}.`));
    const strip = el('div', 'photo-pair');
    for (const photo of card.photos) {
      const figure = el('figure');
      const img = document.createElement('img');
      img.className = 'photo';
      img.src = imageBase + photo.file;
      img.alt = `${record.common[0]} ${channel}`;
      figure.append(img);
      figure.append(el('figcaption', 'attribution',
        `${photo.author}, ${photo.source}, ${photo.license}.`));
      strip.append(figure);
    }
    root.append(strip);
  }

  if ((record.varieties ?? []).length) {
    root.append(el('h2', null, 'Varieties'));
    const varieties = el('ul');
    for (const variety of record.varieties) {
      const channels = content.channels
        .filter((channel) => content.cards[cardId('variety', channel, variety.key)]);
      const status = channels.length ? `card on ${channels.join(', ')}` : 'no card';
      varieties.append(el('li', null, `${variety.name}. ${variety.note} (${status})`));
    }
    root.append(varieties);
  }
}
```

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS, eight test files green.

- [ ] **Step 4: Manual checklist**

Serve with `python -m http.server 8000`. Open `http://localhost:8000/?content=dev#/`.
Seed a mixed state in the console, then reload:

```
localStorage.clear();
localStorage.dendro_cards = JSON.stringify({version:1,cards:{
 'species:ACPL:leaf':{interval:30,ease:2.5,due:'2026-10-01',reps:6,lapses:0,recent:[],tier:'typed',tier_passes:2},
 'species:ACSA2:leaf':{interval:10,ease:2.5,due:'2026-09-30',reps:3,lapses:0,recent:[],tier:'mc8',tier_passes:0}
}});
```

Progress screen, at `#/progress`:

1. Nine unit tiles appear, one per unit, each with a name and a label like "0%, 0 of 3 expert".
2. The "Maples" tile reads "75%, 1 of 2 expert".
3. Below the tiles a table appears for every unit that holds species. "Leaf types" has no table, because a level-1 unit holds concept cards and no species rows.
4. The "Maples" table has the columns Species, leaf, bark, fruit.
5. The ACPL row shows 4 in the leaf column on the darkest green, an empty hatched cell in the bark column, and 0 in the fruit column.
6. Every cell shows its digit, so the table reads without colour.
7. Click "Norway maple". The URL becomes `#/species/ACPL`.

Species screen, at `#/species/ACPL`:

8. The heading reads "Norway maple" with "Acer platanoides" under it.
9. The line under that reads "ACPL. introduced. Overall level 0."
10. The fact list shows Range, States (empty, so the row is absent), Planted states "CO, UT, WY, NE, KS", Elevation "4000 to 7000 ft", Height "40 to 60 ft", Habitat, Audubon name, Arrangement "opposite", "leaf type Simple, lobed", and "fruit type Samara". There is no Section row, because ACPL has none.
11. A "leaf" heading shows "Level 4, expert. Next due 2026-10-01." and one photo with the attribution line under it.
12. A "fruit" heading shows "Level 0, novice. Next due not scheduled." and one photo.
13. There is no "bark" heading, because ACPL has no bark card.
14. Open `#/species/QUGA`. A Varieties section lists "var. gambelii" and "var. bakeri", each with its note and "(card on leaf)".
15. Open `#/species/QUVE`. The facts render and no channel headings appear, because QUVE has no cards.
16. Open `#/species/ZZZZ`. The page reads "Unknown species".
17. The console shows no errors.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add the progress grid and the species screen" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: The settings screen

**Files:**
- Modify: `app/screens/settings.js` (replace the stub)

**Interfaces:**
- Consumes: the store from `logic/store.js`.
- Produces: `render(root, ctx)`.

- [ ] **Step 1: Replace `app/screens/settings.js`**

```js
// Session size, new cards per day, export, import, reset, and the missing diagnostics.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function render(root, ctx) {
  const { store, today, content } = ctx;
  const current = store.readSettings();

  root.append(el('h1', null, 'Settings'));

  if (!store.available) {
    root.append(el('p', 'notice',
      'This browser blocks local storage. Changes here are not saved.'));
  }

  const sizeLabel = el('label', null, 'Cards per session ');
  const sizeField = document.createElement('input');
  sizeField.type = 'number';
  sizeField.id = 'session_size';
  sizeField.min = '1';
  sizeField.max = '100';
  sizeField.value = String(current.session_size);
  sizeField.addEventListener('change', () => {
    store.writeSettings({ session_size: Number(sizeField.value) });
  });
  sizeLabel.append(sizeField);
  root.append(sizeLabel);

  const newLabel = el('label', null, 'New cards per day ');
  const newField = document.createElement('input');
  newField.type = 'number';
  newField.id = 'new_per_day';
  newField.min = '0';
  newField.max = '100';
  newField.value = String(current.new_per_day);
  newField.addEventListener('change', () => {
    store.writeSettings({ new_per_day: Number(newField.value) });
  });
  newLabel.append(newField);
  root.append(newLabel);

  root.append(el('h2', null, 'Export'));
  const exportButton = el('button', 'primary', 'Export progress');
  exportButton.addEventListener('click', () => {
    const blob = store.exportBlob(today);
    const file = new Blob([blob.json], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = blob.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    store.markExported(today);
  });
  root.append(exportButton);
  root.append(el('p', 'attribution',
    `Last export: ${store.readSettings().last_export ?? 'never'}.`));

  root.append(el('h2', null, 'Import'));
  const importStatus = el('p', 'attribution', '');
  const fileField = document.createElement('input');
  fileField.type = 'file';
  fileField.id = 'import_file';
  fileField.accept = 'application/json';
  fileField.addEventListener('change', async () => {
    const chosen = fileField.files?.[0];
    if (!chosen) return;
    const result = store.importBlob(await chosen.text());
    if (result.ok) {
      importStatus.textContent = 'Import done. Reload the page to see the new progress.';
    } else {
      importStatus.textContent = `Import rejected: ${result.errors.join(' ')}`;
    }
  });
  root.append(fileField, importStatus);

  root.append(el('h2', null, 'Reset'));
  const resetStatus = el('p', 'attribution', '');
  const resetButton = el('button', null, 'Reset all progress');
  const confirmButton = el('button', 'primary', 'Yes, delete everything');
  confirmButton.hidden = true;
  resetButton.addEventListener('click', () => {
    confirmButton.hidden = false;
    resetStatus.textContent = 'This deletes every card state and the whole review log.';
  });
  confirmButton.addEventListener('click', () => {
    store.reset();
    confirmButton.hidden = true;
    resetStatus.textContent = 'Progress reset.';
  });
  root.append(resetButton, confirmButton, resetStatus);

  root.append(el('h2', null, 'Missing diagnostics'));
  const edges = store.readMissingEdges();
  if (edges.length === 0) {
    root.append(el('p', null, 'No missing confusion edges recorded.'));
  } else {
    const list = el('ul');
    for (const edge of edges) {
      const a = content.species[edge.a]?.common[0] ?? edge.a;
      const b = content.species[edge.b]?.common[0] ?? edge.b;
      list.append(el('li', null, `${a} against ${b} on ${edge.channel}, missed ${edge.count} time(s)`));
    }
    root.append(list);
  }
}
```

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: PASS, eight test files green.

- [ ] **Step 3: Manual checklist**

Serve with `python -m http.server 8000`. Open `http://localhost:8000/?content=dev#/settings`.

1. "Cards per session" shows 20 and "New cards per day" shows 10.
2. Change "Cards per session" to 5 and click outside the field. In the console run `JSON.parse(localStorage.dendro_settings).session_size`. It returns 5.
3. Go to `#/` and start a session. The deck holds at most 5 cards.
4. Back on Settings, click "Export progress". The browser downloads `dendro-progress-YYYY-MM-DD.json` with today's date. Open it. It holds `version: 1` and the four sections `dendro_cards`, `dendro_log`, `dendro_settings`, `dendro_missing_edges`.
5. The line under the button now reads "Last export: YYYY-MM-DD."
6. Run `localStorage.clear()` in the console and reload `#/settings`. The fields show 20 and 10 again.
7. Choose the exported file in the Import control. The status line reads "Import done. Reload the page to see the new progress."
8. Reload. "Cards per session" shows 5 again.
9. Save a broken file and import it: create `bad.json` holding `{"version": 99}` and choose it. The status line reads "Import rejected:" and names the version and the missing sections. The fields still show 5.
10. Click "Reset all progress". A second button appears reading "Yes, delete everything" with a warning line. Click it. The line reads "Progress reset." Run `localStorage.dendro_cards` in the console. It returns null.
11. Reload. The fields show 20 and 10.
12. Miss a species pair with no confusion edge: start a leaf session, answer a Gambel oak card with Norway maple. Return to `#/settings`. The "Missing diagnostics" list holds one line reading "Norway maple against Gambel oak on leaf, missed 1 time(s)".
13. Open a private window and block site data for localhost, then open the app. The orange banner appears at the top, Settings shows the "blocks local storage" notice, and the app still runs a session.
14. The console shows no errors.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add the settings screen with export, import, and reset" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: The content validation script and the CI job

**Files:**
- Create: `scripts/validate_content.js`
- Create: `.github/workflows/check.yml`
- Test: `tests/validate_script.test.js`

**Interfaces:**
- Consumes: `validateContent` from `app/logic/content.js`.
- Produces: a CLI that takes one directory argument, prints errors and warnings, and exits 1 when there is an error. The CI job runs `node --test tests/`, then the script against `content/` and `content_dev/`, and deploys Pages only when both pass.

- [ ] **Step 1: Write the failing test**

`tests/validate_script.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function run(dir) {
  try {
    const out = execFileSync(process.execPath, ['scripts/validate_content.js', dir],
      { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status, out: `${error.stdout}${error.stderr}` };
  }
}

test('the script passes on the live content set', () => {
  const result = run('content/');
  assert.equal(result.code, 0);
  assert.match(result.out, /content\/ is valid/);
});

test('the script passes on the fixture and prints the size warnings', () => {
  const result = run('content_dev/');
  assert.equal(result.code, 0);
  assert.match(result.out, /warning/);
  assert.match(result.out, /outside the range 5 to 25/);
});

test('the script fails on a missing directory', () => {
  const result = run('content_missing/');
  assert.equal(result.code, 1);
  assert.match(result.out, /cannot read/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/validate_script.test.js`
Expected: FAIL. The script does not exist, so every run exits non-zero with `Cannot find module`.

- [ ] **Step 3: Create `scripts/validate_content.js`**

```js
// Validates a content directory. Usage: node scripts/validate_content.js content/
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateContent } from '../app/logic/content.js';

const FILES = {
  species: 'species.json',
  concepts: 'concepts.json',
  confusion: 'confusion.json',
  units: 'units.json',
  manifest: 'images/manifest.json'
};

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node scripts/validate_content.js <content_dir>');
  process.exit(1);
}
const dir = resolve(arg);

const raw = {};
for (const [field, file] of Object.entries(FILES)) {
  const path = join(dir, file);
  try {
    raw[field] = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`cannot read ${path}: ${error.message}`);
    process.exit(1);
  }
}

const { errors, warnings } = validateContent(raw);

const missingFiles = raw.manifest
  .filter((record) => !existsSync(join(dir, record.file)))
  .map((record) => record.file);
for (const file of missingFiles) {
  errors.push({ file: 'images/manifest.json', message: `the image ${file} is not on disk` });
}

for (const warning of warnings) console.log(`warning ${warning.file}: ${warning.message}`);
for (const error of errors) console.error(`error ${error.file}: ${error.message}`);

if (errors.length) {
  console.error(`${arg} has ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`${arg} is valid, with ${warnings.length} warning(s)`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/validate_script.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Create `.github/workflows/check.yml`**

```yaml
name: check

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Run the tests
        run: node --test tests/
      - name: Validate the live content
        run: node scripts/validate_content.js content/
      - name: Validate the fixture content
        run: node scripts/validate_content.js content_dev/

  deploy:
    needs: check
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 6: Run the whole suite and both validations**

Run: `npm test`
Expected: PASS, nine test files green.

Run: `npm run validate && npm run validate:dev`
Expected: `content/ is valid, with 3 warning(s)` then a list of fixture warnings and `content_dev/ is valid, with 9 warning(s)`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add the content validation script and the CI job" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 8: Turn on Pages**

This step is done by hand in the GitHub web interface, once.

1. Open the repository Settings, then Pages.
2. Under "Build and deployment", set Source to "GitHub Actions".
3. Push to `main` and watch the `check` workflow. The `check` job runs first. The `deploy` job runs only after it passes.
4. Open the published URL and confirm the home screen renders, then open `<url>?content=dev#/` and confirm the fixture boots.

---

## Spec coverage

| Spec section | Task |
|---|---|
| 1 v0 scope | 1 (content sets), 9 to 12 (screens) |
| 2 channels, levels, cards, photo pools, units | 2 |
| 3 architecture, fixture, CI, repo layout | 1, 13 |
| 4 data model, unit membership order | 1, 2 |
| 5 scheduler, grade derivation | 3 |
| 6 session builder, unit gate, relearning, distractor source, placement | 6, 7, 10 |
| 7 tier ladder, inv, sampling, prompts, distractors, grading, reveal, progress | 3, 4, 5, 6 |
| 8 screens | 9, 10, 11, 12 |
| 9 persistence | 8, 12 |
| 10 error handling | 2 (validation), 8 (storage), 9 (content error), 10 (image failure), 12 (import) |
| 11 v0 content requirements | out of scope for the app; the content spec owns it |
| 12 testing | every task's test file |
| 13 decisions | the choices list in this header |

Section 11 names content shipping requirements, not app code. The plan ships `content/` with the 21 real level-1 concepts and three level-1 units, so the content spec has a valid target to fill.
