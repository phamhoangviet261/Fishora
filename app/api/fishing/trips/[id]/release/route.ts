import { playerAction, readJson } from '@/lib/api';
import { releaseFromCooler } from '@/lib/game/fishing/trip';
import { strArray } from '@/lib/game/input';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson(req);
  return playerAction(req, 'release_cooler', (tx, ctx, userId) => releaseFromCooler(tx, userId, id, strArray(body, 'fishIds'), ctx));
}
