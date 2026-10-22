import { configProfile } from '../config';
import { adjustCoins } from '../ledger';
import { bumpStat } from '../progression';
import { GameError, type PlayerCtx, type Tx } from '../tx';

// Fishing spots (spec §7.1): each has its own species odds; unlocking needs the level and the coins, once.

export async function zoneList(tx: Tx, userId: string) {
  const [zones, unlocked] = await Promise.all([
    tx.zone.findMany({
      where: { profile: configProfile(), active: true },
      orderBy: { sortOrder: 'asc' },
      include: { species: { where: { species: { active: true, deletedAt: null } }, include: { species: true }, orderBy: { weight: 'desc' } } },
    }),
    tx.unlockedZone.findMany({ where: { userId } }),
  ]);
  const mine = new Set(unlocked.map((z) => z.zoneKey));
  const pct = (w: number, total: number) => (total > 0 ? Math.round((w / total) * 10_000) / 100 : 0);
  return zones.map((z) => {
    const total = z.missWeight + z.species.reduce((n, e) => n + e.weight, 0);
    return {
      key: z.key,
      name: z.name,
      minLevel: z.minLevel,
      unlockCost: z.unlockCost,
      unlocked: mine.has(z.key),
      missPct: pct(z.missWeight, total),
      odds: z.species.map((e) => ({ speciesKey: e.speciesKey, displayName: e.species.displayName, rarity: e.species.rarity, pct: pct(e.weight, total) })),
    };
  });
}

export async function unlockZone(tx: Tx, userId: string, zoneKey: string, ctx: PlayerCtx): Promise<void> {
  const zone = await tx.zone.findFirst({ where: { key: zoneKey, profile: configProfile(), active: true } });
  if (!zone) throw new GameError('not_found', 404);
  if (await tx.unlockedZone.findUnique({ where: { userId_zoneKey: { userId, zoneKey } } })) return;
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } });
  if (user.level < zone.minLevel) throw new GameError('level_too_low', 409, { required: zone.minLevel });
  if (zone.unlockCost > 0) await adjustCoins(tx, userId, -zone.unlockCost, `unlock_zone:${zoneKey}`);
  await tx.unlockedZone.create({ data: { userId, zoneKey, unlockedAt: ctx.now } });
  await bumpStat(tx, userId, 'zones_unlocked', 1, ctx);
}
