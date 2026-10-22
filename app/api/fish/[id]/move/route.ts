import { playerAction, readJson } from '@/lib/api';
import { moveFish } from '@/lib/game/care';
import { oneOf } from '@/lib/game/input';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson(req);
  return playerAction(req, 'move_fish', async (tx, ctx, userId) => {
    await moveFish(tx, userId, id, oneOf(body, 'to', ['tank', 'storage'] as const), ctx.now);
    return { ok: true };
  });
}
