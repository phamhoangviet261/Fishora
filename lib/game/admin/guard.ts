import { prisma } from '@/lib/db';
import { GameError } from '../tx';

export async function assertAdmin(userId: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (u?.role !== 'admin') throw new GameError('forbidden', 403);
}
