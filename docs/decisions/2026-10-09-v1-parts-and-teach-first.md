# First version: leaf, bark, and fruit; teach before test

Date: 2026-10-09. Status: decided by the owner, not yet in the app. It replaces `2026-09-30-leaf-only-v1.md`.

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
   - New species come in small look-alike sets, taken from `content/confusion.json`. Example: vine maple, mountain maple, Rocky Mountain maple, and striped maple.
   - An introduction page for each set comes before the first card on that set.
   - The page shows the species side by side, part by part. It names the features that tell them apart.
   - It also names the parts that do not help, from the depth of each part (`species`, `group`, or `none`).
   - The quiz on the set comes after the page.
   - The page stays open later as a reference, as the species and group pages.

## Consequences

- **New content runs collect bark and fruit again.** The rule "every run takes `--channels leaf`" ends.
- **The app shows bark and fruit again.** Add `bark` and `fruit` back to the active channels. No content changes are needed.
- **Flowers wait.** Runs do not collect flower photos for the first version.
- **Section 1 changes for new material.** The teaching moment after a miss (`DESIGN.md` section 9) stays.
- **Open:** the size of a look-alike set and the exact layout of the introduction page. Both wait for the prototype notes.

## What it replaces

- `2026-09-30-leaf-only-v1.md`, in full.
- `DESIGN.md` section 1, "learning and testing are the same activity", for new material.
- The open item "Whether the app keeps the leaf-only rule" in `DESIGN.md` section 18.
