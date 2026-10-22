import { prisma } from '@/lib/db';
import { previewSale, sellFish } from '@/lib/game/sell';
import { withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

type Opts = Partial<{ weightGrams: number; baseValue: number; mature: boolean; location: 'tank' | 'storage' | 'trip'; status: 'alive' | 'dead' }>;
const addFish = (userId: string, o: Opts = {}) =>
  prisma.fish.create({
    data: {
      userId, speciesKey: TEST_SPECIES.small, sex: 'male', rarity: 'common', weightGrams: o.weightGrams ?? 500, hp: 50, ageDays: 2,
      baseValue: o.baseValue ?? 200, location: o.location ?? 'storage', status: o.status ?? 'alive', origin: 'shop',
      ...(o.mature ? { maturedAt: new Date(), maturitySaleBonusCoins: 50, maturitySaleBonusPct: 10 } : {}),
    },
  });
const coins = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).coins;
const sell = (userId: string, ids: string[], mode: 'sell' | 'release') => withPlayer(userId, (tx, ctx) => sellFish(tx, userId, ids, mode, ctx));

test('a mature fish sells with its bonus; releasing a mature fish pays 25% without it', async () => {
  const u = await createTestUser();
  const a = await addFish(u.id, { weightGrams: 2000, mature: true });
  const b = await addFish(u.id, { weightGrams: 2000, mature: true });
  expect((await sell(u.id, [a.id], 'sell')).total).toBe(270);
  expect((await sell(u.id, [b.id], 'release')).total).toBe(50);
  expect(await coins(u.id)).toBe(250 + 270 + 50);
  expect(await prisma.fishSale.findUniqueOrThrow({ where: { fishId: a.id } })).toMatchObject({ mode: 'sell', coins: 270, maturityBonus: 70 });
  expect(await prisma.fish.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ status: 'released', location: 'none' });
});

test('the preview matches what the sale pays', async () => {
  const u = await createTestUser();
  const fish = await Promise.all([addFish(u.id, { weightGrams: 2000, mature: true }), addFish(u.id, { baseValue: 33 }), addFish(u.id, { location: 'tank', baseValue: 7 })]);
  const ids = fish.map((f) => f.id);
  const preview = await withPlayer(u.id, (tx) => previewSale(tx, u.id, ids, 'sell'));
  expect(preview.total).toBe(270 + 33 + 7);
  expect((await sell(u.id, ids, 'sell')).total).toBe(preview.total);
});

test('a batch with an already-sold fish fails whole and pays nothing', async () => {
  const u = await createTestUser();
  const a = await addFish(u.id);
  const b = await addFish(u.id);
  await sell(u.id, [a.id], 'sell');
  await expect(sell(u.id, [a.id, b.id], 'sell')).rejects.toMatchObject({ code: 'invalid_input' });
  expect(await coins(u.id)).toBe(450);
  expect((await prisma.fish.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('alive');
});

test('selling 20 fish writes one ledger row with the sum', async () => {
  const u = await createTestUser();
  const fish = await Promise.all(Array.from({ length: 20 }, () => addFish(u.id, { baseValue: 10 })));
  await sell(u.id, fish.map((f) => f.id), 'sell');
  const rows = await prisma.coinTransaction.findMany({ where: { userId: u.id, reason: { startsWith: 'sell_batch:' } } });
  expect(rows).toEqual([expect.objectContaining({ amount: 200 })]);
  expect(await prisma.fishSale.count({ where: { userId: u.id } })).toBe(20);
});

test('two overlapping batches at once: exactly one succeeds', async () => {
  const u = await createTestUser();
  const shared = await addFish(u.id);
  const a = await addFish(u.id);
  const b = await addFish(u.id);
  const results = await Promise.allSettled([sell(u.id, [shared.id, a.id], 'sell'), sell(u.id, [shared.id, b.id], 'sell')]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await coins(u.id)).toBe(650);
});

test('release pays a floored 25%', async () => {
  const u = await createTestUser();
  const f = await addFish(u.id, { baseValue: 7 });
  expect((await sell(u.id, [f.id], 'release')).total).toBe(1);
});

test('dead fish and fish on a trip cannot be sold', async () => {
  const u = await createTestUser();
  const dead = await addFish(u.id, { status: 'dead' });
  const trip = await addFish(u.id, { location: 'trip' });
  await expect(sell(u.id, [dead.id], 'sell')).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(sell(u.id, [trip.id], 'sell')).rejects.toMatchObject({ code: 'invalid_input' });
});
