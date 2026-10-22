import { playerRead } from '@/lib/api';
import { fishingView } from '@/lib/game/fishing/session';

export const runtime = 'nodejs';

export async function GET() {
  return playerRead((tx, ctx, userId) => fishingView(tx, userId, ctx));
}
