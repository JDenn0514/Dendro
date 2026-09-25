# Dendro visual design brief

## Product

Dendro is a spaced-repetition quiz that teaches people to identify trees by leaf, bark, and fruit. Content starts with the Colorado region (oaks, maples, sycamores). A user opens it on a phone, often outside, and runs a short session: look at a photo, name the tree, see the reveal. The web app is plain HTML, CSS, and ES modules, no framework, no build step. The mockups you make here are design targets for that CSS.

The client's own words: "I want this website to obviously be functional, but also look awesome. I want people to see it and go 'Wow, this is beautiful'."

## Direction the client chose

Field guide. Cream paper, deep greens and browns, serif type. The client saw six mockups and leaned toward a blend: the field-guide palette and fonts, with clearer structure and bigger tap targets underneath. The client said the blend still landed at "nice", not "wow". Your job is the wow, with the palette and fonts held fixed.

## Tokens (fixed)

Color:

- Paper `#F1ECDF` (page background)
- Ink `#22231E` (text)
- Moss `#3A5A3C` (primary green: buttons, active marks)
- Bark `#5C4634` (dark brown: progress, secondary marks, captions)
- Lichen `#C9D2B4` (soft green tint: fills, hover, level 1)
- Sap `#B8892E` (ochre: streaks and warnings only, use rarely)
- Mastery ramp, level 0 to 4: `#E6DFCE`, `#C9D2B4`, `#9DB595`, `#6B8F6A`, `#3A5A3C`

You may add one or two derived tints (a darker paper for cards, a translucent ink for overlays). Do not add a new hue.

Type:

- Fraunces (Google Fonts, variable: `opsz`, `wght`, `SOFT`, `WONK`; italic available) for display and headings. Use the optical size axis: large sizes get the high-contrast cut.
- Literata (Google Fonts, variable: `opsz`, `wght`; italic available) for text.
- No third family. No monospace.

Load with:
`<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..700&display=swap" rel="stylesheet">`

## Principles

1. One bold move per screen. On the session card that move is the photograph. Everything else stays quiet.
2. Structure encodes information. A border, a fill, a size, or a mark exists because it tells the user a level, a due date, an open or closed unit, or a correct or wrong answer. Nothing is decoration.
3. Type carries personality. Set a real scale. Large Fraunces with tight leading, Literata text at 16 to 17px with generous leading.
4. The mastery grid is a picture, not a spreadsheet.
5. The reveal is the one designed motion moment. Motion answers the user's tap. No page-load animations, no hover effects on every card. Respect `prefers-reduced-motion`.
6. Quality floor: 44px minimum tap targets, visible keyboard focus, contrast at least 4.5:1 for text, works at 360px width.

## Tells to avoid

These read as generated templates. Do not use them:

- ALL-CAPS tracked-out eyebrow labels above headings.
- Monospace for small labels or numbers.
- Meta strings joined with middle dots ("Leaf · 4 of 12 · Photo").
- Labels shaped "WORD — fragment" with a spaced em dash.
- Arrows appended to link or button text.
- Numbered markers (01, 02, 03) where the content is not a sequence. Units are a sequence; answer choices are not.
- Terracotta or clay accent colors.
- Identical rounded cards with the same soft grey shadow on everything.
- Hairline-rule newspaper columns with zero radius everywhere.
- Accenting one word of a headline in italic or a second color.
- Page-load fade-and-slide entrances on every section.

## Screens to mock (all four, phone width 390px)

Content for each screen is fixed by the product spec. Use this real content.

### Session, question state (`id="session"`)

- Progress: card 4 of 12.
- Format: photo to name, channel leaf.
- Prompt: name this tree.
- Photo: `/files/quru-leaf.jpg` (northern red oak leaf and acorns, black and white specimen photo, W.D. Brush, USDA PLANTS, public domain).
- Four answer choices, common name with scientific name: Northern red oak (Quercus rubra), Black oak (Quercus velutina), Shumard's oak (Quercus shumardii), Pin oak (Quercus palustris).
- A checkbox "I guessed".

### Session, reveal state (`id="reveal"`)

- The user tapped Black oak. Wrong. Correct answer is Northern red oak.
- Shows: correct answer marked, the user's wrong pick marked, the correct tree's common and scientific name, one line of what separates them ("Red oak leaves have 7 to 11 bristle-tipped lobes with shallow sinuses; black oak lobes cut deeper and the leaf is glossier."), the new level for this card (level 1, down from 2), and a Next button.

### Home (`id="home"`)

- Channels with due counts: All 14, Leaf 9, Bark 3, Fruit 2. All is selected.
- Recommended next unit: Red oaks, unit 5, 6 new cards, with a Start button.
- Unit list with level-0 counts and open or closed state: Leaf types (complete, open), Simple lobed leaves (2 new, open), White oaks (4 new, open), Red oaks (6 new, open), Bark types (3 new, closed), Maples (8 new, closed). Each has its own Start.
- A placement test link.

### Species (`id="species"`)

Northern red oak, Quercus rubra, PLANTS symbol QURU, native.

- Facts: range: eastern North America, planted in Colorado Front Range towns; states: 30 native states; planted states: CO, UT; elevation 0 to 5,500 ft; height 60 to 90 ft; habitat: mesic upland forests, well-drained slopes; Audubon name: Northern Red Oak; section: Lobatae (red oaks); level-1 categories: simple, lobed, alternate.
- Photos by channel with attribution: leaf `/files/quru-leaf.jpg` (W.D. Brush, public domain), bark `/files/quru-bark.jpg` (W.R. Mattoon, public domain). Fruit: no photo yet.
- Per channel: level name and next due. Leaf: level 4 (expert), due in 21 days. Bark: level 2 (familiar), due tomorrow. Fruit: level 0 (new), not started.
- Varieties: none for this species. Show the section empty in a way that reads as a fact, not an error.

Other photos available: `/files/acgl-leaf.jpg` (Rocky Mountain maple leaves, color, Alex Abair, CC BY 4.0), `/files/quve-leaf.jpg` (black oak leaf, black and white, W.D. Brush, public domain).

## Deliverable format

One standalone HTML file (starts with `<!DOCTYPE html>`), all CSS inline in a `<style>` block, fonts from Google Fonts, no JavaScript beyond what a static mockup needs. Four `<section class="screen" id="...">` blocks, one per screen. Include this rule so the screenshot helper can show one screen at a time:

```css
.screen { display: none; }
.screen:target { display: block; }
body:not(:has(.screen:target)) #session { display: block; }
```

Each screen is a phone viewport: 390px wide, minimum 844px tall, and may scroll taller. Set `body { margin: 0; width: 390px; }`. Use real text, no lorem ipsum.

Screenshot each screen with the helper in this folder:

```
python shot.py <your-file>.html <out>.png 390 844 1 session
python shot.py <your-file>.html <out>.png 390 844 1 reveal
python shot.py <your-file>.html <out>.png 390 844 1 home
python shot.py <your-file>.html <out>.png 390 844 1 species
```

Then look at every screenshot with the Read tool before you finish. Fix what you see. A picture is worth a thousand tokens.
