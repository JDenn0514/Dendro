// A small linear congruential generator, so tests are deterministic.
export function makeRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// The first draws of makeRng for the seeds 1, 2, 3, ... are close together
// (all 300 of them fall from 0.24 to 0.35), so a property test would see only
// a small part of its inputs. This mixes the bits of a seed first, so near
// seeds give far-apart generators.
export function mixSeed(seed) {
  let x = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

// Runs `check` once for each seed from 1 to `count`, with a generator made from
// the mixed seed. A failure names its seed, so `makeRng(mixSeed(<seed>))` gives
// the same case again.
export function forEachSeed(count, check) {
  for (let seed = 1; seed <= count; seed += 1) {
    try {
      check(makeRng(mixSeed(seed)), seed);
    } catch (error) {
      // The reporter prints the stack, which holds the message from before, so
      // change both.
      const before = error.message;
      error.message = `seed ${seed}: ${before}`;
      if (typeof error.stack === 'string') error.stack = error.stack.replace(before, error.message);
      throw error;
    }
  }
}

// A whole number from `low` to `high`, both included.
export function intIn(rng, low, high) {
  return low + Math.floor(rng() * (high - low + 1));
}

// One item of a list.
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}
