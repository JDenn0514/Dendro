# Verification and review for agent work: design

Date: 2026-11-17. Status: a draft for the owner to review. No code, skill, hook, or rule file before the owner says go.

## 1. Goal and scope

### Goal

An agent shows that its change works before it says that the change is done, and a reviewer with a fresh context finds what the agent missed. The owner then reads evidence (commands, output, screens) instead of every line of a diff, and spends review time where a mistake costs most.

### Sources

- **V:** "How the Claude Code team thinks about verification", claude.dev, 2026-11-16.
- **R:** "Solving code review at Anthropic", claude.dev.
- **L:** "Building verification loops in Claude Code with skills", claude.com.
- **M:** "Claude Managed Agents", claude.com.
- The phase 4 intake plan, `docs/superpowers/plans/2026-11-13-intake-pipeline.md`, rulings 6 to 10 of 2026-11-17. Those rulings already apply V to the intake pipeline.

### Scope

- **In:** the app (`app/`, `index.html`, `tests/`), the pipeline outside the intake workflows (`pipeline/`), CI, the skills, `CLAUDE.md`, and how a pull request is checked and reviewed.
- **Out:** the intake pipeline. Rulings 6 to 10 cover it, and this spec does not change them. Where a rule here is the general form of one of those rulings, this spec says so.
- **Out:** `content/concepts.json`, `content/units.json`, and `content/features.json`. The owner writes them.

## 2. Facts checked on 2026-11-17

- **Tests:** `npm test` runs in about 1.7 s, and `npm run test:pipeline` runs in about 2.5 s. Both are fast enough to run at the end of every agent turn that changes code.
- **CI** (`.github/workflows/check.yml`) runs the app tests, the two validator runs, and `ids check --base origin/main`. It does not run the pipeline tests. The intake plan records the same gap (Facts, "The pipeline today").
- **The pipeline tests need the dev dependencies.** `chroma.test.ts`, `cli_audit.test.ts`, and `cli_fetch.test.ts` make and read real JPEGs with `sharp` (`pipeline/tests/fixtures/images.ts`). Without `node_modules`, those three files fail to load. With `npm ci`, all 567 pipeline tests pass. The CLI keeps the `CLAUDE.md` rule: `pipeline/cli.ts` loads `chroma.ts`, `sharp_resizer.ts`, and `s3_storage.ts` with `await import(...)`. (Corrected on 2026-11-17. The first draft called the import in `chroma.ts` a bug. It is not.)
- **No branch protection** on `main` (`gh api .../branches/main/protection` gives 404). The owner merges every pull request by hand.
- **No pull request template, no `REVIEW.md`, no hooks, no `.claude/rules/`, and no project subagents.** `.claude/` holds `settings.json` and five content skills.
- **Review today:** the owner asks for code-review agents on a pull request when the owner wants them (for example, "fix the findings of the code review" in #72). `code-review`, `simplify`, and `security-review` are `user-invocable-only` in `.claude/settings.json`, so an agent does not start them by itself.
- **Checking the app in a browser:** `scripts/audit.py` (overflow, tap targets, contrast) and `scripts/shots.py` (every screen at 360 and 390 px wide, root sizes 80, 100, and 130) use Python Playwright. Python Playwright is not installed on the owner's machine today. `scripts/CHECKLIST.md` is a list of what a person checks on each screen. It is already the "feature map" of V: a screen, what to do, and the expected result. Desktop sessions have the built-in browser.
- **Property tests:** none. `tests/helpers/rng.js` gives a seeded random number generator. CI does not run `npm install`, and the app has no dependencies, so `fast-check` is not an option without a CI change.
- **`CLAUDE.md`** is 78 lines. Every session and every review loads it.

## 3. Where each kind of guidance goes

| What it is | Where | Why |
|---|---|---|
| A rule for every session in the repo | `CLAUDE.md`, a few lines | Always loaded, so it stays short. R: "keep it short and link to other docs". |
| A rule for one area only | `.claude/rules/<area>.md` with `paths:` frontmatter | Loads only when a session reads or edits a matching file. |
| A procedure at a known moment | A skill in `.claude/skills/` | L: one skill means every session runs the same check. |
| What a reviewer must look for | `REVIEW.md` at the repo root | V and R: the owner of the code writes it, and the reviewer reads it from `main`. |
| A review with a fresh context | A subagent in `.claude/agents/` | R: a context that did not write the code. |
| A check that must run every time | A hook in `.claude/settings.json`, or a CI step | V: an instruction is advice, and a hook or a CI step always runs. |
| A rule that code can check | A test, a CLI check, or a CI step | Ruling 10 of the intake plan, made general. |

## 4. Proposals

Each proposal names its source, where it goes, and its draft wording where it adds text. The draft wording is the text an agent would write in the build. The owner can cut any proposal.

### 4.1 The cheap checks run on every pull request (V, R)

1. **CI runs the pipeline tests in a second job, `pipeline`.** It runs `npm ci`, then `node --test "pipeline/tests/**/*.test.ts"`. The intake plan's hash check (Task 1, choice 22) then runs in CI too.
2. **The `check` job stays install-free.** It still proves that the app tests, the validator, and `ids check` load without `sharp` and the S3 client. The deploy needs both jobs, and branch protection requires both.

Owner ruling of 2026-11-17: a second job, not `npm ci` in `check`.

### 4.2 The tests run before an agent ends a turn (V)

A `Stop` hook in `.claude/settings.json` runs `npm test` and `npm run test:pipeline` when code under `app/`, `pipeline/`, `tests/`, or `scripts/` changed and is not pushed: an uncommitted change, or a commit that is not on the branch's upstream (`origin/main` when the branch has none). An agent that commits in its turn is still checked. `pipeline/runs/` and `pipeline/data/` are left out, because a content run's CLI commits its data there (`runPaths` in `pipeline/lib/run.ts`). When the base ref is missing, the hook runs the tests. When a suite fails, the hook gives the failure to the agent, and the agent fixes it before it ends the turn. When the hook already blocked once in the turn (`stop_hook_active`), it lets the turn end, so an agent cannot loop on it.

- The script goes in `.claude/hooks/run-tests.sh`, so the owner can read it apart from the settings.
- V says to start a new gate in observe mode. These suites are fast, need no network, and have no flaky test today. The proposal is to **enforce from the start**. The other choice is one week in observe mode, where the hook logs what it would block and blocks nothing (Owner decision D2).

### 4.3 A skill that runs the change (V, L)

A project skill, `verify-change` (`.claude/skills/verify-change/SKILL.md`). V calls the "run the change" check the one to have if a team has only one. The skill uses the name `verify-change` and not `verify`, so it does not hide the built-in `/verify` skill (Owner decision D1).

The skill reads `git diff --name-only origin/main...HEAD` and the working tree, and runs the sections that match:

- **App** (`app/`, `index.html`, `content_dev/`):
  1. Serve the repo root on a free port, and open `index.html?content=dev` in the built-in browser at 390 px wide.
  2. Open each screen of `scripts/CHECKLIST.md` that the diff touches. A change to `app/logic/` or `app/main.js` touches every screen. Do the action of each line, and record yes or no.
  3. Read the console. Any error is a fail.
  4. When Python Playwright is installed, run `scripts/audit.py`. When it is not, say so in the report. Do not install it.
  5. Answer a few cards in a session, and open the reveal.
- **Pipeline** (`pipeline/`):
  1. Run the CLI command that the diff changes, with `--help` and against the fixtures of its test, and show the output.
  2. Run `npm run validate`, `npm run validate:dev`, and `node pipeline/cli.ts ids check --base origin/main`.
- **Every change:** run `npm test` and `npm run test:pipeline`.

The report starts with one line: pass, or the count of fails. Then it lists each check, the command or the screen, and what the agent saw. It never says "it works" without the output that shows it (R: "show the output rather than claim the work is done").

When a check still fails after three rounds of fixes, the agent stops and tells the owner what fails and what it tried (V; ruling 8 of the intake plan, made general).

### 4.4 `REVIEW.md`: what a reviewer looks for in Dendro (V, R)

A new file at the repo root, which the owner owns. V's "reliability checklist triggered by the diff" is the core: each item has a trigger that a reviewer can see in a diff, a check, and where the item came from. A reviewer checks only the items whose triggers match.

Draft:

```markdown
# REVIEW.md

The owner writes this file. A reviewer reads it from `main`, not from the pull request.

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
- A pull request that says a change works, but does not show the commands and their output or the `verify-change` report, is an Important finding.
- Wording: in specs, plans, decisions, and skills, prose that breaks Simplified Technical English or the words of `GLOSSARY.md` is Important, because that text steers agents. In code comments it is a Nit.

## Skip

- `content/species.json`, `content/images/manifest.json`, and `pipeline/runs/**/*.jsonl`. The CLI writes them, and the validator checks them.
- `evals/*/runs/`, `docs/design/`, and `prototype/`.

## Checks by trigger

| Trigger in the diff | Check | Origin |
|---|---|---|
| `app/logic/store.js`, or the shape of a saved section | An old saved section still loads through `migrateSection`. A test loads a section of the version before. | The learner-loses-progress failure |
| `app/logic/content.js` | `content/` and `content_dev/` still validate. A new rule has a test that the old content passes or fails on purpose. | |
| A new `source` value in the manifest | `app/logic/sources.js` has the entry. | `CLAUDE.md` |
| `pipeline/lib/licenses.ts` or `app/logic/licenses.js` | The owner's permissions in `docs/decisions/` cover each new value. | |
| A new `import` of `sharp` or `@aws-sdk`, or of a module that imports them | `pipeline/cli.ts` loads that module with `await import(...)`. The `check` job of CI proves this for the paths it runs. | `CLAUDE.md` |
| An `import` in `app/` | It does not reach `pipeline/` or `evals/`. | `CLAUDE.md` |
| A pipeline call that reaches the network | It goes through the injected `fetchImpl`, and its test does not use the network. | `CLAUDE.md` |
| `.github/workflows/` | The owner reviews it. Deploy keeps `include-hidden-files`. CI keeps working without `npm install`. | |
| A test file and the code it tests change together | An assertion that changed (not one that was added) has its reason in the pull request. | V: a change cannot change its own check |
| `.claude/skills/photo-check/SKILL.md` | The intake plan's frozen files do not change because of it. | Intake plan, Facts |
| `CDN_BASE` | The trailing `/` stays. | `CLAUDE.md` |
| `content_src/species/*.json` or `look_for.json` of a run | Each field and look-for line is supported by a reference in its `ref`. Read `pipeline/sources/<SYMBOL>.json` when it exists, else the named page. An unsupported claim is Important. | The content-lies failure; the owner checks this by hand today (`species-draft`) |
| A spec, plan, or decision under `docs/` | Each file, function, and line number it cites exists on the branch. Numbers from evals are not checked. | Owner ruling of 2026-11-17 |
```

The rule that a reviewer reads `REVIEW.md` from `main` (V: "changes can't modify their own checks") goes into the reviewer subagent of 4.5: it reads `git show origin/main:REVIEW.md`. A pull request that changes `REVIEW.md` gets its change reviewed by the owner, and the new text applies only after it merges.

The owner adds an item when a bug reaches `main` or the owner corrects the same thing twice (V, "Turn misses into rules"). An agent may propose an item in its report. It does not add one.

### 4.5 A reviewer subagent with a fresh context (R, V)

`.claude/agents/reviewer.md`. Read-only tools: Read, Grep, Glob, Bash for `git` and the test commands only, and the built-in browser's page-reading tools for the references of a species file. It reads `CLAUDE.md`, `REVIEW.md` from `origin/main`, the pull request's goal (the issue or the plan task), and the diff. It reports in the format of `REVIEW.md`.

Its rules for rounds, from R:

- Three rounds at most. After the third, it tells the owner to look at the approach.
- After the first round, it reviews only the new diff.
- It does not repeat a finding that it already gave.

Because `code-review` and `simplify` stay `user-invocable-only`, this subagent is the one review an agent runs by itself, before it opens a pull request. The owner can still ask for the full code review. An agent's review never counts as the owner's approval (R).

### 4.6 A pull request template (R)

`.github/pull_request_template.md`:

```markdown
## What and why

## Testing
<!-- The commands, and the result of each. The verify-change report. -->

## Risk
<!-- High, medium, or low, and the paths that set it. -->

## How to revert

Verified: <!-- tests, verify-change (app | pipeline), reviewer rounds — or none -->
```

The `Verified:` line is V's verification stamp in its smallest form. The owner can see which pull requests went out without a check. A commit gate (V) is not in this spec. If the stamp shows unverified changes that cause trouble, a gate is a later plan, and it starts in observe mode.

**Risk tiers** (R: the change sets the tier, not the author). The reviewer gives the tier, and the owner uses it to choose how closely to read:

- **High:** `.github/workflows/`, `app/logic/store.js`, `app/logic/content.js`, `pipeline/lib/ids.ts`, the two licence files, `app/logic/sources.js`, and the frozen intake files.
- **Medium:** other code in `app/` and `pipeline/`.
- **Low:** docs, tests only, `evals/`, and skill text.

### 4.7 A few lines in `CLAUDE.md` (V, R)

A new section, `## Verification`, after `## Tests and CI`. Draft:

```markdown
## Verification

- Before you report a code change as done, run the `verify-change` skill and put its report in your answer. Show the output. Do not say "it works" without it.
- A check that still fails after three rounds of fixes: stop, and tell the owner what fails and what you tried.
- A flaky test: do not skip it, add a sleep, or run it again until it passes. Find the cause. If you cannot, tell the owner.
- Do not change an existing assertion in the same change as the code it tests unless the pull request says why.
- A rule that code can check is a test, a CLI check, or a CI step, not text.
- Before you open a pull request, run the `reviewer` subagent. `REVIEW.md` says what it looks for.
```

The intake plan's ruling 8 (three attempts) and ruling 10 (code, not text) stay in that plan. These lines are their general form.

### 4.8 Rules for one area (`.claude/rules/`)

Two files with `paths:` frontmatter:

- `.claude/rules/app.md` (`app/**`, `index.html`, `tests/**`): check a screen change at 360 and 390 px wide; keep the app free of dependencies; a change to a saved section keeps old progress loading.
- `.claude/rules/pipeline.md` (`pipeline/**`): the lines of `CLAUDE.md` that apply only to the pipeline (erasable TypeScript, `fetchImpl`, the lazy loads, `maxBuffer`, `path.join`).

**The open question is whether to move lines out of `CLAUDE.md`** (Owner decision D3). Moving them makes `CLAUDE.md` shorter. But a reviewer loads `CLAUDE.md` and might not load a rules file. The proposal is to **add the two files with the new lines only, and move nothing**, until the owner has used them on a few changes.

### 4.9 Property tests and differential tests (V)

Written with the seeded generator in `tests/helpers/rng.js`, not `fast-check`, because CI has no `npm install` and the app has no dependencies. Each test runs a few hundred seeded cases and prints the seed of a failure. Candidates, which the plan checks against the code:

- **Round trip:** a saved section survives export, import, and `migrateSection` unchanged (`app/logic/store.js`). `writeJsonl` and then `readJsonl` gives the same rows (`pipeline/lib/jsonl.ts`).
- **Invariants:** `scheduleCard` never gives a due date before today, and a correct answer never lowers a card's tier (`app/logic/scheduler.js`). `appendOnlyErrors` is empty for any content that only adds IDs or retires them, and is not empty when any published ID is gone (`pipeline/lib/ids.ts`).
- **Idempotency:** `normalizeName(normalizeName(x))` equals `normalizeName(x)` (`pipeline/lib/verdicts.ts`). Applying the same verdict rows twice gives the same result as once.
- **Differential:** `build` with no new rows writes `content/species.json` and the manifest byte for byte the same (if `build` is deterministic; the plan checks). Phase 5 (the photo audit) is a migration of the published photos, so its plan can compare the photos in play before and after, with a list of the changes the owner approved.

### 4.10 What this spec does not adopt

- **Claude Managed Agents (M).** A content run needs the owner's photo check, the built-in browser for POWO, and the session's Workflow tool. Nothing in Dendro has to run without a person present. M also adds a cost per session-hour. The one idea that carries over, a separate grader with a rubric, is already the photo check and the owner's check. Look at M again if a content run or the phase 5 audit must run on a schedule, or becomes too long for one session.
- **A commit gate** (V). The `Verified:` line of 4.6 comes first.
- **An eval of the reviewer from past incidents** (V, R). Dendro does not yet have enough reverted or fixed changes to grade a reviewer. The `REVIEW.md` origins column starts that record.
- **A merge queue, feature flags, and staged releases** (R). One owner merges by hand, and the site is static.
- **A security review that blocks** (R). The attack surface is small. The owner can run `/security-review` on a change to `.github/workflows/` or to the R2 upload.

## 5. Owner decisions

- **D1.** The name of the skill: `verify-change` (proposed), or `verify`, which hides the built-in skill of the same name.
- **D2.** The `Stop` hook: enforce from the start (proposed), or one week in observe mode.
- **D3.** `.claude/rules/`: add new lines only (proposed), or also move the pipeline-only lines out of `CLAUDE.md`.
- **D4.** Branch protection on `main` that requires the `check` job. Only the owner can set it, in GitHub's settings. It is not part of the build.
- **D5.** Install Python Playwright, so `verify-change` can run `scripts/audit.py`. Without it, the skill uses the built-in browser only, and says that `audit.py` did not run.
- **D6.** `REVIEW.md`: the owner edits the draft of 4.4 before it lands, because V and R both say the owner of the code writes it.

## Rulings of 2026-11-17

1. **D1.** The skill is `verify-change`.
2. **D2.** The `Stop` hook enforces from the start.
3. **D3.** `.claude/rules/` gets new lines only. No line moves out of `CLAUDE.md`.
4. **D4.** Branch protection on `main` requires the `check` job. Set on 2026-11-17, with no required review, because the owner is the only reviewer. The rule does not bind admins (`enforce_admins: false`), so the owner can still merge past a red check on purpose. Force pushes and deletion of `main` are blocked. The `pipeline` job of 4.1 is required too, from the pull request that adds it.
5. **D5.** Python Playwright and its Chromium are installed on the owner's machine, so `verify-change` runs `scripts/audit.py`.
6. **D6.** The draft of 4.4 is set from the owner's answers of 2026-11-17:
   - The four failures (content lies, lost progress, a published ID gone, the site breaks) are always Important.
   - Wording that breaks Simplified Technical English or `GLOSSARY.md` is Important in specs, plans, decisions, and skills, and a Nit in code comments.
   - In a spec, plan, or decision, the reviewer checks that each cited file, function, and line exists. It does not check eval numbers.
   - The reviewer checks each authored species field and look-for line against its reference.
   - A claim that a change works, without the output that shows it, is Important.
   - No new rules for tests. The draft's row on a changed assertion stays.
   The owner adds rows over time, from bugs that reach `main` and from review comments the owner gives twice.

## 6. Order of work

Each item is one pull request. The owner merges each one.

1. `fix/ci-pipeline-tests`: the `pipeline` job of CI (4.1).
2. `skills/review-md`: `REVIEW.md`, the pull request template, and the `CLAUDE.md` section (4.4, 4.6, 4.7).
3. `skills/reviewer-agent`: the reviewer subagent (4.5).
4. `skills/verify-change`: the skill (4.3). Done when the skill runs on one app change and one pipeline change, and its report shows each check.
5. `skills/stop-hook`: the hook (4.2).
6. `skills/area-rules`: the two rules files (4.8).
7. `feat/property-tests`: the property and differential tests (4.9).

Item 1 does not wait for the rest.
