import { playerAction, readJson } from '@/lib/api';
import { oneOf, strArray } from '@/lib/game/input';
import { sellFish } from '@/lib/game/sell';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await readJson(req);
  return playerAction(req, 'sell', (tx, ctx, userId) => sellFish(tx, userId, strArray(body, 'fishIds'), oneOf(body, 'mode', ['sell', 'release'] as const), ctx));
}
