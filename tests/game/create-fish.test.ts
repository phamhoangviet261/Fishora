import { prisma } from '@/lib/db';
import { createFish, grantStarter } from '@/lib/game/fish/create';
import { computeBaseValue } from '@/lib/game/fish/formulas';
import { seededRng } from '@/lib/game/rng';
import { withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_CONTENT, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

test('createFish rolls within the spawn ranges and stores rarity and a fixed base value', async () => {
  const u = await createTestUser();
  const f = await withPlayer(u.id, (tx, ctx) => createFish(tx, u.id, TEST_SPECIES.big, 'shop', { location: 'storage' }, ctx), { rng: seededRng(3) });
  expect(f.rarity).toBe('epic');
  expect(f.weightGrams).toBeGreaterThanOrEqual(3000);
  expect(f.weightGrams).toBeLessThanOrEqual(5000);
  expect(f.ageDays).toBeGreaterThanOrEqual(5);
  expect(f.ageDays).toBeLessThanOrEqual(10);
  expect(f.hp).toBe(TEST_CONTENT.config.care.hpMax);
  expect(f.baseValue).toBe(computeBaseValue({ rarity: 'epic', weightGrams: f.weightGrams, ageDays: f.ageDays, valuePerKg: 50 }, TEST_CONTENT.config.value));
  expect(await prisma.fishEvent.count({ where: { fishId: f.id, type: 'acquired' } })).toBe(1);
});

test('two fish of one species are two individuals and one discovery', async () => {
  const u = await createTestUser();
  const [a, b] = await withPlayer(u.id, async (tx, ctx) => [
    await createFish(tx, u.id, TEST_SPECIES.small, 'shop', { location: 'storage' }, ctx),
    await createFish(tx, u.id, TEST_SPECIES.small, 'blindbox', { location: 'storage' }, ctx),
  ]);
  expect(a.id).not.toBe(b.id);
  expect(await prisma.speciesDiscovery.findMany({ where: { userId: u.id } })).toEqual([expect.objectContaining({ speciesKey: TEST_SPECIES.small, via: 'shop' })]);
});

test('an inactive species cannot be created', async () => {
  const u = await createTestUser();
  await expect(withPlayer(u.id, (tx, ctx) => createFish(tx, u.id, TEST_SPECIES.inactive, 'shop', { location: 'storage' }, ctx))).rejects.toMatchObject({
    code: 'species_inactive',
  });
});

test('grantStarter gives coins, tank fish, items and gear from config', async () => {
  const u = await createTestUser();
  await prisma.user.update({ where: { id: u.id }, data: { coins: 0 } });
  await withPlayer(u.id, (tx, ctx) =>
    grantStarter(tx, u.id, { ...ctx, cfg: { ...ctx.cfg, starter: { coins: 99, fish: [TEST_SPECIES.small], items: [{ itemKey: 't_food1', qty: 4 }], gear: ['t_rod'] } } }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { fish: true, stacks: true, gear: true, loadout: true } });
  expect(user.coins).toBe(99);
  expect(user.fish).toEqual([expect.objectContaining({ speciesKey: TEST_SPECIES.small, location: 'tank', origin: 'starter' })]);
  expect(user.stacks).toEqual([expect.objectContaining({ itemKey: 't_food1', qty: 4 })]);
  expect(user.gear).toHaveLength(1);
  expect(user.loadout).toMatchObject({ rodId: user.gear[0].id });
});
