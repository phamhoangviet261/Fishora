import { json, requireUser } from '@/lib/api';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { coins: true, tankType: true } });
  if (!row) return json(401, { error: 'unauthenticated' });
  return json(200, { user, coins: row.coins, tankType: row.tankType });
}
