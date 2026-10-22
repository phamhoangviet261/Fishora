import { playerRead, readJson } from '@/lib/api';
import { oneOf, strArray } from '@/lib/game/input';
import { previewSale } from '@/lib/game/sell';

export const runtime = 'nodejs';

/** POST only because it carries a list; it changes nothing. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return playerRead((tx, _ctx, userId) => previewSale(tx, userId, strArray(body, 'fishIds'), oneOf(body, 'mode', ['sell', 'release'] as const)));
}
