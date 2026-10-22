import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { moveFish } from '@/lib/game/care';
import { resolveAttempt, startAttempt, type StartResult } from '@/lib/game/fishing/attempt';
import { setLoadout } from '@/lib/game/fishing/loadout';
import { initReel, stepReel, type ReelParams } from '@/lib/game/fishing/reel';
import { repairGear } from '@/lib/game/fishing/repair';
import { fishingView, releaseCarried, returnToShore } from '@/lib/game/fishing/session';
import { unlockZone } from '@/lib/game/fishing/zones';
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

const T0 = new Date('2026-10-20T03:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const always = (x: number): Rng => () => x;

/** A player with a rod, a cooler and `bait` bait equipped, and the given maps unlocked. */
async function angler(opts: { bait?: number; zones?: string[]; rod?: string } = {}) {
  const u = await createTestUser();
  const rodKey = opts.rod ?? 't_rod';
  await withPlayer(u.id, async (tx) => {
    for (const k of [rodKey, 't_cooler']) await tryGrantItem(tx, u.id, k, 1);
    if (opts.bait) await tryGrantItem(tx, u.id, 't_bait', opts.bait);
  });
  const gear = await prisma.gearItem.findMany({ where: { userId: u.id } });
  const id = (k: string) => gear.find((g) => g.defKey === k)!.id;
  await withPlayer(u.id, (tx) => setLoadout(tx, u.id, { rodId: id(rodKey), coolerId: id('t_cooler'), baitKey: 't_bait' }));
  for (const zoneKey of opts.zones ?? ['t_pond']) await prisma.unlockedZone.create({ data: { userId: u.id, zoneKey } });
  return { u, rodId: id(rodKey), coolerId: id('t_cooler') };
}

const start = (userId: string, zoneKey = 't_pond', o: { now?: Date; rng?: Rng; key?: string } = {}) =>
  withPlayer(userId, (tx, ctx) => startAttempt(tx, userId, zoneKey, ctx), { now: o.now ?? T0, rng: o.rng, idempotencyKey: o.key ?? randomUUID(), kind: 'attempt' });
const resolve = (userId: string, id: string, inputs: (number | null)[], now: Date, key = randomUUID()) =>
  withPlayer(userId, (tx, ctx) => resolveAttempt(tx, userId, id, inputs, ctx), { now, idempotencyKey: key, kind: 'resolve' });

/** What a perfect player feeds: the cursor always on the target. */
function perfect(p: ReelParams) {
  const rng = seededRng(p.seed);
  let s = initReel(p, rng);
  const inputs: number[] = [];
  while (!s.done) {
    const x = Math.round(s.center * 1000) / 1000;
    inputs.push(x);
    s = stepReel(s, p, rng, x);
  }
  return inputs;
}
const doneAt = (a: StartResult, ticks: number, from = T0) => new Date(from.getTime() + a.waitMs + ticks * 50 + 500);

const bait = async (userId: string) => (await prisma.inventoryStack.findFirst({ where: { userId, itemKey: 't_bait' } }))?.qty ?? 0;
const durability = async (id: string) => (await prisma.gearItem.findUniqueOrThrow({ where: { id } })).durability;
const carried = (userId: string) => prisma.fish.findMany({ where: { userId, location: 'trip', status: 'alive' } });
const tripFish = async (userId: string, weightGrams: number) => {
  const trip = await prisma.fishingTrip.create({ data: { userId, zoneKey: 't_pond' } });
  await prisma.fish.create({
    data: { userId, speciesKey: TEST_SPECIES.small, sex: 'male', rarity: 'common', weightGrams, hp: 100, ageDays: 1, baseValue: 40, location: 'trip', tripId: trip.id, origin: 'fishing' },
  });
  return trip;
};

describe('starting an attempt', () => {
  test('takes exactly one bait and tells the client nothing about the fish', async () => {
    const { u } = await angler({ bait: 3 });
    const a = await start(u.id);
    expect(await bait(u.id)).toBe(2);
    expect(a).toMatchObject({ bite: true, waitMs: expect.any(Number) });
    expect(Object.keys(a).sort()).toEqual(['attemptId', 'bite', 'reel', 'tripId', 'waitMs']);
    expect(JSON.stringify(a)).not.toMatch(/t_guppy|common|weightGrams/);
  });

  test('a retried request with the same key takes bait once', async () => {
    const { u } = await angler({ bait: 3 });
    const key = randomUUID();
    const [a, b] = await Promise.all([start(u.id, 't_pond', { key }), start(u.id, 't_pond', { key })]);
    expect(a).toEqual(b);
    expect(await bait(u.id)).toBe(2);
  });

  test('a second attempt while one is open is refused without taking bait', async () => {
    const { u } = await angler({ bait: 3 });
    await start(u.id);
    await expect(start(u.id)).rejects.toMatchObject({ code: 'attempt_open' });
    expect(await bait(u.id)).toBe(2);
  });

  test('no bait, no rod, a broken rod or no container: refused, nothing taken', async () => {
    const { u, rodId } = await angler({ bait: 0 });
    await expect(start(u.id)).rejects.toMatchObject({ code: 'no_bait' });
    await withPlayer(u.id, (tx) => tryGrantItem(tx, u.id, 't_bait', 2));
    await prisma.gearItem.update({ where: { id: rodId }, data: { durability: 0 } });
    await expect(start(u.id)).rejects.toMatchObject({ code: 'gear_broken' });
    await withPlayer(u.id, (tx) => setLoadout(tx, u.id, { rodId: null }));
    await expect(start(u.id)).rejects.toMatchObject({ code: 'no_rod' });
    await prisma.gearItem.update({ where: { id: rodId }, data: { durability: 10 } });
    await withPlayer(u.id, (tx) => setLoadout(tx, u.id, { rodId, coolerId: null }));
    await expect(start(u.id)).rejects.toMatchObject({ code: 'no_container' });
    expect(await bait(u.id)).toBe(2);
  });

  test('a locked map cannot be fished', async () => {
    const { u } = await angler({ bait: 1, zones: [] });
    await expect(start(u.id)).rejects.toMatchObject({ code: 'zone_locked' });
  });

  test('a rod only reaches fish up to its rarity: a map with none eligible is refused before any bait is used', async () => {
    const { u } = await angler({ bait: 2, rod: 't_rod_weak', zones: ['t_pond', 't_sea'] });
    await expect(start(u.id, 't_sea')).rejects.toMatchObject({ code: 'no_eligible_fish' });
    expect(await bait(u.id)).toBe(2);
    expect((await start(u.id, 't_pond')).bite).toBe(true);
  });

  test('a container without room for the heaviest possible fish requires returning to shore', async () => {
    const { u } = await angler({ bait: 2 });
    await tripFish(u.id, 9900);
    await expect(start(u.id)).rejects.toMatchObject({ code: 'cooler_full' });
    expect(await bait(u.id)).toBe(2);
  });
});

describe('resolving an attempt', () => {
  test('a reel the server can replay as a catch lands the fish in the carried container', async () => {
    const { u, rodId } = await angler({ bait: 2 });
    const a = await start(u.id);
    const inputs = perfect(a.reel!);
    const r = await resolve(u.id, a.attemptId, inputs, doneAt(a, inputs.length));
    expect(r).toMatchObject({ outcome: 'caught', card: { name: 'Test Guppy', rarity: 'common', speciesKey: TEST_SPECIES.small, modelKey: 'betta' } });
    const fish = await prisma.fish.findUniqueOrThrow({ where: { id: r.card!.fishId } });
    expect(fish).toMatchObject({ location: 'trip', tripId: a.tripId, origin: 'fishing', baseValue: r.card!.baseValue, weightGrams: r.card!.weightGrams });
    expect(await durability(rodId)).toBe(9);
  });

  test('replaying the same resolve (retry or second tab) gives the same answer and no second fish', async () => {
    const { u } = await angler({ bait: 2 });
    const a = await start(u.id);
    const inputs = perfect(a.reel!);
    const when = doneAt(a, inputs.length);
    const [r1, r2] = await Promise.all([resolve(u.id, a.attemptId, inputs, when), resolve(u.id, a.attemptId, inputs, when)]);
    expect(r1).toEqual(r2);
    expect(await carried(u.id)).toHaveLength(1);
  });

  test('a client claiming a catch with inputs that miss the target gets an escape', async () => {
    const { u, rodId } = await angler({ bait: 2 });
    const a = await start(u.id);
    const r = await resolve(u.id, a.attemptId, Array(400).fill(0), doneAt(a, 400));
    expect(r).toEqual({ outcome: 'escaped', card: null });
    expect(await carried(u.id)).toHaveLength(0);
    expect(await durability(rodId)).toBe(8);
  });

  test('an unfinished reel is rejected and the attempt stays open', async () => {
    const { u } = await angler({ bait: 2 });
    const a = await start(u.id);
    await expect(resolve(u.id, a.attemptId, perfect(a.reel!).slice(0, 5), doneAt(a, 5))).rejects.toMatchObject({ code: 'invalid_input' });
    expect(await prisma.fishingAttempt.findUniqueOrThrow({ where: { id: a.attemptId } })).toMatchObject({ status: 'open' });
  });

  test('a reel finished faster than it can be played is rejected', async () => {
    const { u } = await angler({ bait: 2 });
    const a = await start(u.id);
    await expect(resolve(u.id, a.attemptId, perfect(a.reel!), at(10))).rejects.toMatchObject({ code: 'too_early' });
  });

  test('nothing biting resolves to "nothing": bait gone, no fish, no wear', async () => {
    const { u, rodId } = await angler({ bait: 2, zones: ['t_sea'] });
    const a = await start(u.id, 't_sea', { rng: always(0.99) });
    expect(a).toMatchObject({ bite: false, reel: null });
    expect(await resolve(u.id, a.attemptId, [], at(a.waitMs + 100))).toEqual({ outcome: 'nothing', card: null });
    expect(await durability(rodId)).toBe(10);
    expect(await bait(u.id)).toBe(1);
  });

  test('an attempt left past its time limit is cancelled and cannot be resolved', async () => {
    const { u } = await angler({ bait: 2 });
    const a = await start(u.id);
    await expect(resolve(u.id, a.attemptId, perfect(a.reel!), at(10 * 60_000))).rejects.toMatchObject({ code: 'attempt_closed' });
    await withPlayer(u.id, async () => null, { now: at(10 * 60_000) });
    expect(await prisma.fishingAttempt.findUniqueOrThrow({ where: { id: a.attemptId } })).toMatchObject({ status: 'cancelled' });
    expect(await carried(u.id)).toHaveLength(0);
  });
});

describe('the carried container', () => {
  test('refreshing the page cancels the unfinished attempt but keeps the caught fish', async () => {
    const { u } = await angler({ bait: 3 });
    const first = await start(u.id);
    const inputs = perfect(first.reel!);
    await resolve(u.id, first.attemptId, inputs, doneAt(first, inputs.length));
    const second = await start(u.id, 't_pond', { now: at(60_000) });
    await withPlayer(u.id, (tx, ctx) => bootstrap(tx, u.id, ctx, { fresh: true }), { now: at(61_000) });
    expect(await prisma.fishingAttempt.findUniqueOrThrow({ where: { id: second.attemptId } })).toMatchObject({ status: 'cancelled' });
    expect(await carried(u.id)).toHaveLength(1);
    expect(await prisma.fishingTrip.findUniqueOrThrow({ where: { id: first.tripId } })).toMatchObject({ status: 'active' });
    expect(await bait(u.id)).toBe(1);
  });

  test('returning to shore moves every carried fish to storage once; a repeat moves nothing', async () => {
    const { u } = await angler();
    const trip = await tripFish(u.id, 500);
    const r = await withPlayer(u.id, (tx, ctx) => returnToShore(tx, u.id, null, ctx));
    expect(r).toMatchObject({ kept: [expect.any(String)], released: [] });
    await expect(withPlayer(u.id, (tx, ctx) => returnToShore(tx, u.id, null, ctx))).rejects.toMatchObject({ code: 'trip_not_active' });
    expect(await prisma.fish.count({ where: { userId: u.id, location: 'storage' } })).toBe(1);
    expect(await prisma.fishingTrip.findUniqueOrThrow({ where: { id: trip.id } })).toMatchObject({ status: 'completed' });
  });

  test('two returns at once: one succeeds, fish are never duplicated', async () => {
    const { u } = await angler();
    await tripFish(u.id, 500);
    const results = await Promise.allSettled([
      withPlayer(u.id, (tx, ctx) => returnToShore(tx, u.id, null, ctx)),
      withPlayer(u.id, (tx, ctx) => returnToShore(tx, u.id, null, ctx)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.fish.count({ where: { userId: u.id } })).toBe(1);
  });

  test('storage too small: the return is refused, nothing is lost, the container stays', async () => {
    const { u } = await angler();
    const trip = await tripFish(u.id, 10_500);
    await expect(withPlayer(u.id, (tx, ctx) => returnToShore(tx, u.id, null, ctx))).rejects.toMatchObject({ code: 'storage_full' });
    expect(await carried(u.id)).toHaveLength(1);
    expect(await prisma.fishingTrip.findUniqueOrThrow({ where: { id: trip.id } })).toMatchObject({ status: 'active' });
  });

  test('releasing from the container pays 25% and frees the room', async () => {
    const { u } = await angler();
    await tripFish(u.id, 500);
    const [f] = await carried(u.id);
    expect((await withPlayer(u.id, (tx, ctx) => releaseCarried(tx, u.id, [f.id], ctx))).total).toBe(10);
    expect(await carried(u.id)).toHaveLength(0);
  });

  test('carried fish cannot be moved or sold before returning', async () => {
    const { u } = await angler();
    await tripFish(u.id, 100);
    const [f] = await carried(u.id);
    await expect(withPlayer(u.id, (tx) => moveFish(tx, u.id, f.id, 'storage'))).rejects.toMatchObject({ code: 'not_found' });
    await expect(withPlayer(u.id, (tx, ctx) => sellFish(tx, u.id, [f.id], 'sell', ctx))).rejects.toMatchObject({ code: 'invalid_input' });
  });

  test('the container cannot be swapped while it holds fish', async () => {
    const { u } = await angler();
    await tripFish(u.id, 100);
    await withPlayer(u.id, (tx) => tryGrantItem(tx, u.id, 't_cooler', 1));
    const other = (await prisma.gearItem.findMany({ where: { userId: u.id, defKey: 't_cooler' }, orderBy: { acquiredAt: 'asc' } }))[1];
    await expect(withPlayer(u.id, (tx) => setLoadout(tx, u.id, { coolerId: other.id }))).rejects.toMatchObject({ code: 'container_in_use' });
  });
});

describe('equipment and maps', () => {
  test('the view lists owned equipment, maps with eligibility for the equipped rod, and the container', async () => {
    const { u } = await angler({ bait: 4, rod: 't_rod_weak', zones: ['t_pond', 't_sea'] });
    const v = await withPlayer(u.id, (tx, ctx) => fishingView(tx, u.id, ctx));
    expect(v.equipment.rods).toEqual([expect.objectContaining({ defKey: 't_rod_weak', maxRarity: 'common' })]);
    expect(v.equipment.baits).toEqual([expect.objectContaining({ itemKey: 't_bait', qty: 4 })]);
    expect(v.zones.find((z) => z.key === 't_pond')).toMatchObject({ unlocked: true, eligibleSpecies: 1 });
    expect(v.zones.find((z) => z.key === 't_sea')).toMatchObject({ unlocked: true, eligibleSpecies: 0 });
    expect(v.container).toMatchObject({ capacityGrams: 10_000, carriedGrams: 0, fish: [] });
  });

  test('the loadout only accepts owned gear of the right kind', async () => {
    const { u, coolerId } = await angler();
    await expect(withPlayer(u.id, (tx) => setLoadout(tx, u.id, { rodId: coolerId }))).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(withPlayer(u.id, (tx) => setLoadout(tx, u.id, { baitKey: 't_food1' }))).rejects.toMatchObject({ code: 'invalid_input' });
  });

  test('unlocking needs the level and the coins, and is paid once', async () => {
    const u = await createTestUser();
    await expect(withPlayer(u.id, (tx, ctx) => unlockZone(tx, u.id, 't_sea', ctx))).rejects.toMatchObject({ code: 'level_too_low' });
    await prisma.user.update({ where: { id: u.id }, data: { level: 3 } });
    await withPlayer(u.id, (tx, ctx) => unlockZone(tx, u.id, 't_sea', ctx));
    await withPlayer(u.id, (tx, ctx) => unlockZone(tx, u.id, 't_sea', ctx));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).coins).toBe(150);
  });

  test('repair restores full durability and charges per point', async () => {
    const { u, rodId } = await angler();
    await prisma.gearItem.update({ where: { id: rodId }, data: { durability: 4 } });
    expect(await withPlayer(u.id, (tx, ctx) => repairGear(tx, u.id, rodId, ctx))).toEqual({ durability: 10 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).coins).toBe(250 - 6 * 3);
  });
});
