# Intake eval: the heldout table

Runs: heldout-judge, heldout-rank. Written by `analyze.mjs`. The full numbers, the kept photos of each method, and the source yield are in `table.json`.

Problems: none.

## Set-ups

A set-up is one model, effort, and prompt variant (`:n20`: calls of 20). `/F`: Haiku's reject pass first. Agreement is against the owner, on the photos the set-up judged. Exact and within one are on the photos that both keep. A thin-cell photo counts as kept at difficulty step 3.

On the held-out set, "part" is the judge's part against the owner's on every photo, and "kept, other part" counts the photos that both keep in different parts. A photo that the owner or the judge puts in the part other is a reject for keep.

| set-up | photos | no answer | part errors | part | kept, other part | keep | drop recall | exact difficulty step | within one | step 1 or not | usual look | USD per photo | minutes per 100 | thin cell |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku:high:V1:n20/P | 208 | 0 | 0 | 81.7% | 2 | 81.7% | 83.0% | 54.9% | 95.1% | 80.0% | - | 0.0013 | 12.9 | - |
| opus:high:V1:n20/P | 208 | 0 | 0 | 85.1% | 2 | 80.8% | 84.0% | 59.5% | 93.7% | 74.0% | - | 0.0197 | 7.1 | - |
| opus:high:V1:n20/P/F | 208 | 0 | 0 | 85.1% | 2 | 81.3% | 89.6% | 58.1% | 94.6% | 73.6% | - | 0.0197 | 7.1 | - |
| sonnet:high:V1:n20/P | 208 | 0 | 0 | 84.6% | 1 | 81.3% | 86.8% | 62.3% | 94.8% | 82.9% | - | 0.0138 | 16.5 | - |
| sonnet:high:V1:n20/P/F | 208 | 0 | 0 | 84.6% | 1 | 80.8% | 89.6% | 61.6% | 95.9% | 83.3% | - | 0.0138 | 16.5 | - |

## Batch size

Key only: the held-out set ran in calls of 20 alone.

## Repeat

No repeat run.

## Ranking cost lines

- opus: USD 0.1263 + 0.0014 × n, tokens 167940 + 336 × n, from 15 ranking jobs.
- sonnet: USD 0.0757 + 0.0009 × n, tokens 167568 + 364 × n, from 15 ranking jobs.
- haiku: USD 0.0046 + 0.0000 × n, tokens 168012 + 448 × n, from 9 ranking jobs.

## Methods

Quotas Q332 (the headline) and Q221. `Q332` rows that pass the gates: 0. The shortlist is provisional until Task 7 freezes a variant and a rule, so it is made per variant and rule: V1/P 0 rows (ids in `table.json`). S and F keep photos in fetch order and run as cost baselines only. Keep and the difficulty step come from the set-up row. "No ranking": cells with 2 or more photos to rank and no ranking, which keep fetch order. Q442 is in `table.json`.

| method | set-up | rule | quota | gates | judged | ranked | no ranking | quota fill | top pick | top of all after K | picks the owner kept | picks at the owner's step | USD | USD per photo | USD per kept photo | tokens per kept photo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S | haiku:high:V1:n20 | P | Q332 | fail | 208 | 0 | 0 | 55.6% | 33.3% | - | 85.4% | 54.2% | 0.2619 | 0.0013 | 0.0055 | 77088 |
| R20 | haiku:high:V1:n20 | P | Q332 | fail | 60 | 26 | 0 | 7.4% | 11.1% | 66.7% | 81.3% | 50.0% | 0.1043 | 0.0017 | 0.0065 | 119774 |
| R30 | haiku:high:V1:n20 | P | Q332 | fail | 90 | 43 | 0 | 14.8% | 22.2% | 66.7% | 90.9% | 63.6% | 0.1422 | 0.0016 | 0.0065 | 113390 |
| Rall | haiku:high:V1:n20 | P | Q332 | fail | 208 | 114 | 0 | 55.6% | 44.4% | - | 89.6% | 54.2% | 0.3088 | 0.0015 | 0.0064 | 109655 |
| CR20 | haiku:high:V1:n20 | P | Q332 | fail | 60 | 0 | 0 | 7.4% | 11.1% | 66.7% | 75.0% | 43.8% | 0.0753 | 0.0013 | 0.0047 | 56041 |
| CR30 | haiku:high:V1:n20 | P | Q332 | fail | 90 | 0 | 0 | 14.8% | 22.2% | 55.6% | 81.8% | 59.1% | 0.1078 | 0.0012 | 0.0049 | 59056 |
| CRall | haiku:high:V1:n20 | P | Q332 | fail | 208 | 0 | 0 | 55.6% | 44.4% | - | 83.3% | 56.3% | 0.2619 | 0.0013 | 0.0055 | 77088 |
| S | haiku:high:V1:n20 | P | Q221 | fail | 208 | 0 | 0 | 63.0% | 33.3% | - | 84.4% | 62.5% | 0.2619 | 0.0013 | 0.0082 | 115632 |
| R20 | haiku:high:V1:n20 | P | Q221 | fail | 60 | 26 | 0 | 22.2% | 11.1% | 66.7% | 85.7% | 50.0% | 0.1043 | 0.0017 | 0.0075 | 136884 |
| R30 | haiku:high:V1:n20 | P | Q221 | fail | 90 | 43 | 0 | 29.6% | 22.2% | 66.7% | 88.9% | 61.1% | 0.1422 | 0.0016 | 0.0079 | 138588 |
| Rall | haiku:high:V1:n20 | P | Q221 | fail | 208 | 114 | 0 | 63.0% | 44.4% | - | 93.8% | 56.3% | 0.3088 | 0.0015 | 0.0096 | 164482 |
| CR20 | haiku:high:V1:n20 | P | Q221 | fail | 60 | 0 | 0 | 22.2% | 11.1% | 66.7% | 78.6% | 50.0% | 0.0753 | 0.0013 | 0.0054 | 64047 |
| CR30 | haiku:high:V1:n20 | P | Q221 | fail | 90 | 0 | 0 | 29.6% | 22.2% | 55.6% | 77.8% | 55.6% | 0.1078 | 0.0012 | 0.0060 | 72179 |
| CRall | haiku:high:V1:n20 | P | Q221 | fail | 208 | 0 | 0 | 63.0% | 44.4% | - | 84.4% | 62.5% | 0.2619 | 0.0013 | 0.0082 | 115632 |
| S | opus:high:V1:n20 | P | Q332 | fail | 208 | 0 | 0 | 59.3% | 33.3% | - | 90.2% | 51.0% | 4.1020 | 0.0197 | 0.0804 | 83042 |
| R20 | opus:high:V1:n20 | P | Q332 | fail | 60 | 25 | 0 | 14.8% | 11.1% | 66.7% | 75.0% | 35.0% | 1.9203 | 0.0320 | 0.0960 | 100531 |
| R30 | opus:high:V1:n20 | P | Q332 | fail | 90 | 45 | 0 | 18.5% | 22.2% | 66.7% | 80.0% | 44.0% | 2.6186 | 0.0291 | 0.1047 | 110707 |
| Rall | opus:high:V1:n20 | P | Q332 | fail | 208 | 124 | 0 | 59.3% | 33.3% | - | 94.1% | 51.0% | 5.4079 | 0.0260 | 0.1060 | 113496 |
| CR20 | opus:high:V1:n20 | P | Q332 | fail | 60 | 0 | 0 | 14.8% | 11.1% | 55.6% | 75.0% | 35.0% | 1.2548 | 0.0209 | 0.0627 | 58126 |
| CR30 | opus:high:V1:n20 | P | Q332 | fail | 90 | 0 | 0 | 18.5% | 22.2% | 44.4% | 80.0% | 52.0% | 1.7995 | 0.0200 | 0.0720 | 69796 |
| CRall | opus:high:V1:n20 | P | Q332 | fail | 208 | 0 | 0 | 59.3% | 33.3% | - | 90.2% | 49.0% | 4.1020 | 0.0197 | 0.0804 | 83042 |
| F | opus:high:V1:n20 | P | Q332 | fail | 114 | 0 | 0 | 55.6% | 33.3% | - | 88.0% | 50.0% | 2.5183 | 0.0121 | 0.0504 | 120535 |
| FR | opus:high:V1:n20 | P | Q332 | fail | 114 | 108 | 0 | 55.6% | 44.4% | - | 96.0% | 52.0% | 3.8023 | 0.0183 | 0.0760 | 151490 |
| S | opus:high:V1:n20 | P | Q221 | fail | 208 | 0 | 0 | 66.7% | 33.3% | - | 91.2% | 58.8% | 4.1020 | 0.0197 | 0.1206 | 124564 |
| R20 | opus:high:V1:n20 | P | Q221 | fail | 60 | 25 | 0 | 33.3% | 11.1% | 66.7% | 68.8% | 31.3% | 1.9203 | 0.0320 | 0.1200 | 125664 |
| R30 | opus:high:V1:n20 | P | Q221 | fail | 90 | 45 | 0 | 40.7% | 22.2% | 66.7% | 75.0% | 40.0% | 2.6186 | 0.0291 | 0.1309 | 138383 |
| Rall | opus:high:V1:n20 | P | Q221 | fail | 208 | 124 | 0 | 66.7% | 33.3% | - | 100.0% | 55.9% | 5.4079 | 0.0260 | 0.1591 | 170244 |
| CR20 | opus:high:V1:n20 | P | Q221 | fail | 60 | 0 | 0 | 33.3% | 11.1% | 55.6% | 75.0% | 37.5% | 1.2548 | 0.0209 | 0.0784 | 72658 |
| CR30 | opus:high:V1:n20 | P | Q221 | fail | 90 | 0 | 0 | 40.7% | 22.2% | 44.4% | 80.0% | 50.0% | 1.7995 | 0.0200 | 0.0900 | 87245 |
| CRall | opus:high:V1:n20 | P | Q221 | fail | 208 | 0 | 0 | 66.7% | 33.3% | - | 94.1% | 55.9% | 4.1020 | 0.0197 | 0.1206 | 124564 |
| F | opus:high:V1:n20 | P | Q221 | fail | 114 | 0 | 0 | 66.7% | 33.3% | - | 91.2% | 58.8% | 2.5183 | 0.0121 | 0.0741 | 177258 |
| FR | opus:high:V1:n20 | P | Q221 | fail | 114 | 108 | 0 | 66.7% | 44.4% | - | 100.0% | 55.9% | 3.8023 | 0.0183 | 0.1118 | 222780 |
| S | sonnet:high:V1:n20 | P | Q332 | fail | 208 | 0 | 0 | 51.9% | 33.3% | - | 90.2% | 62.7% | 2.8679 | 0.0138 | 0.0562 | 67146 |
| R20 | sonnet:high:V1:n20 | P | Q332 | fail | 60 | 23 | 0 | 7.4% | 11.1% | 66.7% | 81.3% | 62.5% | 1.0981 | 0.0183 | 0.0686 | 93557 |
| R30 | sonnet:high:V1:n20 | P | Q332 | fail | 90 | 43 | 0 | 18.5% | 22.2% | 66.7% | 86.4% | 63.6% | 1.5293 | 0.0170 | 0.0695 | 93853 |
| Rall | sonnet:high:V1:n20 | P | Q332 | fail | 208 | 121 | 0 | 51.9% | 55.6% | - | 94.1% | 66.7% | 3.6529 | 0.0176 | 0.0716 | 97581 |
| CR20 | sonnet:high:V1:n20 | P | Q332 | fail | 60 | 0 | 0 | 7.4% | 11.1% | 55.6% | 81.3% | 62.5% | 0.7000 | 0.0117 | 0.0438 | 40668 |
| CR30 | sonnet:high:V1:n20 | P | Q332 | fail | 90 | 0 | 0 | 18.5% | 22.2% | 44.4% | 81.8% | 59.1% | 1.0384 | 0.0115 | 0.0472 | 47441 |
| CRall | sonnet:high:V1:n20 | P | Q332 | fail | 208 | 0 | 0 | 51.9% | 55.6% | - | 90.2% | 58.8% | 2.8679 | 0.0138 | 0.0562 | 67146 |
| F | sonnet:high:V1:n20 | P | Q332 | fail | 114 | 0 | 0 | 51.9% | 33.3% | - | 88.2% | 60.8% | 1.9042 | 0.0092 | 0.0373 | 109500 |
| FR | sonnet:high:V1:n20 | P | Q332 | fail | 114 | 108 | 0 | 51.9% | 55.6% | - | 94.1% | 64.7% | 2.6780 | 0.0129 | 0.0525 | 139842 |
| S | sonnet:high:V1:n20 | P | Q221 | fail | 208 | 0 | 0 | 70.4% | 33.3% | - | 91.7% | 66.7% | 2.8679 | 0.0138 | 0.0797 | 95124 |
| R20 | sonnet:high:V1:n20 | P | Q221 | fail | 60 | 23 | 0 | 29.6% | 11.1% | 66.7% | 78.6% | 57.1% | 1.0981 | 0.0183 | 0.0784 | 106922 |
| R30 | sonnet:high:V1:n20 | P | Q221 | fail | 90 | 43 | 0 | 37.0% | 22.2% | 66.7% | 88.2% | 64.7% | 1.5293 | 0.0170 | 0.0900 | 121457 |
| Rall | sonnet:high:V1:n20 | P | Q221 | fail | 208 | 121 | 0 | 70.4% | 55.6% | - | 94.4% | 69.4% | 3.6529 | 0.0176 | 0.1015 | 138240 |
| CR20 | sonnet:high:V1:n20 | P | Q221 | fail | 60 | 0 | 0 | 29.6% | 11.1% | 55.6% | 78.6% | 57.1% | 0.7000 | 0.0117 | 0.0500 | 46478 |
| CR30 | sonnet:high:V1:n20 | P | Q221 | fail | 90 | 0 | 0 | 37.0% | 22.2% | 44.4% | 82.4% | 58.8% | 1.0384 | 0.0115 | 0.0611 | 61394 |
| CRall | sonnet:high:V1:n20 | P | Q221 | fail | 208 | 0 | 0 | 70.4% | 55.6% | - | 94.4% | 63.9% | 2.8679 | 0.0138 | 0.0797 | 95124 |
| F | sonnet:high:V1:n20 | P | Q221 | fail | 114 | 0 | 0 | 70.4% | 33.3% | - | 91.7% | 66.7% | 1.9042 | 0.0092 | 0.0529 | 155125 |
| FR | sonnet:high:V1:n20 | P | Q221 | fail | 114 | 108 | 0 | 70.4% | 55.6% | - | 94.4% | 66.7% | 2.6780 | 0.0129 | 0.0744 | 198110 |

## The decision rule

The owner's repeat agreement (40 photos): keep 82.5%, exact difficulty step 63.2% (19 photos kept both times). The bar of `heldoutCheck`: keep 77.5%, exact 58.2%.
Shortlist from `tables/key-v2/` (the frozen set-ups, rule P, Q332, no fixed gates): best exact 80.1%, best keep 90.5%; 13 rows: R20/haiku:high:V1:n20/P/Q332, R30/haiku:high:V1:n20/P/Q332, Rall/haiku:high:V1:n20/P/Q332, CR20/haiku:high:V1:n20/P/Q332, CR30/haiku:high:V1:n20/P/Q332, CRall/haiku:high:V1:n20/P/Q332, R20/opus:high:V1:n20/P/Q332, R30/opus:high:V1:n20/P/Q332, Rall/opus:high:V1:n20/P/Q332, CR20/opus:high:V1:n20/P/Q332, CR30/opus:high:V1:n20/P/Q332, CRall/opus:high:V1:n20/P/Q332, FR/opus:high:V1:n20/P/Q332.

| checked, cheapest first | USD per kept photo | keep | exact difficulty step | check |
|---|---|---|---|---|
| CR20/haiku:high:V1:n20/P/Q332 | 0.0047 | 81.7% | 54.9% | fail |
| CR30/haiku:high:V1:n20/P/Q332 | 0.0049 | 81.7% | 54.9% | fail |
| CRall/haiku:high:V1:n20/P/Q332 | 0.0055 | 81.7% | 54.9% | fail |
| Rall/haiku:high:V1:n20/P/Q332 | 0.0064 | 81.7% | 54.9% | fail |
| R30/haiku:high:V1:n20/P/Q332 | 0.0065 | 81.7% | 54.9% | fail |
| R20/haiku:high:V1:n20/P/Q332 | 0.0065 | 81.7% | 54.9% | fail |
| CR20/opus:high:V1:n20/P/Q332 | 0.0627 | 80.8% | 59.5% | pass |

Candidate: CR20/opus:high:V1:n20/P/Q332.

## Species doubt

None.
