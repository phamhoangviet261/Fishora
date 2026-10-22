import { cancelActiveTrips } from './fishing/hooks';
import { isMature, reviveCoinCost } from './fish/formulas';
import { ensureDailyQuests, recordDailyLogin } from './progression';
import { careLevel, fishStorage, itemSlots, tankCapacity } from './storage';
import type { PlayerCtx, Tx } from './tx';
import type { GearStats } from './types';

// What the client reads: one snapshot on load (GET /api/state) and the storage view (GET /api/storage).

/**
 * The snapshot read. On a fresh game load (`fresh`) a new session also cancels any unfinished trip, since the
 * previous page was closed (spec §7.4); a refresh while playing must not. Both count the daily login and hand out
 * today's quests.
 */
export async function bootstrap(tx: Tx, userId: string, ctx: PlayerCtx, opts: { fresh: boolean } = { fresh: false }) {
  if (opts.fresh) await cancelActiveTrips(tx, userId, ctx);
  await recordDailyLogin(tx, userId, ctx);
  await ensureDailyQuests(tx, userId, ctx);
  return buildSnapshot(tx, userId, ctx);
}

export async function buildSnapshot(tx: Tx, userId: string, ctx: PlayerCtx) {
  const [user, tank, capacity, care, tankFish, dead, pendingClaims, trip] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true, level: true, exp: true, role: true, email: true } }),
    tx.tank.findUniqueOrThrow({ where: { userId } }),
    tankCapacity(tx, userId),
    careLevel(tx, userId),
    tx.fish.findMany({ where: { userId, location: 'tank', status: 'alive' }, include: { species: true }, orderBy: { acquiredAt: 'asc' } }),
    tx.fish.findMany({ where: { userId, status: 'dead' }, include: { species: true }, orderBy: { reviveDeadline: 'asc' } }),
    tx.rewardClaim.count({ where: { userId, completedAt: null } }),
    tx.fishingTrip.findFirst({ where: { userId, status: 'active' }, select: { id: true } }),
  ]);
  const thresholds = ctx.cfg.exp.levelThresholds;
  return {
    player: {
      email: user.email,
      coins: user.coins,
      level: user.level,
      exp: user.exp,
      prevLevelExp: thresholds[user.level - 2] ?? 0,
      nextLevelExp: thresholds[user.level - 1] ?? null,
      role: user.role,
    },
    tank: {
      dirt: tank.dirt,
      dirtMax: ctx.cfg.care.dirtMax,
      dirtThresholds: ctx.cfg.care.dirtThresholds.map((t) => t.at),
      capacity,
      autoFeed: tank.autoFeed,
      autoClean: tank.autoClean,
      autoFeedItemKey: tank.autoFeedItemKey,
      care,
      tickMinutes: ctx.cfg.care.tickMinutes,
      cleaningLevels: ctx.cfg.care.cleaningLevels,
    },
    tankFish: tankFish.map((f) => ({
      id: f.id,
      name: f.nickname ?? f.species.displayName,
      speciesKey: f.speciesKey,
      speciesName: f.species.displayName,
      modelKey: f.species.modelKey,
      rarity: f.rarity,
      sex: f.sex,
      hp: f.hp,
      hpMax: ctx.cfg.care.hpMax,
      weightGrams: f.weightGrams,
      maxWeightGrams: f.species.maxWeightGrams,
      mature: isMature(f.weightGrams, f.species.maxWeightGrams),
      hungry: f.satietyTicks === 0,
      foodUnitsPerFeed: f.species.foodUnitsPerFeed,
    })),
    dead: dead.map((f) => ({
      id: f.id,
      name: f.nickname ?? f.species.displayName,
      reviveDeadline: f.reviveDeadline,
      reviveCost: reviveCoinCost(f.rarity, f.ageDays, ctx.cfg.revive),
    })),
    counts: { pendingClaims },
    activeTripId: trip?.id ?? null,
    /** How often an open trip must check in so it isn't cancelled as abandoned. */
    tripHeartbeatSec: Math.max(5, Math.floor(ctx.cfg.fishing.tripTimeoutSec / 3)),
    now: ctx.now,
  };
}

export type GameSnapshot = Awaited<ReturnType<typeof buildSnapshot>>;

export async function storageView(tx: Tx, userId: string, ctx?: PlayerCtx) {
  const [fish, stacks, gear, fishCapacity, slots, loadout] = await Promise.all([
    tx.fish.findMany({ where: { userId, location: 'storage', status: 'alive' }, include: { species: true }, orderBy: { acquiredAt: 'desc' } }),
    tx.inventoryStack.findMany({ where: { userId, qty: { gt: 0 } }, orderBy: { itemKey: 'asc' } }),
    tx.gearItem.findMany({ where: { userId }, include: { def: true }, orderBy: { acquiredAt: 'asc' } }),
    fishStorage(tx, userId),
    itemSlots(tx, userId),
    tx.gearLoadout.findUnique({ where: { userId } }),
  ]);
  const defs = await tx.itemDef.findMany({ where: { key: { in: stacks.map((s) => s.itemKey) } } });
  const def = new Map(defs.map((d) => [d.key, d]));
  const stack = (s: (typeof stacks)[number]) => ({ itemKey: s.itemKey, qty: s.qty, name: def.get(s.itemKey)?.name ?? s.itemKey, category: def.get(s.itemKey)?.category ?? 'unknown' });
  return {
    fish: fish.map((f) => ({
      id: f.id,
      name: f.nickname ?? f.species.displayName,
      speciesKey: f.speciesKey,
      speciesName: f.species.displayName,
      modelKey: f.species.modelKey,
      rarity: f.rarity,
      sex: f.sex,
      hp: f.hp,
      weightGrams: f.weightGrams,
      maxWeightGrams: f.species.maxWeightGrams,
      mature: isMature(f.weightGrams, f.species.maxWeightGrams),
      baseValue: f.baseValue,
    })),
    fishCapacity,
    stacks: stacks.filter((s) => s.bucket === 'main').map(stack),
    reserve: stacks.filter((s) => s.bucket === 'reserve').map(stack),
    gear: gear.map((g) => {
      const stats = g.def.stats as unknown as GearStats;
      return {
        id: g.id,
        defKey: g.defKey,
        name: g.def.name,
        category: g.def.category,
        tier: stats.tier,
        maxLoadGrams: stats.maxLoadGrams ?? null,
        capacityGrams: stats.capacityGrams ?? null,
        durability: g.durability,
        maxDurability: g.maxDurability,
        broken: g.durability === 0,
        repairCost: ctx ? (g.maxDurability - g.durability) * ctx.cfg.fishing.repairCostPerPoint : null,
      };
    }),
    slots,
    loadout,
  };
}
