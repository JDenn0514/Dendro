# Intake eval: notes

The progress log of the intake eval. The plan is `docs/superpowers/plans/2026-10-21-intake-eval.md`. One line per finished step group, with run IDs and costs.

- 2026-10-21, Task 1 (#50): Copied the harness from `evals/2026-10-07-selection-eval/`. Removed the owner's old pages (`server.mjs`, `pick.html`, `blind.html`, `blind.mjs`, `check-picks.mjs`, `tracer-row.mjs`, `lib/picks.mjs`), `chooseTargets`, and their tests. Also removed `pools.mjs`, because it needs `chooseTargets` and Tasks 2 and 8 replace it. `lib/paths.mjs` gives `ROOT` and `EVAL`. Added `config.json` with the new keys and `lib/step.mjs` (`stepOf`, `codeOrder`, `cellSteps`) with `test/step.test.mjs`. Agents 0. Cost USD 0.
