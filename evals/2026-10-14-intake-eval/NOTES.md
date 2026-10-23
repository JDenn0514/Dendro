# Intake eval: notes

The progress log of the intake eval. The plan is `docs/superpowers/plans/2026-10-21-intake-eval.md`. One line per finished step group, with run IDs and costs.

- 2026-10-21, Task 1 (#50): Copied the harness from `evals/2026-10-07-selection-eval/`. Removed the owner's old pages (`server.mjs`, `pick.html`, `blind.html`, `blind.mjs`, `check-picks.mjs`, `tracer-row.mjs`, `lib/picks.mjs`), `chooseTargets`, and their tests. Also removed `pools.mjs`, because it needs `chooseTargets` and Tasks 2 and 8 replace it. `lib/paths.mjs` gives `ROOT` and `EVAL`. Added `config.json` with the new keys and `lib/step.mjs` (`stepOf`, `codeOrder`, `cellSteps`) with `test/step.test.mjs`. Agents 0. Cost USD 0.
- 2026-10-21, Task 2 (#51): `key-pools.mjs` wrote `key/pools.json`: 211 photos, 21 cells, cell sizes 5 to 12, 170 published. The pool holds no agent suggestion of `data.js` and no owner note. `lib/fetch.mjs` downloads with the eval User-Agent at the per-host rate of `RATE_PER_SECOND`, and sends the 2 `upload.wikimedia.org` photos through the 1280 px `thumb.wikimedia.org` thumbnail. `images.mjs --set key` made 211 copies at 440 px at most (10 small originals stay smaller, as in the old script) and 21 cell sheets; `key/img-failures.json` is empty. Wrote `briefs/judge-V1.md`, `judge-V2.md`, and `rank.md`, the new schemas, and the plans `tracer`, `tracer-effort`, `key-high`, and `key-effort` of `make-workflow.mjs`. First estimates (old USD per photo plus 30%; no token counts until the tracer): tracer 10 agents, USD 0.81 (0.40 to 1.62); key-high 132 agents, USD 15.38 (7.69 to 30.77). Owner ruling 2026-10-21: judges see only an opaque photo code (p001 to p211, from config.seed + 1), never the key, because the key names the part; the 440 px copies are named by the code, and the photos of each call are in a shuffled order. Agents 0. Cost USD 0.
- 2026-10-21, Task 2 (#51), owner rulings: (1) `data.js` lists 17 of the 21 cells by the agent's suggested difficulty step, so its order no longer stands in for fetch order (plan choice 2). Each cell takes a shuffle fixed by `config.seed + 1`, and the key numbers follow it; now no cell is in suggested-step order. (2) The results tables go in `tables/<set>/`, not `out/<set>/`, because the root `.gitignore` ignores every `out/` folder. The plan is updated for both. (3) The judge brief says that close study is `search`, not a reject, and that `feature_unclear` goes only with a key photo feature at `no`. Agents 0. Cost USD 0.
- 2026-10-23, Task 3 (#52), part 1, the tracer: run `wf_c2f73f7e-873`, 10 of 10 agents returned. Each transcript ran the model of its job, and the three model checks named the right model ("Claude Opus 5.5", "Sonnet 5.5", "Haiku 5.5"). Every key came back once, no photo is `unread`, every answer passed the schema (one Opus V2 answer was not valid JSON at first, and the tool layer had it retry), and `stepOf` ran on all 60 answers. USD 1.76 against an estimate of 0.81. The ranking agent: USD 0.0086 for 6 photos.
- 2026-10-23, Task 3 (#52), part 2, the effort tracer: run `wf_cd682e78-7dd`, 6 of 6 agents returned, with the model of each job. Every key came back once, no photo is `unread`, and `stepOf` ran on all 60 answers. USD 1.03. The plan `key-high` of `make-workflow.mjs` is now `key-judge`, the name in the plan. `estimate.mjs --from` takes several runs.

The 9 set-ups on the same 10 key photos, V1 (input tokens include cache reads and writes; agreement is against the owner's calls, part included):

| Set-up | Input tokens per photo | Output tokens per photo | USD per photo | Minutes per 100 photos | Keep agrees | Keep and difficulty step agree |
|---|---|---|---|---|---|---|
| opus medium | 16,880 | 468 | 0.0209 | 7 | 9/10 | 8/10 |
| opus high | 22,794 | 569 | 0.0449 | 9 | 9/10 | 8/10 |
| opus xhigh | 23,489 | 1,277 | 0.0413 | 21 | 8/10 | 7/10 |
| sonnet medium | 16,884 | 503 | 0.0124 | 6 | 7/10 | 5/10 |
| sonnet high | 16,919 | 720 | 0.0245 | 9 | 8/10 | 6/10 |
| sonnet xhigh | 16,890 | 1,785 | 0.0243 | 22 | 8/10 | 7/10 |
| haiku medium | 16,906 | 1,925 | 0.0013 | 14 | 7/10 | 4/10 |
| haiku high | 16,935 | 2,008 | 0.0019 | 15 | 7/10 | 4/10 |
| haiku xhigh | 26,678 | 4,391 | 0.0030 | 32 | 8/10 | 7/10 |

Ten photos are too few to judge quality. The table is for cost. V2 at `high`, USD per photo: Opus 0.0342, Sonnet 0.0157, Haiku 0.0016; V2 output per photo is 1.3 to 1.6 times V1's.

What the costs mean:

- Each agent reads a fixed context of about 150k to 170k tokens (system prompt, tools, `CLAUDE.md`, and the brief) before its 10 photos. That fixed part is most of the cost.
- The three `high` V1 calls ran first and wrote about 60k tokens to the cache; the later calls wrote about 17k. With a warm cache, `high` costs about Opus 0.023, Sonnet 0.014, and Haiku 0.0014 per photo, close to the plan's estimates. A large run still pays the cold cost on its first wave of parallel calls, so the estimates below use the measured numbers.
- `medium` costs about half of `high`. `xhigh` costs about the same as `high` for Opus and Sonnet, and 1.6 times for Haiku, and takes 2 to 3 times as long.

New estimates, from the measured USD per photo (Tasks 6 and 9 assume `high` and V1; a ranking agent is the measured Haiku ranking token mix at each model's rates: Opus 0.32, Sonnet 0.17, Haiku 0.009 USD). The range is 0.75 to 1.5 times the point estimate.

| Task | Work | Agents | Plan's USD | New USD (range) |
|---|---|---|---|---|
| 5 | Key judge, V1 and V2 at `high` (`--plan key-judge`) | 132 | 15 (11 to 25) | 26 (19 to 39) |
| 5 | Key effort runs, V1 at `medium` and `xhigh` | 132 | 17 (11 to 28) | 22 (16 to 33) |
| 6 | Key repeat 15, R ranking 10.6, FR ranking 10.4 | up to 171 | 16.5 (11 to 25) | 36 (27 to 54) |
| 9 | Held-out judge 14.8, R ranking 4.6, FR ranking 4.5 | up to 111 | 12.5 (8 to 19.5) | 24 (18 to 36) |

Every model costs more than 1.5 times its plan estimate at `high` (Opus 1.95, Sonnet 1.96, Haiku 1.87), so the owner's yes for Tasks 5 and 6 must show these numbers. Agents 16. Cost USD 2.79.
- 2026-10-23, Task 5 (#54), part 1, the key judge, V1 and V2 at `high`, calls of 10: run `wf_e73160d3-efe`, 132 of 132 agents returned, with the model of each job. No photo is `unread`. Two Sonnet V1 calls (`b05`, `b14`) each left out one photo (`ACSA3-leaf-10`, `LITU-fruit-03`). A resume gives cached answers back, so a new run `wf_58284c34-28a` (`wf/key-judge-retry.js`, the same 2 jobs) ran them again: 2 of 2 returned, and `collect.mjs` takes their answers. Every set-up now has 211 answers, `stepOf` ran on all 1,266, and `check-run.mjs` shows no problem. Six answers were not valid JSON at first, and the tool layer had each retry. USD 17.57 (estimate 26, cap 39): Opus V1 4.98, V2 5.22; Sonnet V1 3.11 (3.46 with the re-run), V2 3.24; Haiku V1 0.31, V2 0.35. Agents 134.
- 2026-10-23, Task 5 (#54), part 1b, the batch-size test, V1 at `high`, calls of 20: run `wf_b5bf8217-24e`, 33 of 33 agents returned, with the model of each job. No photo is missing or `unread`, `stepOf` ran on all 633 answers, and `check-run.mjs` shows no problem. One answer was not valid JSON and one missed a schema field at first; the tool layer had each retry. USD 6.96 (estimate 8, cap 15): Opus 4.07 (calls of 10: 4.98), Sonnet 2.51 (3.11), Haiku 0.38 (0.31). Minutes per 100 photos against calls of 10: Opus 14.9 (17), Sonnet 16.8 (16.8), Haiku 29.4 (31.6). Agents 33. The accuracy result waits for `analyze.mjs` (Task 4, #53).
