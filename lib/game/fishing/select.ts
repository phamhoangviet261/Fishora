import { pickWeighted, type Rng } from '../rng';
import { rarityRank, type Rarity } from '../types';

// Which fish can bite: the map's pool (configured weights × bait multipliers), limited to what the rod can land.
// Casting distance plays no part.

export interface PoolEntry {
  speciesKey: string;
  weight: number;
  rarity: Rarity;
  spawnWeightMaxGrams: number;
}

export const rarityAllowed = (rarity: Rarity, maxRarity: Rarity) => rarityRank(rarity) <= rarityRank(maxRarity);

export const eligibleEntries = <E extends PoolEntry>(entries: E[], maxRarity: Rarity): E[] =>
  entries.filter((e) => e.weight > 0 && rarityAllowed(e.rarity, maxRarity));

/** Free container space an attempt needs: the heaviest fish it could land. */
export const neededCapacity = (entries: PoolEntry[]) => entries.reduce((m, e) => Math.max(m, e.spawnWeightMaxGrams), 0);

/** A species key, or null for "nothing bites" (the map's miss weight). */
export function pickBite(pool: PoolEntry[], missWeight: number, baitMult: Record<string, number>, rng: Rng): string | null {
  return pickWeighted<string | null>(
    [...pool.map((e) => ({ value: e.speciesKey, weight: e.weight * (baitMult[e.speciesKey] ?? 1) })), { value: null, weight: missWeight }],
    rng,
  );
}
