# REVIEW.md

What a reviewer looks for in a Dendro pull request. The owner writes this file. A reviewer reads it from `main` (`git show origin/main:REVIEW.md`), not from the pull request, so a change cannot change the checks that judge it. A change to this file applies after it merges.

The design is in `docs/superpowers/specs/2026-11-17-verification-and-review.md`, section 4.4.

## What failure looks like here

Each of these is Important, never a Nit:

- The content lies: a wrong species, a wrong credit, a licence that the allowlist does not cover, or a species field or look-for line that its reference does not support.
- A learner loses progress: saved progress in localStorage no longer loads, or resets.
- A published ID leaves the content.
- The site breaks: a screen does not open, the console shows an error, or the deploy fails.

## How to report

- Start with the count of findings. When there is nothing to fix, say so in one line.
- Give a file and a line for each finding. Do not guess from a name.
- Tag each finding Important, Nit, or Pre-existing. Do not blame the author for a Pre-existing finding.
- Five Nits at most.
- When one bug has a class, name the class, so the author fixes each instance.
- A pull request that says a change works, but does not show the commands and their output, is an Important finding.
- Wording: in specs, plans, decisions, and skills, prose that breaks Simplified Technical English or the words of `GLOSSARY.md` is Important, because that text steers agents. In code comments it is a Nit.
- Give the risk tier of the change (below), and the paths that set it.

## Risk tier

The change sets the tier, not the author. The owner uses it to choose how closely to read.

- **High:** `.github/workflows/`, `app/logic/store.js`, `app/logic/content.js`, `pipeline/lib/ids.ts`, `pipeline/lib/licenses.ts`, `app/logic/licenses.js`, `app/logic/sources.js`, and the frozen intake files (`app/logic/step.js` and `pipeline/intake/`, when they exist).
- **Medium:** other code in `app/` and `pipeline/`.
- **Low:** docs, tests only, `evals/`, and skill text.

## Skip

- `content/species.json`, `content/images/manifest.json`, and `pipeline/runs/**/*.jsonl`. The CLI writes them, and the validator checks them.
- `evals/*/runs/`, `docs/design/`, and `prototype/`.

## Checks by trigger

Check only the rows whose trigger is in the diff.

| Trigger in the diff | Check | Origin |
|---|---|---|
| `app/logic/store.js`, or the shape of a saved section | An old saved section still loads through `migrateSection`. A test loads a section of the version before. | The learner-loses-progress failure |
| `app/logic/content.js` | `content/` and `content_dev/` still validate. A new rule has a test that the old content passes or fails on purpose. | |
| A new `source` value in the manifest | `app/logic/sources.js` has the entry. | `CLAUDE.md` |
| `pipeline/lib/licenses.ts` or `app/logic/licenses.js` | The owner's permissions in `docs/decisions/` cover each new value. | |
| A new `import` of `sharp` or `@aws-sdk`, or of a module that imports them | `pipeline/cli.ts` loads that module with `await import(...)`. The `check` job of CI proves this for the paths it runs. | `CLAUDE.md` |
| An `import` in `app/` | It does not reach `pipeline/` or `evals/`. | `CLAUDE.md` |
| A pipeline call that reaches the network | It goes through the injected `fetchImpl`, and its test does not use the network. | `CLAUDE.md` |
| `.github/workflows/` | The owner reviews it. Deploy keeps `include-hidden-files`. The `check` job keeps working without `npm install`. | |
| A test file and the code it tests change together | An assertion that changed (not one that was added) has its reason in the pull request. | A change cannot change its own check |
| `.claude/skills/photo-check/SKILL.md` | The intake plan's frozen files do not change because of it. | Intake plan, Facts |
| `CDN_BASE` (`app/logic/content.js`) | The trailing `/` stays. | `CLAUDE.md` |
| `content_src/species/*.json`, or `look_for.json` of a run | Each field and look-for line is supported by a reference in its `ref`. Read `pipeline/sources/<SYMBOL>.json` when it exists, else the named page. An unsupported claim is Important. | The content-lies failure. The owner checks this by hand today (`species-draft`). |
| A spec, plan, or decision under `docs/` | Each file, function, and line number it cites exists on the branch. Numbers from evals are not checked. | Owner ruling of 2026-11-17 |

## Adding a row

The owner adds a row when a bug reaches `main`, or when the owner gives the same review comment twice. Each row has a trigger that a reviewer can see in a diff, a check, and its origin. An agent may propose a row in its report. It does not add one.
