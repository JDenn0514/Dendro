# Tree ID Learning Tool — Design Notes

Status: pre-implementation. Sections 1 to 16 are the original design notes.
Section 17 records the decisions made on 2026-09-21. Where the two disagree, section 17 wins.
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
- Ball / aggregate head

**Flower**
- Catkin
- Showy petaled
- Inconspicuous / greenish
- Strobilus / cone-bearing

**Twig** — two channels, not one

- `twig_arrangement`: opposite / alternate / whorled
- `twig_buds`: scaled / naked / clustered_terminal

The pith and leaf-scar channels were cut on 2026-09-22 for lack of photo supply.

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
- **Trust is split by kind.** An agent checks quality and license on every candidate
  photo. Species identity comes from the source page, never from the agent's own
  recognition. Three cases go to the owner: a species mismatch, a license that is missing
  or not redistributable, and a photo below the quality threshold.
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

- [x] **Naming convention.** Common names, scientific names, or both? Which is required
      for a correct answer? Common names vary regionally.
- [x] **Taxonomic authority.** iNat taxonomy, ITIS, POWO, or Audubon's groupings? These
      disagree, particularly on oaks and hawthorns. Pick one and stick to it.
- [x] **What counts as a tree?** Large shrubs, yuccas, palmettos, cacti? Audubon includes
      some. Define the inclusion rule before building the species list.
- [x] **Non-native and planted species.** Many trees people actually encounter are
      ornamentals (ginkgo, Norway maple, callery pear, London plane). Include? Flag as
      a separate track?
- [x] **Subspecies and varieties.** Roll up to species, or quiz separately?
- [x] **Species list source.** Where does the initial list come from, and how is it
      maintained?

### Mechanics

- [x] **SRS algorithm.** SM-2 (simple, well-understood) vs. FSRS (better, more complex).
- [x] **Grading strictness** for typed answers. Case, punctuation, hyphens, and
      whitespace should be ignored. Should "red oak" be accepted for "northern red oak"?
      Should near-misses get partial credit?
- [x] **Session length.** Fixed card count, fixed time, or until the due queue empties?
- [x] **Mastery definition** and how it's displayed.
- [x] Whether leaf arrangement is its own channel (see §4).

### Technical

- [x] **Stack.** R/Shiny is the familiar option; a static JS app deploys free to GitHub
      Pages and runs client-side with no server. Given this is a personal learning tool
      with no backend needs, static JS is probably the better fit despite the lower
      familiarity — but this is a real tradeoff worth weighing.
- [x] **Content storage.** JSON/YAML in-repo (diffable, reviewable, version-controlled)
      vs. SQLite. Leaning in-repo files for the species content; the confusion graph in
      particular benefits from being reviewable in a PR.
- [x] **Photo handling.** Cache/vendor images into the repo, or fetch from iNat at
      runtime? Vendoring gives offline capability and consistent performance; fetching
      keeps the repo small and photos fresh. Licensing obligations apply either way.
- [x] **Progress persistence.** localStorage (zero infrastructure, single device, data
      loss risk) vs. an exportable JSON file vs. a real backend. Single-user tool, so
      localStorage plus a manual export/import is probably sufficient.
- [x] **Deployment target.** GitHub Pages, or run locally only?
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

---

## 17. Decisions log (2026-09-21)

Decisions from the first brainstorming session. Each item resolves an open question above
or adds a rule the notes did not cover. Section 15 checkboxes marked done point here.

### Scope

- **Three specs, not one.** (1) The learning app. (2) The content pipeline: photo fetch,
  license filter, manual approval. (3) The content itself: species list, vocabularies,
  confusion graph, miss explanations. The app spec comes first. The app consumes content
  as data files.
- **v0 modes.** Core quiz loop and a placement test ship in v0. Field sim mode (§10) and
  range-prior questions (§11) wait for v1. Range, elevation, size, and habitat data are
  authored in v0 and shown on every reveal and on the species card, but not quizzed.

### Depth model: four levels

The three-level model in §2 gains a fourth level.

1. Type (level-1 category)
2. Group (genus or family)
3. Species
4. **Subspecies or variety.** The expert level. Quizzed only within a species, with
   sibling varieties as distractors. Example: Douglas-fir var. glauca vs. var. menziesii.
   Photo supply at this level is thin, so a variety gets a card only when it has an
   approved photo pool on at least one channel.

The card model in §5 gains a `VarietyCard (channel, variety)`.

### Taxonomy and species list

- **Authority and list source: USDA PLANTS** (<https://plants.sc.egov.usda.gov/>). The
  PLANTS symbol (for example QUGA) is the primary key for every species record. PLANTS
  supplies distribution by state, native or introduced status, growth habit, and
  subspecies and variety names.
- **iNat taxon ID** is stored as a cross-reference for the photo pipeline. Where PLANTS
  and iNat disagree on a split, PLANTS wins and the record notes the iNat name.
- **Audubon name** is stored as a field so the book maps onto the app.
- **What counts as a tree.** PLANTS growth habit is "tree" or "tree, shrub." Shrub-only
  species are excluded. A manual include list exists for exceptions (yuccas, palmettos).
  The include list is empty for v0.
- **Non-native species** are included. Native status per state comes from PLANTS and is
  shown on the species card. No separate track.

### Naming and grading

- **Both names accepted.** A typed answer is correct if it matches any listed common name
  or the scientific name. Reveal and multiple-choice options show both names.
- **Normalization:** lowercase, strip punctuation, collapse whitespace, hyphen equals
  space.
- **No partial credit.** Same genus, wrong species, is wrong.

### Channels

- **Leaf arrangement is part of the twig channel**, not its own channel. Arrangement is
  also a tagged species attribute, so distractor building and miss explanations can use
  it on any channel. The MADCap Horse mnemonic is the twig channel's first lesson.

### Scheduling

- **SM-2 now**, with a full review log (card, timestamp, grade, elapsed ms) so FSRS
  parameters can be fitted later.
- **Automatic grading.** Right maps to "good." Right with the guess flag maps to "hard."
  Wrong maps to "again."
- **Session:** fixed count, default 20, adjustable. Due cards first, ordered by overdue.
  New cards fill the remainder up to a daily new-card cap (default 10, adjustable).
  Multiple sessions per day allowed; after the cap, sessions are review-only.
- **Format escalation** is tied to card interval: 4-option choice under 7 days,
  8-option choice from 7 to 21 days, typed recall above 21 days. A lapse drops one
  format tier. Inverted questions ("which photo is X?") replace a normal question about
  one time in five on any tier.
- **Unit** = one level-1 bucket taken through its depth levels. A channel's level-1
  concept cards are that channel's first unit. Gating is soft: recommend the next unit,
  allow skipping.
- **Placement test:** a fixed 20-card session across all level-1 concepts. Each right
  answer marks that concept card mastered at a 21-day interval.

### Mastery and progress

- **A card is mastered** when its interval exceeds 21 days and its last three reviews
  have no lapse.
- **Species mastery = weakest channel.**
- **Progress screen:** a grid, species down the side, channels across. Each cell is
  colored by card state: unseen, learning, review, mastered. Unit percentages sit above
  the grid.

### Photos

- **Vendored into the repo**, resized to about 1200 px on the long side. Every image has a
  record with source, author, license, and origin URL. Attribution is displayed in the
  app and stored in the repo.
- **Tiered sources, split trust.** Curated core from university dendrology
  sites, US government sources (USDA PLANTS images, Forest Service, NRCS), and Wikimedia
  Commons. iNaturalist research-grade, CC-licensed photos are a fill source for rotation
  only. An agent checks channel, quality, and license on every candidate, and takes the
  species identity from the source page rather than from its own recognition. The owner
  sees only the escalations: a species mismatch, a doubtful license, or a photo below the
  quality threshold. "High quality" means a reputable source and a photo that shows the
  diagnostic feature, not resolution alone.

### Technical

- **Stack:** static JavaScript, deployed to GitHub Pages. The repo is public.
- **No framework for v0.** Plain HTML, CSS, and ES modules, no build step.
- **Logic stays out of the DOM.** Scheduler, deck loader, session builder, grader, and
  progress store are pure modules that take data in and return data out. Screens are a
  thin layer over them. This is what makes a later move to Svelte or React a rewrite of
  the screen layer only.
- **Content storage:** JSON in the repo. The confusion graph is a reviewable file.
- **Persistence:** localStorage for progress and the review log. Export and import to a
  JSON file from the settings screen. Each answer writes immediately, so closing the tab
  midway loses nothing.

### Additions, 2026-09-22

- **Units are 5 to 25 cards.** Below level 1 a unit narrows by region, then genus, then
  section (red oaks vs. white oaks). Small genera are bundled. PLANTS lists about 90 oak
  species after hybrids are removed, so one level-3 unit per bucket does not work.
- **Wide first.** Every bucket to level 2 before any bucket to level 3. Interleaving
  evidence: Kornell and Bjork 2008; Carvalho and Goldstone 2014.
- **Unit gate on the parent.** A unit is recommended when 80% of its parent unit's cards
  are at level 2 or higher, about three right answers in a row. Skipping stays allowed.
- **Interval chain 1, 4, 10, 25** (Anki default), in place of 1, 3, 8, 20.
- **Hybrids excluded** from the species list.
- **Superseded above:** the format escalation by interval and the one-in-five inverted
  question in the Scheduling section. The app spec (section 7) replaces both with a tier
  ladder where the question format is the level and inverted is its own tier.

### Still open

- ~~Content authoring workflow~~ Resolved in
  `docs/superpowers/specs/2026-09-22-content-pipeline-design.md`.
- The long-term species list needs a second filter beyond growth habit if the list ever
  expands past what a field guide covers.

---

### Review of 2026-09-22

Decisions from the review of the app spec. Each line changes a rule above or in
`docs/superpowers/specs/2026-09-21-tree-id-app-design.md`.

- **v0 ships three channels.** Level-1 concept cards for leaf, bark, and fruit, plus the
  `simple_lobed` leaf bucket taken to species for Colorado and the states next to it.
- **Planted urban species are full members** of a regional unit: Norway maple, red oak,
  silver maple, London plane, pin oak.
- **Next after v0:** the flower channel, then `twig_arrangement`, then `twig_buds`.
- **Pith and leaf scars are cut** from the model for lack of photo supply.
- **The twig channel splits in two**, `twig_arrangement` and `twig_buds`, each an ordinary
  channel with its own level-1 buckets.
- **The channel list derives from `concepts.json`.** A channel with no concepts and no
  cards renders nowhere.
- **No region setting in the app.** Each unit carries a `states` list, with `include` and
  `exclude` for exceptions, and membership is computed.
- **No click-through breakdown** on the unit progress number.
- **Photo pools are unions.** A group card pools its member species; a concept card pools
  its whole bucket, plus any manifest image aimed at the concept.
- **A variety gets a card only when the species has two or more varieties** with approved
  photos on that channel. Otherwise it is a note on the species screen.
- **snake_case for every data name:** JSON fields, bucket keys, unit keys, and
  localStorage keys. Card IDs keep the colon separator.
- **A committed fixture content set in `content_dev/`.** The app boots against it with
  `?content=dev`, and the tests use the same fixture.
- **One GitHub Actions job on push to `main`:** `node --test`, then content validation.
  Pages deploys only when it passes. This is not a build step.
- **`species.json` grows with the photo pool.** A record with no manifest images fails
  validation unless a confusion edge names it.
- **`planted_states` is a new species field.** A unit matches either `range.states` or
  `planted_states`.
- **Concept records gain `accept`,** the list of typed answers that grade as right.
- **Confusion edges gain `ref`,** the named reference the two sentences came from.
- **Licenses must permit redistribution:** public domain, a US government work, or a CC
  license. No hotlinking. Manifest rows gain `checked_by`, `checked_at`, and `note`.
- **Photo approval is split by trust.** The agent checks channel, quality, and license.
  Identity comes from the source page. Three cases escalate to the owner, and a run stops
  when more than a quarter of it escalates.
- **Tier and level are one thing.** Levels 0 to 4 are novice, beginner (`mc4`),
  intermediate (`mc8`), advanced (`inv`), and expert (a pass at `typed`).
- **The question format always equals the tier.** The old interval-to-format table is
  gone.
- **Promotion needs 2 `good` grades at the tier plus an interval gate:** 7 for `mc8`, 21
  for `inv` and `typed`. A `hard` grade is not a pass.
- **Demotion drops one tier** and resets `tier_passes`, with no exception for level 4. An
  expert card that lapses goes to tier `inv`, level 3.
- **Inverted is a tier, not a one-in-five question.** Below 4 photo options it is skipped,
  and `mc8` promotes straight to `typed`.
- **A slow right answer grades `hard`:** over 8 s at `mc4`, 15 s at `mc8`, 20 s at `inv`
  and `typed`. Over 60 s the clock is ignored and only the guess box counts.
- **Relearning:** an `again` card is re-queued once at the back of the session. The
  re-answer writes no log row and no state change. It does not apply in the placement
  test.
- **A placement pass sets tier `mc8`,** interval 21, ease 2.5, reps 1, due today + 21. The
  deck is one card per level-1 concept in every channel present, 22 cards in v0.
- **Distractors come only from species with a card on this channel**, for names and for
  photos.
- **Typed grading covers concept and group cards:** the `accept` list for a concept, the
  genus or the group common name for a group. One normalizer for all.
- **Progress:** a species sits at the lowest level among its cards. A unit number is the
  mean level over 4, as a percent, with the expert count beside it. Grid cells show the
  digit 0 to 4. The unseen, learning, review, and mastered labels are gone.
- **The review log is capped at 20,000 rows,** oldest dropped first, and each row records
  the option count. Format `inverted` becomes `inv`.
- **The summary screen suggests an export once a month.** The export holds the full
  history.
- **The v0 confusion edges are a shipping requirement:** 15 to 25 edges for the
  `simple_lobed` bucket, drafted by agents from named references, read by the owner
  before merge.
- **Added 2026-09-23: an eighth fruit concept, `ball`.** A sycamore fruit is a head of
  many small dry fruits and fits none of the seven. The placement deck is 22 cards.

---

## 18. Decisions log (2026-10-09): learning model

This section wins over sections 2, 10, 11, and 12 where they disagree. It also wins over
section 17's rule "species mastery = weakest channel" and over section 17's format and
scheduling rules where they disagree. The list below names each rule it replaces. The
round 2 subsection also replaces rules in sections 1 and 6, and section 17's unit and
placement test rules. It names each one.

The owner confirmed these decisions on 2026-10-09. The short record is
`docs/decisions/2026-10-09-learning-model.md`.

### Rules this section replaces

- **Section 2, the channel × depth grid as the whole model.** Part cards are now the first
  stage only. Tree cards come after them. The depth of a part is now also a content value
  for each species (see "Part cards").
- **Section 5 and section 17, "Species mastery = weakest channel."** Species mastery now
  comes from tree cards.
- **Section 17, Review of 2026-09-22, "a species sits at the lowest level among its
  cards."** This rule sets species progress from part cards. Tree cards now set it.
- **Section 10, "This must not feed the scheduler."** Tree cards are normal review cards
  with their own schedule. Section 10 also opens parts in a fixed order. On a tree card,
  the learner opens any part, in any order.
- **Section 11, range and elevation as clues.** On a tree card, the range map and the
  elevation range show only on the answer screen. Range narrows the wrong options through
  the area pick.
- **Section 12, "Deprioritized. Not a scheduling driver."** A tree card is one species in
  one season. Season now decides which tree cards exist and which wrong options are
  allowed.
- **Section 17, "No region setting in the app."** The learner now picks an area at the
  start.
- **Section 17, "Distractors come only from species with a card on this channel."** For
  tree cards, the wrong options come from `content/confusion.json`, limited by season and
  area.
- **The photo-check rule "Stop at 6 good photos."** Intake now fills a quota at each
  photo difficulty step.

### Why

- Real identification uses the whole tree, not one part.
- A tree looks different through the year. Leaves fall and change colour, and flowers
  open.
- Place, habitat, size, and elevation help identification.
- How the leaves sit on the branch helps as much as one leaf.
- Photo intake is weak. Today the difficulty of a question depends only on its answer
  format, not on how hard the photo is.

### Goal

- The learner can name a real tree from what is visible that day.
- The app stays a desk tool (section 1).
- The learner also learns the botany words and features. This is a planned side effect,
  not the goal.

### Part cards

A part is one part of the tree: leaf, bark, fruit, twig, flower, or form. Earlier
sections and the code call a part a "channel". A part card shows one part of one species.
Form is a distant photo of the whole tree.

- Part cards stay as the first stage. They teach the words for each part. They also show
  which part a learner is weak on.
- A part card asks only as deep as that part can tell. For each species and each part,
  the content records a depth:
  - `species`: the part names the species. Example: a bur oak acorn.
  - `group`: the part names only the group. Example: most acorns give only the red oak
    group or the white oak group.
  - `none`: the part does not help.
- Reason: many fruits, such as acorns, look alike, and so do many barks.

### Tree cards

A tree card is one species in one season, with a button for each part.

- Form is one more part on a tree card.
- A tree card can combine photos of the same species from several trees. When one real
  iNaturalist observation has enough parts, the tree card uses that observation.
- Season comes from what the photos show: the season tags in the manifest. It does not
  come from the photo date, because dates can be missing or wrong.
- A part that does not change through the year is marked "any season". Examples: bark,
  and the form of an evergreen. An "any season" photo can join a tree card of any season.
- Free context on a tree card is what a person standing at the tree knows: the state,
  the season, the typical habitat, the typical height, and the typical leaf or needle
  size. Habitat, height, and leaf size come from the authored species files. The card
  labels them "typical".
- The range map, the elevation range, and the description show only on the answer
  screen.
- The learner can open any part at no cost. Nothing counts as a hint. The score is only
  whether the learner named the species. The app records which parts the learner opened.
- After a miss, the app shows the right species. It also shows the part that best
  separates the right species from the learner's answer, with a link to a photo that
  shows that part clearly. Only parts with depth `species`, or parts that separate the
  pair, are used.

### Scheduling, unlock, and mastery

- Tree cards are normal review cards with their own spaced-repetition schedule.
- A tree-card answer does not change the schedule of any part card. This removes the
  objection in section 10.
- The tree cards of a species unlock when the learner has named that species right on
  part cards for two or more different parts.
- Gating stays soft: the app recommends, and the learner can skip.
- Species mastery comes from tree cards. Part cards show weak parts. They do not decide
  mastery.

### Answer formats and wrong options

- Tree cards use the same answer formats as part cards: 4 choices, then 8 choices, then
  typed.
- The wrong options (distractors) come from `content/confusion.json`. They are limited
  to species found in the same season and in the learner's area.

### Area

At the start, the learner picks one of two areas:

- "Trees in my area": one or more US states, matched against the USDA PLANTS
  distribution.
- "All of North America".

### Photos and intake

- **Photo difficulty step.** Each photo gets a difficulty step from 1 to 3 at intake. The
  same frame applies to every part:
  1. The feature shows alone and whole. Example: one leaf on a plain background.
  2. The feature is clear, but among other things. Example: a branch where one leaf is
     easy to read.
  3. The learner must search for the feature, or the feature is not typical. Examples:
     leaves at a distance, young leaves, damage.
- **Features per part.** Each part has its own list of features to read. Leaf: shape,
  margin, venation, and arrangement. Bark: texture, colour, and pattern. Fruit, twig, and
  flower get their own lists. The lists start from the section 3 vocabularies and the
  leaf traits of issue #14.
- **The code computes the step.** The photo judge marks which features a photo shows
  clearly. The code computes the difficulty step from those marks. This follows the
  leaf-trait ruling of 2026-09-28: the traits are the data, and the code computes the
  bucket.
- **Quota per step.** Intake fills a quota at each difficulty step. This replaces "Stop
  at 6 good photos".
- **Intake method.** Several intake methods get a close comparison before one is picked.
  The comparison waits for the prototype notes.

### Content fields

- Each authored species file, `content_src/species/<SYMBOL>.json`, gets two new values:
  - a depth for each part (`species`, `group`, or `none`);
  - a typical leaf or needle size, as a length range.
- The species-draft skill writes these values from the trusted sources it already cites.
- The owner checks them for learner clarity, not for botany.

### Next steps

- The selection-method eval (PR #35) stays paused before Task 5. It tuned the "Stop at 6
  good photos" rule, and the quota per step replaces that rule.
- A throwaway prototype page, outside `app/`, for 10 species. It uses leaf, bark, and
  fruit only, because no twig, flower, or form photos exist yet.
  - Four confusion pairs: QULA and QUSI, ACPE and ACSP2, ACCI and ACPA2, PLHI and PLRA.
  - LITU: it has season tags on all its parts.
  - ACFL: it has leaf photos from three seasons.
  - PLHI had wrong-species rows in the selection eval. Check PLHI, or swap that pair.
- The owner uses the prototype in three or four short sessions on different days, and
  writes notes. The intake comparison waits for those notes.

### Facts found on 2026-10-09

- The manifest has active photos on three parts only: leaf 1,253, bark 548, fruit 425.
  It has no twig, flower, or form photos.
- Most bark and fruit photos have no season tag. LITU is the only species with season
  tags on every part.
- The iNaturalist observation ID is kept only in the `origin` URL of a row
  (`.../observations/<obsId>#photo=<photoId>`). 224 manifest observations have two or
  more photos. All the samples seen were leaf photos.
- The cached iNaturalist JSON (`pipeline/cache/api.inaturalist.org/`) has `observed_on`,
  location, and `place_guess`. The pipeline drops them. iNaturalist gives no elevation.
- Manifest rows already have a `difficulty` field. Today its only value is `hard`, and a
  `hard` row is held back (`app/logic/content.js`).
- Species files already have `habitat`, `height_ft`, `elevation_ft`, `range`, and a
  `concepts` value for each part. They have no leaf-size field.

### Relation to the leaf-only decision

`docs/decisions/2026-09-30-leaf-only-v1.md` said the first version teaches leaves only,
and the app hides bark and fruit. It conflicted with this section: a tree card unlocks
only after part cards on two or more parts, so leaf part cards alone never unlock one.
The owner closed the conflict later on 2026-10-09 (see the next subsection).

### First-version parts and teaching first (2026-10-09)

The owner decided these later on 2026-10-09. The short record is
`docs/decisions/2026-10-09-v1-parts-and-teach-first.md`. It replaces the leaf-only
decision.

- **Bark and fruit come back for the first version.** The 548 bark rows and 425 fruit
  rows in the manifest are published. The app only hides them. New content runs collect
  bark and fruit again, and the rule "every run takes `--channels leaf`" ends.
  - Reason: the learning model above. Tree cards unlock after part cards on two parts.
    Tree cards combine photos from several trees. Part cards with depth `group` need
    fewer photos. The quota per step replaces "Stop at 6 good photos".
  - The owner judges learner clarity. The photo judge and the source pages decide the
    botany.
- **Flowers come after the first version.** No flower photos exist. Most trees flower
  for a short time, and many tree flowers are small or high in the crown.
- **The app teaches before it tests.** This replaces section 1, "learning and testing are
  the same activity", for new material. The teaching moment after a miss (section 9)
  stays.
  - New species come in small look-alike sets from `content/confusion.json`. Example:
    vine maple, mountain maple, Rocky Mountain maple, and striped maple.
  - An introduction page for each set comes before the first card on that set.
  - The page shows the species side by side, part by part. It names the features that
    tell them apart.
  - It also names the parts that do not help, from the depth of each part.
  - The quiz on the set comes after the page.
  - The page stays open later as a reference, as the species and group pages.
- **Open:** the size of a look-alike set and the exact layout of the introduction page.
  Both wait for the prototype notes.
- Round 2 (next subsection) replaces the look-alike sets and the introduction page for
  each set.

### Learning path and species pages (2026-10-09, round 2)

The owner decided these later on 2026-10-09, after the notes on the first prototype.
There are two short records:

- `docs/decisions/2026-10-09-learning-path.md`: the order of the path, groups, common
  trees first, batches, practice mode, and the placement test.
- `docs/decisions/2026-10-09-v1-parts-and-teach-first.md`, round 2: the species page,
  matched photos, leaf size, and the card layout.

The decisions in short:

- **Broad to specific.** The path runs from words (the vocabulary), to groups, to
  species. Each word comes a little before the first group that needs it. The stages
  overlap, and older cards come back for review.
- **Groups are real tree groups,** a genus or a family, such as the oaks and the maples.
  Leaf shapes, such as "lobed", become words. The owner writes `content/units.json`, and
  this changes how the owner groups the units.
- **Common trees first.** The order comes from USDA Forest Service FIA counts for forest
  trees, and from the McCoy et al. city street-tree dataset for planted trees
  (<https://zenodo.org/records/6726506>). iNaturalist counts are a fallback for a planted
  tree in a state with no city data, marked less certain. Canada and Mexico are a gap at
  first, so "all of North America" means the US.
- **All parts together.** The main path teaches leaf, bark, and fruit of a group or a
  species together. The page covers all parts. Part cards on each part follow it, and
  tree cards unlock after part cards on two parts.
- **Subgroups.** A large group splits into subgroups before its species: the oaks into
  red oaks and white oaks, the pines into soft and hard pines. Small groups skip this level.
  Which groups split is open.
- **The usual look first.** A species is introduced with photos of its look for most of
  the year (red maple: green leaves). Photos from other seasons come after the learner
  knows the species. The difficulty step does not change with the season.
- **Practice mode.** The learner practises one part only, on trees already met. The app
  suggests a part that the part cards show is weak.
- **Tree cards start at the group:** "Which group is this tree in?" They ask for the
  species when the learner reaches species for that group.
- **Form rule, for later.** A form card asks for the shape word, or for the group where
  shape is a real clue. It never asks for the species from one distant photo.
- **Batches.** New material comes in batches: 4 items at the start, 5 after a good batch,
  3 after several misses, 2 for a look-alike pair, never more than 5. The next batch opens
  when each card in the batch is answered right once. The learner can skip ahead.
- **Wrong options** come only from species, groups, or words the learner has met. Early
  cards have fewer choices.
- **Placement test.** It stays, and now tests words and groups.
- **Species page.** The information page is about one species. Each part says in plain
  words how reliable it is. When the learner has met a look-alike, the page gets a
  section: "You have met X. Here is how they are alike, and how to tell them apart." The
  labels "This tells them apart" and "This only tells you the group" are dropped.
- **Matched photos.** Photos that the learner compares match in stage, season, and view,
  in any layout.
- **Leaf size on leaf part cards.** A leaf photo with a scale object counts as a better
  photo, and "size can be judged" joins the leaf feature list.
- **Layout.** Tap a photo to make it larger. On pages, photos stack at full width. Photo
  credits are smaller.
- **Two new photo difficulty factors:** an unusual angle, and light or shadow that changes
  the colour.
- **Next: a beginner prototype** of the full path on four groups: the maples (red maple,
  sugar maple), the oaks (white oak, northern red oak), the tuliptree, and the sycamores
  and planetrees (American sycamore, London planetree, the look-alike pair at the end).
  An agent proposes photos with a difficulty step. The owner makes the final call.

Rules that round 2 replaces:

- **Section 1, "learning and testing are the same activity",** for new material. The
  app teaches before it tests (subsection above), now through species pages and batches.
- **Section 2, the depth levels "type, group, species".** They now run words, groups,
  species. The words come just in time, not as one first tier.
- **Section 2, "channel selection and depth progression are independent",** for the main
  path. The main path teaches all parts together. One-part study moves to practice mode.
- **Section 6, the channel focus of the session builder,** for the main path.
- **Section 17, "Unit = one level-1 bucket taken through its depth levels".** Units now
  follow tree groups.
- **Section 17, the placement test:** the 20-card session and the deck of one card per
  level-1 concept. The test now covers words and groups.
- **Section 18, "the score is only whether the learner named the species",** for tree
  cards in the group stage.
- **The look-alike sets and the introduction page for each set** (subsection above).

### Still open

- Closed on 2026-10-09: the leaf-only rule ends, and bark and fruit part cards come back
  for the first version (see the subsection above).
- Closed in round 2: the size of a look-alike set. The batch rule replaces the sets.
- The list of groups, and their order in each area.
- The FIA and city data work: loading the counts, the crosswalk for ACFL, PLHI (FIA:
  PLHY3), QUAC2, QUBO2, and QUMA13, and how forest and planted counts combine.
- Canada and Mexico.
- How many choices early cards have.
- How the section 17 unit rules (5 to 25 cards, the gate at 80%, wide first) apply to
  groups.
- How batches fit the daily cap on new cards (section 17).
- What a placement pass sets for a word or a group card.
- Whether depth `group` uses the same groups as the path. "Red oak group" is a section of
  the oaks, not a genus.
- The exact layout of the species page, and which credit form the app uses.
- How the two new difficulty factors enter the computed difficulty step.
- How the manifest records "any season".
- How the difficulty steps 1 to 3 map onto the `difficulty` field, which has only `hard`
  today.
- Whether tree cards have the inverted tier (`inv`) of section 17. The owner named only
  4 choices, 8 choices, and typed.
- The size of the quota at each difficulty step.
- The feature lists for fruit, twig, and flower.
- The intake method, after the prototype notes.
- Whether the range-prior questions of section 11 stay.
