---
name: verify-change
description: Use before you report a change to Dendro code as done, and before you open its pull request. Runs the change (the app in a browser, the pipeline through its tests and checks) and writes a report with the evidence.
---

# Verify change

You show that a change works by running it, not by reading it. The report you write is
the evidence. The owner reads it, and it goes in the pull request's Testing section.

## 1. Find what changed

```
git fetch origin
git diff --name-only origin/main...HEAD
git status --short
```

Take the files of both lists. Then run each section below whose paths match. Run section 4
always.

| Paths | Section |
|---|---|
| `app/`, `index.html`, `content_dev/` | 2. The app |
| `pipeline/`, `scripts/validate_content.js` | 3. The pipeline |
| `content/`, `content_src/` | 3, steps 3 and 4 only |
| Any | 4. The tests |

Docs, skills, and `REVIEW.md` alone need section 4 only.

## 2. The app

1. **Start the server.** In the desktop app, start `dendro` from `.claude/launch.json` with
   `preview_start`. Elsewhere, run `python3 -m http.server 8011` from the repo root in the
   background, and stop it when you are done. The app URL is
   `http://localhost:<port>/index.html?content=dev`.
2. **Pick the screens.** A change to `app/logic/`, `app/ui/`, `app/main.js`,
   `app/style.css`, or `index.html` touches every screen. A change to
   `app/screens/<name>.js` touches that screen. `concept.js` draws "Progress, one shape"
   (`#/progress/<part>/<key>`, `progress-shape` in `ROUTES`). `session.js` also draws
   `#/placement`. The other screens and their routes are in `ROUTES` in `scripts/shots.py`.
3. **Open each screen** in the built-in browser at 390 px wide (`resize_window`). Do what
   the lines of `scripts/CHECKLIST.md` for that screen ask, and answer each line yes or no.
   Read a line's answer from the page (`get_page_text`, `find`, or `read_page`, or
   `javascript_tool` to measure), or from a screenshot when the line is about how the screen
   looks. Click by the `ref` that `find` gives, not by a coordinate read off a scaled
   screenshot.
   - Every photo in `content_dev/` is a 1x1 black placeholder. For a line about a photo,
     open the same screen without `?content=dev`. That loads `content/` and the photos from
     the CDN. When the CDN cannot be reached, write the line as "not checked: no photos".
   - A line that does not fit the screen as it is today (for example, a part the screen
     does not show): write "line does not apply", and say why.
4. **Read the console** of each screen (`read_console_messages`). An error is a fail.
5. **Play a session** on `?content=dev`. Answer up to three cards, at least one wrong and one
   right (a session of `content_dev/` can have fewer cards). Read the reveal. Reload, and
   check that the progress shows on the Progress screen. Then remove the progress you made:
   `localStorage.removeItem` of `dendro_cards`, `dendro_log`, and `dendro_missing_edges`.
6. **Run the audit** from the repo root:
   `DENDRO_BASE="http://localhost:<port>/?content=dev" python3 scripts/audit.py`.
   It passes when it exits 0 and its last line is `0 screen states with findings.` Each
   `FAIL` line is a fail. The `base`, `===`, and `ok` lines are not. When Python Playwright
   is not installed, write "audit.py did not run: no Playwright". Do not install it.

When there is no built-in browser (a terminal or a cloud session), do steps 1, 2, and 6.
Then run `DENDRO_BASE="http://localhost:<port>/?content=dev" python3 scripts/shots.py out/shots`
from the repo root, and look at the shots of
the screens you picked with the Read tool. Write steps 3 to 5 as "not checked: no browser".

Never mark a check pass that you did not do.

## 3. The pipeline

1. **Run the tests of each changed module.** For `pipeline/lib/<name>.ts`, run
   `node --test pipeline/tests/<name>*.test.ts` when such a file exists. A change to a
   command in `pipeline/lib/commands.ts` is driven by the `cli_*.test.ts` files. Run the
   ones that name the command.
2. **Run the changed command** only when it is `ids check`. Do not run another command:
   most write, fetch, or commit (`species list` and `report` commit with `git add -A`), and
   the rest need a run. Their `cli_*.test.ts` tests are the check for them.
3. `npm run validate` and `npm run validate:dev`.
4. `node pipeline/cli.ts ids check --base origin/main`.

## 4. The tests

```
npm test
npm run test:pipeline
```

When `test:pipeline` cannot load `sharp`, run `npm ci` first, then run it again.

## When a check fails

Fix the cause and run the section again. After three rounds with the same check still
failing, stop. Tell the owner what fails, the output, and what you tried.

## The report

Write it in this form:

```
verify-change: <pass | n fails>. Commit <short sha>.

Sections: <the sections you ran, and the paths that chose them>

| Check | Command or screen | Result |
|---|---|---|
| ... | ... | pass / fail: <what you saw> / not checked: <why> |

Output:
<the summary lines of each command: test counts, validator lines, audit total>
```

Put the report in your answer to the owner and in the pull request's Testing section. Give
the sections you ran in its `Verified:` line, for example `verify-change (app, pipeline)`.

## What this skill does not do

- It does not install a package, except `npm ci` for the pipeline tests.
- It does not run a pipeline command that writes, fetches, uploads, or commits.
- It does not change `scripts/CHECKLIST.md`. When a line of it is wrong for the current app,
  say so in the report.
- It does not review the code. The `reviewer` subagent does that.
