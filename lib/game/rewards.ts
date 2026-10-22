import type { PlayerCtx, Tx } from './tx';

/** Opens milestone and maturity claims for weights reached in the simulation. Filled in by Task 8. */
export async function openGrowthRewards(_tx: Tx, _userId: string, _peaks: Record<string, { grams: number; at: Date }>, _ctx: PlayerCtx): Promise<void> {}
