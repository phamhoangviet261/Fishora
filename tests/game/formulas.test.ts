import { applicableMilestones, computeBaseValue, isMature, newlyReached, reviveCoinCost, revivedHp, saleAmount } from '@/lib/game/fish/formulas';
import { TEST_CONTENT } from '../fixtures/content';

const value = TEST_CONTENT.config.value;
const ms = (id: string, speciesKey: string | null, weightGrams: number) => ({ id, speciesKey, weightGrams, reward: {}, deletedAt: null });

test('base value follows rarity, weight and age', () => {
  // epic ×3 × (50/kg × 2 kg + 1 × 4 days) = 312
  expect(computeBaseValue({ rarity: 'epic', weightGrams: 2000, ageDays: 4, valuePerKg: 50 }, value)).toBe(312);
  expect(computeBaseValue({ rarity: 'common', weightGrams: 1, ageDays: 0, valuePerKg: 1 }, value)).toBe(1);
});

test('mature exactly at max weight', () => {
  expect(isMature(2000, 2000)).toBe(true);
  expect(isMature(1999, 2000)).toBe(false);
});

const matureFish = { baseValue: 200, weightGrams: 2000, maturitySaleBonusCoins: 50, maturitySaleBonusPct: 10 };

test('selling a mature fish adds its stored bonus', () => {
  expect(saleAmount(matureFish, 2000, 'sell')).toEqual({ coins: 270, maturityBonus: 70 });
});

test('releasing a mature fish pays 25% and no bonus', () => {
  expect(saleAmount(matureFish, 2000, 'release')).toEqual({ coins: 50, maturityBonus: 0 });
});

test('a fish that matured earlier but is now below max sells without bonus', () => {
  expect(saleAmount({ ...matureFish, weightGrams: 1900 }, 2000, 'sell')).toEqual({ coins: 200, maturityBonus: 0 });
});

test('a fish at max without a stored snapshot gets no bonus', () => {
  expect(saleAmount({ ...matureFish, maturitySaleBonusCoins: null, maturitySaleBonusPct: null }, 2000, 'sell')).toEqual({ coins: 200, maturityBonus: 0 });
});

test('release rounds down', () => {
  expect(saleAmount({ ...matureFish, baseValue: 7, weightGrams: 1 }, 2000, 'release')).toEqual({ coins: 1, maturityBonus: 0 });
});

test('a species with its own milestones ignores the defaults', () => {
  const all = [ms('d1', null, 1000), ms('d2', null, 2000), ms('s1', 'x', 500)];
  expect(applicableMilestones(all, 'x').map((m) => m.id)).toEqual(['s1']);
  expect(applicableMilestones(all, 'y').map((m) => m.id)).toEqual(['d1', 'd2']);
});

test('newlyReached skips milestones already reached and those above the peak', () => {
  const list = [ms('a', null, 1000), ms('b', null, 2000), ms('c', null, 5000), ms('d', null, 10000)];
  expect(newlyReached(5000, list, new Set([2000])).map((m) => m.weightGrams)).toEqual([1000, 5000]);
});

test('revive cost and hp', () => {
  expect(reviveCoinCost('rare', 5, TEST_CONTENT.config.revive)).toBe(45);
  expect(revivedHp(100, 0.3)).toBe(30);
  expect(revivedHp(2, 0.3)).toBe(1);
});
