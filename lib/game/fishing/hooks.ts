import type { PlayerCtx, Tx } from '../tx';
import { cancelTrip } from './trip';

// Fishing hooks the rest of the game calls on every request / game load.

/** Cancels the player's active trips whose heartbeat is older than fishing.tripTimeoutSec (spec §7.4). */
export async function cancelStaleTrips(tx: Tx, userId: string, ctx: PlayerCtx): Promise<void> {
  const before = new Date(ctx.now.getTime() - ctx.cfg.fishing.tripTimeoutSec * 1000);
  for (const t of await tx.fishingTrip.findMany({ where: { userId, status: 'active', lastSeenAt: { lt: before } }, select: { id: true } })) {
    await cancelTrip(tx, t.id, 'timeout', ctx.now);
  }
}

/** A fresh game load means the previous session was closed: cancel any active trip (spec §7.4). */
export async function cancelActiveTrips(tx: Tx, userId: string, ctx: PlayerCtx): Promise<void> {
  for (const t of await tx.fishingTrip.findMany({ where: { userId, status: 'active' }, select: { id: true } })) await cancelTrip(tx, t.id, 'closed', ctx.now);
}
