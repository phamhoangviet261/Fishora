import { playerAction } from '@/lib/api';
import { repairGear } from '@/lib/game/fishing/repair';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return playerAction(req, 'repair', (tx, ctx, userId) => repairGear(tx, userId, id, ctx));
}
