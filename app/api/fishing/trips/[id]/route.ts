import { playerRead } from '@/lib/api';
import { tripView } from '@/lib/game/fishing/trip';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return playerRead((tx, _ctx, userId) => tripView(tx, userId, id));
}
