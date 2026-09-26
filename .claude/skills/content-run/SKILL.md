---
name: content-run
description: Use when running a Dendro content run end to end, from `cli run init` to the merged pull request.
---

# Content run

A run is one scope of content: a bucket, a set of states, a set of channels, and a
species seed. You walk the ten steps below in order.

Every CLI command reads what earlier steps wrote and skips finished work, so a stopped
run resumes with the same command. Every command takes `--refresh`, which bypasses the
disk cache for that command.

**The CLI commits. You do not.** The CLI commits at the end of `species list`,
`photos fetch`, `build`, `report`, `run pr`, and `run finish`. Each commit runs
`git add -A`, so the commit also carries the verdict rows and any file you edited since
the last commit. Do not run `git commit` yourself.

## The run's files

| Path | Written by |
|---|---|
| `pipeline/runs/<name>/run.json` | `run init`, then `species list` and `photos fetch` |
| `pipeline/runs/<name>/candidates.jsonl` | `photos fetch`, `photos add` |
| `pipeline/runs/<name>/verdicts.jsonl` | `photos verdict`, `run finish` |
| `pipeline/runs/<name>/build.json` | `build` |
| `pipeline/runs/<name>/decisions.json` | the owner, by hand |
| `pipeline/runs/<name>/report.md` | `report` |

## The ten steps

- [ ] **Step 1: Init the run (script)**

```bash
node pipeline/cli.ts run init <name> --bucket <b> --states <csv> --genera <csv> --include <csv> --channels <csv>
```

This creates the branch `content/<name>` from `main` and writes
`pipeline/runs/<name>/run.json`. It prints `run <name> created on branch content/<name>`.
When the run already exists it prints `run <name> already exists` and changes nothing.

- [ ] **Step 2: List the species (script, commits)**

```bash
node pipeline/cli.ts species list <name>
```

This writes the kept species and the dropped species into `run.json`, with the reason for
each drop, and writes `pipeline/data/plants_ids.json`. It prints
`<n> species kept, <m> dropped`, then one line per fetch failure, and it prints
`<SYMBOL>: no profile` for each symbol whose profile fetch failed. A symbol with no
profile is in no later step, so read those lines. Re-run with `--refresh` when a failure
looks like a rate limit. Tell the owner when a symbol fails twice.

- [ ] **Step 3: Draft the authored species files (agent)**

Run the `species-draft` skill. It writes one `content_src/species/<SYMBOL>.json` for each
species in `run.json` that lacks one. A species with no authored file gets no record in
`content/species.json`; the build reports it as `not_authored`.

- [ ] **Step 4: Fetch the photo candidates (script, commits)**

```bash
node pipeline/cli.ts photos fetch <name>
```

This appends rows to `pipeline/runs/<name>/candidates.jsonl` and downloads each image into
`pipeline/cache/`. The sources take turns: each source gives one row per round, in this
order: Bioimages, the Lady Bird Johnson Wildflower Center (wildflower.org), Trees and
Shrubs Online, Wikimedia Commons, iNaturalist. A source that runs out drops out of the
rounds. USDA PLANTS rows come after all the turn rows. A target keeps 60 rows at most.

It prints one line per fetch failure, then
`<n> candidates appended to pipeline/runs/<name>/candidates.jsonl, <m> download failures, <k> monochrome dropped`.
The last line gives the appended rows per source, in fetch order, for example
`by source: bioimages 10, wildflower 12, tso 5, commons 17, inat 16, plants 0`. It records the failure count in `run.json` as
`fetch_failures`.

- [ ] **Step 5: Approve the photos (agent)**

Run the `photo-check` skill. It judges each candidate that has no verdict and records each
verdict with `node pipeline/cli.ts photos verdict …`. The stop rule applies. When that
skill stops, the run stops with it.

- [ ] **Step 6: Build (script, commits)**

```bash
node pipeline/cli.ts build <name>
```

This merges the species records, resizes and uploads the approved images, writes the
manifest rows, runs the validator and the append-only check, and writes
`pipeline/runs/<name>/build.json`. It prints one line per flagged unit, then
`content built: <n> species, <m> manifest rows, <k> images uploaded`.

The build writes nothing to `content/` until the validator and the append-only check both
pass. On an error it prints each message and exits 1. Read the messages and fix the cause:

- `error species.json: …` — an authored file or a fetched field is wrong. Edit the
  authored file, or tell the owner when the fetched layer is wrong.
- `error images/manifest.json: …` — a verdict approved an image the content set rejects.
- `<id> is in the published … and is gone from the new content` — a published ID left the
  content. Never delete a published ID. Retire it instead.

Run `node pipeline/cli.ts photos audit <name>` to list any candidate under the colour threshold. The fetch already drops these, so the list is normally empty.

- [ ] **Step 7: Hunt for the thin channels (agent)**

Read the gap list in `build.json` under `gaps`. Each row names a species or a concept, a
channel, and the count of approved images.

`photos fetch` already reads six sources: Bioimages, the Lady Bird Johnson Wildflower
Center (wildflower.org), Trees and Shrubs Online, Wikimedia Commons, iNaturalist, and USDA
PLANTS. For each thin pair, do a targeted search: a search for that one species and
channel only. Use these tools, in this order, and stop when the pair has 4 approved images:

1. **The harvester.** `pipeline/scripts/harvest.cjs` looks for one channel of a species on
   Bioimages and Trees and Shrubs Online, past the rows that the fetch took. Write the gap
   rows to a JSON file in the session scratchpad, one object per row:
   `{ "symbol": "<target>", "sci": "<scientific name>", "channel": "<channel>", "approved": <count> }`.
   Then run:

   ```bash
   node pipeline/scripts/harvest.cjs --rows <scratchpad>/gap-rows.json --run <name> --out-dir <scratchpad>/harvest
   ```

   It writes `harvest-rows.json` and `harvest-report.md` into `--out-dir`. Look at each image
   at its `local` path. Copy the rows that you keep into
   `<scratchpad>/harvest/keep-rows.json`. Then run:

   ```bash
   node pipeline/scripts/mkadds.cjs --run <name> --in <scratchpad>/harvest/keep-rows.json --out <scratchpad>/harvest/adds.sh
   ```

   It prints `lines`, `max bytes`, and `problems`. Fix each problem before you go on. Then
   run the lines of `adds.sh` one at a time, from the repo root.
2. **The other sites.** Look for that channel on Wikimedia Commons, iNaturalist, and
   wildflower.org, in the built-in browser or with a script that calls the site over HTTP.
   Take only images whose licence is on the allowlist. Append each one as a manual
   candidate, as below. A script that calls wildflower.org sends 1 request per second at
   most, and reads 20 image pages per species at most. The wildflower.org policy forbids
   bulk harvesting.
3. **Kew POWO, last.** Run the `powo-harvest` skill only for a pair that is still thin after
   steps 1 and 2. Before you start it, write down which sites you searched for that pair and
   what each gave. The skill saves the Kew gallery in the built-in browser, makes the rows
   with `pipeline/scripts/powo-rows.ts`, makes the commands with
   `pipeline/scripts/mkadds.cjs`, and runs them.

Do not use WebFetch to make a photo row. WebFetch passes the page through a model, so a
credit or a licence can come back in other words, and `photos add` needs both word for
word. Read the credit and the licence off the page in the browser, or from the output of a
script.

Give the scripts paths in the scratchpad only, never in the repo. The CLI commits with
`git add -A`, so a file inside the repo reaches a commit.

A manual candidate:

```bash
node pipeline/cli.ts photos add <name> --target <t> --origin <url> --file-url <url> --author <a> --license <l> --source <s> [--license-url <u>] [--source-species <n>] [--channel-hint <c>] [--local <path>]
```

`--target`, `--origin`, `--file-url`, `--author`, `--license`, and `--source` are
required, and each must be non-empty. The command exits 1 and names the flag when one is
missing.

- `--author` and `--license` are the credit the app prints under the photo, word for word.
  Copy them off the source page. Do not write `unknown`.
- `--license` must be on the allowlist. The one exception is
  `used with permission, non-commercial`, which `photos add` accepts only when `--origin` is
  on `www.wildflower.org`.
- `--source` is the display name of the source. It goes on the manifest row as it is. For a
  manual row from one of these sites, use the value exactly as written here:
  - `Wikimedia Commons`
  - `iNaturalist`
  - `Bioimages`
  - `Trees and Shrubs Online`
  - `Lady Bird Johnson Wildflower Center`
  - `Plants of the World Online (Kew)`

  For another site, write the name that the site gives itself, such as `US Forest Service`.
- A wildflower.org row takes `--license "used with permission, non-commercial"`. The
  permission and the policy need the credit to name the Center, so `--source` is
  `Lady Bird Johnson Wildflower Center`. `--author` is the photographer as `First Last`. The
  page writes `Last, First`, so turn the two parts around: `Smith, Jane` becomes
  `Jane Smith`.
- `--source-species` is the species the source page names. The identity check reads it.
- `--local <path>` names an image file you already downloaded. Without it the command
  downloads `--file-url`.
- `photos add` refuses a monochrome image, and a candidate id that the run already holds.
  When one page holds many images, add a fragment such as `#image=<file name>` to
  `--origin`.

Then run steps 5 and 6 again.

- [ ] **Step 8: Draft the confusion edges (agent)**

Run the `edges-draft` skill. It appends edges to `content/confusion.json` for the species
in this run.

Then build again, so the validator reads the new edges before the report:

```bash
node pipeline/cli.ts build <name>
```

An edge whose `a` or `b` is not in `content/species.json` fails the build. Fix the edge
and build again.

- [ ] **Step 9: Report and open the pull request (script, commits)**

```bash
node pipeline/cli.ts report <name>
node pipeline/cli.ts run pr <name>
```

`report` writes `pipeline/runs/<name>/report.md` and prints
`<n> escalations in pipeline/runs/<name>/report.md`. It uploads a copy of each escalated
image under the `review/` prefix and links it, because the branch holds no image bytes.

`run pr` pushes the branch and opens a draft pull request with the report as its body. It
prints `draft pull request opened for content/<name>`. It exits 1 when `report.md` is
missing.

- [ ] **Step 10: Stop and wait for the owner**

**The run stops here.** The owner reviews the pull request. They write
`pipeline/runs/<name>/decisions.json` for the escalations, and they edit the authored files
and the edges in place. Do not do this work for them. Do not guess a decision.

When the owner says the decisions are ready:

```bash
node pipeline/cli.ts run finish <name>
```

This turns each decision into a verdict row with `checked_by: owner`, rebuilds, re-renders
the report, and pushes. It prints `<n> decisions applied`, or `no decisions to apply` when
the file is absent. It exits 1 when `decisions.json` names a candidate this run does not
hold. CI validates the pull request. The owner marks it ready and merges.

## The concept run variant

A concept run replaces `--bucket` with `--concepts`. Its `run init` takes that one flag and
no others:

```bash
node pipeline/cli.ts run init <name> --concepts <csv>
```

- Each `--concepts` value is qualified: `<channel>/<key>`, such as `bark/plated`. A value
  with no `/` fails. A key that is not in `content/concepts.json` fails and the message
  names it.
- The run's channels are the distinct channel prefixes of those keys, so the command
  derives them and **`--channels` is an error on a concept run**.

The manifest target of a concept candidate is the qualified key. The run writes no species
record, so **skip step 3 and step 8**.

The exemplar species live in `run.json` under `concept_exemplars`, a map from a qualified
key to two or three PLANTS symbols. The owner fills it after step 1 and before step 4,
because the exemplars are a content judgment. `photos fetch` looks each concept's photos up
through its exemplars.

## Other commands

- `node pipeline/cli.ts images retire <hash> --reason "<text>"` takes one image down. It
  builds the new content set in memory, validates it, runs the append-only check, then
  removes the object, writes `content/`, and commits. Two rows that share the hash both
  retire. Run it only when the owner asks.
- `node pipeline/cli.ts images difficulty <hash> --set hard` holds one image back from
  the app. `--clear` brings it back. The file stays in the bucket. It validates, runs the
  append-only check, writes `content/`, and commits. Two rows that share the hash both
  change. A hard photo does not count toward its channel in the build report of the run
  that approved it, so that run's report shows the gap when the run is built again.
  Other runs do not see it. `photos fetch` still counts a hard photo toward the cap of 8
  per channel. Run it only when the owner asks.
- `node pipeline/cli.ts species retire <SYMBOL> --reason "<text>"` retires one species. The
  record stays in `content/species.json` with `retired: true` and the reason. Run it only
  when the owner asks.
- `node pipeline/cli.ts ids check --base <ref>` reports whether the content set keeps every
  published ID. `build` runs the same check.
- `node pipeline/cli.ts data sections` builds the oak section table. Run it once.
- `node pipeline/cli.ts data inat-terms` reads the iNaturalist phenology value and writes
  `pipeline/data/inat_terms.json`. It exits 1 when the live annotations are ambiguous.

## What this skill does not do

- It does not commit. The CLI commits.
- It does not append to `candidates.jsonl` or `verdicts.jsonl`. `photos add` and
  `photos verdict` do that.
- It does not write `decisions.json` for the owner at step 10.
- It does not restart a run that the stop rule stopped. The owner changes the source list
  or the threshold first.
- It does not edit `content/concepts.json` or `content/units.json`. A person authors those.
