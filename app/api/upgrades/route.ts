import { playerRead } from '@/lib/api';
import { upgradeStatus } from '@/lib/game/upgrades';

export const runtime = 'nodejs';

export async function GET() {
  return playerRead((tx, _ctx, userId) => upgradeStatus(tx, userId));
}
