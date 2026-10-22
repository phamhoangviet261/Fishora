import { playerRead } from '@/lib/api';
import { questList } from '@/lib/game/progression';

export const runtime = 'nodejs';

export async function GET() {
  return playerRead((tx, ctx, userId) => questList(tx, userId, ctx));
}
