import type { PlayerCtx, Tx } from '../tx';

// Fishing hooks the rest of the game calls. Fishing itself (zones, trips, casts) is built in its own session;
// until then these do nothing.

/** Cancels the player's active trips whose heartbeat is older than fishing.tripTimeoutSec (spec §7.4). */
export async function cancelStaleTrips(_tx: Tx, _userId: string, _ctx: PlayerCtx): Promise<void> {}

/** A fresh game load means the previous session was closed: cancel any active trip (spec §7.4). */
export async function cancelActiveTrips(_tx: Tx, _userId: string, _ctx: PlayerCtx): Promise<void> {}
