export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, rng) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Display order for the pick page: fixed per seed and target, so the owner does not see fetch order.
export function pickOrder(photos, seed, target) {
  let h = seed >>> 0;
  for (const ch of target) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return shuffle(photos, mulberry32(h));
}
