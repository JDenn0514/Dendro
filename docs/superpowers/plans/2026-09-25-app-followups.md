# Dendro app follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the problems that a play-test found at 390x844 and 360x780. Show each photo plain and whole. Move every photo credit to the reveal. Correct the session header, the counter, the export prompt, and the import. Raise three small tap targets and stop one overflow. Add a `difficulty: "hard"` tag. The app skips a hard photo, and the pipeline keeps the tag.

**Architecture:** The app stays a static site of vanilla ES modules with no build step. Every new rule that a screen prints goes into a pure function in `app/logic/`, so `node --test` covers it: `revealCredits` in `question.js`, `sessionPlace` and `sessionTotal` in `session.js`, `checkImport` and `firstAnswerDay` in `store.js`, `inPlay` in `content.js`, and `licenseUrl` in a new `licenses.js`. The photo change is mostly CSS. `app/ui/plate.js` loses the corner probe and the two treatments. `app/style.css` gives each plate a width and a height limit, and a fixed frame where answers or buttons sit under the photo. The pipeline gains one command, `images difficulty`. It uses the same commit path as `images retire`, with no bucket delete.

**Tech Stack:** HTML, CSS, ES modules, `node --test` on Node 24, TypeScript through Node's type stripping for `pipeline/`, Python 3 with Playwright for `scripts/audit.py` and `scripts/shots.py`.

## Global Constraints

- Node 24 or later. `npm test` runs `node --test "tests/**/*.test.js"`. `npm run test:pipeline` runs `node --test "pipeline/tests/**/*.test.ts"`.
- Baseline at HEAD 926936c: `npm test` 237 pass, `npm run test:pipeline` 348 pass. No test fails at the end of any task.
- Owner decision 1: show each photo plain, in full, at its own aspect ratio, on the cream Paper background `#F1ECDF`. No `mix-blend-mode`, no mask, no `filter`, no vignette. The `print` and `field` treatments and the corner probe go. Keep the palette and the type.
- Owner decision 2: a question shows no caption. The reveal shows the credit (author, source, license) for every photo that the question showed, and for every photo that the reveal itself shows. Alt text on a question photo must not name the tree.
- Owner decision 3: `MAX_SIDE` in `pipeline/lib/images.ts` stays 1200. Nothing is published again.
- Owner decision 4: a manifest row can carry `difficulty: "hard"`. The app skips a hard row the same way it skips a `retired: true` row. The file stays in the bucket. `hard` is the only allowed value.
- Leaf glyphs, level squares, and the 58 px depth column stay in px. A photo's width and height limit use px or viewport units (`dvh`), never rem, so a photo does not grow with the text size. Every font size stays in rem.
- A photo that loads after the controls under it must not move them. Where answers or buttons sit under a photo, the frame has a fixed height and the photo shows whole inside it (`object-fit: contain`). The owner accepts cream paper above and below a wide photo.
- Every link, button, label, and control is at least 44 px in both directions at 360 px and 390 px wide, at root sizes 80, 100, and 130 percent.
- No horizontal page scroll at 360 px at any of those root sizes.
- No framework, no build step. One stylesheet, `app/style.css`.
- `pipeline/lib/commands.ts` imports nothing that needs `node_modules`.
- Erasable TypeScript only in `pipeline/`: no enums, no parameter properties, no namespaces. A relative import carries the `.ts` extension.
- Write file content with the Write tool. Edit files with the Edit tool. Never use heredocs, `cat > file`, or `sed -i` for file content.
- Keep every Bash command under 5,000 bytes.
- Prose, comments, and printed messages follow ASD-STE100: short sentences, active voice, one word for one meaning.
- Commit with two `-m` flags. The second one is the trailer:
  `git commit -m "fix(ui): subject line" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

## Execution notes

- Work in the worktree `C:\Users\jdennen\Dendro\.claude\worktrees\app-visual`, branch `app-visual`.
- Task 0 runs `npm test` and `npm run test:pipeline` once and records the two counts.
- The two Python scripts need a local server on port 8000. Task 0 sets it up.
- `DENDRO_BASE=http://localhost:8000/` points the scripts at the real content. With no `DENDRO_BASE`, they use `?content=dev`. The real photos come from `https://img.learndendro.com`. That host answered 200 on 2026-09-25.
- A full `audit.py` or `shots.py` sweep opens 66 pages. Give the Bash call a timeout of 600000 ms.

## Task order

Run the tasks one after another, in number order, in the one worktree. The controller runs them that way. Each task starts from the commit of the task before it.

The notes below are for information only. They say which tasks touch the same files, and which tasks could run at the same time in separate worktrees.

- Tasks 1, 2, and 3 share `scripts/audit.py` (2 and 3) and `app/style.css` (2, 3). Task 2 needs Task 1: the audit reaches a question asked as a list of names only after Task 1.
- Tasks 4 to 7 share `app/screens/session.js`. Tasks 4 and 5 share `app/logic/question.js` and `tests/question.test.js`. Tasks 6 and 7 share `app/logic/session.js` and `tests/session.test.js`. Task 4 also edits `app/ui/plate.js` (Task 2) and `app/style.css`.
- Tasks 8 and 9 share `app/logic/store.js` and `tests/store.test.js`. Task 9 also edits `app/screens/session.js`.
- Task 4 and Task 10 both edit `docs/superpowers/specs/2026-09-21-tree-id-app-design.md`, on different lines.
- Task 10 (app side of the tag) and Task 11 (pipeline side) touch no file of Tasks 1 to 9 other than that spec.
- Task 12 is verification only. It runs after every other task.

Task 2 leaves three dead options (`soft`, `lift`, `shape: null`) in `app/screens/session.js`. `plate()` ignores them. Task 4 takes them out.

## Where the code did not match the brief

These points were checked against HEAD 926936c. The tasks below use the checked facts.

1. The "grid" question is the `inv` format: `app/screens/session.js:238-279`. It can show up to eight photos (`optionCountFor('inv')` is 8), not four.
2. The Settings "buttons" for Session size and New cards are radio labels, `label.choice`, with `min-height:44px; min-width:56px` (`app/style.css:617-621`). A probe measured the label at 56x44 and the radio inside it at 54x42. The radio sits inside the 1.5 px border (`inset:0`). `audit.py` skips an input whose label is 44 px, so the audit never reported it. Task 3 makes the radio cover the border.
3. The credit author link is 19 px tall. `audit.py:91-96` exempts every inline link under WCAG 2.5.8, so the audit never reported it. Task 3 narrows the exemption.
4. `commitRetire` starts at `pipeline/lib/commands.ts:1500`, not about 1517. Line 1512 is its append-only check.
5. `requeueCard` keeps the deck length: it moves the missed card to the back. So the counter total must add one for each re-queued card.
6. A probe on real content at HEAD confirmed problems A, C, I, and J: a landscape 1200x800 photo drew 261 px tall inside a 487 px frame at 360 px; the header read "Leaf types, fruit card"; a `span.grp` ended at x=364 at 360 px; the `session` route never reached a pick card. With the Task 1 seed, the second answer of a pick card ended at y=812 at 360 px, past 780.
7. The tested copy `shots_variant.py` also narrows `main()` to the session routes, and it has LF line ends. Task 1 takes only the `SEED_JS` change from it.

## Judgment calls for the owner

1. **Photo-grid cells stay square.** Each `inv` cell keeps a 1:1 box, and the photo shows whole inside it with `object-fit: contain` on the paper. Cells of different heights would make the grid uneven and the tap targets unequal.
2. **Fixed frames only where controls sit under the photo.** The question photo (45dvh), the reveal's single photo (50dvh), each pair photo (40dvh), the grid cells (square), and the Home and Lessons thumb (186 px) get a fixed frame. The species sheet and the shape page have no answer under the photo, so their frame takes the photo's own shape, with a 55dvh height limit. The frame is transparent, so the page's own paper, with its grain, shows around a wide photo. A flat `#F1ECDF` fill would show as a box on the grained paper.
3. **The reveal credits a photo only the reveal shows.** On a wrong pick, the pair shows the chosen species' first photo, which the question did not show. It gets a credit too. A grid photo that failed to load gets no credit, because the reader never saw it.
4. **Credit lines name the tree, and sit above Next.** Each reveal credit starts with the label of its photo, for example "Northern red oak. A Hiker, Wikimedia Commons, CC BY-SA 4.0." The reveal names the answer anyway. The credit block goes after the level line and before Next, so the diagnostic sentence stays under the photos (app spec, section "Reveal").
5. **A credit link is 44 px tall through its line height.** The author link and the license link are `inline-block` with `line-height:44px`. So the line that holds a link is 44 px tall, and the other lines keep their spacing. Two links on two lines, or on two stacked credit lines, never overlap. A grid reveal can print up to eight credit lines, each about 44 px.
6. **The license name links to its deed.** A new map in `app/logic/licenses.js` covers the 11 Creative Commons names the manifest uses today. "Public domain" and "public domain (US government work)" have no deed page and print as text, as does any name the map does not hold.
7. **Thumb alt text is the label.** `app/ui/thumb.js` prints `alt` as the unit card's label. The thumb is on Home and Lessons, not in a question, and its caption names the tree.
8. **The question photo's alt text is "The photo to identify".**
9. **The export prompt for a user who never exported** waits until the first log row is 30 days old. It reads "Your first answer is a month old, and you have not exported yet." A user with no log row sees no prompt.
10. **Import asks after it checks the file.** A file that fails the check is rejected at once, with no question. A good file shows "Yes, replace my progress". Nothing is written until that tap.
11. **The export file carries its own date.** `exportBlob(today)` writes `last_export: today` into the file's settings section, so the file never holds `null`.
12. **A hard photo counts as no photo for the validator.** A live species whose every row is hard, and which no confusion edge names, fails validation. So `images difficulty` stops before it hides the last photo of such a species. Task 11 tests that refusal.
13. **The pipeline's counts skip hard rows.** The `no_photos` status counts only the rows the app shows. The report's per-channel counts and its gap list (the thin channels) leave out an approved photo whose row is hard. So the next content run sees which channels need photos. The report counts only the approved verdicts of the run it reports, so a hard tag counts there when that same run is built again. `markRetiredSpecies` does not change: a species with only hard rows stays live.
14. **Two new audit checks.** The fold check reports a question whose prompt, or whose second answer, ends below 780 px. It measures at the script's 844 px viewport, so the 45dvh frame is 380 px there, and 351 px on a real 780 px screen. The check is stricter than the phone. By the probe numbers, the tightest case is 360 px at root 130: the second answer should end near 777 px. Task 2 Step 16 lowers the frame to 42dvh if that case fails. The overlap check reports two tap targets whose boxes overlap.
15. **`advance_to` walks up to 20 cards**, the default session size, in place of 6.
16. **The counter can still end short** when a card is skipped because its photo failed. That was true before this plan and stays out of scope.

---

### Task 0: The local server

**Files:**
- Create: `.claude/launch.json`. It is a local tool file. Do not commit it.

**Interfaces:**
- Produces: a launch entry named `static` that serves the repo root on port 8000.

- [ ] **Step 1: Write the launch file**

If `.claude/launch.json` does not exist, create it with the Write tool:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "static",
      "runtimeExecutable": "python",
      "runtimeArgs": ["-m", "http.server", "8000"],
      "port": 8000
    }
  ]
}
```

If the file exists, add the `static` entry to its `configurations` list and keep the other entries.

- [ ] **Step 2: Start the server**

Start the server with the preview tool: `preview_start` with the name `static`.

If you cannot use the preview tool, ask the owner to allow the command `python -m http.server 8000`. Then run it from the repo root with the Bash tool and `run_in_background: true`.

- [ ] **Step 3: Check the server**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/index.html`
Expected: `200`.

- [ ] **Step 4: Record the baseline**

Run: `npm test 2>&1 | tail -8` and `npm run test:pipeline 2>&1 | tail -8`.
Expected: `pass 237` and `pass 348`, `fail 0` in both. Write the two counts down.

Every later step that says "the server" means this one. Leave it running until Task 12 stops it.

---

### Task 1: Seed every answer format for the screenshot routes

**Files:**
- Modify: `scripts/shots.py:53-55` (a new walk limit), `:86-91` (the comment), `:131-142` (the seed loop), `:233-249` (`advance_to`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `MAX_WALK = 20` in `scripts/shots.py`. `advance_to(page, want)` keeps its signature. `audit.py` imports nothing new.

`SEED_JS` puts every card that can be asked as a photo grid at tier `inv`. On the real content, nearly every concept card can, so the `session` and `session-typed` routes never reach a pick card or a typed card.

- [ ] **Step 1: Run the session routes to see them fail**

The server from Task 0 must be running.

Run: `DENDRO_BASE=http://localhost:8000/ python scripts/shots.py out/shots 2>&1 | grep -E "FAIL (session|session-typed)-[0-9]"`
Expected: FAIL lines for `session` and `session-typed`, with the message `no pick state in 1 tries` or `no typed state in 1 tries`.

- [ ] **Step 2: Replace the seed loop**

In `scripts/shots.py`, replace:

```js
  for (const id of Object.keys(result.content.cards).sort()) {
    const card = result.content.cards[id];
    if (question.invAvailable(result.content, card)) {
      cards[id] = state(inverted);
      continue;
    }
    const seed = table[slot % table.length];
    slot += 1;
    if (seed) cards[id] = state(seed);
  }
```

with:

```js
  for (const id of Object.keys(result.content.cards).sort()) {
    const card = result.content.cards[id];
    const cycle = [...table, inverted];
    let seed = cycle[slot % cycle.length];
    slot += 1;
    if (seed === inverted && !question.invAvailable(result.content, card)) seed = table[2];
    if (seed) cards[id] = state(seed);
  }
```

- [ ] **Step 3: Replace the comment above `SEED_JS`**

Replace:

```python
# The tier a card holds is what picks its answer format, so the seed also
# decides which formats the deck can deal. A card can be asked as a grid of
# photos only when it has four photo options, so every card that has them goes
# to the inv tier and the rest cycle over new, mc4, mc8, and typed. That keeps
# a spread of levels on every rung and puts all three answer formats in reach.
```

with:

```python
# The tier a card holds is what picks its answer format, so the seed also
# decides which formats the deck can deal. The cards take new, mc4, mc8,
# typed, and inv in turn, in card id order. A card can be asked as a grid of
# photos only when it has four photo options. A card whose turn is inv and
# that has fewer takes mc8. That keeps a spread of levels on every rung and
# puts every answer format in reach of every session route.
```

- [ ] **Step 4: Let the walk go as far as a default session**

Replace:

```python
# How far a walk down the deck may go, and how many fresh pages the reveal may
# try. Every loop in this file is bounded by it, so no walk runs on for ever.
MAX_TRIES = 6
```

with:

```python
# How many fresh pages the reveal may try, and how many cards it answers on
# each page. Every loop in this file is bounded, so no walk runs on for ever.
MAX_TRIES = 6

# How far `advance_to` may walk down the deck: the default session size.
MAX_WALK = 20
```

In `advance_to`, replace `for _ in range(MAX_TRIES):` with `for _ in range(MAX_WALK):`. Do not change the loop in `wrong_pair`.

- [ ] **Step 5: Run the session routes again**

Run: `DENDRO_BASE=http://localhost:8000/ python scripts/shots.py out/shots 2>&1 | grep -E "(session|session-typed)-[0-9]"`
Expected: 12 lines, each a `.png` path under `out/shots`. No line starts with FAIL.

- [ ] **Step 6: Commit**

```bash
git add scripts/shots.py
git commit -m "fix(shots): the seed deals pick, typed, and grid cards to every session route" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Plain photos

**Files:**
- Modify (full rewrite): `app/ui/plate.js`
- Modify: `app/style.css:98-173` (the plate block), `:711-723` (two rules that go), `:763-771` (the grid cell)
- Modify: `app/screens/species.js:14-16`, `:85-92`, `:132-138`
- Modify: `app/screens/concept.js:164-170`
- Modify: `app/ui/thumb.js:9-22`
- Modify: `tests/ui.test.js:4`, `:23-31`
- Modify: `scripts/audit.py:32-33`, `:35-39`, `:45-53`, `:172-175`, `:190-193`, `:216-225`
- Modify: `scripts/CHECKLIST.md`
- Modify: `docs/superpowers/specs/2026-09-24-app-visual-design.md:66-69` (principle 6), `:103-105` (section 4.2), `:209-212` (section 6), and the decisions log at the end

**Interfaces:**
- Consumes: `MAX_WALK` and the new seed from Task 1, so the audit's `session` route reaches a pick card.
- Produces: `plate(photo, options)` with `options` = `{ image_base, alt, shape, bleed, onError }`. The options `lift`, `soft`, and `mono` go. `credit(photo, lead)` is unchanged. The exports `PRINT_THRESHOLD` and `plateTreatment` go.

The fold check is this task's failing test. The play-test found that a fixed portrait frame pushes the answers off a phone screen.

- [ ] **Step 1: Add the fold check to the audit**

In `scripts/audit.py`, replace:

```python
MIN_TARGET = 44
MIN_CONTRAST = 4.5
```

with:

```python
MIN_TARGET = 44
MIN_CONTRAST = 4.5
# A question must show its prompt and two answers inside this height, the
# height of a small phone. The page is laid out at the script's own viewport,
# 844 px, so the check is stricter than a 780 px phone.
FOLD = 780
```

Replace:

```js
  const out = {
    sw: document.documentElement.scrollWidth, over: [], small: [], dim: []
  };
```

with:

```js
  const out = {
    sw: document.documentElement.scrollWidth, over: [], small: [], dim: [], fold: []
  };
```

Directly before the line `  out.over = out.over.slice(0, 12);`, add:

```js
  // ---------- the fold ----------
  // A question shows its prompt and at least two answers above the fold. A
  // typed question has one answer control, so one is enough there.
  const bottomOf = (node) => node.getBoundingClientRect().bottom + window.scrollY;
  const prompt = document.querySelector('.prompt');
  if (prompt) {
    const answers = [...document.querySelectorAll('.key .pick, .invkey button, .typed input')];
    const above = answers.filter((node) => bottomOf(node) <= limits.fold).length;
    const wanted = Math.min(2, answers.length);
    if (bottomOf(prompt) > limits.fold || above < wanted) {
      out.fold.push('prompt ends at ' + Math.round(bottomOf(prompt)) + ', '
        + above + ' of ' + answers.length + ' answers end above ' + limits.fold);
    }
  }

```

In `check()`, replace:

```python
                {"width": width, "target": MIN_TARGET, "contrast": MIN_CONTRAST},
```

with:

```python
                {"width": width, "target": MIN_TARGET, "contrast": MIN_CONTRAST,
                 "fold": FOLD},
```

In `main()`, replace:

```python
                    bad = (got["sw"] > width or got["over"]
                           or got["small"] or got["dim"])
```

with:

```python
                    bad = (got["sw"] > width or got["over"]
                           or got["small"] or got["dim"] or got["fold"])
```

and after the loop `for line in got["dim"]:` and its `print`, add:

```python
                    for line in got["fold"]:
                        print("       fold     > " + line)
```

- [ ] **Step 2: Run the audit to see the fold fail**

Run: `DENDRO_BASE=http://localhost:8000/ python scripts/audit.py 2>&1 | grep -E "fold|^(ok  |FAIL) session "`
Expected: `FAIL session` at root 130, followed by a line like `fold     > prompt ends at 730, 0 of 4 answers end above 780`. Other roots can pass: the result depends on the photo the seed deals and on the text size. Other routes can also fail. Task 3 handles the progress overflow and the credit links.

- [ ] **Step 3: Rewrite `app/ui/plate.js`**

Replace the whole file with:

```js
// A plate shows one photograph plain: the whole image, at its own aspect
// ratio, on the paper. The sheet gives each place a width and a frame height
// or a height limit.
// Nothing crops, blends, masks, or tints the photo.
import { el } from './dom.js';
import { imageUrl } from '../logic/content.js';

// A plate that cannot load leaves no broken image and no caption for a
// picture that is not there. The screens that want something else, and the
// session screen wants its own photo bookkeeping, pass `onError`.
function dropPlate(figure) {
  const caption = figure.nextElementSibling;
  if (caption && caption.classList.contains('plate-cap')) caption.remove();
  const note = el('p', 'fact-line', 'This plate did not load.');
  figure.replaceWith(note);
}

// `options`: `image_base`, `alt`, `shape` (a `pl-*` class, or null for a
// plate that fills its column), `bleed` (run to both edges of the phone),
// and `onError`.
export function plate(photo, options) {
  const classes = ['plate', options.shape];
  if (options.bleed) classes.push('bleed');
  const figure = el('figure', classes.filter(Boolean).join(' '));
  const image = document.createElement('img');
  image.src = imageUrl(photo, options.image_base);
  image.alt = options.alt ?? '';
  image.decoding = 'async';
  image.addEventListener('error', () => {
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

- [ ] **Step 4: Replace the plate block in `app/style.css`**

Replace the block that starts at the line `   PLATES — the bold move of the session card, and its fallback.` (with the `/* ====` line above it) and ends at the line `.pl-b img{margin:-7.65% 0 0 0;}` with:

```css
/* =======================================================================
   PLATES

   A plate shows one photograph plain: the whole image, at its own aspect
   ratio, on the paper. There is no blend, no mask, no filter, and no
   vignette. The photo keeps its ratio inside its frame
   (`object-fit: contain`), and the paper shows around it.

   Two kinds of frame. Where answers or buttons sit under the photo, the
   frame has a fixed height, so nothing moves when the photo loads. Cream
   paper shows above and below a wide photo there. Everywhere else, the
   frame takes the photo's own shape, up to a height limit.
   ======================================================================= */
.plate{margin:0;}
.bleed{margin-left:calc(var(--gut)*-1); margin-right:calc(var(--gut)*-1);}
.plate img{display:block; width:100%; height:auto; max-height:55dvh; object-fit:contain;}

/* The fixed frames. The photo fills the frame's box and shows whole in it. */
.pl-hero img, .reveal > .plate img, .pair figure img, .invkey .plate img,
.pl-thumb img{height:100%; max-height:none;}
/* session: the question photo. At 45dvh the prompt and two answers stay
   inside a 780 px screen, and a phone on its side still shows the prompt. */
.pl-hero{height:45dvh;}
/* reveal: the one photo of a right answer, with Next under it */
.reveal > .plate{height:50dvh;}
/* home and lessons: a small print of one card inside the recommended unit */
.pl-thumb{width:124px; height:186px;}
.pl-thumb.wide{width:148px;}

/* reveal: the pair, side by side at one height, so the two photos can be
   compared */
.pair{display:grid; grid-template-columns:1fr 1fr; gap:0 6px;}
.pair figure{height:40dvh;}
```

The frames are transparent. The page's own paper, with its grain, shows around a wide photo. A flat `#F1ECDF` fill would print as a box on the grained paper.

- [ ] **Step 5: Remove the two rules the probe needed**

In `app/style.css`, remove this text, with the blank line after it:

```css
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
```

- [ ] **Step 6: Make the grid cell square with the whole photo inside**

In `app/style.css`, replace:

```css
/* the inverted format: pick the photo, four plates at one scale */
```

with:

```css
/* the inverted format: pick the photo. Each cell is square, and each photo
   shows whole inside its cell, so the grid stays even. */
```

Keep the rule `.invkey .plate{aspect-ratio:1/1;}` as it is. The square figure is the fixed frame, and the plate block from Step 4 makes the photo fill it.

- [ ] **Step 7: Drop the dead options on the species sheet**

In `app/screens/species.js`, replace:

```js
// The crop each channel's plate gets. A plate with its own ground dissolves
// on four sides; a bright scan multiplies into the paper.
const PLATE_SHAPES = { leaf: 'pl-leaf', bark: 'pl-bark', fruit: 'pl-bark' };
```

with:

```js
// The class each channel's plate gets. The sheet gives every plate the same
// plain look; the class is a hook for the space around it.
const PLATE_SHAPES = { leaf: 'pl-leaf', bark: 'pl-bark', fruit: 'pl-bark' };
```

Replace:

```js
    shape: PLATE_SHAPES[channel] ?? 'pl-bark',
    bleed: true,
    soft: true,
    mono: channel === 'bark'
  }));
```

with:

```js
    shape: PLATE_SHAPES[channel] ?? 'pl-bark',
    bleed: true
  }));
```

Replace:

```js
      shape: PLATE_SHAPES[heroChannel] ?? 'pl-leaf',
      bleed: true,
      soft: true
    });
```

with:

```js
      shape: PLATE_SHAPES[heroChannel] ?? 'pl-leaf',
      bleed: true
    });
```

- [ ] **Step 8: Drop the dead option on the shape page**

In `app/screens/concept.js`, replace:

```js
      shape: 'pl-shape',
      bleed: true,
      soft: true
    }));
```

with:

```js
      shape: 'pl-shape',
      bleed: true
    }));
```

- [ ] **Step 9: Fix the thumb's option and alt text**

In `app/ui/thumb.js`, replace:

```js
// `.wide` on both the column and the figure cuts the empty lower band off the
// scan, so the caption sits under the print. Returns null when the unit holds
// no photo.
```

with:

```js
// `.wide` on both the column and the figure sets the wider column, so the
// caption sits under the print. Returns null when the unit holds no photo.
```

and replace:

```js
    alt: `Pressed specimen, ${label}`,
    shape: 'pl-thumb',
    lift: true
  });
```

with:

```js
    alt: label,
    shape: 'pl-thumb'
  });
```

- [ ] **Step 10: Remove the treatment tests**

In `tests/ui.test.js`, remove the line:

```js
import { PRINT_THRESHOLD, plateTreatment } from '../app/ui/plate.js';
```

and remove the two tests `'a manifest ground flag decides the treatment on its own'` and `'a photo with nothing measured yet starts as a field plate'`, with the blank line before each.

- [ ] **Step 11: Update the audit's clip comment**

In `scripts/audit.py`, replace:

```js
  // A node an ancestor clips cannot push the page wide, because the pixels
  // past the clip are never drawn. The `.pl-*` plate rules crop a scan in
  // exactly that way: an image wider than its frame inside a `.plate`, which
  // is `overflow: hidden`. So the box is trimmed to every clipping ancestor
  // before it is judged. The walk stops at `#app`: the clip on `#app` is the
  // one that would hide a real layout overflow, which is what this check is
  // for, and `document.documentElement.scrollWidth` above is the other half
  // of the same question.
```

with:

```js
  // A node an ancestor clips cannot push the page wide, because the pixels
  // past the clip are never drawn. So the box is trimmed to every clipping
  // ancestor before it is judged. The walk stops at `#app`: the clip on
  // `#app` is the one that would hide a real layout overflow, which is what
  // this check is for, and `document.documentElement.scrollWidth` above is
  // the other half of the same question.
```

- [ ] **Step 12: Update the manual checklist**

In `scripts/CHECKLIST.md`:

Replace:

```markdown
- [ ] Every photograph appeared in its own treatment. None paints once with
      its own ground and then snaps to a bright print.
```

with:

```markdown
- [ ] Every photo shows whole, at its own shape, on the paper, with no fade,
      no blend, and no tint.
```

Remove the whole section `## The live site, once`, from its heading to the line before `## Home`. The corner probe it checks is gone.

Replace:

```markdown
- [ ] The photograph is the one bold move. Nothing else competes with it.
- [ ] The caption never names the tree.
```

with:

```markdown
- [ ] The photograph is the one bold move. Nothing else competes with it.
- [ ] A question shows no caption. The photo's alt text names no tree.
- [ ] Turn the phone on its side (844 by 390). The photo shows whole, and the
      prompt and the answers are one scroll away.
```

Replace:

```markdown
- [ ] The two prints are at one scale and share a baseline, so the sentence
      about the difference can be checked.
```

with:

```markdown
- [ ] The two photos of a pair sit side by side in frames of one height, each
      one whole.
- [ ] Nothing under a photo moves when the photo loads.
- [ ] The reveal prints one credit line for each photo the question showed,
      and one for a pair photo the question did not show.
```

Replace:

```markdown
- [ ] The bark plate fades on all four sides and ends on no straight edge.
```

with:

```markdown
- [ ] The bark photo shows whole, with no fade.
```

Replace:

```markdown
- [ ] Reset needs two taps.
```

with:

```markdown
- [ ] Reset needs two taps.
- [ ] Import asks before it replaces anything. A bad file is rejected with no
      question.
```

- [ ] **Step 13: Note the change in the visual spec**

Change the old rules where they stand in `docs/superpowers/specs/2026-09-24-app-visual-design.md`, and add a log entry.

In section 3, replace principle 6:

```markdown
6. Photographs print into the paper. A bright-ground scan uses
   `mix-blend-mode: multiply` so its white becomes paper. A photograph with its
   own ground dissolves on all four sides through a mask and never blends.
   Nothing ends on a straight edge.
```

with:

```markdown
6. Photographs print plain on the paper. Each photo shows whole, at its own
   aspect ratio, with no blend, mask, filter, or vignette. Where answers or
   buttons sit under a photo, its frame has a fixed height, and cream paper
   shows above and below a wide photo.
```

In section 4.2, replace:

```markdown
- The photograph is framed to the specimen's own bounding box and prints
  into the paper edge to edge. The caption reads "Pressed specimen,
  undetermined." plus the author, and never names the tree.
```

with:

```markdown
- The photograph shows whole in a frame of fixed height, edge to edge. A
  question shows no caption, and the photo's alt text names no tree. The
  reveal prints the credit for every photo the question showed.
```

In section 6, replace:

```markdown
- Photo treatment is two classes: `.plate.print` for bright-ground scans
  (multiply), `.plate.field` for photographs with their own ground (mask, no
  blend). Which one a photo gets comes from a flag in the manifest or a
  brightness check at build time; decide in the plan.
```

with:

```markdown
- Photos have one treatment: plain. `.plate` sets the frame and the height
  limit, and `object-fit: contain` keeps the whole photo in view.
```

At the end of the file, after the last decisions log item, add:

```markdown
- 2026-09-25. Photos print plain, at the owner's request after a play-test.
  The `print` and `field` classes and the corner probe are gone. Principle 6
  and the notes in sections 4.2 and 6 now say so.
- 2026-09-25. A question shows no caption. The reveal prints the credit for
  every photo the question showed and every photo the reveal shows.
```

- [ ] **Step 14: Check that no name of the old treatment is left**

Run: `git grep -n -E "measuring|corsBlocked|plateTreatment|PRINT_THRESHOLD|plate\.print|plate\.field|mix-blend|mask-image" -- app tests scripts`
Expected: no output.

- [ ] **Step 15: Run the unit tests**

Run: `npm test`
Expected: 235 pass, 2 fewer than before this task, 0 fail.

- [ ] **Step 16: Run the audit again**

Run: `DENDRO_BASE=http://localhost:8000/ python scripts/audit.py 2>&1 | grep -E "fold|^(ok  |FAIL) session"`
Expected: `ok   session`, `ok   session-typed`, and `ok   session-inv` lines, or FAIL lines with no `fold` line under them. No `fold` line at all.

- [ ] **Step 17: If a fold line shows, lower the frame to 42dvh**

Do this step only if Step 16 printed a `fold` line. Otherwise go to Step 18.

In `app/style.css`, replace:

```css
/* session: the question photo. At 45dvh the prompt and two answers stay
   inside a 780 px screen, and a phone on its side still shows the prompt. */
.pl-hero{height:45dvh;}
```

with:

```css
/* session: the question photo. At 42dvh the prompt and two answers stay
   inside a 780 px screen at every text size, and a phone on its side still
   shows the prompt. */
.pl-hero{height:42dvh;}
```

Run the command of Step 16 again. Expected: no `fold` line. If a `fold` line still shows, stop and report the line to the controller.

- [ ] **Step 18: Commit**

```bash
git add app/ui/plate.js app/style.css app/screens/species.js app/screens/concept.js app/ui/thumb.js tests/ui.test.js scripts/audit.py scripts/CHECKLIST.md docs/superpowers/specs/2026-09-24-app-visual-design.md
git commit -m "fix(ui): photos print plain and whole, and the question photo leaves room for the answers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tap targets and the progress band

**Files:**
- Modify: `app/style.css:417` (`.band .grp`), `:621` (`.choice input`), `:853-856` (`.cap a`)
- Modify: `scripts/audit.py:78-100` (the tap target check and the inline link exemption), and a new overlap check before the contrast check
- Create (not committed, `out/` is ignored): `out/targets.py`

**Interfaces:**
- Consumes: the audit from Task 2.
- Produces: an `overlap` list in the audit's result, printed as `overlap  >` lines.

Three small targets and one overflow: the credit author link is 19 px tall; the radio inside a Settings choice is 54x42; a genus group's glyph row on Progress runs 4 px past a 360 px screen. The new overlap check holds the credit links apart once they grow.

- [ ] **Step 1: Narrow the audit's inline link exemption**

In `scripts/audit.py`, replace:

```js
    // WCAG 2.5.8 exempts a link that sits inside a run of text: the line of
    // type sets its size, and growing it to 44px would break the line. The
    // credit's author link and the reveal title's answer link are both that
    // case. Every anchor the app means as a control is laid out as a block,
    // a flex box, or a grid, so `display: inline` is what tells them apart.
    if (node.tagName === 'A' && getComputedStyle(node).display === 'inline') continue;
```

with:

```js
    // WCAG 2.5.8 exempts a link that sits inside a run of text: the line of
    // type sets its size, and growing it to 44px would break the line. The
    // reveal title's answer link is that case. The links in a credit line
    // are not exempt: they sit in small print, 19px tall, so the sheet grows
    // each one to 44px and this check holds it to that. Every other anchor
    // the app means as a control is a block, a flex box, or a grid, so
    // `display: inline` tells them apart.
    if (node.tagName === 'A' && !node.closest('.cap')
        && getComputedStyle(node).display === 'inline') continue;
    measured.push({ node, box });
```

In the same file, replace:

```js
  // ---------- tap targets ----------
  const controls = 'a[href], button, input, select, textarea, label, summary,'
```

with:

```js
  // ---------- tap targets ----------
  // Every target the size check measures, for the overlap check below.
  const measured = [];
  const controls = 'a[href], button, input, select, textarea, label, summary,'
```

Directly before the line `  // ---------- text contrast ----------`, add:

```js
  // ---------- overlapping targets ----------
  // Two targets whose boxes overlap send a tap to the wrong one. A control
  // inside another, such as the radio inside its label, is one target.
  for (let i = 0; i < measured.length; i += 1) {
    for (let j = i + 1; j < measured.length; j += 1) {
      const one = measured[i];
      const two = measured[j];
      if (one.node.contains(two.node) || two.node.contains(one.node)) continue;
      const wide = Math.min(one.box.right, two.box.right) - Math.max(one.box.left, two.box.left);
      const tall = Math.min(one.box.bottom, two.box.bottom) - Math.max(one.box.top, two.box.top);
      if (wide > 0.5 && tall > 0.5) out.overlap.push(name(one.node) + ' and ' + name(two.node));
    }
  }

```

Replace:

```js
    sw: document.documentElement.scrollWidth, over: [], small: [], dim: [], fold: []
```

with:

```js
    sw: document.documentElement.scrollWidth, over: [], small: [], dim: [], fold: [],
    overlap: []
```

Replace:

```js
  out.dim = out.dim.slice(0, 12);
```

with:

```js
  out.dim = out.dim.slice(0, 12);
  out.overlap = out.overlap.slice(0, 12);
```

In `main()`, replace:

```python
                           or got["small"] or got["dim"] or got["fold"])
```

with:

```python
                           or got["small"] or got["dim"] or got["fold"]
                           or got["overlap"])
```

and after the loop `for line in got["fold"]:` and its `print`, add:

```python
                    for line in got["overlap"]:
                        print("       overlap  > " + line)
```

- [ ] **Step 2: Write the target probe**

Create `out/targets.py` with the Write tool:

```python
"""Print the size of the Settings radios and the credit links. Not committed."""
import sys

sys.path.insert(0, "scripts")
from playwright.sync_api import sync_playwright
from shots import open_page

JS = """() => [...document.querySelectorAll('.choice input, .cap a')].map((node) => {
  const box = node.getBoundingClientRect();
  return node.tagName + ' ' + Math.round(box.width) + 'x' + Math.round(box.height);
})"""

with sync_playwright() as play:
    browser = play.chromium.launch()
    for frag in ["#/settings", "#/species/QURU"]:
        page = open_page(browser, 360, "100", frag)
        print(frag, page.evaluate(JS))
        page.close()
    browser.close()
```

- [ ] **Step 3: Run the probe and the audit to see them fail**

Run: `DENDRO_BASE=http://localhost:8000/ python out/targets.py`
Expected: `#/settings` lists `INPUT 54x42` (or 53x41) for each radio. `#/species/QURU` lists `A` entries 19 px tall.

Run: `DENDRO_BASE=http://localhost:8000/ python scripts/audit.py 2>&1 | grep -E "grp|target   > a"`
Expected: at width 360, an `overflow > span.grp` line on `progress`. On every screen with a credit, a `target   > a` line.

- [ ] **Step 4: Let a genus group wrap**

In `app/style.css`, replace:

```css
.band .grp{display:flex; gap:2px; margin-right:15px;}
```

with:

```css
/* A genus with more species than fit one line wraps inside its own group,
   so the group never runs past the band. */
.band .grp{display:flex; flex-wrap:wrap; gap:2px; row-gap:7px; max-width:100%;
  margin-right:15px;}
```

- [ ] **Step 5: Make the Settings radio cover the border**

In `app/style.css`, replace:

```css
.choice input{position:absolute; inset:0; margin:0; opacity:0; cursor:pointer;}
```

with:

```css
/* The radio covers the label's border as well as its inside, so the target
   is the whole 44 px box and not the 41 px inside the border. */
.choice input{position:absolute; inset:-1.5px; margin:0; opacity:0; cursor:pointer;}
```

- [ ] **Step 6: Grow the credit link's target**

In `app/style.css`, replace:

```css
.cap a{color:var(--bark);}
```

with:

```css
/* A link in a credit line is a 44 px target. Its own line height makes the
   height, so the line that holds the link is 44 px tall and the other lines
   of the caption keep their spacing. Two links on two lines, or on two
   stacked credit lines, never overlap, because each one owns its line. A
   long name still wraps inside the column, 44 px to a line. */
.cap a{color:var(--bark); display:inline-block; min-width:44px;
  line-height:44px; max-width:100%; overflow-wrap:anywhere;}
```

- [ ] **Step 7: Run the probe and the audit again**

Run: `DENDRO_BASE=http://localhost:8000/ python out/targets.py`
Expected: every `INPUT` entry is `56x44` or larger. Every `A` entry is at least 44 in both numbers.

Run: `DENDRO_BASE=http://localhost:8000/ python scripts/audit.py 2>&1 | grep -E "grp|target   > a|overlap"`
Expected: no output.

If an `overlap` line names a pair of controls outside a credit line, do not change the layout in this task. Stop and report the line to the controller.

- [ ] **Step 8: Look at one credit**

Run: `DENDRO_BASE=http://localhost:8000/ python scripts/shots.py out/shots`. Look at `species-360-100.png` and `home-360-100.png`. The line that holds the author link is taller than before, about 44 px. The other lines of the caption keep their old spacing. The author name stays in one piece.

- [ ] **Step 9: Commit**

```bash
git add app/style.css scripts/audit.py
git commit -m "fix(ui): credit links and settings radios reach 44 px, and a genus group wraps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: No caption on a question, every credit on the reveal

**Files:**
- Modify: `app/logic/question.js` (a new export after `answerPhoto`, about line 256)
- Modify: `tests/question.test.js:6-10` (the import), and append four tests
- Create: `app/logic/licenses.js`, `tests/licenses.test.js`
- Modify: `app/ui/plate.js` (`credit`, as Task 2 left it)
- Modify: `app/screens/session.js:8-10`, `:18-19`, `:72-76`, `:246-263`, `:281-302`, `:338-365`, `:369-444`, `:458-545`, `:621-636`, `:726-733`
- Modify: `docs/superpowers/specs/2026-09-21-tree-id-app-design.md:403-405`

**Interfaces:**
- Consumes: `answerPhoto(question)`, `buildQuestion`, `buildReveal`, `credit(photo, lead)`, `plate(photo, options)` from Task 2.
- Produces:
  - `revealCredits(question, reveal, lost = []) => Array<{ photo, label, from }>`, where `from` is `'question'` or `'reveal'`. Ordered: the question's photos first (the options, in the order shown, for `inv`), then any photo only the reveal shows. One entry per hash. A hash in `lost` (a grid photo that failed to load) gets no entry.
  - `LICENSE_URLS: Record<string, string>` and `licenseUrl(name) => string | null`, from `app/logic/licenses.js`.
  - `credit(photo, lead)` links the license name when `licenseUrl` knows it.
  - `paintReveal(question, reveal, typedText, correct, levels, lost)` on the session screen. The suspended view carries `lost`.

- [ ] **Step 1: Write the failing tests**

In `tests/question.test.js`, replace:

```js
  labelFor, buildQuestion, answerPhoto, buildReveal
} from '../app/logic/question.js';
```

with:

```js
  labelFor, buildQuestion, answerPhoto, buildReveal, revealCredits
} from '../app/logic/question.js';
```

Append at the end of the file:

```js
test('a photo grid reveal credits every photo the question showed', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({
    card, content, state: { tier: 'inv' }, excluded_hashes: [], rng: makeRng(13)
  });
  const wrong = q.options.find((o) => o.key !== 'QUGA').key;
  const reveal = buildReveal({ question: q, chosen_key: wrong, content });
  const credits = revealCredits(q, reveal);
  assert.deepEqual(credits.map((c) => c.photo.hash), q.options.map((o) => o.photo.hash));
  assert.deepEqual(credits.map((c) => c.label), q.options.map((o) => o.label));
  assert.ok(credits.every((c) => c.from === 'question'));
});

test('a wrong pick credits the question photo and the pair photo', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(21) });
  const reveal = buildReveal({ question: q, chosen_key: 'QURU', content });
  const credits = revealCredits(q, reveal);
  assert.deepEqual(credits.map((c) => [c.photo.hash, c.label, c.from]), [
    [q.photo.hash, 'Gambel oak', 'question'],
    [reveal.chosen.photo.hash, 'Northern red oak', 'reveal']
  ]);
});

test('a right answer credits its one photo once', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({ card, content, state: null, excluded_hashes: [], rng: makeRng(21) });
  const reveal = buildReveal({ question: q, chosen_key: 'QUGA', content });
  const credits = revealCredits(q, reveal);
  assert.equal(credits.length, 1);
  assert.equal(credits[0].photo.hash, q.photo.hash);
  assert.equal(credits[0].from, 'question');
});

test('a grid photo that failed to load gets no credit', () => {
  const card = content.cards['species:QUGA:leaf'];
  const q = buildQuestion({
    card, content, state: { tier: 'inv' }, excluded_hashes: [], rng: makeRng(13)
  });
  const lost = q.options.find((o) => o.key !== 'QUGA').photo.hash;
  const reveal = buildReveal({ question: q, chosen_key: 'QUGA', content });
  const credits = revealCredits(q, reveal, [lost]);
  assert.equal(credits.length, q.options.length - 1);
  assert.ok(!credits.some((c) => c.photo.hash === lost));
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/question.test.js`
Expected: FAIL. The file does not load: `The requested module '../app/logic/question.js' does not provide an export named 'revealCredits'`.

- [ ] **Step 3: Write `revealCredits`**

In `app/logic/question.js`, directly after the function `answerPhoto`, add:

```js
// Every photo the reveal owes a credit for. The photos the question showed
// come first, in the order the reader saw them. A photo that only the reveal
// shows comes after: the pair's second photo on a wrong pick. A photo is its
// hash, so a photo both show is listed once. `from` tells the two apart: a
// question photo keeps its credit even when a reveal plate fails, because
// the reader already saw it. `lost` holds the hashes of grid photos that
// failed to load: the reader never saw them, so they get no credit.
export function revealCredits(question, reveal, lost = []) {
  const out = [];
  const seen = new Set();
  const add = (photo, label, from) => {
    if (!photo || seen.has(photo.hash)) return;
    seen.add(photo.hash);
    out.push({ photo, label, from });
  };
  if (question.format === 'inv') {
    for (const option of question.options) {
      if (option.photo && lost.includes(option.photo.hash)) continue;
      add(option.photo, option.label, 'question');
    }
  } else {
    add(question.photo, reveal.answer.label, 'question');
  }
  add(reveal.answer.photo, reveal.answer.label, 'reveal');
  // The screen draws the pair only when both photos exist.
  if (reveal.chosen && reveal.answer.photo) {
    add(reveal.chosen.photo, reveal.chosen.label, 'reveal');
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/question.test.js`
Expected: PASS, 0 fail.

- [ ] **Step 5: Import the new function on the session screen**

In `app/screens/session.js`, replace:

```js
import {
  buildQuestion, buildReveal, invAvailable, answerPhoto
} from '../logic/question.js';
```

with:

```js
import {
  buildQuestion, buildReveal, invAvailable, answerPhoto, revealCredits
} from '../logic/question.js';
```

- [ ] **Step 6: Replace the fixed caption string**

Replace:

```js
// The caption on a question plate never names the tree.
const UNDETERMINED = 'Pressed specimen, undetermined.';
```

with:

```js
// A question names nothing. The alt text says what the photo is for, and the
// credit waits for the reveal, where a name gives nothing away.
const QUESTION_ALT = 'The photo to identify';
```

- [ ] **Step 7: Drop the dead options on the grid plates**

Replace:

```js
          alt: 'Option photo',
          shape: null,
          soft: true,
          onError: () => {
```

with:

```js
          alt: 'Option photo',
          onError: () => {
```

- [ ] **Step 8: Remove the question caption**

Replace:

```js
      alt: UNDETERMINED,
      shape: 'pl-hero',
```

with:

```js
      alt: QUESTION_ALT,
      shape: 'pl-hero',
```

and replace:

```js
    root.append(figure);
    root.append(credit(question.photo, UNDETERMINED));
    lastHash[card.id] = question.photo.hash;
```

with:

```js
    root.append(figure);
    lastHash[card.id] = question.photo.hash;
```

- [ ] **Step 9: Keep the grid photos that failed to load**

The reveal must not credit a grid photo the reader never saw. The screen keeps their hashes and hands them to the reveal.

Replace:

```js
  const lastHash = resumed ? { ...resumed.last_hash } : {};
```

with:

```js
  const lastHash = resumed ? { ...resumed.last_hash } : {};
  // The grid photos of the card on screen that failed to load. The reveal
  // owes them no credit, because the reader never saw them.
  let lostPhotos = new Set();
```

In the grid `onError`, replace:

```js
            button.remove();
            if (pending === 0 && !startedAt) startedAt = Date.now();
```

with:

```js
            button.remove();
            lostPhotos.add(option.photo.hash);
            if (pending === 0 && !startedAt) startedAt = Date.now();
```

In `showCard`, replace:

```js
    const generation = (renderId += 1);
    shown = answerCount + 1;
```

with:

```js
    const generation = (renderId += 1);
    shown = answerCount + 1;
    lostPhotos = new Set();
```

In `answerCard`, replace:

```js
    lastView = () => paintReveal(question, reveal, typedText, correct, levels);
    paintReveal(question, reveal, typedText, correct, levels);
```

with:

```js
    const lost = [...lostPhotos];
    lastView = () => paintReveal(question, reveal, typedText, correct, levels, lost);
    paintReveal(question, reveal, typedText, correct, levels, lost);
```

Replace:

```js
  function paintReveal(question, reveal, typedText, correct, levels) {
```

with:

```js
  function paintReveal(question, reveal, typedText, correct, levels, lost = []) {
```

Inside `paintReveal`, replace:

```js
        suspend({
          question, reveal, typed_text: typedText, correct, levels
        });
```

with:

```js
        suspend({
          question, reveal, typed_text: typedText, correct, levels, lost
        });
```

At the end of `render`, replace:

```js
    lastView = () => paintReveal(
      view.question, view.reveal, view.typed_text, view.correct, view.levels
    );
```

with:

```js
    lastView = () => paintReveal(
      view.question, view.reveal, view.typed_text, view.correct, view.levels,
      view.lost ?? []
    );
```

- [ ] **Step 10: Print every credit on the reveal**

Replace the block from `    if (!correct && reveal.chosen && reveal.chosen.photo && reveal.answer.photo) {` down to and including `      panel.append(credit(reveal.answer.photo));` and the `    }` after it, with:

```js
    // One credit line for each photo the question showed and each photo the
    // reveal shows. The block goes in after the level line, above Next.
    const credits = el('div', 'credits');
    for (const entry of revealCredits(question, reveal, lost)) {
      const line = credit(entry.photo, `${entry.label}.`);
      line.dataset.from = entry.from;
      credits.append(line);
    }

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
      // A pair is a comparison. One plate of two is not a comparison, and the
      // default `onError` would put a line of prose into a two-column grid
      // beside a photograph. So either plate failing takes the pair and the
      // two labels above it, and leaves one printed line in their place. The
      // reader saw the question's photos, so their credits stay. A photo only
      // the pair showed is gone, and its credit goes with it.
      const dropPair = () => {
        if (!pair.isConnected) return;
        heads.remove();
        for (const line of credits.querySelectorAll('[data-from="reveal"]')) line.remove();
        pair.replaceWith(el('p', 'fact-line',
          'The two plates for this pair did not load.'));
      };
      const a = plate(reveal.answer.photo, {
        image_base: imageBase, alt: `${reveal.answer.label}, the answer`,
        shape: 'pl-a', onError: dropPair
      });
      const b = plate(reveal.chosen.photo, {
        image_base: imageBase, alt: `${reveal.chosen.label}, your pick`,
        shape: 'pl-b', onError: dropPair
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
    }
```

Then, further down in `paintReveal`, replace:

```js
    panel.append(levelLine(levels));

    const next = el('button', 'btn', 'Next');
```

with:

```js
    panel.append(levelLine(levels));
    // The app spec's reveal order: photos, the diagnostic sentence, the
    // level, the credits, then Next.
    if (credits.childElementCount > 0) panel.append(credits);

    const next = el('button', 'btn', 'Next');
```

- [ ] **Step 11: Link the license name**

Create `tests/licenses.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LICENSE_URLS, licenseUrl } from '../app/logic/licenses.js';

test('each Creative Commons name the manifest uses links to its deed', () => {
  const cc = 'https://creativecommons.org/';
  assert.equal(licenseUrl('CC0'), `${cc}publicdomain/zero/1.0/`);
  assert.equal(licenseUrl('CC0 1.0'), `${cc}publicdomain/zero/1.0/`);
  assert.equal(licenseUrl('CC BY 2.0'), `${cc}licenses/by/2.0/`);
  assert.equal(licenseUrl('CC BY 2.5'), `${cc}licenses/by/2.5/`);
  assert.equal(licenseUrl('CC BY 3.0'), `${cc}licenses/by/3.0/`);
  assert.equal(licenseUrl('CC BY 3.0 us'), `${cc}licenses/by/3.0/us/`);
  assert.equal(licenseUrl('CC BY 4.0'), `${cc}licenses/by/4.0/`);
  assert.equal(licenseUrl('CC BY-SA 2.0'), `${cc}licenses/by-sa/2.0/`);
  assert.equal(licenseUrl('CC BY-SA 2.5'), `${cc}licenses/by-sa/2.5/`);
  assert.equal(licenseUrl('CC BY-SA 3.0'), `${cc}licenses/by-sa/3.0/`);
  assert.equal(licenseUrl('CC BY-SA 4.0'), `${cc}licenses/by-sa/4.0/`);
  assert.equal(Object.keys(LICENSE_URLS).length, 11);
});

test('a license with no deed page prints as text', () => {
  assert.equal(licenseUrl('Public domain'), null);
  assert.equal(licenseUrl('public domain (US government work)'), null);
  assert.equal(licenseUrl('CC BY-NC 4.0'), null);
  assert.equal(licenseUrl('toString'), null);
  assert.equal(licenseUrl(undefined), null);
});
```

Run: `node --test tests/licenses.test.js`
Expected: FAIL. The file does not load: `Cannot find module` for `app/logic/licenses.js`.

Create `app/logic/licenses.js`:

```js
// The deed page for each license name the manifest uses. The list is the
// distinct values in content/images/manifest.json on 2026-09-25. A name
// with no entry prints as plain text: public domain has no deed page, and a
// new name waits until someone adds it here. Pure.
const CC = 'https://creativecommons.org/';

export const LICENSE_URLS = {
  'CC0': `${CC}publicdomain/zero/1.0/`,
  'CC0 1.0': `${CC}publicdomain/zero/1.0/`,
  'CC BY 2.0': `${CC}licenses/by/2.0/`,
  'CC BY 2.5': `${CC}licenses/by/2.5/`,
  'CC BY 3.0': `${CC}licenses/by/3.0/`,
  'CC BY 3.0 us': `${CC}licenses/by/3.0/us/`,
  'CC BY 4.0': `${CC}licenses/by/4.0/`,
  'CC BY-SA 2.0': `${CC}licenses/by-sa/2.0/`,
  'CC BY-SA 2.5': `${CC}licenses/by-sa/2.5/`,
  'CC BY-SA 3.0': `${CC}licenses/by-sa/3.0/`,
  'CC BY-SA 4.0': `${CC}licenses/by-sa/4.0/`
};

export function licenseUrl(name) {
  if (typeof name !== 'string' || !Object.hasOwn(LICENSE_URLS, name)) return null;
  return LICENSE_URLS[name];
}
```

Run: `node --test tests/licenses.test.js`
Expected: PASS, 0 fail.

In `app/ui/plate.js`, replace:

```js
import { el } from './dom.js';
import { imageUrl } from '../logic/content.js';
```

with:

```js
import { el } from './dom.js';
import { imageUrl } from '../logic/content.js';
import { licenseUrl } from '../logic/licenses.js';
```

and replace the whole function `credit` and the comment above it with:

```js
// A link that opens in a new tab, for the two links a credit carries.
function outLink(text, href) {
  const anchor = el('a', null, text);
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  return anchor;
}

// The credit line. The author links to the photo's origin page, so the credit
// reaches the source. The license name links to its deed when the app knows
// one, and prints as text when it does not.
export function credit(photo, lead = '') {
  const line = el('p', 'cap plate-cap');
  if (lead) line.append(document.createTextNode(`${lead} `));
  if (photo.origin) line.append(outLink(photo.author, photo.origin));
  else line.append(document.createTextNode(photo.author));
  line.append(document.createTextNode(`, ${photo.source}, `));
  const deed = licenseUrl(photo.license);
  if (deed) line.append(outLink(photo.license, deed));
  else line.append(document.createTextNode(photo.license));
  line.append(document.createTextNode('.'));
  return line;
}
```

- [ ] **Step 12: Change the attribution rule in the app spec**

In `docs/superpowers/specs/2026-09-21-tree-id-app-design.md`, replace:

```markdown
Attribution is displayed wherever the image is shown. The line reads
`<author>, <source>, <license>.` with the author linked to the origin URL. When `origin`
is absent, the author is plain text.
```

with:

```markdown
Attribution is displayed on the reveal for every photo the question showed, and
wherever else the image is shown. A question itself shows no caption, because a caption
could name the tree. The line reads `<author>, <source>, <license>.` with the author
linked to the origin URL, and the license linked to its deed when the app knows one.
When `origin` is absent, the author is plain text. (Changed 2026-09-25.)
```

- [ ] **Step 13: Check that no fixed caption is left**

Run: `git grep -n -E "UNDETERMINED|Pressed specimen|undetermined" -- app`
Expected: no output.

- [ ] **Step 14: Run the unit tests**

Run: `npm test`
Expected: 6 more tests than before this task (4 in `question.test.js`, 2 in `licenses.test.js`), 0 fail.

- [ ] **Step 15: Look at a question and a reveal**

Run: `DENDRO_BASE=http://localhost:8000/ python scripts/shots.py out/shots`
Look at these shots:
- `session-390-100.png`: no caption under the photo.
- `reveal-390-100.png`: the diagnostic sentence under the pair, then the level line, then two credit lines, each one starting with a tree name, then Next.
- `session-inv-390-100.png`: no caption.

Then run `DENDRO_BASE=http://localhost:8000/ python scripts/audit.py 2>&1 | grep -E "target   > a|overlap"`. Expected: no output. A grid reveal can print up to eight credit lines, and none of their links may overlap.

- [ ] **Step 16: Commit**

```bash
git add app/logic/question.js tests/question.test.js app/logic/licenses.js tests/licenses.test.js app/ui/plate.js app/screens/session.js docs/superpowers/specs/2026-09-21-tree-id-app-design.md
git commit -m "fix(session): a question shows no caption, and the reveal credits every photo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Genus names start with a capital on the reveal

**Files:**
- Modify: `app/logic/question.js:3`, `:144-150`
- Modify: `tests/question.test.js:165-166`, `:375`

**Interfaces:**
- Consumes: `capitalize(text)` from `app/logic/words.js`, the same rule `displayName()` uses.
- Produces: `labelFor(content, 'group', channel, key).label` starts with a capital letter. No signature changes.

Run this task after Task 4. Both edit `question.js` and `question.test.js`.

- [ ] **Step 1: Change the two tests that pin the lowercase label**

In `tests/question.test.js`, replace:

```js
  assert.deepEqual(labelFor(content, 'group', 'leaf', 'Quercus'),
    { label: 'oak', sublabel: 'Quercus' });
```

with:

```js
  assert.deepEqual(labelFor(content, 'group', 'leaf', 'Quercus'),
    { label: 'Oak', sublabel: 'Quercus' });
```

and replace:

```js
  assert.equal(reveal.diagnostic.text, 'The answer is oak. You picked Acer.');
```

with:

```js
  assert.equal(reveal.diagnostic.text, 'The answer is Oak. You picked Acer.');
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/question.test.js`
Expected: 2 FAIL, with `'oak'` against `'Oak'`.

- [ ] **Step 3: Capitalize the genus common name**

In `app/logic/question.js`, replace:

```js
import { displayName } from './words.js';
```

with:

```js
import { displayName, capitalize } from './words.js';
```

and replace:

```js
    // genus_common is optional. With no live member that carries one, the genus
    // fills both rows.
    const member = Object.values(content.species)
      .find((s) => s.genus === key && !s.retired && s.genus_common);
    return { label: member?.genus_common ?? key, sublabel: key };
```

with:

```js
    // genus_common is optional. With no live member that carries one, the genus
    // fills both rows. The content keeps the lowercase form, as it does for a
    // species name, and a label starts with a capital the way `displayName`
    // prints one.
    const member = Object.values(content.species)
      .find((s) => s.genus === key && !s.retired && s.genus_common);
    return { label: member ? capitalize(member.genus_common) : key, sublabel: key };
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test`
Expected: the same count as after Task 4, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add app/logic/question.js tests/question.test.js
git commit -m "fix(question): a genus name starts with a capital, as a species name does" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The session header names a unit only for that unit's cards

**Files:**
- Modify: `app/logic/session.js:1-4` (imports), `:98-103` (the return of `buildSession`), and a new export after `sessionPosition` (about line 32)
- Modify: `tests/session.test.js:7-12` (the import), and add two tests
- Modify: `app/screens/session.js:3`, `:4-7`, `:64-70`, `:181-183`, `:624`

**Interfaces:**
- Consumes: `unitFor(content, unitKey) => Unit | null` from `app/logic/content.js`; `content.unit_cards: Record<string, string[]>`.
- Produces: `buildSession(...).unit_key` is the unit key only when the deck holds at least one new card from that unit, and `null` otherwise. `sessionPlace({ content, mode, unit_key, card_id }) => string`: `'Placement test'` in placement mode, the unit name when `card_id` is in `content.unit_cards[unit_key]`, and `'Review'` otherwise.

Run this task after Task 5. Task 4 also edits `app/screens/session.js`.

- [ ] **Step 1: Write the failing tests**

In `tests/session.test.js`, replace:

```js
  emptyResults, accumulateAnswer, newCardCapDone
} from '../app/logic/session.js';
```

with:

```js
  emptyResults, accumulateAnswer, newCardCapDone, sessionPlace
} from '../app/logic/session.js';
```

Add directly after the test `'a chosen unit overrides the recommended unit'`:

```js
test('a deck that due cards fill carries no unit key', () => {
  const states = { 'species:QUGA:leaf': reviewed('2026-03-01') };
  const result = buildSession({
    content, states, log: [], settings: { session_size: 1, new_per_day: 10 },
    today: TODAY, focus: 'leaf', chosen_unit: 'simple_lobed_maples_co', rng: makeRng(43)
  });
  assert.deepEqual(result.card_ids, ['species:QUGA:leaf']);
  assert.deepEqual(result.new_card_ids, []);
  assert.equal(result.unit_key, null);
});

test('the header names the unit only for a card in that unit', () => {
  const unitKey = 'simple_lobed_maples_co';
  const place = (cardId, mode = 'review', key = unitKey) =>
    sessionPlace({ content, mode, unit_key: key, card_id: cardId });
  assert.equal(place('species:ACPL:leaf'), 'Maples');
  assert.equal(place('species:QUGA:leaf'), 'Review');
  assert.equal(place('species:ACPL:leaf', 'review', null), 'Review');
  assert.equal(place('concept:leaf:simple_lobed', 'placement', null), 'Placement test');
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/session.test.js`
Expected: FAIL. The file does not load: `does not provide an export named 'sessionPlace'`.

- [ ] **Step 3: Write `sessionPlace`**

In `app/logic/session.js`, replace:

```js
import { gateStatus, cardLevel } from './progress.js';
```

with:

```js
import { gateStatus, cardLevel } from './progress.js';
import { unitFor } from './content.js';
```

Directly after the function `sessionPosition`, add:

```js
// The first words of the session header, for one card. A unit's name belongs
// only to that unit's cards. A due card from anywhere else is a review.
export function sessionPlace({ content, mode, unit_key: unitKey, card_id: cardId }) {
  if (mode === 'placement') return 'Placement test';
  const ids = unitKey ? content.unit_cards[unitKey] ?? [] : [];
  if (!ids.includes(cardId)) return 'Review';
  return unitFor(content, unitKey)?.name ?? 'Review';
}
```

- [ ] **Step 4: Return a unit key only with new cards**

In `buildSession`, replace:

```js
  return {
    card_ids: shuffle([...picked, ...newIds], rng),
    unit_key: unitKey,
```

with:

```js
  return {
    card_ids: shuffle([...picked, ...newIds], rng),
    // A unit the deck took no new card from is not what the session studies.
    unit_key: newIds.length > 0 ? unitKey : null,
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test tests/session.test.js`
Expected: PASS, 0 fail.

- [ ] **Step 6: Use the place on the session screen**

In `app/screens/session.js`, replace:

```js
import { unitFor, channelLabel } from '../logic/content.js';
import {
  buildSession, buildPlacementDeck, answerEffects, requeueCard,
  dueTomorrowCount, sessionPosition, emptyResults, accumulateAnswer
} from '../logic/session.js';
```

with:

```js
import { channelLabel } from '../logic/content.js';
import {
  buildSession, buildPlacementDeck, answerEffects, requeueCard,
  dueTomorrowCount, sessionPosition, emptyResults, accumulateAnswer,
  sessionPlace
} from '../logic/session.js';
```

Replace:

```js
  const unit = built?.unit_key ? unitFor(content, built.unit_key) : null;
  const deck = resumed
    ? [...resumed.deck]
    : built.card_ids;
  const where = resumed
    ? resumed.where
    : (mode === 'placement' ? 'Placement test' : (unit?.name ?? 'Review'));
```

with:

```js
  // The unit the deck took its new cards from, or null. The header reads it
  // card by card, through `sessionPlace`.
  const unitKey = resumed ? resumed.unit_key : (built.unit_key ?? null);
  const deck = resumed
    ? [...resumed.deck]
    : built.card_ids;
```

Replace:

```js
    bar.append(el('span', 'where',
      `${where}, ${channelLabel(question.channel)} card `
      + `${place.position} of ${place.total}`));
```

with:

```js
    const where = sessionPlace({ content, mode, unit_key: unitKey, card_id: question.card_id });
    bar.append(el('span', 'where',
      `${where}, ${channelLabel(question.channel)} card `
      + `${place.position} of ${place.total}`));
```

In `suspend`, replace:

```js
      token,
      where,
      deck: [...deck],
```

with:

```js
      token,
      unit_key: unitKey,
      deck: [...deck],
```

- [ ] **Step 7: Run the unit tests**

Run: `npm test`
Expected: 2 more tests than before this task, 0 fail.

- [ ] **Step 8: Look at the header**

Run: `DENDRO_BASE=http://localhost:8000/ python scripts/shots.py out/shots`
Look at `session-typed-390-100.png`. The header does not read "Leaf types, fruit card". A fruit card reads "Review, fruit card" or a fruit unit's name.

- [ ] **Step 9: Commit**

```bash
git add app/logic/session.js tests/session.test.js app/screens/session.js
git commit -m "fix(session): the header names a unit only on that unit's cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The counter counts a card that comes back

**Files:**
- Modify: `app/logic/session.js` (a new export after `sessionPosition`)
- Modify: `tests/session.test.js` (the import, and one test after `'the session position stays inside the deck'`)
- Modify: `app/screens/session.js:175` (in `head`)

**Interfaces:**
- Consumes: `sessionPosition(shown, total)`; the screen's `requeuedOnce: Set<string>`.
- Produces: `sessionTotal(deckLength: number, requeuedCount: number) => number`.

Run this task after Task 6. Both edit the same three files.

`requeueCard` moves a missed card to the back and keeps the deck length. So an eight-card deck with one miss asks nine questions, and the counter stops at "8 of 8" for the ninth.

- [ ] **Step 1: Write the failing test**

In `tests/session.test.js`, replace:

```js
  emptyResults, accumulateAnswer, newCardCapDone, sessionPlace
} from '../app/logic/session.js';
```

with:

```js
  emptyResults, accumulateAnswer, newCardCapDone, sessionPlace, sessionTotal
} from '../app/logic/session.js';
```

Add directly after the test `'the session position stays inside the deck'`:

```js
test('a card that comes back after a miss counts in the total', () => {
  assert.equal(sessionTotal(8, 0), 8);
  assert.equal(sessionTotal(8, 1), 9);
  // An eight-card deck with one repeat asks nine questions, and the last
  // one reads 9 of 9.
  assert.deepEqual(sessionPosition(9, sessionTotal(8, 1)),
    { position: 9, total: 9, percent: 100 });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test tests/session.test.js`
Expected: FAIL. The file does not load: `does not provide an export named 'sessionTotal'`.

- [ ] **Step 3: Write `sessionTotal`**

In `app/logic/session.js`, directly after the function `sessionPosition`, add:

```js
// How many questions the session asks: each card in the deck once, and one
// more for each card that came back after a miss. `requeueCard` moves the
// card to the back and keeps the deck length, so the repeat is not in it.
export function sessionTotal(deckLength, requeuedCount) {
  return Math.max(0, deckLength) + Math.max(0, requeuedCount);
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test tests/session.test.js`
Expected: PASS, 0 fail.

- [ ] **Step 5: Use the total on the session screen**

In `app/screens/session.js`, replace:

```js
  dueTomorrowCount, sessionPosition, emptyResults, accumulateAnswer,
  sessionPlace
} from '../logic/session.js';
```

with:

```js
  dueTomorrowCount, sessionPosition, emptyResults, accumulateAnswer,
  sessionPlace, sessionTotal
} from '../logic/session.js';
```

In `head`, replace:

```js
    const place = sessionPosition(shown, deck.length);
```

with:

```js
    const place = sessionPosition(shown, sessionTotal(deck.length, requeuedOnce.size));
```

- [ ] **Step 6: Run the unit tests**

Run: `npm test`
Expected: 1 more test than before this task, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add app/logic/session.js tests/session.test.js app/screens/session.js
git commit -m "fix(session): the counter and the gauge count a missed card that comes back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The export file carries its date, and import asks first

**Files:**
- Modify: `app/logic/store.js:246-262` (`exportBlob`), `:265-301` (`importBlob`)
- Modify: `tests/store.test.js` (two tests after `'export and import make a round trip'`)
- Modify: `app/screens/settings.js:115-144`
- Create (not committed, `out/` is ignored): `out/import_check.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `store.checkImport(text) => { ok: boolean, errors: string[] }`, which writes nothing. `store.importBlob(text)` keeps its result shape. The settings section of `store.exportBlob(today).json` holds `last_export: today`.

- [ ] **Step 1: Write the failing tests**

In `tests/store.test.js`, add directly after the test `'export and import make a round trip'`:

```js
test('the export file holds the date it was made', () => {
  const first = createStore(memoryStorage());
  const blob = first.exportBlob('2026-03-10');
  assert.equal(JSON.parse(blob.json).dendro_settings.last_export, '2026-03-10');
  const second = createStore(memoryStorage());
  assert.deepEqual(second.importBlob(blob.json), { ok: true, errors: [] });
  assert.equal(second.readSettings().last_export, '2026-03-10');
});

test('checkImport reads a file and writes nothing', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  assert.deepEqual(store.checkImport(goodBlob()), { ok: true, errors: [] });
  assert.deepEqual(store.readCards(), {});
  assert.equal(storage.getItem('dendro_cards'), null);
  const bad = store.checkImport('{oops');
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.errors, ['The file is not valid JSON.']);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/store.test.js`
Expected: 2 FAIL: `null` against `'2026-03-10'`, and `store.checkImport is not a function`.

- [ ] **Step 3: Stamp the date in the export**

In `app/logic/store.js`, in `exportBlob`, replace:

```js
        [KEYS.settings]: stamp(api.readSettings()),
```

with:

```js
        // The screen saves the date after it builds the file, so the file
        // must set it here.
        [KEYS.settings]: stamp({ ...api.readSettings(), last_export: today }),
```

- [ ] **Step 4: Split the check from the write**

Replace the whole `importBlob(text) { ... },` method with:

```js
    // Reads an export file and says whether it can be imported. Writes
    // nothing, so the screen can ask before `importBlob` replaces anything.
    checkImport(text) {
      const { ok, errors } = parseImport(text);
      return { ok, errors };
    },

    importBlob(text) {
      const parsed = parseImport(text);
      if (!parsed.ok) return { ok: false, errors: parsed.errors };
      for (const key of Object.values(KEYS)) write(key, parsed.sections[key]);
      return { ok: true, errors: [] };
    },
```

Directly before the line `  const api = {`, add the function below. Its body is the old `importBlob` body, with the write loop taken out and `sections` returned:

```js
  // The import check, shared by `checkImport` and `importBlob`.
  function parseImport(text) {
    // A blocked write must not report success. Import is how a user recovers.
    if (!available) {
      return { ok: false, errors: ['This browser is not storing your progress.'] };
    }
    if (newerVersion) {
      return {
        ok: false,
        errors: ['Your stored data comes from a newer version of this app, so the import stops and leaves that data alone.']
      };
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return { ok: false, errors: ['The file is not valid JSON.'] };
    }
    const errors = [];
    if (!isPlainObject(payload)) {
      return { ok: false, errors: ['The file holds no export object.'] };
    }
    if (payload.version !== STORE_VERSION) {
      errors.push(`The file says version ${payload.version}. This app reads version ${STORE_VERSION}.`);
    }
    const sections = {};
    for (const key of Object.values(KEYS)) {
      if (payload[key] === undefined) {
        errors.push(`The file has no ${key} section.`);
        continue;
      }
      const error = sectionError(key, payload[key]);
      if (error) errors.push(error);
      else sections[key] = migrateSection(key, payload[key]);
    }
    if (errors.length) return { ok: false, errors };
    return { ok: true, errors: [], sections };
  }

```

Before you paste, compare the old body with this one line by line. If the old body differs from the text above anywhere other than the write loop, keep the old line.

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test tests/store.test.js`
Expected: PASS, 0 fail.

- [ ] **Step 6: Ask before an import writes**

In `app/screens/settings.js`, replace the block from `  fileField.addEventListener('change', async () => {` down to and including `  group.append(importRow);` with:

```js
  // An import replaces every level and date on this phone, so it asks first,
  // the way Reset does. The file is checked before the question: a file that
  // cannot be imported is rejected with no question at all.
  const importConfirm = el('div', 'setbtn warn');
  const importYes = el('button', 'sbn', 'Yes, replace my progress');
  importYes.type = 'button';
  importConfirm.append(importYes,
    el('span', 'sbd', 'the file replaces every level and date here'));
  importConfirm.hidden = true;
  let pendingText = null;

  fileField.addEventListener('change', async () => {
    const chosen = fileField.files?.[0];
    importConfirm.hidden = true;
    pendingText = null;
    if (!chosen) return;
    // A file the browser cannot read rejects here. Say so, or the note would
    // keep the line it printed before.
    let text;
    try {
      text = await chosen.text();
    } catch {
      importNote.textContent = 'the file could not be read';
      return;
    }
    // The same file picked again must fire `change` again.
    fileField.value = '';
    const checked = store.checkImport(text);
    if (!checked.ok) {
      importNote.textContent = `rejected: ${checked.errors.join(' ')}`;
      return;
    }
    pendingText = text;
    importNote.textContent = `${chosen.name} is ready to import`;
    importConfirm.hidden = false;
  });
  importYes.addEventListener('click', () => {
    if (pendingText === null) return;
    const result = store.importBlob(pendingText);
    pendingText = null;
    importConfirm.hidden = true;
    importNote.textContent = result.ok
      ? 'imported, reload to see it'
      : `rejected: ${result.errors.join(' ')}`;
    if (result.ok && !store.available) ctx.banner(ctx.storage_banner);
    if (result.ok) exportNote.textContent = noteText();
  });
  importRow.append(fileField);
  group.append(importRow, importConfirm);
```

- [ ] **Step 7: Run the unit tests**

Run: `npm test`
Expected: 2 more tests than before this task, 0 fail.

- [ ] **Step 8: Check the import in a browser**

Create `out/import_check.py` with the Write tool. It is not committed (`out/` is ignored):

```python
"""Check that Import asks before it writes. Not committed."""
import pathlib
import sys

sys.path.insert(0, "scripts")
from playwright.sync_api import sync_playwright
from shots import open_page

bad = pathlib.Path("out/bad.json")
bad.write_text("{oops", encoding="utf-8")
with sync_playwright() as play:
    browser = play.chromium.launch()
    page = open_page(browser, 390, "100", "#/settings")
    with page.expect_download() as info:
        page.click("button.sbn:has-text('Export')")
    good = info.value.path()
    page.set_input_files("#import_file", str(good))
    page.wait_for_timeout(300)
    print("good:", page.is_visible("text=Yes, replace my progress"),
          page.inner_text("label.setbtn .sbd"))
    page.set_input_files("#import_file", str(bad))
    page.wait_for_timeout(300)
    print("bad:", page.is_visible("text=Yes, replace my progress"),
          page.inner_text("label.setbtn .sbd"))
    browser.close()
```

Run: `python out/import_check.py`
Expected:

```
good: True <a file name> is ready to import
bad: False rejected: The file is not valid JSON.
```

- [ ] **Step 9: Commit**

```bash
git add app/logic/store.js tests/store.test.js app/screens/settings.js
git commit -m "fix(store): the export file holds its date, and import asks before it replaces" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: No export prompt for a new user

**Files:**
- Modify: `app/logic/store.js:320-324` (`shouldPromptExport`), and a new function before `createStore`
- Modify: `tests/store.test.js:260-266` (`'the export prompt fires once a month'`), and one new test after it
- Modify: `app/screens/session.js:588-592`

**Interfaces:**
- Consumes: `daysBetween(from, to)` from `app/logic/scheduler.js`; `EXPORT_PROMPT_DAYS = 30`.
- Produces: `firstAnswerDay(rows) => string | null`, exported from `app/logic/store.js`. `store.shouldPromptExport(today)` keeps its signature.

Run this task after Task 8. It edits `store.js`, as Task 8 does, and `app/screens/session.js`, as Task 7 does.

- [ ] **Step 1: Write the failing tests**

In `tests/store.test.js`, replace:

```js
import {
  STORE_VERSION, KEYS, LOG_CAP, defaultSettings, memoryStorage, createStore, isCount
} from '../app/logic/store.js';
```

with:

```js
import {
  STORE_VERSION, KEYS, LOG_CAP, defaultSettings, memoryStorage, createStore, isCount,
  firstAnswerDay
} from '../app/logic/store.js';
```

Replace:

```js
test('the export prompt fires once a month', () => {
  const store = createStore(memoryStorage());
  assert.equal(store.shouldPromptExport('2026-03-10'), true);
  store.markExported('2026-03-10');
```

with:

```js
test('the export prompt fires once a month', () => {
  const store = createStore(memoryStorage());
  // A fresh store has answered nothing, so there is nothing to export yet.
  assert.equal(store.shouldPromptExport('2026-03-10'), false);
  store.markExported('2026-03-10');
```

Add directly after that test:

```js
test('with no export yet, the prompt waits a month from the first answer', () => {
  const store = createStore(memoryStorage());
  store.appendLog(row('species:QUGA:leaf', '2026-03-10T09:00:00Z'));
  store.appendLog(row('species:QURU:leaf', '2026-03-12T09:00:00Z'));
  assert.equal(firstAnswerDay(store.readLog()), '2026-03-10');
  assert.equal(store.shouldPromptExport('2026-03-10'), false);
  assert.equal(store.shouldPromptExport('2026-04-08'), false);
  assert.equal(store.shouldPromptExport('2026-04-09'), true);
  assert.equal(firstAnswerDay([]), null);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/store.test.js`
Expected: FAIL. The file does not load: `does not provide an export named 'firstAnswerDay'`.

- [ ] **Step 3: Write `firstAnswerDay` and use it**

In `app/logic/store.js`, directly before `export function createStore(storage) {`, add:

```js
// The day of the oldest answer in the log, or null. A row carries its local
// day; an older row carries only `at`, whose date is the fallback.
export function firstAnswerDay(rows) {
  let first = null;
  for (const row of rows) {
    const day = row?.day ?? (typeof row?.at === 'string' ? row.at.slice(0, 10) : null);
    if (typeof day !== 'string') continue;
    if (first === null || day < first) first = day;
  }
  return first;
}

```

Replace:

```js
    shouldPromptExport(today) {
      const last = api.readSettings().last_export;
      if (!last) return true;
      return daysBetween(last, today) >= EXPORT_PROMPT_DAYS;
    },
```

with:

```js
    shouldPromptExport(today) {
      const last = api.readSettings().last_export;
      if (last) return daysBetween(last, today) >= EXPORT_PROMPT_DAYS;
      // No export yet. The prompt waits until the first answer is a month
      // old, so a new user does not see it after the first session.
      const first = firstAnswerDay(api.readLog());
      return first !== null && daysBetween(first, today) >= EXPORT_PROMPT_DAYS;
    },
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/store.test.js`
Expected: PASS, 0 fail.

- [ ] **Step 5: Say the right words on the summary**

In `app/screens/session.js`, replace:

```js
    } else if (store.shouldPromptExport(today)) {
      root.append(el('p', 'note',
        'It has been a month since your last export. Open Settings and export '
        + 'your progress.'));
    }
```

with:

```js
    } else if (store.shouldPromptExport(today)) {
      root.append(el('p', 'note', store.readSettings().last_export
        ? 'It has been a month since your last export. Open Settings and export '
          + 'your progress.'
        : 'Your first answer is a month old, and you have not exported yet. '
          + 'Open Settings and export your progress.'));
    }
```

- [ ] **Step 6: Run the unit tests**

Run: `npm test`
Expected: 1 more test than before this task, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add app/logic/store.js tests/store.test.js app/screens/session.js
git commit -m "fix(store): a new user sees no export prompt until the first answer is a month old" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The app skips a hard photo

**Files:**
- Modify: `app/logic/content.js:30-35` (`speciesImages`), `:58-62` (the concept override rows), `:183`, `:193-195`, and the manifest loop after the `file` field rule (about line 210)
- Modify: `tests/content.test.js:4-8` (the import), and three new tests after `'a retired row and a retired species stay out of every pool'`
- Modify: `docs/superpowers/specs/2026-09-21-tree-id-app-design.md:105-106`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DIFFICULTIES = ['hard']` and `inPlay(row) => boolean` from `app/logic/content.js`. `inPlay` is false for a retired row and for a hard row. `validateContent` fails a row whose `difficulty` is present and not `hard`.

The pipeline validator is this function (`pipeline/cli.ts:10`), so this task also makes the pipeline validate the tag.

- [ ] **Step 1: Write the failing tests**

In `tests/content.test.js`, replace:

```js
  channelLabel, conceptFor, unitFor, varietyCardChannels
} from '../app/logic/content.js';
```

with:

```js
  channelLabel, conceptFor, unitFor, varietyCardChannels, inPlay, DIFFICULTIES
} from '../app/logic/content.js';
```

Add directly after the test `'a retired row and a retired species stay out of every pool'`:

```js
test('a hard row stays in the manifest and out of every pool', () => {
  const raw = loadFixture();
  const hard = raw.manifest.find((m) => m.target === 'QUGA' && m.channel === 'leaf' && !m.retired);
  hard.difficulty = 'hard';
  assert.deepEqual(DIFFICULTIES, ['hard']);
  assert.equal(inPlay(hard), false);
  assert.equal(inPlay({ retired: true }), false);
  assert.equal(inPlay({}), true);
  assert.equal(photoPool(raw, 'species', 'leaf', 'QUGA').length, 1);
  assert.equal(photoPool(raw, 'group', 'leaf', 'Quercus').length, 3);
  assert.equal(photoPool(raw, 'concept', 'leaf', 'simple_lobed').length, 6);
  const result = loadContent(raw);
  assert.equal(result.ok, true);
  assert.ok(result.content.manifest.includes(hard));
});

test('a difficulty other than hard fails validation', () => {
  const easy = badContent();
  easy.manifest[0].difficulty = 'easy';
  assert.match(messages(easy), /the QUGA leaf row has difficulty easy; the only value is hard/);
});

test('a species whose only photo is hard counts as having no photo', () => {
  const onlyHard = badContent();
  onlyHard.manifest[0].difficulty = 'hard';
  assert.match(messages(onlyHard), /QUGA has no manifest image and no confusion edge/);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/content.test.js`
Expected: FAIL. The file does not load: `does not provide an export named 'inPlay'`.

- [ ] **Step 3: Write `inPlay` and use it in the pools**

In `app/logic/content.js`, directly before `function speciesImages(raw, symbol, channel) {`, add:

```js
// The one difficulty a manifest row can carry. A row with no field is a
// normal photo.
export const DIFFICULTIES = ['hard'];

// A row a card may show. A retired row is gone for good. A hard row is held
// back for now: its file stays in the bucket, and a later content task picks
// which photos carry the tag.
export function inPlay(row) {
  return !row.retired && row.difficulty !== 'hard';
}

```

In `speciesImages`, replace:

```js
function speciesImages(raw, symbol, channel) {
  return raw.manifest.filter(
    (m) => m.target === symbol && m.channel === channel && !m.retired
  );
```

with:

```js
function speciesImages(raw, symbol, channel) {
  return raw.manifest.filter(
    (m) => m.target === symbol && m.channel === channel && inPlay(m)
  );
```

The same condition appears again inside `validateContent`. Step 4 changes that one, so keep the function line in this edit.

In `photoPool`, replace:

```js
      (m) => m.target === `${channel}/${key}` && m.channel === channel && !m.retired
```

with:

```js
      (m) => m.target === `${channel}/${key}` && m.channel === channel && inPlay(m)
```

- [ ] **Step 4: Use it in the two species rules of the validator**

In `validateContent`, replace:

```js
    const hasImage = raw.manifest.some((m) => m.target === symbol && !m.retired);
```

with:

```js
    const hasImage = raw.manifest.some((m) => m.target === symbol && inPlay(m));
```

and replace:

```js
      const onChannel = raw.manifest.some(
        (m) => m.target === symbol && m.channel === channel && !m.retired
      );
```

with:

```js
      const onChannel = raw.manifest.some(
        (m) => m.target === symbol && m.channel === channel && inPlay(m)
      );
```

Do not change the credit rule (`if (!image.retired) {`) or the variety rule (`varietyKeys.has(image.target) && !image.retired`). A hard row keeps its credit and its concept rule, because a clear brings it back.

- [ ] **Step 5: Validate the value**

In the manifest loop of `validateContent`, directly after the `if (image.file !== undefined) { ... }` block, add:

```js
    if (image.difficulty !== undefined && !DIFFICULTIES.includes(image.difficulty)) {
      fail('images/manifest.json',
        `the ${where} row has difficulty ${String(image.difficulty)}; the only value is hard`);
    }
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test`
Expected: 3 more tests than before this task, 0 fail.

- [ ] **Step 7: Validate both content sets**

Run: `npm run validate && npm run validate:dev`
Expected: both exit 0 with no `error` line.

- [ ] **Step 8: Note the change in the app spec**

In `docs/superpowers/specs/2026-09-21-tree-id-app-design.md`, replace:

```markdown
A retired manifest row is in no pool, and a retired species contributes nothing to a
group pool or a concept pool.
```

with:

```markdown
A retired manifest row is in no pool, and a retired species contributes nothing to a
group pool or a concept pool.

Added 2026-09-25: a manifest row with `difficulty: "hard"` is in no pool either. Its
file stays in object storage. `hard` is the only allowed value. The validator reads a
hard row as no image when it checks that a live species has one.
```

- [ ] **Step 9: Commit**

```bash
git add app/logic/content.js tests/content.test.js docs/superpowers/specs/2026-09-21-tree-id-app-design.md
git commit -m "feat(content): a manifest row tagged difficulty hard stays out of every pool" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The pipeline sets and clears the hard tag

**Files:**
- Modify: `pipeline/lib/manifest.ts:8-23` (`ManifestRow`), `:35-120` (`publishApproved` returns `hashes`), and append `DIFFICULTIES`, `Difficulty`, `setDifficulty`, and `shownRows`
- Modify: `pipeline/lib/run.ts:33` (`BOOLEAN_FLAGS`)
- Modify: `pipeline/lib/commands.ts:51` (the import), `:160-180` (`USAGE`), `:711-727` (`COMMANDS`), a new handler after `imagesRetire` (about line 1104), `:1171-1181` and `:1231-1233` (`buildContent`), `:1275-1284` (the `reportData` call), `:1377-1388` (`reportData`), `:1500-1523` (`commitRetire`)
- Modify: `pipeline/tests/manifest.test.ts:11-12` (the import), and three tests at the end
- Modify: `pipeline/tests/cli_build.test.ts` (six tests after `'images retire of the last live image retires the species too'`)
- Modify: `.claude/skills/content-run/SKILL.md:197-200`
- Modify: `docs/superpowers/specs/2026-09-22-content-pipeline-design.md:505-506` (a new subsection) and `:651-652` (the test list)

**Interfaces:**
- Consumes: `readManifest(root)`, `readSpecies(root)`, `positional`, `parseFlags`, `flagValue`, `baseResolved`, `rawOf`, `validated`, `readPublished`, `gitShowOf`, `appendOnlyErrors`, `contentSetOf`, `writeJson`, `contentFile`, `gitCommitAll`, `deadObjectKeys`, all in `commands.ts` today.
- Produces:
  - `ManifestRow.difficulty?: Difficulty`
  - `DIFFICULTIES: readonly ['hard']` and `type Difficulty = 'hard'`, from `pipeline/lib/manifest.ts`
  - `setDifficulty(rows: ManifestRow[], hash: string, difficulty: Difficulty | null) => { rows: ManifestRow[]; matched: number; changed: number }`
  - `shownRows(rows: ManifestRow[], target: string) => ManifestRow[]`: the rows the app shows
  - `publishApproved(...)` also returns `hashes: Record<string, string>`, candidate id to hash
  - `commitContent(deps, species, manifest, subject, beforeWrite?)`, private to `commands.ts`
  - `reportData` takes `heldBack: Set<string>`, the approved candidate ids whose row is hard
  - CLI: `images difficulty <hash> --set hard` and `images difficulty <hash> --clear`

The command follows `images retire`: build the new set in memory, validate, run the append-only check, write, commit. It never removes an object from the bucket. The build's counts then skip a hard row, so a thin channel shows as thin.

- [ ] **Step 1: Write the failing unit tests**

In `pipeline/tests/manifest.test.ts`, replace:

```ts
import { publishApproved, retireRows } from '../lib/manifest.ts';
```

with:

```ts
import { publishApproved, retireRows, setDifficulty } from '../lib/manifest.ts';
```

Append at the end of the file:

```ts
function plainRow(hash: string, target: string): ManifestRow {
  return {
    hash,
    target,
    channel: 'leaf',
    source: 'x',
    author: 'x',
    license: 'x',
    origin: 'x',
    tags: [],
    checked_by: 'x',
    checked_at: '2026-09-25',
    note: '',
  };
}

test('setDifficulty marks every row with the hash and leaves the input alone', () => {
  const hash = 'e'.repeat(64);
  const rows = [plainRow(hash, 'QUGA'), plainRow(hash, 'leaf/simple_lobed'), plainRow('f'.repeat(64), 'QUGA')];
  const result = setDifficulty(rows, hash, 'hard');
  assert.equal(result.matched, 2);
  assert.equal(result.changed, 2);
  assert.equal(result.rows[0].difficulty, 'hard');
  assert.equal(result.rows[1].difficulty, 'hard');
  assert.equal(result.rows[2].difficulty, undefined);
  assert.equal(rows[0].difficulty, undefined);
  assert.equal(setDifficulty(result.rows, hash, 'hard').changed, 0);
});

test('setDifficulty with null takes the field off', () => {
  const hash = 'e'.repeat(64);
  const marked = setDifficulty([plainRow(hash, 'QUGA')], hash, 'hard').rows;
  const result = setDifficulty(marked, hash, null);
  assert.equal(result.changed, 1);
  assert.equal('difficulty' in result.rows[0], false);
  assert.equal(setDifficulty([plainRow(hash, 'QUGA')], 'a'.repeat(64), null).matched, 0);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test pipeline/tests/manifest.test.ts`
Expected: FAIL. The file does not load: `does not provide an export named 'setDifficulty'`.

- [ ] **Step 3: Add the field and `setDifficulty`**

In `pipeline/lib/manifest.ts`, in `ManifestRow`, replace:

```ts
  note: string;
  retired?: boolean;
```

with:

```ts
  note: string;
  /** Set on a photo the app holds back for now. The file stays in the bucket. */
  difficulty?: Difficulty;
  retired?: boolean;
```

Directly after the `ManifestRow` interface, add:

```ts
/** The one difficulty a row can carry. A row with no field is a normal photo. */
export const DIFFICULTIES = ['hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
```

Append at the end of the file:

```ts
/**
 * Pure. Sets or clears `difficulty` on every row that carries the hash, the rows
 * `retireRows` would touch. `null` clears it. `changed` counts the rows whose value
 * moved, so a second identical call reports 0. The object in the bucket is not touched.
 */
export function setDifficulty(
  rows: ManifestRow[],
  hash: string,
  difficulty: Difficulty | null,
): { rows: ManifestRow[]; matched: number; changed: number } {
  let matched = 0;
  let changed = 0;
  const next = rows.map((row) => {
    if (row.hash !== hash) return row;
    matched += 1;
    if ((row.difficulty ?? null) === difficulty) return row;
    changed += 1;
    if (difficulty !== null) return { ...row, difficulty };
    const { difficulty: _cleared, ...rest } = row;
    return rest;
  });
  return { rows: next, matched, changed };
}
```

- [ ] **Step 4: Run the unit tests to see them pass**

Run: `node --test pipeline/tests/manifest.test.ts`
Expected: PASS, 0 fail.

- [ ] **Step 5: Write the failing command tests**

In `pipeline/tests/cli_build.test.ts`, add directly after the test `'images retire of the last live image retires the species too'`:

```ts
test('images difficulty --set hard marks the row and keeps the object', async (t) => {
  const { root, deps, exec, storage, out, err } = setup(t);
  seed(root, {
    manifest: [
      row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' }),
      row({ hash: HASH_D, target: 'QUGA', channel: 'bark' }),
    ],
  });
  writeJson(root, 'content/species.json', { QUGA: record() });
  await storage.put(objectKey(HASH_C), new Uint8Array([1]), 'image/jpeg');

  const code = await runCommand(['images', 'difficulty', HASH_C, '--set', 'hard'], deps);
  assert.equal(code, 0, err.join(' | '));

  const rows = manifestOf(root);
  assert.equal(rows[0].difficulty, 'hard');
  assert.equal(rows[1].difficulty, undefined);
  assert.equal(storage.objects.has(objectKey(HASH_C)), true);
  const commit = called(exec, 'git', 'commit');
  assert.ok(commit !== undefined);
  assert.ok(commit.args.includes(`content: mark image ${HASH_C} hard`));
  assert.ok(out.join('\n').includes(`1 manifest row set to hard for ${HASH_C}`));
});

test('images difficulty --clear takes the field off, and a second clear changes nothing', async (t) => {
  const { root, deps, exec, out, err } = setup(t);
  seed(root, {
    manifest: [
      row({ hash: HASH_C, target: 'QUGA', channel: 'leaf', difficulty: 'hard' }),
      row({ hash: HASH_D, target: 'QUGA', channel: 'bark' }),
    ],
  });
  writeJson(root, 'content/species.json', { QUGA: record() });

  assert.equal(await runCommand(['images', 'difficulty', HASH_C, '--clear'], deps), 0, err.join(' | '));
  assert.equal('difficulty' in manifestOf(root)[0], false);
  assert.ok(out.join('\n').includes(`1 manifest row cleared for ${HASH_C}`));

  assert.equal(await runCommand(['images', 'difficulty', HASH_C, '--clear'], deps), 0);
  assert.ok(out.join('\n').includes(`no manifest row changed for ${HASH_C}`));
  const commits = exec.calls.filter((call) => call.command === 'git' && call.args[0] === 'commit');
  assert.equal(commits.length, 1);
});

test('images difficulty needs one of --set or --clear, takes only hard, and needs a known hash', async (t) => {
  const { root, deps, exec, err } = setup(t);
  seed(root, { manifest: [row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' })] });
  writeJson(root, 'content/species.json', { QUGA: record() });

  assert.equal(await runCommand(['images', 'difficulty', HASH_C], deps), 1);
  assert.equal(
    await runCommand(['images', 'difficulty', HASH_C, '--set', 'hard', '--clear'], deps),
    1,
  );
  assert.equal(await runCommand(['images', 'difficulty', HASH_C, '--set', 'easy'], deps), 1);
  assert.equal(await runCommand(['images', 'difficulty', HASH_A, '--set', 'hard'], deps), 1);

  assert.deepEqual(err, [
    'images difficulty needs one of --set hard or --clear',
    'images difficulty needs one of --set hard or --clear',
    'images difficulty --set takes hard, not easy',
    `no manifest row carries hash ${HASH_A}`,
  ]);
  assert.equal(manifestOf(root)[0].difficulty, undefined);
  assert.equal(called(exec, 'git', 'commit'), undefined);
});

test('images difficulty will not hide the last photo of a species no edge names', async (t) => {
  const { root, deps, exec, storage, err } = setup(t);
  seed(root, { manifest: [row({ hash: HASH_C, target: 'QUGA', channel: 'leaf' })] });
  writeJson(root, 'content/species.json', { QUGA: record() });
  await storage.put(objectKey(HASH_C), new Uint8Array([1]), 'image/jpeg');

  assert.equal(await runCommand(['images', 'difficulty', HASH_C, '--set', 'hard'], deps), 1);

  assert.ok(
    err.includes('error species.json: QUGA has no manifest image and no confusion edge'),
    err.join(' | '),
  );
  assert.equal(manifestOf(root)[0].difficulty, undefined);
  assert.equal(storage.objects.has(objectKey(HASH_C)), true);
  assert.equal(called(exec, 'git', 'commit'), undefined);
});

test('a build keeps the difficulty on a published row', async (t) => {
  const { root, deps, err } = setup(t);
  seed(root, {
    manifest: [row({ hash: HASH_C, target: 'QUGA', channel: 'leaf', difficulty: 'hard' })],
  });

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const kept = manifestOf(root).find((one) => one.hash === HASH_C);
  assert.equal(kept?.difficulty, 'hard');
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `node --test pipeline/tests/cli_build.test.ts`
Expected: the four `images difficulty` tests FAIL: `runCommand` prints the usage and returns 1, so the printed lines do not match. The build test can already pass: `publishApproved` copies each old row as it is.

- [ ] **Step 7: Make `--clear` a flag with no value**

In `pipeline/lib/run.ts`, replace:

```ts
export const BOOLEAN_FLAGS: string[] = ['refresh', 'manifest'];
```

with:

```ts
export const BOOLEAN_FLAGS: string[] = ['refresh', 'manifest', 'clear'];
```

- [ ] **Step 8: Split the shared commit path out of `commitRetire`**

In `pipeline/lib/commands.ts`, replace the whole function `commitRetire` and the comment block above it with:

```ts
/**
 * Every command that edits content/ by hand ends the same way: validate, check the ids,
 * run `beforeWrite`, write the two files, commit. A retire removes its objects in
 * `beforeWrite`. A difficulty change removes nothing: the file stays in the bucket.
 */
async function commitContent(
  deps: CliDeps,
  species: Record<string, SpeciesRecord>,
  manifest: ManifestRow[],
  subject: string,
  beforeWrite: () => Promise<void> = async () => {},
): Promise<boolean> {
  // An edit runs on a checkout that has main. A checkout without it writes nothing.
  if (!baseResolved(deps, DEFAULT_BASE)) return false;
  const raw = rawOf(deps.root, species, manifest);
  if (validated(deps, raw) === null) return false;
  const previous = readPublished(gitShowOf(deps, DEFAULT_BASE));
  const idErrors = appendOnlyErrors(previous, contentSetOf(raw));
  if (idErrors.length > 0) {
    for (const message of idErrors) console.error(message);
    return false;
  }
  await beforeWrite();
  writeJson(contentFile(deps.root, 'species.json'), raw.species);
  writeJson(contentFile(deps.root, MANIFEST_NAME), raw.manifest);
  gitCommitAll(deps.exec, `content: ${subject}`);
  return true;
}

/** Both retire commands: the shared commit path, plus the objects no live row carries. */
async function commitRetire(
  deps: CliDeps,
  species: Record<string, SpeciesRecord>,
  before: ManifestRow[],
  after: ManifestRow[],
  subject: string,
): Promise<boolean> {
  return commitContent(deps, species, after, subject, async () => {
    for (const key of deadObjectKeys(before, after)) await deps.storage.remove(key);
  });
}
```

Run: `node --test pipeline/tests/cli_build.test.ts`
Expected: every `images retire` and `species retire` test still passes. The three new `images difficulty` tests still fail.

- [ ] **Step 9: Write the handler**

In `pipeline/lib/commands.ts`, replace:

```ts
import { publishApproved, retireRows, type ManifestRow } from './manifest.ts';
```

with:

```ts
import {
  DIFFICULTIES,
  publishApproved,
  retireRows,
  setDifficulty,
  type Difficulty,
  type ManifestRow,
} from './manifest.ts';
```

Directly after the function `imagesRetire`, add:

```ts
async function imagesDifficulty(rest: string[], deps: CliDeps): Promise<number> {
  const hash = positional(rest, 'images difficulty <hash> --set hard | --clear');
  const flags = parseFlags(rest.slice(1));
  const set = flagValue(flags, 'set');
  const clear = flags.clear === 'true';
  const allowed = DIFFICULTIES.join('|');
  // Exactly one of the two flags: neither, or both, is a usage error.
  if ((set === null) === !clear) {
    console.error(`images difficulty needs one of --set ${allowed} or --clear`);
    return 1;
  }
  if (set !== null && !(DIFFICULTIES as readonly string[]).includes(set)) {
    console.error(`images difficulty --set takes ${allowed}, not ${set}`);
    return 1;
  }
  const difficulty = set === null ? null : (set as Difficulty);

  const before = readManifest(deps.root);
  const result = setDifficulty(before, hash, difficulty);
  if (result.matched === 0) {
    console.error(`no manifest row carries hash ${hash}`);
    return 1;
  }
  if (result.changed === 0) {
    console.log(`no manifest row changed for ${hash}`);
    return 0;
  }
  const subject = difficulty === null
    ? `clear difficulty on image ${hash}`
    : `mark image ${hash} ${difficulty}`;
  if (!(await commitContent(deps, readSpecies(deps.root), result.rows, subject))) return 1;
  const rows = `${result.changed} manifest row${result.changed === 1 ? '' : 's'}`;
  const done = difficulty === null ? 'cleared' : `set to ${difficulty}`;
  console.log(`${rows} ${done} for ${hash}`);
  return 0;
}
```

In `COMMANDS`, replace:

```ts
  'images retire': imagesRetire,
```

with:

```ts
  'images retire': imagesRetire,
  'images difficulty': imagesDifficulty,
```

In `USAGE`, replace the two lines:

```
  images retire <hash> --reason "<text>"
  data sections
```

with:

```
  images retire <hash> --reason "<text>"
  images difficulty <hash> --set hard
  images difficulty <hash> --clear
  data sections
```

- [ ] **Step 10: Run the pipeline tests**

Run: `npm run test:pipeline`
Expected: 7 more tests than before this task (355 from a 348 baseline), 0 fail.

- [ ] **Step 11: Write the failing tests for the counts**

A hard photo is approved, but the app does not show it. So the pipeline's counts must skip it, or the next content run cannot see which channels need photos.

In `pipeline/tests/manifest.test.ts`, replace:

```ts
import { publishApproved, retireRows, setDifficulty } from '../lib/manifest.ts';
```

with:

```ts
import { publishApproved, retireRows, setDifficulty, shownRows } from '../lib/manifest.ts';
```

Append at the end of the file:

```ts
test('shownRows keeps the rows of one target the app shows', () => {
  const rows = [
    plainRow('a'.repeat(64), 'QUGA'),
    { ...plainRow('b'.repeat(64), 'QUGA'), difficulty: 'hard' as const },
    { ...plainRow('c'.repeat(64), 'QUGA'), retired: true },
    plainRow('d'.repeat(64), 'QURU'),
  ];
  assert.deepEqual(shownRows(rows, 'QUGA').map((row) => row.hash), ['a'.repeat(64)]);
  assert.deepEqual(shownRows(rows, 'QUAL'), []);
});
```

In `pipeline/tests/cli_build.test.ts`, add directly after the test `'a build keeps the difficulty on a published row'`:

```ts
test('a build leaves a hard photo out of the counts and the gaps', async (t) => {
  const { root, deps, err } = setup(t);
  seed(root);
  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));
  const rows = manifestOf(root).map((one) =>
    one.channel === 'leaf' ? { ...one, difficulty: 'hard' as const } : one,
  );
  writeJson(root, 'content/images/manifest.json', rows);

  assert.equal(await runCommand(['build', 'demo'], deps), 0, err.join(' | '));

  const data = buildOf(root);
  assert.deepEqual(data.species[0], {
    symbol: 'QUGA', status: 'included', reason: null, counts: { bark: 1 },
  });
  assert.deepEqual(data.gaps, [
    { symbol: 'QUGA', channel: 'leaf', count: 0 },
    { symbol: 'QUGA', channel: 'bark', count: 1 },
  ]);
  assert.equal(manifestOf(root).find((one) => one.channel === 'leaf')?.difficulty, 'hard');
});
```

Run: `node --test pipeline/tests/manifest.test.ts pipeline/tests/cli_build.test.ts`
Expected: FAIL. `manifest.test.ts` does not load: `does not provide an export named 'shownRows'`. In `cli_build.test.ts`, the new build test fails: `counts` is `{ leaf: 1, bark: 1 }`.

- [ ] **Step 12: Write `shownRows`, and let the publish step report each hash**

In `pipeline/lib/manifest.ts`, append:

```ts
/** Pure. The rows of one target the app shows: not retired and not hard. */
export function shownRows(rows: ManifestRow[], target: string): ManifestRow[] {
  return rows.filter(
    (row) => row.target === target && row.retired !== true && row.difficulty !== 'hard',
  );
}
```

In `publishApproved`, replace:

```ts
}): Promise<{ rows: ManifestRow[]; uploaded: string[]; skipped: string[] }> {
```

with:

```ts
}): Promise<{
  rows: ManifestRow[];
  uploaded: string[];
  skipped: string[];
  /** Candidate id to the hash of its resized bytes, for every approved candidate. */
  hashes: Record<string, string>;
}> {
```

Replace:

```ts
  const uploaded: string[] = [];
  const skipped: string[] = [];
```

with:

```ts
  const uploaded: string[] = [];
  const skipped: string[] = [];
  const hashes: Record<string, string> = {};
```

Replace:

```ts
    const hash = sha256Hex(resized);
    const key = objectKey(hash);
```

with:

```ts
    const hash = sha256Hex(resized);
    hashes[candidate.id] = hash;
    const key = objectKey(hash);
```

Replace:

```ts
  return { rows, uploaded, skipped };
```

with:

```ts
  return { rows, uploaded, skipped, hashes };
```

- [ ] **Step 13: Skip hard rows in the build's counts**

In `pipeline/lib/commands.ts`, replace the import that Step 9 wrote:

```ts
import {
  DIFFICULTIES,
  publishApproved,
  retireRows,
  setDifficulty,
  type Difficulty,
  type ManifestRow,
} from './manifest.ts';
```

with:

```ts
import {
  DIFFICULTIES,
  publishApproved,
  retireRows,
  setDifficulty,
  shownRows,
  type Difficulty,
  type ManifestRow,
} from './manifest.ts';
```

In `buildContent`, replace:

```ts
  const manifest = published.rows;
```

with:

```ts
  const manifest = published.rows;
  // An approved photo whose row is hard is held back from the app. The report's counts
  // and gaps leave it out, so the next run sees the channel as thin.
  const hardHashes = new Set(
    manifest.filter((one) => one.difficulty === 'hard').map((one) => one.hash),
  );
  const heldBack = new Set(
    Object.entries(published.hashes)
      .filter(([, hash]) => hardHashes.has(hash))
      .map(([id]) => id),
  );
```

Replace:

```ts
    const live = manifest.filter(
      (one) => one.target === symbol && one.retired !== true,
    ).length;
```

with:

```ts
    // The rows the app shows. A retired row and a hard row do not count.
    const live = shownRows(manifest, symbol).length;
```

Replace:

```ts
    loaded: loaded.content,
    warnings: result.warnings,
  });
```

with:

```ts
    loaded: loaded.content,
    warnings: result.warnings,
    heldBack,
  });
```

In `reportData`, replace:

```ts
  loaded: LoadedContent;
  warnings: ValidationMessage[];
}): BuildReport {
  const { name, scope, statuses, candidates, verdicts, raw, loaded, warnings } = input;
  const counts = countByTargetChannel(verdicts, candidates);
```

with:

```ts
  loaded: LoadedContent;
  warnings: ValidationMessage[];
  /** Approved candidates whose row is hard. They do not count toward a channel. */
  heldBack: Set<string>;
}): BuildReport {
  const { name, scope, statuses, candidates, verdicts, raw, loaded, warnings } = input;
  const counts = countByTargetChannel(
    verdicts,
    candidates.filter((one) => !input.heldBack.has(one.id)),
  );
```

`countByTargetChannel` skips a verdict whose candidate it cannot find, so a held-back photo drops out of the counts and the gaps. The candidate counts by source still count every candidate. `markRetiredSpecies` does not change: a species with only hard rows stays live.

- [ ] **Step 14: Run the pipeline tests**

Run: `npm run test:pipeline`
Expected: 9 more tests than before this task (357 from a 348 baseline), 0 fail.

- [ ] **Step 15: Add the command to the content-run skill**

In `.claude/skills/content-run/SKILL.md`, directly after the `images retire` bullet (it ends with "Run it only when the owner asks."), add:

```markdown
- `node pipeline/cli.ts images difficulty <hash> --set hard` holds one image back from
  the app. `--clear` brings it back. The file stays in the bucket. It validates, runs the
  append-only check, writes `content/`, and commits. Two rows that share the hash both
  change. A hard photo does not count toward its channel in the build report, so the
  thin-channel hunt in Step 7 sees the gap. Run it only when the owner asks.
```

- [ ] **Step 16: Note the command in the pipeline spec**

In `docs/superpowers/specs/2026-09-22-content-pipeline-design.md`, directly after the paragraph that ends "A takedown removes the photo everywhere it was used.", add:

```markdown
### Marking an image hard

Added 2026-09-25. `cli images difficulty <hash> --set hard` sets `difficulty: "hard"` on
every manifest row that carries the hash. `--clear` takes the field off. The app shows no
photo that carries the tag, for now. The command does not touch the bucket, so a clear
brings the photo back at once. It validates, runs the append-only check, and commits, the
same as a retire. The validator reads a hard row as no image, so the command stops when
the tag would leave a live species with no photo and no confusion edge. A build keeps the
field on every published row. `hard` is the only value.

A hard row does not count as a photo in the build: the `no_photos` status counts only the
rows the app shows, and the report's per-channel counts and gap list leave out an
approved photo whose row is hard. A species with only hard rows stays live.
```

In the test list of section 11, replace:

```markdown
- `retire`: `cli images retire` deletes the object, keeps the manifest row, and writes
  the reason and the date; two rows that share a hash both retire.
```

with:

```markdown
- `retire`: `cli images retire` deletes the object, keeps the manifest row, and writes
  the reason and the date; two rows that share a hash both retire.
- `difficulty`: `cli images difficulty` sets and clears the tag on every row with the
  hash, keeps the object, takes only `hard`, and refuses to hide the last photo of a
  species no edge names; a build keeps the field and leaves a hard photo out of the
  counts and the gaps.
```

- [ ] **Step 17: Commit**

```bash
git add pipeline/lib/manifest.ts pipeline/lib/run.ts pipeline/lib/commands.ts pipeline/tests/manifest.test.ts pipeline/tests/cli_build.test.ts .claude/skills/content-run/SKILL.md docs/superpowers/specs/2026-09-22-content-pipeline-design.md
git commit -m "feat(pipeline): images difficulty sets or clears the hard tag and keeps the file" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Full verification against the real content

**Files:**
- No file changes. If a step fails, fix the cause in the task that owns the file, then run this task again.

**Interfaces:**
- Consumes: every task above.
- Produces: the pass counts, the audit result, and the shot count for the end report.

- [ ] **Step 1: Run the app tests**

Run: `npm test`
Expected: 250 pass, 0 fail. That is 237, less 2 (Task 2), plus 6 (Task 4), 2 (Task 6), 1 (Task 7), 2 (Task 8), 1 (Task 9), and 3 (Task 10).

- [ ] **Step 2: Run the pipeline tests**

Run: `npm run test:pipeline`
Expected: 357 pass, 0 fail. That is 348 plus 9 (Task 11: 3 in `manifest.test.ts`, 6 in `cli_build.test.ts`).

- [ ] **Step 3: Validate both content sets**

Run: `npm run validate && npm run validate:dev`
Expected: both exit 0 with no `error` line.

- [ ] **Step 4: Start the server**

If the server from Task 0 is not running, start it again the way Task 0 Step 2 says. Check it with Task 0 Step 3.

- [ ] **Step 5: Run the audit on the real content**

Run: `DENDRO_BASE=http://localhost:8000/ python scripts/audit.py`
Expected: the last line is `0 screen states with findings.` and the exit code is 0.

- [ ] **Step 6: Run the screenshots on the real content**

Run: `DENDRO_BASE=http://localhost:8000/ python scripts/shots.py out/shots`
Expected: the last line is `0 shots failed.`

Run: `ls out/shots/*.png | wc -l`
Expected: `66`.

- [ ] **Step 7: Run the audit on the dev content**

Run: `python scripts/audit.py`
Expected: `0 screen states with findings.` This checks that `?content=dev` still works with no network.

- [ ] **Step 8: Stop the server**

Stop the server: `preview_stop` with its server id, or stop the background Bash task.

- [ ] **Step 9: Report**

Report the two test counts, the audit line, and the shot count. Name these shots for the owner to judge: `session-360-100.png`, `session-390-130.png`, `session-inv-390-100.png`, `reveal-390-100.png`, `species-390-100.png`, `home-390-100.png`.
