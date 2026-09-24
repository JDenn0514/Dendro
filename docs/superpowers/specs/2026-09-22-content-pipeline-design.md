# Dendro content pipeline design

Date: 2026-09-22
Status: approved design, not yet built. The decision to publish reopened three parts:
where the approved images live, whether a content ID can be removed, and how a photo
comes down. Those three are revised here. The rest stands.
Source: `DESIGN.md` section 17, `docs/superpowers/specs/2026-09-21-tree-id-app-design.md`
(the app spec), the brainstorming session of 2026-09-22, the publishing session of
2026-09-22, and live checks of the data sources on 2026-09-22.

This spec covers the content pipeline. The pipeline builds the files under `content/`
that the app spec section 4 defines. The app reads those files and never writes them.
The content itself (the species set, the vocabularies, the edges) is a third spec.

Dendro is published for public use. The app stays local-first and static. People sign in
only to sync their progress across devices, through OAuth, with no password. A small
server the owner runs holds an append-only copy of the review log and answers analytics
queries. That server is its own spec. This spec names it only where it constrains the
content, in sections 4 and 11.

---

## 1. What the pipeline does

The pipeline produces:

- `content/species.json`
- `content/concepts.json`
- `content/confusion.json`
- `content/units.json`
- `content/images/manifest.json`

The approved image files are not in the repo. The pipeline uploads them to object storage
behind a CDN, and the manifest rows point at them. Section 7 gives the object keys and
section 13 the reason.

The pipeline never runs in the app, never runs in CI, and never runs on the server. It is
a local job the owner starts. CI runs only the content validator on what the pipeline
committed.

### Three kinds of worker

- **Scripts** do the mechanical steps: fetch from PLANTS, iNaturalist, and Wikimedia
  Commons within their rate limits, download and resize images, upload the approved ones,
  merge records, write manifest rows, compute unit sizes, render the report, and open the
  pull request.
- **Agents** do the judgment steps: approve photos, draft the authored species fields,
  draft confusion edges, and hunt by hand for photos the APIs do not hold. Each agent's
  instructions are a skill file in the repo, so a run next year uses today's rules.
- **The owner** reads escalations, drafted edges, and authored records in the pull
  request, and merges.

### Files that are authored, not generated

`concepts.json` (22 records in v0, stable) and `units.json` (a content decision) are
written by hand. The pipeline validates both and reports unit sizes.

### Decisions this spec inherits

These come from the app spec and `DESIGN.md` and are not re-opened here:

- USDA PLANTS is the taxonomic authority. The PLANTS symbol is the primary key. Growth
  habit must be "tree" or "tree, shrub". Hybrids are excluded.
- Photos are copied to storage the owner controls, never hotlinked, and resized to about
  1200 px on the long side. Every image has a source, an author, a license, and an origin
  URL. The license must permit redistribution. Section 7 says where the copy goes.
- Photo approval rules, the three escalation cases, and the quarter-escalation stop rule
  are in the app spec, section 4, under "Photo approval". Identity is trusted from the
  source page, never from image recognition.
- Confusion edges are drafted by an agent from a named reference and read by the owner
  before merge. The `ref` field names the source.
- Units are 5 to 25 cards. Validation warns outside that range.
- v0 content requirements are in the app spec, section 11.

---

## 2. Runtime and layout

**Node 24 with TypeScript**, run directly through Node's built-in type stripping. There is
no compile step. Syntax stays to the erasable subset: no enums, no parameter properties,
no namespaces. Tests run with `node --test`.

One `package.json` at the repo root, with dev dependencies only: `sharp` for image
resizing, an S3-compatible client for the uploads, and `@types/node`. The app keeps zero
runtime dependencies. `node_modules` is ignored by git, so GitHub Pages does not serve
it.

```
package.json
pipeline/
  cli.ts                  entry point: node pipeline/cli.ts <command> [flags]
  lib/
    http.ts               limiter, cache, User-Agent, 429 backoff
    plants.ts             PLANTS API and checklist parsing
    fna.ts                oak section table from Flora of North America
    inat.ts               taxon lookup, observation photos
    commons.ts            category listing and image info
    images.ts             download, strip EXIF, resize, hash
    storage.ts            object storage: upload by hash, head, delete
    species.ts            fetched layer, merge with authored layer
    candidates.ts         candidate rows, queue, dedupe, license allowlist
    manifest.ts           approved verdicts to uploads and manifest rows
    report.ts
    run.ts                branch, commit, push, draft PR through gh
  data/
    quercus_sections.json committed table, 90 rows, built from FNA
    plants_ids.json       committed map from PLANTS symbol to PLANTS id
  cache/                  ignored by git: raw responses, original images
  runs/<run>/
    run.json              the run's scope and species list
    candidates.jsonl      one row per candidate found
    verdicts.jsonl        one row per verdict
    decisions.json        owner decisions on escalations
    report.md
  tests/                  node --test, recorded fixtures, no network
content_src/
  species/<SYMBOL>.json   authored fields with ref
.claude/skills/
  content-run/            the orchestrating skill, one step per CLI command
  photo-check/            the approval agent
  species-draft/          authored species fields from named references
  edges-draft/            confusion edges from named references
```

The boundary between the pipeline and the app is the `content/` folder and the validator
module. The pipeline imports the validator from `app/logic/`. Nothing in `app/` imports
from `pipeline/`.

### Object storage

The approved images live in one bucket behind a CDN. The provider is not chosen yet. It
must offer an S3-compatible API and must charge nothing for egress. Cloudflare R2 and
Backblaze B2 both meet that. The bucket has two prefixes:

- `img/` holds the approved images. These objects are public and permanent.
- `review/` holds escalated candidates for the length of one review. A lifecycle rule
  deletes an object 30 days after it is written.

The access key and the bucket name come from the environment and are never committed.
The app holds the CDN base URL as a constant in `app/logic/` and builds each image URL
from that base and the manifest row's hash.

---

## 3. Data sources

Facts checked live on 2026-09-22. They fix what each source can and cannot supply.

### USDA PLANTS

- There is no documented public API. An undocumented JSON API at
  `https://plantsservices.sc.egov.usda.gov/api` answers anonymous requests. The profile
  page at `plants.usda.gov/plant-profile/<SYMBOL>` is an Angular shell and cannot be
  scraped.
- The complete checklist is one text file,
  `https://plants.sc.egov.usda.gov/DocumentLibrary/Txt/plantlst.txt`, about 7 MB and
  93,000 rows: symbol, synonym symbol, scientific name with author, common name, family.
- `GET /api/PlantProfile?symbol=QUGA` returns the PLANTS id, scientific name (with `<i>`
  tags and the author), one common name, rank, growth habits, native statuses, and the
  ancestor ranks including family.
- Native status is by region (`L48`, `AK`, `HI`, `PR`, `VI`), not by state.
- `GET /api/PlantSubordinateTaxa/<id>?offset=0` lists subspecies and varieties, each with
  its own symbol.
- Distribution by state and county is a POST:
  `POST /api/PlantProfile/getDownloadDistributionDocumentation` with body
  `{"MasterId": <id>}`. It returns CSV with columns Symbol, Country, State, State FIP,
  County, County FIP.
- `GET /api/PlantImages?plantId=<id>` returns image records with four size paths, a
  `Copyright` boolean, and the photographer's name in `CommonName`. Files are at
  `https://plants.sc.egov.usda.gov` plus the path. The PLANTS help document says
  non-copyrighted images are free for any use with acknowledgement.
- No rate limit is published.

### Oak section

PLANTS does not carry the section (red oaks, Lobatae; white oaks, Quercus; golden-cup
oaks, Protobalanus). Flora of North America does, on three server-rendered pages under
`http://www.efloras.org/browse.aspx?flora_id=1&start_taxon_id=` 302020, 302027, and
302029. That is 90 species in three GETs. The site's certificate is self-signed, so the
fetch uses `http://`. Wikidata and POWO do not carry the section.

### iNaturalist API v1

- `GET /v1/taxa?q=<scientific name>&rank=species&per_page=1` returns the taxon id and
  the iNat name.
- `GET /v1/observations` takes `taxon_id`, `quality_grade=research`,
  `photo_license=cc0,cc-by,cc-by-sa` (a comma list), `photos=true`, `order_by=votes`,
  `per_page`, `page`. Each photo carries `license_code`, `attribution`, and a `url`
  ending in `square.jpg`. Replace the last path segment with `small`, `medium`, `large`,
  or `original`.
- Phenology annotations filter with `term_id=12` and `term_value_id`. Fruiting is value
  14. The flowering value is read off a live observation at build time, because the
  `controlled_terms` endpoint did not answer.
- Limits, from the iNat recommended practices page: at most 100 requests per minute,
  keep to 60 or fewer, about 10,000 per day. Media downloads over 5 GB per hour risk a
  block. Over the limit returns HTTP 429. Set a custom User-Agent.

### Wikimedia Commons

- One call lists a category and returns image info:
  `action=query&generator=categorymembers&gcmtitle=Category:<name>&gcmtype=file
  &gcmlimit=50&prop=imageinfo&iiprop=url|extmetadata|mime|size&iiurlwidth=1280`
  with `iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|LicenseUrl`.
  Page with `gcmcontinue`. The anonymous limit is 50 titles per call.
- `Artist` and `ImageDescription` come back as HTML.
- Thumbnail widths are rounded to a fixed set: 960, 1280, 1920, 3840.
- Limits, from the Wikimedia rate limits page (2026): 10 requests per minute without a
  compliant User-Agent, 200 per minute with one. Keep concurrent requests to 3 or fewer.
  Over the limit returns 429 with `Retry-After`.

### Forest Service, NRCS, Bugwood

- `research.fs.usda.gov` (Silvics of North America, FEIS) disallows all crawlers in its
  `robots.txt`. Its photo credits are mixed and include third-party copyright. These
  pages can enter the pipeline only as a manual candidate the collector agent found in a
  browser and read by hand.
- NRCS photos are the PLANTS images above.
- Bugwood's API returns no license field. Bugwood is not a source.

---

## 4. Species record build

A species record has two layers. The **fetched layer** comes from the data sources by
script. The **authored layer** comes from `content_src/species/<SYMBOL>.json`. The build
merges them into `species.json`. On any field both hold, the authored value wins.

### Fetched layer, per PLANTS symbol

| Field | Source | Call and rule |
|---|---|---|
| `scientific`, `common[0]`, `family`, `genus` | PLANTS profile | `GET /api/PlantProfile?symbol=X`. Strip the `<i>` tags and the author. `genus` is the first word. |
| growth habit gate, hybrid gate | PLANTS profile | `GrowthHabits` must include `Tree`. A name that contains `×` is a hybrid and is dropped. |
| `native_status` | PLANTS profile | The `NativeStatuses` row for region `L48`: `N` gives `native`, `I` gives `introduced`. |
| `varieties` | PLANTS | `GET /api/PlantSubordinateTaxa/<id>`. Each row becomes `{ "key": symbol, "name": name }`. `note` is authored. |
| `range.states` | PLANTS | The distribution POST. Keep rows with Country `US`. Deduplicate the State column. |
| `section` | FNA table | Lookup in `pipeline/data/quercus_sections.json` when the genus is Quercus. Null otherwise. |
| `inat_taxon_id`, `inat_name` | iNat | `GET /v1/taxa?q=<scientific>&rank=species`. Take the first result. Set `inat_name` only when its name differs from PLANTS. No result gives null for both and a report line. |

`plantlst.txt` is used for two things only: to enumerate a run's species (every accepted
symbol in the run's genera) and to supply synonym symbols and names for the identity
check on photos.

### Species enumeration for a run

A run names `genera`, `states`, and an `include` list. `cli species list` lists every
accepted symbol in those genera from the checklist, fetches the profile and the
distribution for each, and keeps a species when all three hold:

1. Growth habits include `Tree`.
2. The name has no `×`.
3. At least one state in `range.states` is in the run's `states`, or the symbol is in
   `include`.

Every dropped species is kept in `run.json` with its reason. This list is the candidate
species list. Bucket membership is an authored field, so the list is filtered to the
run's bucket after the authored files exist.

### When a species enters species.json

A species is written to `species.json` only when its authored file exists and it has at
least one approved image, or a confusion edge names it. The rest appear in the report as
"not authored" or "authored, no photos". This matches the app spec rule that a record
with no images fails validation unless an edge names it.

A species that has entered `species.json` once never leaves it again, whatever its photo
count later becomes. The next subsection sets that rule.

### IDs are append-only

A card ID such as `species:QUGA:bark` is a foreign key in other people's data. It sits in
a stranger's review log, on their device and on the sync server, for months. An ID that
disappears from the content orphans that history. So:

- Card IDs, concept keys, bucket keys, and unit keys are append-only. None is renamed.
  None is removed.
- A species that leaves the pool keeps its record in `species.json` and gains
  `retired: true`, a `retired_reason`, and a `retired_at` date.
- An image that leaves the pool keeps its manifest row and gains the same three fields.
  Section 7 gives the command.
- A retired record is exempt from the rule that every record needs an image.
- The app skips a retired species when it builds a session, and skips a retired image
  when it draws from a channel pool. The ID still resolves, so an old review row still
  names something.

Section 11 gives the check that enforces this.

---

## 5. Authored content

### Authored species fields

One file per species, `content_src/species/<SYMBOL>.json`:

```json
{
  "concepts": { "leaf": "simple_lobed", "bark": "furrowed", "fruit": "acorn" },
  "common_extra": ["Rocky Mountain white oak"],
  "audubon_name": "Gambel Oak",
  "range": { "text": "Colorado Plateau and southern Rockies" },
  "planted_states": [],
  "elevation_ft": [5000, 9000],
  "height_ft": [15, 30],
  "habitat": "Dry slopes and foothills with pinyon and juniper",
  "variety_notes": { "QUGAG": "The widespread form." },
  "ref": ["Virginia Tech Dendrology fact sheet, Quercus gambelii",
          "FNA vol. 3, Quercus gambelii"]
}
```

Required: `concepts` with at least one channel, `range.text`, `elevation_ft`,
`height_ft`, `habitat`, `ref`. Optional: `common_extra`, `audubon_name`,
`planted_states`, `variety_notes`. The build appends `common_extra` after the PLANTS
common name to form `common`. The build fails when a required field is missing.

The `species-draft` skill drafts one file per species that lacks one. It reads, in order
of preference: the Silvics of North America chapter, the Virginia Tech dendrology fact
sheet, the FNA treatment, and Sibley. It writes the references it used into `ref`. The
owner reads each file in the pull request diff and edits it in place.

### Confusion edges

The `edges-draft` skill takes a bucket and the species list of a unit, and appends edges
in the app spec's shape to `content/confusion.json`, `ref` included. The v0 target is 15
to 25 edges for `simple_lobed`. The owner reads every edge in the pull request diff. The
validator rejects an edge whose `a` or `b` is not in `species.json`.

### Units and concepts

`content/units.json` and `content/concepts.json` are written by hand. `cli build`
computes each unit's membership with the app's own rules (states, genera, section,
include, exclude, in that order) and warns when a unit has fewer than 5 or more than 25
cards.

### License allowlist

One constant in `candidates.ts`, used by every source:

- public domain
- US government work
- CC0, any version
- CC BY, any version
- CC BY-SA, any version

NC and ND variants are excluded in v0. The owner can widen the list later if a channel
stays thin. An image whose license text does not match the list is never uploaded and
never gets a manifest row.

---

## 6. Photo candidates

`cli photos fetch <run>` finds candidates per species and per source and appends rows to
`runs/<run>/candidates.jsonl`. It skips any origin URL already in the file.

### Per source

**PLANTS.** `GET /api/PlantImages?plantId=<id>`. Keep rows with `Copyright: false`.
Download the original size. The channel hint comes from the part code in the filename,
through a small mapping table in `plants.ts`. The hint is null where the code is
unknown.

**Wikimedia Commons.** One call per page with `generator=categorymembers` on
`Category:<scientific name>`, 50 files per page. Keep JPEG files whose
`LicenseShortName` is in the allowlist. Author and description come from `Artist` and
`ImageDescription` with the HTML stripped. Download the 1280 px thumbnail, or the
original when it is smaller. The hint comes from keywords in the filename and the
description: bark, trunk, leaf, leaves, foliage, acorn, fruit, samara, cone, flower,
catkin, bud, twig.

**iNaturalist.** Three passes of `GET /v1/observations` with `taxon_id`,
`quality_grade=research`, `photo_license=cc0,cc-by,cc-by-sa`, `photos=true`,
`order_by=votes`, 50 per page, up to 4 pages:

1. No phenology filter. The hint is null.
2. `term_id=12` with the flowering value. Hint `flower`, tag `flowering`.
3. `term_id=12` with the fruiting value. Hint `fruit`, tag `fruiting`.

Download the `original` size. `author` is the iNat `attribution` string. The origin is
the observation page, not the photo file.

**Manual.** The collector agent appends a row by hand for a page it found in the
browser: the origin URL, the author and license text as shown on the page, the species
the page names, and the file it downloaded. Forest Service pages enter only this way.

### Candidate row

```json
{ "id": "<sha1 of origin>", "target": "QUGA", "source": "inat",
  "origin": "https://www.inaturalist.org/observations/12345",
  "file_url": "https://static.inaturalist.org/photos/.../original.jpg",
  "author": "(c) Lyrae, some rights reserved (CC BY)",
  "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
  "source_species": "Quercus gambelii",
  "channel_hint": null, "tags_hint": [],
  "local": "pipeline/cache/inat/<hash>.jpg", "file_hash": "<sha256 of bytes>",
  "fetched_at": "2026-09-22T15:04:00Z", "fetch_error": null }
```

`target` is a species symbol or, in a concept run, a concept key such as `bark/plated`.

### Caps and dedupe

- At most 60 candidates per species per run, across sources.
- Collection for a species and channel stops once that channel has 8 approved images.
- A second candidate with the same `file_hash` is dropped, whatever its source.

---

## 7. Approval

The `photo-check` skill reads every candidate with no verdict and dispatches subagents in
batches of 10. Each subagent reads the image file and the candidate row, then writes one
row to `verdicts.jsonl`:

```json
{ "candidate_id": "<id>", "verdict": "approve", "channel": "bark",
  "tags": ["winter"], "case": null,
  "note": "Bark fills the frame and is sharp. Source page names Quercus gambelii.",
  "checked_by": "photo_check_agent", "checked_at": "2026-09-22" }
```

`verdict` is `approve`, `reject`, or `escalate`. `case` is set only on an escalation:
`mismatch`, `license`, or `quality`.

### Rules

The rules are the app spec's, section 4, "Photo approval".

- **Channel.** The agent sets the channel from the fixed list, using the hint as a
  suggestion only. When no channel is clear, it rejects the image.
- **Quality.** Sharp. The subject fills the frame. No hand and no ruler in the shot.
  Below the threshold, escalate with `case: quality`.
- **License.** The license text on the row is in the allowlist and matches the source
  page. Otherwise escalate with `case: license`.
- **Identity.** The script first compares `source_species` to the species name, its
  PLANTS synonyms, and its iNat name, after normalization. On a match the identity check
  passes without agent work. On a difference the agent reads the source page. When the
  names still differ, escalate with `case: mismatch`.

The agent never sets or changes the species from what it sees in the photo.

### Stop rule

After each batch, when 20 or more candidates in the run have a verdict and more than a
quarter of them are escalations, the skill stops and writes the reason to the report. The
run resumes only after the owner changes the source list or the threshold and re-runs.

### Escalations and decisions

Every escalation appears in the report with the image inline, the source link, the case,
and the note. The owner writes `runs/<run>/decisions.json`:

```json
{ "<candidate id>": { "decision": "approve", "channel": "bark", "note": "Trunk of the tagged tree." },
  "<candidate id>": { "decision": "reject", "note": "Two species in frame." } }
```

`cli run finish` turns each decision into a verdict row with `checked_by: owner`.

### Approved images

For each approved verdict, `manifest.ts`:

1. Reads the cached original.
2. Strips all EXIF data. This removes GPS coordinates and camera data.
3. Resizes to 1200 px on the long side, JPEG quality 82. An original smaller than 1200 px
   is kept at its size.
4. Takes the sha256 of the resized bytes and uploads the file to object storage as
   `img/<sha256>.jpg`. The hash is the whole key, for a species target and a concept
   target alike. A `HEAD` that finds the key skips the upload.
5. Appends a manifest row. The row carries `hash` in place of the old `file` path and
   keeps `target` and `channel` as before. `source` is the source name, `author` the
   row's author, `license` the row's license text, `origin` the origin URL, `tags` the
   verdict's tags, and `checked_by`, `checked_at`, and `note` come from the verdict.

A rejected or escalated candidate is never uploaded to `img/` and never gets a manifest
row.

The app spec's `images/manifest.json` section shows the same `hash` row and says the
images are in object storage. The two specs agree on this shape.

### Retiring an image

A public site with several hundred third-party photos will get an email that asks for one
photo to come down. `cli images retire <hash> --reason "<text>"`:

1. Deletes `img/<hash>.jpg` from the bucket.
2. Sets `retired: true`, `retired_reason`, and `retired_at` on the manifest row. The row
   stays. The hash stays.
3. Runs the validator and commits.

This is the retire mechanism of section 4, applied to one image. The app then draws from
the rest of that channel's pool. When the retirement empties one channel, the species
loses that card and keeps the others. When it empties every channel, the species retires
under section 4.

Two manifest rows can share a hash, because duplicate bytes collapse into one object. The
command retires both rows. A takedown removes the photo everywhere it was used.

---

## 8. Run flow

A run is one scope of content: a bucket, a set of states, a set of channels, and a
species seed. The `content-run` skill walks the steps below. Every CLI command reads what
earlier steps wrote and skips finished work, so a stopped run resumes with the same
command.

1. `cli run init <name> --bucket <b> --states <list> --genera <list> --include <list>
   --channels <list>` creates the branch `content/<name>` from `main` and writes
   `runs/<name>/run.json`.
2. `cli species list <name>` enumerates the species (section 4) and writes them into
   `run.json`, with the exclusion reason for each dropped species.
3. The `species-draft` skill writes an authored file for each species that lacks one.
   The list is then filtered to the bucket.
4. `cli photos fetch <name>` fills `candidates.jsonl` and the cache.
5. The `photo-check` skill writes `verdicts.jsonl`. The stop rule applies.
6. `cli build <name>` merges species records, uploads approved images, writes manifest
   rows, runs the validator, computes unit sizes, and writes the gap list per species
   and channel into the report data.
7. The collector reads the gap list and hunts by hand for the thin channels, appends
   manual candidates, and steps 5 and 6 run again.
8. The `edges-draft` skill writes edges for the run's units.
9. `cli report <name>` writes `report.md`. `cli run pr <name>` commits, pushes, and
   opens a draft pull request with the report as its body, through `gh pr create`.
10. The owner reviews in the pull request. They write `decisions.json` for escalations
    and edit authored files or edges in place. `cli run finish <name>` applies the
    decisions, rebuilds, re-renders the report, and pushes. CI validates. The owner marks
    the pull request ready and merges.

The CLI commits on the branch at the end of steps 2, 4, 6, 8, and 9, so the pull request
history shows each stage. Agents commit nothing.

### Concept runs

A concept run uses `--concepts <list>` in place of `--bucket`. Its `run.json` lists
exemplar species per concept. Candidates target the concept key, such as `bark/plated`.
No species record is written. The species-draft and edges-draft steps are skipped.

### Committed run records

`candidates.jsonl`, `verdicts.jsonl`, `decisions.json`, and `report.md` are committed
with the run. They are the audit trail: which photo was seen, what was decided, and why.
A later run reads earlier verdicts and does not re-judge a candidate it already has.

---

## 9. Report

`runs/<run>/report.md` has five parts, all tables. It is committed and is the draft pull
request body.

- **Species.** Every species in the run, its status (dropped with reason, not authored,
  authored with no photos, in `species.json`), and the approved image count per channel.
- **Channel gaps.** Species and channel pairs with fewer than 4 approved images, sorted
  by count, lowest first.
- **Units.** Each unit the run touches, its computed card count, and a flag when the
  count is outside 5 to 25.
- **Escalations.** One row each: the image inline, the source link, the case, and the
  agent's note. The branch holds no image bytes, so `cli report` uploads each escalated
  candidate to the `review/` prefix and links that copy. The lifecycle rule deletes the
  copy 30 days later. The section is empty once decisions are applied.
- **Run counts.** Candidates per source, verdicts by kind, fetch failures, and whether
  the stop rule fired.

---

## 10. HTTP layer

Every network call goes through `http.ts`.

- **Limiter.** One token bucket per host: PLANTS 1 request per second, iNat 1 per
  second, Commons 2 per second with at most 3 in flight. Image downloads share the
  host's bucket.
- **User-Agent.** One string on every request: `dendro-pipeline/<version> (<contact
  URL>)`. Without it Commons drops to 10 requests per minute. Wikimedia's policy expects
  that address to reach a person who can answer. A real address must be set before the
  first public run. A placeholder will not do.
- **429.** Sleep for `Retry-After`, or 30 seconds when the header is absent, then retry.
- **5xx and network errors.** Retry three times with doubling waits (2, 4, 8 seconds).
  Then record the failure on the candidate or species row and continue. The report lists
  failures.
- **404.** Record once. Do not retry.
- **Cache.** Every response is written under `pipeline/cache/<host>/<url hash>` with the
  fetch time. Lifetimes: 30 days for PLANTS and FNA, 7 days for iNat and Commons
  listings, no expiry for image bytes. `--refresh` on any command bypasses the cache for
  that command. The folder is ignored by git.
- **Committed tables.** `quercus_sections.json` is built once by `cli data sections` and
  committed. `plants_ids.json` grows as species are fetched and is committed with each
  run.

The raw cache is not committed, for four reasons: GitHub Pages serves whatever is in the
repo, the cache holds photos the license check rejected, raw iNat responses carry
observer names and coordinates, and git history would grow on every run. The approved
images now leave the repo as well (section 7), and that weakens none of the four. The
cache belongs in neither the repo nor the bucket.

---

## 11. Validation, tests, and errors

### Validation

`cli build` imports the app's validator module and runs it on `content/` before it
commits. A build that fails validation writes nothing to `content/`, uploads nothing, and
prints the failures. CI runs the same validator on the branch, so a pull request cannot
merge with invalid content.

### The append-only check

One more check runs beside the validator, in `cli build` and in CI. It reads the last
published content with `git show main:content/species.json` and the same for the other
three files. It collects every ID: species symbols, variety keys, concept keys, bucket
keys, unit keys, and manifest hashes. Every one of them must still be present in the new
content. A missing ID fails the build. A record marked `retired: true` counts as present.
The check is skipped on the first run, when `main` holds no content yet.

### Tests

Under `pipeline/tests/`, run with `node --test`, no network. Fixtures are recorded
responses under `pipeline/tests/fixtures/`. A fake storage client stands in for the
bucket.

- `http`: the limiter spaces requests with a fake clock; 429 honors `Retry-After`; the
  cache hits, misses, and expires by host lifetime; `--refresh` bypasses the cache.
- `plants`: the profile parser strips tags and the author; a shrub-only habit is
  dropped; a `×` name is dropped as a hybrid; the distribution CSV yields unique US
  states; region L48 maps `N` to `native` and `I` to `introduced`.
- `fna`: the three section pages parse to 90 species with the right section each.
- `commons` and `inat`: parsers on fixtures; the license allowlist admits and rejects
  each listed license; hints map from keywords, part codes, and phenology values.
- `species`: the merge lets authored values win; a missing required authored field
  fails; a species with no image and no edge is left out of `species.json`.
- `candidates`: duplicate origin URLs and duplicate file hashes are dropped; the
  per-species cap holds; the per-channel stop at 8 approved holds.
- `manifest`: the object key is the sha256 of the resized bytes; a second run over the
  same verdicts uploads nothing and adds no row; two candidates with the same bytes give
  one object and two rows; the row shape matches the app spec; a rejected candidate
  uploads nothing; EXIF is stripped; the long side is 1200 px.
- `ids`: the append-only check fails when a symbol in the last published `species.json`
  is gone; it passes when that symbol is there with `retired: true`; it passes when
  `main` holds no content.
- `retire`: `cli images retire` deletes the object, keeps the manifest row, and writes
  the reason and the date; two rows that share a hash both retire.
- `verdicts`: the stop rule fires above a quarter at 20 or more judged, and not below;
  an owner decision becomes a verdict row with `checked_by: owner`.
- `report`: rendered from a fixture run and compared to a stored file.

### Errors that stop a run

- An unknown PLANTS symbol in `include`.
- A `run.json` that fails its own schema.
- The quarter-escalation stop.

Everything else is recorded on the row it belongs to and listed in the report.

---

## 12. v0 runs

Two runs meet the app spec's section 11.

**`concepts_v0`.** A concept run for the 22 level-1 categories of the leaf, bark, and
fruit channels. Target: 3 to 5 approved images per category, about 75 in total. Its
`run.json` lists two or three exemplar species per category.

**`simple_lobed_co`.** Bucket `simple_lobed`. States CO, UT, NM, WY, NE, KS. Genera
Acer, Quercus, Platanus, Liquidambar, Liriodendron. Include: the planted species Norway
maple, red oak, silver maple, London plane, and pin oak, by their PLANTS symbols,
confirmed against the checklist at `run init`. Channels leaf, bark, fruit. Edge target 15
to 25.

---

## 13. Decisions and their reasons

- **Node with TypeScript, type-stripped, no build.** One runtime for the app tests, the
  validator, and the pipeline. The validator is imported, not copied. Type stripping
  keeps the app spec's no-build rule.
- **Two layers for a species record.** The fetched layer can be refreshed from PLANTS
  without touching the authored text, and the authored text can be edited without a
  fetch. Mixing them in `species.json` would make every refresh a manual diff.
- **Agents draft, the owner reads.** The same rule the app spec set for edges. The
  reference in `ref` is what makes the owner's read fast: they check a claim against a
  named page, not against memory.
- **Hint, then the agent assigns the channel.** iNat has no bark annotation. Bark and
  twig are the thin channels, and metadata alone would drop nearly all of their photos.
  The app spec already trusts the agent's eyes for channel and quality.
- **Agents run the pipeline, scripts do the mechanics.** API paging, rate limits,
  resizing, and manifest rows are the same every time and should not spend tokens or
  depend on an agent remembering a limit. Hunting for a bark photo on a Forest Service
  page is judgment and a browser, and only an agent does that.
- **Skills, not a one-time plan, hold the agent instructions.** The plan is run once and
  builds the pipeline. The pipeline runs once per bucket or region. Each run's agents
  need the same rules as the last run's.
- **Branch and draft pull request.** One review surface for edges, authored records, and
  escalations, with a diff view. CI validates before anything reaches `main`, and `main`
  deploys.
- **A `pipeline/` folder in this repo.** The validator is shared and the pull request is
  in-repo. The report no longer links to images on the branch; it links to the review
  prefix in the bucket, as section 9 says.
- **Approved images in object storage, not in git.** v0 is about 610 approved images: 70
  concept images, plus roughly 30 species across 3 channels at up to 6 images each. At
  1200 px and quality 82 each runs about 250 KB, so about 150 MB. Git keeps every version
  of every binary forever, so one re-encode doubles that. Delivery is the harder limit. A
  20-card session with four options per question loads about 80 images, near 20 MB.
  GitHub Pages allows about 100 GB a month, which is 4,000 to 5,000 sessions. That
  ceiling is too low for a public site. A CDN with no egress charge lifts it and keeps
  the repo small enough to clone.
- **Objects keyed by the sha256 of the resized bytes.** The old `NNN.jpg` numbering had
  to read the folder to find the next free number, so an upload that died halfway left a
  manifest row pointing at nothing. A hash key is idempotent: the retry writes the same
  key, and duplicate bytes collapse into one object on their own. `target` and `channel`
  stay on the manifest row, where a query reads them. The key carries no meaning.
- **IDs are append-only.** Once progress syncs, a card ID is a foreign key in other
  people's data, held for months on their devices and on the server. Dropping a species
  when its last photo goes would orphan real review history, with no error anywhere, and
  would skew every analytics query that reads it. `retired: true` costs one field and
  keeps the history readable.
- **A takedown command.** Several hundred third-party photos will produce an email that
  asks for one to come down, and the answer has to be same-day. `cli images retire` makes
  that one command against the bucket rather than a rebuild and a deploy. It keeps the
  manifest row, so the audit trail still shows what was published, by whom, under what
  license, and when it came down.
- **Raw cache ignored, run records committed.** The records are the audit trail and a
  few KB per species. The raw cache would be served by Pages, would redistribute
  rejected photos, and would hold observer data.
- **Markdown report as the pull request body.** GitHub renders it, it lives in the repo
  after merge, and the quarter-stop rule keeps the escalation list short enough for a
  table.
- **NC and ND excluded in v0.** Fewer license readings to get wrong while the pool is
  small. The list is one constant and can widen.
- **EXIF stripped.** Photographers' GPS coordinates do not belong in a public repo.
- **Forest Service by manual candidate only.** The site disallows crawlers and its
  credits are mixed. A person reading the page is the only way to know the license.
- **FNA for the oak section, as a committed table.** Three pages, 90 rows, unchanged
  since 1997. Fetching it on every run would be waste.
