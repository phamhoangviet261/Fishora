import { reviveCoinCost, revivedHp } from './fish/formulas';
import { adjustCoins } from './ledger';
import { assertFishStorage, takeItem } from './storage';
import { GameError, type PlayerCtx, type Tx } from './tx';

/**
 * One revive per lifetime, within 14 days of the first death, paid in coins or with the special item. The fish
 * returns to storage with part of its HP, never straight to the tank (spec §5.2). The deadline is checked
 * against now even if expiry hasn't been processed yet.
 */
export async function reviveFish(tx: Tx, userId: string, fishId: string, method: 'coins' | 'item', ctx: PlayerCtx): Promise<{ hp: number }> {
  const f = await tx.fish.findFirst({ where: { id: fishId, userId } });
  if (!f) throw new GameError('not_found', 404);
  if (f.status !== 'dead' || f.revivedAt || !f.reviveDeadline || f.reviveDeadline <= ctx.now) throw new GameError('revive_unavailable', 409);

  await assertFishStorage(tx, userId, f.weightGrams);
  if (method === 'coins') await adjustCoins(tx, userId, -reviveCoinCost(f.rarity, f.ageDays, ctx.cfg.revive), `revive:${f.id}`);
  else await takeItem(tx, userId, ctx.cfg.revive.itemKey, 1);

  const hp = revivedHp(ctx.cfg.care.hpMax, ctx.cfg.revive.hpRatio);
  await tx.fish.update({ where: { id: f.id }, data: { status: 'alive', location: 'storage', hp, satietyTicks: 0, revivedAt: ctx.now } });
  await tx.fishEvent.create({ data: { fishId: f.id, userId, type: 'revived', data: { method }, occurredAt: ctx.now } });
  return { hp };
}
