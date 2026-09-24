# Dendro content design

Date: 2026-09-23
Status: approved design, not yet authored. Two decisions wait on the owner. Section 8.4
and section 9 mark them.

Sources:

- `DESIGN.md` section 17.
- `docs/superpowers/specs/2026-09-21-tree-id-app-design.md`, the app spec.
- `docs/superpowers/specs/2026-09-22-content-pipeline-design.md`, the pipeline spec.
- `docs/superpowers/plans/2026-09-22-content-pipeline.md`, the plan.
- The USDA PLANTS checks of 2026-09-23.
- The iNaturalist sweep of 2026-09-23.

This spec covers the content itself. It sets the v0 species set, the exemplar species for
each level-1 concept, the unit tree, the authored species fields, and the confusion edges.
It does not cover the pipeline that fetches and approves the photos, the app that reads the
files, or the sync server. This is the third spec that the app spec and the pipeline spec
both name (app spec:8-10, pipeline spec:11-13, `DESIGN.md:395-398`).

---

## 1. What this spec covers, and what it does not

In scope:

- The species that enter `content/species.json` in v0, and why each one is in or out.
- The exemplar species a concept run looks photos up through.
- The keys, levels, order and sizes in `content/units.json`.
- The author-only fields on a species record.
- The pairs in `content/confusion.json`.

Out of scope: the pipeline that fetches and approves photos (pipeline spec:11-13); the app
that reads the files (app spec:8-10); the sync server (pipeline spec:16-19).

This spec names files the pipeline writes. It does not change how the pipeline writes them.

---

## 2. Decisions inherited

Each line holds one decision this spec accepts and the place it comes from.

| Decision | Source |
|---|---|
| USDA PLANTS is the naming authority, and the PLANTS symbol is the primary key. | pipeline spec:58-63 |
| A species enters the list only when its PLANTS growth habit includes `Tree`. | pipeline spec:250 |
| Hybrids, marked with `×` in the PLANTS name, are excluded, except by the `include` list (section 3). | pipeline spec:251, amended here |
| A photo ships only under a license that permits redistribution. NC and ND are out in v0. | pipeline spec:733-734 |
| A unit holds 5 to 25 cards. Outside that band the validator warns. | app spec:368-369, `app/logic/content.js:5-7` |
| Units are ordered wide first: every bucket to level 2 before any bucket to level 3. | app spec:121-125 |
| Card IDs, concept keys, bucket keys, and unit keys are append-only. None is renamed or removed. | pipeline spec:275-276 |
| A planted species is a full member of a regional unit, through `planted_states`. | app spec:39, app spec:917-918 |
| The concept records are authored by hand. The 21 v0 records stand, and this spec adds one, `ball`. | pipeline spec:53-56, amended in section 4 |
| Every confusion edge names a reference in `ref`, and the owner reads it before merge. | app spec:813-815 |

---

## 3. The v0 species set

### 3.1 The enumeration rule

`cli species list` keeps a species when all three hold (pipeline spec:248-254):

1. The PLANTS growth habits include `Tree`.
2. The PLANTS name has no `×`.
3. One state in `range.states` is in the run's `states`, or the symbol is in `include`.

**Amendment.** Rule 2 does not apply to a symbol in `include`. The v0 set names London
plane, and London plane is a hybrid. See section 10.

An author sets bucket membership; the pipeline does not fetch it. A species that passes
the three rules can still leave the set at the bucket step. The `simple_lobed` bucket is
the v0 bucket.

### 3.2 Every tree-rule species in the six states

States: CO, UT, NM, WY, NE, KS. Genera: Acer, Quercus, Platanus. All rows come from the
PLANTS profile and distribution endpoints, read on 2026-09-23. All are native in the
lower 48.

| Symbol | Scientific | PLANTS common name | Section | Six-state subset | In bucket | Reason when out |
|---|---|---|---|---|---|---|
| ACGL | Acer glabrum | Rocky Mountain maple | | CO, NE, NM, UT, WY | in | |
| ACGR3 | Acer grandidentatum | bigtooth maple | | CO, NM, UT, WY | in | |
| ACNE2 | Acer negundo | boxelder | | CO, KS, NE, NM, UT, WY | out | Pinnately compound, 3 to 7 leaflets. Not simple. |
| ACNI5 | Acer nigrum | black maple | | KS | in | |
| ACSA2 | Acer saccharinum | silver maple | | KS, NE, NM | in | |
| ACSA3 | Acer saccharum | sugar maple | | KS | in | |
| PLOC | Platanus occidentalis | American sycamore | | KS, NE | in | |
| PLWR2 | Platanus wrightii | Arizona sycamore | | NM | in | |
| QUAJ | Quercus ajoensis | Ajo Mountain scrub oak | Quercus | CO, NM | out | Spiny-toothed. The Colorado record is also suspect. |
| QUAL | Quercus alba | white oak | Quercus | KS, NE | in | |
| QUAR | Quercus arizonica | Arizona white oak | Quercus | NM | out | Entire to toothed. |
| QUBU2 | Quercus buckleyi | Texas red oak | Lobatae | KS | in | |
| QUCH2 | Quercus chrysolepis | canyon live oak | Protobalanus | NM | out | Entire to spiny. |
| QUEM | Quercus emoryi | Emory oak | Lobatae | NM | out | Entire to spiny-toothed, evergreen. |
| QUGA | Quercus gambelii | Gambel oak | Quercus | CO, NM, UT, WY | in | |
| QUGR3 | Quercus grisea | gray oak | Quercus | CO, NM | out | Entire to shallowly toothed. |
| QUHA3 | Quercus havardii | Havard oak | Quercus | CO, KS, NM, UT | in | Lobes are shallow. The leaf note says so. |
| QUHY | Quercus hypoleucoides | silverleaf oak | Lobatae | NM | out | Entire, revolute. |
| QUIM | Quercus imbricaria | shingle oak | Lobatae | KS | out | Entire, unlobed, laurel-like. |
| QUMA2 | Quercus macrocarpa | bur oak | Quercus | KS, NE, NM, WY | in | |
| QUMA3 | Quercus marilandica | blackjack oak | Lobatae | KS, NE | in | Three broad shallow lobes. |
| QUMO | Quercus mohriana | Mohr oak | Quercus | NM | out | FNA vol. 3 gives the leaves as entire to shallowly toothed, not lobed, so it leaves at the bucket step like the other New Mexico evergreen oaks. Provisional; confirm at species-draft. |
| QUMU | Quercus muehlenbergii | chinquapin oak | Quercus | KS, NE, NM | out | Coarsely toothed, never lobed. |
| QUOB | Quercus oblongifolia | Mexican blue oak | Quercus | NM | out | Entire. |
| QUPA10 | Quercus palmeri | Palmer oak | Protobalanus | NM | out | Spiny-toothed, holly-like. |
| QUPA2 | Quercus palustris | pin oak | Lobatae | KS, NE | in | |
| QUPR | Quercus prinoides | dwarf chinquapin oak | Quercus | KS, NE | out | Coarsely toothed, never lobed. |
| QUPU | Quercus pungens | pungent oak | Quercus | NM | out | Wavy, sharply toothed, not lobed. |
| QURU | Quercus rubra | northern red oak | Lobatae | KS, NE | in | |
| QURU4 | Quercus rugosa | netleaf oak | Quercus | NM | out | Entire to toothed, rugose. |
| QUSH | Quercus shumardii | Shumard's oak | Lobatae | KS | in | |
| QUST | Quercus stellata | post oak | Quercus | KS | in | |
| QUTO2 | Quercus toumeyi | Toumey oak | Quercus | NM | out | Entire to toothed. |
| QUTU2 | Quercus turbinella | Sonoran scrub oak | Quercus | CO, NM, UT | out | Spiny-toothed, holly-like. |
| QUVE | Quercus velutina | black oak | Lobatae | KS, NE | in | |
| QUVI | Quercus virginiana | live oak | Quercus | UT | out | Entire. The Utah record is also suspect. |

Sections come from Flora of North America vol. 3, *Quercus* (Nixon).

Seven hybrids passed the tree rule and dropped at rule 2: QUBE3, QUBU, QUFA2, QUFE2,
QUPA3, QUPA4, QUST2. *Q. ×pauciloba*, the wavyleaf oak, is common on the Colorado
Plateau. It gets a line on the Gambel oak species screen, not a card.

### 3.3 The include list

Two symbols enter by `include`. Neither has a six-state PLANTS record.

| Symbol | Scientific | Common name | Status | Why it is on the list |
|---|---|---|---|---|
| ACPL | Acer platanoides | Norway maple | introduced (L48, CAN) | A named v0 urban species (`DESIGN.md:531`). |
| PLHI | Platanus ×hispanica | London planetree | hybrid | A named v0 urban species. Rule 2 does not apply to it. |

PLANTS holds two accepted species-rank records for London plane, and this spec picks
`PLHI`, *Platanus ×hispanica* Mill. ex Münchh., common name "London planetree", because it
carries a PLANTS common name, so `common` fills without `common_extra`, and because a
species symbol is append-only once published.

The other record is *Platanus ×acerifolia* (Aiton) Willd. (pro sp.), which carries no
common name and is not a synonym of `PLHI`.
`PLAC2` is not used, and v0 writes no record for it.

The plan's `--include` string names a symbol that belongs to *Plagiobothrys
acanthocarpus*, a forb, not to London plane. See section 10.

Sweetgum (`LIST2`) and tuliptree (`LITU`) leave v0. Neither has a six-state PLANTS record
and neither is on the include list. The v0 genera are Acer, Quercus, Platanus. See
section 10.

The v0 set is 20 species: 6 maples, 11 oaks, 3 sycamores.

- Maples: ACGL, ACGR3, ACNI5, ACSA2, ACSA3, ACPL.
- White oaks (section Quercus): QUGA, QUMA2, QUAL, QUST, QUHA3.
- Red oaks (section Lobatae): QURU, QUVE, QUPA2, QUSH, QUBU2, QUMA3.
- Sycamores: PLOC, PLWR2, PLHI.

### 3.4 `planted_states`

`planted_states` records where people plant a species, not where it grows wild (app
spec:274-275). A unit matches on either list (`app/logic/content.js:111-127`). Each value
below follows a named city or state list read on 2026-09-23. A state with no source is
left out and waits on a check.

| Symbol | `planted_states` | Source per state |
|---|---|---|
| ACPL | `["CO", "WY", "NE", "KS"]` | CO: Denver and Colorado Springs street tree lists. WY: Cheyenne Urban Forestry 2022. NE: Street Trees for Nebraska. KS: Preferred Trees for Northeast Kansas. |
| QURU | `["CO", "WY"]` | CO: Colorado Springs street tree list. WY: Cheyenne Urban Forestry 2022. NE and KS are native range, not planted range. |
| ACSA2 | `[]` | No list carries it. Denver bans it from the public right-of-way. Colorado Springs and Cheyenne omit it. |
| PLHI | `["CO", "NM", "NE", "KS"]` | CO: Denver and Colorado Springs. NM: Albuquerque Plant Palette 2018, rated conditionally recommended. NE: Street Trees for Nebraska. KS: Preferred Trees for Northeast Kansas. |
| QUPA2 | `["CO"]` | CO: Colorado Springs street tree list. Cheyenne, Nebraska and Kansas lists omit it. |
| PLOC | `["CO"]` | CO: Denver approved street tree guide. |

Waits on a check:

- Utah for all six species. Salt Lake City Urban Forestry publishes its lists as PDFs
  behind a landing page that the research pass did not open.
- Wyoming for ACSA2. Cheyenne omits it, and no other Wyoming list was read.

`content_dev/` is a fixture, not content. Its `ACSA2.planted_states` value of
`["CO", "WY"]` has no source and does not carry into `content/`.

---

## 4. Concepts and exemplars

The 21 concept records stand as they are, and v0 adds one. The addition renames no key and
removes none. The vocabulary then holds 22 concepts: 8 leaf, 6 bark, 8 fruit. The placement
deck is one card per concept, so the deck holds 22 cards (app spec:586).

**The one v0 addition.** The record below appends after `cone`, at the end of the fruit
channel:

```json
{ "key": "ball", "channel": "fruit", "name": "Ball / aggregate head",
  "accept": ["ball", "balls", "fruit ball", "aggregate head", "aggregate", "multiple", "buttonball"],
  "description": "A round head of many small dry fruits packed around a core, hanging on a stalk." }
```

The reason: the three sycamores are among the most-seen street trees in the region, and
their fruit is their easiest winter mark. None of the seven existing fruit concepts names a
head of many small dry fruits. Concept keys are append-only (pipeline spec:275-276), so the
spec may add a key where it may not rename or remove one.

The addition moves the placement deck from 21 cards to 22. That count appears in
`DESIGN.md` section 17, in the app spec, and in pipeline spec section 12. Section 10 records
the edits.

**Rule.** Every concept record carries a non-empty `accept` array and a `description`
string. The validator checks neither (`app/logic/content.js:164-165`). `accept` is the only
grading source for a typed concept answer (app spec:691), and `description` is the reveal
fallback (`app/logic/question.js:314`). A record that drops either breaks with no error, so
the rule is a review rule.

A concept run looks photos up through exemplar species and writes the rows with
`target: "<channel>/<key>"` (pipeline spec:536-541). The exemplar supplies the lookup and
the origin page only. The owner fills `concept_exemplars` in
`pipeline/runs/concepts_v0/run.json` before `photos fetch` (plan decision 26).

**The symbols below are verified.** A pass on 2026-09-23 checked all 47 exemplar symbols
against the PLANTS API, and every one matched. `cli run init` confirms every symbol against
the checklist and fails on one it cannot find. The iNaturalist counts are global
observation totals from one API sweep on 2026-09-23, and measure the depth of the photo
pool.

### 4.1 Leaf channel

| Concept | Exemplars | iNat counts | Why |
|---|---|---|---|
| `needles` | Ponderosa pine (PIPO); Colorado blue spruce (PIPU); two-needle piñon (PIED) | 39,782; 35,513; 16,058 | Two bundle sizes and one single-needle form. |
| `scale_like` | Rocky Mountain juniper (JUSC2); Utah juniper (JUOS); eastern redcedar (JUVI) | 18,000; 16,813; 124,423 | Mature sprays of tight scales, with the deepest pool in the region. |
| `simple_entire` | Eastern redbud (CECA4); northern catalpa (CASP8); Russian olive (ELAN) | 112,970; 34,318; 27,891 | Three blade shapes, all with a smooth edge. |
| `simple_toothed` | American elm (ULAM); chokecherry (PRVI); Siberian elm (ULPU) | 79,805; 102,072; 38,009 | Coarse double teeth and even fine teeth. |
| `simple_lobed` | Bur oak (QUMA2); Gambel oak (QUGA); American sycamore (PLOC) | 54,788; 18,718; 97,960 | Deep rounded lobes and broad shallow lobes. All three are v0 species. |
| `pinnately_compound` | Green ash (FRPE); black walnut (JUNI); smooth sumac (RHGL) | 67,666; 87,498; 43,213 | Leaflets in two rows on one stalk, at three leaflet counts. |
| `palmately_compound` | Ohio buckeye (AEGL); horsechestnut (AEHI) | 22,690; 77,598 | Leaflets from one point, at five and seven. The thinnest leaf concept. |
| `fan_strap` | Soapweed yucca (YUGL); banana yucca (YUBA); California fan palm (WAFI) | 14,923; 16,713; 10,688 | Two strap widths and one fan. No palm is hardy in the six states. |

### 4.2 Bark channel

| Concept | Exemplars | iNat counts | Why |
|---|---|---|---|
| `smooth` | Quaking aspen (POTR5); white fir (ABCO); American beech (FAGR) | 81,587; 19,486; 125,291 | Unbroken surfaces at three ages. Beech is the out-of-region anchor. |
| `furrowed` | Plains cottonwood (PODE3); green ash (FRPE); bur oak (QUMA2) | 65,777; 67,666; 54,788 | Deep grooves, a diamond pattern, and long rough ridges. |
| `plated` | Alligator juniper (JUDE2); common persimmon (DIVI5); ponderosa pine (PIPO) | 8,849; 51,508; 39,782 | Square blocks in a grid, small dark blocks, and large flat plates. |
| `shaggy` | Shagbark hickory (CAOV2); eastern redcedar (JUVI); Rocky Mountain juniper (JUSC2) | 41,886; 124,423; 18,000 | Lifting plates and peeling strips. |
| `papery` | Paper birch (BEPA); American sycamore (PLOC); water birch (BEOC2) | 51,976; 97,960; 6,931 | Sheets and flakes that leave a paler layer. |
| `warty` | Hackberry (CEOC); black cherry (PRSE2); chokecherry (PRVI) | 48,738; 136,564; 102,072 | Corky warts and horizontal lenticel lines. |

### 4.3 Fruit channel

| Concept | Exemplars | iNat counts | Why |
|---|---|---|---|
| `samara` | Boxelder (ACNE2); silver maple (ACSA2); green ash (FRPE) | 196,490; 64,154; 67,666 | Two paired-wing shapes and one single wing. |
| `acorn` | Bur oak (QUMA2); Gambel oak (QUGA); northern red oak (QURU) | 54,788; 18,718; 125,546 | A deep fringed cup, a shallow scaly cup, and a flat saucer cup. |
| `nut` | Black walnut (JUNI); shagbark hickory (CAOV2); American hazelnut (COAM3) | 87,498; 41,886; 19,100 | Three husk forms around a hard nut. |
| `pod` | Honeylocust (GLTR); black locust (ROPS); Kentucky coffeetree (GYDI) | 79,200; 140,264; 14,250 | A long twisted pod, a short flat pod, and a thick woody pod. |
| `berry` | American plum (PRAM); redosier dogwood (COSE16); Saskatoon serviceberry (AMAL2) | 16,023; 94,171; 50,276 | One large drupe and two cluster forms. |
| `capsule` | Soapweed yucca (YUGL); Ohio buckeye (AEGL) | 14,923; 22,690 | A case that splits along three seams, and a husk that splits into sections. |
| `cone` | Douglas-fir (PSME); Colorado blue spruce (PIPU); ponderosa pine (PIPO) | 90,747; 35,513; 39,782 | Three-pointed bracts, a papery hanging cone, and a heavy woody cone. |
| `ball` | American sycamore (PLOC); London plane (PLHI); Osage orange (MAPO) | 97,960; 19,158; 37,446 | One brown head on a long stalk, a pair of heads on one stalk, and a large green ball. |

The `ball` row adds two exemplar symbols. PLHI is a v0 species (section 3.3). MAPO is
*Maclura pomifera*, Osage orange, a Plains native planted for hedgerows in Kansas and
Nebraska. The PLANTS check of 2026-09-23 returns `MAPO` for its species-rank record. The
PLHI count comes from an iNaturalist record at hybrid rank, because iNaturalist ranks
London plane as a hybrid and PLANTS ranks it as a species.

### 4.4 Traps

Each line names what the photo-check agent does.

- **Quaking aspen.** Its small round teeth read as `simple_entire` at mid range, and an old
  trunk is smooth above and black furrowed at the base. Approve aspen for `smooth` only, on
  the upper trunk. Reject it for `simple_toothed`.
- **Ponderosa pine.** A young trunk is near black and furrowed; an old one breaks into
  orange plates. Approve it for `plated` only on a mature trunk.
- **`fan_strap`.** No palm is hardy in the six states, so the fan half always shows an
  out-of-region plant. Approve the palm photos and name the region in `note`.
- **`palmately_compound`.** Only *Aesculus* carries this leaf in the region. If the two
  buckeyes do not reach three approved photos, escalate before adding Virginia creeper,
  which is a vine.
- **`capsule`.** Yucca is the one clean regional capsule, and it also serves `fan_strap`.
  Reject northern catalpa: its fruit is a capsule that every viewer reads as a pod.
- **Pin oak and bigtooth maple.** Both hold smooth bark for many years. Approve QUPA2 and
  ACGR3 for `furrowed` only on a mature trunk. Reject a young smooth stem.
- **The sycamores.** The base of a large sycamore trunk is dark and furrowed. Approve PLOC,
  PLWR2 and PLHI for `papery` on the upper trunk only, and name the frame in `note`.
- **`ball`.** A sycamore ball and a sweetgum ball look alike at distance. Sweetgum is not in
  v0, so this spec writes no photo-check rule for the pair yet.
- **Havard oak.** QUHA3 grows as a low clone, so a trunk photo is unlikely. Escalate no
  bark candidate for it. Section 8.3 records the gap.

Two more rejection rules the agent applies: no *Juniperus* photo enters the `berry` pool,
and no *Ulmus* photo enters the `samara` pool.

---

## 5. Units

### 5.1 How this spec computes the sizes

A unit is one channel (`app/logic/content.js:111-127`). A level-3 unit holds one species
card per member that has a card on that channel, so its card count is its species count.
A level-2 unit holds one group card per genus among its members. A card exists only when
its photo pool has at least one entry (app spec:94-96).

The six states split into an Interior West flora (CO, UT, WY, NM) and a Plains flora
(NE, KS). A split holds only where both halves reach 5 cards. The Interior West half never
does: it holds 4 maples, 3 white oaks and 2 red oaks. So each group is one six-state unit.

Platanus holds 3 species, under the floor on every channel. The sycamores go into the
maple unit, and the unit's name says so. Sycamore and Norway maple leaves are the pair a
learner confuses (section 7, row 7). The key `simple_lobed_maples_co` names the unit's
core genus and stays correct when Platanus later reaches 5 species and splits out.

### 5.2 The tree

```json
[
  { "key": "leaf_types", "name": "Leaf types", "channel": "leaf", "level": 1, "parent": null },
  { "key": "bark_types", "name": "Bark types", "channel": "bark", "level": 1, "parent": null },
  { "key": "fruit_types", "name": "Fruit types", "channel": "fruit", "level": 1, "parent": null },
  { "key": "simple_lobed_genus", "name": "Simple lobed leaves", "channel": "leaf", "level": 2,
    "parent": "leaf_types", "bucket": "simple_lobed",
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": [], "exclude": [] },
  { "key": "furrowed_genus", "name": "Furrowed bark", "channel": "bark", "level": 2,
    "parent": "bark_types", "bucket": "furrowed",
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": [], "exclude": [] },
  { "key": "acorn_genus", "name": "Acorns", "channel": "fruit", "level": 2,
    "parent": "fruit_types", "bucket": "acorn",
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": [], "exclude": [] },
  { "key": "samara_genus", "name": "Winged seeds", "channel": "fruit", "level": 2,
    "parent": "fruit_types", "bucket": "samara",
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": [], "exclude": [] },
  { "key": "simple_lobed_maples_co", "name": "Maples and sycamores", "channel": "leaf",
    "level": 3, "parent": "simple_lobed_genus", "bucket": "simple_lobed",
    "genera": ["Acer", "Platanus"],
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": [], "exclude": [] },
  { "key": "simple_lobed_white_oaks_co", "name": "White oaks", "channel": "leaf",
    "level": 3, "parent": "simple_lobed_genus", "bucket": "simple_lobed",
    "genera": ["Quercus"], "section": "Quercus",
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": [], "exclude": [] },
  { "key": "simple_lobed_red_oaks_co", "name": "Red oaks", "channel": "leaf",
    "level": 3, "parent": "simple_lobed_genus", "bucket": "simple_lobed",
    "genera": ["Quercus"], "section": "Lobatae",
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": [], "exclude": [] },
  { "key": "furrowed_oaks_co", "name": "Oak bark", "channel": "bark", "level": 3,
    "parent": "furrowed_genus", "bucket": "furrowed", "genera": ["Quercus"],
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": [], "exclude": [] },
  { "key": "acorn_oaks_co", "name": "Oak acorns", "channel": "fruit", "level": 3,
    "parent": "acorn_genus", "bucket": "acorn", "genera": ["Quercus"],
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": [], "exclude": [] },
  { "key": "samara_maples_co", "name": "Maple seeds", "channel": "fruit", "level": 3,
    "parent": "samara_genus", "bucket": "samara", "genera": ["Acer"],
    "states": ["CO", "UT", "NM", "WY", "NE", "KS"], "include": [], "exclude": [] }
]
```

The order is wide first. Every level-2 unit comes before every level-3 unit, so the
session builder reaches level 2 in all four buckets first (app spec:548-550).

### 5.3 The sizes

| Key | Level | Parent | Members | Cards |
|---|---|---|---|---|
| `leaf_types` | 1 | none | none; the unit takes every leaf concept card | 8 |
| `bark_types` | 1 | none | none; the unit takes every bark concept card | 6 |
| `fruit_types` | 1 | none | none; the unit takes every fruit concept card | 8 |
| `simple_lobed_genus` | 2 | `leaf_types` | all 20 v0 species | 3 |
| `furrowed_genus` | 2 | `bark_types` | the 10 species with `bark: furrowed`: 4 maples and 6 oaks | 2 |
| `acorn_genus` | 2 | `fruit_types` | the 11 oaks | 1 |
| `samara_genus` | 2 | `fruit_types` | the 6 maples | 1 |
| `simple_lobed_maples_co` | 3 | `simple_lobed_genus` | ACGL, ACGR3, ACNI5, ACSA2, ACSA3, ACPL, PLOC, PLWR2, PLHI | 9 |
| `simple_lobed_white_oaks_co` | 3 | `simple_lobed_genus` | QUGA, QUMA2, QUAL, QUST, QUHA3 | 5 |
| `simple_lobed_red_oaks_co` | 3 | `simple_lobed_genus` | QURU, QUVE, QUPA2, QUSH, QUBU2, QUMA3 | 6 |
| `furrowed_oaks_co` | 3 | `furrowed_genus` | QURU, QUVE, QUPA2, QUSH, QUBU2, QUMA2 | 6 |
| `acorn_oaks_co` | 3 | `acorn_genus` | the 11 oaks | 11 |
| `samara_maples_co` | 3 | `samara_genus` | the 6 maples | 6 |

The four level-2 units sit under the 5-card floor, so `cli build` warns on each. This spec
accepts the warning. A level-2 unit holds one card per genus, and these buckets hold one or
two genera in v0. The units still exist for two reasons. A level-3 unit's parent is the
level-2 unit for its bucket (app spec:360-362). The gate reads the parent's cards (app
spec:560-563). Validation warns here; it does not fail (`app/logic/content.js:289-298`).

### 5.4 Bark and fruit units, and why they exist

**A species card that no unit holds never enters a session.** `buildSession`
(`app/logic/session.js:77-104`) takes new cards only from `content.unit_cards[unitKey]`
(line 87). Due cards come from `dueCardIds` (line 80), which calls `isDue`; `isDue` returns
false when the card has no state (`app/logic/scheduler.js:37-40`). A card gets a state only
after the user answers it. `buildPlacementDeck` (`app/logic/session.js:122-130`) takes
cards of kind `concept` only. So an unseen species card outside every unit has no way in.

The v0 run collects leaf, bark, and fruit photos for all 20 species. Three buckets hold 5
or more of them, and each gets a level-2 and a level-3 unit. The three are `furrowed` and
`acorn` for the oaks, and `samara` for the maples. Every oak bears an acorn and every maple
bears a samara, so those two counts are firm. Section 6.3 sets the bark bucket for every v0
species from a named source, so the bark counts are firm too. 10 species carry `furrowed`:
4 maples and 6 oaks. `furrowed_genus` holds one group card for Acer and one for Quercus, so
2 cards. `furrowed_oaks_co` holds 6 species cards.

5 species carry `plated`, and all 5 are oaks: QUMA3, QUGA, QUAL, QUST, QUHA3. v0 ships no
`plated` unit. Havard oak grows as a low clone, so its bark card may never exist, and
without it a `plated_oaks_co` unit would hold 4 cards. Section 11 carries the item.

The sycamores get no bark or fruit unit. Platanus holds 3 species, under the floor on every
channel. The `ball` concept fits a sycamore fruit (section 4), and all three sycamores carry
it, but 3 species sit below the 5-card floor. So v0 ships no level-2 and no level-3 `ball`
unit. Sycamore bark and fruit cards exist when the photos land, and wait on a later `papery`
or `ball` unit.

No level-4 unit ships in v0. A variety card needs two varieties with approved photos on
the channel (app spec:107-110), and no v0 run targets a variety key (app spec:388-390). A
level-4 unit would hold 0 cards and warn.

---

## 6. Authored species fields

The `species-draft` skill reads references in this order (pipeline spec:317-320):

1. Silvics of North America, the species chapter.
2. The Virginia Tech dendrology fact sheet.
3. Flora of North America.
4. Sibley, *The Sibley Guide to Trees*.

Every authored file names its sources in `ref`. `ref` never reaches the published record.

### 6.1 `genus_common` and `arrangement`

Both fields are author-only. The pipeline does not produce either (app spec:283-289).
Every v0 species record carries both.

| Genus | `genus_common` | `arrangement` |
|---|---|---|
| Acer | `maple` | `opposite` |
| Quercus | `oak` | `alternate` |
| Platanus | `sycamore` | `alternate` |

Without `genus_common`, a group card accepts the bare genus name as its only typed answer
(app spec:693-694). With it, the card accepts "maple" and "oak". The pipeline spec's
authored-file text lists neither field as optional and needs both added. See section 10.

### 6.2 `audubon_name`

The author sets `audubon_name` only where the National Audubon Society Field Guide to
North American Trees carries the species under a different name from `common[0]`. No
source in this spec's research covers the Audubon name list, so this spec writes no value
here. The author
confirms each one against the book during the species-draft pass and leaves the field out
where the book does not carry the species.

### 6.3 Bark and fruit concept per v0 species

Four lookups on 2026-09-23 read a bark description for every v0 species. The table sets
`concepts.bark` and `concepts.fruit`. The `species-draft` skill copies these values into
the `concepts` object of each authored file and does not re-derive them.

| Symbol | Bark | Runner-up | Fruit | Source |
|---|---|---|---|---|
| ACGL | `smooth` | | `samara` | VT 161 |
| ACGR3 | `furrowed` | `smooth` | `samara` | VT 587 |
| ACNI5 | `furrowed` | | `samara` | VT 452 |
| ACSA2 | `shaggy` | | `samara` | VT 5 |
| ACSA3 | `furrowed` | | `samara` | VT 2 |
| ACPL | `furrowed` | | `samara` | VT 6 |
| QURU | `furrowed` | | `acorn` | VT 38 |
| QUVE | `furrowed` | | `acorn` | VT 39 |
| QUPA2 | `furrowed` | `smooth` | `acorn` | VT 74 |
| QUSH | `furrowed` | | `acorn` | VT 169 |
| QUBU2 | `furrowed` | | `acorn` | FNA 233501014 |
| QUMA3 | `plated` | | `acorn` | VT 168 |
| QUGA | `plated` | | `acorn` | FNA 233501032, VT 315 |
| QUMA2 | `furrowed` | `plated` | `acorn` | VT 72 |
| QUAL | `plated` | | `acorn` | VT 35 |
| QUST | `plated` | `furrowed` | `acorn` | VT 77 |
| QUHA3 | `plated` | | `acorn` | FNA 233501042 |
| PLOC | `papery` | `furrowed` | `ball` | VT 36, FEIS |
| PLWR2 | `papery` | `furrowed` | `ball` | VT 638 |
| PLHI | `papery` | | `ball` | VT 307 |

`VT n` is the Virginia Tech dendrology fact sheet with that ID, at
`https://dendro.cnre.vt.edu/dendrology/syllabus/factsheet.cfm?ID=n`. `FNA n` is the Flora
of North America taxon with that ID, at
`http://www.efloras.org/florataxon.aspx?flora_id=1&taxon_id=n`. `FEIS` is the Fire Effects
Information System page `fs.usda.gov/database/feis/plants/tree/plaocc/all.html`.

Three rules produced the table. First, no source uses the word "plated", and most white
oak sources lead with "scaly". DESIGN.md section 3 names six bark terms and does not place
"scaly" among them, so this spec reads a scaly surface as `plated`, because the `plated`
description is a surface that breaks into plates. Second, where young bark and old bark
differ, the bucket follows the mature trunk, and the runner-up column names the young
form. Section 4.4 tells the photo-check agent which species need a maturity filter. Third,
a species keeps only one bucket. The runner-up is a review note, not a second value, and it
never reaches `concepts`.

---

## 7. Confusion edges

### 7.1 The rules

- The v0 target is 15 to 25 edges for the `simple_lobed` bucket (app spec:813).
- Both `a` and `b` must already be keys of `content/species.json`. The validator rejects an
  edge whose endpoint is missing (`app/logic/content.js:252-258`).
- Legal channels in v0 are `leaf`, `bark`, and `fruit`. The channel list derives from
  `concepts.json` (app spec:71-73). The `edges-draft` skill also names `twig`, which is not
  a channel and fails validation. See section 10.
- One edge per pair per channel. Both directions carry a real difference.
- Each side names a mark a person can see in one photo. No range, habitat, or bloom date.
- An author appends each edge, and never renames or removes one.

The table below lists 21 pairs and the mark that separates them. The `edges-draft` skill
writes the final two sentences and the `ref` string; this spec sets the pairs. The
validator checks neither `a_not_b` nor `b_not_a` nor `ref`, so the owner's read is the only
check on them.

### 7.2 The pairs

| a | b | Channel | a, not b | b, not a | Ref |
|---|---|---|---|---|---|
| QUGA | QUMA2 | leaf | 7 to 9 deep rounded lobes cut past halfway, on a wedge base. | A deep pair of sinuses near the middle nearly cuts the blade in two. | FNA |
| ACSA2 | ACSA3 | leaf | Deep narrow sinuses and a silver-white underside. | Shallow U-shaped sinuses and a pale green underside. | VT |
| ACSA3 | ACPL | leaf | A cut petiole leaks clear sap, and the lobe tips taper fine. | A cut petiole leaks milky sap, and the blade is wider than long. | VT |
| ACSA2 | ACPL | leaf | Sinuses cut deep and the underside is silver. | Sinuses are shallow and the underside is green. | Sibley |
| ACGR3 | ACSA3 | leaf | 3 to 5 blunt lobes on a small blade, in the Rockies. | Larger blade with fine-pointed lobe tips. | FNA |
| ACGL | ACGR3 | leaf | 3 lobes with sharp double teeth; some leaves split into 3 leaflets. | 3 to 5 lobes with smooth blunt edges. | FNA |
| PLOC | ACPL | leaf | Leaves sit alternate on the twig. | Leaves sit opposite on the twig. | VT |
| PLOC | PLHI | bark | Flaking reaches a chalk-white upper trunk. | Flaking leaves an olive and cream mottle that stays darker. | Sibley |
| PLOC | PLHI | fruit | Each stalk carries one fruit ball, and rarely two. | Each stalk usually carries two fruit balls. | FNA vol. 3, Platanus; VT fact sheet 307 |
| QURU | QUVE | leaf | Sinuses cut about halfway, and the underside is smooth. | Sinuses cut deeper, and rusty hairs sit in the vein angles. | Silvics |
| QURU | QUVE | bark | Flat-topped grey ridges run in long ski tracks. | Near-black blocky bark over bright orange-yellow inner bark. | VT |
| QURU | QUSH | leaf | Shallower sinuses and a dull upper surface. | Deeper sinuses, more bristle tips, and hair tufts in the vein angles. | FNA |
| QUSH | QUBU2 | leaf | Leaves to 20 cm, on a large tree. | Leaves to 12 cm, on a small tree of limestone ground. | FNA |
| QUPA2 | QURU | leaf | Deep U-shaped sinuses cut nearly to the midrib, so the blade looks skeletal. | Sinuses cut about halfway and the blade looks solid. | VT |
| QUPA2 | QURU | bark | Dead down-pointing branches on the lower trunk, over thin tight bark. | The trunk self-prunes, and the bark breaks into ridges early. | Sibley |
| QUAL | QUMA2 | leaf | Even lobes and regular sinuses, with no deep waist. | One deep pair of sinuses and a large fan-shaped end lobe. | VT |
| QUAL | QUMA2 | bark | Light grey bark in loose vertical scales. | Dark bark in thick rough vertical ridges. | VT |
| QUAL | QUST | leaf | Narrow lobes on a blade widest above the middle. | Two broad square middle lobes make a cross shape. | VT |
| QUMA2 | QUST | fruit | A fringed mossy cup rim covers half the nut. | A shallow scaly cup covers about a third of the nut. | FNA |
| QUMA3 | QUVE | leaf | A bell-shaped blade, widest at the end, with 3 shallow bristle-tipped lobes. | 5 to 7 deeper lobes and a more even outline. | VT |
| QUGA | QUHA3 | leaf | Deep rounded lobes cut well past halfway. | Shallow wavy lobes, on a low clone that spreads by rhizomes. | FNA |

`VT` is a Virginia Tech dendrology fact sheet. `FNA` is Flora of North America vol. 3.
`Silvics` is Silvics of North America vol. 2. `Sibley` is *The Sibley Guide to Trees*,
2009. The `edges-draft` skill names the exact page in `ref`.

By channel the table holds 15 leaf rows, 4 bark rows and 2 fruit rows. All 21 ship in v0:
15 leaf, 4 bark, 2 fruit. That is inside the 15 to 25 target. The PLOC to PLHI fruit row
was held in an earlier draft, because the sycamores carried no fruit concept. The `ball`
concept gives PLOC and PLHI a fruit card, so the row ships (section 8.2).

---

## 8. Gaps and thin channels

### 8.1 Species with a card, per channel

The `mc8` tier shows 8 options and needs 8 species with a card on the channel
(app spec:663-665). The app skips the `inv` tier below 4 photo options, which caps a card
at level 3 (app spec:640-644).

| Channel | Species the plan expects to carry a card | Above 8 |
|---|---|---|
| leaf | 20 | yes |
| bark | up to 20; all 20 carry a bark concept | yes |
| fruit | 20: 11 oaks, 6 maples and 3 sycamores | yes |

No v0 channel falls under 8. Fruit sits at 20 because the `ball` concept gives the three
sycamores a fruit concept (section 4). Section 6.3 gives all 20 species a bark concept, so
the bark channel is capped at 20 cards. 19 are likely to get a photo. QUHA3 is the
exception, and section 8.3 says why.

### 8.2 The sycamore fruit concept

The `ball` concept closes this gap. None of the first 7 fruit concepts covered a sycamore
fruit, which is a ball of many small dry fruits. Section 4 adds `ball`, and section 6.3
gives PLOC, PLWR2 and PLHI the value `fruit: ball`. A photo on a channel where the species
has no concept fails validation (`app/logic/content.js:192-199`), and that block no longer
stops a sycamore fruit photo.

The concept run collects 3 to 5 `ball` photos through the three exemplars in section 4.3:
PLOC, PLHI and MAPO. If the `concepts_v0` run has already completed with 21 concepts, then
a follow-up concept run for `ball` alone is needed. Section 11 carries that item.

The PLOC to PLHI fruit edge (section 7.2) now ships, and it rests on the count of heads per
stalk. FNA gives PLOC 1 head per stalk, rarely 2. VT 307 gives PLHI a pair. FNA gives
PLWR2 2 to 4, rarely 1.

### 8.3 Two thin spots

- `simple_lobed_white_oaks_co` holds exactly 5 cards. One oak without an approved leaf
  photo drops it to 4 and the build warns.
- `plated` and `papery` are the two bark concepts most at risk of missing 3 approved
  photos. Alligator juniper (8,849) and water birch (6,931) are the lowest counts in the
  exemplar set, and the license filter cuts further.
- QUHA3 carries `bark: plated`, but its bark card is unlikely to exist. FNA opens the
  species as a low clonal shrub, so few photos show a trunk at bark scale. This spec
  accepts the missing card as a gap under the default in section 8.4. The species keeps its
  leaf and fruit cards.

### 8.4 Which gaps to accept

**Owner call.** Proposed default: ship a species with the channels it has, and ship a
concept with 1 or 2 approved photos rather than hold the run. A card exists only when its
pool has an image (app spec:94-96), so a missing channel hides itself and nothing looks
broken. The run report lists every thin species and every thin concept.
Alternative: hold the species or the concept out of the merge until its pool reaches the
target, and re-run the fetch for it.

---

## 9. Review

The owner reads the branch before it merges. Three things reach the owner: the edges, the
authored species files, and the escalation list.

**Owner call.** Proposed default: the owner reads every edge, both sentences, against the
named `ref`. In a species file the owner reads the `concepts` field and the `ref` list
only. The other fields go to the named reference on trust. A wrong `concepts` value moves
a species into the wrong unit and the wrong distractor pool. A wrong elevation number
costs nothing in the app.
Alternative: the owner reads every field of every file against the reference.

---

## 10. Amendments to the other specs and the plan

| File | Section or line | Current text | New text |
|---|---|---|---|
| `2026-09-22-content-pipeline-design.md` | §4, line 251 | `2. The name has no ×.` | `2. The name has no ×, or the symbol is in the run's include list.` |
| `2026-09-22-content-pipeline-design.md` | §12, lines 669-670 | `Genera Acer, Quercus, Platanus, Liquidambar, Liriodendron.` | `Genera Acer, Quercus, Platanus.` |
| `2026-09-22-content-pipeline-design.md` | §12, lines 670-671 | `Include: the planted species Norway maple, red oak, silver maple, London plane, and pin oak, by their PLANTS symbols` | `Include: ACPL, QURU, ACSA2, PLHI, QUPA2. London plane is PLHI, a hybrid, kept by the include exception in section 4.` |
| `2026-09-22-content-pipeline-design.md` | §5, lines 313-314 | `Optional: common_extra, audubon_name, planted_states, variety_notes.` | `Optional: common_extra, audubon_name, planted_states, variety_notes, genus_common, arrangement.` |
| `2026-09-22-content-pipeline.md` | line 15111 | `--genera Acer,Quercus,Platanus,Liquidambar,Liriodendron --include ACPL,QURU,ACSA2,PLAC,QUPA2` | `--genera Acer,Quercus,Platanus --include ACPL,QURU,ACSA2,PLHI,QUPA2` |
| `2026-09-22-content-pipeline.md` | line 14101, the `edges-draft` skill | `channel is one of leaf, bark, fruit, flower, twig.` | `channel is one of leaf, bark, fruit, flower. In v0 only leaf, bark and fruit validate.` |
| `DESIGN.md` | §3, line 96, the end of the fruit list | `- Cone (woody / soft / fleshy)` | `- Cone (woody / soft / fleshy)` followed by a new line, `- Ball / aggregate head` |
| `DESIGN.md` | §17, line 580 | `deck is one card per level-1 concept in every channel present, 21 cards in v0.` | `deck is one card per level-1 concept in every channel present, 22 cards in v0.` |
| `2026-09-21-tree-id-app-design.md` | line 586 | `that is 21 cards: 8 leaf, 6 bark, 7 fruit.` | `that is 22 cards: 8 leaf, 6 bark, 8 fruit.` |
| `2026-09-22-content-pipeline-design.md` | §12, line 665 | `A concept run for the 21 level-1 categories of the leaf, bark, and` | `A concept run for the 22 level-1 categories of the leaf, bark, and` |
| `2026-09-22-content-pipeline-design.md` | §12, line 666 | `fruit channels. Target: 3 to 5 approved images per category, about 70 in total.` | `fruit channels. Target: 3 to 5 approved images per category, about 75 in total.` |
| `2026-09-22-content-pipeline.md` | line 15238, the `run init concepts_v0 --concepts` list | the list ends `,fruit/capsule,fruit/cone` | the list ends `,fruit/capsule,fruit/cone,fruit/ball` |

The plan's code already accepts `genus_common` and `arrangement` in `OPTIONAL_AUTHORED`,
so the fourth row changes the spec text only.

A note, not an edit: `content_dev/species.json` gives ACSA2 a `planted_states` value of
`["CO", "WY"]`. `content_dev/` is a fixture for the app tests. Its values are not content
and do not carry into `content/`.

---

## 11. What waits on the first run

- **The enumerated species list.** `cli species list` confirms every symbol, growth habit,
  state distribution and native status in section 3. Two state records look wrong and need
  a BONAP check: *Quercus virginiana* in Utah and *Quercus ajoensis* in Colorado. Both are
  out of the bucket either way.
- **QUMO.** Confirm the provisional out call for *Quercus mohriana*. Section 3.2 reads its
  leaves as entire to shallowly toothed from FNA vol. 3. The species-draft pass confirms
  that call.
- **Unit sizes.** `cli build` reports the card count for every unit. The four level-2 units
  warn by design. `simple_lobed_white_oaks_co` warns if any of its 5 oaks lacks a leaf
  photo.
- **A `plated` oak unit.** Section 6.3 puts 5 oaks in `plated`: QUMA3, QUGA, QUAL, QUST,
  QUHA3. A `plated_oaks_co` unit becomes possible once the QUHA3 bark pool is known.
  Without a QUHA3 card the unit holds 4 cards and warns.
- **The unverified planted states.** Utah for all six planted species, and Wyoming for
  ACSA2. Each needs a named city or state list before it enters `planted_states`.
- **PLHI.** The checklist confirms that the symbol exists and that PLANTS carries the
  common name "London planetree" for it.
- **The `ball` concept run.** Section 4 appends `ball` after `cone`. If `concepts_v0` has
  already run with 21 concepts, a follow-up concept run collects the `ball` photos through
  PLOC, PLHI and MAPO.

---

## 12. Decisions and their reasons

- **London plane stays, by an include exception.** The hybrid rule exists to keep the
  species list to what a field guide covers. London plane is one of the five urban trees
  the v0 set names, and a Denver learner meets it on the street. An exception for the
  include list is narrower than dropping the hybrid rule.
- **London plane ships as `PLHI`.** PLANTS holds two accepted species-rank records for it.
  `PLHI` carries a PLANTS common name, so `common` fills without `common_extra`. A species
  symbol is append-only once published, so the spec picks one symbol here.
- **Sweetgum and tuliptree leave v0.** Neither has a PLANTS record in the six states and
  neither is on the include list, so neither would reach a unit. Carrying them in the
  genera list only makes the run fetch species it then drops.
- **One six-state unit per group, not a region split.** Interior West holds 4 maples, 3
  white oaks and 2 red oaks, all under the floor. Merging two units later is cheap.
  Splitting a unit a learner has progress in is not.
- **The sycamores go in the maple unit.** Platanus holds 3 species on every channel. A
  sycamore leaf and a Norway maple leaf are the pair a beginner confuses, so the bundle
  puts them in the same deck.
- **Bark and fruit units ship for the oaks and the maples.** A species card that no unit
  holds never enters a session. Without these units the run's bark and fruit photos would
  reach the level-1 pools and the species screen only.
- **The bark bucket is set in this spec, not at draft time.** Section 6.3 names a source
  for every v0 species, reads a scaly surface as `plated`, and follows the mature trunk
  where young bark differs. The unit sizes are then fixed before the run, so
  `furrowed_genus` and `furrowed_oaks_co` need no forecast.
- **This spec accepts thin level-2 units.** A level-2 unit holds one card per genus, and
  these buckets hold one or two genera. The validator warns, which is a report line, not a
  failure. Removing the unit would leave the level-3 unit with no parent and no gate.
- **No level-4 unit.** No v0 run targets a variety key, and a variety card needs two
  varieties with photos. A level-4 unit would hold 0 cards.
- **`accept` and `description` are mandatory by review, not by code.** Nothing validates
  either field. A concept that loses `accept` is ungradeable at the typed tier, and the app
  reports no error.
- **`planted_states` follows a named list, not a guess.** A wrong value puts a species in a
  regional unit where the learner will never see it. An empty value costs one species in
  one unit. Leaving a state out is the cheaper mistake.
- **The exemplar symbols are verified, and `run init` checks them again.** The pass of
  2026-09-23 matched all 47 against PLANTS. `run init` is one command and it fails loudly
  on a bad symbol.
- **The fruit channel gains a `ball` concept.** The three sycamores are among the most-seen
  street trees in the region, and their fruit is their easiest winter mark. None of the
  seven existing fruit concepts names a head of many small dry fruits. Concept keys are
  append-only, so the addition is allowed. It costs one card in the placement deck and
  breaks no published key.
- **Edges are leaf-first.** 15 of the 21 edges that ship are leaf pairs, because
  `simple_lobed` is a leaf bucket and the leaf photos are the deepest pool. A bark or fruit
  edge ships only where the pair confuses on that channel too.
