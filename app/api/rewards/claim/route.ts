import { playerAction, readJson } from '@/lib/api';
import { strArray } from '@/lib/game/input';
import { claimParts } from '@/lib/game/rewards';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await readJson(req);
  return playerAction(req, 'claim', (tx, ctx, userId) => claimParts(tx, userId, strArray(body, 'partIds'), ctx));
}
