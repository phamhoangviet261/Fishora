import { playerAction, readJson } from '@/lib/api';
import { startAttempt } from '@/lib/game/fishing/attempt';
import { str } from '@/lib/game/input';

export const runtime = 'nodejs';

/** Cast: takes one bait and starts an attempt on the chosen map. Casting distance is not sent: it changes nothing. */
export async function POST(req: Request) {
  const body = await readJson(req);
  return playerAction(req, 'fishing_attempt', (tx, ctx, userId) => startAttempt(tx, userId, str(body, 'zoneKey'), ctx));
}
