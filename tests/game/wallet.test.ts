import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { listTransactions, spendCoins } from '@/lib/game/wallet';
import { createTestUser, deleteTestUsers } from '../helpers';

afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const coins = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).coins;

test('spend deducts and records a ledger row', async () => {
  const u = await createTestUser();
  expect(await spendCoins(u.id, 5, 'water_change', randomUUID())).toEqual({ ok: true, balance: 245 });
  const [latest] = await listTransactions(u.id);
  expect(latest).toMatchObject({ amount: -5, balanceAfter: 245, reason: 'water_change' });
});

test('same idempotency key charges once', async () => {
  const u = await createTestUser();
  const key = randomUUID();
  const [a, b] = await Promise.all([spendCoins(u.id, 5, 'water_change', key), spendCoins(u.id, 5, 'water_change', key)]);
  expect(a).toEqual({ ok: true, balance: 245 });
  expect(b).toEqual({ ok: true, balance: 245 });
  expect(await spendCoins(u.id, 5, 'water_change', key)).toEqual({ ok: true, balance: 245 });
  expect(await coins(u.id)).toBe(245);
  expect(await prisma.coinTransaction.count({ where: { userId: u.id, reason: 'water_change' } })).toBe(1);
});

test('60 concurrent spends of 5 from 250: exactly 50 succeed, balance ends at 0', async () => {
  const u = await createTestUser();
  const results = await Promise.all(Array.from({ length: 60 }, () => spendCoins(u.id, 5, 'water_change', randomUUID())));
  expect(results.filter((r) => r.ok)).toHaveLength(50);
  expect(results.filter((r) => !r.ok)).toEqual(Array(10).fill({ ok: false, error: 'insufficient_coins' }));
  expect(await coins(u.id)).toBe(0);
});

test('insufficient coins writes nothing', async () => {
  const u = await createTestUser();
  await prisma.user.update({ where: { id: u.id }, data: { coins: 3 } });
  expect(await spendCoins(u.id, 5, 'water_change', randomUUID())).toEqual({ ok: false, error: 'insufficient_coins' });
  expect(await coins(u.id)).toBe(3);
  expect(await prisma.coinTransaction.count({ where: { userId: u.id, reason: 'water_change' } })).toBe(0);
});

test('transaction list is newest first and clamps the limit', async () => {
  const u = await createTestUser();
  await spendCoins(u.id, 5, 'water_change', randomUUID());
  const list = await listTransactions(u.id, 0);
  expect(list).toHaveLength(1);
  expect(list[0].reason).toBe('water_change');
  expect((await listTransactions(u.id, 999)).map((t) => t.reason)).toEqual(['water_change', 'starting_grant']);
});
