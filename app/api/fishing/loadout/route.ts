import { playerAction, readJson } from '@/lib/api';
import { setLoadout, type LoadoutPatch } from '@/lib/game/fishing/loadout';
import { GameError } from '@/lib/game/tx';

export const runtime = 'nodejs';

const SLOTS = ['rodId', 'lineId', 'hookId', 'coolerId', 'baitKey'] as const;

export async function PUT(req: Request) {
  const body = (await readJson(req)) as Record<string, unknown> | null;
  return playerAction(req, 'loadout', async (tx, _ctx, userId) => {
    const patch: LoadoutPatch = {};
    for (const k of SLOTS) {
      const v = body?.[k];
      if (v === undefined) continue;
      if (v !== null && typeof v !== 'string') throw new GameError('invalid_input', 400, { field: k });
      patch[k] = v;
    }
    await setLoadout(tx, userId, patch);
    return { ok: true };
  });
}
