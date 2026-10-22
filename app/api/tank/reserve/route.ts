import { playerAction, readJson } from '@/lib/api';
import { moveReserve } from '@/lib/game/care';
import { oneOf, posInt, str } from '@/lib/game/input';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await readJson(req);
  return playerAction(req, 'reserve', async (tx, _ctx, userId) => {
    await moveReserve(tx, userId, str(body, 'itemKey'), posInt(body, 'qty'), oneOf(body, 'direction', ['in', 'out'] as const));
    return { ok: true };
  });
}
