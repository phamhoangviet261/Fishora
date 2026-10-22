import { playerAction, readJson } from '@/lib/api';
import { cleanTank } from '@/lib/game/care';
import { str } from '@/lib/game/input';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await readJson(req);
  return playerAction(req, 'clean', (tx, ctx, userId) => cleanTank(tx, userId, str(body, 'levelKey'), ctx));
}
