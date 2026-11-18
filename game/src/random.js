// Porto Sol — small deterministic random helpers (Round 2 rebuild).
// No imports. Seeded so the same seed always builds the same city.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rand(rng, a, b) {
  return a + rng() * (b - a);
}

export function randInt(rng, a, b) {
  // Inclusive on both ends.
  return Math.floor(rand(rng, a, b + 1));
}

export function pick(rng, arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}
