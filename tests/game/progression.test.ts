import { prisma } from '@/lib/db';
import { bumpStat, collection, ensureDailyQuests, grantExp, recordDailyLogin } from '@/lib/game/progression';
import { seededRng } from '@/lib/game/rng';
import { withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const DAY = 86_400_000;
const day1 = new Date('2026-10-05T05:00:00Z'); // 12:00 in Asia/Ho_Chi_Minh
const plus = (days: number) => new Date(day1.getTime() + days * DAY);
const at = <T>(userId: string, now: Date, fn: Parameters<typeof withPlayer<T>>[1]) => withPlayer(userId, fn, { now, rng: seededRng(1) });
const addFish = (userId: string, status: 'alive' | 'sold' | 'lost' = 'alive') =>
  prisma.fish.create({
    data: { userId, speciesKey: TEST_SPECIES.small, sex: 'male', rarity: 'common', weightGrams: 500, hp: 50, ageDays: 2, baseValue: 10, location: status === 'alive' ? 'tank' : 'none', status, origin: 'shop' },
  });

test('a daily EXP cap stops at the cap and resets the next day', async () => {
  const u = await createTestUser();
  for (let i = 0; i < 5; i++) await at(u.id, day1, (tx, ctx) => grantExp(tx, u.id, 'catch', ctx));
  expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).exp).toBe(20);
  expect(await at(u.id, plus(1), (tx, ctx) => grantExp(tx, u.id, 'catch', ctx))).toMatchObject({ granted: 5 });
});

test('a big grant can cross several levels', async () => {
  const u = await createTestUser();
  expect(await at(u.id, day1, (tx, ctx) => grantExp(tx, u.id, 'claim', ctx, 350))).toEqual({ granted: 350, level: 3 });
  expect(await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ exp: 350, level: 3 });
});

test('logging in on consecutive days grows the streak; missing a day resets it', async () => {
  const u = await createTestUser();
  expect((await at(u.id, day1, (tx, ctx) => recordDailyLogin(tx, u.id, ctx))).streak).toBe(1);
  expect((await at(u.id, plus(1), (tx, ctx) => recordDailyLogin(tx, u.id, ctx))).streak).toBe(2);
  expect((await at(u.id, plus(3), (tx, ctx) => recordDailyLogin(tx, u.id, ctx))).streak).toBe(1);
});

test('two logins on the same day give one reward', async () => {
  const u = await createTestUser();
  await at(u.id, day1, (tx, ctx) => recordDailyLogin(tx, u.id, ctx));
  expect((await at(u.id, day1, (tx, ctx) => recordDailyLogin(tx, u.id, ctx))).claimId).toBeNull();
  expect(await prisma.rewardClaim.count({ where: { userId: u.id, source: 'login' } })).toBe(1);
});

test('quests that need tank fish are not handed out with an empty tank', async () => {
  const u = await createTestUser();
  const quests = await at(u.id, day1, (tx, ctx) => ensureDailyQuests(tx, u.id, ctx));
  expect(quests.map((q) => q.templateKey)).toEqual(['t_q_sell']);
});

test('quests follow the player: tank fish unlock the feeding quest, level gates the rest', async () => {
  const u = await createTestUser();
  await addFish(u.id);
  const quests = await at(u.id, day1, (tx, ctx) => ensureDailyQuests(tx, u.id, ctx));
  expect(quests.map((q) => q.templateKey).sort()).toEqual(['t_q_feed', 't_q_sell']);
  expect((await at(u.id, day1, (tx, ctx) => ensureDailyQuests(tx, u.id, ctx))).map((q) => q.id).sort()).toEqual(quests.map((q) => q.id).sort());
});

test('completing a quest opens exactly one claim', async () => {
  const u = await createTestUser();
  await addFish(u.id);
  await at(u.id, day1, (tx, ctx) => ensureDailyQuests(tx, u.id, ctx));
  await at(u.id, day1, (tx, ctx) => bumpStat(tx, u.id, 'fish_fed', 2, ctx));
  await at(u.id, day1, (tx, ctx) => bumpStat(tx, u.id, 'fish_fed', 2, ctx));
  expect(await prisma.playerQuest.findFirstOrThrow({ where: { userId: u.id, templateKey: 't_q_feed' } })).toMatchObject({ progress: 2 });
  expect(await prisma.rewardClaim.count({ where: { userId: u.id, source: 'quest' } })).toBe(1);
});

test("yesterday's quests do not advance today", async () => {
  const u = await createTestUser();
  await at(u.id, day1, (tx, ctx) => ensureDailyQuests(tx, u.id, ctx));
  await at(u.id, plus(1), (tx, ctx) => bumpStat(tx, u.id, 'fish_sold', 1, ctx));
  expect(await prisma.playerQuest.findFirstOrThrow({ where: { userId: u.id, templateKey: 't_q_sell' } })).toMatchObject({ progress: 0, completedAt: null });
});

test('an achievement completes once', async () => {
  const u = await createTestUser();
  for (let i = 0; i < 4; i++) await at(u.id, day1, (tx, ctx) => bumpStat(tx, u.id, 'species_discovered', 1, ctx));
  expect(await prisma.playerAchievement.count({ where: { userId: u.id } })).toBe(1);
  expect(await prisma.rewardClaim.count({ where: { userId: u.id, source: 'achievement' } })).toBe(1);
});

test('the collection keeps sold and lost fish', async () => {
  const u = await createTestUser();
  await addFish(u.id);
  await addFish(u.id, 'sold');
  await addFish(u.id, 'lost');
  await prisma.speciesDiscovery.create({ data: { userId: u.id, speciesKey: TEST_SPECIES.small, via: 'shop' } });
  const c = await at(u.id, day1, (tx) => collection(tx, u.id));
  expect(c.history.map((h) => h.status).sort()).toEqual(['alive', 'lost', 'sold']);
  expect(c.species.find((s) => s.key === TEST_SPECIES.small)).toMatchObject({ discovered: true, via: 'shop' });
  expect(c.species.find((s) => s.key === TEST_SPECIES.big)).toMatchObject({ discovered: false });
});
