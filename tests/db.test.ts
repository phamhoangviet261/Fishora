import { prisma } from '@/lib/db';

test('can reach the database', async () => {
  const rows = await prisma.$queryRaw<{ ok: number }[]>`select 1 as ok`;
  expect(Number(rows[0].ok)).toBe(1);
});

afterAll(() => prisma.$disconnect());
