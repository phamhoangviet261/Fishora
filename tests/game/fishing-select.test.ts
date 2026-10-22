import { eligibleEntries, neededCapacity, pickBite, rarityAllowed } from '@/lib/game/fishing/select';
import { seededRng } from '@/lib/game/rng';

const entries = [
  { speciesKey: 'a', weight: 6, rarity: 'common' as const, spawnWeightMaxGrams: 200 },
  { speciesKey: 'b', weight: 3, rarity: 'rare' as const, spawnWeightMaxGrams: 900 },
  { speciesKey: 'c', weight: 1, rarity: 'legendary' as const, spawnWeightMaxGrams: 5000 },
];

test('a rod only reaches fish up to its max rarity', () => {
  expect(rarityAllowed('rare', 'rare')).toBe(true);
  expect(rarityAllowed('epic', 'rare')).toBe(false);
  expect(eligibleEntries(entries, 'rare').map((e) => e.speciesKey)).toEqual(['a', 'b']);
  expect(eligibleEntries(entries, 'common').map((e) => e.speciesKey)).toEqual(['a']);
});

test('capacity needed is the heaviest eligible fish', () => {
  expect(neededCapacity(eligibleEntries(entries, 'rare'))).toBe(900);
  expect(neededCapacity([])).toBe(0);
});

test('picks follow the configured weights and never an ineligible species', () => {
  const rng = seededRng(11);
  const counts: Record<string, number> = { a: 0, b: 0, none: 0 };
  const pool = eligibleEntries(entries, 'rare');
  for (let i = 0; i < 9000; i++) counts[pickBite(pool, 0, {}, rng) ?? 'none']++;
  expect(counts.a / 9000).toBeGreaterThan(0.63);
  expect(counts.a / 9000).toBeLessThan(0.7);
  expect(counts.none).toBe(0);
});

test('miss weight gives "no bite"; bait multipliers shift the odds', () => {
  const rng = seededRng(3);
  let none = 0;
  let b = 0;
  for (let i = 0; i < 6000; i++) {
    const r = pickBite(eligibleEntries(entries, 'rare'), 9, { b: 3 }, rng);
    if (r === null) none++;
    if (r === 'b') b++;
  }
  // weights: a 6, b 3×3 = 9, miss 9 → none ≈ 37.5 %, b ≈ 37.5 %
  expect(none / 6000).toBeGreaterThan(0.34);
  expect(none / 6000).toBeLessThan(0.41);
  expect(b / 6000).toBeGreaterThan(0.34);
});
