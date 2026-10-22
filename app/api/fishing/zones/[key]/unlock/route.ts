import { playerAction } from '@/lib/api';
import { unlockZone } from '@/lib/game/fishing/zones';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return playerAction(req, 'unlock_zone', async (tx, ctx, userId) => {
    await unlockZone(tx, userId, key, ctx);
    return { ok: true };
  });
}
