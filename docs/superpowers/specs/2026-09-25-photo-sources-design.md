# Photo sources: design

Date: 2026-09-25. Branch: `sources`. Plan: `docs/superpowers/plans/2026-09-25-photo-sources.md`.
Ledger: `.superpowers/sdd/2026-09-25-photo-sources/progress.md` (local, not in git).

## Goal

A species run needs fewer photo rows added by hand with `photos add`. Run 1 (19 species) needed 54 hand-added rows. The concept run needed 78. This change adds four photo sources:

| Source | Kind | Why this kind |
|---|---|---|
| Bioimages (bioimages.vanderbilt.edu) | fetch source | Plain Node HTTP works (checked 2026-09-25). |
| Trees and Shrubs Online (TSO) | fetch source | Plain Node HTTP works (checked 2026-09-25). |
| Lady Bird Johnson Wildflower Center (wildflower.org) | fetch source | Plain Node HTTP works (checked 2026-09-25). Added by owner ruling, see below. |
| Kew Plants of the World Online (POWO) | browser harvest | Kew returns a Cloudflare challenge (403) to Node, to WebFetch, and to headless Playwright. The built-in browser gets the page. |

It also moves the two scratchpad harvest scripts (`harvest.cjs`, `mkadds.cjs`) into `pipeline/scripts/`.

## Decisions

The task brief set these. Nobody re-opens them in this work.

- The licence allowlist is: public domain, US government work, CC0, CC BY any version, CC BY-SA any version. NC and ND are out. The check is per image where the site licenses per image.
- Colour photographs only. The fetch measures each download with `chromaOf` (`pipeline/lib/chroma.ts`) and drops a row under `MONO_THRESHOLD = 3` (`pipeline/lib/candidates.ts`). `photos add` refuses a monochrome image and a duplicate candidate id. `photos audit` exists. This work reuses all of it.
- A harvester puts an image fragment (`#image=...`) on an origin page that holds many images, because the candidate id is `sha1(target|origin)`.
- A sepia, toned, or filtered image is a reviewer escalation (`--case quality`), not a fetch rule.
- Exports listed in the plan stay, even when nothing uses them. Names that exist only in TypeScript are camelCase. Fields that land in JSON are snake_case.
- The cap refill loop for dropped rows is deferred.
- `collect`, `MAX_PER_SPECIES = 60`, and `candidateId` do not change.

The owner made four rulings during this work (2026-09-25):

1. **wildflower.org is a source.** Its policy (`https://www.wildflower.org/gallery/policy.php`, read 2026-09-25) allows non-commercial use only. The credit must name the photographer and the Center. The owner has written permission from the Center for this project, for non-commercial use. This is the one exception to the allowlist. The exception is keyed to the site and to one exact licence label.
2. **POWO is an agent harvest in the built-in browser.** Kew's `robots.txt` has `User-agent: claudebot` and `User-agent: Claude-Web` with `Disallow: /`, and `crawl-delay: 10`. The owner saw this and chose the browser harvest. The harvest loads one Kew page at a time, 10 seconds apart at the least. It never tries to pass a challenge page.
3. **POWO herbarium sheets are skipped.** The harvest emits photographs only.
4. **The fetch takes turns by source.** See "Fetch order". The owner proposed turns, or Bioimages and wildflower.org first. The design uses turns, with the owner's quality order inside each round.

## Shared changes

### Source keys and names

`SOURCE_KEYS` and `SOURCE_NAMES` in `pipeline/lib/candidates.ts` get three new keys. The display names match the rows already in `content/images/manifest.json`.

| Key | Display name (`source`) |
|---|---|
| `bioimages` | `Bioimages` |
| `tso` | `Trees and Shrubs Online` |
| `wildflower` | `Lady Bird Johnson Wildflower Center` |

POWO rows come in through `photos add`, so they keep `source_key: 'manual'`. Their `--source` is `Plants of the World Online (Kew)`.

The app prints a credit as `<author>, <source>, <license>.` (`app/screens/species.js:25`, `app/screens/session.js:31`). Each source maps its credit to fit that line.

### Licences

`licenseAllowed(text)` (`pipeline/lib/candidates.ts`) does not change. `pipeline/lib/licenses.ts` gets these additions:

- `licenseLabelFromUrl(url: string | null): string | null` maps a Creative Commons URL to a label. For example, `https://creativecommons.org/licenses/by-sa/4.0/` gives `CC BY-SA 4.0`, `.../licenses/by-nc/3.0/` gives `CC BY-NC 3.0`, `.../publicdomain/zero/1.0/` gives `CC0 1.0`, and `.../publicdomain/mark/1.0/` gives `Public Domain Mark 1.0`. Any other URL gives null. The label then goes through `licenseAllowed`, so an NC or ND label still fails.
- `LICENSE_PERMISSIONS`: a list of written permissions. Each entry has `label`, `hosts`, `granted`, `scope`, and `record`. This work adds one entry:
  - `label`: `used with permission, non-commercial`
  - `hosts`: `['www.wildflower.org']`
  - `granted`: `2026-09-25`
  - `scope`: `non-commercial`
  - `record`: `docs/decisions/2026-09-25-wildflower-permission.md`
- `licenseAllowedAt(license: string, origin: string): boolean` returns true when `licenseAllowed(license)` is true, or when the licence equals an entry's `label` exactly and the origin's host is in that entry's `hosts`.

Every place that checks the licence of one row changes from `licenseAllowed` to `licenseAllowedAt`, with the row's origin. This covers `photos add` and any build or validate step that checks licences again. The plan lists each call site. A search for "used with permission, non-commercial" in the manifest then finds every image that rests on the permission. That is the first step if Dendro ever goes commercial.

`docs/decisions/2026-09-25-wildflower-permission.md` records the ruling: the policy quote, the scope, the date, and a line for the owner to add the date and the sender of the permission email.

### HTTP hosts

`pipeline/lib/http.ts` gets an entry for each new host. A host with no entry falls back to 1 request per second and a 7-day cache. The plan confirms that a rate below 1 works in the limiter.

| Host | Requests per second | In flight | Cache days | Why |
|---|---|---|---|---|
| `raw.githubusercontent.com` | 1 | 1 | 30 | The Bioimages catalogue is 12 MB and last changed 2024-04-24. |
| `zenodo.org` | 0.5 | 1 | default | Bioimages files. Zenodo allows guests 60 requests a minute. |
| `www.treesandshrubsonline.org` | 1 | 1 | 30 | No robots.txt (404). |
| `www.wildflower.org` | 1 | 1 | 3650 | The policy allows 1 request per second at most. It also asks apps to store pages and not ask for them again. |
| `d2seqvvyy3b8p2.cloudfront.net` | 0.2 | 1 | default | POWO image files for `photos add`. Kew asks for low rates. |

### Fetch order

Today `photosFetch` (`pipeline/lib/commands.ts`) builds each symbol's rows as Commons, then iNaturalist, then PLANTS, and `collect` takes rows in that order up to 60. In run `simple_lobed_co`, most targets reached 60 rows from Commons and iNaturalist alone. QUGA had 58 Commons rows. A source placed after iNaturalist would get no rows.

The new order for one symbol:

1. The turn sources give one row each per round, in this order: Bioimages, wildflower.org, TSO, Commons, iNaturalist. A source that runs out drops out of the rounds. The existing `interleave` function does this.
2. PLANTS rows follow, after all turn rows.

The rows for all symbols of a target then go through `interleave` and `mergeFound` as today. `collect` does not change. With 60 slots and five turn sources, each source gets about 12 slots before a source runs out. Small sources (Bioimages has about 10 QUGA images, TSO about 5) get all their rows in. The photo reviewer then picks the best images. There is no quota per source at review.

### Fetch report

The last line of `photos fetch` names the appended rows per source, for example `by source: bioimages 10, wildflower 12, tso 5, commons 17, inat 16, plants 0`. The count is taken after the chroma drop, so it counts the rows in `candidates.jsonl`.

## Bioimages (fetch source)

Module: `pipeline/lib/bioimages.ts`.

- **Catalogue.** `https://raw.githubusercontent.com/baskaufs/Bioimages/master/images.csv`. The file is pipe-delimited (`|`), with no quoting, a header row, and 40 columns. The module reads columns by header name. It parses the catalogue once per process and keeps it in memory.
- **Taxon.** No column holds the name. The module takes the text of `dcterms_title` before the first ` (`. Example: `Quercus gambelii (Fagaceae) - fruit - as borne on the plant`. It normalises the name: Unicode NFC, `×` becomes ` x `, runs of spaces collapse, trim, lower case. A row matches when the result equals one of the target's names (the scientific name and the PLANTS synonyms), normalised the same way.
- **Skip rules.** The module skips a row with a non-empty `suppress` value other than `0`, and a row with no file URL.
- **Licence.** `usageTermsIndex` maps to a label: 0 `CC0 1.0`, 1 `CC BY 4.0`, 2 `CC BY-SA 4.0`, 3 `CC BY-NC 4.0`, 4 `CC BY-NC-SA 4.0`. The mapping comes from `license.xml` in the same repository. The label then goes through `licenseAllowed`. An unknown index skips the row. `license_url` is the matching Creative Commons URL. In the catalogue today, 12,417 rows are CC BY 4.0, 3,816 are CC BY-NC-SA 4.0 (out), and 8 are CC0.
- **Credit.** `author` is the text of `photoshop_Credit` before ` http`, trimmed (for example `Steven J. Baskauf`). If that is empty, `xmpRights_Owner` is used. A row with no author is skipped.
- **Origin.** `ac_attributionLinkURL`, as it is (for example `http://bioimages.vanderbilt.edu/baskauf/14133.htm`). Each image has its own page, so no fragment is needed. This matches the 27 Bioimages rows in the manifest.
- **File.** `ac_hasServiceAccessPoint`, the Zenodo original (median width 2160 px). The build resizes to `MAX_SIDE = 1200`.
- **Hints.** `channel_hint` is `channelHint` of the title text after the name. `source_species` is the name from the title, as written.

## Trees and Shrubs Online (fetch source)

Module: `pipeline/lib/tso.ts`.

- **Licence.** The site states one licence for all its content: "licensed under a Creative Commons Attribution-ShareAlike 4.0" (`/about/licence/`, read 2026-09-25). No caption states a licence of its own. The per-image check reads the caption:
  - A caption that ends `Image <Name>.` gets `CC BY-SA 4.0`, with `license_url` `https://creativecommons.org/licenses/by-sa/4.0/`. `author` is `<Name>`.
  - A caption with `©`, `(c)`, or "permission" is skipped, because its rights may differ from the site licence. The old `harvest.cjs` applies the same rule, and the manifest's 19 TSO rows passed it.
  - A caption with no `Image <Name>` credit is skipped.
- **Page lookup.** The module reads `https://www.treesandshrubsonline.org/sitemap.xml` (cached 30 days). For each target name it builds the path `/articles/<genus>/<genus>-<epithet>/`: lower case, with `×` written as `x`. It fetches the page only when the sitemap lists that path, so a missing species costs no request and no failure. The page `<h1>` must name the species, or the page gives no rows.
- **Images.** Each image is an `a.uk-inline` with `href` (the file) and `data-caption`. The module removes repeats by `href`. It keeps only the species' own images: the images in the `/site/assets/files/<pageId>/` folder whose `<pageId>` is not the `id` of an `<h3>` on the page. The `<h3>` sections hold cultivars and varieties.
- **Origin.** The page URL plus `#image=<file name>`, for example `https://www.treesandshrubsonline.org/articles/quercus/quercus-gambelii/#image=quercus-gambelii-4.jpg`. This is the form that `mkadds.cjs` used for the manifest rows.
- **File.** The absolute `href` URL. Files are about 1,600 px on the long side.
- **Hints.** `channel_hint` is `channelHint` of the caption text. `source_species` is the `<h1>` name.

## wildflower.org (fetch source)

Module: `pipeline/lib/wildflower.ts`.

- **Pages.** The site keys plants by PLANTS symbol. The gallery list is `https://www.wildflower.org/gallery/species.php?id_plant=<SYMBOL>`, on one page with no paging. Each image page is `https://www.wildflower.org/gallery/result.php?id_image=<id>`. The pages are `iso-8859-1`, and the module decodes them as `windows-1252`. An unknown symbol returns HTTP 200 with the text "Sorry, no image for this plant", and the module gives no rows.
- **Limit.** The module reads at most `WILDFLOWER_MAX_IMAGES = 20` image pages per symbol, in list order. Each image needs one page request for its credit. QUGA lists 59 images. The limit keeps a run of 40 species under about 800 page requests, and the policy forbids bulk harvesting.
- **Per-image rights.** The image page has a `Restrictions:` field. Only `Unrestricted` is kept. Any other value skips the image.
- **Licence.** `license` is `used with permission, non-commercial`, which `licenseAllowedAt` accepts only for this host. `license_url` is null.
- **Credit.** `Photographer:` is written `Last, First`. The module turns it into `First Last`: it splits at the first `, ` and swaps the two parts (`Reveal, James L.` gives `James L. Reveal`). The app then prints `James L. Reveal, Lady Bird Johnson Wildflower Center, used with permission, non-commercial.` That names the photographer and the Center, as the policy requires. An image with no photographer is skipped.
- **Origin.** The image page URL. Each image has its own page, so no fragment is needed.
- **File.** The `<img src>` of the image page, at the largest public size, 640×480. The resizer never enlarges, so these publish at 640 px. The reviewer judges whether that is sharp enough.
- **Hints.** `channel_hint` is `channelHint` of the `Shot:` field. `source_species` is the species name on the image page.

## Kew POWO (browser harvest)

Kew POWO is not a fetch source. It has three parts:

1. **Skill** `.claude/skills/powo-harvest/SKILL.md`. An agent follows it with the built-in browser:
   - It opens `https://powo.science.kew.org/taxon/<IPNI id>/images`, and finds the IPNI id through the POWO search page in the browser.
   - It waits 10 seconds at least between Kew page loads, and loads each page once.
   - It saves the `section#all-images` HTML to a file in the scratchpad.
   - It stops and reports if a page shows a challenge ("Just a moment...") or a 403. It does not try to get past a challenge.
   - It never signs in and never accepts non-essential cookies.
2. **Parser** `pipeline/lib/powo.ts`. It reads the saved HTML and gives one row per image in the shape that `mkadds.cjs` reads. For each `a[data-caption]` in the gallery grid, outside `.taxon-header`:
   - **Photos only.** An image counts as a photo when its caption has `ID:<n>`. Herbarium sheets have a `K00...` barcode and no `ID:`, and the parser skips them.
   - **Licence.** The parser reads the caption's licence text. It builds the label from the caption's Creative Commons link with `licenseLabelFromUrl`, and keeps the caption's `©` holder text in front of the label (for example `© RBG Kew, CC BY 3.0`). The label must pass `licenseAllowed`. "Not Kew Copyright. Only licensed for display purposes in POWO." has no CC link, so the image is skipped.
   - **Credit.** `author` is the caption's `<small>` credit, word for word.
   - **Origin.** The page URL plus `#image=<32-hex hash of the full-size file>`. The site has no per-image URL.
   - **File.** `https:` plus `a@href`, the 1,600 px full-size file on CloudFront.
   - **Hints.** `source` is `Plants of the World Online (Kew)`. `source_species` is the name in the caption. `channel_hint` is `channelHint` of the caption text.
3. **Script** `pipeline/scripts/powo-rows.ts --html <file> --page-url <url> --target <SYMBOL> --out <rows.json>`. It calls the parser and writes the rows. `mkadds.cjs` then turns the rows into `photos add` commands.

On the London plane page (`urn:lsid:ipni.org:names:685854-1`, target PLHI), the parser keeps 2 of 23 images: photos ID 14124 and ID 14123, both CC BY 3.0. It skips 14 display-only photos and 7 herbarium sheets.

## Scripts

`pipeline/scripts/harvest.cjs` and `pipeline/scripts/mkadds.cjs` come from the scratchpad of an earlier session, with these changes:

- **Paths.** Every path is an argument.
  - `harvest.cjs --rows <file> --run <name> --out-dir <dir>`. The built-in gap rows go. The candidates path is worked out from the repo root (`pipeline/runs/<run>/candidates.jsonl`). The download, cache, and catalogue folders go under `--out-dir`.
  - `mkadds.cjs --run <name> --in <file> --out <file>`. `--in` and `--out` are required. The hard-coded `SPECIES_OVERRIDE` goes; a row carries its own `source_species`.
  - No default path points inside the repo, because the CLI commits with `git add -A`.
- **Unicode credits.** `harvest.cjs` drops `toAscii` for `cleanCredit`: Unicode NFC, strip control characters (`\p{Cc}`), collapse spaces, trim. Letters in any script stay (`Jiří Dvořák`, `José Ñúñez`). `shellSafe` still strips `` " ` $ ! \ ``, because the output is a shell file with double-quoted values. `mkadds.cjs` flags only control characters, where it flagged any character outside printable ASCII. The 1,500-byte line check stays.
- **Tests.** Each script exports its pure functions (`module.exports`) and runs `main()` only when Node starts it directly. The pipeline tests load them with `createRequire`.

## Skills

- `content-run` Step 7 (hand-added rows) names the new fetch sources, the POWO skill, and the two scripts.
- `photo-check` states that `used with permission, non-commercial` is a valid licence for wildflower.org rows, and for no other host.
- The new `powo-harvest` skill holds the procedure above.

## Tests

- Each source has a test file in `pipeline/tests/` that runs on fixture bytes, never the network: `bioimages.test.ts`, `tso.test.ts`, `wildflower.test.ts`, `powo.test.ts`. The fixtures are trimmed copies of pages that were saved on 2026-09-25, under `pipeline/tests/fixtures/<source>/`. Each fixture holds at least one row that the licence rule must drop.
- `cli_fetch.test.ts` registers the new sources' QUGA routes in `photoRoutes()`, and the tests that assert zero HTTP failures still pass. The source-order test changes to the turn order.
- `licenses.test.ts` covers `licenseLabelFromUrl` and `licenseAllowedAt`. The permission label passes for `www.wildflower.org` and fails for any other host.
- `scripts.test.ts` covers `cleanCredit` and the `mkadds.cjs` control-character rule.
- The live suite (`pipeline/tests_live/`) does not change. It stays at 7 tests.

## Checks before the pull request

1. `npm run test:all` passes: app 177, pipeline 348 plus the new tests, live 7.
2. A real `photos fetch` on QUGA in a scratch run shows rows from Bioimages, TSO, and wildflower.org. The fetch report gives the count per source. A check of every appended row with `licenseAllowedAt` finds 0 violations. The scratch run lives in a separate worktree on a branch that is never pushed, because the CLI commits run files.
3. An agent follows the `powo-harvest` skill on the London plane page. The script and `mkadds.cjs` turn the saved HTML into `photos add` commands. Those commands run clean in a scratch run with PLHI.

## Owner actions

- Email `BI@kew.org` to say that Dendro uses POWO images. Kew asks users of its data to do this.
- Add the date and the sender of the wildflower.org permission email to `docs/decisions/2026-09-25-wildflower-permission.md`, or save the email there.
- Optional: ask the TSO editors (`/about/contact/`) to confirm that the site licence covers the photographs. The site-wide statement does not name photos.

## Limits

- Wildflower.org images are 640 px at most. The full-size files need the Center's request form.
- Bioimages has no London plane images. Wildflower.org has none either, because it covers native plants only.
- A TSO image id is its file name. If the editors delete an image and upload a new one with the same name, the new image gets the old id.
- A change to Kew's gallery HTML breaks the POWO parser. The London plane fixture catches that in the tests only when someone saves a new copy.
- A `suppress` flag in Bioimages has one bit whose meaning is not documented. The source skips every flagged row.
