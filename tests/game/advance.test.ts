import { prisma } from '@/lib/db';
import { REVIVE_WINDOW_DAYS } from '@/lib/game/rules';
import { withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const H = 3_600_000;
const DAY = 24 * H;
const T0 = new Date('2026-10-01T03:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

async function player(opts: { autoFeed?: boolean; food?: number } = {}) {
  const u = await createTestUser();
  await prisma.tank.update({ where: { userId: u.id }, data: { simulatedUntil: T0, autoFeed: !!opts.autoFeed, autoFeedItemKey: 't_food1' } });
  if (opts.autoFeed) await prisma.userUpgrade.create({ data: { userId: u.id, track: 'tank_care', level: 1 } });
  if (opts.food) await prisma.inventoryStack.create({ data: { userId: u.id, itemKey: 't_food1', qty: opts.food } });
  return u;
}

const addFish = (userId: string, o: Partial<{ hp: number; satietyTicks: number; location: 'tank' | 'storage'; revivedAt: Date; weightGrams: number }> = {}) =>
  prisma.fish.create({
    data: {
      userId, speciesKey: TEST_SPECIES.small, sex: 'female', rarity: 'common', weightGrams: o.weightGrams ?? 500, hp: o.hp ?? 100,
      satietyTicks: o.satietyTicks ?? 0, ageDays: 2, baseValue: 10, location: o.location ?? 'tank', origin: 'shop', revivedAt: o.revivedAt,
    },
  });

const advance = (userId: string, now: Date) => withPlayer(userId, async () => null, { now });
const food = async (userId: string) => (await prisma.inventoryStack.findFirstOrThrow({ where: { userId, itemKey: 't_food1' } })).qty;
const tank = (userId: string) => prisma.tank.findUniqueOrThrow({ where: { userId } });
const fishRow = (id: string) => prisma.fish.findUniqueOrThrow({ where: { id } });

test('advancing twice to the same instant processes the ticks once', async () => {
  const u = await player({ autoFeed: true, food: 50 });
  await addFish(u.id);
  await advance(u.id, at(5 * H));
  const after1 = { food: await food(u.id), tank: await tank(u.id) };
  await advance(u.id, at(5 * H));
  expect(await food(u.id)).toBe(after1.food);
  expect((await tank(u.id)).simulatedUntil).toEqual(after1.tank.simulatedUntil);
  expect(after1.food).toBe(49);
});

test('two logins advancing at the same moment use the food once', async () => {
  const u = await player({ autoFeed: true, food: 50 });
  await addFish(u.id);
  await addFish(u.id);
  await Promise.all([advance(u.id, at(5 * H)), advance(u.id, at(5 * H))]);
  expect(await food(u.id)).toBe(48);
});

test('a stored fish is untouched across 30 days', async () => {
  const u = await player();
  const f = await addFish(u.id, { location: 'storage', hp: 40 });
  await advance(u.id, at(30 * DAY));
  expect(await fishRow(f.id)).toEqual(f);
});

test('a first death starts a 14-day revive window from the simulated death time', async () => {
  const u = await player();
  const f = await addFish(u.id, { hp: 25 });
  await advance(u.id, at(10 * H));
  const row = await fishRow(f.id);
  expect(row).toMatchObject({ status: 'dead', location: 'none', diedAt: at(3 * H) });
  expect(row.reviveDeadline).toEqual(at(3 * H + REVIVE_WINDOW_DAYS * DAY));
  expect(await prisma.fishEvent.findFirst({ where: { fishId: f.id, type: 'died' } })).toMatchObject({ occurredAt: at(3 * H) });
});

test('a deadline passing while offline marks the fish lost at the deadline', async () => {
  const u = await player();
  const f = await addFish(u.id, { hp: 25 });
  await advance(u.id, at(3 * H + 17 * DAY));
  expect(await fishRow(f.id)).toMatchObject({ status: 'lost', endedAt: at(3 * H + REVIVE_WINDOW_DAYS * DAY) });
});

test('a second death after a revive is final', async () => {
  const u = await player();
  const f = await addFish(u.id, { hp: 25, revivedAt: at(-DAY) });
  await advance(u.id, at(5 * H));
  expect(await fishRow(f.id)).toMatchObject({ status: 'lost', location: 'none', endedAt: at(3 * H), reviveDeadline: null });
});

test('time under one tick carries over to the next advance', async () => {
  const u = await player();
  await advance(u.id, at(90 * 60_000));
  expect((await tank(u.id)).simulatedUntil).toEqual(at(H));
});

test('dirt keeps rising from live tank fish only', async () => {
  const u = await player();
  await addFish(u.id, { satietyTicks: 99 });
  await addFish(u.id, { location: 'storage' });
  await advance(u.id, at(4 * H));
  expect((await tank(u.id)).dirt).toBe(4);
});
