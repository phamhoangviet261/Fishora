import type { Fish } from '@prisma/client';
import { applicableMilestones, isMature, reviveCoinCost } from './fish/formulas';
import { adjustCoins } from './ledger';
import { bumpStat, grantExp } from './progression';
import { feedFish, type SimFish } from './sim/simulate';
import { assertFishStorage, careLevel, stackQty, takeItem, tankCapacity, tryGrantItem } from './storage';
import { GameError, type PlayerCtx, type Tx } from './tx';
import type { FoodStats } from './types';

// Manual tank care and fish handling (spec §3.1, §4, §5.1).

async function foodDef(tx: Tx, itemKey: string) {
  const def = await tx.itemDef.findUnique({ where: { key: itemKey } });
  if (!def || def.category !== 'food') throw new GameError('invalid_input', 400);
  return def;
}

/** Feeds the live tank fish from the main stock; short of food, a random subset is fed (spec §4.2). */
export async function feedTank(tx: Tx, userId: string, itemKey: string, ctx: PlayerCtx): Promise<{ fedIds: string[]; skippedIds: string[] }> {
  const def = await foodDef(tx, itemKey);
  const rows = await tx.fish.findMany({ where: { userId, location: 'tank', status: 'alive' }, include: { species: true } });
  if (rows.length === 0) throw new GameError('no_fish', 409);

  const sim: SimFish[] = rows.map((f) => ({
    id: f.id,
    hp: f.hp,
    weightGrams: f.weightGrams,
    satietyTicks: f.satietyTicks,
    growthMult: f.growthMult,
    ageDays: f.ageDays,
    daysInTank: f.daysInTank,
    species: { maxWeightGrams: f.species.maxWeightGrams, growthGramsPerTick: f.species.growthGramsPerTick, foodUnitsPerFeed: f.species.foodUnitsPerFeed },
  }));
  const { fedIds, used } = feedFish(sim, def.stats as unknown as FoodStats, { main: await stackQty(tx, userId, itemKey), reserve: 0 }, ctx.cfg.care, ctx.rng);
  if (fedIds.length === 0) throw new GameError('insufficient_items', 409);

  await takeItem(tx, userId, itemKey, used.main);
  const fed = new Set(fedIds);
  for (const f of sim.filter((s) => fed.has(s.id))) {
    await tx.fish.update({ where: { id: f.id }, data: { hp: f.hp, satietyTicks: f.satietyTicks, growthMult: f.growthMult } });
  }
  await tx.fishEvent.createMany({ data: fedIds.map((fishId) => ({ fishId, userId, type: 'fed', data: { itemKey }, occurredAt: ctx.now })) });
  await bumpStat(tx, userId, 'fish_fed', fedIds.length, ctx);
  await grantExp(tx, userId, 'feed', ctx);
  return { fedIds, skippedIds: rows.map((r) => r.id).filter((id) => !fed.has(id)) };
}

/** A manual cleaning level, paid in coins or items (spec §4.4). */
export async function cleanTank(tx: Tx, userId: string, levelKey: string, ctx: PlayerCtx): Promise<{ dirt: number }> {
  const level = ctx.cfg.care.cleaningLevels.find((l) => l.key === levelKey);
  if (!level) throw new GameError('invalid_input', 400);
  if (level.coins) await adjustCoins(tx, userId, -level.coins, `clean:${level.key}`);
  if (level.itemKey) await takeItem(tx, userId, level.itemKey, level.itemQty ?? 1);
  const tank = await tx.tank.findUniqueOrThrow({ where: { userId } });
  const dirt = Math.max(0, tank.dirt - level.dirtReduction);
  await tx.tank.update({ where: { userId }, data: { dirt } });
  await bumpStat(tx, userId, 'tank_cleaned', 1, ctx);
  await grantExp(tx, userId, 'clean', ctx);
  return { dirt };
}

export async function setAutoCare(tx: Tx, userId: string, s: { autoFeed?: boolean; autoClean?: boolean; autoFeedItemKey?: string }): Promise<void> {
  const allowed = await careLevel(tx, userId);
  if ((s.autoFeed && !allowed.autoFeed) || (s.autoClean && !allowed.autoClean)) throw new GameError('forbidden', 403);
  if (s.autoFeedItemKey !== undefined) await foodDef(tx, s.autoFeedItemKey);
  await tx.tank.update({ where: { userId }, data: { autoFeed: s.autoFeed, autoClean: s.autoClean, autoFeedItemKey: s.autoFeedItemKey } });
}

/** The player fills or empties the auto-feeder's reserve by hand; it never refills itself (spec §4.3). */
export async function moveReserve(tx: Tx, userId: string, itemKey: string, qty: number, dir: 'in' | 'out'): Promise<void> {
  await foodDef(tx, itemKey);
  if (dir === 'in') {
    await takeItem(tx, userId, itemKey, qty);
    await tx.inventoryStack.upsert({
      where: { userId_itemKey_bucket: { userId, itemKey, bucket: 'reserve' } },
      create: { userId, itemKey, bucket: 'reserve', qty },
      update: { qty: { increment: qty } },
    });
  } else {
    await takeItem(tx, userId, itemKey, qty, 'reserve');
    if (!(await tryGrantItem(tx, userId, itemKey, qty))) throw new GameError('item_storage_full', 409);
  }
}

async function ownedFish(tx: Tx, userId: string, fishId: string): Promise<Fish> {
  const f = await tx.fish.findFirst({ where: { id: fishId, userId } });
  if (!f) throw new GameError('not_found', 404);
  return f;
}

/** Moves a live fish between tank and storage; same individual, same id (spec §5.1). */
export async function moveFish(tx: Tx, userId: string, fishId: string, to: 'tank' | 'storage', now = new Date()): Promise<void> {
  const f = await ownedFish(tx, userId, fishId);
  if (f.status !== 'alive' || (f.location !== 'tank' && f.location !== 'storage')) throw new GameError('not_found', 404);
  if (f.location === to) return;
  if (to === 'tank') {
    const cap = await tankCapacity(tx, userId);
    if (cap.used >= cap.max) throw new GameError('tank_full', 409, cap);
  } else {
    await assertFishStorage(tx, userId, f.weightGrams);
  }
  await tx.fish.update({ where: { id: fishId }, data: { location: to } });
  await tx.fishEvent.create({ data: { fishId, userId, type: 'moved', data: { from: f.location, to }, occurredAt: now } });
}

export async function renameFish(tx: Tx, userId: string, fishId: string, nickname: string | null, now = new Date()): Promise<void> {
  const name = nickname === null ? null : nickname.trim();
  if (name !== null && (name.length < 1 || name.length > 24)) throw new GameError('invalid_input', 400);
  const f = await ownedFish(tx, userId, fishId);
  await tx.fish.update({ where: { id: fishId }, data: { nickname: name } });
  await tx.fishEvent.create({ data: { fishId, userId, type: 'renamed', data: { from: f.nickname, to: name }, occurredAt: now } });
}

export type MilestoneState = 'locked' | 'claimable' | 'claimed';

export async function fishDetail(tx: Tx, userId: string, fishId: string, ctx: PlayerCtx) {
  const fish = await ownedFish(tx, userId, fishId);
  const species = await tx.species.findUniqueOrThrow({ where: { key: fish.speciesKey } });
  const [events, reached, milestones, sale] = await Promise.all([
    tx.fishEvent.findMany({ where: { fishId }, orderBy: { occurredAt: 'desc' }, take: 100, select: { type: true, data: true, occurredAt: true } }),
    tx.fishMilestone.findMany({ where: { fishId } }),
    tx.milestone.findMany({ where: { OR: [{ speciesKey: fish.speciesKey }, { speciesKey: null }] } }),
    tx.fishSale.findUnique({ where: { fishId } }),
  ]);
  const claims = await tx.rewardClaim.findMany({ where: { id: { in: reached.map((r) => r.claimId) } }, select: { id: true, completedAt: true } });
  const done = new Map(claims.map((c) => [c.id, c.completedAt !== null]));
  const byWeight = new Map(reached.map((r) => [r.weightGrams, r]));
  const weights = new Set([...applicableMilestones(milestones, fish.speciesKey).map((m) => m.weightGrams), ...byWeight.keys()]);

  return {
    fish,
    name: fish.nickname ?? species.displayName,
    speciesName: species.displayName,
    modelKey: species.modelKey,
    maxWeightGrams: species.maxWeightGrams,
    mature: isMature(fish.weightGrams, species.maxWeightGrams),
    reviveCost: fish.status === 'dead' && !fish.revivedAt ? reviveCoinCost(fish.rarity, fish.ageDays, ctx.cfg.revive) : null,
    milestones: [...weights]
      .sort((a, b) => a - b)
      .map((weightGrams) => {
        const r = byWeight.get(weightGrams);
        const state: MilestoneState = !r ? 'locked' : done.get(r.claimId) ? 'claimed' : 'claimable';
        return { weightGrams, state, claimId: r?.claimId ?? null };
      }),
    events,
    sale,
  };
}
