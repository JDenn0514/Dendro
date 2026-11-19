---
paths:
  - "app/**"
  - "index.html"
  - "tests/**"
---

# Rules for the app

These add to `CLAUDE.md`. They do not repeat it.

- The app has no runtime dependency and no build step. Do not add a package, a CDN script, or a bundler. A browser loads `app/` as it is in the repo.
- Check a screen change at 360 and 390 px wide, as `scripts/shots.py` does. The `verify-change` skill runs the checks.
- `scripts/CHECKLIST.md` and `docs/superpowers/specs/2026-09-24-app-visual-design.md` hold the look of each screen (for example: no all-caps label, no monospace, no pure black or white). A screen change keeps to them.
- Saved progress is in localStorage under the keys in `KEYS` (`app/logic/store.js`). When a change alters the shape of a saved section, raise `STORE_VERSION`, migrate the old shape in `migrateSection`, and add a test in `tests/store.test.js` that loads a section of the version before. A learner's progress must never stop loading.
- The photos in `content_dev/` are 1x1 placeholders. To see a real photo, open the app without `?content=dev`.
