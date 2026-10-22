import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { seededRng } from '@/lib/game/rng';
import { buy, openBlindbox, shopCatalog } from '@/lib/game/shop';
import { buyUpgrade } from '@/lib/game/upgrades';
import { withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const coins = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).coins;
const fishCount = (userId: string) => prisma.fish.count({ where: { userId } });
const storeFish = (userId: string, weightGrams: number) =>
  prisma.fish.create({
    data: { userId, speciesKey: TEST_SPECIES.small, sex: 'male', rarity: 'common', weightGrams, hp: 50, ageDays: 2, baseValue: 10, location: 'storage', origin: 'shop' },
  });

test('the catalog lists active test species and boxes with odds, never inactive ones', async () => {
  const u = await createTestUser();
  const c = await withPlayer(u.id, (tx, ctx) => shopCatalog(tx, u.id, ctx));
  expect(c.fish.map((f) => f.key)).toEqual(expect.arrayContaining([TEST_SPECIES.small, TEST_SPECIES.big]));
  expect(c.fish.map((f) => f.key)).not.toContain(TEST_SPECIES.inactive);
  expect(c.fish.every((f) => f.key.startsWith('t_'))).toBe(true);
  const box = c.blindboxes.find((b) => b.key === 't_box')!;
  expect(box.odds).toEqual([
    expect.objectContaining({ speciesKey: TEST_SPECIES.small, pct: 75 }),
    expect.objectContaining({ speciesKey: TEST_SPECIES.big, pct: 25 }),
  ]);
  expect(box.maxWeightGrams).toBe(5000);
  expect(c.items.map((i) => i.key)).not.toContain('t_revive');
});

test('buying a fish lands it in storage and charges the price', async () => {
  const u = await createTestUser();
  const r = await withPlayer(u.id, (tx, ctx) => buy(tx, u.id, { type: 'fish', key: TEST_SPECIES.small }, ctx));
  expect(r.coins).toBe(200);
  expect(await prisma.fish.findUniqueOrThrow({ where: { id: r.fishIds![0] } })).toMatchObject({ location: 'storage', origin: 'shop' });
});

test('storage too full for the heaviest possible fish: no charge, no fish', async () => {
  const u = await createTestUser();
  await storeFish(u.id, 6000);
  await expect(withPlayer(u.id, (tx, ctx) => buy(tx, u.id, { type: 'fish', key: TEST_SPECIES.big }, ctx))).rejects.toMatchObject({ code: 'storage_full' });
  expect(await coins(u.id)).toBe(250);
  expect(await fishCount(u.id)).toBe(1);
});

test('not enough coins: no fish, balance unchanged', async () => {
  const u = await createTestUser();
  await expect(withPlayer(u.id, (tx, ctx) => buy(tx, u.id, { type: 'fish', key: TEST_SPECIES.big }, ctx))).rejects.toMatchObject({ code: 'insufficient_coins' });
  expect(await coins(u.id)).toBe(250);
  expect(await fishCount(u.id)).toBe(0);
});

test('an inactive species cannot be bought', async () => {
  const u = await createTestUser();
  await expect(withPlayer(u.id, (tx, ctx) => buy(tx, u.id, { type: 'fish', key: TEST_SPECIES.inactive }, ctx))).rejects.toMatchObject({ code: 'species_inactive' });
});

test('blindboxes can repeat a species as separate fish and never roll an inactive one', async () => {
  const u = await createTestUser();
  await prisma.user.update({ where: { id: u.id }, data: { coins: 1000 } });
  await prisma.userUpgrade.create({ data: { userId: u.id, track: 'storage_fish', level: 1 } });
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push(...(await withPlayer(u.id, (tx, ctx) => buy(tx, u.id, { type: 'blindbox', key: 't_box' }, ctx), { rng: seededRng(i) })).fishIds!);
  const fish = await prisma.fish.findMany({ where: { id: { in: ids } } });
  expect(new Set(ids).size).toBe(3);
  expect(new Set(fish.map((f) => f.speciesKey)).size).toBeLessThan(3);
  expect(fish.every((f) => f.speciesKey !== TEST_SPECIES.inactive && f.origin === 'blindbox' && f.location === 'storage')).toBe(true);
  expect(await coins(u.id)).toBe(700);
});

test('a blindbox from inventory opens into a fish and uses the box', async () => {
  const u = await createTestUser();
  await prisma.inventoryStack.create({ data: { userId: u.id, itemKey: 't_box', qty: 1 } });
  const r = await withPlayer(u.id, (tx, ctx) => openBlindbox(tx, u.id, 't_box', ctx));
  expect(await prisma.fish.findUniqueOrThrow({ where: { id: r.fishId } })).toMatchObject({ origin: 'blindbox' });
  expect(await prisma.inventoryStack.findFirstOrThrow({ where: { userId: u.id, itemKey: 't_box' } })).toMatchObject({ qty: 0 });
  await expect(withPlayer(u.id, (tx, ctx) => openBlindbox(tx, u.id, 't_box', ctx))).rejects.toMatchObject({ code: 'insufficient_items' });
});

test('a retried purchase with the same key charges once', async () => {
  const u = await createTestUser();
  const key = randomUUID();
  const call = () => withPlayer(u.id, (tx, ctx) => buy(tx, u.id, { type: 'fish', key: TEST_SPECIES.small }, ctx), { idempotencyKey: key, kind: 'buy' });
  const [a, b] = await Promise.all([call(), call()]);
  expect(a).toEqual(b);
  expect(await coins(u.id)).toBe(200);
  expect(await fishCount(u.id)).toBe(1);
});

test('items: bought into a stack; full item storage refuses a new kind without charging', async () => {
  const u = await createTestUser();
  await withPlayer(u.id, (tx, ctx) => buy(tx, u.id, { type: 'item', key: 't_food1', qty: 10 }, ctx));
  expect(await coins(u.id)).toBe(230);
  for (const itemKey of ['t_food2', 't_cleaner', 't_box', 't_bait']) await prisma.inventoryStack.create({ data: { userId: u.id, itemKey, qty: 1 } });
  await expect(withPlayer(u.id, (tx, ctx) => buy(tx, u.id, { type: 'item', key: 't_rod' }, ctx))).rejects.toMatchObject({ code: 'item_storage_full' });
  expect(await coins(u.id)).toBe(230);
});

test('revive items are not for sale', async () => {
  const u = await createTestUser();
  await expect(withPlayer(u.id, (tx, ctx) => buy(tx, u.id, { type: 'item', key: 't_revive' }, ctx))).rejects.toMatchObject({ code: 'not_found' });
});

test('upgrades need the player level and charge coins', async () => {
  const u = await createTestUser();
  await expect(withPlayer(u.id, (tx) => buyUpgrade(tx, u.id, 'storage_items'))).rejects.toMatchObject({ code: 'level_too_low' });
  expect(await withPlayer(u.id, (tx) => buyUpgrade(tx, u.id, 'tank_capacity'))).toEqual({ level: 1 });
  expect(await coins(u.id)).toBe(150);
  await expect(withPlayer(u.id, (tx) => buyUpgrade(tx, u.id, 'tank_capacity'))).rejects.toMatchObject({ code: 'max_level' });
});
