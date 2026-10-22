import { json, requireUser } from '@/lib/api';
import { WATER_CHANGE_COST } from '@/lib/game/catalog';
import { spendCoins } from '@/lib/game/wallet';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const key = req.headers.get('idempotency-key');
  if (!key || key.length > 100) return json(400, { error: 'missing_idempotency_key' });
  const result = await spendCoins(user.id, WATER_CHANGE_COST, 'water_change', key);
  if (!result.ok) return json(409, { error: result.error });
  return json(200, { coins: result.balance });
}
