import { cancelStaleTrips } from '../fishing/hooks';
import { openGrowthRewards } from '../rewards';
import { DAY_MS, REVIVE_WINDOW_DAYS } from '../rules';
import { careLevel, stackQty, takeItem } from '../storage';
import type { PlayerCtx, Tx } from '../tx';
import type { FoodStats } from '../types';
import { simulate, type SimInput } from './simulate';

export interface AdvanceResult {
  ticks: number;
  died: string[];
  lost: string[];
}

/**
 * Catches the player's world up to ctx.now (spec §11): runs the whole ticks since tank.simulatedUntil in order,
 * persists fish, dirt and consumed items, opens growth rewards, then expires revive windows that have passed.
 * Runs under withPlayer's player lock, and simulatedUntil only moves by whole ticks, so a repeat or a concurrent
 * login finds nothing left to process.
 */
export async function advanceWorld(tx: Tx, userId: string, ctx: PlayerCtx): Promise<AdvanceResult> {
  const result: AdvanceResult = { ticks: 0, died: [], lost: [] };
  const tank = await tx.tank.findUnique({ where: { userId } });
  if (tank) await advanceTank(tx, userId, tank, ctx, result);
  result.lost.push(...(await expireRevivals(tx, userId, ctx.now)));
  await cancelStaleTrips(tx, userId, ctx);
  return result;
}

type TankRow = NonNullable<Awaited<ReturnType<Tx['tank']['findUnique']>>>;

async function advanceTank(tx: Tx, userId: string, tank: TankRow, ctx: PlayerCtx, result: AdvanceResult): Promise<void> {
  const { care } = ctx.cfg;
  const tickMs = care.tickMinutes * 60_000;
  const ticks = Math.floor((ctx.now.getTime() - tank.simulatedUntil.getTime()) / tickMs);
  if (ticks <= 0) return;
  result.ticks = ticks;
  const until = new Date(tank.simulatedUntil.getTime() + ticks * tickMs);

  const rows = await tx.fish.findMany({ where: { userId, location: 'tank', status: 'alive' }, include: { species: true } });
  const allowed = await careLevel(tx, userId);
  const cleanItems = tank.autoClean && allowed.autoClean ? await stackQty(tx, userId, care.autoCleanItemKey) : null;

  // Nothing alive and nothing to clean: only the clock moves.
  if (rows.length === 0 && (cleanItems === null || tank.dirt === 0)) {
    await tx.tank.update({ where: { userId }, data: { simulatedUntil: until } });
    return;
  }

  let autoFeed: SimInput['autoFeed'] = null;
  if (tank.autoFeed && allowed.autoFeed && tank.autoFeedItemKey) {
    const def = await tx.itemDef.findUnique({ where: { key: tank.autoFeedItemKey } });
    if (def?.category === 'food') {
      autoFeed = {
        itemKey: def.key,
        stats: def.stats as unknown as FoodStats,
        main: await stackQty(tx, userId, def.key),
        reserve: await stackQty(tx, userId, def.key, 'reserve'),
      };
    }
  }

  const out = simulate(
    {
      from: tank.simulatedUntil,
      ticks,
      dirt: tank.dirt,
      fish: rows.map((f) => ({
        id: f.id,
        hp: f.hp,
        weightGrams: f.weightGrams,
        satietyTicks: f.satietyTicks,
        growthMult: f.growthMult,
        ageDays: f.ageDays,
        daysInTank: f.daysInTank,
        species: { maxWeightGrams: f.species.maxWeightGrams, growthGramsPerTick: f.species.growthGramsPerTick, foodUnitsPerFeed: f.species.foodUnitsPerFeed },
      })),
      autoFeed,
      autoClean: cleanItems === null ? null : { items: cleanItems },
      time: ctx.cfg.time,
    },
    care,
    ctx.rng,
  );

  const diedAt = new Map(out.died.map((d) => [d.id, d.at]));
  const revived = new Map(rows.map((f) => [f.id, f.revivedAt]));
  for (const f of out.fish) {
    const at = diedAt.get(f.id);
    const stats = { hp: f.hp, weightGrams: f.weightGrams, satietyTicks: f.satietyTicks, growthMult: f.growthMult, ageDays: f.ageDays, daysInTank: f.daysInTank };
    if (!at) {
      await tx.fish.update({ where: { id: f.id }, data: stats });
    } else if (revived.get(f.id)) {
      // Second death: no second revive (spec §5.2).
      await tx.fish.update({ where: { id: f.id }, data: { ...stats, status: 'lost', location: 'none', diedAt: at, endedAt: at } });
      await tx.fishEvent.createMany({ data: [{ fishId: f.id, userId, type: 'died', occurredAt: at }, { fishId: f.id, userId, type: 'lost', data: { reason: 'second_death' }, occurredAt: at }] });
      result.lost.push(f.id);
    } else {
      const reviveDeadline = new Date(at.getTime() + REVIVE_WINDOW_DAYS * DAY_MS);
      await tx.fish.update({ where: { id: f.id }, data: { ...stats, status: 'dead', location: 'none', diedAt: at, reviveDeadline } });
      await tx.fishEvent.create({ data: { fishId: f.id, userId, type: 'died', occurredAt: at } });
      result.died.push(f.id);
    }
  }

  if (autoFeed && out.used.main > 0) await takeItem(tx, userId, autoFeed.itemKey, out.used.main);
  if (autoFeed && out.used.reserve > 0) await takeItem(tx, userId, autoFeed.itemKey, out.used.reserve, 'reserve');
  if (out.used.cleanItems > 0) await takeItem(tx, userId, care.autoCleanItemKey, out.used.cleanItems);

  await tx.tank.update({
    where: { userId },
    data: { dirt: out.dirt, simulatedUntil: until, ...(out.lastAutoCleanAt ? { lastAutoCleanAt: out.lastAutoCleanAt } : {}) },
  });
  await openGrowthRewards(tx, userId, out.peaks, ctx);
}

/** Dead fish whose window has passed are lost as of the deadline, not as of now (spec §11 design note). */
async function expireRevivals(tx: Tx, userId: string, now: Date): Promise<string[]> {
  const due = await tx.fish.findMany({ where: { userId, status: 'dead', reviveDeadline: { lte: now } }, select: { id: true, reviveDeadline: true } });
  for (const f of due) {
    await tx.fish.update({ where: { id: f.id }, data: { status: 'lost', endedAt: f.reviveDeadline } });
    await tx.fishEvent.create({ data: { fishId: f.id, userId, type: 'lost', data: { reason: 'revive_expired' }, occurredAt: f.reviveDeadline! } });
  }
  return due.map((f) => f.id);
}
