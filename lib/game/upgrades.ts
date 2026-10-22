import { configProfile } from './config';
import { adjustCoins } from './ledger';
import type { UpgradeTrack } from './storage';
import { GameError, type Tx } from './tx';

export const UPGRADE_TRACKS: readonly UpgradeTrack[] = ['tank_capacity', 'tank_care', 'storage_fish', 'storage_items'];

export async function upgradeStatus(tx: Tx, userId: string) {
  const [mine, levels] = await Promise.all([
    tx.userUpgrade.findMany({ where: { userId } }),
    tx.upgradeLevel.findMany({ where: { profile: configProfile() }, orderBy: { level: 'asc' } }),
  ]);
  const current = new Map(mine.map((m) => [m.track, m.level]));
  return UPGRADE_TRACKS.map((track) => {
    const level = current.get(track) ?? 0;
    const rows = levels.filter((l) => l.track === track);
    const now = rows.find((l) => l.level === level);
    const next = rows.find((l) => l.level === level + 1);
    return {
      track,
      level,
      value: now?.value ?? null,
      next: next ? { level: next.level, cost: next.cost, minPlayerLevel: next.minPlayerLevel, value: next.value } : null,
    };
  });
}

/** Next level of a track: needs the player level, then the coins (spec §4.1, §8.1). */
export async function buyUpgrade(tx: Tx, userId: string, track: string): Promise<{ level: number }> {
  if (!(UPGRADE_TRACKS as readonly string[]).includes(track)) throw new GameError('invalid_input', 400);
  const mine = await tx.userUpgrade.findUnique({ where: { userId_track: { userId, track } } });
  const level = (mine?.level ?? 0) + 1;
  const next = await tx.upgradeLevel.findUnique({ where: { profile_track_level: { profile: configProfile(), track, level } } });
  if (!next) throw new GameError('max_level', 409);
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } });
  if (user.level < next.minPlayerLevel) throw new GameError('level_too_low', 409, { required: next.minPlayerLevel });
  if (next.cost > 0) await adjustCoins(tx, userId, -next.cost, `upgrade:${track}:${level}`);
  await tx.userUpgrade.upsert({ where: { userId_track: { userId, track } }, create: { userId, track, level }, update: { level } });
  return { level };
}
