# Dendro app visual design

Date: 2026-09-24. Status: draft for review. Branch: `app-visual`.

This spec sets the look of the Dendro web app and changes the screen list in
section 8 of `2026-09-21-tree-id-app-design.md`. The reference is the mockup at
`docs/design/2026-09-24-specimen-plate/mockup-final.html` with its screenshots
beside it. Where this spec and the mockup differ, this spec wins. Where this
spec is silent, the mockup wins.

## 1. Goal

The app must work on a phone outside and must look good enough that a person
who sees it says so. The owner's words: "I want people to see it and go, wow,
this is beautiful."

The chosen look is the specimen plate. Photographs print straight into cream
paper with no frame. Serif type carries the personality. Pressed-leaf glyphs
carry every score. The owner picked it over five other directions and two
rounds of alternatives.

## 2. Tokens

Colors. Do not add a hue.

| Name | Value | Use |
|---|---|---|
| Paper | `#F1ECDF` | page background |
| Ink | `#22231E` | text |
| Moss | `#3A5A3C` | primary: filled buttons, active marks, waterlines |
| Bark | `#5C4634` | secondary marks, progress ticks, captions |
| Lichen | `#C9D2B4` | soft fills, answer buttons, level 1 |
| Sap | `#B8892E` | streaks and warnings only |
| Level 0 to 4 | `#E6DFCE` `#C9D2B4` `#9DB595` `#6B8F6A` `#3A5A3C` | mastery ramp |

Derived tints are allowed: a darker paper for mounted rows, a translucent ink
for overlays.

Type. Two families from Google Fonts, no third, no monospace.

- Fraunces, variable, for display and headings. Use the optical size axis.
- Literata, variable, for text. Body 16 to 17 px at the standard step, leading
  1.5 or more.

Sizes are in rem so the app follows the phone's text setting. Display sizes
scale at half rate: `calc(Npx / 2 + Nrem / 32)` or an equivalent, so a 44 px
headline grows about 15 percent when the root grows 30 percent. Photos, leaf
glyphs, level squares, and the 58 px depth column on the progress page stay in
px.

Level names, level 0 to 4: new, seen, familiar, strong, expert.

## 3. Principles

1. One bold move per screen. On the session card it is the photograph. On
   home it is the next unit. On progress it is the column of rungs.
2. Structure encodes information. A fill, a size, or a mark exists because it
   tells the user a level, a due date, an open or closed unit, or a right or
   wrong answer.
3. Type carries personality. A real scale, tight leading on display sizes.
4. The mastery picture is pressed leaves, one glyph per card, filled by level.
   Level squares are the rollup on unit rows. No bars, no percentages, except
   the moss waterline under a card band on the progress page.
5. Motion answers a tap. The reveal is the one designed motion moment. All
   motion sits inside `prefers-reduced-motion: no-preference`.
6. Photographs print into the paper. A bright-ground scan uses
   `mix-blend-mode: multiply` so its white becomes paper. A photograph with its
   own ground dissolves on all four sides through a mask and never blends.
   Nothing ends on a straight edge.

Tells to avoid, from the design brief: all-caps eyebrow labels, monospace
labels, middle-dot meta strings, arrows in link text, numbered markers on
things that are not a sequence, terracotta accents, identical rounded cards
with one grey shadow, hairline newspaper columns, one accented word in a
headline, page-load animations.

## 4. Screens

Routes stay in the hash router. Every screen except session and reveal ends
with a running foot: Home, Lessons, Progress, three words in Fraunces, a
hairline above, a 3 px moss rule under the current word. Session and reveal
carry no nav; a running session is the one modal screen.

### 4.1 Home (`#/`)

Replaces the old home. Contents, in order:

1. The app name and a one-line subtitle.
2. One sentence of state: cards due today, split by channel.
3. The recommended next unit: name, unit number, new-card count, one line
   about it, a small print of one of its species, and a full-width Start.
4. Two doors, Lessons and Progress, each with one line of description and a
   live mark inside it: unit squares in the Lessons door, three rungs with
   waterlines in the Progress door.
5. Links: placement test, settings.

The unit list, the channel buttons, and the level-0 counts move to Lessons.

### 4.2 Session (`#/session`) and reveal

As specified before, styled as the mockup. Changes:

- The photograph is framed to the specimen's own bounding box and prints
  into the paper edge to edge. The caption reads "Pressed specimen,
  undetermined." plus the author, and never names the tree.
- Progress is one tick per card, filled for done, moss for the current one.
- Leaving. The header's left slot is a Leave link, 44 px tall, present on the
  question and the reveal. Every answer is graded and stored the moment it is
  given, so leaving discards nothing; unanswered cards stay due. Tapping Leave
  with at least one card answered shows the session summary for the cards
  answered so far, with two buttons, Resume and Home. Tapping it with no card
  answered goes home at once. The browser's back button does the same as
  Leave. The unit name and the card count move to the header's right slot.
- Answer buttons share one width, common name at the left, scientific name
  ranged right, and wrap to two lines when the root size is large.
- On reveal the correct name is the largest thing on the screen. The user's
  wrong pick and the correct answer sit side by side as two prints at one
  scale, labelled "correct" in moss and "your pick" struck through in bark.
  Under them, the one-line difference, the level change with squares, and
  Next.

### 4.3 Lessons (`#/lessons`)

New. Opens on what is next: the recommended unit with its new cards as
outline leaves, its level squares, and Start. Then one block per channel:
channel name, due count, units open of total, and one square per unit in three
rows, one row per depth. A filled square is a unit you can start now, an
outline waits on its parent, a moss tick marks what is next. Each block links
to the channel's lessons page. The placement test link sits at the foot.

### 4.4 Lessons, one channel (`#/lessons/<channel>`)

New. A trail at the top (Lessons, then the channel). Units on one stem with
branch ticks, indented by depth. Each row: the unit's leaf glyph filled by its
rollup level, name, meta line, five level squares, and an outlined Start.
The next-up unit's Start is filled moss. A closed unit loses its fill and its
Start and says what opens it.

Folding. Every row that has child units carries a chevron button at its
right, at least 44 px square, `aria-expanded`, that folds or unfolds its
children in place. It turns 90 degrees when open. A folded row's meta line
states what is inside, for example "4 units inside, 1 next up". Default: the
level-1 unit and the level-2 units show; level-3 units are folded, except the
branch that holds the next-up unit, which starts open. The app stores which
branches the user left open with the other settings.

### 4.5 Progress (`#/progress`)

Replaces the unit tiles and the species-by-channel table. Contents:

1. A heading that states the finding in words and one sentence of counts.
2. The legend: one leaf at each of the five levels.
3. One block per channel: name, due count, one sentence of finding, then three
   rungs in one column at the left edge. Shapes prints one sheet, genera two
   with the parent behind at the corner, species three. Beside each rung: the
   rung name, its level word sized by level, and its count, for example
   "4 of 8". Under each rung, its card band: one leaf per card, filled by
   level, grouped by parent for species. Under the band, a moss waterline cut
   to the share at familiar or better, all three measured against one length.
   The species band stays on the overview.
4. Under each block, a link to the channel's leading shape.

The rungs read the three card kinds the app already scores: concept cards,
group cards, species cards. No new state.

### 4.6 Progress, one shape (`#/progress/<channel>/<concept>`)

New. Trail at the top. The shape's name, the strip of all shapes in the
channel with this one marked, the shape card's own level as a mounted panel,
then each genus under it as a heading with its level word, and each species as
an index line with its leaf glyph, name, and level word. Species lines are
links to the species page.

### 4.7 Species (`#/species/<symbol>`)

As specified before, styled as a specimen sheet: name, binomial, one line of
status, the leaf plate, two display numerals for height and elevation, one
paragraph for range and habitat, a short fact list, the three channel cards
with level squares and next due, the bark plate, the varieties section.
Missing plates and empty varieties read as facts, not errors.

### 4.8 Settings (`#/settings`)

As specified before, plus Text size: five steps named smaller, small,
standard, large, largest, a radio group with 44 px targets, each option shown
as a sample word at that step's size. The sample sizes are in px so they do
not move with the setting. Picking a step sets the root font size and stores
the choice with the other settings. The default step follows the phone.

## 5. Quality floor

Every screen must pass these before it ships. Measure them; do not assume.

- Every link, button, label, and control is at least 44 px in both directions
  at 360 px and 390 px wide, at root sizes 80, 100, and 130 percent.
- No horizontal page scroll at 360 px at any of those sizes.
- Focus-visible outlines on every control type.
- Text contrast 4.5 to 1 or better. Ink on paper is 13.4 to 1.
- All motion inside `prefers-reduced-motion: no-preference`.

## 6. Implementation notes

- No framework, no build step, as before. One stylesheet, `app/style.css`,
  rewritten from the mockup's `<style>` block. Tokens as custom properties on
  `:root`.
- The leaf glyphs are one inline SVG sprite with `<symbol>` elements (oak,
  maple, sycamore, needle, toothed, bark plates, fruit shapes) and `<use>`
  references. Level is a class on the `<svg>`.
- Photo treatment is two classes: `.plate.print` for bright-ground scans
  (multiply), `.plate.field` for photographs with their own ground (mask, no
  blend). Which one a photo gets comes from a flag in the manifest or a
  brightness check at build time; decide in the plan.
- Text size stores one key with the other settings and sets
  `document.documentElement.style.fontSize` on load.
- Fold state stores a list of open unit keys.
- Screenshot checks use Playwright at 360 and 390 px, root 80, 100, and 130
  percent, one shot per screen, and a script that reports overflow and tap
  target sizes. The scripts from the design round
  (`shot.py`, `shotroot.py`, `overflow.py`) are the starting point.

## 7. Out of scope

- Dark mode.
- Desktop layout beyond a centered column at the phone width.
- A sync server or sign-in.
- New content or new card kinds.

## 8. Decisions log

- 2026-09-24. Six directions shown; the owner chose the field-guide palette
  with app-like structure. A 20-agent panel produced the specimen plate; the
  owner approved it.
- 2026-09-24. Answer buttons equal width, at the owner's request.
- 2026-09-24. Home simplified; lessons and progress become their own pages
  with three depths, matching the concept, group, and species card kinds.
  A 16-agent panel chose pages over one sheet or in-place expansion.
- 2026-09-24. Hero photos dropped from progress and the channel lessons
  page; intro paragraphs cut to one sentence; species leaves kept on the
  progress overview.
- 2026-09-24. Chevron folding on the channel lessons page. Text size setting
  with five steps, rem-based scale.
