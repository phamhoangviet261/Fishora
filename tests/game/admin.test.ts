import { prisma } from '@/lib/db';
import { createMilestone, deleteMilestone, updateMilestone } from '@/lib/game/admin/milestones';
import { updateSpecies } from '@/lib/game/admin/species';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_CONTENT } from '../fixtures/content';

// Admin edits touch shared content, so every test restores what it changes.
const SP = 't_admin_fish';
const base = { ...TEST_CONTENT.species[0], key: SP, displayName: 'Admin Fish', profile: 'test' };

beforeAll(seedTestContent);
beforeEach(async () => {
  await prisma.species.upsert({ where: { key: SP }, create: base, update: base });
});
afterEach(async () => {
  await deleteTestUsers();
  await prisma.milestone.deleteMany({ where: { speciesKey: SP } });
  await prisma.speciesChangeLog.deleteMany({ where: { speciesKey: SP } });
});
afterAll(async () => {
  await prisma.species.update({ where: { key: SP }, data: { active: false } });
  await prisma.$disconnect();
});

async function setup(weightGrams: number) {
  const admin = await createTestUser();
  const u = await createTestUser();
  const f = await prisma.fish.create({
    data: { userId: u.id, speciesKey: SP, sex: 'male', rarity: 'common', weightGrams, hp: 50, ageDays: 2, baseValue: 10, location: 'tank', origin: 'shop' },
  });
  return { admin, u, f };
}
const fishRow = (id: string) => prisma.fish.findUniqueOrThrow({ where: { id } });
const claims = (userId: string, source: 'milestone' | 'maturity') => prisma.rewardClaim.findMany({ where: { userId, source }, include: { parts: true } });

test('lowering max weight matures heavy fish without touching their weight', async () => {
  const { admin, u, f } = await setup(1500);
  await updateSpecies(admin.id, SP, { maxWeightGrams: 1200 });
  expect(await fishRow(f.id)).toMatchObject({ weightGrams: 1500, maturitySaleBonusCoins: 50 });
  expect((await fishRow(f.id)).maturedAt).not.toBeNull();
  expect(await claims(u.id, 'maturity')).toHaveLength(1);
  const log = await prisma.speciesChangeLog.findFirstOrThrow({ where: { speciesKey: SP } });
  expect(log).toMatchObject({ kind: 'update', adminId: admin.id });
  expect(log.affectedFishIds).toEqual([f.id]);
});

test('raising max weight leaves an unclaimed maturity reward in place', async () => {
  const { admin, u } = await setup(1500);
  await updateSpecies(admin.id, SP, { maxWeightGrams: 1200 });
  await updateSpecies(admin.id, SP, { maxWeightGrams: 5000 });
  const [c] = await claims(u.id, 'maturity');
  expect(c.parts.every((p) => p.status === 'pending')).toBe(true);
});

test('a fish never gets a second maturity claim however often max weight moves', async () => {
  const { admin, u } = await setup(1500);
  await updateSpecies(admin.id, SP, { maxWeightGrams: 1200 });
  await updateSpecies(admin.id, SP, { maxWeightGrams: 5000 });
  await updateSpecies(admin.id, SP, { maxWeightGrams: 1000 });
  expect(await claims(u.id, 'maturity')).toHaveLength(1);
});

test('an invalid update changes nothing and logs nothing', async () => {
  const { admin } = await setup(500);
  await expect(updateSpecies(admin.id, SP, { displayName: 'Renamed', spawnWeightMinGrams: 999_999 })).rejects.toMatchObject({ code: 'invalid_input' });
  expect((await prisma.species.findUniqueOrThrow({ where: { key: SP } })).displayName).toBe('Admin Fish');
  expect(await prisma.speciesChangeLog.count({ where: { speciesKey: SP } })).toBe(0);
});

test('a rename is logged with the old and new name; the key never changes', async () => {
  const { admin } = await setup(500);
  await updateSpecies(admin.id, SP, { displayName: 'Golden' });
  const log = await prisma.speciesChangeLog.findFirstOrThrow({ where: { speciesKey: SP } });
  expect(log).toMatchObject({ kind: 'rename', before: expect.objectContaining({ displayName: 'Admin Fish' }), after: expect.objectContaining({ displayName: 'Golden' }) });
  await expect(updateSpecies(admin.id, SP, { key: 'other' } as never)).rejects.toMatchObject({ code: 'invalid_input' });
});

test('deactivating is logged as such', async () => {
  const { admin } = await setup(500);
  await updateSpecies(admin.id, SP, { active: false });
  expect(await prisma.speciesChangeLog.findFirstOrThrow({ where: { speciesKey: SP } })).toMatchObject({ kind: 'deactivate' });
});

test('a new milestone at or below a fish weight makes it eligible at once', async () => {
  const { admin, u, f } = await setup(800);
  await createMilestone(admin.id, { speciesKey: SP, weightGrams: 700, reward: { coins: 3 } }, 'keep');
  expect((await claims(u.id, 'milestone')).map((c) => c.sourceRef)).toEqual([`${f.id}:700`]);
});

test('a deleted milestone stops new claims but keeps pending ones', async () => {
  const { admin, u } = await setup(800);
  const m = await createMilestone(admin.id, { speciesKey: SP, weightGrams: 700, reward: { coins: 3 } }, 'keep');
  await deleteMilestone(admin.id, m.id);
  const other = await prisma.fish.create({
    data: { userId: u.id, speciesKey: SP, sex: 'female', rarity: 'common', weightGrams: 900, hp: 50, ageDays: 2, baseValue: 10, location: 'tank', origin: 'shop' },
  });
  await createMilestone(admin.id, { speciesKey: SP, weightGrams: 50_000, reward: { coins: 1 } }, 'keep');
  const all = await claims(u.id, 'milestone');
  expect(all).toHaveLength(1);
  expect(all[0].sourceRef).not.toContain(other.id);
  await expect(updateMilestone(admin.id, m.id, { reward: { coins: 9 } }, 'keep')).rejects.toMatchObject({ code: 'not_found' });
});

test('a recreated milestone at the same weight: claimed stays claimed, pending is replaced or kept by policy', async () => {
  const { admin, u, f } = await setup(800);
  const other = await prisma.fish.create({
    data: { userId: u.id, speciesKey: SP, sex: 'female', rarity: 'common', weightGrams: 900, hp: 50, ageDays: 2, baseValue: 10, location: 'tank', origin: 'shop' },
  });
  const m = await createMilestone(admin.id, { speciesKey: SP, weightGrams: 700, reward: { coins: 3 } }, 'keep');
  // The first fish claims; the second leaves its reward pending.
  const first = (await claims(u.id, 'milestone')).find((c) => c.fishId === f.id)!;
  await prisma.rewardClaimPart.updateMany({ where: { claimId: first.id }, data: { status: 'claimed' } });
  await prisma.rewardClaim.update({ where: { id: first.id }, data: { completedAt: new Date() } });

  await deleteMilestone(admin.id, m.id);
  await createMilestone(admin.id, { speciesKey: SP, weightGrams: 700, reward: { coins: 8 } }, 'replace');

  const after = await claims(u.id, 'milestone');
  expect(after).toHaveLength(2);
  expect(after.find((c) => c.fishId === f.id)!.parts.map((p) => [p.qty, p.status])).toEqual([[3, 'claimed']]);
  const pending = after.find((c) => c.fishId === other.id)!.parts;
  expect(pending.filter((p) => p.status === 'pending').map((p) => p.qty)).toEqual([8]);
  expect(pending.filter((p) => p.status === 'void').map((p) => p.qty)).toEqual([3]);
  const log = await prisma.milestoneChangeLog.findFirstOrThrow({ where: { pendingPolicy: 'replace', adminId: admin.id } });
  expect(log.affectedClaimIds).toEqual([after.find((c) => c.fishId === other.id)!.id]);
});

test('keep policy leaves the pending bundle as it was', async () => {
  const { admin, u } = await setup(800);
  const m = await createMilestone(admin.id, { speciesKey: SP, weightGrams: 700, reward: { coins: 3 } }, 'keep');
  await updateMilestone(admin.id, m.id, { reward: { coins: 8 } }, 'keep');
  const [c] = await claims(u.id, 'milestone');
  expect(c.parts.map((p) => [p.qty, p.status])).toEqual([[3, 'pending']]);
});

