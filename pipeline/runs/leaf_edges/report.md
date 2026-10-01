# Content run: leaf_edges

## Species

| Symbol | Status | Reason | leaf |
| --- | --- | --- | --- |

## Channel gaps

| Symbol | Channel | Approved |
| --- | --- | --- |

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
| fetch_failures | 0 |
| stop_rule_fired | no |

## Scope of this run

This run adds leaf confusion edges and marks one photo hard. It collects no photos and drafts no species.

Steps done: 1 (`run init --bucket simple_lobed --channels leaf`), 6 and 8 (`build`, after the edges), and 9.

Steps skipped:

- Step 2 (`species list`): the run adds no species. Every symbol in the new edges is already in `content/species.json`.
- Steps 3, 4, 5, and 7: no species files and no photos are in scope.

## Photo marked hard

`images difficulty da9dfb5115c4f4448204c15572881940adf594cb5f8cee09a84d8eadde4ff902 --set hard` (commit 1fafc74). The row is `leaf/scale_like`, Utah juniper, Wikimedia Commons, by Famartin. It shows a wall of crowded sprays taken from a distance. The row is not retired.

## Leaf edges added

Each of the 15 pairs had only a bark or fruit edge. 9 pairs got a leaf edge. Each edge uses only what one leaf photo can show: no leaf arrangement, sap, buds, or twigs. The research agents fetched each page as raw text and checked each quote word for word.

| # | Pair | What separates them | Strength |
| --- | --- | --- | --- |
| 4 | LIST2 sweetgum / PLRA California sycamore | Fine even teeth on a star leaf, against a smooth or few-toothed margin | Clear. The woolly underside of PLRA can wear off (TSO), so the sentence says "often". |
| 5 | ACPS sycamore maple / ACPL Norway maple | Coarse teeth all along the margin, against a few long pointed teeth | Clear |
| 6 | LIST2 sweetgum / PLOC American sycamore | Narrow star lobes with fine teeth, against shallow wide lobes with large uneven teeth | Clear |
| 8 | QUCO2 scarlet oak / QUPA2 pin oak | C-shaped sinuses and tiny axil tufts, against U-shaped sinuses, bent-back lowest lobes, and large axil tufts | A tendency. MDC also calls pin oak notches rounded. The tufts show only on the underside. |
| 9 | QUTE Nuttall oak / QUSH Shumard's oak | Dull top, narrow uneven lobes, and a lopsided base, against a glossy top and lobes wider at the tip | A tendency. Texas A&M calls Nuttall oak leaves glossy, so the sources disagree on the gloss. |
| 10 | QULY overcup oak / QUAL white oak | Uneven lobes with wide, square middle lobes, against even finger-like lobes with rounded tips | A tendency. FNA calls the overcup lobes angular, but MDC and NC State call them rounded. |
| 12 | ACLE chalk maple / ACFL southern sugar maple | A yellow-green underside, against a whitish underside | The photo must show the underside. Only TSO describes the chalk maple underside. FNA vol. 12 was behind a bot check. |
| 13 | QUCE European turkey oak / QUMA2 bur oak | Pointed triangular lobes and angular sinuses, against a fiddle shape with a wide, shallow-lobed tip | Clear on the lobe tips. The lobe depth of QUCE varies on one tree (TSO). |
| 15 | PLHI London planetree / PLRA California sycamore | Large coarse teeth on most lobes, against long narrow lobes with a smooth or few-toothed margin | Weak. TSO says most London plane clones have deep lobes, and nursery PLRA can be a hybrid with London plane. You can drop this one. |

## Pairs with no leaf edge

6 pairs got no leaf edge. For each pair, the sources give no leaf difference that one photo can show.

1. **QUCO2 scarlet oak / QUEL northern pin oak.** The FNA leaf text for the two species is the same, word for word, for the sinuses, the lobes, the surfaces, and the tufts. The sizes, lobe counts, and awn counts overlap. The FNA key separates them by the acorn cup only. FNA says many treatments put Q. ellipsoidalis inside Q. coccinea. The VT sheets give "shiny" against "somewhat shiny" only. Sources: FNA vol. 3 (taxa 233501019, 233501027, key 302020), VT 37 and 999, Trees of Wisconsin.
2. **QUAU bastard white oak / QUSI bastard oak.** FNA and VT give both species shallow, rounded, irregular lobes that reach 1/4 to 1/2 of the way to the midrib. FNA says Q. austrina "superficially resembles" Q. sinuata. The one leaf difference in FNA is the minute stellate hairs under the bastard oak leaf. That needs a hand lens, and shade leaves can have no hairs. Sources: FNA vol. 3 (taxa 233501010, 233501084, genus 127839), VT 1021 and 552.
3. **QUSI bastard oak / QUBO2 Boynton sand post oak.** Both species have lobes or teeth near the tip and an entire lower part. Both have a grayish or silvery underside with the same minute hairs. Bastard oak also has 3-toothed and lobed forms that look like QUBO2. The FNA key separates them by twig hair. A weak tendency: QUBO2 is glossy dark green on top (FNA, Wildflower Center), and QUSI is dull green (TSO). Light in a photo changes how glossy a leaf looks. Sources: FNA vol. 3 (taxa 233501013, 233501084), Wildflower Center QUBO2, TSO Q. sinuata, VT 552.
7. **QUEL northern pin oak / QUPA2 pin oak.** FNA gives "minute" axil tufts for QUEL and "conspicuous" tufts for QUPA2. Trees of Wisconsin says QUEL also has conspicuous tufts, and it sends the reader to the buds and acorns. Both VT sheets give very deep sinuses. FNA says the lowest pin oak lobes are "often somewhat recurved", but no source says QUEL lacks this. MDC names only the acorn. Sources: FNA vol. 3 (taxa 233501027, 210001860, key 302020), VT 999 and 74, Trees of Wisconsin, MDC pin oak.
11. **QULY overcup oak / QUMA2 bur oak.** TSO compares the two directly and separates them by the acorn only. The FNA key separates them by twig hair. FNA gives both species sinuses nearly to the midrib and the same apex, "broadly rounded or ovate". Both have a pale, hairy underside and 5 to 9 lobes. A weak tendency: four sources describe a wide, shallow-lobed "crown" tip on bur oak, but no source says overcup oak lacks it. Sources: FNA vol. 3 (taxa 233501057, 233501058, key 302029), VT 71 and 72, MDC, NC State, TSO Q. macrocarpa.
14. **PLHI London planetree / PLOC American sycamore.** FNA says London plane "will key here", to P. occidentalis. FNA separates them on the leaf only by lobes "somewhat longer and narrower" on the larger leaves, which is a difference of degree. TSO notes that London plane leaves vary a lot on one tree, and that some clones ('Liberty') have three shallow lobes like PLOC. VT gives both species 3 to 5 lobes with coarse teeth. TSO separates them by the fruit. Sources: FNA vol. 3 (taxa 125747, 200010589), TSO Platanus × hispanica, VT 307 and 36.

The earlier guess from botany held for pairs 1, 4, 6, 7, 13, and 14, and in part for pair 10 (an edge, but a tendency). It did not hold for pair 8 (a tendency edge), pair 11 (no edge), or pair 15 (a weak edge).

## Sources that did not load

- floranorthamerica.org (FNA beta) showed a Cloudflare challenge. FNA vol. 3 text came from efloras.org. FNA vol. 12 (Acer) was not read.
- Jepson eFlora asked for a human check. The agents stopped at each challenge.
- USDA Silvics did not connect.
- No page from Kew POWO was used.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
