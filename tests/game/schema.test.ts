import { prisma } from '@/lib/db';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const fishData = (userId: string) => ({
  userId,
  speciesKey: TEST_SPECIES.small,
  sex: 'male' as const,
  rarity: 'common' as const,
  weightGrams: 100,
  hp: 10,
  ageDays: 1,
  baseValue: 10,
  location: 'storage' as const,
  origin: 'shop',
});

test('coins cannot go negative', async () => {
  const u = await createTestUser();
  await expect(prisma.$executeRaw`UPDATE "users" SET "coins" = -1 WHERE "id" = ${u.id}`).rejects.toThrow();
});

test('a fish can be sold only once', async () => {
  const u = await createTestUser();
  const f = await prisma.fish.create({ data: fishData(u.id) });
  const sale = { fishId: f.id, userId: u.id, mode: 'sell', coins: 10, batchId: 'b1' };
  await prisma.fishSale.create({ data: sale });
  await expect(prisma.fishSale.create({ data: { ...sale, batchId: 'b2' } })).rejects.toMatchObject({ code: 'P2002' });
});

test('only one active trip per user', async () => {
  const u = await createTestUser();
  await prisma.fishingTrip.create({ data: { userId: u.id, zoneKey: 't_pond' } });
  await expect(prisma.fishingTrip.create({ data: { userId: u.id, zoneKey: 't_pond' } })).rejects.toThrow();
  await prisma.fishingTrip.create({ data: { userId: u.id, zoneKey: 't_pond', status: 'completed' } });
});

test('one live milestone per species+weight', async () => {
  const weightGrams = 777_001;
  const first = await prisma.milestone.create({ data: { speciesKey: TEST_SPECIES.small, weightGrams, reward: {} } });
  try {
    await expect(prisma.milestone.create({ data: { speciesKey: TEST_SPECIES.small, weightGrams, reward: {} } })).rejects.toThrow();
    await prisma.milestone.update({ where: { id: first.id }, data: { deletedAt: new Date() } });
    await prisma.milestone.create({ data: { speciesKey: TEST_SPECIES.small, weightGrams, reward: {} } });
  } finally {
    await prisma.milestone.deleteMany({ where: { weightGrams } });
  }
});

test('stack qty cannot go negative', async () => {
  const u = await createTestUser();
  await expect(prisma.inventoryStack.create({ data: { userId: u.id, itemKey: 't_food1', qty: -1 } })).rejects.toThrow();
});

test('registration creates the tank', async () => {
  const u = await createTestUser();
  expect(await prisma.tank.findUnique({ where: { userId: u.id } })).toMatchObject({ dirt: 0 });
});
