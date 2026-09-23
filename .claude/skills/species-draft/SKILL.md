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
  Every key in the file is a valid value.
- `range`: an object with a non-empty `range.text`, one short phrase that names the range.
  The states come from the PLANTS distribution, not from you.
- `elevation_ft`: two numbers, low then high. The first must not exceed the second.
- `height_ft`: two numbers, low then high. The first must not exceed the second.
- `habitat`: one non-empty sentence.
- `ref`: a non-empty list of non-empty strings. Each string names one reference you read.

**Optional fields.** Leave a field out when you have nothing for it. A field the list
below does not name fails the build, so check a name before you write it.

- `common_extra`: extra common names. The build appends them after the PLANTS common name.
- `audubon_name`: the name the Audubon guide uses.
- `genus_common`: the common word for the genus, lower case and singular, such as `oak` or
  `maple`. The app labels a genus group with it.
- `arrangement`: the leaf arrangement the reference states, such as `alternate` or
  `opposite`. The species screen prints it as a fact.
- `planted_states`: states where the species is planted but not native.
- `variety_notes`: an object keyed by variety symbol, with one note each.

## The reference order

Read in this order of preference and stop when you have the fields:

1. The Silvics of North America chapter for the species.
2. The Virginia Tech dendrology fact sheet.
3. The Flora of North America treatment.
4. Sibley.

## The two rules that matter most

**`ref` names what you actually read.** Write the reference you opened, with enough detail
to find it again: the guide, the volume or the page, and the species. Do not list a
reference you did not read. The owner checks each claim against the named page. A wrong
`ref` wastes their time and hides an error.

**Never invent a number you did not read.** `elevation_ft` and `height_ft` come from a
reference. When no reference gives a number, say so to the owner and leave the file
undrafted. A guessed number reads exactly like a checked one, and the owner cannot tell
them apart.

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
