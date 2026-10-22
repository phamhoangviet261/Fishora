import { randomInt } from 'node:crypto';

import type { Rng } from './prng';

export { seededRng, type Rng } from './prng';

export const cryptoRng: Rng = () => randomInt(0, 2 ** 47) / 2 ** 47;

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
