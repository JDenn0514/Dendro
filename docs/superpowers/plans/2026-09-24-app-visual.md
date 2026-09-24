# Dendro app visual redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every screen of the Dendro web app in the specimen-plate look, and add the lessons pages, the progress rung pages, and the text size setting.

**Architecture:** The app stays a static site of vanilla ES modules with no build step. `app/style.css` is replaced by the mockup's stylesheet, ported to tokens on `:root`. The leaf, bark, and fruit marks move into one SVG sprite that the app fetches once at boot. New pure functions in `app/logic/` compute every number a screen prints, so `node --test` covers them; the screens only build DOM.

**Tech Stack:** HTML, CSS, ES modules, `node --test` on Node 24, Google Fonts (Fraunces and Literata), Python with Playwright for the screenshot and audit scripts.

## Global Constraints

- Colors, exact values, no new hue: Paper `#F1ECDF`, Ink `#22231E`, Moss `#3A5A3C`, Bark `#5C4634`, Lichen `#C9D2B4`, Sap `#B8892E`, mastery ramp `#E6DFCE` `#C9D2B4` `#9DB595` `#6B8F6A` `#3A5A3C`.
- Derived tints allowed: `--mount:#E8E2D1` (a darker paper for panels), `--ink-soft:#57584C` (a softened ink).
- Two font families only, both from Google Fonts: Fraunces for display and headings, Literata for text. No third family. No monospace.
- Every font size is in rem. Display sizes scale at half rate: `calc(Npx / 2 + Nrem / 32)`.
- Photos, leaf glyphs, level squares, and the 58 px depth column stay in px.
- Level names, level 0 to 4: `new`, `seen`, `familiar`, `strong`, `expert`.
- Every link, button, label, and control is at least 44 px in both directions at 360 px and 390 px wide, at root sizes 80, 100, and 130 percent.
- No horizontal page scroll at 360 px at any of those root sizes.
- `:focus-visible` outlines on every control type.
- Text contrast 4.5 to 1 or better.
- All motion sits inside `@media (prefers-reduced-motion: no-preference)`, with a `reduce` guard that switches animation and transition off.
- Tells to avoid: all-caps eyebrow labels, monospace labels, middle-dot meta strings, arrows in link text, numbered markers on things that are not a sequence, terracotta accents, identical rounded cards with one grey shadow, hairline newspaper columns, one accented word in a headline, page-load animations.
- No framework, no build step. One stylesheet, `app/style.css`.
- Out of scope: dark mode, desktop layout beyond a centered column at phone width, a sync server, new content, new card kinds.
- `?content=dev` must keep working with no network. The settings screen must stay reachable when content fails to load.
- Node 24. Tests run with `npm test`, which runs `node --test "tests/**/*.test.js"`.
- Run the app locally with `python -m http.server 8000` from the repo root, then open `http://localhost:8000/?content=dev#/`.

---

## File Structure

**Create:**

- `app/ui/sprite.svg` — the `<symbol>` set lifted from the mockup: 10 leaf glyphs, 6 bark plates, 8 fruit shapes. Fetched once at boot and injected, so `<use href="#lf-oak">` resolves.
- `app/ui/glyphs.js` — the concept-key and genus maps, `glyphIdFor(card, content)`, `glyph(id, level, sizeClass)`, `injectSprite()`. Pure map functions, so `node --test` covers them.
- `app/ui/dom.js` — `el(tag, className, text)`, `svg(tag)`, `srOnly(text)`. One copy of the helper every screen has its own copy of today.
- `app/ui/chrome.js` — `footNav(current)`, `trail(parts)`, `tick(className)`, `ramp(level, options)`, `rampClasses(level, lost)`, `levelWord(level)`.
- `app/logic/words.js` — `numberWord(n)`, `capitalize(text)`, `plural(word)`. Pure text, so it sits with the logic and `app/logic/progress.js` can import it. Used by home, lessons, progress, and species for sentences like "Fourteen cards are due today".
- `app/ui/plate.js` — `plate(photo, options)` builds the `<figure class="plate ...">`, `credit(photo, lead)` builds the caption, `plateTreatment(photo)` picks `print` or `field`.
- `app/ui/textsize.js` — `TEXT_SIZE_STEPS`, `stepFor(name)`, `isTextSize(name)`, `applyTextSize(name)`.
- `app/logic/lessons.js` — the unit tree, the fold defaults, the per-channel unit summary, the unit thumbnail pick. Pure.
- `app/screens/lessons.js` — `#/lessons` and `#/lessons/<channel>`.
- `app/screens/concept.js` — `#/progress/<channel>/<concept>`.
- `scripts/shots.py` — one screenshot per screen at 360 and 390 px, root 80, 100, and 130 percent.
- `scripts/audit.py` — the overflow and tap-target report.
- `tests/words.test.js`, `tests/rungs.test.js`, `tests/lessons.test.js`, `tests/glyphs.test.js`, `tests/ui.test.js`, `tests/textsize.test.js`.

**Modify:**

- `index.html` — the font link added, the old `<nav>` removed.
- `app/style.css` — replaced with the mockup's sheet, plus the rules the live app needs.
- `app/main.js` — the three new routes, the sprite injection, the text size on load, Home and Settings links on the error panel.
- `app/logic/progress.js` — the level names, and the rung rollups.
- `app/logic/store.js` — two new settings keys, `text_size` and `open_units`,
  and its private `daysBetween` swapped for the shared one.
- `app/logic/scheduler.js` — `daysBetween`, exported, for the due text on the
  species page and for the store.
- `app/screens/home.js`, `app/screens/progress.js`, `app/screens/session.js`, `app/screens/species.js`, `app/screens/settings.js` — rebuilt.
- `tests/progress.test.js`, `tests/store.test.js`, `tests/scheduler.test.js` — the level names, the new settings keys, and `daysBetween`.

**Not touched:** `.github/workflows/check.yml`, the content under `content/`,
`content_dev/`, and `content_src/`, and everything under `pipeline/`. The two
new scripts are developer tools and never run in CI.

**Photo treatment decision.** The app picks the treatment at run time from the image's own pixels: after a plate's `<img>` fires `load`, `measure` draws it into a 24 by 24 canvas, reads the four corner blocks, and caches `print` for a mean corner luminance of 0.86 or more, `field` for anything lower or for a `getImageData` that throws. A plate whose treatment is not yet known draws nothing until that measurement lands, so no photo is ever seen in the wrong treatment first. A per-photo flag in the manifest would be better, but the manifest is written by the pipeline under an append-only check in CI, so a new field means a pipeline change and a content rebuild, while a corner sample of an image the page has already downloaded costs no extra request and no new content field. The probe never sets `crossOrigin`, so a cross-origin CDN image taints the canvas, the read throws, the catch keeps `field`, and no image load can regress. `plateTreatment` reads `photo.ground` first, so a manifest flag can take over later with no other change.

---

### Task 1: Level names and the rung rollups

**Files:**
- Create: `app/logic/words.js`
- Modify: `app/logic/progress.js:1-5` (the imports and `LEVEL_NAMES`), then append after line 104
- Modify: `tests/progress.test.js:18`
- Test: `tests/rungs.test.js` (create), `tests/words.test.js` (create)

**Interfaces:**
- Consumes, all of them already in the repo:
  - `cardLevel(state) => number` — `app/logic/progress.js`, already in that file
  - `cardId(kind, channel, key) => string` — `app/logic/content.js`
  - `conceptFor(content, channel, key) => { key, name, description } | null` — `app/logic/content.js`
  - `content.cards: Record<string, Card>`, `Card` is `{ id, kind, channel, key, bucket, photos }`
  - `content.concepts_by_channel: Record<string, Concept[]>`
  - `content.species: Record<string, SpeciesRecord>` — each row carries `genus`, `retired`
  - `content.channels: string[]`
- Produces:
  - `numberWord(count: number) => string` — `app/logic/words.js`
  - `capitalize(text: string) => string` — `app/logic/words.js`
  - `plural(word: string, count?: number) => string` — `app/logic/words.js`
  - `LEVEL_NAMES: string[]` — `['new','seen','familiar','strong','expert']`
  - `RUNG_KINDS: string[]` — `['concept','group','species']`
  - `RUNG_NAMES: Record<string,string>` — `{concept:'shapes', group:'genera', species:'species'}`
  - `FAMILIAR: number` — `2`
  - `rollupLevel(levels: number[]) => number`
  - `channelRung(content, states, channel, kind) => Rung`, where `Rung` is
    `{ channel, kind, name, cards: Row[], counts: number[5], total, at_familiar, share, level }`
    and `Row` is `{ id, key, bucket, genus, level }` (`genus` is `null` unless `kind === 'species'`)
  - `channelRungs(content, states, channel) => Rung[]` in `RUNG_KINDS` order
  - `leadingConcept(content, states, channel) => { key, name, level, index, total } | null`
  - `channelClaim(content, states, channel) => string`
  - `overallTally(content, states) => { shapes: Tally, genera: Tally, species: Tally }`, `Tally` is `{ at, total }`
  - `overallFinding(content, states) => string`

- [ ] **Step 1: Write the failing test for the word helpers**

Create `tests/words.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberWord, capitalize, plural } from '../app/logic/words.js';

test('a count under one hundred prints as words', () => {
  assert.equal(numberWord(0), 'zero');
  assert.equal(numberWord(1), 'one');
  assert.equal(numberWord(14), 'fourteen');
  assert.equal(numberWord(20), 'twenty');
  assert.equal(numberWord(22), 'twenty-two');
  assert.equal(numberWord(99), 'ninety-nine');
});

test('a count of one hundred or more prints as figures', () => {
  assert.equal(numberWord(100), '100');
  assert.equal(numberWord(390), '390');
  assert.equal(numberWord(-1), '-1');
  assert.equal(numberWord(2.5), '2.5');
});

test('capitalize raises only the first letter', () => {
  assert.equal(capitalize('simple, lobed'), 'Simple, lobed');
  assert.equal(capitalize(''), '');
});

test('plural adds the ending a common name needs', () => {
  assert.equal(plural('oak'), 'oaks');
  assert.equal(plural('maple'), 'maples');
  assert.equal(plural('birch'), 'birches');
  assert.equal(plural('cherry'), 'cherries');
  assert.equal(plural('oak', 1), 'oak');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/words.test.js`
Expected: FAIL with `Cannot find module` for `../app/logic/words.js`.

- [ ] **Step 3: Write the word helpers**

Create `app/logic/words.js`:

```js
// Counts as words, for the sentences on home and progress. Pure.

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen'
];

const TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety'
];

// Above ninety-nine a word is longer than the figure it stands for, so the
// sentence prints the figure instead.
export function numberWord(count) {
  if (!Number.isInteger(count) || count < 0 || count > 99) return String(count);
  if (count < 20) return ONES[count];
  const tens = TENS[Math.floor(count / 10)];
  const ones = count % 10;
  return ones === 0 ? tens : `${tens}-${ONES[ones]}`;
}

export function capitalize(text) {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

export function plural(word, count = 2) {
  if (count === 1) return word;
  if (/(s|x|z|ch|sh)$/u.test(word)) return `${word}es`;
  if (/[^aeiou]y$/u.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/words.test.js`
Expected: PASS, four tests.

- [ ] **Step 5: Write the failing test for the rungs**

Create `tests/rungs.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { loadContent } from '../app/logic/content.js';
import {
  LEVEL_NAMES, RUNG_KINDS, RUNG_NAMES, FAMILIAR,
  rollupLevel, channelRung, channelRungs, leadingConcept,
  channelClaim, overallTally, overallFinding
} from '../app/logic/progress.js';

const { content } = loadContent(loadFixture());

test('the level names are the five words the spec fixes', () => {
  assert.deepEqual(LEVEL_NAMES, ['new', 'seen', 'familiar', 'strong', 'expert']);
  assert.equal(FAMILIAR, 2);
  assert.deepEqual(RUNG_KINDS, ['concept', 'group', 'species']);
  assert.equal(RUNG_NAMES.concept, 'shapes');
});

test('the rollup level is the mean level rounded', () => {
  assert.equal(rollupLevel([]), 0);
  assert.equal(rollupLevel([0, 0, 1, 1, 2, 2, 3, 4]), 2);
  assert.equal(rollupLevel([1, 3, 4]), 3);
  assert.equal(rollupLevel([2, 1, 2, 1, 1, 0, 0, 0]), 1);
});

test('a concept rung keeps the concept order of the channel', () => {
  const rung = channelRung(content, {}, 'leaf', 'concept');
  assert.equal(rung.kind, 'concept');
  assert.equal(rung.name, 'shapes');
  assert.deepEqual(rung.cards.map((r) => r.key), ['simple_lobed']);
  assert.equal(rung.total, 1);
  assert.equal(rung.level, 0);
  assert.equal(rung.at_familiar, 0);
  assert.equal(rung.share, 0);
  assert.deepEqual(rung.counts, [1, 0, 0, 0, 0]);
});

test('a species rung groups by genus and then by symbol', () => {
  const rung = channelRung(content, {}, 'leaf', 'species');
  assert.deepEqual(rung.cards.map((r) => r.key),
    ['ACPL', 'ACSA2', 'PLOC', 'QUGA', 'QURU']);
  assert.deepEqual(rung.cards.map((r) => r.genus),
    ['Acer', 'Acer', 'Platanus', 'Quercus', 'Quercus']);
  assert.equal(rung.cards[0].bucket, 'simple_lobed');
});

test('a bark rung keeps only the species that hold a bark card', () => {
  const rung = channelRung(content, {}, 'bark', 'concept');
  assert.deepEqual(rung.cards.map((r) => r.key), ['furrowed', 'plated', 'papery']);
  const species = channelRung(content, {}, 'bark', 'species');
  assert.deepEqual(species.cards.map((r) => r.key), ['PLOC', 'QUGA', 'QURU']);
});

test('a rung counts levels, the familiar share, and its own rollup', () => {
  const states = {
    'species:ACPL:leaf': { tier: 'mc8', tier_passes: 0 },
    'species:ACSA2:leaf': { tier: 'typed', tier_passes: 1 },
    'species:PLOC:leaf': { tier: 'mc4', tier_passes: 0 }
  };
  const rung = channelRung(content, states, 'leaf', 'species');
  assert.deepEqual(rung.counts, [2, 1, 1, 0, 1]);
  assert.equal(rung.at_familiar, 2);
  assert.equal(rung.total, 5);
  assert.equal(rung.share, 0.4);
  assert.equal(rung.level, 1);
});

test('the three rungs come back in one channel in kind order', () => {
  const rungs = channelRungs(content, {}, 'leaf');
  assert.deepEqual(rungs.map((r) => r.kind), ['concept', 'group', 'species']);
});

test('the leading concept is the highest-level concept card of the channel', () => {
  const states = { 'concept:leaf:simple_lobed': { tier: 'typed', tier_passes: 1 } };
  const leading = leadingConcept(content, states, 'leaf');
  assert.equal(leading.key, 'simple_lobed');
  assert.equal(leading.name, 'Simple, lobed');
  assert.equal(leading.level, 4);
  assert.equal(leading.index, 0);
  assert.equal(leading.total, 1);
});

test('the channel claim names the leading shape and the species behind it', () => {
  const states = { 'concept:leaf:simple_lobed': { tier: 'typed', tier_passes: 1 } };
  assert.equal(channelClaim(content, states, 'leaf'),
    'Simple, lobed sits at expert. The five species behind it do not.');
  const keeping = { ...states };
  for (const symbol of ['ACPL', 'ACSA2', 'PLOC', 'QUGA', 'QURU']) {
    keeping[`species:${symbol}:leaf`] = { tier: 'typed', tier_passes: 1 };
  }
  assert.equal(channelClaim(content, keeping, 'leaf'),
    'Simple, lobed sits at expert. The five species behind it keep up.');
});

test('the tally adds the three rungs over every channel', () => {
  const tally = overallTally(content, {});
  assert.equal(tally.shapes.at, 0);
  assert.equal(tally.shapes.total, 6);
  assert.equal(tally.genera.total, 7);
  assert.equal(tally.species.total, 10);
});

test('the finding reads the gap between the shapes and the species', () => {
  assert.equal(overallFinding(content, {}),
    'Nothing is started yet. The shapes come first.');
  const shapesOnly = {
    'concept:leaf:simple_lobed': { tier: 'mc8', tier_passes: 0 },
    'concept:bark:furrowed': { tier: 'mc8', tier_passes: 0 },
    'concept:fruit:acorn': { tier: 'mc8', tier_passes: 0 }
  };
  assert.equal(overallFinding(content, shapesOnly),
    'You know the shapes. Not the trees inside them.');
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `node --test tests/rungs.test.js`
Expected: FAIL. The message names the missing exports, for example
`SyntaxError: The requested module '../app/logic/progress.js' does not provide an export named 'RUNG_KINDS'`.

- [ ] **Step 7: Change the level names and the imports**

In `app/logic/progress.js`, replace line 4:

```js
export const LEVEL_NAMES = ['new', 'seen', 'familiar', 'strong', 'expert'];
```

and replace the import on line 2 with these two lines, so `cardId`,
`conceptFor`, and `numberWord` are all in scope:

```js
import { cardId, conceptFor } from './content.js';
import { numberWord } from './words.js';
```

- [ ] **Step 8: Add the rung constants and the card ordering**

Append to `app/logic/progress.js`:

```js
export const RUNG_KINDS = ['concept', 'group', 'species'];
export const RUNG_NAMES = { concept: 'shapes', group: 'genera', species: 'species' };

// A card at this level or higher counts toward a rung's waterline.
export const FAMILIAR = 2;

// A rung's own level is the mean of its cards, rounded. It is the same rule
// `unitNumber` uses for a unit, without the percent.
export function rollupLevel(levels) {
  if (levels.length === 0) return 0;
  const sum = levels.reduce((total, level) => total + level, 0);
  return Math.round(sum / levels.length);
}

function liveGenera(content) {
  const genera = new Set();
  for (const record of Object.values(content.species)) {
    if (!record.retired) genera.add(record.genus);
  }
  return [...genera].sort();
}

// The band order is the reading order. Concepts keep the order of
// concepts.json, so "the fifth of eight leaf shapes" stays true. Genera and
// species sort by genus, so the species band can be grouped by parent.
function orderedCards(content, channel, kind) {
  const find = (key) => content.cards[cardId(kind, channel, key)] ?? null;
  if (kind === 'concept') {
    return (content.concepts_by_channel[channel] ?? [])
      .map((concept) => find(concept.key))
      .filter(Boolean);
  }
  const genera = liveGenera(content);
  if (kind === 'group') return genera.map(find).filter(Boolean);
  const out = [];
  for (const genus of genera) {
    const symbols = Object.entries(content.species)
      .filter(([, record]) => !record.retired && record.genus === genus)
      .map(([symbol]) => symbol)
      .sort();
    for (const symbol of symbols) {
      const card = find(symbol);
      if (card) out.push(card);
    }
  }
  return out;
}
```

- [ ] **Step 9: Add `channelRung` and `channelRungs`**

Append to `app/logic/progress.js`:

```js
export function channelRung(content, states, channel, kind) {
  const cards = orderedCards(content, channel, kind);
  const rows = cards.map((card) => ({
    id: card.id,
    key: card.key,
    bucket: card.bucket,
    genus: kind === 'species' ? content.species[card.key].genus : null,
    level: cardLevel(states[card.id])
  }));
  const counts = [0, 0, 0, 0, 0];
  for (const row of rows) counts[row.level] += 1;
  const atFamiliar = rows.filter((row) => row.level >= FAMILIAR).length;
  return {
    channel,
    kind,
    name: RUNG_NAMES[kind],
    cards: rows,
    counts,
    total: rows.length,
    at_familiar: atFamiliar,
    share: rows.length === 0 ? 0 : atFamiliar / rows.length,
    level: rollupLevel(rows.map((row) => row.level))
  };
}

export function channelRungs(content, states, channel) {
  return RUNG_KINDS.map((kind) => channelRung(content, states, channel, kind));
}
```

- [ ] **Step 10: Add the leading concept, the claim, the tally, and the finding**

Append to `app/logic/progress.js`:

```js
// The channel's leading shape: the concept card that stands highest. A tie
// goes to the first one in concepts.json, so the answer never flickers.
export function leadingConcept(content, states, channel) {
  const rung = channelRung(content, states, channel, 'concept');
  if (rung.cards.length === 0) return null;
  let best = 0;
  for (let i = 1; i < rung.cards.length; i += 1) {
    if (rung.cards[i].level > rung.cards[best].level) best = i;
  }
  const row = rung.cards[best];
  const concept = conceptFor(content, channel, row.key);
  return {
    key: row.key,
    name: concept?.name ?? row.key,
    level: row.level,
    index: best,
    total: rung.cards.length
  };
}

export function channelClaim(content, states, channel) {
  const leading = leadingConcept(content, states, channel);
  if (!leading) return 'This channel holds no shape cards yet.';
  const species = channelRung(content, states, channel, 'species');
  if (species.total === 0) {
    return `${leading.name} sits at ${LEVEL_NAMES[leading.level]}. No species hangs off it yet.`;
  }
  const verdict = species.level >= leading.level ? 'keep up' : 'do not';
  return `${leading.name} sits at ${LEVEL_NAMES[leading.level]}. `
    + `The ${numberWord(species.total)} species behind it ${verdict}.`;
}

export function overallTally(content, states) {
  const rungs = content.channels.flatMap((channel) => channelRungs(content, states, channel));
  const add = (kind) => {
    const rows = rungs.filter((rung) => rung.kind === kind);
    return {
      at: rows.reduce((total, rung) => total + rung.at_familiar, 0),
      total: rows.reduce((total, rung) => total + rung.total, 0)
    };
  };
  return { shapes: add('concept'), genera: add('group'), species: add('species') };
}

export function overallFinding(content, states) {
  const tally = overallTally(content, states);
  const held = tally.shapes.total + tally.genera.total + tally.species.total;
  if (held === 0) return 'No cards are built yet.';
  const rungs = content.channels.flatMap((channel) => channelRungs(content, states, channel));
  const started = rungs.some((rung) => rung.counts.slice(1).some((count) => count > 0));
  if (!started) return 'Nothing is started yet. The shapes come first.';
  const share = (part) => (part.total === 0 ? 0 : part.at / part.total);
  const shapes = share(tally.shapes);
  const species = share(tally.species);
  if (shapes - species >= 0.1) return 'You know the shapes. Not the trees inside them.';
  if (species >= shapes) return 'The trees keep pace with the shapes.';
  return 'The shapes lead. The trees are close behind.';
}
```

- [ ] **Step 11: Fix the old level-name assertion**

In `tests/progress.test.js`, replace line 18:

```js
  assert.equal(LEVEL_NAMES[4], 'expert');
  assert.equal(LEVEL_NAMES[0], 'new');
```

- [ ] **Step 12: Run the tests**

Run: `npm test`
Expected: PASS, 192 tests, 0 failures. The suite holds 177 tests before this
task; `tests/words.test.js` adds four and `tests/rungs.test.js` adds eleven.
Every later task states what it adds rather than a total, so one extra test
written on the way does not make the plan wrong.

- [ ] **Step 13: Commit**

```bash
git add app/logic/words.js app/logic/progress.js tests/progress.test.js tests/rungs.test.js tests/words.test.js
git commit -m "feat(progress): level words and the per-channel rung rollups

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Species grouped by genus, and one concept's breakdown

**Files:**
- Modify: `app/logic/progress.js` (append)
- Test: `tests/rungs.test.js` (append)

**Interfaces:**
- Consumes, all already in scope inside `app/logic/progress.js`:
  - `channelRung(content, states, channel, kind) => Rung` — Task 1
  - `cardLevel(state) => number` — `app/logic/progress.js`
  - `cardId(kind, channel, key) => string` — `app/logic/content.js`
  - `conceptFor(content, channel, key) => { key, name, description } | null` — `app/logic/content.js`
- Produces:
  - `speciesByGenus(content, states, channel, conceptKey = null) => GenusGroup[]`, where `GenusGroup` is
    `{ genus, genus_common, level, has_card, species: SpeciesRow[] }`
    and `SpeciesRow` is `{ symbol, common, scientific, section, level }`
  - `conceptBreakdown(content, states, channel, conceptKey) => Breakdown | null`, where `Breakdown` is
    `{ channel, concept: { key, name, description }, has_card, level, due, genera: GenusGroup[] }`

- [ ] **Step 1: Write the failing test**

Append to `tests/rungs.test.js`:

```js
import { speciesByGenus, conceptBreakdown } from '../app/logic/progress.js';

test('the species of a channel group under their genus', () => {
  const states = { 'species:QURU:leaf': { tier: 'mc8', tier_passes: 0 } };
  const groups = speciesByGenus(content, states, 'leaf');
  assert.deepEqual(groups.map((g) => g.genus), ['Acer', 'Platanus', 'Quercus']);
  const oaks = groups.find((g) => g.genus === 'Quercus');
  assert.equal(oaks.genus_common, 'oak');
  assert.equal(oaks.has_card, true);
  assert.deepEqual(oaks.species.map((s) => s.symbol), ['QUGA', 'QURU']);
  const quru = oaks.species.find((s) => s.symbol === 'QURU');
  assert.equal(quru.common, 'Northern red oak');
  assert.equal(quru.scientific, 'Quercus rubra');
  assert.equal(quru.section, 'Lobatae');
  assert.equal(quru.level, 2);
});

test('a genus with no common name in the content falls back to the genus', () => {
  const maples = speciesByGenus(content, {}, 'leaf').find((g) => g.genus === 'Acer');
  assert.equal(maples.genus_common, 'Acer');
});

test('one concept breaks down into its genera and species', () => {
  const states = { 'concept:leaf:simple_lobed': { tier: 'inv', tier_passes: 0 } };
  const shape = conceptBreakdown(content, states, 'leaf', 'simple_lobed');
  assert.equal(shape.concept.name, 'Simple, lobed');
  assert.equal(shape.has_card, true);
  assert.equal(shape.level, 3);
  assert.deepEqual(shape.genera.map((g) => g.genus), ['Acer', 'Platanus', 'Quercus']);
});

test('the breakdown of a bark concept holds only the species in that bucket', () => {
  const papery = conceptBreakdown(content, {}, 'bark', 'papery');
  assert.deepEqual(papery.genera.map((g) => g.genus), ['Platanus']);
  const furrowed = conceptBreakdown(content, {}, 'bark', 'furrowed');
  assert.deepEqual(furrowed.genera[0].species.map((s) => s.symbol), ['QUGA', 'QURU']);
});

test('an unknown concept key gives back null', () => {
  assert.equal(conceptBreakdown(content, {}, 'leaf', 'no_such_shape'), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/rungs.test.js`
Expected: FAIL with `does not provide an export named 'speciesByGenus'`.

- [ ] **Step 3: Write the two functions**

Append to `app/logic/progress.js`:

```js
// The species band of a rung, cut into the parents it hangs from. With a
// concept key it holds only the species in that bucket; without one it holds
// the whole channel.
export function speciesByGenus(content, states, channel, conceptKey = null) {
  const rung = channelRung(content, states, channel, 'species');
  const rows = conceptKey === null
    ? rung.cards
    : rung.cards.filter((row) => row.bucket === conceptKey);
  const groups = [];
  for (const row of rows) {
    const record = content.species[row.key];
    let group = groups.find((item) => item.genus === record.genus);
    if (!group) {
      const groupCard = content.cards[cardId('group', channel, record.genus)] ?? null;
      group = {
        genus: record.genus,
        genus_common: record.genus_common ?? record.genus,
        level: groupCard ? cardLevel(states[groupCard.id]) : 0,
        has_card: Boolean(groupCard),
        species: []
      };
      groups.push(group);
    }
    group.species.push({
      symbol: row.key,
      common: record.common[0],
      scientific: record.scientific,
      section: record.section ?? null,
      level: row.level
    });
  }
  return groups;
}

export function conceptBreakdown(content, states, channel, conceptKey) {
  const concept = conceptFor(content, channel, conceptKey);
  if (!concept) return null;
  const card = content.cards[cardId('concept', channel, conceptKey)] ?? null;
  const state = card ? states[card.id] : null;
  return {
    channel,
    concept: { key: conceptKey, name: concept.name, description: concept.description },
    has_card: Boolean(card),
    level: card ? cardLevel(state) : 0,
    due: state?.due ?? null,
    genera: speciesByGenus(content, states, channel, conceptKey)
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, 0 failures, five tests more than the task before.

- [ ] **Step 5: Commit**

```bash
git add app/logic/progress.js tests/rungs.test.js
git commit -m "feat(progress): species by genus and one concept's breakdown

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The unit tree and the fold defaults

**Files:**
- Create: `app/logic/lessons.js`
- Test: `tests/lessons.test.js` (create)

**Interfaces:**
- Consumes:
  - `cardLevel(state) => number` — `app/logic/progress.js`
  - `rollupLevel(levels: number[]) => number` — `app/logic/progress.js`, Task 1
  - `unseenCount(cardIds: string[], states) => number` — `app/logic/progress.js`
  - `gateStatus(unitKey, content, states) => { open, parent_key, parent_card_count, at_level_2, fraction, needed_cards }` — `app/logic/progress.js`
  - `recommendUnit({ content, states, focus }) => { unit_key: string|null, next_closed: { unit_key, unit_name, parent_key, fraction, needed_cards } | null }` — `app/logic/session.js`
  - `content.units: Unit[]`, `Unit` is `{ key, name, channel, level, parent, bucket }`
  - `content.unit_cards: Record<string, string[]>` — the card ids of a unit
  - `content.cards[id].photos: Photo[]`, `Photo` is `{ hash, author, source, license, origin }`
- Produces:
  - `channelUnits(content, channel) => Unit[]`
  - `unitOrdinal(unitKey, content) => number` — the unit's 1-based place in its channel. Not `unitNumber`, which is the mean level as a percent.
  - `unitLevel(unitKey, content, states) => number`
  - `unitTree(content, states, channel) => Node[]`, where `Node` is
    `{ key, name, level, channel, card_count, new_count, rollup, open, opens_with, needed_cards, next_up, holds_next, inside_count, children: Node[] }`
  - `defaultOpenUnits(content, states, channel) => string[]`
  - `channelLessons(content, states, channel) => { channel, next_up_key, open_count, total_count, depths: Depth[] }`, `Depth` is `{ level, name, units: [{ key, name, open, next_up }] }`
  - `unitThumb(content, unitKey) => { card_id, kind, key, channel, photo } | null`

- [ ] **Step 1: Write the failing test**

Create `tests/lessons.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers/fixture.js';
import { loadContent } from '../app/logic/content.js';
import {
  channelUnits, unitOrdinal, unitLevel, unitTree,
  defaultOpenUnits, channelLessons, unitThumb
} from '../app/logic/lessons.js';

const { content } = loadContent(loadFixture());

// The gate on the fixture opens the level-2 unit once the one leaf concept
// card reaches level 2, so this state opens the tree below it.
const OPEN_LEAF = { 'concept:leaf:simple_lobed': { tier: 'mc8', tier_passes: 0 } };

test('a channel keeps its units in the order of units.json', () => {
  assert.deepEqual(channelUnits(content, 'leaf').map((u) => u.key), [
    'leaf_types', 'simple_lobed_genus', 'simple_lobed_white_oaks_co',
    'simple_lobed_red_oaks_co', 'simple_lobed_maples_co',
    'simple_lobed_other_co', 'quga_varieties'
  ]);
  assert.deepEqual(channelUnits(content, 'bark').map((u) => u.key), ['bark_types']);
});

test('the unit ordinal is the place in the channel, counting from one', () => {
  assert.equal(unitOrdinal('leaf_types', content), 1);
  assert.equal(unitOrdinal('simple_lobed_red_oaks_co', content), 4);
  assert.throws(() => unitOrdinal('no_such_unit', content), /unknown unit no_such_unit/);
});

test('the unit level is the mean level of its cards, rounded', () => {
  assert.equal(unitLevel('leaf_types', content, {}), 0);
  assert.equal(unitLevel('leaf_types', content, OPEN_LEAF), 2);
  assert.throws(() => unitLevel('no_such_unit', content, {}), /unknown unit no_such_unit/);
});

test('the tree nests every unit under its parent', () => {
  const tree = unitTree(content, {}, 'leaf');
  assert.equal(tree.length, 1);
  assert.equal(tree[0].key, 'leaf_types');
  assert.equal(tree[0].level, 1);
  assert.equal(tree[0].inside_count, 1);
  const genus = tree[0].children[0];
  assert.equal(genus.key, 'simple_lobed_genus');
  assert.equal(genus.inside_count, 4);
  assert.deepEqual(genus.children.map((n) => n.key), [
    'simple_lobed_white_oaks_co', 'simple_lobed_red_oaks_co',
    'simple_lobed_maples_co', 'simple_lobed_other_co'
  ]);
});

test('a closed unit says which unit opens it and how many cards are left', () => {
  const tree = unitTree(content, {}, 'leaf');
  const genus = tree[0].children[0];
  assert.equal(genus.open, false);
  assert.equal(genus.opens_with, 'Leaf types');
  assert.equal(genus.needed_cards, 1);
  const open = unitTree(content, OPEN_LEAF, 'leaf')[0].children[0];
  assert.equal(open.open, true);
  assert.equal(open.opens_with, null);
});

test('the next-up unit is marked, and so is every branch above it', () => {
  const tree = unitTree(content, OPEN_LEAF, 'leaf');
  assert.equal(tree[0].next_up, false);
  assert.equal(tree[0].holds_next, true);
  const genus = tree[0].children[0];
  assert.equal(genus.next_up, true);
  assert.equal(genus.holds_next, false);
});

test('the new count and the card count come off the unit cards', () => {
  const tree = unitTree(content, OPEN_LEAF, 'leaf');
  assert.equal(tree[0].card_count, 1);
  assert.equal(tree[0].new_count, 0);
  assert.equal(tree[0].children[0].new_count, tree[0].children[0].card_count);
});

test('level 1 opens by default, and so does the branch holding the next unit', () => {
  assert.deepEqual(defaultOpenUnits(content, OPEN_LEAF, 'leaf'), ['leaf_types']);
  const deeper = {
    ...OPEN_LEAF,
    'group:leaf:Quercus': { tier: 'mc8', tier_passes: 0 },
    'group:leaf:Acer': { tier: 'mc8', tier_passes: 0 },
    'group:leaf:Platanus': { tier: 'mc8', tier_passes: 0 }
  };
  assert.deepEqual(defaultOpenUnits(content, deeper, 'leaf'),
    ['leaf_types', 'simple_lobed_genus']);
});

test('one channel summarises as three depths of unit squares', () => {
  const summary = channelLessons(content, OPEN_LEAF, 'leaf');
  assert.equal(summary.channel, 'leaf');
  assert.equal(summary.next_up_key, 'simple_lobed_genus');
  assert.equal(summary.total_count, 7);
  assert.equal(summary.open_count, 2);
  assert.deepEqual(summary.depths.map((d) => d.name), ['shapes', 'genera', 'species']);
  assert.deepEqual(summary.depths[0].units.map((u) => u.key), ['leaf_types']);
  assert.equal(summary.depths[1].units[0].next_up, true);
  // A level-4 variety unit has no depth of its own, so it joins the species row.
  assert.deepEqual(summary.depths[2].units.map((u) => u.key), [
    'simple_lobed_white_oaks_co', 'simple_lobed_red_oaks_co',
    'simple_lobed_maples_co', 'simple_lobed_other_co', 'quga_varieties'
  ]);
});

test('the unit thumbnail is the first card in the unit that carries a photo', () => {
  const thumb = unitThumb(content, 'simple_lobed_red_oaks_co');
  assert.equal(thumb.kind, 'species');
  assert.equal(thumb.key, 'QURU');
  assert.equal(thumb.channel, 'leaf');
  assert.match(thumb.photo.hash, /^[0-9a-f]{64}$/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/lessons.test.js`
Expected: FAIL with `Cannot find module` for `../app/logic/lessons.js`.

- [ ] **Step 3: Write the module**

Create `app/logic/lessons.js`:

```js
// The lessons tree, the fold defaults, and the per-channel unit summary. Pure.
import { cardLevel, rollupLevel, gateStatus, unseenCount } from './progress.js';
import { recommendUnit } from './session.js';

const DEPTH_NAMES = { 1: 'shapes', 2: 'genera', 3: 'species' };

export function channelUnits(content, channel) {
  return content.units.filter((unit) => unit.channel === channel);
}

function unitOr(content, unitKey) {
  const unit = content.units.find((item) => item.key === unitKey);
  if (!unit) throw new Error(`unknown unit ${unitKey}`);
  return unit;
}

// The place of a unit in its channel, counting from one. The home screen
// prints it as "Unit 5". It is not `unitNumber`, which is a percent.
export function unitOrdinal(unitKey, content) {
  const unit = unitOr(content, unitKey);
  return channelUnits(content, unit.channel).findIndex((item) => item.key === unitKey) + 1;
}

export function unitLevel(unitKey, content, states) {
  unitOr(content, unitKey);
  const ids = content.unit_cards[unitKey] ?? [];
  return rollupLevel(ids.map((id) => cardLevel(states[id])));
}

function buildNode(content, states, unit, nextUpKey) {
  const ids = content.unit_cards[unit.key] ?? [];
  const gate = gateStatus(unit.key, content, states);
  const children = content.units
    .filter((item) => item.parent === unit.key)
    .map((child) => buildNode(content, states, child, nextUpKey));
  const parent = gate.parent_key
    ? content.units.find((item) => item.key === gate.parent_key)
    : null;
  return {
    key: unit.key,
    name: unit.name,
    level: unit.level,
    channel: unit.channel,
    card_count: ids.length,
    new_count: unseenCount(ids, states),
    rollup: unitLevel(unit.key, content, states),
    open: gate.open,
    opens_with: gate.open ? null : (parent?.name ?? null),
    needed_cards: gate.needed_cards,
    next_up: unit.key === nextUpKey,
    holds_next: children.some((child) => child.next_up || child.holds_next),
    inside_count: children.length,
    children
  };
}

export function unitTree(content, states, channel) {
  const nextUpKey = recommendUnit({ content, states, focus: channel }).unit_key;
  return channelUnits(content, channel)
    .filter((unit) => unit.parent === null)
    .map((unit) => buildNode(content, states, unit, nextUpKey));
}

// The fold the app opens with. A level-1 row shows its children, so the
// level-2 units are visible. A level-2 row stays folded unless the next-up
// unit sits inside it. A row with no children is never in the list. A row
// that is itself next up does not open: the branch above it does, which is
// what puts it on screen.
export function defaultOpenUnits(content, states, channel) {
  const open = [];
  const walk = (node) => {
    if (node.children.length > 0 && (node.level <= 1 || node.holds_next)) {
      open.push(node.key);
    }
    node.children.forEach(walk);
  };
  unitTree(content, states, channel).forEach(walk);
  return open;
}

// One block on the lessons page: three rows of unit squares, one row per
// depth. A level-4 variety unit has no depth of its own, so it joins the
// species row rather than disappearing.
export function channelLessons(content, states, channel) {
  const units = channelUnits(content, channel);
  const nextUpKey = recommendUnit({ content, states, focus: channel }).unit_key;
  const depthOf = (unit) => Math.min(unit.level, 3);
  const depths = [1, 2, 3].map((level) => ({
    level,
    name: DEPTH_NAMES[level],
    units: units.filter((unit) => depthOf(unit) === level).map((unit) => ({
      key: unit.key,
      name: unit.name,
      open: gateStatus(unit.key, content, states).open,
      next_up: unit.key === nextUpKey
    }))
  }));
  const openCount = depths
    .flatMap((depth) => depth.units)
    .filter((unit) => unit.open).length;
  return {
    channel,
    next_up_key: nextUpKey,
    open_count: openCount,
    total_count: units.length,
    depths
  };
}

// The small print beside a unit: the first card in the unit that has a photo.
export function unitThumb(content, unitKey) {
  for (const id of content.unit_cards[unitKey] ?? []) {
    const card = content.cards[id];
    if (card && card.photos.length > 0) {
      return {
        card_id: id,
        kind: card.kind,
        key: card.key,
        channel: card.channel,
        photo: card.photos[0]
      };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, 0 failures, ten tests more than the task before.

- [ ] **Step 5: Commit**

```bash
git add app/logic/lessons.js tests/lessons.test.js
git commit -m "feat(lessons): the unit tree, the fold defaults, and the channel summary

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The glyph sprite and the glyph module

**Files:**
- Create: `app/ui/sprite.svg`
- Create: `app/ui/glyphs.js`
- Test: `tests/glyphs.test.js` (create)
- Read: `docs/design/2026-09-24-specimen-plate/mockup-final.html:659-834` (the sprite to lift)

**Interfaces:**
- Consumes: `content.species` (for `genus` and `concepts`) and a card object `{ kind, channel, key }` from `content.cards`.
- Produces:
  - `SPRITE_PATH: string` — `'app/ui/sprite.svg'`
  - `SPRITE_ID: string` — `'dendro-sprite'`
  - `CHANNEL_GLYPHS: Record<string, Record<string, string>>`
  - `GENUS_GLYPHS: Record<string, string>`
  - `FALLBACK_GLYPH: string` — `'lf-entire'`
  - `conceptGlyph(channel, conceptKey) => string | null`
  - `genusGlyph(genus, content) => string`
  - `glyphIdFor(card, content) => string`
  - `glyph(id, level, sizeClass, options?) => SVGSVGElement` — `options` is `{ ghost?: boolean }`
  - `injectSprite(path?) => Promise<boolean>`

**How the mark is chosen.** A card's mark is the most specific object the card
is about:

- A concept card carries its own shape on its own channel: a leaf shape for a
  leaf concept, a bark plate for a bark concept, a fruit for a fruit concept.
  The concept key picks the symbol through `CHANNEL_GLYPHS`.
- A genus card, a species card, and a variety card all carry that genus's
  leaf, on every channel, because a genus is a tree and not a channel. This
  is what the mockup prints in the bark and fruit bands. `GENUS_GLYPHS` holds
  the three genera in the content today. A genus outside the table falls back
  to the leaf-concept glyph of one of its live species, then to
  `FALLBACK_GLYPH`.

- [ ] **Step 1: Lift the sprite out of the mockup**

Run:

```bash
{ echo '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">'; \
  sed -n '660,833p' docs/design/2026-09-24-specimen-plate/mockup-final.html; \
  echo '</svg>'; } > app/ui/sprite.svg
```

- [ ] **Step 2: Check the sprite holds all 24 symbols**

Run: `grep -o 'id="[a-z-]*"' app/ui/sprite.svg | sort`
Expected, 24 lines, in this set:
`bk-furrowed bk-papery bk-plated bk-shaggy bk-smooth bk-warty`
`fr-acorn fr-ball fr-berry fr-capsule fr-cone fr-nut fr-pod fr-samara`
`lf-entire lf-fan lf-maple lf-needle lf-oak lf-palmate lf-pinnate lf-plat lf-scale lf-tooth`

- [ ] **Step 3: Write the failing test**

Create `tests/glyphs.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFixture } from './helpers/fixture.js';
import { loadContent } from '../app/logic/content.js';
import {
  CHANNEL_GLYPHS, GENUS_GLYPHS, FALLBACK_GLYPH,
  conceptGlyph, genusGlyph, glyphIdFor
} from '../app/ui/glyphs.js';

const { content } = loadContent(loadFixture());
const SPRITE = readFileSync(new URL('../app/ui/sprite.svg', import.meta.url), 'utf8');

test('every glyph the maps name is a symbol in the sprite', () => {
  const named = new Set([
    ...Object.values(CHANNEL_GLYPHS).flatMap((map) => Object.values(map)),
    ...Object.values(GENUS_GLYPHS),
    FALLBACK_GLYPH
  ]);
  for (const id of named) {
    assert.ok(SPRITE.includes(`id="${id}"`), `the sprite has no symbol ${id}`);
  }
});

test('every concept key in the content has a glyph', () => {
  for (const concept of content.concepts) {
    assert.ok(conceptGlyph(concept.channel, concept.key),
      `no glyph for ${concept.channel}/${concept.key}`);
  }
});

test('a concept card carries its own shape on its own channel', () => {
  assert.equal(glyphIdFor(content.cards['concept:leaf:simple_lobed'], content), 'lf-oak');
  assert.equal(glyphIdFor(content.cards['concept:bark:furrowed'], content), 'bk-furrowed');
  assert.equal(glyphIdFor(content.cards['concept:fruit:acorn'], content), 'fr-acorn');
});

test('a genus, species, or variety card carries the genus leaf', () => {
  assert.equal(glyphIdFor(content.cards['group:leaf:Acer'], content), 'lf-maple');
  assert.equal(glyphIdFor(content.cards['group:bark:Quercus'], content), 'lf-oak');
  assert.equal(glyphIdFor(content.cards['species:PLOC:bark'], content), 'lf-plat');
  assert.equal(glyphIdFor(content.cards['species:ACPL:fruit'], content), 'lf-maple');
  assert.equal(glyphIdFor(content.cards['variety:QUGAG:leaf'], content), 'lf-oak');
});

test('a genus outside the table falls back to its leaf concept', () => {
  const stub = {
    species: {
      LIQ: { genus: 'Liquidambar', concepts: { leaf: 'simple_lobed' }, varieties: [] }
    }
  };
  assert.equal(genusGlyph('Liquidambar', stub), 'lf-oak');
  assert.equal(genusGlyph('Nothosuchus', stub), FALLBACK_GLYPH);
  assert.equal(genusGlyph(null, stub), FALLBACK_GLYPH);
});

test('an unknown concept key falls back rather than throwing', () => {
  assert.equal(conceptGlyph('leaf', 'no_such_shape'), null);
  assert.equal(conceptGlyph('no_such_channel', 'needles'), null);
  const card = { kind: 'concept', channel: 'leaf', key: 'no_such_shape' };
  assert.equal(glyphIdFor(card, content), FALLBACK_GLYPH);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test tests/glyphs.test.js`
Expected: FAIL with `Cannot find module` for `../app/ui/glyphs.js`.

- [ ] **Step 5: Write the glyph module**

Create `app/ui/glyphs.js`:

```js
// The pressed-object marks: one sprite of <symbol> elements, one <use> per
// mark, and the maps that pick which symbol a card gets. The level is a class
// on the <svg>, so the fill and the outline both follow it.
//
// The map functions touch no DOM, so `node --test` covers them.

export const SPRITE_PATH = 'app/ui/sprite.svg';
export const SPRITE_ID = 'dendro-sprite';

const SVG_NS = 'http://www.w3.org/2000/svg';

// The glyph sizes the sheet defines. A mark is a picture at a fixed size, so
// these are px classes and never follow the root size.
export const GLYPH_SIZES = ['s20', 's24', 's26', 's28', 's30', 's32', 's34', 's40', 's86'];

// One symbol per concept key, per channel.
export const CHANNEL_GLYPHS = {
  leaf: {
    needles: 'lf-needle',
    scale_like: 'lf-scale',
    simple_entire: 'lf-entire',
    simple_toothed: 'lf-tooth',
    simple_lobed: 'lf-oak',
    pinnately_compound: 'lf-pinnate',
    palmately_compound: 'lf-palmate',
    fan_strap: 'lf-fan'
  },
  bark: {
    smooth: 'bk-smooth',
    furrowed: 'bk-furrowed',
    plated: 'bk-plated',
    shaggy: 'bk-shaggy',
    papery: 'bk-papery',
    warty: 'bk-warty'
  },
  fruit: {
    samara: 'fr-samara',
    acorn: 'fr-acorn',
    nut: 'fr-nut',
    pod: 'fr-pod',
    berry: 'fr-berry',
    capsule: 'fr-capsule',
    cone: 'fr-cone',
    ball: 'fr-ball'
  }
};

// A genus is a tree, not a channel, so a genus keeps one leaf on every
// channel. Add a row here when the content adds a genus.
export const GENUS_GLYPHS = {
  Quercus: 'lf-oak',
  Acer: 'lf-maple',
  Platanus: 'lf-plat'
};

export const FALLBACK_GLYPH = 'lf-entire';

export function conceptGlyph(channel, conceptKey) {
  return CHANNEL_GLYPHS[channel]?.[conceptKey] ?? null;
}

export function genusGlyph(genus, content) {
  const known = GENUS_GLYPHS[genus];
  if (known) return known;
  for (const record of Object.values(content.species ?? {})) {
    if (record.retired || record.genus !== genus) continue;
    const leaf = conceptGlyph('leaf', record.concepts?.leaf);
    if (leaf) return leaf;
  }
  return FALLBACK_GLYPH;
}

function genusOfVariety(content, varietyKey) {
  for (const record of Object.values(content.species ?? {})) {
    if ((record.varieties ?? []).some((variety) => variety.key === varietyKey)) {
      return record.genus;
    }
  }
  return null;
}

export function glyphIdFor(card, content) {
  if (card.kind === 'concept') {
    return conceptGlyph(card.channel, card.key) ?? FALLBACK_GLYPH;
  }
  if (card.kind === 'group') return genusGlyph(card.key, content);
  if (card.kind === 'species') {
    return genusGlyph(content.species[card.key]?.genus ?? null, content);
  }
  return genusGlyph(genusOfVariety(content, card.key), content);
}

// One mark. `level` fills it on the five-step ramp; `ghost` draws a pressed
// sheet lying behind another one.
export function glyph(id, level, sizeClass, options = {}) {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', '0 0 112 140');
  const fill = options.ghost ? 'gh' : `v${Math.max(0, Math.min(4, level))}`;
  node.setAttribute('class', `mk ${sizeClass} ${fill}`);
  node.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  node.append(use);
  return node;
}

// The sprite goes into the document once, so `<use href="#lf-oak">` resolves.
// An external file reference on <use> does not work in every browser, so the
// app fetches the file and injects it. A failure leaves the marks empty and
// every other part of the screen intact, so this never throws.
export async function injectSprite(path = SPRITE_PATH) {
  if (document.getElementById(SPRITE_ID)) return true;
  try {
    const response = await fetch(path);
    if (!response.ok) return false;
    const holder = document.createElement('div');
    holder.id = SPRITE_ID;
    holder.setAttribute('aria-hidden', 'true');
    holder.innerHTML = await response.text();
    document.body.prepend(holder);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS. `tests/glyphs.test.js` reports 6 tests, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add app/ui/sprite.svg app/ui/glyphs.js tests/glyphs.test.js
git commit -m "feat(ui): the leaf, bark, and fruit glyph sprite and its maps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The stylesheet, the fonts, and the boot

**Files:**
- Modify: `app/style.css` (replaced)
- Modify: `index.html:1-19`
- Modify: `app/main.js:57-73` (`showError`), `app/main.js:95-135` (`start`)
- Read: `docs/design/2026-09-24-specimen-plate/mockup-final.html:8-655` (the `<style>` block to port)

**Interfaces:**
- Consumes: `injectSprite(path?) => Promise<boolean>` from `app/ui/glyphs.js`, Task 4.
- Produces: the token set on `:root` (`--paper --mount --ink --ink-soft --moss --bark --lichen --sap --m0`…`--m4 --fr --lit --gut --col --hair`) and every class the later screen tasks use. No JavaScript interface.

After this task the app looks unstyled in places, because the screens still
build the old markup. The legacy block at the end of the sheet keeps them
readable. Task 17 deletes that block.

**The old `<nav>` stays until Task 8.** Task 8 is the first task that prints
the new running foot, so removing the nav here would leave three commits with
no way to reach Progress or Settings by hand. `index.html` keeps the nav, the
legacy block keeps its `.nav` rules, and `main.js` keeps the line that shows
it. Task 8 takes all three out in one move.

**The fonts need the network.** Fraunces and Literata come from Google Fonts,
so an offline run falls back to the browser's serif, which on Windows is
Georgia. The layout still holds, because every size is in rem and the display
sizes are set on the element and not on the family. Self-hosting the two
families is out of scope for this plan.

- [ ] **Step 1: Seed the new sheet from the mockup**

The old sheet is parked in `out/`, which is a working directory in the repo
and not a system temp directory. Windows has no `/tmp`, and `out/` is in
`.gitignore` by the end of Task 17, so the parked copy is never committed.

Run:

```bash
mkdir -p out
cp app/style.css out/legacy.css
sed -n '9,654p' docs/design/2026-09-24-specimen-plate/mockup-final.html > app/style.css
wc -l out/legacy.css app/style.css
```

Expected: `out/legacy.css` has 121 lines and `app/style.css` has 646. A
different count on the second file means the mockup's `<style>` block has
moved; find it with `grep -n '<style>\|</style>' docs/design/2026-09-24-specimen-plate/mockup-final.html`
and take the lines between the two tags.

- [ ] **Step 2: Replace the mockup's page rules with the app's**

In `app/style.css`, replace the `/* ---------- paper ---------- */` block's
body rule and the four `.screen` rules (the mockup's lines for
`body{margin:0; width:390px; …}`, `.screen{display:none;}`,
`.screen:target{display:block;}`, `body:not(:has(.screen:target)) #session{…}`,
and `.screen{min-height:844px; …}`) with the block below.

Three font axes run through the sheet, and this is the first rule that sets
one. They are variable-font axes, which means one font file that the browser
can tune rather than a separate file per weight:

- `opsz` is optical size. A serif drawn for 14 px needs thicker strokes and
  wider spacing than the same serif at 44 px. The value is the size in px the
  letter shapes are drawn for, so a rule sets `opsz` to roughly the size it
  prints at.
- `SOFT` softens the corners of Fraunces. `0` is the crisp end.
- `WONK` turns on Fraunces's alternate letter shapes, the swung `g` and the
  curled `y`. `1` is on, and the sheet uses it on display sizes only.

```css
* { box-sizing: border-box; }

body{
  margin:0 auto; max-width:430px;
  color:var(--ink);
  font-family:var(--lit);
  font-size:1.0625rem; line-height:1.6;
  font-variation-settings:"opsz" 17;
  background-color:var(--paper);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.13'/%3E%3C/svg%3E");
  background-blend-mode:multiply;
  -webkit-font-smoothing:antialiased;
}

/* The app renders one screen into #app. The column runs the height of the
   phone so the running foot can sit at the bottom of a short page. */
#app{
  display:flex; flex-direction:column;
  min-height:100dvh;
  padding:0 var(--gut) 40px;
  overflow-x:clip;
}

/* The sprite is in the document but never drawn. */
#dendro-sprite{position:absolute; width:0; height:0; overflow:hidden;}
```

- [ ] **Step 3: Move the reveal motion off `:target`**

The app has no `:target`, so in the
`@media (prefers-reduced-motion:no-preference)` block replace the five
`#reveal:target …` selectors with the class the reveal task sets:

```css
  .reveal .verdict-wrap{animation:rise .26s ease-out both;}
  .reveal .pair-head i{animation:ink .3s .1s ease-out both; transform-origin:left;}
  .reveal .pl-a img{animation:press .38s .06s ease-out both;}
  .reveal .pl-b img{animation:press .38s .2s ease-out both;}
  .reveal .pair-head .no b{animation:strike .3s .34s ease-out both;}
```

- [ ] **Step 4: Append the rules the live app needs and the mockup lacks**

Append to `app/style.css`:

```css
/* =======================================================================
   THE LIVE APP

   The mockup prints anchors where the app needs real controls, and it never
   renders a banner, an error, a typed answer, a photo key, or a summary.
   These rules add exactly those, in the same system.
   ======================================================================= */

/* A plate with no crop class still fills its column. The `.pl-*` rules above
   set their own width and a negative margin, which is what crops the scan, so
   this rule must not reach them: `.plate img` and `.pl-hero img` weigh the
   same and this one comes later, which would reset the width and leave the
   negative margin behind, shifting every cropped plate up and left. */
.plate:not([class*="pl-"]) img{width:100%;}

/* A plate whose treatment has not been measured yet draws nothing. The
   measurement needs the image loaded, so without this every bright scan
   paints once as a field plate and snaps to a print a frame later, which on
   the session hero is a visible flash. The figure keeps its box, so nothing
   moves when the image appears. */
.plate.measuring img{visibility:hidden;}

/* The running foot sits at the bottom of a short page. `.footnav` carries the
   36px clearance in its own top margin, so the pusher adds none. */
.footpush{flex:1 0 0; min-height:0;}

/* A control that acts is a button; a control that moves you is a link. The
   reset is wrapped in `:where()`, which weighs nothing, so `.btn`, `.pick`,
   and `.startb` above keep their family, their size, and their 54px line
   height. Without the wrapper `button.btn` would outweigh `.btn` and
   `font:inherit` would strip the display face off every button. */
:where(button.pick, button.btn, button.startb, button.choice-btn){
  appearance:none; -webkit-appearance:none; border:0; font:inherit; cursor:pointer;
}
button.pick{text-align:left; width:100%;}
button.btn{width:100%; padding:0;}
.btn.ghost{background:none; color:var(--moss); box-shadow:inset 0 0 0 1.5px var(--moss);}
.btn.ghost:active{background:rgba(58,90,60,.14);}
.btnrow{display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:26px;}
.btnrow .btn{margin-top:0;}

/* I guessed: a real checkbox under the printed box */
.guessed{position:relative;}
.guessed input{position:absolute; inset:0; width:100%; height:100%; margin:0;
  opacity:0; cursor:pointer;}
.guessed input:checked ~ .box{background:var(--moss); border-color:var(--moss);}
.guessed input:focus-visible ~ .box{outline:2px solid var(--moss); outline-offset:3px;}

/* the typed format */
.typed{display:flex; flex-wrap:wrap; gap:9px; margin:12px 0 0;}
.typed input{flex:1 1 10rem; min-height:56px; padding:0 15px; box-sizing:border-box;
  font:inherit; font-family:var(--fr); color:var(--ink);
  background:rgba(201,210,180,.46); border:0; border-bottom:2px solid var(--moss);
  border-radius:2px;}
.typed input:focus-visible{outline:2px solid var(--moss); outline-offset:2px;}
.typed .btn{flex:0 0 auto; width:auto; min-width:104px; margin:0; padding:0 18px;}

/* the inverted format: pick the photo, four plates at one scale */
.invkey{display:grid; grid-template-columns:1fr 1fr; gap:9px; margin:12px 0 0;}
.invkey button{appearance:none; border:0; padding:0; background:none; cursor:pointer;
  min-height:44px;}
.invkey .plate{aspect-ratio:1/1;}
.invkey button:focus-visible{outline:2px solid var(--moss); outline-offset:2px;}

/* the session summary, and the summary the Leave link shows */
.sumrow{display:flex; align-items:baseline; justify-content:space-between; gap:12px;
  min-height:44px; padding:7px 0; border-bottom:1px solid var(--hair);}
.sumrow:last-child{border-bottom:0;}
.sumrow .sk{font-size:1rem; color:var(--bark);}
.sumrow .sv{font-family:var(--fr); font-weight:500; font-size:calc(9.5px + 0.59375rem);
  font-variation-settings:"opsz" 26;}
.misslist{margin:16px 0 0; padding:0; list-style:none;}
.misslist li{padding:9px 0; border-bottom:1px solid var(--hair); font-size:1rem;
  line-height:1.45;}
.misslist li:last-child{border-bottom:0;}

/* The head of a session. `Leave` is a word, about 38px wide, so it needs a
   floor on the width as well as on the height. The text stays at the left
   edge of that 44px target rather than centring inside it. */
.head .leave{min-width:44px; justify-content:flex-start;}

/* the banner and the error panel: the app's two failure surfaces */
.banner{margin:0; padding:13px var(--gut); background:var(--mount);
  border-bottom:3px solid var(--sap); font-size:0.9375rem; line-height:1.45;
  color:var(--ink);}
/* The error panel is a mounted panel like `.finding`, so it runs to both
   edges of the phone. Without the negative margins it sits 22px inside them
   and reads as a different kind of object. */
.error{margin:24px calc(var(--gut)*-1) 0; padding:18px var(--gut);
  background:var(--mount); border-left:3px solid var(--sap);}
.error h1{font-family:var(--fr); font-weight:400; font-size:calc(18px + 1.125rem);
  line-height:1.03; font-variation-settings:"opsz" 144,"SOFT" 0,"WONK" 1;
  letter-spacing:-.018em; margin:0;}
.error ul{margin:12px 0 0; padding-left:1.1rem; font-size:1rem; line-height:1.5;}
.error .placement{margin-right:18px;}

/* one printed note, for a state that is a fact and not an error */
.note{margin:16px 0 0; padding:13px 15px; background:var(--mount);
  border-left:3px solid var(--bark); font-size:1rem; line-height:1.5;}

/* =======================================================================
   LEGACY

   The rules the screens that have not been rebuilt yet still use. Each
   screen takes its own rules out as it is rebuilt, and the last one takes
   out whatever is left, along with this comment.
   ======================================================================= */
```

- [ ] **Step 5: Append the old sheet as the legacy block**

Run:

```bash
tail -n +14 out/legacy.css >> app/style.css
grep -c "" app/style.css
```

Expected: about 830 lines.

`tail -n +14` drops the old `:root` token block, which the new tokens
replace, and keeps every class rule from `* { box-sizing: border-box; }` down.
Then delete the duplicate `* { box-sizing: border-box; }` and the `body`,
`main`, `h1`, `h2`, `.banner`, and `.error` rules from the legacy block,
because the new sheet above owns those selectors.

Keep `.nav` and `.nav a`. The new sheet claims neither, the old nav is still
in `index.html`, and Task 8 takes the rules out when it takes the nav out.

- [ ] **Step 6: Rewrite `index.html`**

Replace the whole of `index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dendro</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..700&display=swap" rel="stylesheet">
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

Only the two font links are new. The old `<nav>` stays until Task 8 prints
the running foot, so the app is navigable at every commit. The error panel
carries its own way out either way, so Settings stays reachable when the
content fails.

- [ ] **Step 7: Give the error panel a way out**

In `app/main.js`, replace `showError` (lines 57 to 73) with:

```js
// A content failure must not lock the user out of Settings, where the export
// button rescues the progress that is already stored.
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
  const settings = document.createElement('a');
  settings.className = 'placement';
  settings.href = '#/settings';
  settings.textContent = 'Settings';
  const home = document.createElement('a');
  home.className = 'placement';
  home.href = '#/';
  home.textContent = 'Home';
  box.append(settings, home);
  root.append(box);
}
```

- [ ] **Step 8: Inject the sprite at boot**

In `app/main.js`, add to the imports at the top:

```js
import { injectSprite } from './ui/glyphs.js';
```

and in `start()`, directly under the line
`document.getElementById('nav').hidden = false;`, add:

```js
  // The sprite holds every mark the screens draw. It goes in before the first
  // render and never throws, so a failed fetch costs the marks and nothing else.
  await injectSprite();
```

Leave the nav line and its comment where they are. Task 8 removes both.

- [ ] **Step 9: Check the sheet parses and the page loads**

Run: `python -m http.server 8000` in one terminal, then in another:

```bash
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' http://localhost:8000/app/style.css
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' http://localhost:8000/app/ui/sprite.svg
```

Expected: `200` and a non-zero size on both lines.

- [ ] **Step 10: Check the paper and the sprite in a browser**

Open `http://localhost:8000/?content=dev#/`.
Expected: a cream page, serif type, the old nav still at the top, no console
error, and
`document.getElementById('dendro-sprite').querySelectorAll('symbol').length`
returns `24` in the console.

- [ ] **Step 11: Run the tests**

Run: `npm test`
Expected: PASS, 0 failures, no change in count. This task touches the sheet,
the page, and the boot, none of which `node --test` covers, so a change in
the count means something else moved.

- [ ] **Step 12: Commit**

```bash
git add app/style.css index.html app/main.js
git commit -m "feat(ui): the specimen-plate stylesheet, the fonts, and the sprite at boot

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The shared DOM helpers

**Files:**
- Create: `app/ui/dom.js`, `app/ui/chrome.js`, `app/ui/plate.js`
- Test: `tests/ui.test.js` (create)

**Interfaces:**
- Consumes:
  - `LEVEL_NAMES: string[]` — `app/logic/progress.js`, Task 1
  - `imageUrl(photo, base) => string` — `app/logic/content.js`
- Produces:
  - `app/ui/dom.js`: `el(tag, className?, text?) => HTMLElement`,
    `link(href, className?, text?) => HTMLAnchorElement`,
    `srOnly(text) => HTMLSpanElement`
  - `app/ui/chrome.js`: `FOOT_ITEMS`, `footNav(current) => DocumentFragment`,
    `trail(parts) => HTMLElement` where `parts` is
    `Array<{ text: string, href?: string }>`,
    `tick(className?) => HTMLElement`,
    `rampClasses(level, lost?) => string[]`,
    `ramp(level, options?) => HTMLElement` where `options` is
    `{ large?: boolean, dim?: boolean, lost?: boolean }`,
    `levelWord(level) => HTMLElement`
  - `app/ui/plate.js`: `PRINT_THRESHOLD: number`,
    `plateTreatment(photo) => 'print'|'field'`,
    `plate(photo, options) => HTMLElement` where `options` is
    `{ image_base, alt, shape, bleed?, lift?, soft?, mono?, onError? }` and
    `onError` is `(figure: HTMLElement, photo) => void`,
    `credit(photo, lead?) => HTMLParagraphElement`

**The four shape flags, glossed once.** Each one is a class the mockup's
sheet already defines, and `plate` only puts it on the figure:

- `bleed` — the figure runs to both edges of the phone, past the 22 px gutter.
- `lift` — the scan prints lighter, so a thumbnail holds up on a mounted panel.
- `soft` — the dissolve on the four edges is wider and gentler.
- `mono` — the colour comes out and the contrast is held back, for bark.

- [ ] **Step 1: Write the failing test**

Create `tests/ui.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rampClasses } from '../app/ui/chrome.js';
import { PRINT_THRESHOLD, plateTreatment } from '../app/ui/plate.js';

test('the ramp fills one square per level', () => {
  assert.deepEqual(rampClasses(0), ['', '', '', '', '']);
  assert.deepEqual(rampClasses(1), ['f1', '', '', '', '']);
  assert.deepEqual(rampClasses(2), ['f1', 'f2', '', '', '']);
  assert.deepEqual(rampClasses(3), ['f1', 'f2', 'f3', '', '']);
});

test('expert fills the fifth square too, so it reads as full', () => {
  assert.deepEqual(rampClasses(4), ['f1', 'f2', 'f3', 'f4', 'f4']);
});

test('a lost square marks the level the card fell from', () => {
  assert.deepEqual(rampClasses(1, true), ['f1', 'lost', '', '', '']);
  assert.deepEqual(rampClasses(3, true), ['f1', 'f2', 'f3', 'lost', '']);
  assert.deepEqual(rampClasses(4, true), ['f1', 'f2', 'f3', 'f4', 'f4']);
});

test('a manifest ground flag decides the treatment on its own', () => {
  assert.equal(plateTreatment({ hash: 'a', ground: 'bright' }), 'print');
  assert.equal(plateTreatment({ hash: 'b', ground: 'own' }), 'field');
});

test('a photo with nothing measured yet starts as a field plate', () => {
  assert.equal(plateTreatment({ hash: 'c' }), 'field');
  assert.equal(PRINT_THRESHOLD, 0.86);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/ui.test.js`
Expected: FAIL with `Cannot find module` for `../app/ui/chrome.js`.

- [ ] **Step 3: Write `app/ui/dom.js`**

Create `app/ui/dom.js`:

```js
// The three DOM helpers every screen uses. Nothing else belongs here.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function link(href, className, text) {
  const node = el('a', className, text);
  node.href = href;
  return node;
}

// A legend the screen reader hears and the page does not print.
export function srOnly(text) {
  return el('span', 'sr', text);
}
```

- [ ] **Step 4: Write `app/ui/chrome.js`**

Create `app/ui/chrome.js`:

```js
// The printed furniture: the running foot, the trail, the printer's tick, the
// five level squares, and the level word sized by level.
import { el, link } from './dom.js';
import { LEVEL_NAMES } from '../logic/progress.js';

export const FOOT_ITEMS = [
  { key: 'home', text: 'Home', href: '#/' },
  { key: 'lessons', text: 'Lessons', href: '#/lessons' },
  { key: 'progress', text: 'Progress', href: '#/progress' }
];

// A printed foot, not a tab bar: three words, a hairline above, and a 3px
// moss rule under the word you are on. The pusher in front of it holds the
// foot at the bottom of a short page and 36px clear of a long one.
export function footNav(current) {
  const frame = document.createDocumentFragment();
  frame.append(el('div', 'footpush'));
  const nav = el('nav', 'footnav');
  for (const item of FOOT_ITEMS) {
    const anchor = link(item.href, item.key === current ? 'on' : null);
    anchor.append(el('span', null, item.text));
    if (item.key === current) anchor.setAttribute('aria-current', 'page');
    nav.append(anchor);
  }
  frame.append(nav);
  return frame;
}

// The trail names a parent the foot cannot. The last part is the page itself
// and carries no link.
export function trail(parts) {
  const nav = el('nav', 'trail');
  parts.forEach((part, index) => {
    if (index > 0) nav.append(el('i'));
    if (part.href) nav.append(link(part.href, null, part.text));
    else nav.append(el('strong', null, part.text));
  });
  return nav;
}

// A short printer's tick marks a new section. It is not a full rule.
export function tick(className) {
  return el('div', className ? `tick ${className}` : 'tick');
}

// Five squares. A square fills when the level reaches it. Level 4 fills the
// fifth square too, so expert reads as full. A lost square is the outline the
// reveal prints on the level a card just fell from.
export function rampClasses(level, lost = false) {
  const filled = level >= 4 ? 5 : Math.max(0, level);
  const out = [];
  for (let i = 0; i < 5; i += 1) {
    if (i < filled) out.push(`f${Math.min(i + 1, 4)}`);
    else if (lost && i === filled) out.push('lost');
    else out.push('');
  }
  return out;
}

export function ramp(level, options = {}) {
  const classes = ['ramp'];
  if (options.large) classes.push('lg');
  if (options.dim) classes.push('dim');
  const node = el('span', classes.join(' '));
  node.setAttribute('aria-hidden', 'true');
  for (const fill of rampClasses(level, options.lost === true)) {
    node.append(el('b', fill || null));
  }
  return node;
}

// The level word, sized by the level it names. Type carries the reading, so
// the answer never rests on telling two greens apart.
export function levelWord(level) {
  const step = Math.max(0, Math.min(4, level));
  return el('span', `lvw l${step}`, LEVEL_NAMES[step]);
}
```

- [ ] **Step 5: Write `app/ui/plate.js`**

Create `app/ui/plate.js`:

```js
// A plate never ends on a straight line.
//
// .plate.print   A bright studio scan. It multiplies into the paper, so the
//                white ground becomes paper and the specimen has no edge.
// .plate.field   A photograph that carries its own ground. Multiply would
//                turn that ground into a grey rectangle, so a field plate
//                does not blend: it dissolves on four sides through a mask.
//
// Which one a photo gets is measured, not guessed. `plateTreatment` reads a
// `ground` field on the manifest row first, so the pipeline can decide later
// with no other change. With no field it reads the cache, and the cache is
// filled by `measure`, which samples the four corners of the image the page
// has already downloaded. A cross-origin image taints the canvas and the read
// throws; the catch leaves the photo a field plate, so no image load can
// regress and no second request is ever made.
//
// A photo with no `ground` field and no cache entry cannot be placed until
// its image has loaded, so the figure carries `measuring` and the sheet keeps
// the image invisible until the class is right. Otherwise every bright scan
// paints once as a field plate and snaps to a print a frame later.
import { el } from './dom.js';
import { imageUrl } from '../logic/content.js';

// A mean corner luminance at or above this reads as a bright studio ground.
export const PRINT_THRESHOLD = 0.86;

const SAMPLE = 24;
const CORNER = 4;
const treatments = new Map();

export function plateTreatment(photo) {
  if (photo.ground === 'bright') return 'print';
  if (photo.ground === 'own') return 'field';
  return treatments.get(photo.hash) ?? 'field';
}

// Is the treatment already known, or must this image be measured first? A
// manifest flag settles it with no image at all; a hash the cache holds was
// settled by an earlier figure.
function settled(photo) {
  return photo.ground === 'bright' || photo.ground === 'own'
    || treatments.has(photo.hash);
}

function cornerLuminance(image) {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const paper = canvas.getContext('2d', { willReadFrequently: true });
  paper.drawImage(image, 0, 0, SAMPLE, SAMPLE);
  const corners = [[0, 0], [SAMPLE - CORNER, 0], [0, SAMPLE - CORNER],
    [SAMPLE - CORNER, SAMPLE - CORNER]];
  let total = 0;
  let count = 0;
  for (const [x, y] of corners) {
    const { data } = paper.getImageData(x, y, CORNER, CORNER);
    for (let i = 0; i < data.length; i += 4) {
      total += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

// Runs on the image's own load event. The corner sample runs once per hash;
// the class swap runs every time, because a second figure on the same photo
// reaches this point with the cache already warm and still needs its class.
function measure(figure, image, photo) {
  if (!treatments.has(photo.hash)) {
    let treatment = 'field';
    try {
      treatment = cornerLuminance(image) >= PRINT_THRESHOLD ? 'print' : 'field';
    } catch {
      treatment = 'field';
    }
    treatments.set(photo.hash, treatment);
  }
  figure.classList.remove('print', 'field', 'measuring');
  figure.classList.add(treatments.get(photo.hash));
}

// A plate that cannot load leaves no broken image and no caption for a
// picture that is not there. The screens that want something else, and the
// session screen wants its own photo bookkeeping, pass `onError`.
function dropPlate(figure) {
  const caption = figure.nextElementSibling;
  if (caption && caption.classList.contains('plate-cap')) caption.remove();
  const note = el('p', 'fact-line', 'This plate did not load.');
  figure.replaceWith(note);
}

export function plate(photo, options) {
  const treatment = plateTreatment(photo);
  const classes = ['plate', treatment, options.shape];
  if (options.bleed) classes.push('bleed');
  if (options.lift) classes.push('lift');
  if (options.soft) classes.push('soft');
  if (options.mono) classes.push('mono');
  // An unsettled photo draws nothing until the corner sample has run.
  const pending = !settled(photo);
  if (pending) classes.push('measuring');
  const figure = el('figure', classes.filter(Boolean).join(' '));
  const image = document.createElement('img');
  image.src = imageUrl(photo, options.image_base);
  image.alt = options.alt ?? '';
  image.decoding = 'async';
  if (pending) image.addEventListener('load', () => measure(figure, image, photo));
  image.addEventListener('error', () => {
    // An image that never lands must not leave an invisible plate behind.
    figure.classList.remove('measuring');
    if (options.onError) options.onError(figure, photo);
    else dropPlate(figure);
  });
  figure.append(image);
  return figure;
}

// The credit line. The author links to the photo's origin page, so the credit
// reaches the source.
export function credit(photo, lead = '') {
  const line = el('p', 'cap plate-cap');
  if (lead) line.append(document.createTextNode(`${lead} `));
  if (photo.origin) {
    const anchor = el('a', null, photo.author);
    anchor.href = photo.origin;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    line.append(anchor);
  } else {
    line.append(document.createTextNode(photo.author));
  }
  line.append(document.createTextNode(`, ${photo.source}, ${photo.license}.`));
  return line;
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS. `tests/ui.test.js` reports 5 tests, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add app/ui/dom.js app/ui/chrome.js app/ui/plate.js tests/ui.test.js
git commit -m "feat(ui): the shared DOM helpers, the printed furniture, and the plates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The text size setting

**Files:**
- Create: `app/ui/textsize.js`
- Modify: `app/logic/store.js:14-16` (`defaultSettings`), `app/logic/store.js:193-211` (`readSettings` and `writeSettings`)
- Modify: `app/main.js` (apply on load)
- Test: `tests/textsize.test.js` (create), `tests/store.test.js` (append)

**Interfaces:**
- Consumes: `store.readSettings()`, `store.writeSettings(patch)`.
- Produces:
  - `TEXT_SIZE_STEPS: Array<{ name, root, sample_px }>` — five steps, in order
  - `TEXT_SIZE_DEFAULT: string` — `'standard'`
  - `stepFor(name) => { name, root, sample_px }`
  - `isTextSize(name) => boolean`
  - `applyTextSize(name) => string` — sets `document.documentElement.style.fontSize` and returns the step name it used
  - `TEXT_SIZES: string[]` — `app/logic/store.js`, the five step names, so the
    store can hold the floor without importing a UI module
  - `store.readSettings().text_size: string` — one of the five step names
  - `store.readSettings().open_units: string[] | null` — the lessons fold, `null` until the user folds something

- [ ] **Step 1: Write the failing test**

Create `tests/textsize.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXT_SIZE_STEPS, TEXT_SIZE_DEFAULT, stepFor, isTextSize
} from '../app/ui/textsize.js';

test('there are five steps, named and in order', () => {
  assert.deepEqual(TEXT_SIZE_STEPS.map((s) => s.name),
    ['smaller', 'small', 'standard', 'large', 'largest']);
  assert.deepEqual(TEXT_SIZE_STEPS.map((s) => s.root),
    ['80%', '90%', '', '115%', '130%']);
  assert.deepEqual(TEXT_SIZE_STEPS.map((s) => s.sample_px), [14, 15, 17, 20, 22]);
});

test('the standard step leaves the root alone, so it follows the phone', () => {
  assert.equal(TEXT_SIZE_DEFAULT, 'standard');
  assert.equal(stepFor('standard').root, '');
});

test('an unknown step name falls back to standard', () => {
  assert.equal(stepFor('enormous').name, 'standard');
  assert.equal(stepFor(undefined).name, 'standard');
  assert.equal(isTextSize('large'), true);
  assert.equal(isTextSize('enormous'), false);
});
```

Append to `tests/store.test.js`:

```js
test('the settings carry a text size and a fold list', () => {
  const store = createStore(memoryStorage());
  const settings = store.readSettings();
  assert.equal(settings.text_size, 'standard');
  assert.equal(settings.open_units, null);
  assert.equal(store.writeSettings({ text_size: 'large' }).text_size, 'large');
  assert.equal(store.readSettings().text_size, 'large');
  assert.deepEqual(
    store.writeSettings({ open_units: ['leaf_types'] }).open_units,
    ['leaf_types']
  );
});

test('a text size or a fold list from a hand edit falls back to the default', () => {
  const store = createStore(memoryStorage({
    dendro_settings: JSON.stringify({
      version: 1, session_size: 20, new_per_day: 10, last_export: null,
      text_size: 'enormous', open_units: 'leaf_types'
    })
  }));
  assert.equal(store.readSettings().text_size, 'standard');
  assert.equal(store.readSettings().open_units, null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/textsize.test.js tests/store.test.js`
Expected: FAIL. `tests/textsize.test.js` fails with `Cannot find module`, and
`tests/store.test.js` fails with
`Expected values to be strictly equal: undefined !== 'standard'`.

- [ ] **Step 3: Write the text size module**

Create `app/ui/textsize.js`:

```js
// Text size: five steps. Every font size in the sheet is in rem, so moving
// the root size moves the whole app. The standard step sets no root size at
// all, so it follows whatever size the reader asked the browser for.

export const TEXT_SIZE_STEPS = [
  { name: 'smaller', root: '80%', sample_px: 14 },
  { name: 'small', root: '90%', sample_px: 15 },
  { name: 'standard', root: '', sample_px: 17 },
  { name: 'large', root: '115%', sample_px: 20 },
  { name: 'largest', root: '130%', sample_px: 22 }
];

export const TEXT_SIZE_DEFAULT = 'standard';

export function isTextSize(name) {
  return TEXT_SIZE_STEPS.some((step) => step.name === name);
}

export function stepFor(name) {
  return TEXT_SIZE_STEPS.find((step) => step.name === name)
    ?? TEXT_SIZE_STEPS.find((step) => step.name === TEXT_SIZE_DEFAULT);
}

export function applyTextSize(name) {
  const step = stepFor(name);
  document.documentElement.style.fontSize = step.root;
  return step.name;
}
```

- [ ] **Step 4: Add the two settings keys to the store**

In `app/logic/store.js`, replace `defaultSettings` (lines 14 to 16) with:

```js
export const TEXT_SIZES = ['smaller', 'small', 'standard', 'large', 'largest'];

export function defaultSettings() {
  return {
    version: STORE_VERSION,
    session_size: 20,
    new_per_day: 10,
    last_export: null,
    // The name of a text size step. `standard` leaves the root size alone.
    text_size: 'standard',
    // The unit keys the user left unfolded on a channel lessons page. `null`
    // means the user has folded nothing yet, so the default rule applies.
    open_units: null
  };
}

function cleanTextSize(value, fallback) {
  return TEXT_SIZES.includes(value) ? value : fallback;
}

function cleanOpenUnits(value, fallback) {
  if (value === null) return null;
  if (Array.isArray(value) && value.every((key) => typeof key === 'string')) return value;
  return fallback;
}
```

- [ ] **Step 5: Hold the floor on the two new keys**

In `app/logic/store.js`, replace `readSettings` and `writeSettings` (lines 193
to 211) with:

```js
    readSettings() {
      const defaults = defaultSettings();
      const settings = { ...defaults, ...read(KEYS.settings) };
      // Storage can hold a value from a hand edit or an older build. Hold the floor.
      for (const field of ['session_size', 'new_per_day']) {
        if (!isCount(settings[field])) settings[field] = defaults[field];
      }
      settings.text_size = cleanTextSize(settings.text_size, defaults.text_size);
      settings.open_units = cleanOpenUnits(settings.open_units, defaults.open_units);
      return settings;
    },

    writeSettings(patch) {
      const current = api.readSettings();
      const next = { ...current, ...patch };
      for (const field of ['session_size', 'new_per_day']) {
        if (!isCount(next[field])) next[field] = current[field];
      }
      next.text_size = cleanTextSize(next.text_size, current.text_size);
      next.open_units = cleanOpenUnits(next.open_units, current.open_units);
      write(KEYS.settings, next);
      return next;
    },
```

- [ ] **Step 6: Apply the stored step at boot**

In `app/main.js`, add to the imports at the top:

```js
import { applyTextSize } from './ui/textsize.js';
```

and in `start()`, directly under the line that reads
`else if (store.newer_version) showBanner(NEWER_VERSION_BANNER);`, add:

```js
  // The root size goes on before the first render, so no screen ever paints
  // at one size and reflows to another.
  applyTextSize(store.readSettings().text_size);
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS. `tests/textsize.test.js` reports 3 tests and
`tests/store.test.js` reports its old tests plus the two new ones, 0 failures.

- [ ] **Step 8: Check it in a browser**

Open `http://localhost:8000/?content=dev#/`, then in the console run
`localStorage.setItem('dendro_settings', JSON.stringify({version:1,session_size:20,new_per_day:10,last_export:null,text_size:'largest',open_units:null}))`
and reload.
Expected: `document.documentElement.style.fontSize` reads `130%` and the type
is visibly larger.

- [ ] **Step 9: Commit**

```bash
git add app/ui/textsize.js app/logic/store.js app/main.js tests/textsize.test.js tests/store.test.js
git commit -m "feat(settings): the text size steps, stored and applied at boot

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Home

**Files:**
- Modify: `app/screens/home.js` (replaced)
- Modify: `index.html` (the old `<nav>` removed)
- Modify: `app/main.js` (the line that shows the nav removed)
- Modify: `app/style.css` (the home rules and the `.nav` rules removed from the legacy block)
- Read: `docs/design/2026-09-24-specimen-plate/mockup-final.html:899-951` (the home screen), `docs/design/2026-09-24-specimen-plate/final-home.png`

**Interfaces:**
- Consumes:
  - `el(tag, className?, text?) => HTMLElement` — `app/ui/dom.js`, Task 6
  - `link(href, className?, text?) => HTMLAnchorElement` — `app/ui/dom.js`, Task 6
  - `footNav(current: 'home'|'lessons'|'progress'|null) => DocumentFragment` — `app/ui/chrome.js`, Task 6
  - `tick(className?) => HTMLElement` — `app/ui/chrome.js`, Task 6
  - `plate(photo, options) => HTMLElement`, `options` is `{ image_base, alt, shape, bleed?, lift?, soft?, mono?, onError? }` — `app/ui/plate.js`, Task 6
  - `credit(photo, lead?) => HTMLParagraphElement` — `app/ui/plate.js`, Task 6
  - `glyph(id, level, sizeClass, options?) => SVGSVGElement` — `app/ui/glyphs.js`, Task 4
  - `glyphIdFor(card, content) => string` — `app/ui/glyphs.js`, Task 4
  - `numberWord(count: number) => string` — `app/logic/words.js`, Task 1
  - `capitalize(text: string) => string` — `app/logic/words.js`, Task 1
  - `channelLessons(content, states, channel) => { channel, next_up_key, open_count, total_count, depths }` — `app/logic/lessons.js`, Task 3
  - `unitOrdinal(unitKey, content) => number` — `app/logic/lessons.js`, Task 3
  - `unitThumb(content, unitKey) => { card_id, kind, key, channel, photo } | null` — `app/logic/lessons.js`, Task 3
  - `channelRung(content, states, channel, kind) => Rung` — `app/logic/progress.js`, Task 1
  - `leadingConcept(content, states, channel) => { key, name, level, index, total } | null` — `app/logic/progress.js`, Task 1
  - `dueCardIds({ content, states, focus, today }) => string[]` — `app/logic/session.js`
  - `recommendUnit({ content, states, focus }) => { unit_key, next_closed }` — `app/logic/session.js`
  - `newCardCapDone({ content, states, log, settings, focus, today }) => boolean` — `app/logic/session.js`
  - `channelLabel(channel) => string` — `app/logic/content.js`
  - `unitFor(content, unitKey) => Unit` — `app/logic/content.js`
  - `conceptFor(content, channel, key) => { key, name, description } | null` — `app/logic/content.js`
  - `labelFor(content, kind, channel, key) => { label, sublabel }` — `app/logic/question.js`
- Produces: `render(root, ctx)`. The unit list, the channel buttons, and the level-0 counts are gone; they live on Lessons now.

**One transient state.** The running foot carries a Lessons word, and the
`#/lessons` route arrives in Task 9. Between this commit and that one the
Lessons word falls through the router to Home. That is a step in the plan, not
a bug to file.

- [ ] **Step 1: Replace the screen with its head**

Replace the whole of `app/screens/home.js` with the imports, the two
constants, and the sentence of state:

```js
// Home: the name, one sentence of state, the next unit, two doors, two links.
// Computes nothing: every number comes from a logic module.
import { channelLabel, unitFor, conceptFor } from '../logic/content.js';
import { dueCardIds, newCardCapDone, recommendUnit } from '../logic/session.js';
import { channelRung, leadingConcept } from '../logic/progress.js';
import { channelLessons, unitOrdinal, unitThumb } from '../logic/lessons.js';
import { numberWord, capitalize } from '../logic/words.js';
import { labelFor } from '../logic/question.js';
import { el, link } from '../ui/dom.js';
import { footNav, tick } from '../ui/chrome.js';
import { plate, credit } from '../ui/plate.js';
import { glyph, glyphIdFor } from '../ui/glyphs.js';

// The one line of copy the content does not carry.
const SUBTITLE = 'Trees of the Colorado Front Range.';

// A door shows at most this many unit squares per depth, so it stays a mark
// and not a second lessons page.
const DOOR_SQUARES = 8;

function stateSentence(content, states, today) {
  const total = dueCardIds({ content, states, focus: 'all', today }).length;
  const line = el('p', 'state1');
  if (total === 0) {
    line.append(el('b', null, 'No card'));
    line.append(document.createTextNode(' is due today.'));
    return line;
  }
  const parts = content.channels
    .map((channel) => ({
      channel,
      count: dueCardIds({ content, states, focus: channel, today }).length
    }))
    .filter((part) => part.count > 0)
    .map((part) => `${numberWord(part.count)} ${channelLabel(part.channel)}`);
  line.append(el('b', null, `${capitalize(numberWord(total))} ${total === 1 ? 'card' : 'cards'}`));
  line.append(document.createTextNode(
    ` ${total === 1 ? 'is' : 'are'} due today: ${parts.join(', ')}.`
  ));
  return line;
}
```

Expected: `node --check app/screens/home.js` prints nothing.

- [ ] **Step 2: Add the next-unit block**

Append to `app/screens/home.js`:

```js
// One line about the unit. A level-1 unit holds the channel's shapes; every
// deeper unit holds the cards inside one shape.
function whyLine(content, unit, cardCount, newCount) {
  const ordinal = unitOrdinal(unit.key, content);
  const opening = `Unit ${ordinal}, ${numberWord(newCount)} new `
    + `${newCount === 1 ? 'card' : 'cards'}.`;
  if (unit.level === 1) {
    return `${opening} The ${numberWord(cardCount)} ${channelLabel(unit.channel)} shapes.`;
  }
  const concept = conceptFor(content, unit.channel, unit.bucket);
  const inside = concept ? concept.name : unit.bucket;
  return `${opening} ${capitalize(numberWord(cardCount))} `
    + `${cardCount === 1 ? 'card' : 'cards'} inside ${inside}, `
    + `quizzed by ${channelLabel(unit.channel)}.`;
}

// The small print beside the unit. `.wide` on both the column and the figure
// cuts the empty lower band off the scan, so the caption sits under the print.
function thumbFor(content, unitKey, imageBase) {
  const found = unitThumb(content, unitKey);
  if (!found) return null;
  const column = el('div', 'figcol wide');
  const { label } = labelFor(content, found.kind, found.channel, found.key);
  const figure = plate(found.photo, {
    image_base: imageBase,
    alt: `Pressed specimen, ${label}`,
    shape: 'pl-thumb',
    lift: true
  });
  figure.classList.add('wide');
  column.append(figure);
  // Every photo the app prints carries its credit, the 124 px thumb included.
  const count = (content.unit_cards[unitKey] ?? []).length;
  const caption = credit(found.photo, `${label}, one of the ${numberWord(count)}.`);
  caption.className = 'cap thumbcap';
  column.append(caption);
  return column;
}

function recommendation(root, ctx, states) {
  const { content, today } = ctx;
  const box = el('div', 'rec');
  box.append(tick());
  const found = recommendUnit({ content, states, focus: 'all' });

  if (found.unit_key) {
    const unit = unitFor(content, found.unit_key);
    const ids = content.unit_cards[unit.key] ?? [];
    const newCount = ids.filter((id) => !states[id]).length;
    const thumb = thumbFor(content, unit.key, ctx.image_base);
    if (thumb) box.append(thumb);
    box.append(el('h2', 'h2', unit.name));
    box.append(el('p', 'why', whyLine(content, unit, ids.length, newCount)));
    box.append(link(`#/session?focus=${unit.channel}&unit=${unit.key}`, 'btn', 'Start'));
    root.append(box);
    return;
  }

  if (found.next_closed) {
    const next = found.next_closed;
    const parent = unitFor(content, next.parent_key);
    box.append(el('h2', 'h2', 'Nothing is open yet'));
    box.append(el('p', 'why',
      `${next.unit_name} opens when ${numberWord(next.needed_cards)} more `
      + `${next.needed_cards === 1 ? 'card' : 'cards'} in ${parent.name} reach familiar.`));
    box.append(link('#/lessons', 'btn', 'Open Lessons'));
    root.append(box);
    return;
  }

  box.append(el('h2', 'h2', 'Every unit is started'));
  const dueCount = dueCardIds({ content, states, focus: 'all', today }).length;
  box.append(el('p', 'why', dueCount > 0
    ? `${capitalize(numberWord(dueCount))} ${dueCount === 1 ? 'card is' : 'cards are'} waiting for a review.`
    : 'Nothing is waiting. Come back tomorrow.'));
  if (dueCount > 0) box.append(link('#/session?focus=all', 'btn', 'Start'));
  root.append(box);
}
```

Expected: `node --check app/screens/home.js` prints nothing.

- [ ] **Step 3: Add the two doors**

A door is a large tappable panel that stands for a whole screen: a mark built
from the reader's own numbers, the name of the screen, and one line of what is
behind it. Home has two, one for Lessons and one for Progress.

Append to `app/screens/home.js`:

```js
function lessonsDoor(content, states) {
  const door = link('#/lessons', 'door');
  const summaries = content.channels.map((channel) => channelLessons(content, states, channel));
  const thumb = el('span', 'dthumb');
  thumb.setAttribute('aria-hidden', 'true');
  for (const depth of [1, 2, 3]) {
    const row = el('span', 'dq');
    const units = summaries
      .flatMap((summary) => summary.depths.find((item) => item.level === depth).units)
      .slice(0, DOOR_SQUARES);
    for (const unit of units) {
      const square = el('i', unit.open ? null : 'shut');
      if (unit.next_up) square.classList.add('next');
      row.append(square);
    }
    thumb.append(row);
  }
  door.append(thumb);
  door.append(el('span', 'dn', 'Lessons'));
  const total = summaries.reduce((count, summary) => count + summary.total_count, 0);
  const open = summaries.reduce((count, summary) => count + summary.open_count, 0);
  door.append(el('span', 'dd',
    `${capitalize(numberWord(total))} units, three deep, `
    + `with ${numberWord(open)} open now.`));
  return door;
}

function progressDoor(content, states) {
  const door = link('#/progress', 'door');
  const thumb = el('span', 'dthumb');
  thumb.setAttribute('aria-hidden', 'true');
  for (const channel of content.channels) {
    const leading = leadingConcept(content, states, channel);
    const species = channelRung(content, states, channel, 'species');
    const row = el('span', 'dr');
    const card = leading ? content.cards[`concept:${channel}:${leading.key}`] : null;
    row.append(card
      ? glyph(glyphIdFor(card, content), leading.level, 's20')
      : glyph('lf-entire', 0, 's20'));
    const bar = el('em');
    const fill = el('b');
    fill.style.width = `${Math.round(species.share * 1000) / 10}%`;
    bar.append(fill);
    row.append(bar);
    thumb.append(row);
  }
  door.append(thumb);
  door.append(el('span', 'dn', 'Progress'));
  door.append(el('span', 'dd',
    'Every card you hold, kept apart by shape, genus, and species.'));
  return door;
}
```

Expected: `node --check app/screens/home.js` prints nothing.

- [ ] **Step 4: Add the wiring**

Append to `app/screens/home.js`:

```js
export function render(root, ctx) {
  const { content, store, today } = ctx;
  const states = store.readCards();
  const log = store.readLog();
  const userSettings = store.readSettings();

  const masthead = el('div', 'masthead');
  masthead.append(el('h1', 'display', 'Dendro'));
  masthead.append(el('p', 'sub', SUBTITLE));
  masthead.append(el('div', 'mastrule'));
  root.append(masthead);

  root.append(stateSentence(content, states, today));

  if (newCardCapDone({ content, states, log, settings: userSettings, focus: 'all', today })) {
    root.append(el('p', 'note',
      `Nothing is due and today's ${userSettings.new_per_day} new cards are done. `
      + 'Come back tomorrow.'));
  }

  recommendation(root, ctx, states);

  const doors = el('div', 'doors');
  doors.append(lessonsDoor(content, states));
  doors.append(progressDoor(content, states));
  root.append(doors);

  root.append(link('#/placement', 'placement', 'Take the placement test'));
  const settings = link('#/settings', 'placement', 'Settings');
  settings.style.marginLeft = '18px';
  root.append(settings);

  root.append(footNav('home'));
}
```

Expected: `node --check app/screens/home.js` prints nothing.

- [ ] **Step 5: Take out the old nav**

Home is the first screen that prints the running foot, so the nav Task 5 kept
comes out now. Three edits:

1. In `index.html`, delete the whole `<nav id="nav" class="nav" hidden>`
   element and its three anchors.
2. In `app/main.js`, in `start()`, delete the line
   `document.getElementById('nav').hidden = false;` and the three-line
   comment above it. Leave the `await injectSprite();` call below them.
3. In `app/style.css`, in the legacy block, delete the `.nav` and `.nav a`
   rules.

- [ ] **Step 6: Delete the home rules from the legacy CSS block**

In `app/style.css`, in the legacy block, delete the `.channel.is-active`,
`.pill`, `.pill-open`, and `.pill-closed` rules. Home was the only screen
that used them.

Keep `.channel-row`: `app/screens/progress.js` still uses it until Task 11
lands. Keep `.chip`: the session head still uses it until Task 13 lands.

- [ ] **Step 7: Check the screen in a browser**

Open `http://localhost:8000/?content=dev#/`.
Expected:

- "Dendro" in Fraunces at about 44 px, the subtitle in italic bark, a 2 px bark rule under both.
- One sentence of state with the count in moss.
- The next unit block: a moss tick, a 148 px print floated right with a caption under it, the unit name, one line of why, and a full-width moss Start.
- Two mounted doors with their marks, then two italic links.
- The running foot at the bottom with a 3 px moss rule under Home.
- No nav at the top of the page any more.
- No console error.

Tapping Lessons in the foot lands back on Home until Task 9 adds the route.

- [ ] **Step 8: Check it at 360 px and root 130 percent**

In the browser's device toolbar set the width to 360 px, then run
`document.documentElement.style.fontSize = '130%'` in the console.
Expected: no horizontal scrollbar, the Start button still one line, the
floated print still clear of the Start button.

- [ ] **Step 9: Run the tests**

Run: `npm test`
Expected: PASS, no change in count. Home has no test; the numbers it prints
are covered by `tests/rungs.test.js` and `tests/lessons.test.js`.

- [ ] **Step 10: Commit**

```bash
git add app/screens/home.js app/style.css index.html app/main.js
git commit -m "feat(home): the specimen-plate home, simplified per spec 4.1

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Lessons, the overview

**Files:**
- Create: `app/screens/lessons.js`
- Modify: `app/main.js` (the chain of route branches inside `route()`)
- Read: `docs/design/2026-09-24-specimen-plate/mockup-final.html:1339-1403`, `docs/design/2026-09-24-specimen-plate/final-lessons.png`

**Interfaces:**
- Consumes:
  - `el(tag, className?, text?) => HTMLElement` — `app/ui/dom.js`, Task 6
  - `link(href, className?, text?) => HTMLAnchorElement` — `app/ui/dom.js`, Task 6
  - `footNav(current: 'home'|'lessons'|'progress'|null) => DocumentFragment` — `app/ui/chrome.js`, Task 6
  - `tick(className?) => HTMLElement` — `app/ui/chrome.js`, Task 6
  - `ramp(level, options?) => HTMLElement`, `options` is `{ large?, dim?, lost? }` — `app/ui/chrome.js`, Task 6
  - `plate(photo, options) => HTMLElement` — `app/ui/plate.js`, Task 6
  - `credit(photo, lead?) => HTMLParagraphElement` — `app/ui/plate.js`, Task 6
  - `glyph(id, level, sizeClass, options?) => SVGSVGElement` — `app/ui/glyphs.js`, Task 4
  - `glyphIdFor(card, content) => string` — `app/ui/glyphs.js`, Task 4
  - `numberWord(count: number) => string` — `app/logic/words.js`, Task 1
  - `capitalize(text: string) => string` — `app/logic/words.js`, Task 1
  - `channelLessons(content, states, channel) => { channel, next_up_key, open_count, total_count, depths }` — `app/logic/lessons.js`, Task 3
  - `unitLevel(unitKey, content, states) => number` — `app/logic/lessons.js`, Task 3
  - `unitOrdinal(unitKey, content) => number` — `app/logic/lessons.js`, Task 3
  - `unitThumb(content, unitKey) => { card_id, kind, key, channel, photo } | null` — `app/logic/lessons.js`, Task 3
  - `dueCardIds({ content, states, focus, today }) => string[]` — `app/logic/session.js`
  - `recommendUnit({ content, states, focus }) => { unit_key, next_closed }` — `app/logic/session.js`
  - `channelLabel(channel) => string`, `unitFor(content, unitKey) => Unit` — `app/logic/content.js`
  - `labelFor(content, kind, channel, key) => { label, sublabel }` — `app/logic/question.js`
- Produces: `render(root, ctx)` for `#/lessons`. `ctx.channel` is `null` on this route; Task 10 adds the channel branch to the same module.

- [ ] **Step 1: Write the head and the next-unit block**

Create `app/screens/lessons.js`:

```js
// Lessons: what is next, then one door per channel.
import { channelLabel, unitFor } from '../logic/content.js';
import { dueCardIds, recommendUnit } from '../logic/session.js';
import { channelLessons, unitLevel, unitOrdinal, unitThumb } from '../logic/lessons.js';
import { numberWord, capitalize } from '../logic/words.js';
import { labelFor } from '../logic/question.js';
import { el, link } from '../ui/dom.js';
import { footNav, tick, ramp } from '../ui/chrome.js';
import { plate, credit } from '../ui/plate.js';
import { glyph, glyphIdFor } from '../ui/glyphs.js';

// The row of outline leaves shows at most this many new cards, so the block
// keeps its size whatever the unit holds.
const NEW_LEAVES = 12;

const KEYLINE = 'Each square below is one unit: filled if you can start it '
  + 'now, outlined if it waits on its parent, ticked in moss if it is next.';

function newRow(content, unitKey, states) {
  const ids = (content.unit_cards[unitKey] ?? []).filter((id) => !states[id]);
  if (ids.length === 0) return null;
  const row = el('div', 'newrow');
  row.setAttribute('aria-hidden', 'true');
  for (const id of ids.slice(0, NEW_LEAVES)) {
    row.append(glyph(glyphIdFor(content.cards[id], content), 0, 's34'));
  }
  return row;
}

function nextBlock(root, ctx, states) {
  const { content } = ctx;
  const box = el('div', 'nextu');
  box.append(tick());
  const found = recommendUnit({ content, states, focus: 'all' });

  if (!found.unit_key) {
    box.append(el('h1', 'display', 'Nothing is open'));
    box.append(el('p', 'why', found.next_closed
      ? `${found.next_closed.unit_name} opens when `
        + `${numberWord(found.next_closed.needed_cards)} more `
        + `${found.next_closed.needed_cards === 1 ? 'card' : 'cards'} reach familiar.`
      : 'Every unit in the content is started.'));
    root.append(box);
    return;
  }

  const unit = unitFor(content, found.unit_key);
  const ids = content.unit_cards[unit.key] ?? [];
  const newCount = ids.filter((id) => !states[id]).length;

  const thumbCard = unitThumb(content, unit.key);
  if (thumbCard) {
    const column = el('div', 'figcol wide');
    const { label } = labelFor(content, thumbCard.kind, thumbCard.channel, thumbCard.key);
    const figure = plate(thumbCard.photo, {
      image_base: ctx.image_base,
      alt: `Pressed specimen, ${label}`,
      shape: 'pl-thumb',
      lift: true
    });
    figure.classList.add('wide');
    column.append(figure);
    const caption = credit(thumbCard.photo,
      `${label}, one of the ${numberWord(ids.length)}.`);
    caption.className = 'cap thumbcap';
    column.append(caption);
    box.append(column);
  }

  box.append(el('h1', 'display', unit.name));
  const parent = unit.parent ? unitFor(content, unit.parent) : null;
  box.append(el('p', 'why', parent
    ? `Unit ${unitOrdinal(unit.key, content)}, inside ${parent.name}.`
    : `Unit ${unitOrdinal(unit.key, content)}, the `
      + `${channelLabel(unit.channel)} shapes.`));

  const leaves = newRow(content, unit.key, states);
  if (leaves) {
    leaves.style.clear = 'both';
    box.append(leaves);
    box.append(el('p', 'cap newcap',
      `${capitalize(numberWord(newCount))} `
      + `${newCount === 1 ? 'card' : 'cards'} in this unit you have not met yet.`));
  }

  const level = unitLevel(unit.key, content, states);
  const rampLine = el('div', 'rampline');
  rampLine.append(ramp(level));
  rampLine.append(el('span', null, `Unit level ${level} of 4.`));
  box.append(rampLine);

  box.append(link(`#/session?focus=${unit.channel}&unit=${unit.key}`, 'btn', 'Start'));
  root.append(box);
}
```

Expected: `node --check app/screens/lessons.js` prints nothing.

- [ ] **Step 2: Add the channel doors and the wiring**

Append to `app/screens/lessons.js`:

```js
function channelDoor(content, states, today, channel) {
  const summary = channelLessons(content, states, channel);
  const due = dueCardIds({ content, states, focus: channel, today }).length;
  const door = link(`#/lessons/${channel}`, 'chdoor');
  const head = el('span', 'cdh');
  head.append(el('span', 'dn', capitalize(channelLabel(channel))));
  // Every count on this screen is a word, so the door's counts are too.
  head.append(el('span', 'cdd',
    `${numberWord(due)} ${due === 1 ? 'card' : 'cards'} due, `
    + `${numberWord(summary.open_count)} of `
    + `${numberWord(summary.total_count)} units open`));
  door.append(head);

  const strip = el('span', 'ustrip');
  for (const depth of summary.depths) {
    strip.append(el('span', 'dn2', depth.name));
    const squares = el('span', 'sqs');
    if (depth.units.length === 0) {
      squares.append(el('span', 'none', 'none yet'));
    } else {
      for (const unit of depth.units) {
        const square = el('i', unit.open ? null : 'shut');
        if (unit.next_up) square.classList.add('next');
        squares.append(square);
      }
    }
    strip.append(squares);
  }
  door.append(strip);
  return door;
}

export function render(root, ctx) {
  const { content, store, today } = ctx;
  const states = store.readCards();

  nextBlock(root, ctx, states);
  root.append(el('p', 'keyline', KEYLINE));
  for (const channel of content.channels) {
    root.append(channelDoor(content, states, today, channel));
  }
  root.append(link('#/placement', 'placement', 'Take the placement test'));
  root.append(footNav('lessons'));
}
```

Expected: `node --check app/screens/lessons.js` prints nothing.

- [ ] **Step 3: Add the route**

In `app/main.js`, add to the imports:

```js
import * as lessons from './screens/lessons.js';
```

and in `route()`, add a branch to the chain directly above the line that
reads `else leave = home.render(root, ctx);`:

```js
      else if (parts[0] === 'lessons') {
        leave = lessons.render(root, { ...ctx, channel: parts[1] ?? null });
      }
```

- [ ] **Step 4: Check the screen in a browser**

Open `http://localhost:8000/?content=dev#/lessons`.
Expected:

- The next unit as a display heading, a 148 px print floated right, a row of
  outline leaves, a ramp with "Unit level N of 4", and a full-width Start.
- One line of key copy, then three mounted doors, one per channel, each with
  three labelled rows of unit squares.
- The placement link, then the foot with the moss rule under Lessons.
- No console error.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, no change in count.

- [ ] **Step 6: Commit**

```bash
git add app/screens/lessons.js app/main.js
git commit -m "feat(lessons): the lessons overview and its route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Lessons, one channel, with the fold

**Files:**
- Modify: `app/screens/lessons.js` (append the channel branch)
- Read: `docs/design/2026-09-24-specimen-plate/mockup-final.html:1406-1545` and `:1846-1857` (the fold script), `docs/design/2026-09-24-specimen-plate/final-lessons-leaf.png`, `final-lessons-leaf-open.png`

**Interfaces:**
- Consumes, all of them already imported by the module Task 9 created, except
  the four this task adds to the import lines in Step 4:
  - `unitTree(content, states, channel) => Node[]`, `Node` is `{ key, name, level, channel, card_count, new_count, rollup, open, opens_with, needed_cards, next_up, holds_next, inside_count, children }` — `app/logic/lessons.js`, Task 3
  - `defaultOpenUnits(content, states, channel) => string[]` — `app/logic/lessons.js`, Task 3
  - `channelLessons(content, states, channel) => { channel, next_up_key, open_count, total_count, depths }` — `app/logic/lessons.js`, Task 3
  - `trail(parts: Array<{ text, href? }>) => HTMLElement` — `app/ui/chrome.js`, Task 6
  - `ramp(level, options?) => HTMLElement`, `options` is `{ large?, dim?, lost? }` — `app/ui/chrome.js`, Task 6
  - `footNav(current) => DocumentFragment` — `app/ui/chrome.js`, Task 6
  - `el(tag, className?, text?) => HTMLElement`, `link(href, className?, text?) => HTMLAnchorElement` — `app/ui/dom.js`, Task 6
  - `glyph(id, level, sizeClass, options?) => SVGSVGElement`, `glyphIdFor(card, content) => string` — `app/ui/glyphs.js`, Task 4
  - `numberWord(count) => string`, `capitalize(text) => string` — `app/logic/words.js`, Task 1
  - `channelLabel(channel) => string` — `app/logic/content.js`
  - `content.unit_cards: Record<string, string[]>`, `content.cards: Record<string, Card>`
  - `store.readSettings() => { …, open_units: string[] | null }` — Task 7
  - `store.writeSettings(patch) => Settings` — Task 7
- Produces: `render(root, ctx)` branches on `ctx.channel`. A non-null `ctx.channel` that is not in `content.channels` renders an error panel, not a blank page.

- [ ] **Step 1: Add the chevron and the fold state**

Append to `app/screens/lessons.js`:

```js
const CHEVRON_PATH = 'M9 4 L17 12 L9 20';

function chevron() {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '2.6');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', CHEVRON_PATH);
  node.append(path);
  return node;
}

// The fold list is one global set of unit keys, because a unit key is unique
// across channels. `null` in storage means the user has folded nothing yet,
// so the default rule decides, for every channel at once.
function openSet(content, states, store) {
  const stored = store.readSettings().open_units;
  if (stored !== null) return new Set(stored);
  return new Set(content.channels.flatMap(
    (channel) => defaultOpenUnits(content, states, channel)
  ));
}

```

Expected: `node --check app/screens/lessons.js` prints nothing.

- [ ] **Step 2: Add the unit row**

Append to `app/screens/lessons.js`:

```js
// The meta line under a unit name. Only a folded row adds what is inside, so
// the fold never hides a fact without leaving the count behind. An unfolded
// row prints the children themselves, so the count would only repeat them.
function metaLine(node, folded) {
  const line = el('span', 'ust');
  const cards = `${numberWord(node.new_count)} new `
    + `${node.new_count === 1 ? 'card' : 'cards'}`;
  if (!node.open) {
    line.append(document.createTextNode(node.opens_with
      ? `${cards}. Opens with ${node.opens_with}.`
      : `${cards}. Closed.`));
  } else if (node.new_count === 0) {
    const done = el('span', 'done-sq');
    done.setAttribute('aria-hidden', 'true');
    line.append(done);
    line.append(document.createTextNode(
      `complete, ${numberWord(node.card_count)} `
      + `${node.card_count === 1 ? 'card' : 'cards'}`));
  } else if (node.next_up) {
    line.append(document.createTextNode(`${cards}, next up`));
  } else {
    line.append(document.createTextNode(cards));
  }
  if (folded && node.inside_count > 0) {
    const inside = `. ${numberWord(node.inside_count)} `
      + `${node.inside_count === 1 ? 'unit' : 'units'} inside`
      + (node.holds_next ? `, ${numberWord(1)} next up` : '');
    line.append(el('span', 'usum', inside));
  }
  return line;
}

function unitRow(content, node, folded, onToggle) {
  const row = el('div', 'urow');
  const card = (content.unit_cards[node.key] ?? [])[0];
  row.append(card
    ? glyph(glyphIdFor(content.cards[card], content), node.rollup, 's30')
    : glyph('lf-entire', node.rollup, 's30'));

  const body = el('span', 'ubody');
  body.append(el('span', 'un', node.name));
  body.append(metaLine(node, folded));
  body.append(ramp(node.rollup, { dim: !node.open }));
  row.append(body);

  const controls = el('span', 'uctl');
  if (node.open) {
    const start = link(
      `#/session?focus=${node.channel}&unit=${node.key}`,
      node.next_up ? 'startb solid' : 'startb',
      'Start'
    );
    controls.append(start);
  } else {
    controls.append(el('span', 'shutnote', 'shut'));
  }

  if (node.children.length > 0) {
    const button = el('button', 'chev');
    button.type = 'button';
    button.setAttribute('aria-expanded', folded ? 'false' : 'true');
    button.setAttribute('aria-controls', `kids-${node.key}`);
    button.setAttribute('aria-label',
      `${folded ? 'Expand' : 'Collapse'} ${node.name}`);
    button.append(chevron());
    button.addEventListener('click', () => onToggle(node, button));
    controls.append(button);
  } else {
    const pad = el('span', 'chevpad');
    pad.setAttribute('aria-hidden', 'true');
    controls.append(pad);
  }
  row.append(controls);
  return row;
}
```

Expected: `node --check app/screens/lessons.js` prints nothing.

- [ ] **Step 3: Add the tree and the channel wiring**

Append to `app/screens/lessons.js`:

```js
function unitNodeEl(content, node, open, onToggle) {
  const folded = node.children.length > 0 && !open.has(node.key);
  const box = el('div', 'node');
  if (!node.open) box.classList.add('shut');
  if (node.next_up) box.classList.add('now');
  if (folded) box.classList.add('folded');
  box.append(unitRow(content, node, folded, onToggle));
  if (node.children.length > 0) {
    const kids = el('div', 'kids');
    kids.id = `kids-${node.key}`;
    for (const child of node.children) {
      kids.append(unitNodeEl(content, child, open, onToggle));
    }
    box.append(kids);
  }
  return box;
}

function renderChannel(root, ctx) {
  const { content, store, channel } = ctx;
  const states = store.readCards();
  const open = openSet(content, states, store);

  const onToggle = (node, button) => {
    const wasOpen = button.getAttribute('aria-expanded') === 'true';
    if (wasOpen) open.delete(node.key);
    else open.add(node.key);
    button.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
    button.setAttribute('aria-label',
      `${wasOpen ? 'Expand' : 'Collapse'} ${node.name}`);
    button.closest('.node').classList.toggle('folded', wasOpen);
    // The meta line prints what is inside only while the row is folded, so it
    // is built again with the fold rather than left saying something untrue.
    // After the toggle the row is folded exactly when it was open before.
    button.closest('.urow').querySelector('.ust').replaceWith(metaLine(node, wasOpen));
    store.writeSettings({ open_units: [...open] });
    if (!store.available) ctx.banner(ctx.storage_banner);
  };

  root.append(trail([
    { text: 'Lessons', href: '#/lessons' },
    { text: capitalize(channelLabel(channel)) }
  ]));

  const head = el('div', 'pagehead');
  head.append(el('h1', 'display', capitalize(channelLabel(channel))));
  const summary = channelLessons(content, states, channel);
  head.append(el('p', 'where2',
    `${capitalize(numberWord(summary.total_count))} `
    + `${summary.total_count === 1 ? 'unit' : 'units'} on one stem, three deep.`));
  root.append(head);

  const tree = el('div', 'tree');
  for (const node of unitTree(content, states, channel)) {
    tree.append(unitNodeEl(content, node, open, onToggle));
  }
  root.append(tree);

  root.append(link('#/lessons', 'foot', 'All three channels'));
  root.append(footNav('lessons'));
}
```

Expected: `node --check app/screens/lessons.js` prints nothing.

- [ ] **Step 4: Extend the imports**

At the top of `app/screens/lessons.js`, replace the two import lines that name
`../logic/lessons.js` and `../ui/chrome.js` with:

```js
import {
  channelLessons, defaultOpenUnits, unitLevel, unitOrdinal, unitThumb, unitTree
} from '../logic/lessons.js';
import { footNav, tick, ramp, trail } from '../ui/chrome.js';
```

- [ ] **Step 5: Branch the render on the channel**

In `app/screens/lessons.js`, replace the whole of `render` (the function Task
9 wrote) with:

```js
export function render(root, ctx) {
  const { content, store, today } = ctx;
  const states = store.readCards();

  // One module, two routes. A channel that is not in the content renders a
  // panel with a way out, not a blank page.
  if (ctx.channel) {
    if (!content.channels.includes(ctx.channel)) {
      root.append(trail([
        { text: 'Lessons', href: '#/lessons' },
        { text: 'Unknown' }
      ]));
      root.append(el('h1', 'display', 'Unknown channel'));
      root.append(el('p', 'where2',
        `The content has no channel named ${ctx.channel}.`));
      root.append(link('#/lessons', 'foot', 'All three channels'));
      root.append(footNav('lessons'));
      return;
    }
    renderChannel(root, ctx);
    return;
  }

  nextBlock(root, ctx, states);
  root.append(el('p', 'keyline', KEYLINE));
  for (const channel of content.channels) {
    root.append(channelDoor(content, states, today, channel));
  }
  root.append(link('#/placement', 'placement', 'Take the placement test'));
  root.append(footNav('lessons'));
}
```

`renderChannel` is declared below `render` in the file. A function
declaration hoists, so the call resolves.

Expected: `node --check app/screens/lessons.js` prints nothing.

- [ ] **Step 6: Check the tree and the fold in a browser**

Open `http://localhost:8000/?content=dev#/lessons/leaf`.
Expected:

- A trail reading Lessons, then Leaf, then a display heading "Leaf".
- One stem. "Leaf types" at the top with a chevron turned a quarter turn, its
  children indented behind a 1.5 px rule with a tick reaching into each row.
- The level-2 row "Simple lobed leaves" folded by default, its meta line
  ending "four units inside, one next up".
- Tapping its chevron unfolds the four level-3 rows in place, the chevron
  turns, and the "four units inside" tail goes, because the four rows are now
  on screen. Tapping again folds them and brings the tail back.
- The closed rows have no fill, no Start, the word "shut", and a line saying
  what opens them.
- The next-up row has a 7 px moss rail and the only filled Start.

- [ ] **Step 7: Check the fold survives a reload**

Unfold "Simple lobed leaves", then reload the page.
Expected: the row is still unfolded, and
`JSON.parse(localStorage.dendro_settings).open_units` holds
`['leaf_types','simple_lobed_genus']` plus whatever the other channels
seeded.

- [ ] **Step 8: Check the chevron with the keyboard**

Tab to a chevron and press Enter.
Expected: the fold changes, `aria-expanded` flips, the focus ring is a 2 px
moss outline inset into the 44 px button, and the focus stays on the button.

- [ ] **Step 9: Run the tests**

Run: `npm test`
Expected: PASS, no change in count.

- [ ] **Step 10: Commit**

```bash
git add app/screens/lessons.js
git commit -m "feat(lessons): the channel stem, the chevron fold, and the stored fold state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Progress, the overview

**Files:**
- Modify: `app/screens/progress.js` (replaced)
- Read: `docs/design/2026-09-24-specimen-plate/mockup-final.html:954-1182`, `docs/design/2026-09-24-specimen-plate/final-progress.png`

**Interfaces:**
- Consumes:
  - `channelRungs(content, states, channel) => Rung[]` in `['concept','group','species']` order — `app/logic/progress.js`, Task 1
  - `channelClaim(content, states, channel) => string` — `app/logic/progress.js`, Task 1
  - `leadingConcept(content, states, channel) => { key, name, level, index, total } | null` — `app/logic/progress.js`, Task 1
  - `overallFinding(content, states) => string` — `app/logic/progress.js`, Task 1
  - `overallTally(content, states) => { shapes, genera, species }`, each `{ at, total }` — `app/logic/progress.js`, Task 1
  - `LEVEL_NAMES: string[]` — `app/logic/progress.js`, Task 1
  - `dueCardIds({ content, states, focus, today }) => string[]` — `app/logic/session.js`
  - `channelLabel(channel) => string` — `app/logic/content.js`
  - `glyph(id, level, sizeClass, options?) => SVGSVGElement`, `options` is `{ ghost?: boolean }` — `app/ui/glyphs.js`, Task 4
  - `glyphIdFor(card, content) => string` — `app/ui/glyphs.js`, Task 4
  - `FALLBACK_GLYPH: string` — `app/ui/glyphs.js`, Task 4
  - `el(tag, className?, text?) => HTMLElement`, `link(href, className?, text?) => HTMLAnchorElement` — `app/ui/dom.js`, Task 6
  - `footNav(current) => DocumentFragment`, `tick(className?) => HTMLElement`, `levelWord(level) => HTMLElement` — `app/ui/chrome.js`, Task 6
  - `numberWord(count) => string`, `capitalize(text) => string` — `app/logic/words.js`, Task 1
  - `content.cards: Record<string, Card>`, `content.channels: string[]`
- Produces: `render(root, ctx)` for `#/progress`. `leadingRow(rung)` and `markOf(content, row)` stay local to this screen; the shape page builds its own genus marks from `conceptBreakdown`.

**The rung, restated.** One channel is three rungs, and each rung prints its
depth as a stack of pressed sheets in the 58 px column at the left edge:

- the shapes rung, one sheet, the channel's leading shape at the rung's level;
- the genera rung, two sheets, a ghost of the leading shape behind and the
  leading genus in front;
- the species rung, three sheets, a ghost of the leading shape, a ghost of
  the leading genus, and the leading species in front.

The front sheet is always the leading card of the rung it stands for, so the
three stacks in a channel do not print the same mark three times. The two
ghost classes place the sheets behind: `g1` is the sheet one step back, `g2`
is the sheet two steps back, each one shifted and turned a little further.

Beside the stack sit the rung name, the level word sized by level, and the
count. Under it runs the band of that rung's cards, one mark each, filled by
level, and under the band a moss waterline cut to the share at familiar or
better. All three waterlines are measured against the same length, so the
three lengths compare by eye.

- [ ] **Step 1: Replace the screen with its head and the sheet stack**

Replace the whole of `app/screens/progress.js` with:

```js
// Progress: the finding, the legend, then three rungs per channel.
// Every number comes from app/logic/progress.js.
import { channelLabel } from '../logic/content.js';
import { dueCardIds } from '../logic/session.js';
import {
  LEVEL_NAMES, channelRungs, channelClaim,
  leadingConcept, overallFinding, overallTally
} from '../logic/progress.js';
import { numberWord, capitalize } from '../logic/words.js';
import { el, link } from '../ui/dom.js';
import { footNav, tick, levelWord } from '../ui/chrome.js';
import { glyph, glyphIdFor, FALLBACK_GLYPH } from '../ui/glyphs.js';

// The glyph size each rung's band uses. A deeper rung holds more cards, so
// its marks are smaller and the three bands still fit one column.
const BAND_SIZES = { concept: 's32', group: 's28', species: 's24' };

// The leading card of a rung: the one that stands highest. A tie goes to the
// first in the band, so the mark never flickers.
function leadingRow(rung) {
  if (rung.cards.length === 0) return null;
  let best = 0;
  for (let i = 1; i < rung.cards.length; i += 1) {
    if (rung.cards[i].level > rung.cards[best].level) best = i;
  }
  return rung.cards[best];
}

function markOf(content, row) {
  const card = row ? content.cards[row.id] : null;
  return card ? glyphIdFor(card, content) : FALLBACK_GLYPH;
}

// The sheet stack. The sheets behind are pressed and out of ink, so only
// their edge reads, and the depth of the stack is the depth of the rung. The
// front sheet is the leading card of this rung, so the species stack does not
// repeat the shape the shapes stack already prints.
function sheetStack(content, rungs, kind, level) {
  const stack = el('span', 'rmk');
  stack.setAttribute('aria-hidden', 'true');
  const shapeId = markOf(content, leadingRow(rungs[0]));
  const genusId = markOf(content, leadingRow(rungs[1]));
  const speciesId = markOf(content, leadingRow(rungs[2]));

  if (kind === 'concept') {
    stack.append(glyph(shapeId, level, 's40'));
    return stack;
  }
  if (kind === 'group') {
    const ghost = glyph(shapeId, 0, 's40', { ghost: true });
    ghost.classList.add('g1');
    stack.append(ghost);
    stack.append(glyph(genusId, level, 's40'));
    return stack;
  }
  const far = glyph(shapeId, 0, 's40', { ghost: true });
  far.classList.add('g2');
  const near = glyph(genusId, 0, 's40', { ghost: true });
  near.classList.add('g1');
  stack.append(far, near, glyph(speciesId, level, 's40'));
  return stack;
}
```

Expected: `node --check app/screens/progress.js` prints nothing.

- [ ] **Step 2: Add the band and the waterline**

Append to `app/screens/progress.js`:

```js
// One sentence a screen reader can hear in place of the band of marks.
function bandLabel(rung) {
  if (rung.total === 0) return `No ${rung.name} cards yet.`;
  const parts = rung.counts
    .map((count, level) => ({ count, level }))
    .filter((part) => part.count > 0)
    .map((part) => `${numberWord(part.count)} ${LEVEL_NAMES[part.level]}`);
  return `${capitalize(numberWord(rung.total))} `
    + `${rung.total === 1 ? 'card' : 'cards'}: ${parts.join(', ')}.`;
}

// The band of a rung's own cards. A species band is cut into its genera, so
// the parent a card hangs from reads off the gaps.
function band(content, rung) {
  const row = el('div', 'band');
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', bandLabel(rung));
  const size = BAND_SIZES[rung.kind];
  if (rung.kind !== 'species') {
    for (const card of rung.cards) {
      row.append(glyph(glyphIdFor(content.cards[card.id], content), card.level, size));
    }
    return row;
  }
  let group = null;
  let genus = null;
  for (const card of rung.cards) {
    if (card.genus !== genus) {
      genus = card.genus;
      group = el('span', 'grp');
      row.append(group);
    }
    group.append(glyph(glyphIdFor(content.cards[card.id], content), card.level, size));
  }
  return row;
}

function waterline(share) {
  const line = el('div', 'wline');
  line.setAttribute('aria-hidden', 'true');
  const fill = el('b');
  fill.style.width = `${Math.round(share * 1000) / 10}%`;
  line.append(fill);
  return line;
}
```

Expected: `node --check app/screens/progress.js` prints nothing.

- [ ] **Step 3: Add the channel block and the wiring**

Append to `app/screens/progress.js`:

```js
function rungRow(content, rungs, rung) {
  const row = el('div', 'rung');
  row.append(sheetStack(content, rungs, rung.kind, rung.level));
  const body = el('span');
  body.append(el('span', 'cn', rung.name));
  body.append(levelWord(rung.level));
  body.append(el('span', 'figs', `${rung.at_familiar} of ${rung.total}`));
  row.append(body);
  return row;
}

function channelBlock(content, states, today, channel) {
  const block = el('section', 'chblock');
  block.append(tick());
  const head = el('div', 'cbh');
  head.append(el('h3', null, capitalize(channelLabel(channel))));
  const due = dueCardIds({ content, states, focus: channel, today }).length;
  head.append(el('span', 'due',
    `${numberWord(due)} ${due === 1 ? 'card' : 'cards'} due`));
  block.append(head);
  block.append(el('p', 'claim', channelClaim(content, states, channel)));

  // The three rungs are built once and handed to every row, so the stacks all
  // read the same three leading cards.
  const rungs = channelRungs(content, states, channel);
  for (const rung of rungs) {
    block.append(rungRow(content, rungs, rung));
    block.append(band(content, rung));
    block.append(waterline(rung.share));
  }

  const leading = leadingConcept(content, states, channel);
  if (leading) {
    block.append(link(`#/progress/${channel}/${leading.key}`, 'opens',
      `Open ${leading.name.toLowerCase()}`));
  }
  return block;
}

export function render(root, ctx) {
  const { content, store, today } = ctx;
  const states = store.readCards();

  const finding = el('div', 'finding bleed');
  finding.append(tick());
  finding.append(el('h1', 'h2', overallFinding(content, states)));
  const tally = overallTally(content, states);
  finding.append(el('p', 'state',
    `${capitalize(numberWord(tally.shapes.at))} of `
    + `${numberWord(tally.shapes.total)} shapes are familiar or better, `
    + `${numberWord(tally.genera.at)} of ${numberWord(tally.genera.total)} genera, `
    + `${numberWord(tally.species.at)} of ${numberWord(tally.species.total)} species.`));
  root.append(finding);

  const legend = el('div', 'legend');
  legend.setAttribute('aria-hidden', 'true');
  for (let level = 0; level < LEVEL_NAMES.length; level += 1) {
    const cell = el('div');
    cell.append(glyph('lf-oak', level, 's24'));
    cell.append(el('span', null, LEVEL_NAMES[level]));
    legend.append(cell);
  }
  root.append(legend);

  for (const channel of content.channels) {
    root.append(channelBlock(content, states, today, channel));
  }

  root.append(footNav('progress'));
}
```

Expected: `node --check app/screens/progress.js` prints nothing.

- [ ] **Step 4: Delete the grid rules from the legacy CSS block**

In `app/style.css`, in the legacy block, delete these rules, which only the
old progress screen used: `.channel-row`, `.grid`, `.grid th, .grid td`,
`.grid td.cell`, `.lv-0` through `.lv-4`, and `.cell-empty`.

Keep `.progress-bar`: the session head still uses it until Task 13 lands.
Keep `.card`: Task 16 takes it out, and nothing else prints it after this
commit.

- [ ] **Step 5: Check the screen in a browser**

Open `http://localhost:8000/?content=dev#/progress`.
Expected:

- A mounted finding panel that bleeds to both edges, with a moss tick, a
  heading in Fraunces, and one sentence of counts in bark.
- The legend: five oak leaves, new through expert, under a hairline.
- Three channel blocks. Each has a tick, the channel name at about 30 px, the
  due count in italic, one claim sentence, then three rungs.
- Each rung: the sheet stack in the left 58 px column, one sheet for shapes,
  two for genera, three for species; the rung name, the level word sized by
  level, and "N of M" beside it; the band of marks indented to the column and
  bleeding to the right edge; the moss waterline under the band.
- The front sheet of the species stack is the leading species mark, which on
  a channel whose leading genus and leading species sit in different genera
  is a different leaf from the genera stack's front sheet.
- An italic "Open simple lobed" link at the end of the leaf block.
- The foot with the moss rule under Progress.

- [ ] **Step 6: Check the waterlines against the figures**

In the console run
`[...document.querySelectorAll('.wline b')].map((b) => b.style.width)` and
compare each value with the `N of M` beside the matching rung.
Expected: each width is `N / M` as a percent, and the three bars in a channel
share the same track length.

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS, no change in count.

- [ ] **Step 8: Commit**

```bash
git add app/screens/progress.js app/style.css
git commit -m "feat(progress): the rung overview, per channel, per card kind

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Progress, one shape

**Files:**
- Create: `app/screens/concept.js`
- Modify: `app/main.js` (the `progress` branch of the route table)
- Read: `docs/design/2026-09-24-specimen-plate/mockup-final.html:1185-1336`, `docs/design/2026-09-24-specimen-plate/final-progress-shape.png`

**Interfaces:**
- Consumes:
  - `conceptBreakdown(content, states, channel, conceptKey) => { channel, concept: { key, name, description }, has_card, level, due, genera } | null` — `app/logic/progress.js`, Task 2
  - `channelRung(content, states, channel, kind) => Rung` — `app/logic/progress.js`, Task 1
  - `GenusGroup` from `conceptBreakdown(...).genera` is `{ genus, genus_common, level, has_card, species }`, and each species row is `{ symbol, common, scientific, section, level }` — Task 2
  - `numberWord(count) => string`, `capitalize(text) => string`, `plural(word, count?) => string` — `app/logic/words.js`, Task 1
  - `plate(photo, options) => HTMLElement`, `credit(photo, lead?) => HTMLParagraphElement` — `app/ui/plate.js`, Task 6
  - `footNav(current) => DocumentFragment`, `tick(className?) => HTMLElement`, `trail(parts) => HTMLElement`, `levelWord(level) => HTMLElement` — `app/ui/chrome.js`, Task 6
  - `el(tag, className?, text?) => HTMLElement`, `link(href, className?, text?) => HTMLAnchorElement` — `app/ui/dom.js`, Task 6
  - `glyph(id, level, sizeClass, options?) => SVGSVGElement`, `glyphIdFor(card, content) => string`, `FALLBACK_GLYPH: string` — `app/ui/glyphs.js`, Task 4
  - `cardId(kind, channel, key) => string`, `channelLabel(channel) => string` — `app/logic/content.js`
- Produces: `render(root, ctx)` for `#/progress/<channel>/<concept>`. `ctx.channel` and `ctx.concept_key` carry the two route parts.

- [ ] **Step 1: Write the head and the two panels**

Create `app/screens/concept.js`:

```js
// One shape: where it sits among its siblings, its own card, then every
// genus and species under it as a printed index.
import { cardId, channelLabel } from '../logic/content.js';
import { channelRung, conceptBreakdown } from '../logic/progress.js';
import { numberWord, capitalize, plural } from '../logic/words.js';
import { el, link } from '../ui/dom.js';
import { footNav, tick, trail, levelWord } from '../ui/chrome.js';
import { plate, credit } from '../ui/plate.js';
import { glyph, glyphIdFor, FALLBACK_GLYPH } from '../ui/glyphs.js';

// One line about the shape's own card, by level.
const SHAPE_NOTES = [
  'This shape is not started. It is the first thing to learn here.',
  'You have met this shape once. It comes back soon.',
  'You name this shape more often than not. The work left is below it.',
  'This shape is nearly yours. The work left is below it.',
  'You name this shape on sight. The work left is below it.'
];

function notFound(root, message) {
  root.append(trail([{ text: 'Progress', href: '#/progress' }, { text: 'Unknown' }]));
  root.append(el('h1', 'display', 'Unknown shape'));
  root.append(el('p', 'where2', message));
  root.append(link('#/progress', 'foot', 'All three channels'));
  root.append(footNav('progress'));
}

// The bed of every shape on this channel, with the one you opened underlined.
function siblingStrip(content, states, channel, conceptKey) {
  const rung = channelRung(content, states, channel, 'concept');
  const strip = el('div', 'strip');
  strip.setAttribute('role', 'img');
  strip.setAttribute('aria-label',
    `The ${numberWord(rung.total)} ${channelLabel(channel)} shapes, with this one marked.`);
  for (const card of rung.cards) {
    const cell = el('span', card.key === conceptKey ? 'here' : null);
    cell.append(glyph(glyphIdFor(content.cards[card.id], content), card.level, 's32'));
    strip.append(cell);
  }
  const index = rung.cards.findIndex((card) => card.key === conceptKey);
  return { strip, index, total: rung.total };
}

function shapeCard(content, states, channel, breakdown) {
  const panel = el('div', 'shapecard bleed');
  const card = content.cards[cardId('concept', channel, breakdown.concept.key)];
  panel.append(card
    ? glyph(glyphIdFor(card, content), breakdown.level, 's86')
    : glyph(FALLBACK_GLYPH, 0, 's86'));
  const body = el('span');
  body.append(levelWord(breakdown.level));
  body.append(el('span', 'lvn', breakdown.has_card
    ? `level ${breakdown.level} of 4`
      + (breakdown.due ? `, due ${breakdown.due}` : ', not scheduled')
    : 'no card on this shape yet'));
  body.append(el('span', 'lvx', breakdown.has_card
    ? SHAPE_NOTES[breakdown.level]
    : 'This shape has no photo pool, so it carries no card.'));
  panel.append(body);
  return panel;
}
```

Expected: `node --check app/screens/concept.js` prints nothing.

- [ ] **Step 2: Add the genus index**

Append to `app/screens/concept.js`:

```js
// The species of one genus, as a printed index: no fill, no rail, one
// hairline baseline each, so the paper carries the list.
function speciesList(content, channel, rows) {
  const list = el('div', 'splist');
  for (const row of rows) {
    const line = link(`#/species/${row.symbol}`, 'spx');
    const card = content.cards[cardId('species', channel, row.symbol)];
    line.append(card
      ? glyph(glyphIdFor(card, content), row.level, 's26')
      : glyph(FALLBACK_GLYPH, row.level, 's26'));
    line.append(el('span', 'sn', row.common));
    line.append(levelWord(row.level));
    list.append(line);
  }
  return list;
}

function genusBlock(content, states, channel, breakdown, group) {
  const block = el('div', 'gengroup');
  block.append(tick());

  const head = el('div', 'genhead');
  const stack = el('span', 'rmk');
  stack.setAttribute('aria-hidden', 'true');
  const shapeCardNode = content.cards[cardId('concept', channel, breakdown.concept.key)];
  const ghost = glyph(
    shapeCardNode ? glyphIdFor(shapeCardNode, content) : FALLBACK_GLYPH,
    0, 's40', { ghost: true }
  );
  ghost.classList.add('g1');
  stack.append(ghost);
  const genusCard = content.cards[cardId('group', channel, group.genus)];
  stack.append(genusCard
    ? glyph(glyphIdFor(genusCard, content), group.level, 's40')
    : glyph(FALLBACK_GLYPH, group.level, 's40'));
  head.append(stack);

  const names = el('span');
  names.append(el('span', 'gnm', capitalize(plural(group.genus_common))));
  names.append(el('span', 'gsci', group.genus));
  head.append(names);
  head.append(levelWord(group.level));
  block.append(head);

  // A genus with two or more sections prints a heading per section, so the
  // red oaks and the white oaks read as the two groups they are.
  const sections = [...new Set(group.species.map((row) => row.section))];
  if (sections.length < 2) {
    block.append(speciesList(content, channel, group.species));
    return block;
  }
  for (const section of sections) {
    const rows = group.species.filter((row) => row.section === section);
    block.append(el('p', 'secname', section ? `section ${section}` : 'no section'));
    block.append(speciesList(content, channel, rows));
  }
  return block;
}
```

Expected: `node --check app/screens/concept.js` prints nothing.

- [ ] **Step 3: Add the wiring**

Append to `app/screens/concept.js`:

```js
export function render(root, ctx) {
  const { content, store, channel, concept_key: conceptKey } = ctx;
  if (!content.channels.includes(channel)) {
    notFound(root, `The content has no channel named ${channel}.`);
    return;
  }
  const states = store.readCards();
  const breakdown = conceptBreakdown(content, states, channel, conceptKey);
  if (!breakdown) {
    notFound(root, `The ${channelLabel(channel)} channel has no shape named ${conceptKey}.`);
    return;
  }

  root.append(trail([
    { text: 'Progress', href: '#/progress' },
    { text: breakdown.concept.name }
  ]));

  const head = el('div', 'pagehead');
  head.append(el('h1', 'display', breakdown.concept.name));
  const speciesCount = breakdown.genera
    .reduce((count, group) => count + group.species.length, 0);
  head.append(el('p', 'where2',
    `A ${channelLabel(channel)} shape with ${numberWord(breakdown.genera.length)} `
    + `${breakdown.genera.length === 1 ? 'genus' : 'genera'} under it, and `
    + `${numberWord(speciesCount)} ${speciesCount === 1 ? 'species' : 'species'} `
    + 'under those.'));
  root.append(head);

  const card = content.cards[cardId('concept', channel, conceptKey)];
  const photo = card?.photos[0] ?? null;
  if (photo) {
    root.append(plate(photo, {
      image_base: ctx.image_base,
      alt: `A ${breakdown.concept.name.toLowerCase()} ${channelLabel(channel)}`,
      shape: 'pl-shape',
      bleed: true
    }));
    root.append(credit(photo, `${breakdown.concept.name}, ${channelLabel(channel)}.`));
  }

  const siblings = siblingStrip(content, states, channel, conceptKey);
  root.append(siblings.strip);
  root.append(el('p', 'cap strip-cap',
    `Shape ${siblings.index + 1} of ${siblings.total} on the `
    + `${channelLabel(channel)} channel.`));

  root.append(shapeCard(content, states, channel, breakdown));

  for (const group of breakdown.genera) {
    root.append(genusBlock(content, states, channel, breakdown, group));
  }
  if (breakdown.genera.length === 0) {
    root.append(el('p', 'note', 'No species hangs off this shape yet.'));
  }

  root.append(link('#/progress', 'foot', 'All three channels'));
  root.append(footNav('progress'));
}
```

Expected: `node --check app/screens/concept.js` prints nothing.

- [ ] **Step 4: Add the route**

In `app/main.js`, add to the imports:

```js
import * as concept from './screens/concept.js';
```

and replace the one line that reads
`else if (parts[0] === 'progress') leave = progress.render(root, ctx);`
with:

```js
      else if (parts[0] === 'progress' && parts.length >= 3) {
        leave = concept.render(root, {
          ...ctx, channel: parts[1], concept_key: parts.slice(2).join('/')
        });
      }
      else if (parts[0] === 'progress') leave = progress.render(root, ctx);
```

`#/progress` keeps working exactly as before, so nothing that links to it
breaks.

- [ ] **Step 5: Check the screen in a browser**

Open `http://localhost:8000/?content=dev#/progress/leaf/simple_lobed`.
Expected:

- A trail reading Progress, then Simple, lobed.
- A display heading, one line of where you are, a bleeding print with its
  lower edge dissolved, and a credit line.
- The strip of every leaf shape with this one underlined in moss, and a
  caption reading "Shape 1 of 1 on the leaf channel." on the fixture.
- A mounted shape card with an 86 px mark, the level word at about 34 px, the
  level line, and one line of what is left.
- One block per genus: a tick, a two-sheet stack, the plural genus name, the
  binomial, the level word ranged right, then the species as an index of
  hairline rows, each a link.
- The oaks block prints two section headings, "section Quercus" and
  "section Lobatae".
- An italic "All three channels" link, then the foot.

- [ ] **Step 6: Check the two error paths**

Open `#/progress/leaf/no_such_shape`, then `#/progress/no_such_channel/x`.
Expected: both render the "Unknown shape" panel with a way back, and neither
leaves a blank page or logs an error.

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS, no change in count.

- [ ] **Step 8: Commit**

```bash
git add app/screens/concept.js app/main.js
git commit -m "feat(progress): the one-shape page and its route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Session and reveal

**Files:**
- Modify: `app/screens/session.js` (replaced)
- Modify: `app/style.css` (two rules appended)
- Read: `docs/design/2026-09-24-specimen-plate/mockup-final.html:837-896`, `final-session.png`, `final-reveal.png`, `final-session-80.png`, `final-session-130.png`

**Interfaces:**
- Consumes, from `app/logic/`, all already in the repo:
  - `buildSession({ content, states, log, settings, today, focus, chosen_unit }) => { card_ids: string[], unit_key: string|null }`
  - `buildPlacementDeck(content) => string[]`
  - `answerEffects({ mode, repeat, correct, grade, before, today, inv_available, requeued }) => { state, log, requeue }`
  - `requeueCard(deck, index, cardId) => string[]`
  - `dueTomorrowCount(states, today) => number`
  - `sessionPosition(shown, total) => { position, total }`
  - `emptyResults() => Results`, `accumulateAnswer(results, answer) => Results`
  - `buildQuestion({ card, content, state, excluded_hashes }) => Question`
  - `buildReveal({ question, chosen_key, content }) => Reveal`
  - `invAvailable(content, card) => boolean`, `answerPhoto(question) => Photo|null`
  - `gradeChoice(answerKey, chosenKey) => boolean`, `gradeTyped(card, text, content) => boolean`, `resolveTyped(text, kind, channel, content) => string|null`
  - `deriveGrade({ correct, guess, elapsed_ms, format }) => 'again'|'hard'|'good'`
  - `unitFor(content, unitKey) => Unit`, `channelLabel(channel) => string`
  - `LEVEL_NAMES: string[]` and `cardLevel(state) => number` — Task 1 renames the five words; the function is unchanged
  - `imageUrl` is no longer imported here: `plate` owns it
- Consumes, from `app/ui/`, all from Task 6:
  - `el(tag, className?, text?) => HTMLElement`, `link(href, className?, text?) => HTMLAnchorElement`, `srOnly(text) => HTMLSpanElement`
  - `ramp(level, options?) => HTMLElement`, `options` is `{ large?, dim?, lost? }`
  - `plate(photo, options) => HTMLElement`, `options` is `{ image_base, alt, shape, bleed?, lift?, soft?, mono?, onError? }`
  - `credit(photo, lead?) => HTMLParagraphElement`
- Produces: `render(root, ctx)` returning the teardown function, as now. Task 14 adds `Leave` and the back button to this same file, and relies on these names being in scope: `answerCount`, `deck`, `index`, `results`, `showCard`, `lastView`, `cancelled`, `renderId`, `sumRow`, `missList`, `ctx.navigate`.

**What changes, and what does not.** The grading, the scheduling, the photo
failure handling, the re-queue, the log, and the teardown all stay exactly as
they are. Only the markup changes. Two contents change with it:

- The photo caption reads "Pressed specimen, undetermined." plus the credit,
  and the `alt` text says the same, so neither names the tree before the
  reveal does.
- The format chip goes. The mockup prints no chip, and the controls say the
  format by being the format: four equal labels, a text field, or four
  plates.
- The reveal's facts panel goes. Section 4.2 lists what the reveal holds: the
  two prints, the one-line difference, the level change, and Next. The facts
  live on the species page, and the answer's name is the link to it.

- [ ] **Step 1: Add the rule the head needs**

Append to `app/style.css`, above the legacy block:

```css
/* Leave is a control, not a link: it shows the summary in place. The reset
   is wrapped in `:where()`, which weighs nothing, so the `.head .leave` rule
   above keeps the underline, the bark, and the 44px floor. */
:where(button.leave){appearance:none; -webkit-appearance:none; background:none;
  border:0; padding:0; font:inherit; cursor:pointer;}
button.leave:focus-visible{outline:2px solid var(--moss); outline-offset:2px;}
```

No rule for the screen-reader line under the gauge. `.sr` already takes it
out of the page and leaves it to the screen reader, and `display` does not
change that.

- [ ] **Step 2: Replace the screen with its head and its state**

Replace the whole of `app/screens/session.js` with the imports, the session
state, the empty-deck branch, and the running head:

```js
// The quiz loop, the reveal, and the summary. Computes nothing: every value
// comes from a logic module.
import { unitFor, channelLabel } from '../logic/content.js';
import {
  buildSession, buildPlacementDeck, answerEffects, requeueCard,
  dueTomorrowCount, sessionPosition, emptyResults, accumulateAnswer
} from '../logic/session.js';
import {
  buildQuestion, buildReveal, invAvailable, answerPhoto
} from '../logic/question.js';
import { gradeChoice, gradeTyped, resolveTyped } from '../logic/grader.js';
import { deriveGrade } from '../logic/scheduler.js';
import { LEVEL_NAMES, cardLevel } from '../logic/progress.js';
import { el, link, srOnly } from '../ui/dom.js';
import { ramp } from '../ui/chrome.js';
import { plate, credit } from '../ui/plate.js';

// The caption on a question plate never names the tree.
const UNDETERMINED = 'Pressed specimen, undetermined.';

export function render(root, ctx) {
  const { content, store, today, image_base: imageBase } = ctx;
  const mode = ctx.mode ?? 'review';
  const focus = ctx.params.get('focus') ?? 'all';
  const chosenUnit = ctx.params.get('unit') || null;
  const userSettings = store.readSettings();

  const built = mode === 'placement'
    ? { card_ids: buildPlacementDeck(content), unit_key: null }
    : buildSession({
      content, states: store.readCards(), log: store.readLog(),
      settings: userSettings, today, focus, chosen_unit: chosenUnit
    });
  const deck = built.card_ids;
  const unit = built.unit_key ? unitFor(content, built.unit_key) : null;
  const where = mode === 'placement' ? 'Placement test' : (unit?.name ?? 'Review');

  const lastHash = {};
  const failedHashes = {};
  const requeuedOnce = new Set();
  const answered = new Set();
  let results = emptyResults();
  let index = 0;
  // The counter names the card on screen. It is fixed when the card renders,
  // so the reveal keeps the number the question had, and a second render of
  // the same card, after a photo fails, keeps it too.
  let answerCount = 0;
  let shown = 0;
  // The view on screen right now, so Resume can paint it again without
  // sampling a new photo or a new set of options.
  let lastView = null;

  // Every render takes the next number. An image handler belongs to the
  // render that made it, so it does nothing once a later render has replaced
  // that one, and nothing once the router has called the teardown.
  let renderId = 0;
  let cancelled = false;
  const teardown = () => { cancelled = true; };
  const stale = (generation) => cancelled || generation !== renderId;

  function warnIfUnsaved() {
    if (!store.available) ctx.banner(ctx.storage_banner);
  }

  if (deck.length === 0) {
    const placement = mode === 'placement';
    root.append(el('h1', 'display', placement ? 'No cards to place' : 'Nothing to study'));
    root.append(el('p', 'where2', placement
      ? 'The placement test needs level-1 concept cards, and this content set has none.'
      : 'Nothing is due in this focus, and no new card is ready for it today.'));
    root.append(link('#/', 'btn', 'Home'));
    return teardown;
  }

  // ---------- the running head and the printed gauge ----------

  function head(question) {
    const place = sessionPosition(shown, deck.length);
    const bar = el('div', 'head');
    const leave = el('button', 'leave', 'Leave');
    leave.type = 'button';
    leave.addEventListener('click', () => onLeave());
    bar.append(leave);
    bar.append(el('span', 'where',
      `${where}, ${channelLabel(question.channel)} card `
      + `${place.position} of ${place.total}`));
    root.append(bar);

    const gauge = el('div', 'gauge');
    gauge.setAttribute('aria-hidden', 'true');
    for (let i = 1; i <= place.total; i += 1) {
      if (i < place.position) gauge.append(el('i', 'done'));
      else if (i === place.position) gauge.append(el('i', 'now'));
      else gauge.append(el('i'));
    }
    root.append(gauge);
    root.append(srOnly(`Card ${place.position} of ${place.total}.`));
  }
```

The file does not parse on its own yet: `render` is still open and the
functions below it are still to come. Nothing to run at this step.

- [ ] **Step 3: Add the question**

Inside `render`, below the head, append:

```js
  // ---------- the question ----------

  function excludedFor(cardId) {
    const failed = failedHashes[cardId] ?? [];
    return lastHash[cardId] ? [...failed, lastHash[cardId]] : [...failed];
  }

  function guessBox() {
    const label = el('label', 'guessed');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'guess_box';
    // The printed box sits after the input, so `input:checked ~ .box` inks it.
    label.append(input, el('span', 'box'), el('span', null, 'I guessed'));
    return { label, input };
  }

  function paintQuestion(question, card, generation, resumeAt = 0) {
    root.textContent = '';
    head(question);

    // The answer clock. `deriveGrade` reads the elapsed time against the
    // format's own threshold, so a card painted again by Resume must carry
    // the time it already spent rather than start from zero. `lastView` is
    // set here, inside the closure, so it can hand the clock back.
    let startedAt = resumeAt;
    lastView = () => paintQuestion(question, card, (renderId += 1), startedAt);

    const guess = guessBox();
    const submit = (chosenKey, typedText) => {
      const elapsed = startedAt ? Date.now() - startedAt : 0;
      answerCard(question, card, chosenKey, typedText, guess.input.checked, elapsed);
    };

    if (question.format === 'inv') {
      const grid = el('div', 'invkey');
      let pending = question.options.length;
      for (const option of question.options) {
        const button = el('button');
        button.type = 'button';
        // The session keeps its own failure handling, so it passes `onError`
        // rather than letting `plate` drop the figure on its own.
        const figure = plate(option.photo, {
          image_base: imageBase,
          alt: 'Option photo',
          shape: null,
          soft: true,
          onError: () => {
            if (stale(generation)) return;
            pending -= 1;
            if (option.key === question.answer_key) {
              console.warn(`Answer photo failed for ${card.id}. Skipping the card this session.`);
              index += 1;
              showCard();
              return;
            }
            button.remove();
            if (pending === 0 && !startedAt) startedAt = Date.now();
          }
        });
        const image = figure.querySelector('img');
        image.addEventListener('load', () => {
          if (stale(generation)) return;
          pending -= 1;
          if (pending === 0 && !startedAt) startedAt = Date.now();
        });
        button.append(figure);
        button.addEventListener('click', () => submit(option.key, ''));
        grid.append(button);
      }
      root.append(el('p', 'prompt', question.prompt));
      root.append(grid);
      root.append(guess.label);
      lastHash[card.id] = answerPhoto(question)?.hash ?? null;
      return;
    }

    const figure = plate(question.photo, {
      image_base: imageBase,
      alt: UNDETERMINED,
      shape: 'pl-hero',
      bleed: true,
      onError: () => {
        if (stale(generation)) return;
        failedHashes[card.id] = [...(failedHashes[card.id] ?? []), question.photo.hash];
        console.warn(`Image failed: img/${question.photo.hash}.jpg`);
        showCard();
      }
    });
    figure.style.marginTop = '12px';
    const image = figure.querySelector('img');
    image.addEventListener('load', () => {
      if (stale(generation)) return;
      // Resume paints this view again and the cached image fires load again.
      // The clock only starts once.
      if (!startedAt) startedAt = Date.now();
    });
    root.append(figure);
    root.append(credit(question.photo, UNDETERMINED));
    lastHash[card.id] = question.photo.hash;

    root.append(el('p', 'prompt', question.prompt));

    if (question.format === 'typed') {
      const form = el('div', 'typed');
      const field = document.createElement('input');
      field.type = 'text';
      field.id = 'typed_answer';
      field.autocomplete = 'off';
      field.setAttribute('aria-label', question.prompt);
      const go = el('button', 'btn', 'Answer');
      go.type = 'button';
      go.addEventListener('click', () => submit(null, field.value));
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submit(null, field.value);
      });
      form.append(field, go);
      root.append(form);
    } else {
      // The four labels share one width: common name at the left margin,
      // binomial ranged right, so the names line up the way an index does.
      const key = el('div', 'key');
      for (const option of question.options) {
        const button = el('button', 'pick');
        button.type = 'button';
        button.append(el('span', 'nm', option.label));
        if (option.sublabel) button.append(el('span', 'bn', option.sublabel));
        button.addEventListener('click', () => submit(option.key, ''));
        key.append(button);
      }
      root.append(key);
    }
    root.append(guess.label);
  }

  function showCard() {
    if (index >= deck.length) { showSummary(); return; }
    const cardId = deck[index];
    const card = content.cards[cardId];
    const state = mode === 'placement' ? null : store.readCards()[cardId];
    const question = buildQuestion({
      card, content, state, excluded_hashes: excludedFor(cardId)
    });

    // buildQuestion samples again with nothing excluded when the exclusion
    // list covers the whole pool, so it can hand back a photo that already
    // failed. The card waits for another session once every photo has failed.
    const failed = failedHashes[cardId] ?? [];
    const exhausted = question.format !== 'inv'
      && (!question.photo || card.photos.every((photo) => failed.includes(photo.hash)));
    if (exhausted) {
      console.warn(`Photo pool exhausted for ${cardId}. Skipping the card this session.`);
      index += 1;
      showCard();
      return;
    }

    const generation = (renderId += 1);
    shown = answerCount + 1;
    // `paintQuestion` sets `lastView` itself, because only it can see the
    // answer clock that Resume has to carry over.
    paintQuestion(question, card, generation);
  }
```

Expected: nothing to run yet. `render` is still open.

- [ ] **Step 4: Add the answer**

Inside `render`, below the question, append:

```js
  // ---------- one answer ----------

  function answerCard(question, card, chosenKey, typedText, guessed, elapsedMs) {
    const correct = question.format === 'typed'
      ? gradeTyped(card, typedText, content)
      : gradeChoice(question.answer_key, chosenKey);
    const grade = deriveGrade({
      correct, guess: guessed, elapsed_ms: elapsedMs, format: question.format
    });
    const repeat = answered.has(card.id);
    answered.add(card.id);
    answerCount += 1;
    const before = store.readCards()[card.id];

    const effects = answerEffects({
      mode, repeat, correct, grade, before, today,
      inv_available: invAvailable(content, card),
      requeued: requeuedOnce.has(card.id)
    });

    if (effects.state) {
      store.writeCard(card.id, effects.state);
      warnIfUnsaved();
    }
    if (effects.log) {
      store.appendLog({
        card: card.id,
        at: new Date().toISOString(),
        day: today,
        grade,
        format: question.format,
        options: question.option_count,
        elapsed_ms: elapsedMs,
        answer: question.format === 'typed' ? typedText : chosenKey,
        interval_before: before?.interval ?? 0,
        ease_before: before?.ease ?? 2.5
      });
      warnIfUnsaved();
    }

    let revealKey = chosenKey;
    if (correct) revealKey = question.answer_key;
    else if (question.format === 'typed') {
      revealKey = resolveTyped(typedText, card.kind, card.channel, content);
    }
    const reveal = buildReveal({ question, chosen_key: revealKey, content });
    if (!repeat && reveal.missing_edge) {
      store.recordMissingEdge(reveal.missing_edge);
      warnIfUnsaved();
    }

    // Ruling R2: the tallies and the promoted list belong to the logic module.
    results = accumulateAnswer(results, {
      card_id: card.id,
      repeat,
      correct,
      before,
      after: effects.state,
      miss: correct ? null : {
        label: reveal.answer.label,
        chosen: reveal.chosen ? reveal.chosen.label : typedText,
        diagnostic: reveal.diagnostic ? reveal.diagnostic.text : ''
      }
    });

    if (effects.requeue) {
      requeuedOnce.add(card.id);
      deck.splice(0, deck.length, ...requeueCard(deck, index, card.id));
      index -= 1;
    }

    const levels = {
      before: before ? cardLevel(before) : 0,
      after: effects.state ? cardLevel(effects.state) : (before ? cardLevel(before) : 0)
    };
    lastView = () => paintReveal(question, reveal, typedText, correct, levels);
    paintReveal(question, reveal, typedText, correct, levels);
  }
```

Expected: nothing to run yet. `render` is still open.

- [ ] **Step 5: Add the reveal**

Inside `render`, below the answer, append:

```js
  // ---------- the reveal ----------

  function levelLine(levels) {
    const row = el('div', 'levelrow');
    row.append(ramp(levels.after, { large: true, lost: levels.after < levels.before }));
    let text = `Level ${levels.after}, ${LEVEL_NAMES[levels.after]}`;
    if (levels.after > levels.before) text += `, up from ${levels.before}`;
    else if (levels.after < levels.before) text += `, down from ${levels.before}`;
    row.append(el('span', 'lv', `${text}.`));
    return row;
  }

  function paintReveal(question, reveal, typedText, correct, levels) {
    renderId += 1;
    root.textContent = '';
    head(question);

    const panel = el('div', 'reveal');
    const verdictWrap = el('div', 'verdict-wrap');
    verdictWrap.append(el('p', 'verdict', correct ? 'Right.' : 'Not this one.'));
    const title = el('h1', 'display');
    if (question.kind === 'species') {
      title.append(link(`#/species/${reveal.answer.key}`, 'answer-link', reveal.answer.label));
    } else {
      title.textContent = reveal.answer.label;
    }
    verdictWrap.append(title);
    if (reveal.answer.sublabel) {
      verdictWrap.append(el('p', 'sci-small', reveal.answer.sublabel));
    }
    panel.append(verdictWrap);

    if (!correct && reveal.chosen && reveal.chosen.photo && reveal.answer.photo) {
      const heads = el('div', 'pair-head');
      const right = el('span', 'ok');
      right.append(el('i'));
      right.append(document.createTextNode(`${reveal.answer.label}, correct`));
      const wrong = el('span', 'no');
      wrong.append(el('i'));
      wrong.append(el('b', null, reveal.chosen.label));
      wrong.append(document.createTextNode(', your pick'));
      heads.append(right, wrong);
      panel.append(heads);

      const pair = el('div', 'pair bleed');
      const a = plate(reveal.answer.photo, {
        image_base: imageBase, alt: `${reveal.answer.label}, the answer`, shape: 'pl-a'
      });
      const b = plate(reveal.chosen.photo, {
        image_base: imageBase, alt: `${reveal.chosen.label}, your pick`, shape: 'pl-b', lift: true
      });
      pair.append(a, b);
      panel.append(pair);
    } else if (reveal.answer.photo) {
      panel.append(plate(reveal.answer.photo, {
        image_base: imageBase,
        alt: `${reveal.answer.label}, the answer`,
        shape: 'pl-leaf',
        bleed: true
      }));
      panel.append(credit(reveal.answer.photo));
    }

    if (!correct && question.format === 'typed') {
      panel.append(el('p', 'compare', `You typed: ${typedText}`));
    }
    if (reveal.diagnostic) {
      panel.append(el('p', 'compare', reveal.diagnostic.text));
      if (reveal.diagnostic.ref) panel.append(el('p', 'cap', reveal.diagnostic.ref));
    }

    panel.append(levelLine(levels));

    const next = el('button', 'btn', 'Next');
    next.type = 'button';
    next.addEventListener('click', () => { index += 1; showCard(); });
    panel.append(next);
    root.append(panel);
  }
```

Expected: nothing to run yet. `render` is still open.

- [ ] **Step 6: Add the summary and the wiring**

Inside `render`, below the reveal, append:

```js
  // ---------- the summary ----------

  function sumRow(key, value) {
    const row = el('div', 'sumrow');
    row.append(el('span', 'sk', key));
    row.append(el('span', 'sv', value));
    return row;
  }

  function missList() {
    const list = el('ul', 'misslist');
    for (const miss of results.misses) {
      list.append(el('li', null,
        `${miss.label} against ${miss.chosen}. ${miss.diagnostic}`));
    }
    return list;
  }

  function showSummary() {
    renderId += 1;
    lastView = null;
    root.textContent = '';
    root.append(el('h1', 'display', 'Session done'));
    root.append(sumRow('right', String(results.right)));
    root.append(sumRow('missed', String(results.missed)));
    root.append(sumRow('promoted', String(results.promoted.length)));
    root.append(sumRow('demoted', String(results.demoted.length)));
    root.append(sumRow('due tomorrow',
      String(dueTomorrowCount(store.readCards(), today))));

    if (results.misses.length) {
      root.append(el('div', 'tick'));
      root.append(el('h2', 'sec-h', 'The ones you missed'));
      root.append(missList());
    }

    if (!store.available) {
      root.append(el('p', 'note',
        'This browser blocks local storage, so nothing was saved. Open Settings '
        + 'and export before you close the tab.'));
    } else if (store.shouldPromptExport(today)) {
      root.append(el('p', 'note',
        'It has been a month since your last export. Open Settings and export '
        + 'your progress.'));
    }

    const row = el('div', 'btnrow');
    const again = el('button', 'btn', 'Another session');
    again.type = 'button';
    again.addEventListener('click', () => {
      ctx.navigate(`/session?focus=${focus}${chosenUnit ? `&unit=${chosenUnit}` : ''}`);
      window.location.reload();
    });
    row.append(again);
    row.append(link('#/', 'btn ghost', 'Home'));
    root.append(row);
  }

  // Leaving ends the session and goes home. Every answer is graded and stored
  // the moment it is given, so nothing on the way out is lost.
  function onLeave() {
    ctx.navigate('/');
  }

  showCard();
  return teardown;
}
```

Expected: `node --check app/screens/session.js` prints nothing.

- [ ] **Step 7: Check the question screen in a browser**

Open `http://localhost:8000/?content=dev#/session?focus=leaf&unit=leaf_types`.
Expected:

- The head: a "Leave" control at the left, 44 px tall, and the unit name with
  "leaf card 1 of N" at the right.
- The printed gauge: one tick per card, the first in moss and taller.
- A print bleeding to both edges, with the caption "Pressed specimen,
  undetermined." and the credit, and the author as a link.
- The prompt in Fraunces at about 26 px.
- Four answer labels, all one width, the common name at the left and the
  binomial ranged right, on a lichen wash.
- "I guessed" with a 20 px outlined box, the whole row at least 48 px tall.
- No format chip, no running foot.
- The print appears already in its own treatment. It never paints once with
  its own ground and then snaps to a bright print.

- [ ] **Step 8: Check the reveal**

Answer the card wrongly.
Expected:

- The same head and gauge, the tick for this card still in moss.
- "Not this one." in bark, then the correct name as the largest thing on the
  screen, the binomial under it in italic Fraunces.
- Two labels side by side, "correct" in moss over a 3 px moss rule and "your
  pick" struck through in bark over a faded rule.
- Two prints side by side at one scale, bleeding to both edges.
- One line of difference, then the five level squares with the lost square
  outlined in sap, then the level sentence, then a full-width Next.
- The verdict rises, the rules ink in, the prints press in, and the strike
  lands, all within about half a second.

- [ ] **Step 9: Check the motion guard**

In the browser's rendering panel set `prefers-reduced-motion` to `reduce` and
answer another card.
Expected: the reveal appears at once, with no animation and no transition.

- [ ] **Step 10: Check the answer key at root 130 percent and 360 px**

Set the width to 360 px and run
`document.documentElement.style.fontSize = '130%'`.
Expected: each answer label wraps its binomial to a second line rather than
squeezing the common name, every label is still one width, and there is no
horizontal scrollbar.

- [ ] **Step 11: Delete the session rules from the legacy CSS block**

In `app/style.css`, in the legacy block, delete `.progress-bar`,
`.progress-bar > div`, `.options`, `.options.inv`, `.options.inv img`, and
`.chip`. The old session screen was the only one that used them.

Keep `.photo`, `.photo-pair`, `.attribution`, and `.option-sub`:
`app/screens/species.js` still prints all four until Task 15 lands.

- [ ] **Step 12: Run the tests**

Run: `npm test`
Expected: PASS, no change in count. The logic the session screen calls is
covered by `tests/session.test.js` and `tests/question.test.js`, which this
task does not touch.

- [ ] **Step 13: Commit**

```bash
git add app/screens/session.js app/style.css
git commit -m "feat(session): the plate session, the printed gauge, and the paired reveal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Leaving a session

**Files:**
- Modify: `app/screens/session.js` (`onLeave` replaced, the back button armed)

**Interfaces:**
- Consumes, all names inside Task 13's `render` closure:
  - `answerCount: number`, `results: Results`, `deck: string[]`, `renderId: number`, `cancelled: boolean`
  - `lastView: (() => void) | null`
  - `showCard() => void`, `sumRow(key, value) => HTMLElement`, `missList() => HTMLElement`
  - `el`, `link` from `app/ui/dom.js`, already imported by that file
  - `ctx.navigate(hash) => void` from `app/main.js`
- Produces: no new export. `render`'s returned teardown now also removes the
  `popstate` listener. Two new names in the same closure:
  `showLeaveSummary() => void` and `leaveToHome() => void`.

**How it holds together.** Every answer is graded and stored the moment it is
given, so leaving discards nothing and an unanswered card stays due. That is
what makes Resume honest: the deck array, the index, and the tallies are all
still in memory, and Resume paints the same view again, with the same photo
and the same options, because `lastView` is a closure over the question that
was already built.

**Resume keeps the answer clock.** `paintQuestion` takes the elapsed time it
already holds and hands it back through `lastView`, so a card you left and
came back to is graded on the time you actually spent on it. Without that,
`deriveGrade` would read the time from the moment the image loaded again,
which is under every format's threshold, and a resumed card would grade
`good` on time it never took.

The back button uses one extra history entry. When the session opens it
pushes a duplicate of its own hash. A back press pops that duplicate, so the
URL does not change and no `hashchange` fires; only `popstate` does. The
handler shows the leave summary and pushes the duplicate again, so the next
back press behaves the same way.

**Going home takes a replace, not a push.** `ctx.navigate('/')` sets the
hash, which pushes an entry. After a pop that would put a session entry back
in front of the reader, so a second back press would return to a session that
is over. `leaveToHome` replaces the current entry with `#/` instead and tells
the router by hand, because a replace fires no `hashchange` of its own. One
case is left over: leaving by the Leave control, with nothing answered, and
before any back press. The duplicate is replaced but the session's own entry
is still behind it, so a back press from home opens that URL and starts a
fresh session, which is what the URL means.

- [ ] **Step 1: Replace `onLeave` and add the summary**

In `app/screens/session.js`, near the bottom of `render`, replace the
`onLeave` stub and the two comment lines above it:

```js
  // Leaving ends the session and goes home. Every answer is graded and stored
  // the moment it is given, so nothing on the way out is lost.
  function onLeave() {
    ctx.navigate('/');
  }
```

with:

```js
  // ---------- leaving ----------

  // Home, without leaving the session in the history. `navigate` would push a
  // new entry on top of the one the back press just took off, so a second
  // back press would come straight back into a session that is over. A
  // replace drops that entry instead. A replace fires no `hashchange`, so
  // the router is told by hand.
  function leaveToHome() {
    history.replaceState({ dendro: 'left' }, '', '#/');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  function showLeaveSummary() {
    renderId += 1;
    root.textContent = '';
    root.append(el('h1', 'display', 'Where you got to'));
    const done = results.right + results.missed;
    root.append(el('p', 'where2',
      `${done} of ${deck.length} cards answered. Every answer is already saved. `
      + 'The cards you have not reached stay due.'));
    root.append(sumRow('right', String(results.right)));
    root.append(sumRow('missed', String(results.missed)));
    root.append(sumRow('promoted', String(results.promoted.length)));
    root.append(sumRow('demoted', String(results.demoted.length)));

    if (results.misses.length) {
      root.append(el('div', 'tick'));
      root.append(el('h2', 'sec-h', 'The ones you missed'));
      root.append(missList());
    }

    const row = el('div', 'btnrow');
    const resume = el('button', 'btn', 'Resume');
    resume.type = 'button';
    resume.addEventListener('click', () => {
      if (lastView) lastView();
      else showCard();
    });
    row.append(resume);
    const home = el('button', 'btn ghost', 'Home');
    home.type = 'button';
    home.addEventListener('click', () => leaveToHome());
    row.append(home);
    root.append(row);
  }

  // With no card answered there is nothing to summarise, so Leave goes home
  // at once. The browser's back button lands here too.
  function onLeave() {
    if (answerCount === 0) { leaveToHome(); return; }
    showLeaveSummary();
  }
```

- [ ] **Step 2: Declare the popstate handler and the teardown**

In `app/screens/session.js`, replace the three lines that declare the
teardown:

```js
  let cancelled = false;
  const teardown = () => { cancelled = true; };
  const stale = (generation) => cancelled || generation !== renderId;
```

with:

```js
  let cancelled = false;
  const stale = (generation) => cancelled || generation !== renderId;

  // The back press. One extra history entry, a duplicate of this screen's own
  // hash, is pushed in the step below. A back press pops that duplicate, so
  // the URL does not change, no hashchange fires, and the router leaves this
  // screen in place. Only popstate runs, and it does what Leave does. The
  // handler pushes the duplicate again, so the next back press behaves the
  // same way.
  function onPopState() {
    if (cancelled) return;
    if (answerCount === 0) { leaveToHome(); return; }
    history.pushState({ dendro: 'session' }, '', window.location.hash);
    showLeaveSummary();
  }

  // `removeEventListener` on a listener that was never added does nothing, so
  // this is safe on the empty deck, which returns before the listener goes on.
  const teardown = () => {
    cancelled = true;
    window.removeEventListener('popstate', onPopState);
  };
```

These lines sit above the empty-deck branch, so the branch still returns a
teardown that works. `onPopState` calls `leaveToHome` and `showLeaveSummary`,
which Step 1 declared near the bottom of the same function. A function
declaration hoists to the top of its own scope, so both names resolve.

- [ ] **Step 3: Arm the history entry below the empty-deck branch**

The entry and the listener must go on after the empty-deck branch, not
before. An empty deck returns out of `render` and never removes the listener
by hand, so arming first would leave the listener live and one dead entry in
the history: a back press would land on a screen that is gone.

In `app/screens/session.js`, find the end of the empty-deck branch:

```js
    root.append(link('#/', 'btn', 'Home'));
    return teardown;
  }
```

and directly below that closing brace, add:

```js
  // The deck holds at least one card, so the screen is going to stay. Push a
  // duplicate of this hash for the back press to pop.
  history.pushState({ dendro: 'session' }, '', window.location.hash);
  window.addEventListener('popstate', onPopState);
```

Expected: `node --check app/screens/session.js` prints nothing.

- [ ] **Step 4: Check Leave with nothing answered**

Open `#/session?focus=leaf&unit=leaf_types` and tap Leave without answering.
Expected: home, immediately, and no summary.

- [ ] **Step 5: Check Leave with cards answered**

Answer two cards, tap Next on the second reveal, then tap Leave.
Expected:

- A heading "Where you got to", a line reading "2 of N cards answered", four
  summary rows, and the missed list when a card was missed.
- Two buttons side by side, Resume filled moss and Home outlined.
- Resume paints the same card again, with the same photo and the same four
  labels, and the gauge shows the same tick in moss.
- Resume does not restart the answer clock. Leave a card on screen for a
  minute, tap Leave, tap Resume, answer it at once, and the reveal still
  reports the level a slow answer earns, not a fast one.

- [ ] **Step 6: Check the back button**

Answer one card, then press the browser's back button.
Expected: the leave summary, not home, and the URL still ends
`#/session?focus=leaf&unit=leaf_types`. Press back again: the summary again.
Tap Home: the home screen, and one more back press stays on home rather than
opening the session again.

Then open a session with an empty deck, `#/session?focus=fruit`, on a fresh
profile where no fruit card is due, and press back.
Expected: the previous page, not a blank screen and no console error.

- [ ] **Step 7: Check that leaving saved the answers**

From the leave summary tap Home, then open `#/progress`.
Expected: the cards you answered have moved off level 0, and the bands and
waterlines have changed to match.

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: PASS, no change in count.

- [ ] **Step 9: Commit**

```bash
git add app/screens/session.js
git commit -m "feat(session): Leave, the resume summary, and the back button

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Species

**Files:**
- Modify: `app/screens/species.js` (replaced)
- Modify: `app/logic/scheduler.js` (append `daysBetween`)
- Modify: `app/logic/store.js` (its private `daysBetween` deleted, the shared one imported)
- Modify: `app/style.css` (the last of the old species rules removed from the legacy block)
- Test: `tests/scheduler.test.js` (append)
- Read: `docs/design/2026-09-24-specimen-plate/mockup-final.html:1692-1764`, `final-species.png`

**Interfaces:**
- Consumes:
  - `cardId(kind, channel, key) => string` — `app/logic/content.js`
  - `conceptFor(content, channel, key) => { key, name, description } | null` — `app/logic/content.js`
  - `varietyCardChannels(content, symbol, varietyKey) => string[]` — `app/logic/content.js`
  - `channelLabel(channel) => string` — `app/logic/content.js`
  - `cardLevel(state) => number`, `speciesLevel(symbol, content, states) => number` — `app/logic/progress.js`
  - `daysBetween(fromDate, toDate) => number` — `app/logic/scheduler.js`, added in this task
  - `el(tag, className?, text?) => HTMLElement` — `app/ui/dom.js`, Task 6
  - `footNav(current) => DocumentFragment`, `tick(className?) => HTMLElement`, `trail(parts) => HTMLElement`, `ramp(level, options?) => HTMLElement`, `levelWord(level) => HTMLElement` — `app/ui/chrome.js`, Task 6
  - `plate(photo, options) => HTMLElement`, `credit(photo, lead?) => HTMLParagraphElement` — `app/ui/plate.js`, Task 6
  - `glyph(id, level, sizeClass, options?) => SVGSVGElement`, `glyphIdFor(card, content) => string` — `app/ui/glyphs.js`, Task 4
  - `numberWord(count) => string`, `capitalize(text) => string` — `app/logic/words.js`, Task 1
  - `content.species[symbol]` is `{ common, scientific, genus, genus_common, section, family, native_status, arrangement, audubon_name, habitat, range, planted_states, height_ft, elevation_ft, concepts, varieties, retired, retired_reason, retired_at }`
- Produces: `render(root, ctx)`. One new export from `app/logic/scheduler.js`:
  `daysBetween(fromDate: string, toDate: string) => number`, which
  `app/logic/store.js` then imports in place of its own private copy.

The Quiz button the mockup prints is left out: no route quizzes one species,
and section 4.7 does not list one.

- [ ] **Step 1: Write the failing test for `daysBetween`**

Append to `tests/scheduler.test.js`:

```js
test('the day count between two local dates is a whole number of days', () => {
  assert.equal(daysBetween('2026-09-24', '2026-09-24'), 0);
  assert.equal(daysBetween('2026-09-24', '2026-09-25'), 1);
  assert.equal(daysBetween('2026-09-24', '2026-10-15'), 21);
  assert.equal(daysBetween('2026-09-25', '2026-09-24'), -1);
  // across a daylight-saving change, which a local Date would get wrong
  assert.equal(daysBetween('2026-10-30', '2026-11-06'), 7);
});
```

and add `daysBetween` to that file's import from `../app/logic/scheduler.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/scheduler.test.js`
Expected: FAIL with `does not provide an export named 'daysBetween'`.

- [ ] **Step 3: Add `daysBetween`**

Append to `app/logic/scheduler.js`:

```js
// Whole days from one local date to another. Both dates are YYYY-MM-DD, and
// the arithmetic runs in UTC, so a daylight-saving change cannot shift the
// answer by a day.
export function daysBetween(fromDate, toDate) {
  const asUtc = (text) => {
    const [year, month, day] = text.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((asUtc(toDate) - asUtc(fromDate)) / 86400000);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/scheduler.test.js`
Expected: PASS, the new test included.

- [ ] **Step 5: Point the store at the shared `daysBetween`**

`app/logic/store.js` carries its own private copy of the same arithmetic. Two
copies of one rule drift, so the store now reads the exported one. Neither
module imports the other today, so this adds no cycle.

In `app/logic/store.js`, delete these four lines:

```js
function daysBetween(fromDate, toDate) {
  const parse = (d) => Date.UTC(...d.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((parse(toDate) - parse(fromDate)) / 86400000);
}
```

and add this line at the top of the file, above `const KEYS`:

```js
import { daysBetween } from './scheduler.js';
```

Run: `npm test`
Expected: PASS, no failures. `tests/store.test.js` already covers the two
places the store uses the day count.

- [ ] **Step 6: Replace the species screen with its head**

Replace the whole of `app/screens/species.js` with the imports, the crop
table, and the small text helpers:

```js
// One species as a specimen sheet: the names, the plates, two display
// numerals, one paragraph, a short fact list, the cards, and the varieties.
import {
  cardId, conceptFor, varietyCardChannels, channelLabel
} from '../logic/content.js';
import { cardLevel, speciesLevel } from '../logic/progress.js';
import { daysBetween } from '../logic/scheduler.js';
import { numberWord, capitalize } from '../logic/words.js';
import { el } from '../ui/dom.js';
import { footNav, tick, trail, ramp, levelWord } from '../ui/chrome.js';
import { plate, credit } from '../ui/plate.js';
import { glyph, glyphIdFor } from '../ui/glyphs.js';

// The crop each channel's plate gets. A plate with its own ground dissolves
// on four sides; a bright scan multiplies into the paper.
const PLATE_SHAPES = { leaf: 'pl-leaf', bark: 'pl-bark', fruit: 'pl-bark' };

function dueText(state, today) {
  if (!state || !state.due) return 'Not started';
  const days = daysBetween(today, state.due);
  if (days <= 0) return 'Due now';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${numberWord(days)} days`;
}

// An absent field drops its whole row, so an optional field needs no guard.
function fact(list, term, value) {
  if (value === undefined || value === null || value === '') return;
  list.append(el('dt', null, term));
  list.append(el('dd', null, String(value)));
}

function statusLine(record) {
  const parts = [capitalize(record.native_status)];
  if (record.section) {
    const genus = record.genus_common ? `${record.genus_common}s` : record.genus;
    parts.push(`Section ${record.section}, the ${genus}`);
  }
  return `${parts.join('. ')}.`;
}

// The page's own trail names the shape the species hangs from, which the foot
// cannot. With no leaf concept it names the progress overview instead.
function trailFor(content, record) {
  const bucket = record.concepts?.leaf;
  const concept = bucket ? conceptFor(content, 'leaf', bucket) : null;
  const parent = concept
    ? { text: concept.name, href: `#/progress/leaf/${bucket}` }
    : { text: 'Progress', href: '#/progress' };
  return trail([parent, { text: record.common[0] }]);
}
```

Expected: `node --check app/screens/species.js` prints nothing.

- [ ] **Step 7: Add the card rows and the plate sections**

Append to `app/screens/species.js`:

```js
function cardRow(content, states, symbol, channel, today) {
  const card = content.cards[cardId('species', channel, symbol)];
  if (!card) return null;
  const state = states[card.id];
  const level = cardLevel(state);
  const row = el('div', 'card-row');
  const left = el('span');
  left.append(el('span', 'cn', capitalize(channelLabel(channel))));
  left.append(levelWord(level));
  left.append(el('span', 'lvn', `level ${level} of 4`));
  row.append(left);
  const right = el('span', 'rt');
  right.append(ramp(level, { large: true }));
  right.append(el('span', 'due', dueText(state, today)));
  row.append(right);
  return row;
}

function plateSection(content, symbol, channel, imageBase, record) {
  const section = el('div', 'sec');
  section.append(tick());
  section.append(el('h3', 'sec-h', capitalize(channelLabel(channel))));
  const card = content.cards[cardId('species', channel, symbol)];
  const photo = card?.photos[0] ?? null;
  if (!photo) {
    section.append(el('p', 'fact-line',
      `No ${channelLabel(channel)} plate is collected yet.`));
    return section;
  }
  const figure = plate(photo, {
    image_base: imageBase,
    alt: `${record.common[0]}, ${channelLabel(channel)}`,
    shape: PLATE_SHAPES[channel] ?? 'pl-bark',
    bleed: true,
    soft: true,
    mono: channel === 'bark'
  });
  figure.style.marginTop = '14px';
  section.append(figure);
  section.append(credit(photo));
  return section;
}
```

Expected: `node --check app/screens/species.js` prints nothing.

- [ ] **Step 8: Add the wiring**

Append to `app/screens/species.js`:

```js
export function render(root, ctx) {
  const { content, store, symbol, today, image_base: imageBase } = ctx;
  const record = content.species[symbol];
  if (!record) {
    root.append(trail([{ text: 'Progress', href: '#/progress' }, { text: 'Unknown' }]));
    root.append(el('h1', 'display', 'Unknown species'));
    root.append(el('p', 'where2', `The content holds no record for ${symbol}.`));
    root.append(footNav('progress'));
    return;
  }
  const states = store.readCards();

  root.append(trailFor(content, record));

  const title = el('div', 'sp-title');
  title.append(el('h1', 'display', record.common[0]));
  title.append(el('p', 'sci', record.scientific));
  title.append(el('p', 'det2', statusLine(record)));
  root.append(title);

  // A retired species keeps its record and its facts. It has no cards, so
  // every card row and plate below reads as a fact and not an error.
  if (record.retired) {
    root.append(el('p', 'note',
      `Retired: ${record.retired_reason} (${record.retired_at})`));
  }

  // The hero plate is the first channel that carries a photo. Every other
  // channel gets its own section below.
  const heroChannel = content.channels.find((channel) => {
    const card = content.cards[cardId('species', channel, symbol)];
    return Boolean(card?.photos[0]);
  }) ?? null;
  if (heroChannel) {
    const photo = content.cards[cardId('species', heroChannel, symbol)].photos[0];
    const figure = plate(photo, {
      image_base: imageBase,
      alt: `${record.common[0]}, ${channelLabel(heroChannel)}`,
      shape: PLATE_SHAPES[heroChannel] ?? 'pl-leaf',
      bleed: true
    });
    figure.style.marginTop = '20px';
    root.append(figure);
    root.append(credit(photo, `${capitalize(channelLabel(heroChannel))}.`));
  }

  if (record.height_ft || record.elevation_ft) {
    const spans = el('div', 'spans');
    if (record.height_ft) {
      const cell = el('div');
      cell.append(el('b', null, `${record.height_ft[0]}–${record.height_ft[1]}`));
      cell.append(el('span', null, 'feet tall'));
      spans.append(cell);
    }
    if (record.elevation_ft) {
      const cell = el('div');
      cell.append(el('b', null,
        `${record.elevation_ft[0].toLocaleString('en-US')}–`
        + `${record.elevation_ft[1].toLocaleString('en-US')}`));
      cell.append(el('span', null, 'feet elevation'));
      spans.append(cell);
    }
    root.append(spans);
  }

  const prose = [record.range?.text, record.habitat].filter(Boolean).join('. ');
  if (prose) root.append(el('p', 'sp-prose', `${prose}.`));

  const facts = el('dl', 'facts');
  const native = record.range?.states ?? [];
  if (native.length) {
    fact(facts, 'native in', `${numberWord(native.length)} states`);
  }
  if ((record.planted_states ?? []).length) {
    fact(facts, 'planted in', record.planted_states.join(', '));
  }
  for (const channel of content.channels) {
    const bucket = record.concepts?.[channel];
    if (!bucket) continue;
    const concept = conceptFor(content, channel, bucket);
    fact(facts, channelLabel(channel), (concept?.name ?? bucket).toLowerCase());
  }
  fact(facts, 'arrangement', record.arrangement);
  fact(facts, 'family', record.family);
  fact(facts, 'Audubon', record.audubon_name);
  fact(facts, 'symbol', symbol);
  root.append(facts);

  const cards = el('div', 'sec');
  cards.append(tick());
  cards.append(el('h3', 'sec-h', 'Your cards'));
  let anyCard = false;
  for (const channel of content.channels) {
    const row = cardRow(content, states, symbol, channel, today);
    if (row) { cards.append(row); anyCard = true; }
  }
  if (!anyCard) {
    cards.append(el('p', 'fact-line', 'This species carries no card yet.'));
  } else {
    cards.append(el('p', 'fact-line',
      `Overall level ${speciesLevel(symbol, content, states)} of 4, `
      + 'the lowest of the cards above.'));
  }
  root.append(cards);

  for (const channel of content.channels) {
    if (channel === heroChannel) continue;
    root.append(plateSection(content, symbol, channel, imageBase, record));
  }

  const varieties = el('div', 'sec');
  varieties.append(tick());
  varieties.append(el('h3', 'sec-h', 'Varieties'));
  const known = record.varieties ?? [];
  if (known.length === 0) {
    varieties.append(el('p', 'fact-line',
      'No varieties are recognized for this species.'));
  } else {
    const list = el('div', 'splist');
    for (const variety of known) {
      const channels = varietyCardChannels(content, symbol, variety.key);
      const line = el('div', 'spx');
      const card = channels.length
        ? content.cards[cardId('variety', channels[0], variety.key)]
        : null;
      line.append(card
        ? glyph(glyphIdFor(card, content), cardLevel(states[card.id]), 's26')
        : glyph('lf-entire', 0, 's26'));
      const names = el('span', 'sn', variety.name);
      line.append(names);
      line.append(el('span', 'due', channels.length
        ? `card on ${channels.join(', ')}`
        : 'no card'));
      list.append(line);
      list.append(el('p', 'secname', variety.note));
    }
    varieties.append(list);
  }
  root.append(varieties);

  root.append(footNav('progress'));
}
```

Expected: `node --check app/screens/species.js` prints nothing.

- [ ] **Step 9: Delete the last species rules from the legacy CSS block**

In `app/style.css`, in the legacy block, delete `.photo`, `.photo-pair`,
`.attribution`, and `.option-sub`. The old species screen was the last one
that printed them.

- [ ] **Step 10: Check the screen in a browser**

Open `http://localhost:8000/?content=dev#/species/QURU`.
Expected:

- A trail reading "Simple, lobed", then "Northern red oak", the first part a
  link to the shape page.
- A display heading, the binomial in italic Fraunces, one line of status.
- The leaf plate bleeding to both edges with its lower edge dissolved, and a
  credit line.
- Two display numerals, "60-90 feet tall" and "0-5,500 feet elevation".
- One paragraph of range and habitat, then a two-column fact list.
- "Your cards": three mounted rows, each with the channel name, the level
  word sized by level, the level line, five squares, and the due text.
- A "Bark" section with the bark plate held back in saturation and dissolved
  on four sides, then a "Fruit" section reading "No fruit plate is collected
  yet."
- A "Varieties" section reading "No varieties are recognized for this
  species."
- The foot with the moss rule under Progress.

- [ ] **Step 11: Check a species that has varieties and a retired one**

Open `#/species/QUGA`, then `#/species/LIST2`.
Expected: QUGA lists its two varieties with their notes and card status;
LIST2 shows the retired line, the facts, no plate, and "This species carries
no card yet." Neither logs an error.

- [ ] **Step 12: Run the tests**

Run: `npm test`
Expected: PASS, 0 failures, one test more than the task before.

- [ ] **Step 13: Commit**

```bash
git add app/screens/species.js app/logic/scheduler.js app/logic/store.js \
  app/style.css tests/scheduler.test.js
git commit -m "feat(species): the specimen sheet, with plates, cards, and varieties

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Settings

**Files:**
- Modify: `app/screens/settings.js` (replaced)
- Read: `docs/design/2026-09-24-specimen-plate/mockup-final.html:1767-1844`, `final-settings.png`

**Interfaces:**
- Consumes:
  - `isCount(value) => boolean` — `app/logic/store.js`
  - `TEXT_SIZE_STEPS: Array<{ name, root, sample_px }>` — `app/ui/textsize.js`, Task 7
  - `applyTextSize(name) => string` — `app/ui/textsize.js`, Task 7
  - `el(tag, className?, text?) => HTMLElement` — `app/ui/dom.js`, Task 6
  - `footNav(current) => DocumentFragment`, `tick(className?) => HTMLElement`, `trail(parts) => HTMLElement` — `app/ui/chrome.js`, Task 6
  - `store.readSettings() => { version, session_size, new_per_day, last_export, text_size, open_units }` — Task 7
  - `store.writeSettings(patch) => Settings` — Task 7
  - `store.readCards() => Record<string, CardState>`, `store.readMissingEdges() => Array<{ a, b, channel, count }>`
  - `store.exportBlob(today) => { json, filename }`, `store.importBlob(text) => { ok, errors }`, `store.markExported(today) => void`, `store.reset() => void`
- Produces: `render(root, ctx)`. Settings is still the one screen that runs
  with no content, so every read of `content` stays optional.

**Session size and new cards per day** become radio groups, as the mockup
prints them. The store still accepts any integer of 1 or more, so a value
outside the four steps, from an import or a hand edit, is shown as a fifth
chosen step rather than being thrown away.

- [ ] **Step 1: Replace the screen with its head and the count groups**

Replace the whole of `app/screens/settings.js` with the imports, the four
steps of each count, and the count group:

```js
// Session size, new cards per day, text size, export, import, reset, and the
// missing diagnostics. The one screen that opens with no content.
import { isCount } from '../logic/store.js';
import { TEXT_SIZE_STEPS, applyTextSize } from '../ui/textsize.js';
import { el } from '../ui/dom.js';
import { footNav, tick, trail } from '../ui/chrome.js';

const SESSION_SIZES = [8, 12, 20, 30];
const NEW_PER_DAY = [3, 6, 10, 15];

// The steps the group offers, with the stored value added when a hand edit or
// an import has left a value outside them.
function stepsWith(steps, current) {
  return steps.includes(current) ? steps : [...steps, current].sort((a, b) => a - b);
}

function countGroup(root, ctx, options) {
  const group = el('div', 'setgroup');
  group.append(tick());
  group.append(el('h2', 'sec-h', options.title));
  group.append(el('p', 'sub2', options.note));

  const fieldset = el('fieldset', 'choices');
  fieldset.append(el('legend', 'sr', options.title));
  const current = ctx.store.readSettings()[options.field];
  for (const value of stepsWith(options.steps, current)) {
    const label = el('label', 'choice');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = options.field;
    input.value = String(value);
    input.checked = value === current;
    input.addEventListener('change', () => {
      if (!isCount(value)) return;
      ctx.store.writeSettings({ [options.field]: value });
      if (!ctx.store.available) ctx.banner(ctx.storage_banner);
    });
    label.append(input, el('span', null, String(value)));
    fieldset.append(label);
  }
  group.append(fieldset);
  root.append(group);
}
```

Expected: `node --check app/screens/settings.js` prints nothing.

- [ ] **Step 2: Add the text size group**

Append to `app/screens/settings.js`:

```js
function textSizeGroup(root, ctx) {
  const group = el('div', 'setgroup');
  group.append(tick());
  group.append(el('h2', 'sec-h', 'Text size'));
  group.append(el('p', 'sub2',
    'Every word in Dendro follows this. The photographs and the leaf marks '
    + 'keep their own size.'));

  const fieldset = el('fieldset', 'tsteps');
  fieldset.append(el('legend', 'sr', 'Text size'));
  const current = ctx.store.readSettings().text_size;
  for (const step of TEXT_SIZE_STEPS) {
    const label = el('label', 'tstep');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'text_size';
    input.value = step.name;
    input.checked = step.name === current;
    input.addEventListener('change', () => {
      applyTextSize(step.name);
      ctx.store.writeSettings({ text_size: step.name });
      if (!ctx.store.available) ctx.banner(ctx.storage_banner);
    });
    // The sample words are sized in px: each one must show what its own step
    // does, whatever step is in force right now.
    const sample = el('span', 'tsample', 'Quercus rubra');
    sample.style.fontSize = `${step.sample_px}px`;
    label.append(input, sample, el('span', 'tname', step.name));
    fieldset.append(label);
  }
  group.append(fieldset);
  root.append(group);
}
```

Expected: `node --check app/screens/settings.js` prints nothing.

- [ ] **Step 3: Add the export, import, and reset group**

Append to `app/screens/settings.js`:

```js
function cardsGroup(root, ctx) {
  const { store, today } = ctx;
  const group = el('div', 'setgroup');
  group.append(tick());
  group.append(el('h2', 'sec-h', 'Your cards'));

  const cardCount = Object.keys(store.readCards()).length;
  const exportRow = el('div', 'setbtn');
  const exportButton = el('button', 'sbn', 'Export');
  exportButton.type = 'button';
  const noteText = () =>
    `${cardCount} ${cardCount === 1 ? 'card' : 'cards'}, last export `
    + `${store.readSettings().last_export ?? 'never'}`;
  const exportNote = el('span', 'sbd', noteText());
  exportRow.append(exportButton, exportNote);
  exportButton.addEventListener('click', () => {
    const blob = store.exportBlob(today);
    const file = new Blob([blob.json], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = blob.filename;
    // Firefox needs the anchor in the document, and the URL must outlive the click.
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    store.markExported(today);
    if (!store.available) ctx.banner(ctx.storage_banner);
    exportNote.textContent = noteText();
  });
  group.append(exportRow);

  const importRow = el('label', 'setbtn');
  importRow.append(el('span', 'sbn', 'Import'));
  const importNote = el('span', 'sbd', 'read a file you exported');
  importRow.append(importNote);
  const fileField = document.createElement('input');
  fileField.type = 'file';
  fileField.id = 'import_file';
  fileField.accept = 'application/json';
  fileField.className = 'sr';
  fileField.addEventListener('change', async () => {
    const chosen = fileField.files?.[0];
    if (!chosen) return;
    const result = store.importBlob(await chosen.text());
    importNote.textContent = result.ok
      ? 'imported, reload to see it'
      : `rejected: ${result.errors.join(' ')}`;
    if (result.ok && !store.available) ctx.banner(ctx.storage_banner);
  });
  importRow.append(fileField);
  group.append(importRow);

  const resetRow = el('div', 'setbtn warn');
  const resetButton = el('button', 'sbn', 'Reset');
  resetButton.type = 'button';
  const resetNote = el('span', 'sbd', 'clears every level and date');
  resetRow.append(resetButton, resetNote);
  const confirmRow = el('div', 'setbtn warn');
  const confirmButton = el('button', 'sbn', 'Yes, delete everything');
  confirmButton.type = 'button';
  confirmRow.append(confirmButton, el('span', 'sbd', 'this cannot be undone'));
  confirmRow.hidden = true;
  resetButton.addEventListener('click', () => { confirmRow.hidden = false; });
  confirmButton.addEventListener('click', () => {
    store.reset();
    confirmRow.hidden = true;
    resetNote.textContent = 'progress reset';
  });
  group.append(resetRow, confirmRow);
  root.append(group);
}
```

Expected: `node --check app/screens/settings.js` prints nothing.

- [ ] **Step 4: Add the diagnostics group and the wiring**

Append to `app/screens/settings.js`:

```js
function diagnosticsGroup(root, ctx) {
  const { store, content } = ctx;
  const group = el('div', 'setgroup');
  group.append(tick());
  group.append(el('h2', 'sec-h', 'Pairs with no note'));
  const edges = store.readMissingEdges();
  if (edges.length === 0) {
    group.append(el('p', 'fact-line',
      'Every pair you have confused carries a note.'));
    root.append(group);
    return;
  }
  const list = el('div', 'splist');
  for (const edge of edges) {
    // Settings opens when the content failed to load, so fall back to the symbol.
    const a = content?.species[edge.a]?.common[0] ?? edge.a;
    const b = content?.species[edge.b]?.common[0] ?? edge.b;
    const row = el('div', 'spx');
    row.append(el('span', 'sn', `${a} against ${b}`));
    row.append(el('span', 'due',
      `${edge.channel}, ${edge.count} ${edge.count === 1 ? 'time' : 'times'}`));
    list.append(row);
  }
  group.append(list);
  root.append(group);
}

export function render(root, ctx) {
  const { store } = ctx;

  root.append(trail([{ text: 'Home', href: '#/' }, { text: 'Settings' }]));

  const head = el('div', 'pagehead');
  head.append(el('h1', 'display', 'Settings'));
  head.append(el('p', 'where2', 'Everything here is kept on this phone.'));
  root.append(head);

  if (!store.available) {
    root.append(el('p', 'note',
      'This browser blocks local storage. Changes here are not saved.'));
  }

  countGroup(root, ctx, {
    field: 'session_size',
    title: 'Session size',
    note: 'How many cards one session asks for.',
    steps: SESSION_SIZES
  });
  countGroup(root, ctx, {
    field: 'new_per_day',
    title: 'New cards per day',
    note: 'A cap on cards you have not met yet.',
    steps: NEW_PER_DAY
  });
  textSizeGroup(root, ctx);
  cardsGroup(root, ctx);
  diagnosticsGroup(root, ctx);

  root.append(footNav(null));
}
```

Expected: `node --check app/screens/settings.js` prints nothing.

- [ ] **Step 5: Add the rules the setting panels need**

Append to `app/style.css`, above the legacy block:

```css
/* A setbtn holds a real control, so the button carries the panel's own type.
   This selector sets the family itself, so it needs no `:where()` guard: it
   is the rule that decides, not a reset that has to lose to one. */
.setbtn button.sbn{appearance:none; -webkit-appearance:none; background:none;
  border:0; padding:0; color:inherit; font:inherit; font-family:var(--fr);
  font-weight:600; font-size:1.0625rem; font-variation-settings:"opsz" 20;
  text-align:left; cursor:pointer; min-height:54px; flex:1 1 auto;}
.setbtn button.sbn:focus-visible{outline:2px solid var(--moss); outline-offset:2px;}
/* Import is a label wrapping a file input the page never draws */
label.setbtn{cursor:pointer;}
label.setbtn:has(input:focus-visible){outline:2px solid var(--moss); outline-offset:2px;}
```

- [ ] **Step 6: Delete the last legacy rules**

In `app/style.css`, in the legacy block, delete the `.card`, `.notice`,
`.unit-row`, `.unit-meta`, `label`, `input[type="number"], input[type="text"]`,
`button`, `button.primary`, and `button:disabled` rules. Every screen now
brings its own controls. If that empties the legacy block, delete the block
and its comment too.

- [ ] **Step 7: Check the screen in a browser**

Open `http://localhost:8000/?content=dev#/settings`.
Expected:

- A trail reading Home, then Settings, and a display heading.
- "Session size" and "New cards per day" as rows of outlined choices, the
  chosen one inked solid moss.
- "Text size": five rows, each with a 22 px radio, the words "Quercus rubra"
  at 14, 15, 17, 20, and 22 px, and the step name at the right, upright and
  in ink on the chosen row.
- "Your cards": three mounted rows with a moss rail, and Reset with a sap
  rail. Reset shows a second row that has to be tapped to confirm.
- "Pairs with no note" reading "Every pair you have confused carries a note."
- The foot with no word marked.

- [ ] **Step 8: Check that a text size step takes effect at once**

Tap "largest".
Expected: the whole page grows, the five sample words keep their own sizes,
the chosen step name turns upright and inks, and after a reload the choice is
still made.

- [ ] **Step 9: Check settings with the content broken**

`?content=nonesuch` does not break anything. `contentDir()` in `app/main.js`
returns `content_dev/` for the exact string `dev` and `content/` for every
other value, so an unknown name loads the live set and the error panel never
shows. Break one fetch on purpose instead.

Run:

```bash
mkdir -p out
mv content/units.json out/units.json.parked
```

Open `http://localhost:8000/#/settings`.
Expected: the settings screen renders in full, with the diagnostics group
falling back to symbols and no console error.

Then open `http://localhost:8000/#/`.
Expected: the error panel, reading `Content failed to load` over
`content/units.json returned 404`, with a "Settings" link and a "Home" link
under it, and the panel running to both edges of the phone.

Put the file back and check the tree is clean:

```bash
mv out/units.json.parked content/units.json
git status --short content/
```

Expected: no output from `git status`.

- [ ] **Step 10: Check export, import, and reset**

Tap Export, then Import and choose the file that downloaded, then Reset and
confirm.
Expected: a `dendro-progress-YYYY-MM-DD.json` download, "imported, reload to
see it" beside Import, and "progress reset" beside Reset.

- [ ] **Step 11: Run the tests**

Run: `npm test`
Expected: PASS, no change in count.

- [ ] **Step 12: Commit**

```bash
git add app/screens/settings.js app/style.css
git commit -m "feat(settings): printed choice panels and the text size steps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: The quality floor scripts and the manual checklist

**Files:**
- Create: `scripts/shots.py`, `scripts/audit.py`
- Modify: `app/style.css` (the legacy block deleted, if anything is left)
- Modify: `.gitignore` (`out/` added, if it is not there already)

**Interfaces:**
- Consumes: the running app at `http://localhost:8000/?content=dev`, and the
  class names the screen tasks print: `.key .pick`, `.invkey button`,
  `.typed input`, `.typed .btn`, `.verdict`, `.sr`, `#app`, `#banner`,
  `#dendro-sprite`.
- `audit.py` consumes five names from `shots.py`: `BASE`, `ROUTES`, `ROOTS`,
  `WIDTHS`, `MAX_TRIES`, and two functions, `open_page(browser, width, root,
  frag, scale=1)` and `answer(page, attempt) => 'right'|'wrong'|''`.
- Produces: two developer tools. Neither runs in CI: the check job has no
  browser and no server, and `.github/workflows/check.yml` is not touched.

**Why Python.** Playwright for Python with Chromium is already installed on
this machine, and `npx playwright` is not. `python -c "import playwright"`
works. The two scripts are ports of the design round's `shot.py`,
`shotroot.py`, and `overflow.py`, aimed at the live app rather than at a
standalone mockup.

- [ ] **Step 1: Write the screenshot script**

Create `scripts/shots.py`:

```python
"""Screenshot every Dendro screen at both phone widths and all three root sizes.

Usage:
    python -m http.server 8000                 # one terminal, at the repo root
    python scripts/shots.py out/shots          # another terminal

Writes <out>/<screen>-<width>-<root>.png: nine routes at two widths at three
root sizes, 54 files in all. A developer tool, not a CI step: CI has no
browser and no server.

A route that fails is reported and skipped. One screen that will not open
must not cost the other 53 shots.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8000/?content=dev"
WIDTHS = [360, 390]
ROOTS = ["80", "100", "130"]

# name, hash, what to do once the page has loaded:
#   None      shoot the page as it stands
#   "wrong"   answer the card with something that is not the answer, then shoot
ROUTES = [
    ("home", "#/", None),
    ("lessons", "#/lessons", None),
    ("lessons-leaf", "#/lessons/leaf", None),
    ("progress", "#/progress", None),
    ("progress-shape", "#/progress/leaf/simple_lobed", None),
    ("species", "#/species/QURU", None),
    ("settings", "#/settings", None),
    ("session", "#/session?focus=leaf&unit=leaf_types", None),
    ("reveal", "#/session?focus=leaf&unit=leaf_types", "wrong"),
]

# The script cannot see the answer, so on a choice card it tries one label,
# and on a right answer opens a fresh page and tries another. `new_page` gives
# each attempt its own storage, so the deck starts over and the labels are
# shuffled again.
MAX_TRIES = 6


def open_page(browser, width, root, frag, scale=1):
    """Open one route at one width and one root size, settled and ready."""
    page = browser.new_page(
        viewport={"width": width, "height": 844},
        device_scale_factor=scale,
    )
    page.goto(BASE + frag)
    page.wait_for_load_state("networkidle")
    page.evaluate("s => document.documentElement.style.fontSize = s", root + "%")
    page.wait_for_timeout(600)  # let the webfonts and the plates settle
    return page


def answer(page, attempt):
    """Answer the card on screen, whatever format it is in.

    `attempt` picks which label to try on a choice card. Returns "right",
    "wrong", or "" when the page holds no answer control at all.
    """
    picks = page.query_selector_all(".key .pick")
    options = page.query_selector_all(".invkey button")
    if picks:
        picks[attempt % len(picks)].click()
    elif options:
        options[attempt % len(options)].click()
    elif page.query_selector(".typed input"):
        # No tree is called this, so a typed card always reveals as wrong.
        page.fill(".typed input", "notatree")
        page.click(".typed .btn")
    else:
        return ""
    page.wait_for_timeout(700)
    verdict = page.query_selector(".verdict")
    if verdict is None:
        return ""
    return "right" if verdict.inner_text().startswith("Right") else "wrong"


def shoot(browser, name, frag, action, width, root, out):
    target = out / f"{name}-{width}-{root}.png"
    if action != "wrong":
        page = open_page(browser, width, root, frag, scale=2)
        try:
            page.screenshot(path=str(target), full_page=True)
        finally:
            page.close()
        return target
    # The reveal is only worth a shot in its wrong state: that is the one that
    # prints two plates side by side.
    for attempt in range(MAX_TRIES):
        page = open_page(browser, width, root, frag, scale=2)
        try:
            if answer(page, attempt) == "wrong":
                page.screenshot(path=str(target), full_page=True)
                return target
        finally:
            page.close()
    raise RuntimeError(f"no wrong answer in {MAX_TRIES} tries")


def main():
    out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "out/shots")
    out.mkdir(parents=True, exist_ok=True)
    failures = 0
    with sync_playwright() as play:
        browser = play.chromium.launch()
        for width in WIDTHS:
            for root in ROOTS:
                for name, frag, action in ROUTES:
                    try:
                        print(shoot(browser, name, frag, action, width, root, out))
                    except Exception as error:
                        failures += 1
                        print(f"FAIL {name}-{width}-{root}: {error}")
        browser.close()
    print(f"\n{failures} shots failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Write the overflow and tap-target script**

Create `scripts/audit.py`:

```python
"""Report overflow, small tap targets, and weak text contrast on every screen.

Usage:
    python -m http.server 8000     # one terminal, at the repo root
    python scripts/audit.py        # another terminal

Checks both phone widths at all three root sizes. Exits 1 when anything is
reported, so it can be wired into a pre-push hook. A developer tool, not a
CI step: CI has no browser and no server.

The three checks answer the three lines of section 5 of the spec that a
person cannot judge by eye: no horizontal scroll, every control 44px, every
piece of text at 4.5 to 1 or better.
"""
import sys

from playwright.sync_api import sync_playwright

from shots import MAX_TRIES, BASE, ROUTES, ROOTS, WIDTHS, answer, open_page

MIN_TARGET = 44
MIN_CONTRAST = 4.5

JS = """
(limits) => {
  const out = {
    sw: document.documentElement.scrollWidth, over: [], small: [], dim: []
  };
  const name = (node) => {
    const cls = typeof node.className === 'string' ? node.className.trim() : '';
    return node.tagName.toLowerCase() + (cls ? '.' + cls.split(/\\s+/).join('.') : '');
  };

  // ---------- horizontal overflow ----------
  // The banner sits outside #app, so it is named on its own line here.
  for (const node of document.querySelectorAll('#app *, #banner')) {
    const box = node.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (box.right > limits.width + 0.5 || box.left < -0.5) {
      out.over.push(name(node) + ' [' + Math.round(box.left) + ',' + Math.round(box.right) + ']');
    }
  }

  // ---------- tap targets ----------
  const controls = 'a[href], button, input, select, textarea, label, summary,'
    + ' [tabindex]:not([tabindex="-1"])';
  for (const node of document.querySelectorAll(controls)) {
    const box = node.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    // A control inside a label is reached by the label, so the label is the
    // target and a small input inside a big label is not a finding.
    const host = node.closest('label');
    if (host && host !== node) {
      const hostBox = host.getBoundingClientRect();
      if (hostBox.width >= limits.target && hostBox.height >= limits.target) continue;
    }
    if (box.width < limits.target || box.height < limits.target) {
      out.small.push(name(node) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height));
    }
  }

  // ---------- text contrast ----------
  // Measured, not judged. Every text node's own computed colour against the
  // first background above it that is not see-through. The sheet paints most
  // panels on a tint, so the paper is not always the ground.
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = (rgb) =>
    0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  const parse = (text) => {
    const parts = (text || '').match(/[\\d.]+/g);
    if (!parts || parts.length < 3) return null;
    return { rgb: parts.slice(0, 3).map(Number), a: parts.length > 3 ? Number(parts[3]) : 1 };
  };
  const backdrop = (node) => {
    let walk = node;
    while (walk) {
      const paint = parse(getComputedStyle(walk).backgroundColor);
      if (paint && paint.a >= 0.999) return paint.rgb;
      walk = walk.parentElement;
    }
    return [255, 255, 255];
  };
  const ratio = (one, two) => {
    const a = luminance(one);
    const b = luminance(two);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (text.textContent.trim() === '') continue;
    const host = text.parentElement;
    if (!host || seen.has(host)) continue;
    seen.add(host);
    // A screen-reader line and the sprite are never drawn, so neither has a
    // contrast to measure.
    if (host.closest('.sr, #dendro-sprite')) continue;
    const box = host.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    const style = getComputedStyle(host);
    if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const ink = parse(style.color);
    if (!ink || ink.a < 0.999) continue;
    const got = ratio(ink.rgb, backdrop(host));
    if (got < limits.contrast) {
      out.dim.push(name(host) + ' ' + got.toFixed(2) + ':1 '
        + style.color + ' at ' + style.fontSize);
    }
  }

  out.over = out.over.slice(0, 12);
  out.small = out.small.slice(0, 12);
  out.dim = out.dim.slice(0, 12);
  return out;
}
"""


def check(browser, name, frag, action, width, root):
    """Open one screen state and run the three checks over it."""
    for attempt in range(MAX_TRIES if action == "wrong" else 1):
        page = open_page(browser, width, root, frag)
        try:
            if action == "wrong" and answer(page, attempt) != "wrong":
                continue
            page.wait_for_timeout(350)
            return page.evaluate(
                JS,
                {"width": width, "target": MIN_TARGET, "contrast": MIN_CONTRAST},
            )
        finally:
            page.close()
    raise RuntimeError(f"no wrong answer in {MAX_TRIES} tries")


def main():
    findings = 0
    with sync_playwright() as play:
        browser = play.chromium.launch()
        for width in WIDTHS:
            for root in ROOTS:
                print(f"=== width {width}, root {root}% ===")
                for name, frag, action in ROUTES:
                    try:
                        got = check(browser, name, frag, action, width, root)
                    except Exception as error:
                        # A screen that will not open is a finding of its own,
                        # and the rest of the sweep still runs.
                        findings += 1
                        print(f"FAIL {name:<16} {error}")
                        continue
                    bad = (got["sw"] > width or got["over"]
                           or got["small"] or got["dim"])
                    flag = "FAIL" if bad else "ok  "
                    print(f"{flag} {name:<16} scrollWidth={got['sw']}")
                    for line in got["over"]:
                        print("       overflow > " + line)
                    for line in got["small"]:
                        print("       target   > " + line)
                    for line in got["dim"]:
                        print("       contrast > " + line)
                    if bad:
                        findings += 1
        browser.close()
    print(f"\n{findings} screen states with findings.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Run the audit**

Run `python -m http.server 8000` in one terminal, then in another:

```bash
cd scripts && python audit.py
```

(The script imports its route list and its page helpers from `shots.py`, so
it runs from the `scripts` directory.)

Expected: 54 lines of `ok  `, six `=== width …` headings, every `scrollWidth`
360 or 390, no `overflow >`, no `target >`, no `contrast >` line, and a last
line reading `0 screen states with findings.`

Fix whatever it reports before going on. The usual causes and their fixes:

- A `.band` or a `.wline` that overflows: it bleeds to the right edge by
  design, so widen the tolerance nowhere; instead check that
  `margin-right: calc(var(--gut)*-1)` is on it and `overflow-x: clip` is on
  `#app`.
- A control under 44 px: raise its `min-height` in `app/style.css`. Never
  raise it by adding padding to a flex child that is already `flex: 0 0 auto`.
- Horizontal scroll at root 130 percent: a long word in a display heading.
  Add `overflow-wrap: break-word` to `.display` rather than shrinking it.
- A `contrast >` line: the three soft inks are known good on paper, measured
  at bark 7.5 to 1, ink-soft 6.0 to 1, and moss 6.5 to 1. A finding therefore
  means one of them is printed on a tint rather than on paper, or a rule has
  dropped an `opacity` on the text. Darken the ink for that rule; do not
  lighten the panel, which would break the mount.

- [ ] **Step 4: Take the screenshots**

Run:

```bash
cd scripts && python shots.py ../out/shots
```

Expected: 54 files, named `<screen>-<width>-<root>.png`: nine routes at two
widths at three root sizes. The last line reads `0 shots failed.`

Add `out/` to `.gitignore` if it is not there already, and do not commit the
images. `out/` is also where Task 5 parks the old stylesheet and where Task 16
parks a content file, so it must be ignored either way.

- [ ] **Step 5: Delete whatever is left of the legacy CSS block**

Run: `grep -n "LEGACY" app/style.css`
If the marker is still there, read the rules under it. Every one of them
belongs to a screen this plan has rewritten, so delete the block and the
comment above it.

Then run: `grep -c "" app/style.css`
Expected: a sheet of roughly 720 lines, with no old rule left. Check with:

```bash
grep -nE '^\.(grid|card|pill|pill-open|pill-closed|chip|photo|photo-pair|attribution|option-sub|options|channel|channel-row|unit-row|unit-meta|notice)([ ,{:.]|$)' app/style.css
```

Expected: no output.

The pattern names every old class in full rather than ending each one at
`\b`. A word boundary sits between `d` and `-`, so `^\.card\b` matches
`.card-row`, which is the species screen's own rule and has to stay. Listing
the names and then requiring a space, a comma, a brace, a colon, a dot, or
the end of the line matches only the rules this plan deleted.

- [ ] **Step 6: Walk the manual checklist**

This is the part a script cannot judge. Open each screen at 390 px and answer
each line yes or no. A no is a bug to fix before the commit.

**Every screen**

- [ ] The paper is cream, and the noise is visible but not busy.
- [ ] Nothing is pure black and nothing is pure white.
- [ ] The running foot is at the bottom, with a 3 px moss rule under the word
  you are on, and no rule anywhere else.
- [ ] Tab through the screen: every control takes a visible moss outline, and
  the tab order runs down the page.
- [ ] No all-caps label, no monospace, no middle-dot meta string, no arrow in
  a link, no grey drop shadow.
- [ ] `audit.py` printed no `contrast >` line for this screen. Contrast is
  measured by the script, not judged here: the three soft inks all pass on
  paper, and the risk is a soft ink printed on a tint.
- [ ] Every photograph appeared in its own treatment. None paints once with
  its own ground and then snaps to a bright print.

**Home**

- [ ] "Dendro" is the largest thing on the screen.
- [ ] The state sentence names only the channels that have a card due.
- [ ] The recommended print sits clear of the Start button, not over it.
- [ ] Both doors show a live mark, not a placeholder.

**Lessons**

- [ ] The next unit is the same unit Home recommends.
- [ ] Each channel door's square count matches the unit count on that
  channel's own page.

**Lessons, one channel**

- [ ] The stem and the branch ticks read as one figure, not an indented list.
- [ ] Exactly one Start on the page is filled moss.
- [ ] A folded row's meta line says how many units are inside it, and an
  unfolded row's does not, because the rows themselves are on screen.
- [ ] Folding and unfolding moves no row above the one you tapped.

**Progress**

- [ ] The finding sentence is true of the numbers under it.
- [ ] One sheet on the shapes rung, two on genera, three on species.
- [ ] The front sheet of each stack is that rung's own leading card, so the
  species stack does not repeat the mark the shapes stack already prints.
- [ ] Each band's marks are the right objects: bark plates on the bark shapes
  rung, fruits on the fruit shapes rung, genus leaves on every genus and
  species band.
- [ ] The three waterlines in a channel start at the same left edge.

**Progress, one shape**

- [ ] The strip marks the shape you opened, and only that one.
- [ ] Every species line is a link that opens that species.
- [ ] A genus with two sections prints both section headings.

**Session**

- [ ] The photograph is the one bold move: nothing else competes with it.
- [ ] The caption never names the tree.
- [ ] The four answer labels are exactly one width.
- [ ] The gauge has one tick per card, and the current tick is taller.

**Reveal**

- [ ] The correct name is the largest thing on the screen.
- [ ] The two prints are at one scale and share a baseline, so the sentence
  about the difference can actually be checked.
- [ ] The level squares match the level sentence beside them.

**Species**

- [ ] A missing plate reads as a fact, not an error.
- [ ] The two display numerals line up on their baseline.
- [ ] The bark plate fades on all four sides and ends on no straight edge.

**Settings**

- [ ] Each text size sample is printed at its own size, and the samples do
  not move when the setting changes.
- [ ] Reset needs two taps.
- [ ] The screen still opens with the content broken. Park `content/units.json`
  in `out/`, load `#/settings`, and put the file back. An unknown value in
  `?content=` does not break anything: `contentDir()` sends it to `content/`.

- [ ] **Step 7: Run the whole suite one last time**

Run: `npm test`
Expected: PASS, 0 failures.

Run: `npm run validate:dev && npm run validate`
Expected: both print no errors. The content is untouched by this plan, so a
failure here means something else changed.

- [ ] **Step 8: Commit**

```bash
git add scripts/shots.py scripts/audit.py app/style.css .gitignore
git commit -m "chore(ui): screenshot and audit scripts for the quality floor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage.** Every section of
`docs/superpowers/specs/2026-09-24-app-visual-design.md`, and where it lands:

| Spec | Task |
|---|---|
| 2, colour tokens and derived tints | 5 |
| 2, two font families from Google Fonts | 5 |
| 2, rem sizes and the half-rate display rule | 5 |
| 2, px for photos, glyphs, squares, and the 58 px column | 5 |
| 2, level names new to expert | 1 |
| 3.1, one bold move per screen | 8, 11, 13 |
| 3.2, structure encodes information | 1, 3, 11 |
| 3.3, type carries personality | 5 |
| 3.4, pressed leaves, level squares, one waterline | 4, 6, 11 |
| 3.5, motion answers a tap | 5, 13 |
| 3.6, photographs print into the paper | 6 |
| 3, tells to avoid | 5, 17 |
| 4, the running foot on every screen but session | 6 |
| 4.1, home | 8 |
| 4.2, session, the caption, the gauge, Leave, equal answers | 13, 14 |
| 4.2, reveal, the pair, the difference, the level change | 13 |
| 4.3, lessons | 9 |
| 4.4, lessons one channel, the fold, `aria-expanded` | 3, 10 |
| 4.5, progress, the three rungs, the bands, the waterlines | 1, 11 |
| 4.6, progress one shape | 2, 12 |
| 4.7, species | 15 |
| 4.8, settings and text size | 7, 16 |
| 5, the quality floor: overflow, 44 px targets, measured contrast | 17 |
| 6, one stylesheet from the mockup, tokens on `:root` | 5 |
| 6, one SVG sprite of `<symbol>`, level as a class | 4 |
| 6, two plate classes and how a photo gets one | 6 |
| 6, text size stored and applied on load | 7 |
| 6, fold state as a list of open unit keys | 7, 10 |
| 6, Playwright screenshots and the overflow report | 17 |
| 7, out of scope | not built |

**Gaps found and closed.** Three spec items had no task on the first pass and
now do: the level names in section 2 (Task 1), the `aria-expanded` chevron
(Task 10, which needs Task 3's `defaultOpenUnits`), and the running foot on
every screen but session (Task 6's `footNav`, used by Tasks 8 to 12, 15, 16).

**Three deliberate deviations**, each one recorded here so a reviewer does not
read it as a miss:

1. The session's format chip goes. The mockup prints no chip, and the
   controls say the format by being the format.
2. The reveal's facts panel goes. Section 4.2 lists the reveal's contents and
   the facts are not among them; the answer's name links to the species page,
   which holds them.
3. The species screen's "Quiz this tree" button goes. No route quizzes one
   species, and section 4.7 does not list one.

**2. Placeholder scan.** Ran a word scan over the plan for the eleven red
flags the skill lists, and for "as needed", "later", and "appropriate". No
hits inside a step. Every code step carries the code. Every test step carries
the test, the command, and the expected result. Every browser step carries
the URL and the lines to check. Every step that writes a file carries an
expected result of its own, either `node --check <file>` for a step that
leaves a parsable file or a stated "nothing to run yet" for a step inside an
open function.

No step says "similar to an earlier task". Every Interfaces block names the
full list it consumes, with signatures and source files, so no task sends the
reader to another task to learn a name. Tasks 13 and 14 repeat the session
file's shared names for the same reason.

**3. Type consistency.** The names that cross a task boundary, checked
against both ends:

- `rollupLevel`, `channelRung`, `channelRungs`, `leadingConcept`,
  `channelClaim`, `overallTally`, `overallFinding` (Task 1) are consumed in
  Tasks 3, 11, and 12 under those exact names.
- `speciesByGenus` and `conceptBreakdown` (Task 2) are consumed in Task 12.
- The `Rung` shape is `{ channel, kind, name, cards, counts, total,
  at_familiar, share, level }` in Task 1 and is read as `rung.at_familiar`,
  `rung.share`, `rung.counts`, `rung.cards`, and `rung.total` in Tasks 8, 11,
  and 12. Not `at_level_2`, which is `gateStatus`'s own field and is only
  read inside `app/logic/progress.js`.
- The `Node` shape from `unitTree` (Task 3) is read in Task 10 as `node.key`,
  `node.name`, `node.level`, `node.channel`, `node.card_count`,
  `node.new_count`, `node.rollup`, `node.open`, `node.opens_with`,
  `node.next_up`, `node.holds_next`, `node.inside_count`, and
  `node.children`. All thirteen are produced.
- `glyphIdFor(card, content)` (Task 4) is called with a card object from
  `content.cards` in Tasks 8 to 12 and 15, never with a bare key.
  `glyph(id, level, sizeClass, options)` takes the size as a class string
  such as `'s40'`, never a number.
- `plate(photo, options)` (Task 6) is always called with
  `{ image_base, alt, shape, … }`, using `image_base` to match `ctx.image_base`
  from `app/main.js`, not `imageBase`. `options.onError` is
  `(figure, photo) => void` and only Task 13 passes one; every other caller
  takes the default, which replaces the figure with a printed note and takes
  the orphaned caption with it.
- `metaLine(node, folded)` (Task 10) takes the fold as its second argument.
  Both call sites, `unitRow` and the toggle handler, pass it, and the toggle
  handler passes `wasOpen`, which is the fold state after the toggle.
- `sheetStack(content, rungs, kind, level)` (Task 11) takes the three rungs in
  `RUNG_KINDS` order, not a channel and a states object. `channelBlock` builds
  them once with `channelRungs` and hands the same array to all three rows.
- `notFound(root, message)` (Task 12) takes two arguments. Both call sites
  pass two.
- `footNav(current)` takes `'home'`, `'lessons'`, `'progress'`, or `null`.
  Those four are the only values Tasks 8 to 16 pass, and `FOOT_ITEMS` holds
  the first three as its keys.
- `ramp(level, options)` takes `{ large, dim, lost }`. Task 13 passes
  `{ large: true, lost }`, Task 10 passes `{ dim }`, Task 15 passes
  `{ large: true }`. No other key is ever passed.
- `unitOrdinal` (the place in the channel) and `unitNumber` (the mean level as
  a percent) are two different functions with two different jobs. Task 3's
  interface block says so, and Task 8 calls `unitOrdinal`.
- `daysBetween(fromDate, toDate)` is added to `app/logic/scheduler.js` in
  Task 15, and the same task deletes the private copy in `app/logic/store.js`
  and imports the exported one. Neither module imported the other before, so
  the import adds no cycle. One rule, one copy.
- `paintQuestion(question, card, generation, resumeAt)` (Task 13) takes the
  answer clock as a fourth argument, defaulting to 0, and sets `lastView`
  itself. Task 14 relies on that: Resume calls `lastView`, which calls
  `paintQuestion` again with the elapsed time the card already holds.
- `store.readSettings()` gains `text_size` (a step name, not a percent) and
  `open_units` (an array of unit keys, or `null`). Task 7 defines both; Task
  10 reads `open_units` and writes an array; Task 16 reads and writes
  `text_size` as a step name and passes the same name to `applyTextSize`.

## Execution Handoff

Plan complete and saved to
`docs/superpowers/plans/2026-09-24-app-visual.md`. Two execution options:

1. **Subagent-Driven (recommended).** A fresh subagent per task, a review
   between tasks, fast iteration.
2. **Inline Execution.** Run the tasks in one session with
   `superpowers:executing-plans`, in batches with checkpoints.

Tasks 1 to 4, 6, and 7 are testable with `node --test` alone and can be
reviewed on their test output. Tasks 5 and 8 to 17 need a browser at
`http://localhost:8000/?content=dev`, and their review is the manual
checklist in Task 17 plus the screenshots from `scripts/shots.py`.
