import { json, requireUser } from '@/lib/api';
import { listTransactions } from '@/lib/game/wallet';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 50);
  return json(200, { transactions: await listTransactions(user.id, limit) });
}
