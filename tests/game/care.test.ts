import { prisma } from '@/lib/db';
import { cleanTank, feedTank, fishDetail, moveFish, moveReserve, renameFish, setAutoCare } from '@/lib/game/care';
import { seededRng } from '@/lib/game/rng';
import { withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const addFish = (userId: string, location: 'tank' | 'storage' = 'tank', weightGrams = 500) =>
  prisma.fish.create({
    data: { userId, speciesKey: TEST_SPECIES.small, sex: 'male', rarity: 'common', weightGrams, hp: 50, ageDays: 2, baseValue: 10, location, origin: 'shop' },
  });
const stack = (userId: string, itemKey: string, qty: number, bucket: 'main' | 'reserve' = 'main') =>
  prisma.inventoryStack.create({ data: { userId, itemKey, qty, bucket } });
const qty = async (userId: string, itemKey: string, bucket: 'main' | 'reserve' = 'main') =>
  (await prisma.inventoryStack.findUnique({ where: { userId_itemKey_bucket: { userId, itemKey, bucket } } }))?.qty ?? 0;
const run = <T>(userId: string, fn: Parameters<typeof withPlayer<T>>[1]) => withPlayer(userId, fn, { rng: seededRng(4) });

test('food for 2 of 3 fish feeds 2 random fish and leaves the third hungry', async () => {
  const u = await createTestUser();
  const fish = await Promise.all([addFish(u.id), addFish(u.id), addFish(u.id)]);
  await stack(u.id, 't_food1', 2);
  const r = await run(u.id, (tx, ctx) => feedTank(tx, u.id, 't_food1', ctx));
  expect(r.fedIds).toHaveLength(2);
  expect(r.skippedIds).toHaveLength(1);
  const rows = await prisma.fish.findMany({ where: { id: { in: fish.map((f) => f.id) } } });
  expect(rows.filter((f) => f.hp === 70)).toHaveLength(2);
  expect(await qty(u.id, 't_food1')).toBe(0);
});

test('feeding with no food is insufficient_items', async () => {
  const u = await createTestUser();
  await addFish(u.id);
  await expect(run(u.id, (tx, ctx) => feedTank(tx, u.id, 't_food1', ctx))).rejects.toMatchObject({ code: 'insufficient_items' });
});

test('a full tank blocks the move and creates no fish row', async () => {
  const u = await createTestUser();
  for (let i = 0; i < 3; i++) await addFish(u.id);
  const stored = await addFish(u.id, 'storage');
  await expect(run(u.id, (tx) => moveFish(tx, u.id, stored.id, 'tank'))).rejects.toMatchObject({ code: 'tank_full' });
  expect(await prisma.fish.count({ where: { userId: u.id } })).toBe(4);
  expect((await prisma.fish.findUniqueOrThrow({ where: { id: stored.id } })).location).toBe('storage');
});

test('moving keeps the fish id and logs the move', async () => {
  const u = await createTestUser();
  const f = await addFish(u.id, 'storage');
  await run(u.id, (tx) => moveFish(tx, u.id, f.id, 'tank'));
  expect(await prisma.fish.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ id: f.id, location: 'tank' });
  expect(await prisma.fishEvent.count({ where: { fishId: f.id, type: 'moved' } })).toBe(1);
});

test('moving to storage needs room for its weight', async () => {
  const u = await createTestUser();
  await addFish(u.id, 'storage', 9000);
  const f = await addFish(u.id, 'tank', 2000);
  await expect(run(u.id, (tx) => moveFish(tx, u.id, f.id, 'storage'))).rejects.toMatchObject({ code: 'storage_full' });
});

test("another player's fish is not_found", async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  const f = await addFish(b.id, 'storage');
  await expect(run(a.id, (tx) => moveFish(tx, a.id, f.id, 'tank'))).rejects.toMatchObject({ code: 'not_found' });
});

test('cleaning with coins the player lacks changes nothing', async () => {
  const u = await createTestUser();
  await prisma.user.update({ where: { id: u.id }, data: { coins: 2 } });
  await prisma.tank.update({ where: { userId: u.id }, data: { dirt: 70 } });
  await expect(run(u.id, (tx, ctx) => cleanTank(tx, u.id, 't_light', ctx))).rejects.toMatchObject({ code: 'insufficient_coins' });
  expect((await prisma.tank.findUniqueOrThrow({ where: { userId: u.id } })).dirt).toBe(70);
});

test('cleaning levels pay coins or items and reduce dirt', async () => {
  const u = await createTestUser();
  await prisma.tank.update({ where: { userId: u.id }, data: { dirt: 70 } });
  expect(await run(u.id, (tx, ctx) => cleanTank(tx, u.id, 't_light', ctx))).toEqual({ dirt: 40 });
  await stack(u.id, 't_cleaner', 1);
  expect(await run(u.id, (tx, ctx) => cleanTank(tx, u.id, 't_deep', ctx))).toEqual({ dirt: 0 });
  expect(await qty(u.id, 't_cleaner')).toBe(0);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).coins).toBe(245);
});

test('auto-feed needs the care upgrade', async () => {
  const u = await createTestUser();
  await expect(run(u.id, (tx) => setAutoCare(tx, u.id, { autoFeed: true, autoFeedItemKey: 't_food1' }))).rejects.toMatchObject({ code: 'forbidden' });
  await prisma.userUpgrade.create({ data: { userId: u.id, track: 'tank_care', level: 1 } });
  await run(u.id, (tx) => setAutoCare(tx, u.id, { autoFeed: true, autoFeedItemKey: 't_food1' }));
  expect(await prisma.tank.findUniqueOrThrow({ where: { userId: u.id } })).toMatchObject({ autoFeed: true, autoFeedItemKey: 't_food1' });
});

test('food moves into the reserve hopper and back', async () => {
  const u = await createTestUser();
  await stack(u.id, 't_food1', 5);
  await run(u.id, (tx) => moveReserve(tx, u.id, 't_food1', 3, 'in'));
  expect([await qty(u.id, 't_food1'), await qty(u.id, 't_food1', 'reserve')]).toEqual([2, 3]);
  await run(u.id, (tx) => moveReserve(tx, u.id, 't_food1', 1, 'out'));
  expect([await qty(u.id, 't_food1'), await qty(u.id, 't_food1', 'reserve')]).toEqual([3, 2]);
  await expect(run(u.id, (tx) => moveReserve(tx, u.id, 't_cleaner', 1, 'in'))).rejects.toMatchObject({ code: 'invalid_input' });
});

test('renaming: empty is invalid, null falls back to the species name', async () => {
  const u = await createTestUser();
  const f = await addFish(u.id);
  await expect(run(u.id, (tx) => renameFish(tx, u.id, f.id, '   '))).rejects.toMatchObject({ code: 'invalid_input' });
  await run(u.id, (tx) => renameFish(tx, u.id, f.id, '  Nemo '));
  expect((await run(u.id, (tx, ctx) => fishDetail(tx, u.id, f.id, ctx))).name).toBe('Nemo');
  await run(u.id, (tx) => renameFish(tx, u.id, f.id, null));
  const d = await run(u.id, (tx, ctx) => fishDetail(tx, u.id, f.id, ctx));
  expect(d.name).toBe('Test Guppy');
  expect(d.fish.id).toBe(f.id);
  expect(d.events.map((e) => e.type)).toContain('renamed');
});
