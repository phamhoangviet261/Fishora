import { playerAction, readJson } from '@/lib/api';
import { returnToShore } from '@/lib/game/fishing/session';
import { GameError } from '@/lib/game/tx';

export const runtime = 'nodejs';

/** Return to shore: carried fish → storage. Optional `keepIds` (the rest are released for 25%). */
export async function POST(req: Request) {
  const body = (await readJson(req)) as { keepIds?: unknown } | null;
  return playerAction(req, 'fishing_return', (tx, ctx, userId) => {
    const keep = body?.keepIds;
    if (keep !== undefined && (!Array.isArray(keep) || keep.length > 500 || !keep.every((x) => typeof x === 'string'))) throw new GameError('invalid_input', 400);
    return returnToShore(tx, userId, (keep as string[] | undefined) ?? null, ctx);
  });
}
