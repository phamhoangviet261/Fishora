import { playerRead } from '@/lib/api';
import { collection } from '@/lib/game/progression';

export const runtime = 'nodejs';

export async function GET() {
  return playerRead((tx, _ctx, userId) => collection(tx, userId));
}
