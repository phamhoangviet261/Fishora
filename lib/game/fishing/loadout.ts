import { GameError, type Tx } from '../tx';

// The active set: one rod, container (cooler) and bait at a time, kept until the player changes it (spec §7.2).
// Line and hook slots remain in the data model but aren't needed to fish since the reeling minigame.

export type LoadoutPatch = { rodId?: string | null; lineId?: string | null; hookId?: string | null; coolerId?: string | null; baitKey?: string | null };

const SLOTS = { rodId: 'rod', lineId: 'line', hookId: 'hook', coolerId: 'cooler' } as const;

export async function setLoadout(tx: Tx, userId: string, patch: LoadoutPatch): Promise<void> {
  for (const [slot, category] of Object.entries(SLOTS) as [keyof typeof SLOTS, string][]) {
    const id = patch[slot];
    if (!id) continue;
    const g = await tx.gearItem.findFirst({ where: { id, userId }, include: { def: true } });
    if (!g || g.def.category !== category) throw new GameError('invalid_input', 400, { field: slot });
  }
  if (patch.coolerId !== undefined) {
    // The carried catch lives in the equipped container: it can't be swapped out from under the fish.
    const trip = await tx.fishingTrip.findFirst({ where: { userId, status: 'active' }, select: { id: true } });
    const current = await tx.gearLoadout.findUnique({ where: { userId }, select: { coolerId: true } });
    const carrying = trip ? await tx.fish.count({ where: { tripId: trip.id, location: 'trip', status: 'alive' } }) : 0;
    if (carrying > 0 && patch.coolerId !== current?.coolerId) throw new GameError('container_in_use', 409);
  }
  if (patch.baitKey) {
    const def = await tx.itemDef.findUnique({ where: { key: patch.baitKey } });
    if (def?.category !== 'bait') throw new GameError('invalid_input', 400, { field: 'baitKey' });
  }
  await tx.gearLoadout.upsert({ where: { userId }, create: { userId, ...patch }, update: patch });
}
