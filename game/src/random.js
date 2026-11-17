// Deterministic randomness for Porto Sol.
// mulberry32 is a tiny, fast, seedable PRNG: the same seed always yields
// the same sequence, which is what makes the procedural city identical
// on every load. No dependencies, no Math.random anywhere in world gen.

// Returns a function that yields a float in [0, 1) on every call.
export function mulberry32(seed) {
  let state = seed >>> 0; // force unsigned 32-bit
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0; // golden-ratio-ish increment
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Float in [a, b).
export function range(rng, a, b) {
  return a + rng() * (b - a);
}

// Uniform random element of a non-empty array.
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Integer in [a, b], both ends inclusive.
export function randInt(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}
