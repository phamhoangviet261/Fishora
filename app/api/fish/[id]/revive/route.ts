import { playerAction, readJson } from '@/lib/api';
import { oneOf } from '@/lib/game/input';
import { reviveFish } from '@/lib/game/revive';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson(req);
  return playerAction(req, 'revive', (tx, ctx, userId) => reviveFish(tx, userId, id, oneOf(body, 'method', ['coins', 'item'] as const), ctx));
}
