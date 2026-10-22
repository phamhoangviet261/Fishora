import type { PlayerCtx, Tx } from '../tx';

export interface AdvanceResult {
  ticks: number;
  died: string[];
  lost: string[];
}

/** Catches the player's world up to ctx.now. Filled in by Task 6 of the MVP plan. */
export async function advanceWorld(_tx: Tx, _userId: string, _ctx: PlayerCtx): Promise<AdvanceResult> {
  return { ticks: 0, died: [], lost: [] };
}
