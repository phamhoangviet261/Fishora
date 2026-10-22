import { playerAction, readJson } from '@/lib/api';
import { oneOf, str } from '@/lib/game/input';
import { buy } from '@/lib/game/shop';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = (await readJson(req)) as { qty?: unknown } | null;
  return playerAction(req, 'buy', (tx, ctx, userId) =>
    buy(tx, userId, { type: oneOf(body, 'type', ['fish', 'blindbox', 'item'] as const), key: str(body, 'key'), qty: typeof body?.qty === 'number' ? body.qty : undefined }, ctx),
  );
}
