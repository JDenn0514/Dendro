---
name: photo-check
description: Use when approving the photo candidates of a Dendro content run, one verdict per candidate, through `cli photos verdict`.
---

# Photo check

You judge the photo candidates of one run. One candidate gets one verdict. The one
exception is a Kew POWO row whose saved file is missing. That row gets no verdict (see
**A Kew POWO row** below). The candidates of a full target get no verdict either (see
**Stop at 6 good photos** below).

## The loop

1. Read `pipeline/runs/<name>/candidates.jsonl`.
2. Read `pipeline/runs/<name>/verdicts.jsonl` when it exists.
3. Take every candidate whose `id` has no row in `verdicts.jsonl`. Those are the unjudged
   candidates. Keep them in file order. The fetch writes each target's candidates in the
   order of source quality. Skip every candidate of a full target (see **Stop at 6 good
   photos** below).
4. Dispatch subagents in batches of 10. Each subagent gets one candidate row. It reads the
   image file at the row's `local` path and the row itself. Also give it the entry of the
   row's `target` in `pipeline/runs/<name>/look_for.json`, when there is one (see **The
   look-for check** below). A Kew POWO row is a row whose
   `origin` is on `powo.science.kew.org`. For a POWO row, also give the subagent the two
   paths that the `powo-harvest` skill gave you for that species: the saved gallery and
   the rows file. First check that both files exist. When one is missing, do not dispatch
   the row. Follow **A Kew POWO row** below.
5. **Each subagent returns its verdict as its result. It writes no file.** It does not
   touch `verdicts.jsonl`.
6. For each returned verdict, run one command. Run them in sequence, one after the other,
   because each command appends to the same file:

   ```bash
   node pipeline/cli.ts photos verdict <name> --candidate <id> --verdict <kind> [--channel <c>] [--tags a,b] [--case <case>] --note "<text>"
   ```

   The six flags above are the whole surface. The command writes the row. It sets
   `checked_by` to `photo_check_agent`, which is `CHECK_AGENT` in the CLI, and `checked_at`
   to today's date. You never set those two.
7. After each batch, apply the stop rule below. Then count the approved photos again, and
   skip the targets that are now full.

**Stop at 6 good photos.** Count the approved photos of each target from
`verdicts.jsonl`. Use the last row of each candidate `id`, take the `approve` rows, and
group them by the candidate's `target` and the verdict's `channel`. Do not count an
approve that has the `hard` tag: the app does not show a hard photo. A target is full when
each channel in the run's channel list has 6 approved photos for that target. A concept
target has one channel only, its own prefix, so a `bark/plated` target is full at 6
approved `bark` photos. Dispatch no more candidates of a full target. They stay unjudged.
`cli build`, the stop rule, `cli report`, and `cli run finish` accept unjudged rows. A
batch can take a target past 6. Keep those verdicts.

## The verdict

Each subagent returns five things, and no more:

- `verdict`: `approve`, `reject`, or `escalate`.
- `channel`: one of `leaf`, `bark`, `fruit`, `flower`, `twig`. Required on an `approve`.
  On a concept target the channel is the target's own prefix: a `bark/plated` target takes
  `--channel bark`.
- `tags`: zero or more words for `--tags`, comma separated, such as `winter,close_up`.
- `case`: only on an escalation. It is `mismatch`, `license`, or `quality`.
- `note`: one or two sentences that say what you saw.

The one exception is a Kew POWO row whose saved file cannot be read. For that row the
subagent returns only a `note` that names the file, and no verdict.

`cli build` and `cli run finish` reject a verdict whose candidate id is unknown, whose kind
is not one of the three, or whose approved channel is not in the run's channel list. Each
one prints the error and exits 1.

## The four rules

**Channel.** Set the channel from the fixed list: `leaf`, `bark`, `fruit`, `flower`,
`twig`. The row's `channel_hint` and `tags_hint` are suggestions only. Use your eyes.
**When no channel is clear, reject the image. An unclear channel is a reject, not an
escalation.**

**Quality.** The photo is close up and sharp. The subject fills the frame. No hand and no
ruler are in the shot. The photo shows the feature that a learner has to see (owner ruling
2026-09-26). Each channel has its own feature:

- **Leaf:** the shape of the leaf, and how the leaves sit on the twig. The photo shows a
  piece of twig with at least two leaves, or two needle bundles, attached. They are close
  enough to see their shape. On a conifer with needles in bundles, you can count the
  needles in one bundle. A photo of one detached leaf that shows the shape clearly is an
  approve with the `hard` tag.
- **Bark:** a mature trunk. The grooves, plates, ridges, or peeling, and the texture, are
  clear and fill the frame.
- **Fruit:** the fruit, close up. On the tree or off the tree are both correct.

Then apply these rules in order:

1. The feature is not visible: reject.
2. The photo is distant or cluttered, but the feature is still visible: approve, and add
   `hard` to `--tags`, such as `--tags hard` or `--tags hard,winter`. The `hard` tag goes
   onto the manifest row as it is. The app hides a photo only when its manifest row has
   `difficulty: "hard"`. The build sets that field from the `hard` tag.
3. Any other photo below the threshold above, such as a soft photo, or a hand or a ruler
   in the shot: escalate with `--case quality`.

The photo shows natural colour, so the tree looks the way it does in real life. A
black-and-white or greyscale image is a reject, not an escalation (owner ruling
2026-09-24). The fetch drops these before you see them, so one that reaches you came
through `photos add`. A sepia, toned, tinted, or heavily filtered image is an escalation
with `--case quality` (owner ruling 2026-09-25). The owner judges whether the filter is
light enough to keep.

**License.** The license text on the row is in the allowlist and matches the source page.
The allowlist is public domain, US government work, CC0 any version, CC BY any version,
and CC BY-SA any version. NC and ND variants are not allowed. When the license is missing,
ambiguous, or not redistributable, escalate with `--case license`.

Two written permissions take the place of the allowlist, each for one host:

- `www.wildflower.org` (owner ruling 2026-09-25,
  `docs/decisions/2026-09-25-wildflower-permission.md`). The source is
  `Lady Bird Johnson Wildflower Center`.
- `dendro.cnre.vt.edu` (owner ruling 2026-09-26,
  `docs/decisions/2026-09-26-vt-dendrology-photo-permission.md`). The source is
  `VT Dendrology`. The author is
  `John Seiler, Edward Jensen, Alex Niemiera, and John Peterson`, or the one photographer
  that the image page names.

A row whose `origin` is on one of these two hosts may carry the license
`used with permission, non-commercial`. That text is valid for these two hosts only. On a
row from any other host, escalate it with `--case license`.

A Kew POWO row carries the holder in front of the label, such as `© RBG Kew, CC BY 3.0`.
That is a CC BY license, and it is on the allowlist.

**Identity.** Read `identity_match` on the candidate row. The fetch step set it by
comparing the row's `source_species` to the PLANTS scientific name and its PLANTS
synonyms, after normalization.

- `true`: the names agree. Do nothing for identity.
- `false`: the names differ. Open the source page at `origin` and read the species it
  names. When the names still differ, escalate with `--case mismatch`.
- `null`: the row carries no name to compare, which is the normal state of a manual
  candidate. Open the source page at `origin` and confirm the species yourself. When the
  page names a different species, escalate with `--case mismatch`. When the page names no
  species, escalate with `--case mismatch`. For a Kew POWO row, do not open `origin`. Read
  the saved gallery, as **A Kew POWO row** below tells you.

Eligible identity sources are iNaturalist at research grade, USDA PLANTS, US Forest
Service and NRCS through a manual candidate, Wikimedia Commons with a species-level
category, and university dendrology collections that name the species. Bioimages, Trees
and Shrubs Online, the Lady Bird Johnson Wildflower Center (wildflower.org), Kew Plants
of the World Online, and Virginia Tech Dendrology are eligible too, because each page names
the species.

**A Kew POWO row.** A POWO row is a manual candidate whose `origin` is on
`powo.science.kew.org`. For a POWO row, the saved gallery takes the place of the source
page. The `powo-harvest` skill gives the agent that runs this skill two paths for each
species (see its "After the harvest" section): the saved gallery,
`<scratch>/<SYMBOL>-<IPNI id>.html`, and the rows file, `<scratch>/<SYMBOL>-rows.json`. The
agent gives both paths to the subagent that judges the row (step 4 of the loop). The
subagent confirms the species and the licence of a POWO row from these files:

- **Species.** Find the file hash of the row in the saved gallery. The hash is the text after
  `#image=` in `origin`. Read the name at the start of the caption of that image. Judge that
  name as you judge the name on a source page.
- **Licence.** In the same caption, read the licence text after `ID:<n>`. The row's
  `license` must show the same holder and the label of the same Creative Commons URL.

Never open the `origin` URL of a POWO row, with WebFetch, the browser, or any other tool.
Each origin is a Kew page, and a new load breaks the rules of the `powo-harvest` skill.

**When a saved file is missing.** No escalation case fits. The source page is not wrong:
the evidence for the check is not on disk. The row gets no verdict:

1. Do not load the Kew page again.
2. Do not dispatch the row. When a subagent finds that a file is missing or cannot be
   read, it returns only a `note` that names the file, and no verdict.
3. Run no `photos verdict` command for the row. The row stays unjudged, so the next pass
   of this skill takes it again. It does not count toward the stop rule.
4. Tell the owner the candidate id and the path of the missing file.

**You never set or change the species from what you see in the photo.** Identity comes from
the source page. Your own recognition of the plant is not evidence.

## The look-for check

The `species-draft` skill writes `pipeline/runs/<name>/look_for.json`. The file holds one
entry per species symbol, and one line per channel in that entry:
`{ "QUMA2": { "leaf": { "text": "...", "ref": "..." } } }`. The `text` names the traits a
person can see in a photo of that channel.

The subagent reads the line of the channel it sets, and judges whether the photo shows
those traits:

- The photo shows the traits: say so in the note.
- A trait that the line names cannot be seen: apply the **Quality** rule for the channel.
- The photo clearly shows a trait that contradicts the line, such as opposite leaves where
  the line says alternate: escalate with `--case mismatch`. Name the trait in the note.
  Do not set or change the species. The owner decides.
- `look_for.json` is absent, or it has no line for the species and the channel: judge on
  the **Quality** rule alone, and say so in the note.

## The three escalation cases

Escalate in these three cases and no others:

1. `mismatch`: the species on the source page and the species on the row differ, or the
   page names none, or the photo clearly shows a trait that contradicts the look-for line.
2. `license`: the license is missing, ambiguous, or not redistributable.
3. `quality`: the quality falls below the threshold, but the feature is visible and the
   photo is not only distant or cluttered, or the colour is toned or filtered so the tree
   does not look real.

Everything else is an approve or a reject. The one exception is a Kew POWO row whose saved
file is missing. That row gets no verdict, as **A Kew POWO row** says.

## The stop rule

After each batch of 10, count the candidates of this run that now have a verdict, and count
how many of those verdicts are escalations.

- Fewer than 20 judged: continue.
- 20 or more judged **and** more than a quarter of them escalated: **stop**.

The two numbers are `STOP_MIN_JUDGED` (20) and `STOP_RATIO` (0.25) in
`pipeline/lib/verdicts.ts`. `cli build` applies the same rule to the committed rows and
records the answer in `pipeline/runs/<name>/build.json` under `counts.stop_rule_fired`. The
report prints it. You write no file of your own for it.

Example: 24 judged with 7 escalations is 29 percent. That is more than a quarter, so the
run stops. 24 judged with 6 escalations is 25 percent. That is not more than a quarter, so
the run continues.

When the rule fires:

1. Dispatch no more batches.
2. Tell the owner the count judged, the count escalated, and the percentage.
3. Stop. The run resumes only after the owner changes the source list or the threshold and
   re-runs the command.

A stopped run is a signal that the source list or the threshold is wrong. Do not lower your
standard to get past it. On a first run a high escalation rate usually means one source's
license text does not match the allowlist.

## What this skill does not do

- It does not identify a species from the image.
- It does not re-judge a candidate that already has a verdict row.
- It does not judge the candidates of a full target. They stay unjudged.
- It does not write `verdicts.jsonl`. `cli photos verdict` writes it.
- It does not write `decisions.json`. The owner writes that.
- It does not upload, resize, or delete any image. `cli build` does that.
- It does not commit.
- It does not continue after the stop rule fires.
