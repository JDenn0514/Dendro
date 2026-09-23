---
name: edges-draft
description: Use when drafting confusion edges for a Dendro content run and appending them to `content/confusion.json`.
---

# Edges draft

A confusion edge is a pair of species that a learner mixes up, on one channel, with one
sentence that separates each from the other. You draft edges from named references and
append them to `content/confusion.json`.

## Inputs

- The run's species list, from `pipeline/runs/<name>/run.json`, field `species`.
- The bucket, from the same file, field `bucket`.
- The current `content/species.json`, for the records that exist.
- The current `content/confusion.json`, for the edges that already exist.

## The edge shape

```json
{ "a": "QURU", "b": "QUVE", "channel": "leaf",
  "a_not_b": "Northern red oak has shallower sinuses and shorter bristle tips than black oak.",
  "b_not_a": "Black oak has deeper sinuses, longer bristle tips, and larger hairy buds.",
  "ref": "Virginia Tech Dendrology fact sheet, Quercus velutina" }
```

- `a` and `b` are PLANTS symbols.
- `channel` is one of `leaf`, `bark`, `fruit`, `flower`, `twig`.
- `a_not_b` says how `a` differs from `b`.
- `b_not_a` says how `b` differs from `a`.
- `ref` is one string that names the source of the two sentences.

Append each edge to the list in `content/confusion.json`.

## The target

For `simple_lobed` in v0, draft 15 to 25 edges. Below 15 the distractor pool is thin. Above
25 the owner's read gets long.

## The rules

**Both symbols are in this run's species list.** Write an edge only for two symbols that
`run.json` names under `species`. A pair from another run is not yours to draft, and the
owner reviews this run's edges against this run's references.

**Both `a` and `b` must be in `content/species.json`.** Check each symbol in that file
before you write the edge. The validator rejects an edge whose `a` or `b` is missing, and
the build fails. A species the run dropped, or one with no authored file, has no record.

**Each side names a feature a person can see in the field.** Write what the person holds in
their hand or sees on the trunk: the depth of a sinus, the length of a bristle tip, the
color of a bud, the texture of the bark. Do not write a range statement, a habitat, a bloom
date, or a microscope feature. The learner is looking at one photo.

- Good: "Black oak has deeper sinuses, longer bristle tips, and larger hairy buds."
- Bad: "Black oak grows further east." The learner cannot see that in the photo.

**`ref` names the source.** Write the guide and the species, such as "Virginia Tech
Dendrology fact sheet, Quercus velutina". The owner checks the two sentences against that
page. Do not name a page you did not read. Do not write an edge from memory.

**One edge per pair per channel.** Two species that confuse on both leaf and bark get two
edges, one per channel. Do not write the same pair and channel twice. Check the existing
edges first.

**Both directions carry a real difference.** `a_not_b` and `b_not_a` are not the same
sentence with the species swapped. Each names what that species has.

## When you finish

Tell the caller how many edges you appended. The `content-run` skill then runs
`node pipeline/cli.ts build <name>` again, so the validator reads the new edges before the
report. An edge that names a missing species fails that build.

## What this skill does not do

- It does not create or edit a species record.
- It does not rename or remove an existing edge. Edges are appended.
- It does not write an edge for a species that is not in `content/species.json`.
- It does not write an edge for a symbol outside this run's species list.
- It does not run the validator. `cli build` does that.
- It does not commit.
