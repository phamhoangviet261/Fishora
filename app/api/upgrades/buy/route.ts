import { playerAction, readJson } from '@/lib/api';
import { str } from '@/lib/game/input';
import { buyUpgrade } from '@/lib/game/upgrades';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await readJson(req);
  return playerAction(req, 'buy_upgrade', (tx, _ctx, userId) => buyUpgrade(tx, userId, str(body, 'track')));
}
