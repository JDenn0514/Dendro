---
paths:
  - "pipeline/**"
---

# Rules for the pipeline

These add to `CLAUDE.md`. They do not repeat it.

- Most CLI commands write a run file or commit with `git add -A`. To test a change to a command, add or change a `cli_*.test.ts` test. Do not run the command on the repo. `ids check` is the one command that is safe to run.
- A test of a command injects its effects: HTTP through `fetchImpl`, git and other processes through `fakeExec` (`pipeline/tests/helpers.ts`), and images through an injected `resize` or `chroma`. Read the effects of a command from `changes(exec)`.
- A new host the pipeline fetches from gets its rate in `RATE_PER_SECOND` and its cache lifetime in `CACHE_DAYS` (`pipeline/lib/http.ts`), and in `MAX_IN_FLIGHT` when it serves images. A host that serves files for another host goes in `HOST_GROUP`.
- `pipeline/runs/` and `pipeline/data/` hold data that the CLI writes and commits (`runPaths` in `pipeline/lib/run.ts`). Do not edit them by hand. The Stop hook does not run the tests for a change there.
