import { playerRead } from '@/lib/api';
import { achievementList } from '@/lib/game/progression';

export const runtime = 'nodejs';

export async function GET() {
  return playerRead((tx, _ctx, userId) => achievementList(tx, userId));
}
