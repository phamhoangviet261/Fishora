import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { adjustCoins } from '@/lib/game/ledger';
import { GameError, withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const coins = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).coins;

test('same idempotency key returns the stored result and runs fn once', async () => {
  const u = await createTestUser();
  const key = randomUUID();
  let runs = 0;
  const call = () =>
    withPlayer(
      u.id,
      async (tx) => {
        runs++;
        return { balance: await adjustCoins(tx, u.id, -5, 'test') };
      },
      { idempotencyKey: key, kind: 'test' },
    );
  const results = await Promise.all([call(), call(), call(), call(), call()]);
  expect(runs).toBe(1);
  expect(results).toEqual(Array(5).fill({ balance: 245 }));
  expect(await coins(u.id)).toBe(245);
});

test('a GameError inside fn rolls back coins and leaves no operation row', async () => {
  const u = await createTestUser();
  const key = randomUUID();
  await expect(
    withPlayer(
      u.id,
      async (tx) => {
        await adjustCoins(tx, u.id, -5, 'test');
        throw new GameError('tank_full', 409);
      },
      { idempotencyKey: key, kind: 'test' },
    ),
  ).rejects.toMatchObject({ code: 'tank_full', status: 409 });
  expect(await coins(u.id)).toBe(250);
  expect(await prisma.operation.count({ where: { userId: u.id } })).toBe(0);
});

test('concurrent different keys serialise: 20 spends of 15 from 250 leave 10', async () => {
  const u = await createTestUser();
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => withPlayer(u.id, (tx) => adjustCoins(tx, u.id, -15, 'test'), { idempotencyKey: randomUUID(), kind: 'test' })),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(16);
  for (const r of results.filter((r) => r.status === 'rejected')) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: 'insufficient_coins' });
  expect(await coins(u.id)).toBe(10);
});

test('adjustCoins writes a ledger row with the balance after', async () => {
  const u = await createTestUser();
  await withPlayer(u.id, (tx) => adjustCoins(tx, u.id, 40, 'claim:test'));
  expect(await prisma.coinTransaction.findFirst({ where: { userId: u.id, reason: 'claim:test' } })).toMatchObject({ amount: 40, balanceAfter: 290 });
});
