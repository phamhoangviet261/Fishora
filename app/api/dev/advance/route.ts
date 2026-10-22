import { json, readJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/db';
import { devOnly } from '@/lib/devOnly';
import { posInt } from '@/lib/game/input';
import { GameError } from '@/lib/game/tx';

export const runtime = 'nodejs';

/**
 * E2E time travel: shifts the caller's clocks back by `hours`, which is the same as that much time passing.
 * The next request then simulates those hours like an offline gap.
 */
export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const user = await requireUser();
  if (user instanceof Response) return user;
  let hours: number;
  try {
    hours = posInt(await readJson(req), 'hours', 24 * 400);
  } catch (e) {
    if (e instanceof GameError) return json(400, { error: e.code });
    throw e;
  }
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "tanks" SET "simulatedUntil" = "simulatedUntil" - make_interval(hours => ${hours}::int) WHERE "userId" = ${user.id}`,
    prisma.$executeRaw`UPDATE "fish" SET "reviveDeadline" = "reviveDeadline" - make_interval(hours => ${hours}::int) WHERE "userId" = ${user.id} AND "reviveDeadline" IS NOT NULL`,
    prisma.$executeRaw`UPDATE "fishing_trips" SET "lastSeenAt" = "lastSeenAt" - make_interval(hours => ${hours}::int) WHERE "userId" = ${user.id} AND "status" = 'active'`,
  ]);
  return json(200, { ok: true });
}
