import { playerRead } from '@/lib/api';
import { storageView } from '@/lib/game/snapshot';

export const runtime = 'nodejs';

export async function GET() {
  return playerRead((tx, _ctx, userId) => storageView(tx, userId));
}
