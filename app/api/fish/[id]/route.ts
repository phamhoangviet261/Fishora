import { playerAction, playerRead, readJson } from '@/lib/api';
import { fishDetail, renameFish } from '@/lib/game/care';
import { GameError } from '@/lib/game/tx';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return playerRead((tx, ctx, userId) => fishDetail(tx, userId, id, ctx));
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await readJson(req)) as { nickname?: unknown } | null;
  return playerAction(req, 'rename_fish', async (tx, ctx, userId) => {
    const nickname = body?.nickname;
    if (nickname !== null && typeof nickname !== 'string') throw new GameError('invalid_input', 400);
    await renameFish(tx, userId, id, nickname, ctx.now);
    return { ok: true };
  });
}
