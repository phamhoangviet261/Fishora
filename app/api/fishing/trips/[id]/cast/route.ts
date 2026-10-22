import { playerAction } from '@/lib/api';
import { cast } from '@/lib/game/fishing/cast';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return playerAction(req, 'cast', (tx, ctx, userId) => cast(tx, userId, id, ctx));
}
