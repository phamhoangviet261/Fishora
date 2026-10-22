import { playerAction } from '@/lib/api';
import { heartbeat } from '@/lib/game/fishing/trip';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return playerAction(req, 'heartbeat', (tx, ctx, userId) => heartbeat(tx, userId, id, ctx));
}
