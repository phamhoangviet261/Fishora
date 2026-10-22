import { randomInt } from 'node:crypto';

/** Uniform in [0, 1). Rules take one as a parameter so tests can replay exact outcomes. */
export type Rng = () => number;

export const cryptoRng: Rng = () => randomInt(0, 2 ** 48) / 2 ** 48;

/** mulberry32: small, fast, deterministic. Tests and simulation replays only. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T>(entries: { value: T; weight: number }[], rng: Rng): T {
  const live = entries.filter((e) => e.weight > 0);
  const total = live.reduce((n, e) => n + e.weight, 0);
  if (total <= 0) throw new Error('pickWeighted: no positive weights');
  let r = rng() * total;
  for (const e of live) {
    r -= e.weight;
    if (r < 0) return e.value;
  }
  return live[live.length - 1].value;
}

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Integer uniform in [min, max]. */
export const randInt = (min: number, max: number, rng: Rng) => min + Math.floor(rng() * (max - min + 1));
