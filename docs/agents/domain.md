# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/decisions/`**: the owner's rulings, one dated file each. Read the rulings that touch the area you're about to work in. They do the job of ADRs in this repo.
- **`DESIGN.md` section 17**: the decisions log of 2026-09-21. It wins where it disagrees with the rest of `DESIGN.md`.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── GLOSSARY.md
├── DESIGN.md                          ← section 17 is the decisions log
├── docs/decisions/
│   ├── 2026-09-25-hosting-and-accounts.md
│   └── 2026-09-30-leaf-only-v1.md
├── app/
└── pipeline/
```

A new decision record goes in `docs/decisions/` with a dated name: `YYYY-MM-DD-<slug>.md`. Do not create `docs/adr/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts an existing record in `docs/decisions/`, surface it explicitly rather than silently overriding:

> _Contradicts `docs/decisions/2026-09-30-leaf-only-v1.md`, but worth reopening because…_
