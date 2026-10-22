import { json, readJson } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { devOnly } from '@/lib/devOnly';
import { applyContent } from '@/prisma/seed/apply';
import { TEST_CONTENT, TEST_SPECIES } from '@/prisma/seed/test-content';
import { parseSeedOptions } from './options';

export const runtime = 'nodejs';

/**
 * E2E setup: writes the deterministic test content (profile 'test'). For the signed-in player it can also set the
 * coin balance and fill storage with one heavy fish (to exercise the "storage full" paths).
 */
export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const opts = parseSeedOptions(await readJson(req));
  if (!opts) return json(400, { error: 'invalid_input' });
  await applyContent(prisma, TEST_CONTENT, 'test');

  const user = await getCurrentUser();
  if (user && opts.coins !== undefined) await prisma.user.update({ where: { id: user.id }, data: { coins: opts.coins } });
  if (user && opts.fillStorageGrams) {
    await prisma.fish.create({
      data: {
        userId: user.id, speciesKey: TEST_SPECIES.big, sex: 'female', rarity: 'epic', weightGrams: opts.fillStorageGrams, hp: 100, ageDays: 5,
        baseValue: 1, location: 'storage', origin: 'reward',
      },
    });
  }
  return json(200, { ok: true });
}
