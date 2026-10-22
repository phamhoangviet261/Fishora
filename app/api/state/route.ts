import { playerRead } from '@/lib/api';
import { bootstrap } from '@/lib/game/snapshot';

export const runtime = 'nodejs';

/** Game load: catches the world up, counts the daily login, returns the snapshot. Never cached. */
export async function GET() {
  return playerRead((tx, ctx, userId) => bootstrap(tx, userId, ctx));
}
