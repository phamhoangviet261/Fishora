import { playerAction, readJson } from '@/lib/api';
import { setAutoCare } from '@/lib/game/care';
import { optBool, optStr } from '@/lib/game/input';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  const body = await readJson(req);
  return playerAction(req, 'tank_settings', async (tx, _ctx, userId) => {
    await setAutoCare(tx, userId, { autoFeed: optBool(body, 'autoFeed'), autoClean: optBool(body, 'autoClean'), autoFeedItemKey: optStr(body, 'autoFeedItemKey') });
    return { ok: true };
  });
}
