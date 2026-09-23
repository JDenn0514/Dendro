---
name: photo-check
description: Use when approving the photo candidates of a Dendro content run, one verdict per candidate, through `cli photos verdict`.
---

# Photo check

You judge the photo candidates of one run. One candidate gets one verdict.

## The loop

1. Read `pipeline/runs/<name>/candidates.jsonl`.
2. Read `pipeline/runs/<name>/verdicts.jsonl` when it exists.
3. Take every candidate whose `id` has no row in `verdicts.jsonl`. Those are the unjudged
   candidates.
4. Dispatch subagents in batches of 10. Each subagent gets one candidate row. It reads the
   image file at the row's `local` path and the row itself.
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
7. After each batch, apply the stop rule below.

## The verdict

Each subagent returns five things, and no more:

- `verdict`: `approve`, `reject`, or `escalate`.
- `channel`: one of `leaf`, `bark`, `fruit`, `flower`, `twig`. Required on an `approve`.
  On a concept target the channel is the target's own prefix: a `bark/plated` target takes
  `--channel bark`.
- `tags`: zero or more words for `--tags`, comma separated, such as `winter,close_up`.
- `case`: only on an escalation. It is `mismatch`, `license`, or `quality`.
- `note`: one or two sentences that say what you saw.

`cli build` and `cli run finish` reject a verdict whose candidate id is unknown, whose kind
is not one of the three, or whose approved channel is not in the run's channel list. Each
one prints the error and exits 1.

## The four rules

**Channel.** Set the channel from the fixed list: `leaf`, `bark`, `fruit`, `flower`,
`twig`. The row's `channel_hint` and `tags_hint` are suggestions only. Use your eyes.
**When no channel is clear, reject the image. An unclear channel is a reject, not an
escalation.**

**Quality.** The photo is sharp. The subject fills the frame. No hand and no ruler are in
the shot. Below that threshold, escalate with `--case quality`.

**License.** The license text on the row is in the allowlist and matches the source page.
The allowlist is public domain, US government work, CC0 any version, CC BY any version,
and CC BY-SA any version. NC and ND variants are not allowed. When the license is missing,
ambiguous, or not redistributable, escalate with `--case license`.

**Identity.** Read `identity_match` on the candidate row. The fetch step set it by
comparing the row's `source_species` to the PLANTS scientific name and its PLANTS
synonyms, after normalization.

- `true`: the names agree. Do nothing for identity.
- `false`: the names differ. Open the source page at `origin` and read the species it
  names. When the names still differ, escalate with `--case mismatch`.
- `null`: the row carries no name to compare, which is the normal state of a manual
  candidate. Open the source page at `origin` and confirm the species yourself. When the
  page names a different species, escalate with `--case mismatch`. When the page names no
  species, escalate with `--case mismatch`.

Eligible identity sources are iNaturalist at research grade, USDA PLANTS, US Forest
Service and NRCS through a manual candidate, Wikimedia Commons with a species-level
category, and university dendrology collections that name the species.

**You never set or change the species from what you see in the photo.** Identity comes from
the source page. Your own recognition of the plant is not evidence.

## The three escalation cases

Escalate in these three cases and no others:

1. `mismatch`: the species on the source page and the species on the row differ, or the
   page names none.
2. `license`: the license is missing, ambiguous, or not redistributable.
3. `quality`: the channel or the quality falls below the threshold.

Everything else is an approve or a reject.

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
- It does not write `verdicts.jsonl`. `cli photos verdict` writes it.
- It does not write `decisions.json`. The owner writes that.
- It does not upload, resize, or delete any image. `cli build` does that.
- It does not commit.
- It does not continue after the stop rule fires.
