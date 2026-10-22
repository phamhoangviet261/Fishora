import { playerRead } from '@/lib/api';
import { bootstrap } from '@/lib/game/snapshot';

export const runtime = 'nodejs';

/** The game snapshot; `?load=1` marks a fresh page load (which ends any trip the closed page left open). Never cached. */
export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get('load') === '1';
  return playerRead((tx, ctx, userId) => bootstrap(tx, userId, ctx, { fresh }));
}
