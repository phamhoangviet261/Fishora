import { playerRead } from '@/lib/api';
import { rewardInbox } from '@/lib/game/rewards';

export const runtime = 'nodejs';

export async function GET() {
  return playerRead((tx, _ctx, userId) => rewardInbox(tx, userId));
}
