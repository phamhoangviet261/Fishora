import { playerAction, readJson } from '@/lib/api';
import { strArray } from '@/lib/game/input';
import { releaseCarried } from '@/lib/game/fishing/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await readJson(req);
  return playerAction(req, 'fishing_release', (tx, ctx, userId) => releaseCarried(tx, userId, strArray(body, 'fishIds'), ctx));
}
