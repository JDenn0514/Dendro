# Dendro round 2: home, progress, lessons

Read `brief.md` in this folder first. Its tokens, principles, tells list, quality floor, and deliverable format all still apply. This file adds the round-2 task.

## Where we are

The client approved the "specimen plate" mockup in `final.html` (screens: session, reveal, home, species). Their words: "This looks beautiful!" Your work must look like it came from the same hand. Reuse its CSS, its type scale, its spacing, its pressed-leaf glyphs (the inline SVG leaves with the five-step mastery ramp), its level squares, and its unit rows. Open `final.html` and read its `<style>` before you write anything. Copy what you need; do not invent a second system.

Two changes the client asked for:

1. The answer buttons on the session screen must share one width. Not cut to the length of each name.
2. Home is too busy. The client wants three pages in place of the old home: a simple home, a progress page, and a lessons page.

## The mastery model (this is the point of the round)

The client asked: "How do I know if I've mastered the genus but still don't know the species? Maybe I've mastered the shape but still struggle with specific genera. How do I see that difference?"

The app already scores those as separate cards. Every card has its own level 0 to 4 (new, seen, familiar, strong, expert). Three card kinds matter here, per channel (leaf, bark, fruit):

- Shape cards, one per leaf type, bark type, or fruit type. "What leaf type is this?"
- Genus cards, one per genus within a shape. "Which genus?"
- Species cards, one per species. "Which species?"

Units follow the same three depths: a level-1 unit quizzes shape cards, a level-2 unit quizzes the genus cards within one shape, a level-3 unit quizzes species cards within one group. A unit opens when 80 percent of its parent unit's cards reach level 2. Any unit can still be started early.

So the progress page and the lessons page share one tree: channel, then shape, then genus, then species. Progress shows the score at each node. Lessons shows the unit at each node with a Start button. The pages must make the client's case visible at a glance: a dark row of shapes above a pale row of genera means "I learned the shapes and stalled on the genera."

## Real content for the screens

Use these names and states. Levels are 0 to 4.

Leaf channel, shape cards: Needles 3, Scale-like 2, Simple untoothed 1, Simple toothed 2, Simple lobed 4, Pinnately compound 1, Palmately compound 0, Fan or strap 0.

Leaf channel, genus cards under Simple lobed: Maples (Acer) 3, Oaks (Quercus) 4, Sycamores (Platanus) 1.

Leaf channel, species cards:
- Oaks, red oak section: Texas red oak 0, blackjack oak 1, pin oak 2, northern red oak 4, Shumard's oak 1, black oak 2.
- Oaks, white oak section: white oak 3, Gambel oak 4, Havard oak 0, bur oak 2, post oak 1.
- Maples: Rocky Mountain maple 2, bigtooth maple 2, black maple 0, Norway maple 1, silver maple 1, sugar maple 3.
- Sycamores: American sycamore 1, Arizona sycamore 0.

Bark channel, shape cards: Smooth 2, Furrowed 3, Plated 1, Shaggy 1, Papery 2, Warty 0. Genus cards under Furrowed: Maples 1, Oaks 2. Under Plated: Oaks 1. Under Papery: Sycamores 0. Under Smooth: Maples 1. Under Shaggy: Maples 0. Bark species cards: northern red oak 2, white oak 1, Gambel oak 2, bur oak 1, sugar maple 1, Norway maple 0, Rocky Mountain maple 0, American sycamore 0. Others not started.

Fruit channel, shape cards: Samara 2, Acorn 3, Nut 0, Pod 0, Berry 1, Capsule 0, Cone 1, Ball 1. Genus cards: under Acorn, Oaks 2; under Samara, Maples 1; under Ball, Sycamores 0. Fruit species cards: northern red oak 1, Gambel oak 2, bur oak 1, sugar maple 1, silver maple 0. Others not started.

Due today: 14 cards in all. Leaf 9, bark 3, fruit 2.

Units (lessons tree). Level-0 count means cards not yet seen.

- Leaf
  - Leaf types (level 1): complete, open.
    - Simple lobed leaves (level 2): 2 new cards, open.
      - White oaks (level 3): 4 new cards, open.
      - Red oaks (level 3): 6 new cards, open. This is what is next.
      - Maples (level 3): 6 new cards, closed. Opens when Simple lobed leaves reaches 80 percent.
      - Sycamores (level 3): 2 new cards, closed. Same condition.
    - Simple toothed leaves (level 2): 5 new cards, closed. Opens when Leaf types reaches 80 percent. (Leaf types is complete, so in truth this is open. Treat it as open, 5 new.)
    - Needles (level 2): 4 new cards, open.
- Bark
  - Bark types (level 1): 3 new cards, open.
    - Furrowed bark (level 2): 4 new cards, closed. Opens when Bark types reaches 80 percent.
    - Plated bark (level 2): 3 new cards, closed. Same condition.
- Fruit
  - Fruit types (level 1): 2 new cards, open.
    - Acorns (level 2): 5 new cards, closed. Opens when Fruit types reaches 80 percent.

Placement test link stays available from lessons.

## Screens to mock

Five new screens, phone width 390px, in one standalone HTML file. Same `.screen` and `:target` mechanics as before. Ids:

1. `home`. A welcome, one line of state (14 cards due), what is next (Red oaks, unit 5, 6 new cards) with Start, and two doors: Lessons and Progress. Nothing else. The nav stays.
2. `progress`. The overview. All three channels. The client must see shape, genus, and species scores as separate things without tapping.
3. `progress-shape`. One tap in: the leaf channel, Simple lobed. The shape card's own level, the three genus cards, and the species under each genus. Tapping a species leads to the species page (not mocked again).
4. `lessons`. Opens on what is next with Start. Then the three channels with a rollup of each channel's units.
5. `lessons-leaf`. One tap in: the leaf channel's units at their depths. Level-1 unit, level-2 units, level-3 units under Simple lobed. Each has Start and the five level squares. Closed units say what opens them.

Your angle (given in your prompt) decides how depth is presented: separate pages, zoom into one sheet, or expansion in place. Whatever you choose, the file must contain the five ids so the panel can shoot them the same way. If your angle expands in place, `progress-shape` and `lessons-leaf` show the page with that node expanded.

The pressed-leaf glyph is the client's favourite thing. Use it as the unit of score. Do not replace it with bars or percentages. Level squares are fine as a secondary rollup on unit rows.

Screenshot every screen and look at each with Read before you finish:

```
python shot.py <file>.html <out>.png 390 844 1 home
python shot.py <file>.html <out>.png 390 844 1 progress
python shot.py <file>.html <out>.png 390 844 1 progress-shape
python shot.py <file>.html <out>.png 390 844 1 lessons
python shot.py <file>.html <out>.png 390 844 1 lessons-leaf
```
