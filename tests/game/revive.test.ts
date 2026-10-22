import { prisma } from '@/lib/db';
import { reviveFish } from '@/lib/game/revive';
import { withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const DAY = 86_400_000;
const now = new Date('2026-10-10T00:00:00Z');

const deadFish = (userId: string, o: Partial<{ deadline: Date; revivedAt: Date; weightGrams: number }> = {}) =>
  prisma.fish.create({
    data: {
      userId, speciesKey: TEST_SPECIES.small, sex: 'male', rarity: 'rare', weightGrams: o.weightGrams ?? 500, hp: 0, ageDays: 5, baseValue: 20,
      location: 'none', status: 'dead', origin: 'shop', diedAt: new Date(now.getTime() - DAY), reviveDeadline: o.deadline ?? new Date(now.getTime() + 13 * DAY),
      revivedAt: o.revivedAt,
    },
  });
const revive = (userId: string, fishId: string, method: 'coins' | 'item', at = now, skipAdvance = false) =>
  withPlayer(userId, (tx, ctx) => reviveFish(tx, userId, fishId, method, ctx), { now: at, skipAdvance });
const coins = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).coins;

test('revive with coins puts the fish in storage with partial hp', async () => {
  const u = await createTestUser();
  const f = await deadFish(u.id);
  expect(await revive(u.id, f.id, 'coins')).toEqual({ hp: 30 });
  expect(await prisma.fish.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ status: 'alive', location: 'storage', hp: 30, satietyTicks: 0, revivedAt: now });
  expect(await coins(u.id)).toBe(250 - 45);
});

test('revive with the special item uses one item and no coins', async () => {
  const u = await createTestUser();
  const f = await deadFish(u.id);
  await prisma.inventoryStack.create({ data: { userId: u.id, itemKey: 't_revive', qty: 1 } });
  await revive(u.id, f.id, 'item');
  expect(await coins(u.id)).toBe(250);
  expect(await prisma.inventoryStack.findFirstOrThrow({ where: { userId: u.id, itemKey: 't_revive' } })).toMatchObject({ qty: 0 });
});

test('after the deadline revive fails even before expiry has been processed', async () => {
  const u = await createTestUser();
  const f = await deadFish(u.id, { deadline: new Date(now.getTime() - 1) });
  await expect(revive(u.id, f.id, 'coins', now, true)).rejects.toMatchObject({ code: 'revive_unavailable' });
  expect(await coins(u.id)).toBe(250);
});

test('storage full: the fish stays dead and its deadline does not move', async () => {
  const u = await createTestUser();
  const f = await deadFish(u.id, { weightGrams: 2000 });
  await prisma.fish.create({
    data: { userId: u.id, speciesKey: TEST_SPECIES.small, sex: 'male', rarity: 'common', weightGrams: 9000, hp: 50, ageDays: 2, baseValue: 10, location: 'storage', origin: 'shop' },
  });
  await expect(revive(u.id, f.id, 'coins')).rejects.toMatchObject({ code: 'storage_full' });
  expect(await prisma.fish.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ status: 'dead', reviveDeadline: f.reviveDeadline });
});

test('a fish revived once cannot be revived again', async () => {
  const u = await createTestUser();
  const f = await deadFish(u.id, { revivedAt: new Date(now.getTime() - 5 * DAY) });
  await expect(revive(u.id, f.id, 'coins')).rejects.toMatchObject({ code: 'revive_unavailable' });
});
