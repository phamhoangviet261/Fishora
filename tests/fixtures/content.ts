import { prisma } from '@/lib/db';
import { applyContent, type ContentSet } from '@/prisma/seed/apply';

// Deterministic test content: 't_' keys and the 'test' config profile, so the live game content is never touched.
// The numbers here exist only to make assertions easy; they are not game balance.

export const TEST_SPECIES = { small: 't_guppy', big: 't_arowana', inactive: 't_ghost' } as const;

const reward = (coins: number) => ({ coins });

export const TEST_CONTENT: ContentSet = {
  config: {
    time: { timezone: 'Asia/Ho_Chi_Minh', resetHour: 0 },
    care: {
      tickMinutes: 60,
      hpMax: 100,
      feedSatietyTicks: 6,
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
      autoCleanItemKey: 't_cleaner',
      autoCleanItemQty: 1,
      autoCleanEffect: 60,
      cleaningLevels: [
        { key: 't_light', coins: 5, dirtReduction: 30 },
        { key: 't_deep', itemKey: 't_cleaner', itemQty: 1, dirtReduction: 100 },
      ],
    },
    value: { rarityMult: { common: 1, uncommon: 1.5, rare: 2, epic: 3, legendary: 5 }, perAgeDay: 1 },
    revive: { hpRatio: 0.3, costBase: { common: 10, uncommon: 20, rare: 40, epic: 80, legendary: 160 }, costPerAgeDay: 1, itemKey: 't_revive' },
    fishing: {
      tripTimeoutSec: 120,
      catchDurabilityLoss: 1,
      fightFailDurabilityLoss: 2,
      incompatibleExtraLoss: 1,
      compatibleTierSpread: 1,
      fightBaseSuccess: 0.5,
      repairCostPerPoint: 3,
    },
    exp: {
      levelThresholds: [100, 300, 600],
      sources: { catch: { exp: 5, dailyCap: 20 }, feed: { exp: 1, dailyCap: 3 }, claim: { exp: 0, dailyCap: null } },
    },
    login: { rewards: [reward(10), reward(20)] },
    quests: { perDay: 2 },
    starter: { coins: 250, fish: [], items: [], gear: [] },
  },
  species: [
    {
      key: 't_guppy', displayName: 'Test Guppy', rarity: 'common', modelKey: 'betta',
      maxWeightGrams: 2000, spawnWeightMinGrams: 100, spawnWeightMaxGrams: 200, spawnAgeMinDays: 1, spawnAgeMaxDays: 3,
      growthGramsPerTick: 50, foodUnitsPerFeed: 1, valuePerKg: 100, buyPrice: 50,
      maturityReward: { coins: 30 }, maturitySaleBonusCoins: 50, maturitySaleBonusPct: 10, active: true, deletedAt: null,
    },
    {
      key: 't_arowana', displayName: 'Test Arowana', rarity: 'epic', modelKey: 'blue-tang',
      maxWeightGrams: 10000, spawnWeightMinGrams: 3000, spawnWeightMaxGrams: 5000, spawnAgeMinDays: 5, spawnAgeMaxDays: 10,
      growthGramsPerTick: 100, foodUnitsPerFeed: 3, valuePerKg: 50, buyPrice: 500,
      maturityReward: { coins: 100 }, maturitySaleBonusCoins: 0, maturitySaleBonusPct: 0, active: true, deletedAt: null,
    },
    {
      key: 't_ghost', displayName: 'Test Ghost', rarity: 'rare', modelKey: 'betta',
      maxWeightGrams: 1000, spawnWeightMinGrams: 100, spawnWeightMaxGrams: 100, spawnAgeMinDays: 1, spawnAgeMaxDays: 1,
      growthGramsPerTick: 10, foodUnitsPerFeed: 1, valuePerKg: 100, buyPrice: 10,
      maturityReward: {}, maturitySaleBonusCoins: 0, maturitySaleBonusPct: 0, active: false, deletedAt: null,
    },
  ],
  items: [
    { key: 't_food1', category: 'food', name: 'Test flakes', stackable: true, price: 2, stats: { satietyMult: 1, hpMult: 1, growthMult: 1 } },
    { key: 't_food2', category: 'food', name: 'Test pellets', stackable: true, price: 10, stats: { satietyMult: 2, hpMult: 2, growthMult: 2 } },
    { key: 't_cleaner', category: 'cleaning', name: 'Test cleaner', stackable: true, price: 20, stats: {} },
    { key: 't_revive', category: 'revive', name: 'Test revive', stackable: true, price: null, shopVisible: false, stats: {} },
    { key: 't_box', category: 'blindbox', name: 'Test box', stackable: true, price: 100, stats: {} },
    { key: 't_bait', category: 'bait', name: 'Test bait', stackable: true, price: 1, stats: {} },
    { key: 't_rod', category: 'rod', name: 'Test rod', stackable: false, price: 100, stats: { tier: 1, maxDurability: 10, maxLoadGrams: 3000 } },
    { key: 't_line', category: 'line', name: 'Test line', stackable: false, price: 50, stats: { tier: 1, maxDurability: 10, maxLoadGrams: 3000 } },
    { key: 't_hook', category: 'hook', name: 'Test hook', stackable: false, price: 20, stats: { tier: 1, maxDurability: 10, maxLoadGrams: 3000 } },
    { key: 't_cooler', category: 'cooler', name: 'Test cooler', stackable: false, price: 80, stats: { tier: 1, maxDurability: 10, capacityGrams: 10000 } },
  ],
  blindbox: [
    { boxKey: 't_box', speciesKey: 't_guppy', weight: 3 },
    { boxKey: 't_box', speciesKey: 't_arowana', weight: 1 },
    { boxKey: 't_box', speciesKey: 't_ghost', weight: 5 },
  ],
  zones: [
    { key: 't_pond', name: 'Test pond', minLevel: 1, unlockCost: 0, missWeight: 0, sortOrder: 900 },
    { key: 't_sea', name: 'Test sea', minLevel: 3, unlockCost: 100, missWeight: 1, sortOrder: 901 },
  ],
  zoneSpecies: [
    { zoneKey: 't_pond', speciesKey: 't_guppy', weight: 1 },
    { zoneKey: 't_sea', speciesKey: 't_arowana', weight: 1 },
  ],
  upgrades: [
    { track: 'tank_capacity', level: 0, cost: 0, minPlayerLevel: 1, value: { maxFish: 3 } },
    { track: 'tank_capacity', level: 1, cost: 100, minPlayerLevel: 1, value: { maxFish: 5 } },
    { track: 'tank_care', level: 0, cost: 0, minPlayerLevel: 1, value: { autoFeed: false, autoClean: false } },
    { track: 'tank_care', level: 1, cost: 50, minPlayerLevel: 1, value: { autoFeed: true, autoClean: true } },
    { track: 'storage_fish', level: 0, cost: 0, minPlayerLevel: 1, value: { maxGrams: 10000 } },
    { track: 'storage_fish', level: 1, cost: 100, minPlayerLevel: 1, value: { maxGrams: 20000 } },
    { track: 'storage_items', level: 0, cost: 0, minPlayerLevel: 1, value: { slots: 5 } },
    { track: 'storage_items', level: 1, cost: 100, minPlayerLevel: 2, value: { slots: 10 } },
  ],
  quests: [
    { key: 't_q_feed', metric: 'fish_fed', target: 2, minLevel: 1, requires: { tankFish: true }, reward: reward(15) },
    { key: 't_q_sell', metric: 'fish_sold', target: 1, minLevel: 1, requires: {}, reward: reward(15) },
    { key: 't_q_high', metric: 'fish_sold', target: 1, minLevel: 9, requires: {}, reward: reward(15) },
  ],
  achievements: [
    { key: 't_a_species', metric: 'species_discovered', threshold: 2, reward: reward(40), sortOrder: 1 },
    { key: 't_a_sold', metric: 'fish_sold', threshold: 3, reward: reward(40), sortOrder: 2 },
  ],
  milestones: [
    { speciesKey: 't_guppy', weightGrams: 1000, reward: { coins: 5, items: [{ itemKey: 't_food1', qty: 2 }] } },
    { speciesKey: 't_guppy', weightGrams: 1500, reward: { coins: 7 } },
    { speciesKey: 't_arowana', weightGrams: 6000, reward: { coins: 20 } },
  ],
};

let seeded: Promise<void> | null = null;

/** Idempotent; safe to call from every test file's beforeAll. */
export function seedTestContent(): Promise<void> {
  return (seeded ??= applyContent(prisma, TEST_CONTENT, 'test'));
}
