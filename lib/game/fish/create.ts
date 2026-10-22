import type { Fish, FishLocation, Prisma } from '@prisma/client';
import { adjustCoins } from '../ledger';
import { bumpStat } from '../progression';
import { randInt } from '../rng';
import { grantItemOrThrow } from '../storage';
import { GameError, type PlayerCtx, type Tx } from '../tx';
import { computeBaseValue } from './formulas';

export type FishOrigin = 'starter' | 'shop' | 'blindbox' | 'fishing' | 'reward';

/** A new individual: rolls sex, weight and age from the species, fixes its base value, records the discovery. */
export async function createFish(
  tx: Tx,
  userId: string,
  speciesKey: string,
  origin: FishOrigin,
  opts: { location: FishLocation; tripId?: string; weightGrams?: number },
  ctx: PlayerCtx,
): Promise<Fish> {
  const s = await tx.species.findUnique({ where: { key: speciesKey } });
  if (!s) throw new GameError('not_found', 404);
  if (!s.active || s.deletedAt) throw new GameError('species_inactive', 409);

  const weightGrams = opts.weightGrams ?? randInt(s.spawnWeightMinGrams, s.spawnWeightMaxGrams, ctx.rng);
  const ageDays = randInt(s.spawnAgeMinDays, s.spawnAgeMaxDays, ctx.rng);
  const fish = await tx.fish.create({
    data: {
      userId,
      speciesKey,
      sex: ctx.rng() < 0.5 ? 'male' : 'female',
      rarity: s.rarity,
      weightGrams,
      hp: ctx.cfg.care.hpMax,
      ageDays,
      baseValue: computeBaseValue({ rarity: s.rarity, weightGrams, ageDays, valuePerKg: s.valuePerKg }, ctx.cfg.value),
      location: opts.location,
      tripId: opts.tripId,
      origin,
      acquiredAt: ctx.now,
    },
  });
  await tx.fishEvent.create({ data: { fishId: fish.id, userId, type: 'acquired', data: { origin }, occurredAt: ctx.now } });

  const discovered = await tx.speciesDiscovery.createMany({ data: [{ userId, speciesKey, via: origin, firstAt: ctx.now }], skipDuplicates: true });
  if (discovered.count > 0) await bumpStat(tx, userId, 'species_discovered', 1, ctx);
  return fish;
}

/** The new account's grant from config `starter`: coins, fish in the tank, items, gear (equipped). */
export async function grantStarter(tx: Tx, userId: string, ctx: PlayerCtx): Promise<void> {
  const { starter } = ctx.cfg;
  if (starter.coins > 0) await adjustCoins(tx, userId, starter.coins, 'starting_grant');
  for (const key of starter.fish) await createFish(tx, userId, key, 'starter', { location: 'tank' }, ctx);
  for (const { itemKey, qty } of starter.items) await grantItemOrThrow(tx, userId, itemKey, qty);
  for (const key of starter.gear) await grantItemOrThrow(tx, userId, key, 1);

  const gear = await tx.gearItem.findMany({ where: { userId }, include: { def: true }, orderBy: { acquiredAt: 'asc' } });
  const first = (cat: string) => gear.find((g) => g.def.category === cat)?.id ?? null;
  const bait = await tx.itemDef.findFirst({ where: { key: { in: starter.items.map((i) => i.itemKey) }, category: 'bait' } });
  const loadout: Prisma.GearLoadoutUncheckedCreateInput = {
    userId,
    rodId: first('rod'),
    lineId: first('line'),
    hookId: first('hook'),
    coolerId: first('cooler'),
    baitKey: bait?.key ?? null,
  };
  await tx.gearLoadout.upsert({ where: { userId }, create: loadout, update: loadout });
}
