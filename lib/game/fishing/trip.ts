import { settleSale } from '../sell';
import { assertFishStorage } from '../storage';
import { GameError, type PlayerCtx, type Tx } from '../tx';
import type { GearStats } from '../types';

// A fishing trip (spec §7.4): catches wait in the cooler and only reach storage on "Return home". Closing the
// game or going quiet cancels the trip and its catch. Return and cancel both flip the trip with a conditional
// UPDATE … WHERE status = 'active', so only one of them can ever win.

export async function activeTrip(tx: Tx, userId: string, tripId: string) {
  const trip = await tx.fishingTrip.findFirst({ where: { id: tripId, userId, status: 'active' } });
  if (!trip) throw new GameError('trip_not_active', 409);
  return trip;
}

export async function startTrip(tx: Tx, userId: string, zoneKey: string, ctx: PlayerCtx): Promise<{ tripId: string }> {
  if (!(await tx.unlockedZone.findUnique({ where: { userId_zoneKey: { userId, zoneKey } } }))) throw new GameError('zone_locked', 409);
  // A new trip means the previous one was left: it is lost (spec §7.4).
  for (const t of await tx.fishingTrip.findMany({ where: { userId, status: 'active' }, select: { id: true } })) await cancelTrip(tx, t.id, 'closed', ctx.now);
  const trip = await tx.fishingTrip.create({ data: { userId, zoneKey, startedAt: ctx.now, lastSeenAt: ctx.now } });
  return { tripId: trip.id };
}

export async function heartbeat(tx: Tx, userId: string, tripId: string, ctx: PlayerCtx): Promise<{ ok: true }> {
  await activeTrip(tx, userId, tripId);
  await tx.fishingTrip.update({ where: { id: tripId }, data: { lastSeenAt: ctx.now } });
  return { ok: true };
}

/** Ends an active trip as cancelled; its uncollected fish are abandoned. False if it was no longer active. */
export async function cancelTrip(tx: Tx, tripId: string, reason: 'closed' | 'timeout', now: Date): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE "fishing_trips" SET "status" = 'cancelled', "endedAt" = ${now}, "endReason" = ${reason}
    WHERE "id" = ${tripId} AND "status" = 'active'`;
  if (n === 0) return false;
  const fish = await tx.fish.findMany({ where: { tripId, location: 'trip', status: 'alive' }, select: { id: true, userId: true } });
  await tx.fish.updateMany({ where: { id: { in: fish.map((f) => f.id) } }, data: { status: 'abandoned', location: 'none', endedAt: now } });
  await tx.fishEvent.createMany({ data: fish.map((f) => ({ fishId: f.id, userId: f.userId, type: 'abandoned', data: { reason }, occurredAt: now })) });
  return true;
}

const coolerFish = (tx: Tx, tripId: string) =>
  tx.fish.findMany({ where: { tripId, location: 'trip', status: 'alive' }, include: { species: { select: { maxWeightGrams: true, displayName: true } } }, orderBy: { acquiredAt: 'asc' } });

/** Release some catch before going home (e.g. to make room in the cooler): 25% each. */
export async function releaseFromCooler(tx: Tx, userId: string, tripId: string, fishIds: string[], ctx: PlayerCtx) {
  await activeTrip(tx, userId, tripId);
  const wanted = new Set(fishIds);
  const fish = (await coolerFish(tx, tripId)).filter((f) => wanted.has(f.id));
  if (fish.length === 0 || fish.length !== wanted.size) throw new GameError('invalid_input', 400);
  return settleSale(tx, userId, fish, 'release', ctx);
}

/** "Return home": kept fish go to storage (which must hold them all), the rest are released at 25%. No selling here. */
export async function returnHome(tx: Tx, userId: string, tripId: string, keepIds: string[], ctx: PlayerCtx) {
  const n = await tx.$executeRaw`
    UPDATE "fishing_trips" SET "status" = 'completed', "endedAt" = ${ctx.now}, "endReason" = 'returned'
    WHERE "id" = ${tripId} AND "userId" = ${userId} AND "status" = 'active'`;
  if (n === 0) throw new GameError('trip_not_active', 409);

  const fish = await coolerFish(tx, tripId);
  const keep = new Set(keepIds);
  if ([...keep].some((id) => !fish.some((f) => f.id === id))) throw new GameError('invalid_input', 400);
  const kept = fish.filter((f) => keep.has(f.id));
  const released = fish.filter((f) => !keep.has(f.id));

  // Throwing here rolls back the status flip too: the trip stays open and the player can release some first.
  await assertFishStorage(tx, userId, kept.reduce((g, f) => g + f.weightGrams, 0));
  await tx.fish.updateMany({ where: { id: { in: kept.map((f) => f.id) } }, data: { location: 'storage' } });
  await tx.fishEvent.createMany({ data: kept.map((f) => ({ fishId: f.id, userId, type: 'moved', data: { from: 'trip', to: 'storage' }, occurredAt: ctx.now })) });
  const sale = released.length ? await settleSale(tx, userId, released, 'release', ctx) : { total: 0 };
  return { kept: kept.map((f) => f.id), released: released.map((f) => f.id), releasedCoins: sale.total };
}

export async function tripView(tx: Tx, userId: string, tripId: string) {
  const trip = await activeTrip(tx, userId, tripId);
  const [zone, fish, loadout] = await Promise.all([
    tx.zone.findUniqueOrThrow({ where: { key: trip.zoneKey } }),
    coolerFish(tx, tripId),
    tx.gearLoadout.findUnique({ where: { userId } }),
  ]);
  const cooler = loadout?.coolerId ? await tx.gearItem.findUnique({ where: { id: loadout.coolerId }, include: { def: true } }) : null;
  const bait = loadout?.baitKey ? await tx.inventoryStack.findUnique({ where: { userId_itemKey_bucket: { userId, itemKey: loadout.baitKey, bucket: 'main' } } }) : null;
  const baitDef = loadout?.baitKey ? await tx.itemDef.findUnique({ where: { key: loadout.baitKey } }) : null;
  return {
    id: trip.id,
    zone: { key: zone.key, name: zone.name },
    cooler: fish.map((f) => ({ id: f.id, name: f.nickname ?? f.species.displayName, rarity: f.rarity, weightGrams: f.weightGrams, baseValue: f.baseValue })),
    coolerGrams: fish.reduce((g, f) => g + f.weightGrams, 0),
    capacityGrams: cooler ? ((cooler.def.stats as unknown as GearStats).capacityGrams ?? 0) : 0,
    bait: { key: loadout?.baitKey ?? null, name: baitDef?.name ?? null, price: baitDef?.price ?? null, qty: bait?.qty ?? 0 },
  };
}
