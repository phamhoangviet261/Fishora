import { prisma } from '@/lib/db';
import { assertFishStorage, fishStorage, itemSlots, takeItem, tankCapacity, tryGrantItem } from '@/lib/game/storage';
import { withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const addFish = (userId: string, weightGrams: number, location: 'storage' | 'tank' = 'storage') =>
  prisma.fish.create({
    data: { userId, speciesKey: TEST_SPECIES.small, sex: 'male', rarity: 'common', weightGrams, hp: 100, ageDays: 1, baseValue: 10, location, origin: 'shop' },
  });

test('fish storage counts alive stored fish by weight', async () => {
  const u = await createTestUser();
  await addFish(u.id, 4000);
  await addFish(u.id, 9000, 'tank');
  expect(await withPlayer(u.id, (tx) => fishStorage(tx, u.id))).toEqual({ usedGrams: 4000, maxGrams: 10000 });
});

test('assertFishStorage reports need and free grams', async () => {
  const u = await createTestUser();
  await addFish(u.id, 8000);
  await expect(withPlayer(u.id, (tx) => assertFishStorage(tx, u.id, 2500))).rejects.toMatchObject({
    code: 'storage_full',
    status: 409,
    detail: { needGrams: 2500, freeGrams: 2000 },
  });
  await withPlayer(u.id, (tx) => assertFishStorage(tx, u.id, 2000));
});

test('tank capacity counts alive fish in the tank', async () => {
  const u = await createTestUser();
  await addFish(u.id, 100, 'tank');
  expect(await withPlayer(u.id, (tx) => tankCapacity(tx, u.id))).toEqual({ used: 1, max: 3 });
});

test('a full item storage still accepts more of a stack it already has', async () => {
  const u = await createTestUser();
  const keys = ['t_food1', 't_food2', 't_cleaner', 't_box', 't_bait'];
  await withPlayer(u.id, async (tx) => {
    for (const k of keys) expect(await tryGrantItem(tx, u.id, k, 1)).toBe(true);
    expect(await itemSlots(tx, u.id)).toEqual({ used: 5, max: 5 });
    expect(await tryGrantItem(tx, u.id, 't_food1', 3)).toBe(true);
    expect(await tryGrantItem(tx, u.id, 't_revive', 1)).toBe(false);
    expect(await tryGrantItem(tx, u.id, 't_rod', 1)).toBe(false);
  });
  expect(await prisma.inventoryStack.findUnique({ where: { userId_itemKey_bucket: { userId: u.id, itemKey: 't_food1', bucket: 'main' } } })).toMatchObject({ qty: 4 });
  expect(await prisma.inventoryStack.count({ where: { userId: u.id, itemKey: 't_revive' } })).toBe(0);
});

test('gear is granted as separate pieces at full durability', async () => {
  const u = await createTestUser();
  await withPlayer(u.id, (tx) => tryGrantItem(tx, u.id, 't_rod', 2));
  const gear = await prisma.gearItem.findMany({ where: { userId: u.id } });
  expect(gear).toHaveLength(2);
  expect(gear.every((g) => g.durability === 10 && g.maxDurability === 10)).toBe(true);
});

test('takeItem beyond the stack throws insufficient_items and changes nothing', async () => {
  const u = await createTestUser();
  await withPlayer(u.id, (tx) => tryGrantItem(tx, u.id, 't_food1', 2));
  await expect(withPlayer(u.id, (tx) => takeItem(tx, u.id, 't_food1', 3))).rejects.toMatchObject({ code: 'insufficient_items' });
  await withPlayer(u.id, (tx) => takeItem(tx, u.id, 't_food1', 2));
  expect(await prisma.inventoryStack.findFirst({ where: { userId: u.id, itemKey: 't_food1' } })).toMatchObject({ qty: 0 });
});
