export type Rng = () => number;

/** Small seeded PRNG so simulator runs and tests can be reproduced exactly. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusive on both ends. */
export const randomInt = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

export const pick = <T>(rng: Rng, items: readonly T[]): T => {
  if (items.length === 0) throw new Error('pick() from empty array');
  return items[Math.floor(rng() * items.length)] as T;
};

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
