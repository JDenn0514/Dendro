// What each difficulty step means, in plain words, from what lib/step.mjs computes under rule P. Every page
// where the owner labels a difficulty step shows it, so the labels follow the same definitions (owner
// rulings 2026-10-27 and 2026-10-28).
export const STEP_LEGEND = [
  ['Key features', 'Leaf: the outline (shape, blade, lobe tips) and the edge. Bark: the surface and the ridges, plates, grooves, or peeling. Fruit: the kind of fruit and its outline.'],
  ['Step 1', 'The key features are clear, and the leaf, fruit, or bark is whole and the main thing in the frame. For bark, the photo also shows a trunk edge, a branch, or something for scale, not texture only.'],
  ['Step 2', 'You can still read the key features, but the framing is not ideal: part of the subject is cut off, something competes with it, or the bark is a texture-only close-up.'],
  ['Step 3', 'You must search or look closely to read a key feature, or the subject is not typical: young, damaged, an odd angle, or odd light.'],
  ['Drop', 'A key feature does not show at all, or the photo has a reject problem, such as blur, a name label, dead leaves, or flowers or buds instead of the part.'],
];

// The part, for pages where the owner sets it (from the judge brief).
export const PART_LEGEND = ['Other', 'The main subject is none of the three: a whole tree, a crown, a twig with buds only, flowers only, or a scene.'];
