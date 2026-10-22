import { prisma } from '@/lib/db';
import { assertAdmin } from '@/lib/game/admin/guard';
import { bootstrap, storageView } from '@/lib/game/snapshot';
import { seededRng } from '@/lib/game/rng';
import { withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const H = 3_600_000;
const T0 = new Date('2026-10-01T03:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const load = (userId: string, now: Date) => withPlayer(userId, (tx, ctx) => bootstrap(tx, userId, ctx), { now, rng: seededRng(2) });
const addFish = (userId: string, o: Partial<{ location: 'tank' | 'storage'; hp: number; status: 'alive' | 'dead'; reviveDeadline: Date }> = {}) =>
  prisma.fish.create({
    data: {
      userId, speciesKey: TEST_SPECIES.small, sex: 'female', rarity: 'common', weightGrams: 500, hp: o.hp ?? 80, satietyTicks: 99, ageDays: 2, baseValue: 10,
      location: o.status === 'dead' ? 'none' : (o.location ?? 'tank'), status: o.status ?? 'alive', origin: 'shop', reviveDeadline: o.reviveDeadline,
      diedAt: o.status === 'dead' ? T0 : undefined,
    },
  });

test('loading the game twice: one daily login, ticks processed once', async () => {
  const u = await createTestUser();
  await prisma.tank.update({ where: { userId: u.id }, data: { simulatedUntil: T0 } });
  await addFish(u.id);
  await Promise.all([load(u.id, at(5 * H)), load(u.id, at(5 * H))]);
  expect(await prisma.dailyLogin.count({ where: { userId: u.id } })).toBe(1);
  expect(await prisma.rewardClaim.count({ where: { userId: u.id, source: 'login' } })).toBe(1);
  expect(await prisma.tank.findUniqueOrThrow({ where: { userId: u.id } })).toMatchObject({ simulatedUntil: at(5 * H), dirt: 5 });
});

test('the snapshot carries the player, the tank and what needs attention', async () => {
  const u = await createTestUser();
  await prisma.tank.update({ where: { userId: u.id }, data: { simulatedUntil: T0 } });
  const f = await addFish(u.id);
  await addFish(u.id, { location: 'storage' });
  const dead = await addFish(u.id, { status: 'dead', hp: 0, reviveDeadline: at(100 * H) });
  const s = await load(u.id, at(H));
  expect(s.player).toMatchObject({ coins: 250, level: 1, exp: 0, nextLevelExp: 100, role: 'player' });
  expect(s.tank).toMatchObject({ capacity: { used: 1, max: 3 }, care: { autoFeed: false, autoClean: false } });
  expect(s.tankFish).toEqual([expect.objectContaining({ id: f.id, name: 'Test Guppy', modelKey: 'betta', maxWeightGrams: 2000, mature: false, hungry: false, hpMax: 100 })]);
  expect(s.dead).toEqual([expect.objectContaining({ id: dead.id, reviveCost: 12 })]);
  expect(s.counts.pendingClaims).toBe(1);
  expect(s.activeTripId).toBeNull();
});

test('the storage view lists stored fish, stacks, gear and capacities', async () => {
  const u = await createTestUser();
  const f = await addFish(u.id, { location: 'storage' });
  await prisma.inventoryStack.createMany({ data: [{ userId: u.id, itemKey: 't_food1', qty: 4 }, { userId: u.id, itemKey: 't_food1', bucket: 'reserve', qty: 2 }] });
  await prisma.gearItem.create({ data: { userId: u.id, defKey: 't_rod', durability: 0, maxDurability: 10 } });
  const v = await withPlayer(u.id, (tx) => storageView(tx, u.id));
  expect(v.fish.map((x) => x.id)).toEqual([f.id]);
  expect(v.fishCapacity).toEqual({ usedGrams: 500, maxGrams: 10000 });
  expect(v.stacks).toEqual([expect.objectContaining({ itemKey: 't_food1', qty: 4, category: 'food' })]);
  expect(v.reserve).toEqual([expect.objectContaining({ itemKey: 't_food1', qty: 2 })]);
  expect(v.gear).toEqual([expect.objectContaining({ defKey: 't_rod', durability: 0, broken: true })]);
  expect(v.slots).toEqual({ used: 2, max: 5 });
});

test('only admins pass the admin guard', async () => {
  const u = await createTestUser();
  await expect(assertAdmin(u.id)).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  await prisma.user.update({ where: { id: u.id }, data: { role: 'admin' } });
  await assertAdmin(u.id);
});
