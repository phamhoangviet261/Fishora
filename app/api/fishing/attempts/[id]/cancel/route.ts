import { gameRoute, json, requireUser } from '@/lib/api';
import { cancelAttempt } from '@/lib/game/fishing/attempt';
import { withPlayer } from '@/lib/game/tx';

export const runtime = 'nodejs';

/**
 * Abandons an unfinished attempt (leaving the page). Sent with navigator.sendBeacon, which can't add an
 * Idempotency-Key header; cancelling twice is harmless. The bait is not refunded; caught fish are untouched.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return gameRoute(async () => {
    const user = await requireUser();
    if (user instanceof Response) return user;
    return json(200, { cancelled: await withPlayer(user.id, (tx, ctx) => cancelAttempt(tx, user.id, id, ctx.now)) });
  })();
}
