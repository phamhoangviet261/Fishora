import { playerAction, readJson } from '@/lib/api';
import { returnHome } from '@/lib/game/fishing/trip';
import { GameError } from '@/lib/game/tx';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await readJson(req)) as { keepIds?: unknown } | null;
  return playerAction(req, 'return_home', (tx, ctx, userId) => {
    const keep = body?.keepIds;
    if (!Array.isArray(keep) || keep.length > 500 || !keep.every((x) => typeof x === 'string')) throw new GameError('invalid_input', 400);
    return returnHome(tx, userId, id, keep as string[], ctx);
  });
}
