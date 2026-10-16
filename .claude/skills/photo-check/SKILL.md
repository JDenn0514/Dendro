---
name: photo-check
description: Use when approving the photo candidates of a Dendro content run, one verdict per candidate, through `cli photos stage` and `cli photos apply`.
---

# Photo check

You judge the photo candidates of one run. One candidate gets one verdict. The one
exception is a Kew POWO row whose saved file is missing. That row gets no verdict (see
**A Kew POWO row** below). The candidates of a full target get no verdict either (see
**Stop at 6 good photos** below).

## The loop

1. Read `pipeline/runs/<name>/candidates.jsonl`. One `id` can have two rows: when a
   download fails, a later `photos fetch` tries it again and appends a second row. Keep
   only the last row for each `id`. Then skip each row whose `fetch_error` is not null.
   That row has no image file, and a later `photos fetch` tries it again.
2. Read `pipeline/runs/<name>/verdicts.jsonl` when it exists.
3. From the rows of step 1, take every candidate whose `id` has no row in `verdicts.jsonl`. Those are the unjudged
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
5. **Each subagent returns its verdict as its result.** It does not touch `verdicts.jsonl`,
   and it never adds a row to a staged file by hand. `photos stage` adds each row.
6. Stage each returned verdict with one command:

   ```bash
   node pipeline/cli.ts photos stage <name> --candidate <id> --verdict <kind> [--channel <c>] [--tags a,b] [--case <case>] --note "<text>"
   ```

   The six flags above are the whole surface. The command checks the row and appends it to
   `pipeline/runs/<name>/staged/<target>.jsonl`. It prints the approved counts of that
   target per channel, without the `hard` photos, for example
   `QUAL: approved leaf 3, bark 1, fruit 0; hard 1`. A judge that works on one target can
   run it for its own verdicts. A second stage of the same verdict changes nothing. A stage
   of a different verdict for the same candidate is refused. To change a staged verdict,
   remove its line from `staged/<target>.jsonl`, then stage again.

   The judge that staged a row may remove or change a line in its own
   `staged/<target>.jsonl` with the Edit tool. It edits only that file by hand. It never
   edits `verdicts.jsonl` or the staged file of another judge.
7. After each batch, apply every staged verdict in one command:

   ```bash
   node pipeline/cli.ts photos apply <name>
   ```

   It checks every staged row first. When one row is bad, it writes nothing and exits 1.
   A candidate that already has a different verdict is a conflict: the command names it,
   writes nothing, and exits 1. Add `--replace` only when the new verdict must win.
   `--replace` never changes an owner decision. A second apply of the same rows changes
   nothing. The command sets `checked_by` to `photo_check_agent`, which is `CHECK_AGENT` in
   the CLI, and `checked_at` to the time of the apply. You never set those two. It prints
   one line per target with the approved counts per channel, then a `total:` line with the
   stop-rule numbers. Use those lines for the stop rule below, and skip the targets that are
   now full.

   When `photos apply` exits 1, it applied nothing. Do these steps:

   1. Read each error line and each `conflict:` line. An error names the file and the line.
   2. Fix the staged rows that they name. Remove a row, or change it to the right verdict.
      A conflict with an owner decision needs a staged row that matches the owner, or no row.
   3. Run `photos apply <name>` again.

   After a fix with `photos verdict`, remove the staged row of that candidate. If the row
   stays, the next apply reports a conflict, and an apply with `--replace` records the old
   verdict again.

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

**A channel outside the run.** `photos fetch` does not filter the candidates by channel.
So a leaf run also gets bark and fruit candidates. `photos stage` refuses an approve on a
channel that is not in the run's channel list. When a photo is clear but its channel is
not in that list, reject it. **A clear photo on a channel outside the run is a reject, not
an escalation.** Give no `--case`. The note names the channel, such as
`Clear bark photo. The run covers leaf only.` In the first version every run is leaf only
(`docs/decisions/2026-09-30-leaf-only-v1.md`).

**Quality.** Answer each check below with yes or no, in order: the reject checks, then the
hard checks (owner rulings 2026-09-26 and 2026-09-29). Each check is about the feature of
the channel that you set:

- **Leaf:** the shape and the margin of the leaf. On a conifer with needles in bundles, the
  feature is the number of needles in one bundle.
- **Bark:** the ridges, plates, grooves, or peeling, and the texture.
- **Fruit:** the fruit. On the tree or off the tree are both correct.

You decide the botanical facts, such as the stage of a leaf, from the photo and the source
page. The owner is a learner and cannot judge them.

**Reject** when any of these is yes:

1. You cannot make out the feature. A learner cannot see, without close study, the
   characteristics that tell this tree from others: the lobes and margin of one leaf, the
   shape of the fruit, or the ridge or plate pattern of the bark. If you must look very
   closely to trace it, the answer is yes (owner ruling 2026-09-30).
2. Leaf: the photo shows a crown, a whole tree, or a sapling, and the leaves blend into a
   mass.
3. Bark: the camera looks up into the crown, or the photo is too dark to read the texture.
4. Blur smears the edges or the ridges.
5. The subject is a dead or brown leaf.
6. A plant name label that you can read is in the frame. It gives the answer away.
7. Buds, flowers, or catkins take the place of the feature. Exception: the sweetgum
   flower-head ball counts as fruit, with the `hard` tag.
8. The leaf is from a sucker shoot (owner ruling 2026-10-07).
9. The image is black-and-white or greyscale (owner ruling 2026-09-24). The fetch drops
   these, so one that reaches you came through `photos add`.
10. Fruit: the main part of the fruit is missing, for example acorn cups with no nut.

**Escalate** with `--case quality` when no reject check is yes and the image is sepia,
toned, tinted, or heavily filtered (owner ruling 2026-09-25). The owner judges whether the
filter is light enough to keep.

**Not a fault.** These never lower a verdict and never cause an escalation:

- A ruler, a tape, a pen, or a scale bar in the frame.
- A hand or fingers that hold the leaf or the fruit.
- A small file that is sharp. The VT Dendrology photos are about 250 px wide.
- Your doubt about the species from the photo. Trust the source (see **Identity**).

**Hard:** approve and add `hard` to `--tags` when no reject check is yes and any of these
is yes:

1. Crowded leaves: no leaf shows its whole outline clear of overlap or shade.
2. The feature is small in the frame, because the camera is farther away, but a learner
   still sees its characteristics without close study. As a guide, not a fixed limit: the feature is less than about a sixth of the
   short side of the frame.
3. The photo is soft, but you can trace the edges.
4. The leaf is tilted, so its outline is foreshortened, or the angle hides its typical
   shape.
5. The frame edge cuts off part of the leaf, and most of the leaf shows.
6. The form is young: a young leaf, a green or unripe fruit, or young stem bark. A young
   form is never good.
7. The fruit is not in its typical form: loose parts, a nut without its cap, or dry remains,
   such as a fallen, opened tuliptree cone on the ground (owner ruling 2026-10-07). Exception:
   when the source or the look-for line says that the fruit looks like that in winter, dry
   winter fruit on the tree is good.
8. The leaves show autumn colour: red, orange, or yellow.
9. Bark from a distance: the whole trunk shows, and the ridge or plate pattern shows without
   close study, but the fine texture does not.
10. Backlight or deep shade hides the edges.

Write the tag as `--tags hard` or `--tags hard,winter`. The `hard` tag goes onto the
manifest row as it is. The app hides a photo only when its manifest row has
`difficulty: "hard"`. The build sets that field from the `hard` tag.

**Good:** approve with no `hard` tag when every reject check and every hard check is no. A
good photo looks like this:

- **Leaf:** one or two leaves, attached or detached, show the full outline and are the
  largest sharp thing in the frame. The best leaf photo shows one petiole laid flat or
  hanging flat: one whole leaf, or for a compound leaf all of its leaflets, not dead
  (owner ruling 2026-09-30). A photo of the underside only is good. When one full outline
  is large and clear among many leaves, approve with `hard` and start the note with
  `one clear leaf:`. When a target has no better leaf photo, the owner can use it as a
  good photo.
- **Leaf forms:** some species have more than one normal leaf form on the mature tree,
  such as the unlobed, mitten, and three-lobed leaves of sassafras. Judge each form like
  any leaf, also a form that does not match the species' bucket. The form must be one
  that the source or a reference names for the mature tree. Name the form in the note. A
  photo that shows two or more forms side by side is the best leaf photo for that species
  (owner ruling 2026-10-07).
- **Bark:** the texture fills the frame, the ridge or plate pattern shows, the photo is
  sharp, and the colour is true.
- **Fruit:** the fruit is large in the frame, in its mature form.

**Duplicates.** When two candidates of one target show the same image (the same photo on
two sources, or one a crop or a resize of the other), approve only one. Keep the row from
the source that comes first in the fetch order: Bioimages, wildflower.org, Trees and
Shrubs Online, Wikimedia Commons, iNaturalist, USDA PLANTS. Reject the other, and name the
kept candidate id in the note (owner ruling 2026-09-26).

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

- `true`: the names agree. When the caption or the page plainly names a different
  species, escalate with `--case mismatch` all the same.

A name that adds a variety or a subspecies to the target's own species is a match. For
example, *Quercus sinuata* var. *breviloba* matches the target *Quercus sinuata* (owner
ruling 2026-09-26). A variety or subspecies of a different species is not a match.
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
3. Run no `photos stage` command for the row. The row stays unjudged, so the next pass
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
- A trait that the line names cannot be seen: apply the **Quality** checks for the channel.
- The photo clearly shows a trait that contradicts the line, such as opposite leaves where
  the line says alternate: trust the source. Set the verdict from the **Quality** checks.
  Start the note with `look-for:` and name the trait that you saw, so the owner can
  correct the line. Keep `look_for.json` as it is, and do not set or change the species.
- `look_for.json` is absent, or it has no line for the species and the channel: judge on
  the **Quality** checks alone, and say so in the note.

## The three escalation cases

Escalate in these three cases and no others:

1. `mismatch`: the species on the source page and the species on the row differ, or the
   page names none.
2. `license`: the license is missing, ambiguous, or not redistributable.
3. `quality`: the image is sepia, toned, tinted, or heavily filtered, so the tree may not
   look real.

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
- It does not write `verdicts.jsonl`. `cli photos apply` writes it.
- It does not write `decisions.json`. The owner writes that.
- It does not edit `look_for.json`. The owner corrects a line from the `look-for:` notes.
- It does not upload, resize, or delete any image. `cli build` does that.
- It does not commit.
- It does not continue after the stop rule fires.
