import { PrismaClient } from '@prisma/client';

// One client per process; in dev, reuse it across hot reloads instead of opening new pools.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = g.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') g.prisma = prisma;
