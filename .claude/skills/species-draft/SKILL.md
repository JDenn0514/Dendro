---
name: species-draft
description: Use when drafting the authored species files under `content_src/species/` for a Dendro content run.
---

# Species draft

You draft one file per species that lacks one. The file holds the authored layer of a
species record. A script fetches the rest from USDA PLANTS and iNaturalist.

## What to draft

1. Read the run's species list from `pipeline/runs/<name>/run.json`, field `species`.
2. For each symbol, check whether `content_src/species/<SYMBOL>.json` exists.
3. Draft one file for each symbol that has no file. Leave the existing files alone.

4. For each file you draft, write one entry in `pipeline/runs/<name>/look_for.json` (see
   **The look-for lines** below).

`<SYMBOL>` is the USDA PLANTS symbol, in upper case, such as `QUGA`.

## The file shape

```json
{
  "concepts": { "leaf": "simple_lobed", "bark": "furrowed", "fruit": "acorn" },
  "range": { "text": "Colorado Plateau and southern Rockies" },
  "elevation_ft": [5000, 9000],
  "height_ft": [15, 30],
  "habitat": "Dry slopes and foothills with pinyon and juniper",
  "ref": ["Virginia Tech Dendrology fact sheet, Quercus gambelii",
          "FNA vol. 3, Quercus gambelii"],
  "common_extra": ["Rocky Mountain white oak"],
  "audubon_name": "Gambel Oak",
  "genus_common": "oak",
  "arrangement": "alternate",
  "planted_states": [],
  "variety_notes": { "QUGAG": "The widespread form." }
}
```

**Required fields.** The build prints an error and stops when one is missing or malformed.

- `concepts`: an object with at least one channel. The key is the channel, such as `leaf`.
  The value is the `key` of a row in `content/concepts.json` whose `channel` equals that
  channel. Read that file and copy the key. A concept row has `key`, `channel`, `name`,
  `accept`, and `description`, and nothing else; there is no level field and no nesting.
  Every key in the file is a valid value. See **The leaf bucket** below.
- `range`: an object with a non-empty `range.text`, one short phrase that names the range.
  The states come from the PLANTS distribution, not from you.
- `habitat`: one non-empty sentence.
- `ref`: a non-empty list of non-empty strings. Each string names one reference you read.

**Optional fields.** Leave a field out when you have nothing for it. A field the list
below does not name fails the build, so check a name before you write it.

- `height_ft` and `elevation_ft`: see **Height and elevation** below.
- `common_extra`: extra common names. The build appends them after the PLANTS common name.
- `audubon_name`: the name the Audubon guide uses.
- `genus_common`: the common word for the genus, lower case and singular, such as `oak` or
  `maple`. The app labels a genus group with it.
- `arrangement`: the leaf arrangement the reference states, such as `alternate` or
  `opposite`. The species screen prints it as a fact.
- `planted_states`: states where the species is planted but not native.
- `variety_notes`: an object keyed by variety symbol, with one note each.

## Height and elevation

Write the form that matches what the references give:

| The references give | Write | The species screen shows |
|---|---|---|
| A low and a high height | `"height_ft": [30, 40]` | 30–40 feet tall |
| Only a maximum height | `"height_ft": [null, 40]` | Up to 40 feet tall |
| A low and a high elevation | `"elevation_ft": [0, 2000]` | 0–2,000 feet elevation |
| One elevation | `"elevation_ft": 6600` | About 6,600 feet elevation |
| No number | Leave the field out | Nothing; the row is hidden |

- The low number must not exceed the high number.
- A height is greater than zero. An elevation can be below zero, below sea level.
- Height takes no single number. Write `[null, high]` for a maximum.
- Elevation takes no `null`. Write one number, or leave the field out.
- When a reference gives metres, convert to feet and round to the nearest 100 ft. For
  example, 2,300 m is 7,546 ft, so write 7500.

Use a partial form or leave a field out only when no reference in **The reference order**
gives the number. Tell the owner which species and which field, and which references you
read. See **Never invent a number you did not read** below.

## The leaf bucket

The `leaf` bucket follows the typical mature leaf. Do not choose the bucket from a young
leaf, a sucker shoot, or a rare form.

- *Quercus arkansana* has leaves that are "entire, or with 2 to 3 shallow lobes". It goes
  to `simple_entire`, with the lobed leaf as a variant.
- *Quercus nigra* has lobes only on young leaves. It goes to `simple_entire`.

Record the other leaf forms of the species as variants, in your report to the owner only.

- Do not write a variant in the `leaf` look-for line. The `photo-check` skill approves a
  photo that shows the look-for traits, so a variant there lets in a photo of the wrong
  bucket. The line names the typical mature leaf only.
- The species file has no field for variants. Do not add one.

## The look-for lines

The `photo-check` skill reads these lines. It judges whether a photo shows the traits they
name. The file holds one entry per species symbol:

```json
{
  "QUMA2": {
    "leaf": { "text": "...", "ref": "..." },
    "bark": { "text": "...", "ref": "..." },
    "fruit": { "text": "...", "ref": "..." }
  }
}
```

- Write one line for each channel in the run's channel list, `channels` in `run.json`.
- `text` is one or two short sentences. It names traits that a person can see in a photo:
  the shape, the lobes, the arrangement, the needles per bundle, the bark pattern, the
  fruit shape and size. Do not name a trait that needs a lens or a lab.
- `ref` names the reference you read for the line, with the same detail as a string in the
  species file's `ref`.
- When `pipeline/sources/<SYMBOL>.json` exists, write the lines from its text first. That
  folder does not always exist. Otherwise, use the references in **The reference order**
  below.
- When the file exists, add your entries to it. Keep the entries that are already in it.
- Do not put the lines in `content_src/species/<SYMBOL>.json`. The build fails an unknown
  field there.

The rule **`ref` names what you actually read** holds for these lines too.

## The reference order

Read in this order of preference and stop when you have the fields:

1. The Silvics of North America chapter for the species.
2. The Virginia Tech dendrology fact sheet.
3. The Flora of North America treatment.
4. Sibley.

When these four do not give a field, read these further references:

- wildflower.org (Lady Bird Johnson Wildflower Center).
- NC State Extension Plant Toolbox (plants.ces.ncsu.edu).
- Trees and Shrubs Online.
- NatureServe Explorer.
- USFS Fire Effects Information System (FEIS).
- Jepson eFlora, for a California species.
- Missouri Botanical Garden Plant Finder, for a planted tree.
- Go Botany, for a New England species.

## The two rules that matter most

**`ref` names what you actually read.** Write the reference you opened, with enough detail
to find it again: the guide, the volume or the page, and the species. Do not list a
reference you did not read. The owner checks each claim against the named page. A wrong
`ref` wastes their time and hides an error.

**Never invent a number you did not read.** `elevation_ft` and `height_ft` come from a
reference. When no reference gives a number, leave out the field or the low value, as
**Height and elevation** shows, and tell the owner. A guessed number reads exactly like a
checked one, and the owner cannot tell them apart.

The same rule holds for `habitat` and `range.text`. Write what the source says, in your own
short words.

## What this skill does not do

- It does not overwrite a file that already exists.
- It does not write any fetched field: `scientific`, `common[0]`, `family`, `genus`,
  `native_status`, `varieties`, `range.states`, `section`, `inat_taxon_id`, or `inat_name`.
  A script fetches those, and an unknown field fails the build.
- It does not edit `content/species.json`. The build writes that.
- It does not write confusion edges. The `edges-draft` skill does that.
- It does not commit.
