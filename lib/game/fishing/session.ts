import { configProfile } from '../config';
import { settleSale } from '../sell';
import { assertFishStorage } from '../storage';
import { GameError, type PlayerCtx, type Tx } from '../tx';
import type { GearStats, Rarity } from '../types';
import { cancelOpenAttempts, zonePool } from './attempt';
import { eligibleEntries, neededCapacity } from './select';
import { zoneList } from './zones';

// The carried container (a "trip"): caught fish wait here, safe across refreshes, until the player returns to shore.
// Returning flips the trip with a conditional UPDATE … WHERE status = 'active', so a retry or a second tab can never
// move the same fish twice.

export async function activeTrip(tx: Tx, userId: string) {
  return tx.fishingTrip.findFirst({ where: { userId, status: 'active' } });
}

/** The open container session, created on the first cast; the map it was last used on is remembered. */
export async function ensureTrip(tx: Tx, userId: string, zoneKey: string, now: Date) {
  const trip = await activeTrip(tx, userId);
  if (trip) return trip.zoneKey === zoneKey ? trip : tx.fishingTrip.update({ where: { id: trip.id }, data: { zoneKey, lastSeenAt: now } });
  return tx.fishingTrip.create({ data: { userId, zoneKey, startedAt: now, lastSeenAt: now } });
}

const carriedFish = (tx: Tx, tripId: string) =>
  tx.fish.findMany({
    where: { tripId, location: 'trip', status: 'alive' },
    include: { species: { select: { maxWeightGrams: true, displayName: true, modelKey: true } } },
    orderBy: { acquiredAt: 'asc' },
  });

export async function carriedGrams(tx: Tx, tripId: string): Promise<number> {
  const agg = await tx.fish.aggregate({ where: { tripId, location: 'trip', status: 'alive' }, _sum: { weightGrams: true } });
  return agg._sum.weightGrams ?? 0;
}

/**
 * Return to shore: carried fish go to shared storage. `keepIds` null = all of them; any not kept are released for
 * 25% (the player's choice when storage is short). Storage must hold every kept fish, or nothing moves.
 */
export async function returnToShore(tx: Tx, userId: string, keepIds: string[] | null, ctx: PlayerCtx) {
  const trip = await activeTrip(tx, userId);
  if (!trip) throw new GameError('trip_not_active', 409);
  await cancelOpenAttempts(tx, userId, ctx.now);
  const n = await tx.$executeRaw`
    UPDATE "fishing_trips" SET "status" = 'completed', "endedAt" = ${ctx.now}, "endReason" = 'returned'
    WHERE "id" = ${trip.id} AND "status" = 'active'`;
  if (n === 0) throw new GameError('trip_not_active', 409);

  const fish = await carriedFish(tx, trip.id);
  const keep = new Set(keepIds ?? fish.map((f) => f.id));
  if ([...keep].some((id) => !fish.some((f) => f.id === id))) throw new GameError('invalid_input', 400);
  const kept = fish.filter((f) => keep.has(f.id));
  const released = fish.filter((f) => !keep.has(f.id));

  // Throwing here rolls back the status flip too: the container stays as it was.
  await assertFishStorage(tx, userId, kept.reduce((g, f) => g + f.weightGrams, 0));
  await tx.fish.updateMany({ where: { id: { in: kept.map((f) => f.id) } }, data: { location: 'storage' } });
  await tx.fishEvent.createMany({ data: kept.map((f) => ({ fishId: f.id, userId, type: 'moved', data: { from: 'trip', to: 'storage' }, occurredAt: ctx.now })) });
  const sale = released.length ? await settleSale(tx, userId, released, 'release', ctx) : { total: 0 };
  return { kept: kept.map((f) => f.id), released: released.map((f) => f.id), releasedCoins: sale.total };
}

/** Release carried fish (25% each), e.g. to make room. */
export async function releaseCarried(tx: Tx, userId: string, fishIds: string[], ctx: PlayerCtx) {
  const trip = await activeTrip(tx, userId);
  if (!trip) throw new GameError('trip_not_active', 409);
  const wanted = new Set(fishIds);
  const fish = (await carriedFish(tx, trip.id)).filter((f) => wanted.has(f.id));
  if (fish.length === 0 || fish.length !== wanted.size) throw new GameError('invalid_input', 400);
  return settleSale(tx, userId, fish, 'release', ctx);
}

/** Everything the fishing page needs: maps (with what the equipped rod can catch there), owned gear, the container. */
export async function fishingView(tx: Tx, userId: string, ctx: PlayerCtx) {
  const [loadout, gear, stacks, trip] = await Promise.all([
    tx.gearLoadout.findUnique({ where: { userId } }),
    tx.gearItem.findMany({ where: { userId, def: { category: { in: ['rod', 'cooler'] } } }, include: { def: true }, orderBy: { acquiredAt: 'asc' } }),
    tx.inventoryStack.findMany({ where: { userId, bucket: 'main', qty: { gt: 0 } } }),
    activeTrip(tx, userId),
  ]);
  const baitDefs = await tx.itemDef.findMany({ where: { profile: configProfile(), category: 'bait' } });
  const piece = (g: (typeof gear)[number]) => {
    const st = g.def.stats as unknown as GearStats;
    return {
      id: g.id,
      defKey: g.defKey,
      name: g.def.name,
      durability: g.durability,
      maxDurability: g.maxDurability,
      broken: g.durability === 0,
      repairCost: (g.maxDurability - g.durability) * ctx.cfg.fishing.repairCostPerPoint,
      maxRarity: (st.maxRarity ?? 'common') as Rarity,
      catchMult: st.catchMult ?? 1,
      stability: st.stability ?? 0,
      capacityGrams: st.capacityGrams ?? 0,
    };
  };
  const rods = gear.filter((g) => g.def.category === 'rod').map(piece);
  const coolers = gear.filter((g) => g.def.category === 'cooler').map(piece);
  const rod = rods.find((r) => r.id === loadout?.rodId) ?? null;
  const cooler = coolers.find((c) => c.id === loadout?.coolerId) ?? null;
  const fish = trip ? await carriedFish(tx, trip.id) : [];

  const zones = [];
  for (const z of await zoneList(tx, userId)) {
    const pool = rod ? eligibleEntries(await zonePool(tx, z.key), rod.maxRarity) : [];
    zones.push({ ...z, eligibleSpecies: pool.length, needGrams: neededCapacity(pool) });
  }

  return {
    zones,
    lastZoneKey: trip?.zoneKey ?? null,
    equipment: {
      rods: rods.map(({ capacityGrams: _c, ...r }) => r),
      coolers: coolers.map(({ maxRarity: _m, catchMult: _cm, stability: _s, ...c }) => c),
      baits: baitDefs
        .map((d) => ({ itemKey: d.key, name: d.name, price: d.price, qty: stacks.find((s) => s.itemKey === d.key)?.qty ?? 0 }))
        .filter((b) => b.qty > 0 || b.price !== null)
        .sort((a, b) => b.qty - a.qty),
    },
    loadout: { rodId: loadout?.rodId ?? null, coolerId: loadout?.coolerId ?? null, baitKey: loadout?.baitKey ?? null },
    container: {
      tripId: trip?.id ?? null,
      capacityGrams: cooler?.capacityGrams ?? 0,
      carriedGrams: fish.reduce((g, f) => g + f.weightGrams, 0),
      fish: fish.map((f) => ({ id: f.id, name: f.nickname ?? f.species.displayName, modelKey: f.species.modelKey, rarity: f.rarity, weightGrams: f.weightGrams, baseValue: f.baseValue })),
    },
  };
}
