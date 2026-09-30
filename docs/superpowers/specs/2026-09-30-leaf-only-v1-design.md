# Leaf-only first version: design

Date: 2026-09-30. Ruling: `docs/decisions/2026-09-30-leaf-only-v1.md`.

## Goal

The app teaches leaves only. Bark and fruit content stays in `content/` and stays valid, and the app does not show it. One setting turns bark and fruit back on later.

## Owner calls (2026-09-30)

1. Hide the published bark and fruit photos in the app. Do not retire them.
2. Pairs with no leaf edge: draft leaf edges where the leaves differ. Remove the step that picks wrong answers from edges on any channel.
3. The app does not mention bark or fruit.

## Facts this design rests on

- The app builds its channel list from `content/concepts.json` in `deriveChannels` (`app/logic/content.js:18-24`). Every screen loops over `content.channels`. Only `app/main.js:146` calls `loadContent`.
- `content/units.json` has three units, one per channel: `leaf_types`, `bark_types`, `fruit_types`.
- The validator needs no bark or fruit photos. The pipeline needs none either.
- Photos in play today: 848 leaf, 352 bark, 356 fruit.
- 15 of the 98 species pairs in `content/confusion.json` have no leaf edge. All of their edges are bark or fruit.
- The wrong-answer chooser `speciesDistractors` (`app/logic/question.js:97-122`) takes edge neighbours on the card's channel, then edge neighbours on any channel (`question.js:105`), then the same genus, family, and bucket.

## Part 1: app change

Branch `feat/leaf-only`, one pull request.

### The active channels

- `loadContent(raw, { channels })` takes an optional list of active channels. With no list, it keeps every channel, as it does today.
- `app/main.js` passes `ACTIVE_CHANNELS = ['leaf']`. The constant lives in `app/main.js`, so the pipeline and the tests keep the full content.
- `validateContent` runs on the full content before the filter. A bark row with a bad credit still fails.
- After validation, `loadContent` keeps only the active channels in:
  - `content.channels`
  - the cards (so `cards_by_channel` and `unit_cards` follow)
  - `concepts_by_channel`
  - `content.units` (by the unit's `channel` field)
  - `content.confusion` (edges on a channel that is not active are dropped)
- A name in the list that is not a channel in `concepts.json` is an error from `loadContent`.

### Wrong answers

Remove the any-channel step at `question.js:105`. The chooser then uses edge neighbours on the card's channel, then genus, family, and bucket. The removal holds for every channel, not only for leaf.

### Screens

- Remove the "All three channels" text at `app/screens/concept.js:22` and `app/screens/lessons.js:180`. Write text that is true for any number of channels.
- With one active channel, the home screen shows no per-channel breakdown (`app/screens/home.js:28-34`), because the one row repeats the total.
- The species page shows only plates on active channels. `PLATE_SHAPES` in `app/screens/species.js:18` keeps its bark and fruit entries for later.
- A saved `#/session?focus=bark` link shows the "nothing is due" text. No redirect.
- Progress saved in localStorage for bark and fruit cards stays there. The app does not read it and does not delete it.
- The "due tomorrow" count on the session summary (`app/screens/session.js:597`, `dueTomorrowCount` in `app/logic/session.js:23-26`) counts only the cards in `content.cards`, so a saved bark card does not count.
- Settings lists a stored pair with no note (`app/screens/settings.js:228-236`) only when its channel is in `content.channels`. The stored list stays, and the export keeps it.

### Tests

- `loadContent` with `{ channels: ['leaf'] }` gives no bark or fruit cards, units, concepts, or edges, and still returns the validator's errors for bad bark rows.
- `loadContent` with no list gives every channel, as before.
- `loadContent` with an unknown channel name gives an error.
- `speciesDistractors` does not put first a species whose only edge is on another channel.
- `dueTomorrowCount` does not count a stored state whose card is not in the content.
- The Settings filter keeps only the pairs on an active channel, and keeps every pair when the content failed to load.
- `npm test`, `npm run test:pipeline`, `npm run validate`, and `npm run validate:dev` pass.
- The owner looks at the served app (`python -m http.server 8000`, `?content=dev` and the live content) on the home, lessons, session, species, and concept screens.

## Part 2: skill text

A `docs(skills)` change: the `content-run` skill states the leaf-only scope and gives `--channels leaf` in the `run init` step. It links the ruling. This can be in the Part 1 pull request or its own.

- The `photo-check` skill: `photos fetch` does not filter by channel, and `photos stage` refuses an approve on a channel outside the run. A clear photo on a channel outside the run is a reject, not an escalation.
- The `edges-draft` skill: in the first version, write leaf edges only. A bark or fruit edge does not count toward the target. It links the ruling.

## Part 3: leaf edges (content, separate)

An `edges-draft` pass on the 15 pairs with no leaf edge. It writes a leaf edge only where a source gives a leaf difference that a photo can show. It lists the pairs where no source gives one. The owner reads the list. This goes through the content-run flow, not through the Part 1 pull request.

## Out of scope

- A leaf top-up run for thin species. QUVE has 1 leaf photo in play. ACPL, ACSA3, PLOC, QUAL, QUMA2, ACMA3, ACRU, PLHI, PLRA, QUPA2, and QUSH have fewer than 6. This is the next content run, after this change.
- The photo-judge eval. The ruling unblocks it. It waits for the owner's go.
- Any change to the pipeline code. `run init --channels leaf` works today.
