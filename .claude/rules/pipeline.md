---
paths:
  - "pipeline/**"
---

# Rules for the pipeline

These add to `CLAUDE.md`. They do not repeat it.

- To test a change to a CLI command, add or change a `cli_*.test.ts` test. Do not run the command on the repo. Most commands write a run file or commit. Only `ids check` and `photos audit` write nothing to the repo, and `photos audit --manifest` uses the network.
- A command test also injects git and other processes through `fakeExec` (`pipeline/tests/helpers.ts`), and images through an injected `resize` or `chroma`. Read what the command changed from `changes(exec)`.
- A new host that the pipeline fetches from needs an entry in `RATE_PER_SECOND` and in `CACHE_DAYS` (`pipeline/lib/http.ts`). Add an entry in `MAX_IN_FLIGHT` when the host allows more than 1 request at a time. A host that serves files for another host goes in `HOST_GROUP`.
- `pipeline/runs/` and `pipeline/data/` hold data that the CLI writes and commits (`runPaths` in `pipeline/lib/run.ts`). Do not edit them by hand. The Stop hook does not run the tests for a change there.
