import { seededRng } from '@/lib/game/rng';
import { feedFish, simulate, type SimFish, type SimInput, type SimOutput } from '@/lib/game/sim/simulate';
import type { CareConfig } from '@/lib/game/types';

// Numbers chosen for readable assertions only.
const care: CareConfig = {
  tickMinutes: 60,
  hpMax: 100,
  feedSatietyTicks: 1,
  hpPerFeed: 20,
  hungerHpLossPerTick: 10,
  hungerWeightLossRatio: 0.5,
  dirtBasePerTick: 0,
  dirtPerFishPerTick: 1,
  dirtMax: 1000,
  dirtThresholds: [
    { at: 50, hpLossPerTick: 2, weightLossRatio: 0.5 },
    { at: 100, hpLossPerTick: 5, weightLossRatio: 1 },
  ],
  autoCleanEarlyAt: 80,
  autoCleanItemKey: 'c',
  autoCleanItemQty: 1,
  autoCleanEffect: 60,
  cleaningLevels: [],
};
const time = { timezone: 'UTC', resetHour: 0 };
const H = 3_600_000;
const from = new Date('2026-10-22T10:00:00Z');

const fish = (id: string, o: Partial<SimFish> = {}): SimFish => ({
  id,
  hp: 100,
  weightGrams: 1000,
  satietyTicks: 0,
  growthMult: 1,
  ageDays: 1,
  daysInTank: 0,
  species: { maxWeightGrams: 2000, growthGramsPerTick: 50, foodUnitsPerFeed: 1 },
  ...o,
});
const food = { itemKey: 'f', stats: { satietyMult: 1, hpMult: 1, growthMult: 1 } };
const input = (o: Partial<SimInput>): SimInput => ({ from, ticks: 1, dirt: 0, fish: [], autoFeed: null, autoClean: null, time, ...o });
const byId = (out: SimOutput, id: string) => out.fish.find((f) => f.id === id)!;

test('a well-fed fish below the first dirt threshold grows per tick and caps at max', () => {
  const c = { ...care, dirtPerFishPerTick: 0 };
  const one = simulate(input({ fish: [fish('a', { weightGrams: 1900, satietyTicks: 99 })] }), c, seededRng(1));
  expect(byId(one, 'a').weightGrams).toBe(1950);
  const three = simulate(input({ ticks: 3, fish: [fish('a', { weightGrams: 1900, satietyTicks: 99 })] }), c, seededRng(1));
  expect(byId(three, 'a').weightGrams).toBe(2000);
  expect(three.peaks.a.grams).toBe(2000);
});

test('a hungry fish loses hp each tick and dies at 0, timed at the tick end', () => {
  const out = simulate(input({ ticks: 5, fish: [fish('a', { hp: 25 })] }), care, seededRng(1));
  expect(byId(out, 'a').hp).toBe(0);
  expect(out.died).toEqual([{ id: 'a', at: new Date(from.getTime() + 3 * H) }]);
  expect(byId(out, 'a').weightGrams).toBe(1000 - 3 * 25);
});

test('a dead fish is never fed afterwards: food goes only to the survivor', () => {
  const out = simulate(
    input({
      ticks: 4,
      dirt: 120,
      fish: [fish('dying', { hp: 3, satietyTicks: 5 }), fish('ok', { hp: 100 })],
      autoFeed: { ...food, main: 10, reserve: 0 },
    }),
    { ...care, dirtPerFishPerTick: 0 },
    seededRng(1),
  );
  expect(out.died.map((d) => d.id)).toEqual(['dying']);
  expect(out.used.main).toBe(4);
});

test('auto-feed takes main before reserve and stops when a fish needs more than remains', () => {
  const species = { maxWeightGrams: 2000, growthGramsPerTick: 50, foodUnitsPerFeed: 2 };
  const out = simulate(
    input({ fish: ['a', 'b', 'c'].map((id) => fish(id, { species })), autoFeed: { ...food, main: 3, reserve: 2 } }),
    care,
    seededRng(1),
  );
  expect(out.used).toMatchObject({ main: 3, reserve: 1 });
  expect(out.fish.filter((f) => f.satietyTicks === 0 && f.hp === 90)).toHaveLength(1);
  expect(out.events.some((e) => e.type === 'auto_feed_empty')).toBe(true);
});

test('not enough food: a random subset is fed, deterministic per seed', () => {
  const all = ['a', 'b', 'c'].map((id) => fish(id));
  const run = (seed: number) => feedFish(all, food.stats, { main: 1, reserve: 0 }, care, seededRng(seed)).fedIds;
  expect(run(1)).toEqual(run(1));
  expect(new Set(Array.from({ length: 20 }, (_, i) => run(i)[0])).size).toBeGreaterThan(1);
});

test('above the second dirt threshold only the second penalty applies and nothing grows', () => {
  const out = simulate(input({ dirt: 150, fish: [fish('a', { satietyTicks: 5 })] }), { ...care, dirtPerFishPerTick: 0 }, seededRng(1));
  expect(byId(out, 'a').hp).toBe(95);
  expect(byId(out, 'a').weightGrams).toBe(950);
});

test('dirt does not rise with no live fish', () => {
  const out = simulate(input({ ticks: 10, dirt: 7, fish: [fish('a', { hp: 0 })] }), { ...care, dirtBasePerTick: 3 }, seededRng(1));
  expect(out.dirt).toBe(7);
});

test('a scheduled and an early auto-clean in the same tick run once', () => {
  const lateEvening = new Date('2026-10-22T23:00:00Z');
  const out = simulate(input({ from: lateEvening, dirt: 90, fish: [fish('a', { satietyTicks: 5 })], autoClean: { items: 5 } }), care, seededRng(1));
  expect(out.events.filter((e) => e.type === 'auto_clean')).toHaveLength(1);
  expect(out.used.cleanItems).toBe(1);
  expect(out.dirt).toBe(31);
  expect(out.lastAutoCleanAt).toEqual(new Date('2026-10-23T00:00:00Z'));
});

test('auto-clean with no items is skipped and dirt keeps rising', () => {
  const out = simulate(input({ ticks: 2, dirt: 90, fish: [fish('a', { satietyTicks: 5 })], autoClean: { items: 0 } }), care, seededRng(1));
  expect(out.events.filter((e) => e.type === 'auto_clean_skipped')).toHaveLength(2);
  expect(out.dirt).toBe(92);
});

test('age and days in tank grow only on day-boundary ticks and only for live fish', () => {
  const out = simulate(
    input({ from: new Date('2026-10-22T20:00:00Z'), ticks: 30, fish: [fish('live', { satietyTicks: 99 }), fish('dead', { hp: 0 })] }),
    { ...care, dirtPerFishPerTick: 0 },
    seededRng(1),
  );
  expect(byId(out, 'live')).toMatchObject({ ageDays: 3, daysInTank: 2 });
  expect(byId(out, 'dead')).toMatchObject({ ageDays: 1, daysInTank: 0 });
});

test('10 000 ticks with 20 fish runs under 200 ms', () => {
  const t0 = performance.now();
  simulate(
    input({ ticks: 10_000, fish: Array.from({ length: 20 }, (_, i) => fish(`f${i}`)), autoFeed: { ...food, main: 100_000, reserve: 0 }, autoClean: { items: 1000 } }),
    care,
    seededRng(1),
  );
  expect(performance.now() - t0).toBeLessThan(200);
});

test('simulating n then m ticks equals simulating n+m with the same random stream', () => {
  const start = input({ dirt: 10, fish: [fish('a'), fish('b', { hp: 40 }), fish('c')], autoFeed: { ...food, main: 7, reserve: 3 }, autoClean: { items: 1 } });
  const whole = simulate({ ...start, ticks: 50 }, care, seededRng(5));

  const rng = seededRng(5);
  const first = simulate({ ...start, ticks: 20 }, care, rng);
  const second = simulate(
    {
      ...start,
      from: new Date(from.getTime() + 20 * H),
      ticks: 30,
      dirt: first.dirt,
      fish: first.fish,
      autoFeed: { ...food, main: 7 - first.used.main, reserve: 3 - first.used.reserve },
      autoClean: { items: 1 - first.used.cleanItems },
    },
    care,
    rng,
  );
  expect(second.fish).toEqual(whole.fish);
  expect(second.dirt).toBe(whole.dirt);
  expect(first.used.main + second.used.main).toBe(whole.used.main);
  expect([...first.died, ...second.died]).toEqual(whole.died);
});
