import type { ReelParams } from './reel';

// The client's fishing flow as an explicit state machine. Pure and transient: nothing here is persisted; the
// server owns bait, the attempt, the fish and the container. Events that don't fit the current phase are ignored.

export type FishingPhase = 'idle' | 'charging' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'resolving' | 'caught' | 'escaped' | 'nothing';

/** What the server hands back when an attempt starts (no species, rarity or weight: those are revealed on catch). */
export interface AttemptInfo {
  attemptId: string;
  waitMs: number;
  bite: boolean;
  reel: ReelParams | null;
}

export interface CatchCard {
  fishId: string;
  name: string;
  speciesKey: string;
  modelKey: string;
  rarity: string;
  weightGrams: number;
  baseValue: number;
}

export interface FishingState {
  phase: FishingPhase;
  chargeStart: number;
  /** Cosmetic only: how far the line flies. Never sent to the server. */
  power: number;
  landed: boolean;
  attempt: AttemptInfo | null;
  outcome: 'caught' | 'escaped' | null;
  card: CatchCard | null;
  error: string | null;
}

export type FishingEvent =
  | { type: 'press'; at: number }
  | { type: 'release'; power: number }
  | { type: 'attemptStarted'; attempt: AttemptInfo }
  | { type: 'landed' }
  | { type: 'bite' }
  | { type: 'reel' }
  | { type: 'reelDone'; outcome: 'caught' | 'escaped' }
  | { type: 'resolved'; outcome: 'caught' | 'escaped' | 'nothing'; card: CatchCard | null }
  | { type: 'failed'; error: string }
  | { type: 'reset' };

export const initialFishing: FishingState = { phase: 'idle', chargeStart: 0, power: 0, landed: false, attempt: null, outcome: null, card: null, error: null };

export function fishingReducer(s: FishingState, e: FishingEvent): FishingState {
  switch (e.type) {
    case 'press':
      return s.phase === 'idle' ? { ...initialFishing, phase: 'charging', chargeStart: e.at } : s;
    case 'release':
      return s.phase === 'charging' ? { ...s, phase: 'casting', power: Math.min(1, Math.max(0, e.power)) } : s;
    case 'attemptStarted':
      if (s.phase !== 'casting') return s;
      return { ...s, attempt: e.attempt, phase: s.landed ? 'waiting' : 'casting' };
    case 'landed':
      if (s.phase !== 'casting') return s;
      return { ...s, landed: true, phase: s.attempt ? 'waiting' : 'casting' };
    case 'bite':
      return s.phase === 'waiting' ? { ...s, phase: s.attempt?.bite ? 'bite' : 'nothing' } : s;
    case 'reel':
      return s.phase === 'bite' ? { ...s, phase: 'reeling' } : s;
    case 'reelDone':
      return s.phase === 'reeling' ? { ...s, phase: 'resolving', outcome: e.outcome } : s;
    case 'resolved':
      if (s.phase !== 'resolving' && s.phase !== 'nothing') return s;
      return { ...s, phase: e.outcome, outcome: e.outcome === 'nothing' ? null : e.outcome, card: e.card };
    case 'failed':
      return { ...initialFishing, error: e.error };
    case 'reset':
      return initialFishing;
  }
}
