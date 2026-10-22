import { playerAction, readJson } from '@/lib/api';
import { feedTank } from '@/lib/game/care';
import { str } from '@/lib/game/input';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await readJson(req);
  return playerAction(req, 'feed', (tx, ctx, userId) => feedTank(tx, userId, str(body, 'itemKey'), ctx));
}
