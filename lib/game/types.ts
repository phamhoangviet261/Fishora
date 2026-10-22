import type { Rarity } from '@prisma/client';

export type { Rarity };
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const rarityRank = (r: Rarity) => RARITIES.indexOf(r);

/** Reward package: coins, EXP and any number of items, each claimed independently (spec §6.1). */
export interface RewardBundle {
  coins?: number;
  exp?: number;
  items?: { itemKey: string; qty: number }[];
}

// ---------------------------------------------------------------- config sections (game_config rows, one per key)

export interface TimeConfig {
  timezone: string;
  resetHour: number;
}

export interface DirtThreshold {
  at: number;
  hpLossPerTick: number;
  weightLossRatio: number;
}

export interface CleaningLevel {
  key: string;
  coins?: number;
  itemKey?: string;
  itemQty?: number;
  dirtReduction: number;
}

export interface CareConfig {
  tickMinutes: number;
  hpMax: number;
  feedSatietyTicks: number;
  hpPerFeed: number;
  hungerHpLossPerTick: number;
  hungerWeightLossRatio: number;
  dirtBasePerTick: number;
  dirtPerFishPerTick: number;
  dirtMax: number;
  dirtThresholds: DirtThreshold[];
  autoCleanEarlyAt: number;
  autoCleanItemKey: string;
  autoCleanItemQty: number;
  autoCleanEffect: number;
  cleaningLevels: CleaningLevel[];
}

export interface ValueConfig {
  rarityMult: Record<Rarity, number>;
  perAgeDay: number;
}

export interface ReviveConfig {
  hpRatio: number;
  costBase: Record<Rarity, number>;
  costPerAgeDay: number;
  itemKey: string;
}

/** Reeling minigame tuning (fixed-tick simulation shared by client and server). */
export interface ReelConfig {
  tickMs: number;
  maxTicks: number;
  startProgress: number;
  /** Width of the patience target as a fraction of the bar. */
  targetWidth: number;
  progressGain: number;
  progressLoss: number;
  patienceLoss: number;
  /** Random wait before the bite, ms. */
  waitMs: [number, number];
  /** An attempt not resolved within this many seconds is cancelled. */
  attemptTtlSec: number;
  /** Target speed (bar fraction per tick) and chance per tick of a sudden change, by rarity. */
  byRarity: Record<Rarity, { speed: number; erratic: number }>;
}

export interface FishingConfig {
  reel: ReelConfig;
  tripTimeoutSec: number;
  catchDurabilityLoss: number;
  fightFailDurabilityLoss: number;
  incompatibleExtraLoss: number;
  compatibleTierSpread: number;
  fightBaseSuccess: number;
  repairCostPerPoint: number;
}

export interface ExpConfig {
  /** Cumulative EXP needed for level 2, 3, … */
  levelThresholds: number[];
  sources: Record<string, { exp: number; dailyCap: number | null }>;
}

export interface StarterConfig {
  coins: number;
  fish: string[];
  items: { itemKey: string; qty: number }[];
  gear: string[];
}

export interface GameConfig {
  time: TimeConfig;
  care: CareConfig;
  value: ValueConfig;
  revive: ReviveConfig;
  fishing: FishingConfig;
  exp: ExpConfig;
  login: { rewards: RewardBundle[] };
  quests: { perDay: number };
  starter: StarterConfig;
}

export const CONFIG_SECTIONS = ['time', 'care', 'value', 'revive', 'fishing', 'exp', 'login', 'quests', 'starter'] as const satisfies readonly (keyof GameConfig)[];

// ---------------------------------------------------------------- item stats (item_defs.stats by category)

export interface FoodStats {
  satietyMult: number;
  hpMult: number;
  growthMult: number;
}

export interface GearStats {
  tier: number;
  maxDurability: number;
  /** rod: the rarest fish it can land. */
  maxRarity?: Rarity;
  /** rod: multiplies catch progress gained per tick on target. */
  catchMult?: number;
  /** rod: 0..1, calms the fish (reduces target speed and sudden changes). */
  stability?: number;
  /** rod / line / hook */
  maxLoadGrams?: number;
  /** cooler */
  capacityGrams?: number;
}

export interface BaitStats {
  speciesMult?: Record<string, number>;
}

export const GEAR_CATEGORIES = ['rod', 'line', 'hook', 'cooler'] as const;
export type GearCategory = (typeof GEAR_CATEGORIES)[number];
export const isGearCategory = (c: string): c is GearCategory => (GEAR_CATEGORIES as readonly string[]).includes(c);
