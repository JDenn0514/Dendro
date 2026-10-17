# First version: leaf, bark, and fruit; teach before test

Date: 2026-10-09. Status: decided by the owner, not yet in the app. It replaces `2026-09-30-leaf-only-v1.md`.

Changed later on 2026-10-09 (round 2), after the notes on the first prototype. Decision 3 changed, and decisions 4 to 6 are new. The order of the path is in `2026-10-09-learning-path.md`.

Changed on 2026-10-13: pages have no comparison sections. The look-alike section of decision 3 ("You have met X…") is replaced by one look-alike line per part on the species page. See "Comparisons and lobe tips" in `2026-10-09-learning-path.md`.

## Context

- `2026-09-30-leaf-only-v1.md` limited the first version to leaves. Bark and fruit were thin in every run, and the owner found them hard to judge.
- The learning model of 2026-10-09 (`2026-10-09-learning-model.md`) changes those reasons:
  - A tree card unlocks only after part cards on two or more parts. Leaf part cards alone never unlock one.
  - A tree card can combine photos from several trees of the species. One tree does not need every part.
  - A part card with depth `group` asks only for the group. It needs fewer photos.
  - The quota at each photo difficulty step replaces "Stop at 6 good photos".
- The owner judges learner clarity. The photo judge and the source pages decide the botany.
- No flower photos exist. Most trees flower for a short time, and many tree flowers are small or high in the crown.
- `DESIGN.md` section 1 says learning and testing are the same activity. The app tests a learner on a species before it shows how to tell that species from its look-alikes.

## Decision

1. **Bark and fruit come back for the first version.** The 548 bark rows and 425 fruit rows in `content/images/manifest.json` are published. The app only hides them.
2. **Flowers come after the first version.**
3. **The app teaches before it tests.**
   - New material comes in batches of 3 to 5 items, starting at 4. A look-alike pair is a batch of 2. The full batch rule is in `2026-10-09-learning-path.md`.
   - The information page is about one species. It is not a comparison page for a pair.
   - On the page, each part says in plain words how reliable it is. Example: "The acorns look like those of other white oaks."
   - The reliability of each part comes from the sources and from `content/confusion.json`. The owner judges whether the words are clear.
   - The learner can already know a look-alike of the new species. Then the page of the new species gets one more section: "You have met X. Here is how they are alike, and how to tell them apart."
   - The labels "This tells them apart" and "This only tells you the group" are dropped. They were not clear.
   - The cards on a species come after its page.
   - The page stays open later as a reference.
4. **Photos that the learner compares match** in stage, season, and view. Example: two ripe acorns, both from the side. A green unripe acorn next to a brown ripe acorn teaches a false difference. The rule holds for any layout, side by side or stacked. (Changed on 2026-10-17: read "stage" here as "growth stage", the photo value. In `GLOSSARY.md` a stage is a level of the path.)
5. **Leaf part cards show the typical leaf size of the species.** Size is a clue that the learner must remember, as habitat and height are on tree cards.
   - A leaf photo with a scale object (a hand, a ruler, or a coin) counts as a better photo. (Changed on 2026-10-17: for leaves a scale object is neutral, and a clean frame is preferred, because the app gives the typical leaf size as text. For fruit a scale object stays a plus. Species also get a typical fruit size and a typical trunk diameter. See the intake spec and the v1 spec.)
   - "Size can be judged" joins the leaf feature list.
   - The owner watches in the notes whether learners answer from the number alone.
6. **Card and page layout,** from the notes on the first prototype:
   - The learner taps a photo to make it larger.
   - On pages, the photos stack at full width.
   - Photo credits are smaller: a small line under the photo, or a credit list at the bottom of the page. The wildflower.org and VT permissions require a credit, but say nothing about its place.

## Consequences

- **New content runs collect bark and fruit again.** The rule "every run takes `--channels leaf`" ends.
- **The app shows bark and fruit again.** Add `bark` and `fruit` back to the active channels. No content changes are needed.
- **Flowers wait.** Runs do not collect flower photos for the first version.
- **Section 1 changes for new material.** The teaching moment after a miss (`DESIGN.md` section 9) stays.
- **Leaf part cards need the typical leaf size.** The new species field of the learning model supplies it.
- **Closed in round 2:** the size of a look-alike set. The batch rule replaces the sets.
- **Open:**
  - the exact layout of the species page;
  - which of the two credit forms the app uses.

## What it replaces

- `2026-09-30-leaf-only-v1.md`, in full.
- In round 2, this record's first version of decision 3: look-alike sets from `content/confusion.json`, and one introduction page for each set, with the species side by side.
- `DESIGN.md` section 1, "learning and testing are the same activity", for new material.
- The open item "Whether the app keeps the leaf-only rule" in `DESIGN.md` section 18.
