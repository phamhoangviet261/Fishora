import { gameRoute, json, requireUser } from '@/lib/api';
import { activeTrip, cancelTrip } from '@/lib/game/fishing/trip';
import { withPlayer } from '@/lib/game/tx';

export const runtime = 'nodejs';

/**
 * Leaving without returning home. Also sent by navigator.sendBeacon when the page closes, which can't carry an
 * Idempotency-Key header; cancelling twice is harmless (the second finds no active trip).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return gameRoute(async () => {
    const user = await requireUser();
    if (user instanceof Response) return user;
    const cancelled = await withPlayer(user.id, async (tx, ctx) => {
      await activeTrip(tx, user.id, id);
      return cancelTrip(tx, id, 'closed', ctx.now);
    });
    return json(200, { cancelled });
  })();
}
