export const MIN_POOL = 24;

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

// Thin: fewer than 6 good leaf photos in the pool under the old verdicts. Eligible: a pool of 24 or more.
export function chooseTargets(targets, seed, nRich = 6, nThin = 4) {
  const rng = mulberry32(seed);
  const ok = targets.filter(t => t.photos.length >= MIN_POOL).sort((a, b) => a.target.localeCompare(b.target));
  const rich = shuffle(ok.filter(t => t.good_old >= 6), rng).slice(0, nRich).map(t => ({ ...t, kind: 'rich' }));
  const thin = shuffle(ok.filter(t => t.good_old < 6), rng).slice(0, nThin).map(t => ({ ...t, kind: 'thin' }));
  if (rich.length < nRich || thin.length < nThin) throw new Error(`not enough targets: rich ${rich.length}, thin ${thin.length}`);
  const p3 = [...shuffle(rich, rng).slice(0, 2), ...shuffle(thin, rng).slice(0, 1)].map(t => t.target);
  return { chosen: [...rich, ...thin], p3 };
}
