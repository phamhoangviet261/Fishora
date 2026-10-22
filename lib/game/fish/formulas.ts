import { RELEASE_RATIO, SELL_RATIO } from '../rules';
import type { Rarity, ReviveConfig, ValueConfig } from '../types';

// Pure fish rules. The shapes of the TBD formulas (spec §15) are linear and config-scaled; only the
// coefficients are balance decisions.

/** Fixed at creation and never recomputed (spec §3.2). */
export function computeBaseValue(i: { rarity: Rarity; weightGrams: number; ageDays: number; valuePerKg: number }, cfg: ValueConfig): number {
  return Math.max(1, Math.round(cfg.rarityMult[i.rarity] * ((i.valuePerKg * i.weightGrams) / 1000 + cfg.perAgeDay * i.ageDays)));
}

/** Maturity is a state, recomputed against the species' current max (spec §6.3). */
export const isMature = (weightGrams: number, maxWeightGrams: number) => weightGrams >= maxWeightGrams;

export const reviveCoinCost = (rarity: Rarity, ageDays: number, cfg: Pick<ReviveConfig, 'costBase' | 'costPerAgeDay'>) =>
  Math.round(cfg.costBase[rarity] + cfg.costPerAgeDay * ageDays);

export const revivedHp = (hpMax: number, hpRatio: number) => Math.max(1, Math.floor(hpMax * hpRatio));

export interface SaleInput {
  baseValue: number;
  weightGrams: number;
  maturitySaleBonusCoins: number | null;
  maturitySaleBonusPct: number | null;
}

/**
 * Sell = 100% of base value, plus the bonus snapshotted at first maturity if the fish is mature right now.
 * Release = 25% of base value, never a bonus (spec §9.1).
 */
export function saleAmount(f: SaleInput, maxWeightGrams: number, mode: 'sell' | 'release'): { coins: number; maturityBonus: number } {
  if (mode === 'release') return { coins: Math.floor(f.baseValue * RELEASE_RATIO), maturityBonus: 0 };
  const base = Math.floor(f.baseValue * SELL_RATIO);
  const hasBonus = isMature(f.weightGrams, maxWeightGrams) && f.maturitySaleBonusCoins !== null && f.maturitySaleBonusPct !== null;
  const maturityBonus = hasBonus ? f.maturitySaleBonusCoins! + Math.floor((f.baseValue * f.maturitySaleBonusPct!) / 100) : 0;
  return { coins: base + maturityBonus, maturityBonus };
}

export interface MilestoneRow {
  id: string;
  speciesKey: string | null;
  weightGrams: number;
  reward: unknown;
  deletedAt: Date | null;
}

/** A species' own live milestones if it has any, else the live default set (spec §6.2). */
export function applicableMilestones<M extends MilestoneRow>(all: M[], speciesKey: string): M[] {
  const live = all.filter((m) => m.deletedAt === null);
  const own = live.filter((m) => m.speciesKey === speciesKey);
  return (own.length ? own : live.filter((m) => m.speciesKey === null)).sort((a, b) => a.weightGrams - b.weightGrams);
}

/** Milestones at or below the peak weight not yet reached; independent of order (spec §6.1). */
export function newlyReached<M extends MilestoneRow>(peakGrams: number, applicable: M[], alreadyReachedWeights: Set<number>): M[] {
  return applicable.filter((m) => m.weightGrams <= peakGrams && !alreadyReachedWeights.has(m.weightGrams));
}
