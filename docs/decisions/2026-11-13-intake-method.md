# The photo intake method: Sonnet FR

Date: 2026-11-13. Status: decided by the owner, not yet in the pipeline.

## Context

- The intake spec (`docs/superpowers/specs/2026-10-14-intake-comparison-and-photo-audit.md`) compares methods that judge, rank, and pick candidate photos for each cell. A cell is one species and one part. The plan is `docs/superpowers/plans/2026-10-21-intake-eval.md`. The report is `evals/2026-10-14-intake-eval/report.md`.
- No set-up passed the fixed gates on the key. On 2026-10-27 the owner froze V1, rule `P`, calls of 20, and effort `high` for Opus, Sonnet, and Haiku (`frozen.json`). The held-out run is judged against the owner's own repeat agreement (`heldoutCheck`), not against the gates.
- The owner's repeat agreement on 40 held-out photos: keep 82.5%, exact difficulty step 63.2% (19 photos kept both times). So the bar of `heldoutCheck` is keep 77.5% and exact difficulty step 58.2%.
- The decision rule of the spec, with the gates left out, gives **Opus CR20**. The shortlist from key v2 holds the ranking methods of Opus and Haiku. Haiku fails the check on exact difficulty step (54.9%, 3.3 points short). Opus CR20 is then the cheapest row that passes, at USD 0.0627 per kept photo.
- Opus CR20 judges only the first 20 photos of each species pool. It fills 14.8% of the quota slots, and the owner kept 80.0% of the photos it picks, 35.0% at the owner's difficulty step. The rule ranks by USD per kept photo and does not weigh quota fill or the quality of the picks.
- The owner leans to accuracy: "I'd rather have too few photos that get repeated if necessary than meet the quota with bad photos." So the owner judged the methods by the photos each one picks for the quota, on the held-out set at quota `Q332`:

  | Method | Photos picked | The owner kept | At the owner's difficulty step | USD per kept photo | Quota fill |
  |---|---|---|---|---|---|
  | Opus CR20 (the rule's result) | 20 | 80.0% | 35.0% | 0.0627 | 14.8% |
  | Opus CRall | 51 | 90.2% | 49.0% | 0.0804 | 59.3% |
  | Opus FR | 50 | 96.0% | 52.0% | 0.0760 | 55.6% |
  | Sonnet Rall | 51 | 94.1% | 66.7% | 0.0716 | 51.9% |
  | **Sonnet FR** | 51 | 94.1% | 64.7% | **0.0525** | 51.9% |
  | Haiku Rall | 48 | 91.7% | 56.3% | 0.0064 | 55.6% |

## Decision

1. **The intake method is Sonnet FR**, in place of the rule's Opus CR20.
   - **The reject pass:** Haiku (`claude-haiku-5-5`, effort `high`) judges every candidate photo of the species. Its rejects under rule `K3` drop out.
   - **The judge:** Sonnet (`claude-sonnet-5-5`, effort `high`) judges the rest with brief V1, in calls of 20 inside one species. `lib/step.mjs` gives keep and the difficulty step under rule `P`.
   - **The ranking:** one Sonnet agent for each cell, at effort `high`, ranks the photos that rule `K3` keeps, grouped by difficulty step (plan choices 8 and 9).
   - **The quota:** each cell fills in the ranked order, at each difficulty step.
2. **Too few photos is better than bad photos.** A cell that does not fill its quota stays short, and a later fetch fills it. The pipeline does not lower the bar to fill a quota.
3. **The decision rule's result is overruled on purpose.** Sonnet missed the shortlist on key v2 by 0.8 points of exact difficulty step (74.3% against a line of 75.1%). On the held-out set, Sonnet passes `heldoutCheck` with the Haiku reject pass (keep 80.8%, exact 61.6%) and without it (keep 81.3%, exact 62.3%). Of the photos it picks, the owner kept 94.1%, and 64.7% are at the owner's difficulty step. The picks of Opus FR are kept a little more often (96.0%), but they are at the owner's difficulty step less often (52.0%), and they cost more.

## Consequences

- Phase 4 (spec Part 4) builds this method into the pipeline and the skills. It moves `lib/step.mjs` into `app/logic/` unchanged, with the frozen brief V1 and the schema. Phase 4 is a separate plan.
- Phase 5, the audit of the photos in the manifest (spec Part 3), uses this method. It is a separate plan.
- An intake run spends about USD 0.05 per kept photo, from the held-out run. Most of the cost of each agent is its fixed context.
- No method spares the owner the photo check. On the held-out set, about 1 photo in 17 that Sonnet FR picks is one the owner dropped, and about 1 in 3 is at a different difficulty step from the owner's.
- **Open:**
  - The held-out set is 3 species of 2 genera (208 photos, 9 cells), and each set-up ran once. On the key, two Sonnet runs agreed on the exact difficulty step for 84.3% of the photos kept both times.
  - The quota per depth (ruling 1 of 2026-10-17) waits for the `depth` field of each species. Until then, every cell uses quota `Q332` (3, 3, and 2).

## What it replaces

- The candidate of the spec's decision rule (step 3 and 4), Opus CR20.
- The open item "the intake method (after the eval)" in `2026-10-17-v1-and-intake-rulings.md`.
