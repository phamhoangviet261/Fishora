import { shuffle, type Rng } from '../rng';
import { nextDayBoundary } from '../tx';
import type { CareConfig, FoodStats, TimeConfig } from '../types';

// The offline tank engine (spec §4, §11). Pure: state in, state out, no I/O. advanceWorld feeds it the
// player's tank and persists the result; manual feeding reuses feedFish.

export interface SimFish {
  id: string;
  hp: number;
  weightGrams: number;
  satietyTicks: number;
  growthMult: number;
  ageDays: number;
  daysInTank: number;
  species: { maxWeightGrams: number; growthGramsPerTick: number; foodUnitsPerFeed: number };
}

export interface SimInput {
  from: Date;
  ticks: number;
  dirt: number;
  fish: SimFish[];
  autoFeed: { itemKey: string; stats: FoodStats; main: number; reserve: number } | null;
  autoClean: { items: number } | null;
  time: TimeConfig;
}

export interface SimEvent {
  type: 'died' | 'auto_feed_empty' | 'auto_clean' | 'auto_clean_skipped';
  fishId?: string;
  at: Date;
}

export interface SimOutput {
  dirt: number;
  fish: SimFish[];
  died: { id: string; at: Date }[];
  /** Heaviest weight each fish reached (its start weight included), for milestones and maturity. */
  peaks: Record<string, { grams: number; at: Date }>;
  used: { main: number; reserve: number; cleanItems: number };
  events: SimEvent[];
  lastAutoCleanAt: Date | null;
}

/** Feeds the given fish in random order, main stock first then reserve, stopping at the first fish that can't be
 *  fully fed (spec §4.2, §4.3). Mutates the fed fish. */
export function feedFish(
  fish: SimFish[],
  stats: FoodStats,
  units: { main: number; reserve: number },
  care: CareConfig,
  rng: Rng,
): { fedIds: string[]; used: { main: number; reserve: number } } {
  let { main, reserve } = units;
  const used = { main: 0, reserve: 0 };
  const fedIds: string[] = [];
  for (const f of shuffle(fish, rng)) {
    const need = f.species.foodUnitsPerFeed;
    if (main + reserve < need) break;
    const fromMain = Math.min(main, need);
    main -= fromMain;
    reserve -= need - fromMain;
    used.main += fromMain;
    used.reserve += need - fromMain;
    f.satietyTicks = Math.max(f.satietyTicks, Math.round(care.feedSatietyTicks * stats.satietyMult));
    f.hp = Math.min(care.hpMax, f.hp + Math.round(care.hpPerFeed * stats.hpMult));
    f.growthMult = stats.growthMult;
    fedIds.push(f.id);
  }
  return { fedIds, used };
}

export function simulate(input: SimInput, care: CareConfig, rng: Rng): SimOutput {
  const tickMs = care.tickMinutes * 60_000;
  const fish = input.fish.map((f) => ({ ...f, species: f.species }));
  const out: SimOutput = { dirt: input.dirt, fish, died: [], peaks: {}, used: { main: 0, reserve: 0, cleanItems: 0 }, events: [], lastAutoCleanAt: null };
  for (const f of fish) out.peaks[f.id] = { grams: f.weightGrams, at: input.from };

  const thresholds = [...care.dirtThresholds].sort((a, b) => a.at - b.at);
  const { timezone, resetHour } = input.time;
  let boundary = nextDayBoundary(input.from, timezone, resetHour).getTime();
  let dirt = input.dirt;

  for (let k = 0; k < input.ticks; k++) {
    const endMs = input.from.getTime() + (k + 1) * tickMs;
    const at = new Date(endMs);
    const alive = fish.filter((f) => f.hp > 0);

    if (alive.length > 0) {
      if (input.autoFeed) {
        const hungry = alive.filter((f) => f.satietyTicks === 0);
        if (hungry.length > 0) {
          const left = { main: input.autoFeed.main - out.used.main, reserve: input.autoFeed.reserve - out.used.reserve };
          const r = feedFish(hungry, input.autoFeed.stats, left, care, rng);
          out.used.main += r.used.main;
          out.used.reserve += r.used.reserve;
          if (r.fedIds.length < hungry.length) out.events.push({ type: 'auto_feed_empty', at });
        }
      }

      let threshold: (typeof thresholds)[number] | undefined;
      for (const t of thresholds) if (dirt >= t.at) threshold = t;

      for (const f of alive) {
        const g = f.species.growthGramsPerTick;
        if (f.satietyTicks > 0) {
          f.satietyTicks--;
          if (!threshold) f.weightGrams += Math.round(g * f.growthMult);
        } else {
          f.hp -= care.hungerHpLossPerTick;
          f.weightGrams -= Math.round(g * care.hungerWeightLossRatio);
        }
        if (threshold) {
          f.hp -= threshold.hpLossPerTick;
          f.weightGrams -= Math.round(g * threshold.weightLossRatio);
        }
        f.weightGrams = Math.min(f.species.maxWeightGrams, Math.max(1, f.weightGrams));
        f.hp = Math.min(care.hpMax, Math.max(0, f.hp));
        if (f.weightGrams > out.peaks[f.id].grams) out.peaks[f.id] = { grams: f.weightGrams, at };
        if (f.hp === 0) {
          out.died.push({ id: f.id, at });
          out.events.push({ type: 'died', fishId: f.id, at });
        }
      }

      dirt = Math.min(care.dirtMax, dirt + care.dirtBasePerTick + care.dirtPerFishPerTick * alive.length);
    }

    let dailyDue = false;
    if (endMs >= boundary) {
      dailyDue = true;
      for (const f of fish) {
        if (f.hp > 0) {
          f.ageDays++;
          f.daysInTank++;
        }
      }
      boundary = nextDayBoundary(at, timezone, resetHour).getTime();
    }

    // One auto-clean per tick at most: a scheduled run and an early trigger in the same tick collapse (spec §4.4).
    if (input.autoClean && dirt > 0 && (dailyDue || dirt >= care.autoCleanEarlyAt)) {
      if (input.autoClean.items - out.used.cleanItems >= care.autoCleanItemQty) {
        out.used.cleanItems += care.autoCleanItemQty;
        dirt = Math.max(0, dirt - care.autoCleanEffect);
        out.lastAutoCleanAt = at;
        out.events.push({ type: 'auto_clean', at });
      } else {
        out.events.push({ type: 'auto_clean_skipped', at });
      }
    }
  }

  out.dirt = dirt;
  return out;
}
