import { playerRead } from '@/lib/api';
import { zoneList } from '@/lib/game/fishing/zones';

export const runtime = 'nodejs';

export async function GET() {
  return playerRead((tx, _ctx, userId) => zoneList(tx, userId));
}
