import { playerAction, readJson } from '@/lib/api';
import { startTrip } from '@/lib/game/fishing/trip';
import { str } from '@/lib/game/input';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await readJson(req);
  return playerAction(req, 'start_trip', (tx, ctx, userId) => startTrip(tx, userId, str(body, 'zoneKey'), ctx));
}
