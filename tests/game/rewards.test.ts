import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { claimParts, openClaim, openGrowthRewards, rewardInbox } from '@/lib/game/rewards';
import { withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(async () => {
  await prisma.species.update({ where: { key: TEST_SPECIES.small }, data: { maturitySaleBonusCoins: 50, maturitySaleBonusPct: 10 } });
  await prisma.$disconnect();
});

const at = new Date('2026-10-05T00:00:00Z');
const addFish = (userId: string, weightGrams = 500) =>
  prisma.fish.create({
    data: { userId, speciesKey: TEST_SPECIES.small, sex: 'male', rarity: 'common', weightGrams, hp: 50, ageDays: 2, baseValue: 10, location: 'tank', origin: 'shop' },
  });
const grow = (userId: string, fishId: string, grams: number) => withPlayer(userId, (tx, ctx) => openGrowthRewards(tx, userId, { [fishId]: { grams, at } }, ctx));
const coins = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).coins;

test('milestones are independent: jumping past two opens both', async () => {
  const u = await createTestUser();
  const f = await addFish(u.id);
  await grow(u.id, f.id, 1600);
  const reached = await prisma.fishMilestone.findMany({ where: { fishId: f.id }, orderBy: { weightGrams: 'asc' } });
  expect(reached.map((r) => r.weightGrams)).toEqual([1000, 1500]);
  expect(await prisma.rewardClaim.count({ where: { userId: u.id, source: 'milestone' } })).toBe(2);
});

test('a milestone never opens twice for one fish', async () => {
  const u = await createTestUser();
  const f = await addFish(u.id);
  await grow(u.id, f.id, 1200);
  await grow(u.id, f.id, 1200);
  expect(await prisma.rewardClaim.count({ where: { userId: u.id } })).toBe(1);
});

test('item storage full: the coin part is claimed, the item part stays pending', async () => {
  const u = await createTestUser();
  const f = await addFish(u.id);
  for (const itemKey of ['t_food2', 't_cleaner', 't_box', 't_bait', 't_revive']) await prisma.inventoryStack.create({ data: { userId: u.id, itemKey, qty: 1 } });
  await grow(u.id, f.id, 1000);
  const [claim] = await withPlayer(u.id, (tx) => rewardInbox(tx, u.id));
  const r = await withPlayer(u.id, (tx, ctx) => claimParts(tx, u.id, claim.parts.map((p) => p.id), ctx));
  expect(r.claimed).toHaveLength(1);
  expect(r.blocked).toHaveLength(1);
  expect(await coins(u.id)).toBe(255);
  expect(await prisma.rewardClaim.findUniqueOrThrow({ where: { id: claim.id } })).toMatchObject({ completedAt: null });

  await prisma.inventoryStack.deleteMany({ where: { userId: u.id, itemKey: 't_bait' } });
  await withPlayer(u.id, (tx, ctx) => claimParts(tx, u.id, claim.parts.map((p) => p.id), ctx));
  expect(await coins(u.id)).toBe(255);
  expect(await prisma.inventoryStack.findFirst({ where: { userId: u.id, itemKey: 't_food1' } })).toMatchObject({ qty: 2 });
  expect((await prisma.rewardClaim.findUniqueOrThrow({ where: { id: claim.id } })).completedAt).not.toBeNull();
});

test('a retried claim with the same key credits once', async () => {
  const u = await createTestUser();
  const claim = await withPlayer(u.id, (tx) => openClaim(tx, u.id, 'login', '2026-10-05', { coins: 30 }));
  const parts = await prisma.rewardClaimPart.findMany({ where: { claimId: claim.claimId } });
  const key = randomUUID();
  const call = () => withPlayer(u.id, (tx, ctx) => claimParts(tx, u.id, parts.map((p) => p.id), ctx), { idempotencyKey: key, kind: 'claim' });
  await Promise.all([call(), call()]);
  expect(await coins(u.id)).toBe(280);
});

test('claiming parts that are already claimed credits nothing', async () => {
  const u = await createTestUser();
  const claim = await withPlayer(u.id, (tx) => openClaim(tx, u.id, 'login', '2026-10-06', { coins: 30 }));
  const ids = (await prisma.rewardClaimPart.findMany({ where: { claimId: claim.claimId } })).map((p) => p.id);
  await withPlayer(u.id, (tx, ctx) => claimParts(tx, u.id, ids, ctx));
  expect(await withPlayer(u.id, (tx, ctx) => claimParts(tx, u.id, ids, ctx))).toEqual({ claimed: [], blocked: [] });
  expect(await coins(u.id)).toBe(280);
});

test("another player's parts are ignored", async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  const claim = await withPlayer(b.id, (tx) => openClaim(tx, b.id, 'login', '2026-10-07', { coins: 30 }));
  const ids = (await prisma.rewardClaimPart.findMany({ where: { claimId: claim.claimId } })).map((p) => p.id);
  expect(await withPlayer(a.id, (tx, ctx) => claimParts(tx, a.id, ids, ctx))).toEqual({ claimed: [], blocked: [] });
  expect(await coins(a.id)).toBe(250);
});

test('maturity opens once and keeps the first bonus snapshot', async () => {
  const u = await createTestUser();
  const f = await addFish(u.id, 1900);
  await grow(u.id, f.id, 2000);
  expect(await prisma.fish.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ maturedAt: at, maturitySaleBonusCoins: 50, maturitySaleBonusPct: 10 });

  await prisma.species.update({ where: { key: TEST_SPECIES.small }, data: { maturitySaleBonusCoins: 999 } });
  await prisma.fish.update({ where: { id: f.id }, data: { weightGrams: 1500 } });
  await grow(u.id, f.id, 2000);
  expect(await prisma.rewardClaim.count({ where: { userId: u.id, source: 'maturity' } })).toBe(1);
  expect((await prisma.fish.findUniqueOrThrow({ where: { id: f.id } })).maturitySaleBonusCoins).toBe(50);
});

test('an unclaimed maturity reward stays after the fish drops below max', async () => {
  const u = await createTestUser();
  const f = await addFish(u.id, 1900);
  await grow(u.id, f.id, 2000);
  await prisma.fish.update({ where: { id: f.id }, data: { weightGrams: 1200 } });
  const inbox = await withPlayer(u.id, (tx) => rewardInbox(tx, u.id));
  expect(inbox.some((c) => c.source === 'maturity' && c.fishId === f.id)).toBe(true);
});

test('the inbox names the items in each part', async () => {
  const u = await createTestUser();
  await withPlayer(u.id, (tx) => openClaim(tx, u.id, 'login', '2026-10-08', { coins: 1, items: [{ itemKey: 't_food1', qty: 2 }] }));
  const [c] = await withPlayer(u.id, (tx) => rewardInbox(tx, u.id));
  expect(c.parts.find((p) => p.kind === 'item')).toMatchObject({ itemKey: 't_food1', itemName: 'Test flakes', qty: 2 });
});
