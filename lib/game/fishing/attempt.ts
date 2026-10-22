import type { Prisma } from '@prisma/client';
import { createFish } from '../fish/create';
import { bumpStat, grantExp } from '../progression';
import { randInt } from '../rng';
import { BAIT_PER_CAST } from '../rules';
import { stackQty, takeItem } from '../storage';
import { GameError, type PlayerCtx, type Tx } from '../tx';
import type { BaitStats, GearStats, Rarity } from '../types';
import type { CatchCard } from './machine';
import { reelParams, replayReel, type ReelParams } from './reel';
import { eligibleEntries, neededCapacity, pickBite } from './select';
import { carriedGrams, ensureTrip } from './session';

// One cast, from bait to verdict (spec §7.3 + fishing MVP). The server decides everything that matters when the
// attempt starts (bait taken, bite or not, species, weight) and hands the client only the reel's difficulty and
// seed. On resolve it replays the client's recorded inputs and alone decides caught or escaped.

export type StartResult = { attemptId: string; tripId: string; waitMs: number; bite: boolean; reel: ReelParams | null };
export type ResolveResult = { outcome: 'caught' | 'escaped' | 'nothing'; card: CatchCard | null };

/** The equipped rod, container and bait, validated for fishing. */
export async function equippedForFishing(tx: Tx, userId: string) {
  const loadout = await tx.gearLoadout.findUnique({ where: { userId } });
  if (!loadout?.rodId) throw new GameError('no_rod', 409);
  const rod = await tx.gearItem.findFirst({ where: { id: loadout.rodId, userId }, include: { def: true } });
  if (!rod || rod.def.category !== 'rod') throw new GameError('no_rod', 409);
  if (rod.durability <= 0) throw new GameError('gear_broken', 409);
  if (!loadout.coolerId) throw new GameError('no_container', 409);
  const cooler = await tx.gearItem.findFirst({ where: { id: loadout.coolerId, userId }, include: { def: true } });
  if (!cooler || cooler.def.category !== 'cooler') throw new GameError('no_container', 409);
  if (!loadout.baitKey || (await stackQty(tx, userId, loadout.baitKey)) < BAIT_PER_CAST) throw new GameError('no_bait', 409);
  const rodStats = rod.def.stats as unknown as GearStats;
  return {
    rod,
    rodStats,
    maxRarity: (rodStats.maxRarity ?? 'common') as Rarity,
    capacityGrams: (cooler.def.stats as unknown as GearStats).capacityGrams ?? 0,
    baitKey: loadout.baitKey,
  };
}

/** The map's pool, joined with what each species needs for selection. */
export async function zonePool(tx: Tx, zoneKey: string) {
  const rows = await tx.zoneSpecies.findMany({ where: { zoneKey, species: { active: true, deletedAt: null } }, include: { species: true } });
  return rows.map((r) => ({ speciesKey: r.speciesKey, weight: r.weight, rarity: r.species.rarity, spawnWeightMaxGrams: r.species.spawnWeightMaxGrams, species: r.species }));
}

/** Cancels every open attempt whose time has run out (bait is not refunded). */
export async function expireAttempts(tx: Tx, userId: string, now: Date): Promise<void> {
  await tx.fishingAttempt.updateMany({ where: { userId, status: 'open', expiresAt: { lte: now } }, data: { status: 'cancelled', resolvedAt: now } });
}

/** Cancels the player's unfinished attempt (page closed, refreshed, or abandoned). Caught fish are untouched. */
export async function cancelOpenAttempts(tx: Tx, userId: string, now: Date): Promise<number> {
  const r = await tx.fishingAttempt.updateMany({ where: { userId, status: 'open' }, data: { status: 'cancelled', resolvedAt: now } });
  return r.count;
}

export async function startAttempt(tx: Tx, userId: string, zoneKey: string, ctx: PlayerCtx): Promise<StartResult> {
  const zone = await tx.zone.findFirst({ where: { key: zoneKey, active: true } });
  if (!zone) throw new GameError('not_found', 404);
  if (!(await tx.unlockedZone.findUnique({ where: { userId_zoneKey: { userId, zoneKey } } }))) throw new GameError('zone_locked', 409);
  if (await tx.fishingAttempt.findFirst({ where: { userId, status: 'open' } })) throw new GameError('attempt_open', 409);

  const gear = await equippedForFishing(tx, userId);
  const pool = eligibleEntries(await zonePool(tx, zoneKey), gear.maxRarity);
  if (pool.length === 0) throw new GameError('no_eligible_fish', 409, { maxRarity: gear.maxRarity });

  const trip = await ensureTrip(tx, userId, zoneKey, ctx.now);
  const free = gear.capacityGrams - (await carriedGrams(tx, trip.id));
  const need = neededCapacity(pool);
  if (free < need) throw new GameError('cooler_full', 409, { freeGrams: Math.max(0, free), needGrams: need });

  await takeItem(tx, userId, gear.baitKey, BAIT_PER_CAST);
  await bumpStat(tx, userId, 'casts', 1, ctx);

  const bait = await tx.itemDef.findUnique({ where: { key: gear.baitKey } });
  const speciesKey = pickBite(pool, zone.missWeight, ((bait?.stats ?? {}) as BaitStats).speciesMult ?? {}, ctx.rng);
  const entry = speciesKey ? pool.find((e) => e.speciesKey === speciesKey)! : null;
  const seed = randInt(1, 2 ** 31 - 2, ctx.rng);
  const { reel: cfg } = ctx.cfg.fishing;
  const reel = entry ? reelParams(entry.rarity, gear.rodStats, cfg, seed) : null;
  const waitMs = randInt(cfg.waitMs[0], cfg.waitMs[1], ctx.rng);

  const attempt = await tx.fishingAttempt.create({
    data: {
      userId,
      tripId: trip.id,
      zoneKey,
      seed,
      speciesKey,
      weightGrams: entry ? randInt(entry.species.spawnWeightMinGrams, entry.species.spawnWeightMaxGrams, ctx.rng) : null,
      reel: (reel ?? undefined) as Prisma.InputJsonValue | undefined,
      waitMs,
      createdAt: ctx.now,
      expiresAt: new Date(ctx.now.getTime() + cfg.attemptTtlSec * 1000),
    },
  });
  return { attemptId: attempt.id, tripId: trip.id, waitMs, bite: !!reel, reel };
}

/**
 * Verdict for an attempt. Repeats (retries, a second tab) get the stored verdict back; nothing is paid twice.
 * `inputs` is the cursor per reel tick (null = button not held).
 */
export async function resolveAttempt(tx: Tx, userId: string, attemptId: string, inputs: (number | null)[], ctx: PlayerCtx): Promise<ResolveResult> {
  const a = await tx.fishingAttempt.findFirst({ where: { id: attemptId, userId } });
  if (!a) throw new GameError('not_found', 404);
  if (a.status === 'cancelled') throw new GameError('attempt_closed', 409);
  if (a.status !== 'open') return a.result as unknown as ResolveResult;
  if (a.expiresAt <= ctx.now) throw new GameError('attempt_closed', 409);

  const reel = a.reel as unknown as ReelParams | null;
  const elapsed = ctx.now.getTime() - a.createdAt.getTime();
  let result: ResolveResult;
  let durabilityLoss = 0;

  if (!reel) {
    if (elapsed < a.waitMs * 0.5) throw new GameError('too_early', 409);
    result = { outcome: 'nothing', card: null };
  } else {
    const verdict = replayReel(reel, inputs);
    if (verdict.outcome === 'incomplete') throw new GameError('invalid_input', 400, { reason: 'reel_unfinished' });
    // The reel can't be finished faster than real time allows (with generous slack for clocks and frame drops).
    if (elapsed < (a.waitMs + verdict.ticks * reel.tickMs) * 0.5) throw new GameError('too_early', 409);
    if (verdict.outcome === 'caught') {
      const fish = await createFish(tx, userId, a.speciesKey!, 'fishing', { location: 'trip', tripId: a.tripId, weightGrams: a.weightGrams! }, ctx);
      const species = await tx.species.findUniqueOrThrow({ where: { key: fish.speciesKey } });
      result = {
        outcome: 'caught',
        card: { fishId: fish.id, name: species.displayName, speciesKey: species.key, modelKey: species.modelKey, rarity: fish.rarity, weightGrams: fish.weightGrams, baseValue: fish.baseValue },
      };
      durabilityLoss = ctx.cfg.fishing.catchDurabilityLoss;
      await bumpStat(tx, userId, 'fish_caught', 1, ctx);
      await grantExp(tx, userId, 'catch', ctx);
    } else {
      result = { outcome: 'escaped', card: null };
      durabilityLoss = ctx.cfg.fishing.fightFailDurabilityLoss;
    }
  }

  // Only an open attempt can be settled, and only once.
  const n = await tx.fishingAttempt.updateMany({
    where: { id: a.id, status: 'open' },
    data: { status: result.outcome, resolvedAt: ctx.now, fishId: result.card?.fishId ?? null, result: result as unknown as Prisma.InputJsonValue },
  });
  if (n.count === 0) throw new GameError('attempt_closed', 409);

  if (durabilityLoss > 0) {
    const loadout = await tx.gearLoadout.findUnique({ where: { userId } });
    if (loadout?.rodId) {
      const rod = await tx.gearItem.findFirst({ where: { id: loadout.rodId, userId } });
      if (rod) await tx.gearItem.update({ where: { id: rod.id }, data: { durability: Math.max(0, rod.durability - durabilityLoss) } });
    }
  }
  return result;
}

/** Cancels one open attempt (leaving the spot, closing the page). True if it was still open. */
export async function cancelAttempt(tx: Tx, userId: string, attemptId: string, now: Date): Promise<boolean> {
  const r = await tx.fishingAttempt.updateMany({ where: { id: attemptId, userId, status: 'open' }, data: { status: 'cancelled', resolvedAt: now } });
  return r.count > 0;
}
