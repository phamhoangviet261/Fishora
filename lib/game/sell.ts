import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { saleAmount } from './fish/formulas';
import { adjustCoins } from './ledger';
import { bumpStat, grantExp } from './progression';
import { GameError, type PlayerCtx, type Tx } from './tx';

// Selling and releasing (spec §9). The server prices every fish; the batch pays out in one ledger row.

type SaleFish = Prisma.FishGetPayload<{ include: { species: { select: { maxWeightGrams: true } } } }>;
export type SaleMode = 'sell' | 'release';

async function sellable(tx: Tx, userId: string, fishIds: string[]): Promise<SaleFish[]> {
  const fish = await tx.fish.findMany({
    where: { id: { in: fishIds }, userId, status: 'alive', location: { in: ['storage', 'tank'] } },
    include: { species: { select: { maxWeightGrams: true } } },
  });
  if (fishIds.length === 0 || fish.length !== new Set(fishIds).size) throw new GameError('invalid_input', 400);
  return fish;
}

const lines = (fish: SaleFish[], mode: SaleMode) => fish.map((f) => ({ fishId: f.id, ...saleAmount(f, f.species.maxWeightGrams, mode) }));

export async function previewSale(tx: Tx, userId: string, fishIds: string[], mode: SaleMode) {
  const l = lines(await sellable(tx, userId, fishIds), mode);
  return { lines: l, total: l.reduce((n, x) => n + x.coins, 0) };
}

export async function sellFish(tx: Tx, userId: string, fishIds: string[], mode: SaleMode, ctx: PlayerCtx): Promise<{ total: number; batchId: string }> {
  return settleSale(tx, userId, await sellable(tx, userId, fishIds), mode, ctx);
}

/**
 * Ends each fish as sold/released and pays the batch once. No location check here: callers decide which fish may
 * be settled (fishing reuses this for releases from the cooler).
 */
export async function settleSale(tx: Tx, userId: string, fish: SaleFish[], mode: SaleMode, ctx: PlayerCtx): Promise<{ total: number; batchId: string }> {
  const batchId = randomUUID();
  const l = lines(fish, mode);
  // fish_sales is keyed by fishId: a fish settled twice fails the whole batch.
  await tx.fishSale.createMany({ data: l.map((x) => ({ fishId: x.fishId, userId, mode, coins: x.coins, maturityBonus: x.maturityBonus, batchId })) });
  const status = mode === 'sell' ? 'sold' : 'released';
  await tx.fish.updateMany({ where: { id: { in: fish.map((f) => f.id) } }, data: { status, location: 'none', endedAt: ctx.now } });
  await tx.fishEvent.createMany({ data: l.map((x) => ({ fishId: x.fishId, userId, type: status, data: { coins: x.coins, batchId }, occurredAt: ctx.now })) });
  const total = l.reduce((n, x) => n + x.coins, 0);
  if (total > 0) await adjustCoins(tx, userId, total, `${mode}_batch:${batchId}`);
  if (mode === 'sell') {
    await bumpStat(tx, userId, 'fish_sold', fish.length, ctx);
    await grantExp(tx, userId, 'sell', ctx);
  }
  return { total, batchId };
}
