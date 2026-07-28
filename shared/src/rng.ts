/** Deterministic RNG so tests can pin shuffles and bot decisions. */
export type Rng = () => number;

/** mulberry32 — small, fast, good enough for card shuffling. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultRng: Rng = Math.random;

/** Fisher–Yates. Returns a new array; never mutates the input. */
export function shuffle<T>(items: readonly T[], rng: Rng = defaultRng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function pick<T>(items: readonly T[], rng: Rng = defaultRng): T {
  if (items.length === 0) throw new Error('pick() on an empty array');
  return items[Math.floor(rng() * items.length)];
}

/** `count` distinct items, or everything if the array is shorter. */
export function pickMany<T>(items: readonly T[], count: number, rng: Rng = defaultRng): T[] {
  return shuffle(items, rng).slice(0, Math.min(count, items.length));
}

export function chance(probability: number, rng: Rng = defaultRng): boolean {
  return rng() < probability;
}
