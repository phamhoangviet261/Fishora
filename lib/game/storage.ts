import type { Prisma } from '@prisma/client';
import { configProfile } from './config';
import { GameError, type Tx } from './tx';
import { isGearCategory, type GearStats } from './types';

// Capacities come from the player's upgrade level on each track (no row = level 0), values from upgrade_levels.

export type UpgradeTrack = 'tank_capacity' | 'tank_care' | 'storage_fish' | 'storage_items';

export async function upgradeValue<T>(tx: Tx, userId: string, track: UpgradeTrack): Promise<T> {
  const mine = await tx.userUpgrade.findUnique({ where: { userId_track: { userId, track } } });
  const row = await tx.upgradeLevel.findUnique({ where: { profile_track_level: { profile: configProfile(), track, level: mine?.level ?? 0 } } });
  if (!row) throw new Error(`upgrade_missing:${track}:${mine?.level ?? 0}`);
  return row.value as T;
}

export async function tankCapacity(tx: Tx, userId: string): Promise<{ used: number; max: number }> {
  const [used, v] = await Promise.all([
    tx.fish.count({ where: { userId, location: 'tank', status: 'alive' } }),
    upgradeValue<{ maxFish: number }>(tx, userId, 'tank_capacity'),
  ]);
  return { used, max: v.maxFish };
}

export async function careLevel(tx: Tx, userId: string): Promise<{ autoFeed: boolean; autoClean: boolean }> {
  const v = await upgradeValue<{ autoFeed: boolean; autoClean: boolean }>(tx, userId, 'tank_care');
  return { autoFeed: !!v.autoFeed, autoClean: !!v.autoClean };
}

/** Storage holds fish by total weight, not by count (spec §8.1). */
export async function fishStorage(tx: Tx, userId: string): Promise<{ usedGrams: number; maxGrams: number }> {
  const [agg, v] = await Promise.all([
    tx.fish.aggregate({ where: { userId, location: 'storage', status: 'alive' }, _sum: { weightGrams: true } }),
    upgradeValue<{ maxGrams: number }>(tx, userId, 'storage_fish'),
  ]);
  return { usedGrams: agg._sum.weightGrams ?? 0, maxGrams: v.maxGrams };
}

export async function assertFishStorage(tx: Tx, userId: string, addGrams: number): Promise<void> {
  const { usedGrams, maxGrams } = await fishStorage(tx, userId);
  const freeGrams = Math.max(0, maxGrams - usedGrams);
  if (addGrams > freeGrams) throw new GameError('storage_full', 409, { needGrams: addGrams, freeGrams });
}

/** One slot per non-empty main stack plus one per gear piece. The tank's reserve hopper doesn't count. */
export async function itemSlots(tx: Tx, userId: string): Promise<{ used: number; max: number }> {
  const [stacks, gear, v] = await Promise.all([
    tx.inventoryStack.count({ where: { userId, bucket: 'main', qty: { gt: 0 } } }),
    tx.gearItem.count({ where: { userId } }),
    upgradeValue<{ slots: number }>(tx, userId, 'storage_items'),
  ]);
  return { used: stacks + gear, max: v.slots };
}

/** Adds items if they fit; false (and nothing written) if they don't. Gear becomes `qty` separate pieces. */
export async function tryGrantItem(tx: Tx, userId: string, itemKey: string, qty: number): Promise<boolean> {
  if (!Number.isInteger(qty) || qty <= 0) throw new GameError('invalid_input', 400);
  const def = await tx.itemDef.findUnique({ where: { key: itemKey } });
  if (!def) throw new GameError('not_found', 404);
  const slots = await itemSlots(tx, userId);

  if (isGearCategory(def.category)) {
    if (slots.used + qty > slots.max) return false;
    const { maxDurability } = def.stats as unknown as GearStats;
    await tx.gearItem.createMany({ data: Array.from({ length: qty }, () => ({ userId, defKey: itemKey, durability: maxDurability, maxDurability })) });
    return true;
  }

  const where = { userId_itemKey_bucket: { userId, itemKey, bucket: 'main' as const } };
  const stack = await tx.inventoryStack.findUnique({ where });
  if ((!stack || stack.qty === 0) && slots.used >= slots.max) return false;
  await tx.inventoryStack.upsert({ where, create: { userId, itemKey, qty }, update: { qty: { increment: qty } } });
  return true;
}

export async function grantItemOrThrow(tx: Tx, userId: string, itemKey: string, qty: number): Promise<void> {
  if (!(await tryGrantItem(tx, userId, itemKey, qty))) throw new GameError('item_storage_full', 409);
}

export async function takeItem(tx: Tx, userId: string, itemKey: string, qty: number, bucket: 'main' | 'reserve' = 'main'): Promise<void> {
  if (!Number.isInteger(qty) || qty <= 0) throw new GameError('invalid_input', 400);
  const n = await tx.$executeRaw`
    UPDATE "inventory_stacks" SET "qty" = "qty" - ${qty}
    WHERE "userId" = ${userId} AND "itemKey" = ${itemKey} AND "bucket" = ${bucket}::"StackBucket" AND "qty" >= ${qty}`;
  if (n === 0) throw new GameError('insufficient_items', 409);
}

export async function stackQty(tx: Tx, userId: string, itemKey: string, bucket: 'main' | 'reserve' = 'main'): Promise<number> {
  const s = await tx.inventoryStack.findUnique({ where: { userId_itemKey_bucket: { userId, itemKey, bucket } } });
  return s?.qty ?? 0;
}

export type ItemDefRow = Prisma.ItemDefGetPayload<object>;
