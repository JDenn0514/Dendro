---
paths:
  - "app/**"
  - "index.html"
  - "tests/**"
---

# Rules for the app

These add to `CLAUDE.md`. They do not repeat it.

- Do not add a package, a CDN script, or a bundler. A browser loads `app/` as it is in the repo.
- Check a screen change at 360 and 390 px wide, as `scripts/shots.py` does. The `verify-change` skill runs the checks.
- `scripts/CHECKLIST.md` and `docs/superpowers/specs/2026-09-24-app-visual-design.md` give the look of each screen. For example: no all-caps label, no monospace, and no pure black or pure white. A screen change must agree with them.
- Saved progress is in localStorage under the keys in `KEYS` (`app/logic/store.js`). When a change makes a saved section a new shape, do these three steps:
  1. Raise `STORE_VERSION`.
  2. Migrate the old shape in `migrateSection`.
  3. Add a test in `tests/store.test.js` that loads a section of the version before.
- The photos in `content_dev/` are 1x1 placeholders. To see a real photo, open the app without `?content=dev`.
