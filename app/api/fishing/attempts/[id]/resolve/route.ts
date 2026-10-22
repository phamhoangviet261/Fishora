import { playerAction, readJson } from '@/lib/api';
import { resolveAttempt } from '@/lib/game/fishing/attempt';
import { GameError } from '@/lib/game/tx';

export const runtime = 'nodejs';

const MAX_INPUTS = 20_000;

/** The client's recorded reel (cursor per tick, null = not holding); the server replays it and decides. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await readJson(req)) as { inputs?: unknown } | null;
  return playerAction(req, 'fishing_resolve', (tx, ctx, userId) => {
    const inputs = body?.inputs;
    if (!Array.isArray(inputs) || inputs.length > MAX_INPUTS || !inputs.every((x) => x === null || (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1))) {
      throw new GameError('invalid_input', 400);
    }
    return resolveAttempt(tx, userId, id, inputs as (number | null)[], ctx);
  });
}
