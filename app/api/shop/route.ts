import { playerRead } from '@/lib/api';
import { shopCatalog } from '@/lib/game/shop';

export const runtime = 'nodejs';

export async function GET() {
  return playerRead((tx, ctx, userId) => shopCatalog(tx, userId, ctx));
}
