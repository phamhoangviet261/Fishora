import { adjustCoins } from '../ledger';
import { GameError, type PlayerCtx, type Tx } from '../tx';

export const repairCost = (g: { durability: number; maxDurability: number }, perPoint: number) => (g.maxDurability - g.durability) * perPoint;

/** Worn or broken gear is never destroyed: repair brings it back to full for coins (spec §7.2). */
export async function repairGear(tx: Tx, userId: string, gearId: string, ctx: PlayerCtx): Promise<{ durability: number }> {
  const g = await tx.gearItem.findFirst({ where: { id: gearId, userId } });
  if (!g) throw new GameError('not_found', 404);
  const cost = repairCost(g, ctx.cfg.fishing.repairCostPerPoint);
  if (cost > 0) await adjustCoins(tx, userId, -cost, `repair:${g.defKey}`);
  await tx.gearItem.update({ where: { id: gearId }, data: { durability: g.maxDurability } });
  return { durability: g.maxDurability };
}
