import { prisma } from '@/lib/db';
import { moveFish } from '@/lib/game/care';
import { cast } from '@/lib/game/fishing/cast';
import { setLoadout } from '@/lib/game/fishing/loadout';
import { repairGear } from '@/lib/game/fishing/repair';
import { cancelTrip, releaseFromCooler, returnHome, startTrip } from '@/lib/game/fishing/trip';
import { unlockZone, zoneList } from '@/lib/game/fishing/zones';
import { seededRng, type Rng } from '@/lib/game/rng';
import { sellFish } from '@/lib/game/sell';
import { bootstrap } from '@/lib/game/snapshot';
import { tryGrantItem } from '@/lib/game/storage';
import { withPlayer } from '@/lib/game/tx';
import { createTestUser, deleteTestUsers } from '../helpers';
import { seedTestContent, TEST_SPECIES } from '../fixtures/content';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const always = (x: number): Rng => () => x;

/** A player with rod/line/hook/cooler equipped, `bait` bait, and the given zones unlocked. */
async function angler(opts: { bait?: number; zones?: string[] } = {}) {
  const u = await createTestUser();
  await withPlayer(u.id, async (tx) => {
    for (const k of ['t_rod', 't_line', 't_hook', 't_cooler']) await tryGrantItem(tx, u.id, k, 1);
    if (opts.bait) await tryGrantItem(tx, u.id, 't_bait', opts.bait);
  });
  const gear = await prisma.gearItem.findMany({ where: { userId: u.id } });
  const id = (k: string) => gear.find((g) => g.defKey === k)!.id;
  await withPlayer(u.id, (tx) => setLoadout(tx, u.id, { rodId: id('t_rod'), lineId: id('t_line'), hookId: id('t_hook'), coolerId: id('t_cooler'), baitKey: 't_bait' }));
  for (const zoneKey of opts.zones ?? ['t_pond']) await prisma.unlockedZone.create({ data: { userId: u.id, zoneKey } });
  return { u, gearId: id };
}

const start = (userId: string, zoneKey = 't_pond') => withPlayer(userId, (tx, ctx) => startTrip(tx, userId, zoneKey, ctx));
const castWith = (userId: string, tripId: string, rng: Rng) => withPlayer(userId, (tx, ctx) => cast(tx, userId, tripId, ctx), { rng });
const bait = async (userId: string) => (await prisma.inventoryStack.findFirst({ where: { userId, itemKey: 't_bait' } }))?.qty ?? 0;
const durabilities = async (userId: string) =>
  Object.fromEntries((await prisma.gearItem.findMany({ where: { userId } })).map((g) => [g.defKey, g.durability]));
const coins = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).coins;
const tripFish = (userId: string, tripId: string, weightGrams: number) =>
  prisma.fish.create({
    data: { userId, speciesKey: TEST_SPECIES.small, sex: 'male', rarity: 'common', weightGrams, hp: 100, ageDays: 1, baseValue: 40, location: 'trip', tripId, origin: 'fishing' },
  });

test('a catch uses one bait, wears the gear and puts the fish in the cooler, not storage', async () => {
  const { u } = await angler({ bait: 3 });
  const { tripId } = await start(u.id);
  const r = await castWith(u.id, tripId, seededRng(1));
  expect(r).toMatchObject({ outcome: 'caught', fought: false });
  expect(await bait(u.id)).toBe(2);
  expect(await durabilities(u.id)).toMatchObject({ t_rod: 9, t_line: 9, t_hook: 9, t_cooler: 10 });
  const fish = await prisma.fish.findUniqueOrThrow({ where: { id: (r as { fishId: string }).fishId } });
  expect(fish).toMatchObject({ location: 'trip', tripId, origin: 'fishing' });
  expect(await prisma.playerStat.findMany({ where: { userId: u.id } })).toEqual(
    expect.arrayContaining([expect.objectContaining({ metric: 'casts', value: 1 }), expect.objectContaining({ metric: 'fish_caught', value: 1 })]),
  );
});

test('a miss uses one bait and no durability', async () => {
  const { u } = await angler({ bait: 2, zones: ['t_sea'] });
  const { tripId } = await start(u.id, 't_sea');
  expect(await castWith(u.id, tripId, always(0.99))).toEqual({ outcome: 'miss' });
  expect(await bait(u.id)).toBe(1);
  expect(await durabilities(u.id)).toMatchObject({ t_rod: 10, t_line: 10, t_hook: 10 });
});

test('a fish over the load limit is fought: losing lets it escape and costs durability', async () => {
  const { u } = await angler({ bait: 2, zones: ['t_sea'] });
  const { tripId } = await start(u.id, 't_sea');
  expect(await castWith(u.id, tripId, always(0.45))).toMatchObject({ outcome: 'escaped' });
  expect(await durabilities(u.id)).toMatchObject({ t_rod: 8, t_line: 8, t_hook: 8 });
  expect(await prisma.fish.count({ where: { userId: u.id } })).toBe(0);
});

test('winning the fight lands the fish', async () => {
  const { u } = await angler({ bait: 2, zones: ['t_sea'] });
  const { tripId } = await start(u.id, 't_sea');
  expect(await castWith(u.id, tripId, always(0.3))).toMatchObject({ outcome: 'caught', fought: true });
});

test('broken gear cannot cast and uses no bait', async () => {
  const { u, gearId } = await angler({ bait: 2 });
  await prisma.gearItem.update({ where: { id: gearId('t_line') }, data: { durability: 0 } });
  const { tripId } = await start(u.id);
  await expect(castWith(u.id, tripId, seededRng(1))).rejects.toMatchObject({ code: 'gear_broken' });
  expect(await bait(u.id)).toBe(2);
});

test('no bait: no cast', async () => {
  const { u } = await angler({ bait: 0 });
  const { tripId } = await start(u.id);
  await expect(castWith(u.id, tripId, seededRng(1))).rejects.toMatchObject({ code: 'no_bait' });
});

test('an overfull cooler blocks casting until fish are released', async () => {
  const { u } = await angler({ bait: 2 });
  const { tripId } = await start(u.id);
  const big = await tripFish(u.id, tripId, 10_001);
  await expect(castWith(u.id, tripId, seededRng(1))).rejects.toMatchObject({ code: 'cooler_full' });
  expect(await bait(u.id)).toBe(2);
  const r = await withPlayer(u.id, (tx, ctx) => releaseFromCooler(tx, u.id, tripId, [big.id], ctx));
  expect(r.total).toBe(10);
  expect((await castWith(u.id, tripId, seededRng(1))).outcome).toBe('caught');
});

test('repair restores full durability and charges per point', async () => {
  const { u, gearId } = await angler();
  await prisma.gearItem.update({ where: { id: gearId('t_rod') }, data: { durability: 4 } });
  expect(await withPlayer(u.id, (tx, ctx) => repairGear(tx, u.id, gearId('t_rod'), ctx))).toEqual({ durability: 10 });
  expect(await coins(u.id)).toBe(250 - 6 * 3);
});

test('fish on a trip cannot be moved or sold', async () => {
  const { u } = await angler();
  const { tripId } = await start(u.id);
  const f = await tripFish(u.id, tripId, 100);
  await expect(withPlayer(u.id, (tx) => moveFish(tx, u.id, f.id, 'storage'))).rejects.toMatchObject({ code: 'not_found' });
  await expect(withPlayer(u.id, (tx, ctx) => sellFish(tx, u.id, [f.id], 'sell', ctx))).rejects.toMatchObject({ code: 'invalid_input' });
});

test('returning home keeps the chosen fish and releases the rest at 25%', async () => {
  const { u } = await angler();
  const { tripId } = await start(u.id);
  const keep = await tripFish(u.id, tripId, 2000);
  const let_go = await tripFish(u.id, tripId, 500);
  const r = await withPlayer(u.id, (tx, ctx) => returnHome(tx, u.id, tripId, [keep.id], ctx));
  expect(r).toMatchObject({ kept: [keep.id], released: [let_go.id], releasedCoins: 10 });
  expect(await prisma.fish.findUniqueOrThrow({ where: { id: keep.id } })).toMatchObject({ location: 'storage', status: 'alive' });
  expect(await prisma.fish.findUniqueOrThrow({ where: { id: let_go.id } })).toMatchObject({ status: 'released' });
  expect(await prisma.fishingTrip.findUniqueOrThrow({ where: { id: tripId } })).toMatchObject({ status: 'completed', endReason: 'returned' });
});

test('returning with too little storage is refused and the trip stays open', async () => {
  const { u } = await angler();
  const { tripId } = await start(u.id);
  const f = await tripFish(u.id, tripId, 10_500);
  await expect(withPlayer(u.id, (tx, ctx) => returnHome(tx, u.id, tripId, [f.id], ctx))).rejects.toMatchObject({ code: 'storage_full' });
  expect(await prisma.fishingTrip.findUniqueOrThrow({ where: { id: tripId } })).toMatchObject({ status: 'active' });
  expect(await prisma.fish.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ location: 'trip', status: 'alive' });
});

test('return and cancel racing: exactly one wins and no fish is both kept and lost', async () => {
  const { u } = await angler();
  const { tripId } = await start(u.id);
  const f = await tripFish(u.id, tripId, 100);
  const results = await Promise.allSettled([
    withPlayer(u.id, (tx, ctx) => returnHome(tx, u.id, tripId, [f.id], ctx)),
    withPlayer(u.id, (tx, ctx) => cancelTrip(tx, tripId, 'closed', ctx.now)),
  ]);
  const returned = results[0].status === 'fulfilled';
  const cancelled = results[1].status === 'fulfilled' && results[1].value === true;
  expect(returned !== cancelled).toBe(true);
  const row = await prisma.fish.findUniqueOrThrow({ where: { id: f.id } });
  expect(row).toMatchObject(returned ? { location: 'storage', status: 'alive' } : { location: 'none', status: 'abandoned' });
});

test('a trip with no heartbeat for longer than the timeout is cancelled on the next request', async () => {
  const { u } = await angler({ bait: 1 });
  const { tripId } = await start(u.id);
  const f = await tripFish(u.id, tripId, 100);
  await prisma.fishingTrip.update({ where: { id: tripId }, data: { lastSeenAt: new Date(Date.now() - 10 * 60_000) } });
  await expect(castWith(u.id, tripId, seededRng(1))).rejects.toMatchObject({ code: 'trip_not_active' });
  // The refused cast rolled back with its request; any request that succeeds records the cancellation.
  await withPlayer(u.id, async () => null);
  expect(await prisma.fishingTrip.findUniqueOrThrow({ where: { id: tripId } })).toMatchObject({ status: 'cancelled', endReason: 'timeout' });
  expect(await prisma.fish.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ status: 'abandoned' });
});

test('loading the game cancels an unfinished trip; starting a new one closes the old one', async () => {
  const { u } = await angler();
  const first = await start(u.id);
  const second = await start(u.id);
  expect(await prisma.fishingTrip.findUniqueOrThrow({ where: { id: first.tripId } })).toMatchObject({ status: 'cancelled', endReason: 'closed' });
  await withPlayer(u.id, (tx, ctx) => bootstrap(tx, u.id, ctx, { fresh: true }));
  expect(await prisma.fishingTrip.findUniqueOrThrow({ where: { id: second.tripId } })).toMatchObject({ status: 'cancelled' });
});

test('a locked zone cannot be fished', async () => {
  const { u } = await angler({ zones: [] });
  await expect(start(u.id, 't_pond')).rejects.toMatchObject({ code: 'zone_locked' });
});

test('unlocking needs the level and the coins, and is paid once', async () => {
  const u = await createTestUser();
  await expect(withPlayer(u.id, (tx, ctx) => unlockZone(tx, u.id, 't_sea', ctx))).rejects.toMatchObject({ code: 'level_too_low' });
  await prisma.user.update({ where: { id: u.id }, data: { level: 3 } });
  await withPlayer(u.id, (tx, ctx) => unlockZone(tx, u.id, 't_sea', ctx));
  await withPlayer(u.id, (tx, ctx) => unlockZone(tx, u.id, 't_sea', ctx));
  expect(await coins(u.id)).toBe(150);
  const zones = await withPlayer(u.id, (tx) => zoneList(tx, u.id));
  expect(zones.find((z) => z.key === 't_sea')).toMatchObject({ unlocked: true, odds: [expect.objectContaining({ speciesKey: TEST_SPECIES.big, pct: 50 })], missPct: 50 });
});

test('the loadout only accepts owned gear of the right kind', async () => {
  const { u, gearId } = await angler();
  await expect(withPlayer(u.id, (tx) => setLoadout(tx, u.id, { rodId: gearId('t_hook') }))).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(withPlayer(u.id, (tx) => setLoadout(tx, u.id, { baitKey: 't_food1' }))).rejects.toMatchObject({ code: 'invalid_input' });
});

test('a snapshot refresh during a trip keeps it open; only a fresh game load cancels it', async () => {
  const { u } = await angler();
  const { tripId } = await start(u.id);
  await withPlayer(u.id, (tx, ctx) => bootstrap(tx, u.id, ctx, { fresh: false }));
  expect(await prisma.fishingTrip.findUniqueOrThrow({ where: { id: tripId } })).toMatchObject({ status: 'active' });
  await withPlayer(u.id, (tx, ctx) => bootstrap(tx, u.id, ctx, { fresh: true }));
  expect(await prisma.fishingTrip.findUniqueOrThrow({ where: { id: tripId } })).toMatchObject({ status: 'cancelled' });
});
