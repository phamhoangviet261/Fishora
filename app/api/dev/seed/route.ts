import { json, readJson } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { devOnly } from '@/lib/devOnly';
import { setLoadout } from '@/lib/game/fishing/loadout';
import { tryGrantItem } from '@/lib/game/storage';
import { withPlayer } from '@/lib/game/tx';
import { applyContent } from '@/prisma/seed/apply';
import { TEST_CONTENT, TEST_SPECIES } from '@/prisma/seed/test-content';
import { parseSeedOptions } from './options';

export const runtime = 'nodejs';

/**
 * E2E setup: writes the deterministic test content (profile 'test'). For the signed-in player it can also set the
 * coin balance, fill storage with one heavy fish (to exercise the "storage full" paths) and hand out a fishing kit.
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
  if (user && opts.fishingKit) {
    // A test rod, a cooler and some bait, equipped, with the test pond unlocked.
    await withPlayer(user.id, async (tx) => {
      await tryGrantItem(tx, user.id, 't_rod', 1);
      await tryGrantItem(tx, user.id, 't_cooler', 1);
      if (opts.fishingKit!.bait > 0) await tryGrantItem(tx, user.id, 't_bait', opts.fishingKit!.bait);
      const gear = await tx.gearItem.findMany({ where: { userId: user.id } });
      await setLoadout(tx, user.id, {
        rodId: gear.find((g) => g.defKey === 't_rod')!.id,
        coolerId: gear.find((g) => g.defKey === 't_cooler')!.id,
        baitKey: 't_bait',
      });
      await tx.unlockedZone.createMany({ data: [{ userId: user.id, zoneKey: 't_pond' }], skipDuplicates: true });
    });
  }
  return json(200, { ok: true });
}
