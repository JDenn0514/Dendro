# Tree ID Learning Tool — Design Notes

Status: pre-implementation. This document captures design thinking, not commitments.
Nothing here is built yet.

---

## 1. What this is

A **learning tool** for North American tree identification. Used at home, at a desk,
deliberately — not in the field.

Inspiration:

- **Audubon Field Guide to North American Trees** — the content model. Separate photos
  for bark, leaves, needles, fruit, flowers; size information from whole tree down to
  leaf; range map; habitat and description.
- **Duolingo** — learning and testing are the same activity. Broad-to-deep progression.
- **Anki** — spaced repetition. Material you know appears less often.

### Non-goals

These are explicitly out of scope and should stay out unless revisited deliberately.

- **Not an identifier.** No "photograph a tree and I'll tell you what it is." That
  market is saturated and it's the opposite of the point.
- **No user photo logging.** No observation journal, no personal collection.
- **Not a field app.** No GPS, no camera, no offline-in-the-woods requirement.
- **Not social.** No accounts-for-others, leaderboards, or sharing.

---

## 2. Core model: channel × depth

Two independent axes. This is the central structural idea.

### Channels (what part of the tree you're looking at)

| Channel | Role |
|---|---|
| Leaf / needle | Primary. Richest photo availability. |
| Bark | Primary. Most under-taught, hardest to source. |
| Fruit / cone | Secondary. Strongly diagnostic when present. |
| Flower | Secondary. Narrow window, but distinctive. |
| Twig / bud | Secondary. Own discipline (bud scales, leaf scars, pith). |
| Form / silhouette | Tertiary. Weak alone, useful as a prior. |
| Range / habitat / elevation | Not a quiz channel — a *narrowing prior* applied at all depths. |

### Depth levels

1. **Type** — which visual category is this?
2. **Group** — which genus or family within that category?
3. **Species** — which species within that group?

You choose a channel (or a few) and work rightward through depth as you improve.
Channel selection and depth progression are independent — you can be at species level
on leaves and type level on bark.

---

## 3. Level-1 vocabularies (per channel)

**Each channel needs its own level-1 vocabulary.** This is the key non-obvious point.
The Audubon leaf buckets don't transfer to bark.

These vocabularies *are* the transferable skill. Being able to look at a trunk and think
"blocky plates, orange fissures" matters more than naming the species; species naming is
downstream of it.

**Leaf** (follows Audubon's own key structure)
- Needles (bundled / single / clustered)
- Scale-like
- Simple, untoothed (entire)
- Simple, toothed
- Simple, lobed
- Pinnately compound
- Palmately compound
- Fan / strap (palms, yuccas, palmettos)

**Bark**
- Smooth
- Furrowed / ridged
- Plated / blocky
- Shaggy / strip-peeling
- Papery / exfoliating
- Warty / lenticelled

**Fruit / cone**
- Samara
- Acorn
- Nut / husk
- Pod / legume
- Berry / drupe
- Capsule
- Cone (woody / soft / fleshy)

**Flower**
- Catkin
- Showy petaled
- Inconspicuous / greenish
- Strobilus / cone-bearing

**Twig / bud**
- Bud arrangement: opposite / alternate / whorled
- Bud type: scaled / naked / clustered-terminal
- Leaf scar shape and bundle-scar count
- Pith: solid / chambered / hollow

Note: the **entire top tier is small and continent-wide** — roughly 30 concept cards
covering all of North America. Cheap to build, useful on its own.

---

## 4. Leaf arrangement — a cross-cutting axis

Opposite vs. alternate vs. whorled branching is one of the highest-yield diagnostics in
temperate tree ID and it doesn't fit the channel grid cleanly. It's visible on twigs,
on leafy branches, and sometimes on bare winter branch structure.

Decision needed: treat it as
- (a) a sub-attribute of the twig channel,
- (b) its own micro-channel, or
- (c) a tagged attribute surfaced in explanations but never quizzed directly.

Leaning (b) — it's small (three answers), enormously useful, and immediately cuts the
candidate pool. The MADCap Horse mnemonic covers most opposite-branching genera and
would make a natural early "lesson."

---

## 5. Card model

The atomic unit is **not** a species. It's a `species × channel` pair, plus a separate
class of concept cards.

```
ConceptCard    (channel, level-1 category)      e.g. bark / "plated"
GroupCard      (channel, genus)                 e.g. leaf / Acer
SpeciesCard    (channel, species)               e.g. bark / Betula papyrifera
```

Consequences:

- You can be strong on Gambel oak leaves and useless on Gambel oak bark. The system
  should know that and schedule accordingly.
- **Species mastery = the weakest channel**, not the average. A species isn't "learned"
  until you can get it from bark alone.
- The progress display should show this per-channel, not as a single percentage.

---

## 6. Scheduling

Anki-style spaced repetition (SM-2 or FSRS — see open decisions) operating on individual
cards.

One modification: the **session builder respects channel focus**. If you're in a bark
block, only bark cards due for review are pulled. Leaf intervals keep ticking in the
background, so switching back to leaves presents a real accumulated queue rather than a
reset.

### Gating

Soft, not hard. Recommend the next unlock; allow skipping. Offer a placement test so an
experienced user isn't grinding through "is this a needle" for a week.

---

## 7. Question formats

Format is a difficulty dial independent of content. Same card, escalating as it matures:

1. 4-option multiple choice (recognition)
2. 8-option multiple choice
3. Free text entry (recall)

Occasionally invert: "which of these four photos shows a shagbark hickory?"

Recognition and recall are different skills. Multiple choice alone lets you coast. Format
escalation gives a difficulty ramp with zero additional content cost.

**Photos must rotate.** The primary failure mode of every existing tree flashcard app is
that you memorize "that specific photo = Gambel oak." Each card needs a pool of images,
sampled randomly per presentation.

---

## 8. Distractors

Wrong answers must be plausible. Four options of ponderosa pine, saguaro, mangrove, and
sugar maple teach nothing.

Most of this falls out of the hierarchy for free:

- Level 2 distractors: other genera in the same level-1 bucket.
- Level 3 distractors: congeners.

Beyond that, a small hand-built **confusion graph** is needed for the genuinely nasty
pairs — and it must be channel-specific, because confusability varies by channel.
Engelmann and blue spruce are confusable by needle and cone but separable by other means;
paper and gray birch are a bark problem specifically.

Seed list (southern Rockies + widespread eastern):
- Engelmann vs. blue spruce
- Douglas-fir vs. white fir
- Northern red vs. black oak
- Quaking aspen vs. narrowleaf cottonwood
- Paper vs. gray birch
- Sugar vs. black maple
- White vs. green ash

This graph doesn't exist in downloadable form anywhere. Building it is probably the most
valuable and least automatable part of the project.

---

## 9. The teaching moment on a miss

After a wrong answer, don't just show the right name. Show **the species you picked next
to the correct one, same channel, with the diagnostic difference called out in one
sentence.**

"You said black oak. This is northern red oak — note the shallower sinuses and the
shorter bristle tips."

This is where the actual learning happens and it's cheap to author: one sentence per edge
in the confusion graph, not per species.

---

## 10. Progressive reveal — separate mode, non-scoring

A "field sim" mode: bark first, reveal twig on failure, then leaf, then range.

**This must not feed the scheduler.** If a user gets it right on the third reveal, the
system can't tell whether they knew the leaf or just accumulated enough hints. It
pollutes the per-channel signal that the whole card model depends on.

Keep it as an optional, separately-scored game mode. It's fun and it mirrors real field
ID, but it's a reward loop, not a diagnostic.

---

## 11. Range and elevation

Used as a **prior**, not a channel. Half of real ID is narrowing to plausible candidates
before looking closely.

Question type worth building: *"Mixed conifer stand, 9,500 ft, southwest Colorado. Which
three of these eight are plausible?"* Elevation banding in the Rockies is sharp enough to
be genuinely diagnostic.

At continental scope, range becomes more important, not less — several oak and hickory
species are effectively separable only by geography.

---

## 12. Seasonality

Deprioritized. Not a scheduling driver.

Retained only as:
- Photo metadata (fall color vs. summer green vs. bare) so the pool can be filtered.
- A tag so leaf-color cards are distinguishable from leaf-shape cards.

A "what's identifiable right now" mode is a possible later feature, not a v1 concern.

---

## 13. Content

This is where the project lives or dies.

### Sourcing strategy: hybrid

- **Curated core.** Hand-pick one canonical high-quality photo per `species × channel`.
  This guarantees channel coverage and image quality.
- **iNaturalist API fill.** Pull additional photos per card from research-grade
  observations to provide rotation and natural variation.

### Known constraints

- iNat has abundant leaf and whole-tree photos. **Good bark photos are scarce** — often
  out of focus, poorly lit, or with no scale reference. Winter twig photos are rarer
  still. Expect to hand-curate these.
- iNat photo licenses vary per photo. Only CC-licensed images may be used, licenses must
  be filtered at query time, and **photographer attribution must be displayed**.
- iNat phenology annotations (flowering, fruiting, budding) help filter but are
  inconsistently applied.
- Respect API rate limits; cache aggressively.

### Scale reference

The Audubon guide gives sizes. Photos usually don't convey scale. Consider displaying a
size range alongside the reveal, or preferring photos with a scale cue (hand, coin,
trunk context) for the curated core.

---

## 14. Prototype scope

Slice **vertically**, not geographically.

**v0 content:**
1. All of level 1, all channels, continent-wide (~30 concept cards).
2. One leaf bucket taken to level 3: **simple lobed** — maples, oaks, sycamore,
   sweetgum, tulip tree. Distinctive, widespread, and the oaks provide genuinely hard
   species-level work.

This exercises every mechanic, produces something immediately usable, and the expansion
path is "add another bucket" rather than a rewrite.

Long-term target: US / North America.

---

## 15. Open decisions

### Content and taxonomy

- [ ] **Naming convention.** Common names, scientific names, or both? Which is required
      for a correct answer? Common names vary regionally.
- [ ] **Taxonomic authority.** iNat taxonomy, ITIS, POWO, or Audubon's groupings? These
      disagree, particularly on oaks and hawthorns. Pick one and stick to it.
- [ ] **What counts as a tree?** Large shrubs, yuccas, palmettos, cacti? Audubon includes
      some. Define the inclusion rule before building the species list.
- [ ] **Non-native and planted species.** Many trees people actually encounter are
      ornamentals (ginkgo, Norway maple, callery pear, London plane). Include? Flag as
      a separate track?
- [ ] **Subspecies and varieties.** Roll up to species, or quiz separately?
- [ ] **Species list source.** Where does the initial list come from, and how is it
      maintained?

### Mechanics

- [ ] **SRS algorithm.** SM-2 (simple, well-understood) vs. FSRS (better, more complex).
- [ ] **Grading strictness** for typed answers. Case, punctuation, hyphens, and
      whitespace should be ignored. Should "red oak" be accepted for "northern red oak"?
      Should near-misses get partial credit?
- [ ] **Session length.** Fixed card count, fixed time, or until the due queue empties?
- [ ] **Mastery definition** and how it's displayed.
- [ ] Whether leaf arrangement is its own channel (see §4).

### Technical

- [ ] **Stack.** R/Shiny is the familiar option; a static JS app deploys free to GitHub
      Pages and runs client-side with no server. Given this is a personal learning tool
      with no backend needs, static JS is probably the better fit despite the lower
      familiarity — but this is a real tradeoff worth weighing.
- [ ] **Content storage.** JSON/YAML in-repo (diffable, reviewable, version-controlled)
      vs. SQLite. Leaning in-repo files for the species content; the confusion graph in
      particular benefits from being reviewable in a PR.
- [ ] **Photo handling.** Cache/vendor images into the repo, or fetch from iNat at
      runtime? Vendoring gives offline capability and consistent performance; fetching
      keeps the repo small and photos fresh. Licensing obligations apply either way.
- [ ] **Progress persistence.** localStorage (zero infrastructure, single device, data
      loss risk) vs. an exportable JSON file vs. a real backend. Single-user tool, so
      localStorage plus a manual export/import is probably sufficient.
- [ ] **Deployment target.** GitHub Pages, or run locally only?
- [ ] **Content authoring workflow.** How do new species get added? A script that takes
      a species name and pulls candidate photos for manual approval would make expansion
      tractable; without one, every addition is tedious manual work. Worth building
      early.

---

## 16. Prior art

Existing iNaturalist-API-backed quiz tools, worth reviewing before building:

- <https://inatquiz.pages.dev/> — taxa and location filtering, multiple photos per
  question, research-grade observations only.
- <https://identifi.life> — ID practice tool on the iNat API.
- <https://www.naturvonabisz.de/fg-quiz/index.html> — German only, but has a curated
  database, difficulty tiers, and phylogenetically-selected distractors. Closest in
  philosophy to this design.

None of them are tree-specific or channel-structured. That's the gap this fills.
