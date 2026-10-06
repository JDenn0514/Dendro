# Content run: leaf_topup

## Species

| Symbol | Status | Reason | leaf |
| --- | --- | --- | --- |
| QUVE | included |  | 5 |
| ACSA3 | included |  | 4 |
| QUMA2 | included |  | 3 |
| QUAL | included |  | 3 |
| PLOC | included |  | 3 |

## Channel gaps

| Symbol | Channel | Approved |
| --- | --- | --- |
| PLOC | leaf | 3 |
| QUAL | leaf | 3 |
| QUMA2 | leaf | 3 |

## Units

| Unit | Cards | Warning |
| --- | --- | --- |
| leaf_types | 8 |  |
| bark_types | 6 |  |
| fruit_types | 8 |  |

## Escalations

No escalations.

## Run counts

| Count | Value |
| --- | --- |
| candidates_bioimages | 64 |
| candidates_commons | 63 |
| candidates_inat | 62 |
| candidates_manual | 17 |
| candidates_tso | 47 |
| candidates_wildflower | 63 |
| verdicts_approve | 23 |
| verdicts_reject | 250 |
| fetch_failures | 0 |
| stop_rule_fired | no |

## Leaf photos in play after this run

The gap table above counts only this run's approvals. With the published rows (not retired, not hard), each target has 6 leaf photos in play, except QUVE, which has 5 (see the owner rulings below).

| Symbol | Before | Added | After |
| --- | --- | --- | --- |
| QUVE | 1 | 5 | 5 |
| ACSA3 | 2 | 4 | 6 |
| QUMA2 | 3 | 3 | 6 |
| QUAL | 3 | 3 | 6 |
| PLOC | 3 | 3 | 6 |

The judges ranked every leaf candidate of a target and approved the best ones up to 6. Lower-ranked usable leaf photos stay unjudged as reserves. Hard approvals (ACSA3 4, PLOC 1) do not count.

Owner rulings of 2026-10-06 on the review sheet:

- QUVE: the published iNaturalist row `1eb870d2` (Trevor Edmonson) shows a dead brown leaf. The owner set it hard and added no replacement, so QUVE has 5 in play (commit f838566). The reserve `90204f89` (Bioimages) stays unjudged.
- ACSA3: two hard approvals (`a950ed81`, `9cf9bbd3`) show fallen autumn leaves. The owner keeps them as hard. The 2 published leaf rows are autumn canopy photos (James St. John). The 4 new approvals are single green leaves.
- PLOC: approval `c724a45e` (Bioimages) is a full-size leaf lit from behind. The owner keeps it as a counted photo.
- Three approved iNaturalist CC0 rows (QUMA2 `0960fcfd`, QUAL `544ea70e`, PLOC `fdee60ef`) carry the credit `no rights reserved`, which is the iNaturalist attribution text for CC0.

## Sites checked

The fetch read Bioimages, wildflower.org, Trees and Shrubs Online, Wikimedia Commons, and iNaturalist (299 candidates, about 60 per target). After the first build, ACSA3 had 0 good leaf photos and PLOC had 2. Step 7 searched these sites for those two targets only, and stopped when each had enough candidates. No new source was needed, so no new site was checked.

| Site | Target | Looked at | Added | Licence | Notes |
| --- | --- | --- | --- | --- | --- |
| Bioimages (harvester) | ACSA3 | 9 | 4 | CC BY 4.0 | Left out crowded, backlit, cut off, distant canopy. |
| Trees and Shrubs Online (harvester) | ACSA3 | 0 | 0 | CC BY-SA 4.0 | No images past the fetched rows. |
| VT Dendrology, fact sheet ID 2 | ACSA3 | 1 | 1 | used with permission, non-commercial | About 250 px. |
| Wikimedia Commons, Category:Acer saccharum | ACSA3 | 42 | 5 | CC0, CC BY 2.0, CC BY-SA 4.0 | Left out drawings, scans, a name label, a file with no author name, autumn or dead leaves, young leaves, crowded seedlings, canopy. |
| iNaturalist, wildflower.org | ACSA3 | 0 | 0 |  | Not searched; enough candidates. |
| Bioimages (harvester) | PLOC | 3 | 2 | CC BY 4.0 | Left out a margin macro. |
| Trees and Shrubs Online (harvester) | PLOC | 2 | 0 | CC BY-SA 4.0 | Young leaves, autumn colour. |
| VT Dendrology, fact sheet ID 36 | PLOC | 1 | 1 | used with permission, non-commercial | About 250 px. |
| Wikimedia Commons, Category:Platanus occidentalis | PLOC | 39 | 2 | CC BY-SA 4.0 | Left out drawings, a name label, drawn arrows, frost-killed and spring leaves, too small, canopy. |
| iNaturalist API, research grade | PLOC | 40 | 2 | CC0 | Left out cut off, canopy, bark, seedlings, crowded, a painting. |
| wildflower.org | PLOC | 0 | 0 |  | Not searched; enough candidates. |
| Kew POWO | both | 0 | 0 |  | Not run; not needed. |

Final picks from step 7: ACSA3 `737f1973`, `68055389`, `b306d668` (Commons), `131dbcc6` (Bioimages); PLOC `fdee60ef` (iNaturalist).
