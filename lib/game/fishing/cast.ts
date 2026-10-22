import { createFish } from '../fish/create';
import { bumpStat, grantExp } from '../progression';
import { pickWeighted, randInt } from '../rng';
import { BAIT_PER_CAST } from '../rules';
import { stackQty, takeItem } from '../storage';
import { GameError, type PlayerCtx, type Tx } from '../tx';
import type { BaitStats, GearStats } from '../types';
import { activeTrip } from './trip';

export type CastResult =
  | { outcome: 'miss' }
  | { outcome: 'caught'; fishId: string; speciesKey: string; weightGrams: number; fought: boolean }
  | { outcome: 'escaped'; speciesKey: string; weightGrams: number };

/**
 * One cast, decided entirely on the server (spec §7.3). Every cast uses one bait; a miss costs nothing else.
 * A fish over the gear's load limit must be fought: losing lets it go and wears the gear harder.
 */
export async function cast(tx: Tx, userId: string, tripId: string, ctx: PlayerCtx): Promise<CastResult> {
  const trip = await activeTrip(tx, userId, tripId);
  await tx.fishingTrip.update({ where: { id: tripId }, data: { lastSeenAt: ctx.now } });

  const loadout = await tx.gearLoadout.findUnique({ where: { userId } });
  const ids = [loadout?.rodId, loadout?.lineId, loadout?.hookId, loadout?.coolerId];
  if (ids.some((id) => !id)) throw new GameError('gear_broken', 409, { reason: 'missing' });
  const gear = await tx.gearItem.findMany({ where: { id: { in: ids as string[] }, userId }, include: { def: true } });
  if (gear.length !== 4 || gear.some((g) => g.durability <= 0)) throw new GameError('gear_broken', 409);
  const tackle = gear.filter((g) => g.def.category !== 'cooler');
  const cooler = gear.find((g) => g.def.category === 'cooler')!;

  if (!loadout!.baitKey || (await stackQty(tx, userId, loadout!.baitKey)) < BAIT_PER_CAST) throw new GameError('no_bait', 409);
  const capacity = (cooler.def.stats as unknown as GearStats).capacityGrams ?? 0;
  const load = await tx.fish.aggregate({ where: { tripId, location: 'trip', status: 'alive' }, _sum: { weightGrams: true } });
  if ((load._sum.weightGrams ?? 0) > capacity) throw new GameError('cooler_full', 409, { loadGrams: load._sum.weightGrams, capacityGrams: capacity });

  await takeItem(tx, userId, loadout!.baitKey, BAIT_PER_CAST);
  await bumpStat(tx, userId, 'casts', 1, ctx);

  const [zone, entries, bait] = await Promise.all([
    tx.zone.findUniqueOrThrow({ where: { key: trip.zoneKey } }),
    tx.zoneSpecies.findMany({ where: { zoneKey: trip.zoneKey, species: { active: true, deletedAt: null } }, include: { species: true } }),
    tx.itemDef.findUnique({ where: { key: loadout!.baitKey } }),
  ]);
  const mult = ((bait?.stats ?? {}) as BaitStats).speciesMult ?? {};
  const pick = pickWeighted<string | null>(
    [...entries.map((e) => ({ value: e.speciesKey, weight: e.weight * (mult[e.speciesKey] ?? 1) })), { value: null, weight: zone.missWeight }],
    ctx.rng,
  );
  if (pick === null) return { outcome: 'miss' };

  const species = entries.find((e) => e.speciesKey === pick)!.species;
  const weightGrams = randInt(species.spawnWeightMinGrams, species.spawnWeightMaxGrams, ctx.rng);
  const stats = tackle.map((g) => g.def.stats as unknown as GearStats);
  const limit = Math.min(...stats.map((x) => x.maxLoadGrams ?? 0));
  const { fishing } = ctx.cfg;
  const fought = weightGrams > limit;

  if (fought && ctx.rng() >= Math.min(1, Math.max(0, (fishing.fightBaseSuccess * limit) / weightGrams))) {
    await wear(tx, tackle, fishing.fightFailDurabilityLoss);
    return { outcome: 'escaped', speciesKey: species.key, weightGrams };
  }

  const tiers = stats.map((x) => x.tier);
  const mismatch = Math.max(...tiers) - Math.min(...tiers) > fishing.compatibleTierSpread;
  await wear(tx, tackle, fishing.catchDurabilityLoss + (mismatch ? fishing.incompatibleExtraLoss : 0));
  const fish = await createFish(tx, userId, species.key, 'fishing', { location: 'trip', tripId, weightGrams }, ctx);
  await bumpStat(tx, userId, 'fish_caught', 1, ctx);
  await grantExp(tx, userId, 'catch', ctx);
  return { outcome: 'caught', fishId: fish.id, speciesKey: species.key, weightGrams, fought };
}

async function wear(tx: Tx, gear: { id: string; durability: number }[], loss: number) {
  for (const g of gear) await tx.gearItem.update({ where: { id: g.id }, data: { durability: Math.max(0, g.durability - loss) } });
}
