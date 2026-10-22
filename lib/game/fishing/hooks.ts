import type { PlayerCtx, Tx } from '../tx';
import { cancelOpenAttempts, expireAttempts } from './attempt';

// Fishing hooks the rest of the game calls. The carried container survives refreshes; only the unfinished attempt
// (cast, wait, reel) is lost when the page goes away.

/** Every request: attempts past their time limit are cancelled. */
export async function expireFishingAttempts(tx: Tx, userId: string, ctx: PlayerCtx): Promise<void> {
  await expireAttempts(tx, userId, ctx.now);
}

/** A fresh game load means the previous page was closed: its unfinished attempt is cancelled. */
export async function cancelUnfinishedAttempts(tx: Tx, userId: string, ctx: PlayerCtx): Promise<void> {
  await cancelOpenAttempts(tx, userId, ctx.now);
}
