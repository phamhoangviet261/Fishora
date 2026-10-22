import type { PlayerCtx, Tx } from './tx';

// Stubs with their final signatures so earlier rules can call them; Task 12 of the MVP plan fills them in.

export const METRICS = ['fish_caught', 'casts', 'species_discovered', 'fish_matured', 'zones_unlocked', 'fish_fed', 'tank_cleaned', 'fish_sold'] as const;
export type Metric = (typeof METRICS)[number];

export async function bumpStat(_tx: Tx, _userId: string, _metric: Metric, _by: number, _ctx: PlayerCtx): Promise<void> {}

export async function grantExp(_tx: Tx, _userId: string, _source: string, _ctx: PlayerCtx, _amount?: number): Promise<{ granted: number; level: number }> {
  return { granted: 0, level: 1 };
}
