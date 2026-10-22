import type { Prisma, PrismaClient } from '@prisma/client';
import { CONFIG_SECTIONS, type GameConfig } from './types';

export type { GameConfig };

/** 'live' for the game; the test suite sets FISHORA_CONFIG_PROFILE=test so it never reads or writes live values. */
export const configProfile = () => process.env.FISHORA_CONFIG_PROFILE ?? 'live';

/** Every tunable number, read fresh per request (admin edits apply on the next request). */
export async function loadConfig(db: PrismaClient | Prisma.TransactionClient, profile = configProfile()): Promise<GameConfig> {
  const rows = await db.gameConfig.findMany({ where: { profile } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const cfg: Partial<Record<keyof GameConfig, unknown>> = {};
  for (const key of CONFIG_SECTIONS) {
    if (!byKey.has(key)) throw new Error(`config_missing:${key}`);
    cfg[key] = byKey.get(key);
  }
  return cfg as GameConfig;
}
