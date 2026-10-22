import { playerAction, readJson } from '@/lib/api';
import { str } from '@/lib/game/input';
import { openBlindbox } from '@/lib/game/shop';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await readJson(req);
  return playerAction(req, 'open_blindbox', (tx, ctx, userId) => openBlindbox(tx, userId, str(body, 'itemKey'), ctx));
}
