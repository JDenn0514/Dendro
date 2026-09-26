# The manual browser checklist

`scripts/audit.py` measures overflow, tap targets, and contrast.
`scripts/shots.py` prints every screen at both phone widths and all three root
sizes. This page holds what is left: the lines a person has to look at.

Run the two scripts first, then open the app at 390 px wide and answer each
line yes or no. A no is a bug to fix.

```
python -m http.server 8000     # one terminal, at the repo root
cd scripts && python audit.py  # another terminal
cd scripts && python shots.py ../out/shots
```

## Every screen

- [ ] The paper is cream, and the noise is visible but not busy.
- [ ] Nothing is pure black and nothing is pure white.
- [ ] The running foot is at the bottom, with a 3 px moss rule under the word
      you are on, and no rule anywhere else.
- [ ] Tab through the screen. Every control takes a visible outline, and the
      tab order runs down the page. The outline is moss, except on the three
      moss-filled controls, where it is ink so that it can be seen.
- [ ] No all-caps label, no monospace, no middle-dot string, no arrow in a
      link, no grey drop shadow.
- [ ] `audit.py` printed no contrast line for this screen.
- [ ] Every photo shows whole, at its own shape, on the paper, with no fade,
      no blend, and no tint.

## Home

- [ ] "Dendro" is the largest thing on the screen.
- [ ] The state sentence names only the channels that have a card due.
- [ ] The recommended print sits clear of the Start button, not over it.
- [ ] Both doors show a live mark, not a placeholder.

## Lessons

- [ ] The next unit is the same unit Home recommends.
- [ ] Each channel door's square count matches the unit count on that
      channel's own page.

## Lessons, one channel

- [ ] The stem and the branch ticks read as one figure, not an indented list.
- [ ] Exactly one Start on the page is filled moss.
- [ ] A folded row's meta line says how many units are inside it. An unfolded
      row's does not, because the rows themselves are on screen.
- [ ] Folding and unfolding moves no row above the one you tapped.

## Progress

- [ ] The finding sentence is true of the numbers under it.
- [ ] One sheet on the shapes rung, two on genera, three on species.
- [ ] The front sheet of each stack is that rung's own leading card. On the
      bark and fruit blocks the species stack fronts a bark plate or a fruit,
      not the genus leaf, so no stack repeats the ghost behind it.
- [ ] Each band's marks are the right objects: bark plates on the bark shapes
      rung, fruits on the fruit shapes rung, genus leaves on every genus and
      species band.
- [ ] The three waterlines in a channel start at the same left edge.

## Progress, one shape

- [ ] The strip marks the shape you opened, and only that one.
- [ ] Every species line is a link that opens that species.
- [ ] A genus with two sections prints both section headings.

## Session

- [ ] The photograph is the one bold move. Nothing else competes with it.
- [ ] A question shows no caption. The photo's alt text names no tree.
- [ ] Turn the phone on its side (844 by 390). The photo shows whole, and the
      prompt and the answers are one scroll away.
- [ ] The answer labels are exactly one width.
- [ ] The gauge has one tick per card, and the current tick is taller.
- [ ] Set the session size to 30 in Settings, start a review, and look at the
      gauge again. Every tick is still at least 2 px wide, the row has wrapped
      to a second line rather than squeezing, and the count of `.gauge i`
      matches the number in "card 1 of N".

## Reveal

- [ ] The correct name is the largest thing on the screen.
- [ ] The two photos of a pair sit side by side in frames of one height, each
      one whole.
- [ ] Nothing under a photo moves when the photo loads.
- [ ] The reveal prints one credit line for each photo the question showed,
      and one for a pair photo the question did not show.
- [ ] The level squares match the level sentence beside them.

## Species

- [ ] A missing plate reads as a fact, not an error.
- [ ] The two display numerals line up on their baseline.
- [ ] The bark photo shows whole, with no fade.

## Settings

- [ ] Each text size sample is printed at its own size, and the samples do not
      move when the setting changes.
- [ ] Reset needs two taps.
- [ ] Import asks before it replaces anything. A bad file is rejected with no
      question.
- [ ] The screen still opens with the content broken. Park
      `content/units.json` in `out/`, load `#/settings`, and put the file
      back. An unknown value in `?content=` breaks nothing: the app sends it
      to `content/`.
