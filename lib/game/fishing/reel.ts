import { seededRng, type Rng } from '../prng';
import type { GearStats, Rarity, ReelConfig } from '../types';

// The reeling minigame as a pure fixed-tick simulation. The client runs it live (one step per tick, feeding the
// cursor position) and records its inputs; the server replays the same seed and inputs to decide the outcome, so a
// client can't simply claim a catch. Every step consumes the same number of random draws, whatever the input, so
// both sides stay in lockstep.

export interface ReelParams {
  seed: number;
  tickMs: number;
  maxTicks: number;
  /** Target speed, bar fraction per tick. */
  speed: number;
  /** Chance per tick of a sudden direction/speed change. */
  erratic: number;
  targetWidth: number;
  gain: number;
  loss: number;
  patienceLoss: number;
  startProgress: number;
}

export interface ReelState {
  tick: number;
  /** Target centre, 0..1 across the bar. */
  center: number;
  dir: -1 | 1;
  speedNow: number;
  progress: number;
  patience: number;
  done: null | 'caught' | 'escaped';
}

/** Difficulty from the fish's rarity, softened by the rod; progress gain from the rod. */
export function reelParams(rarity: Rarity, rod: Pick<GearStats, 'catchMult' | 'stability'>, cfg: ReelConfig, seed: number): ReelParams {
  const calm = 1 - Math.min(0.9, Math.max(0, rod.stability ?? 0));
  const d = cfg.byRarity[rarity];
  return {
    seed,
    tickMs: cfg.tickMs,
    maxTicks: cfg.maxTicks,
    speed: d.speed * calm,
    erratic: d.erratic * calm,
    targetWidth: cfg.targetWidth,
    gain: cfg.progressGain * (rod.catchMult ?? 1),
    loss: cfg.progressLoss,
    patienceLoss: cfg.patienceLoss,
    startProgress: cfg.startProgress,
  };
}

export function initReel(p: ReelParams, rng: Rng): ReelState {
  return { tick: 0, center: 0.5, dir: rng() < 0.5 ? -1 : 1, speedNow: p.speed, progress: p.startProgress, patience: 1, done: null };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** One tick. `input` is the cursor's position across the bar (0..1) while the button is held, else null. */
export function stepReel(s: ReelState, p: ReelParams, rng: Rng, input: number | null): ReelState {
  if (s.done) return s;
  const r1 = rng();
  const r2 = rng();
  const r3 = rng();
  let { dir, speedNow, center } = s;
  if (r1 < p.erratic) {
    dir = r2 < 0.5 ? -1 : 1;
    speedNow = p.speed * (0.5 + r3);
  }
  const half = p.targetWidth / 2;
  center += dir * speedNow;
  if (center < half) {
    center = 2 * half - center;
    dir = 1;
  } else if (center > 1 - half) {
    center = 2 * (1 - half) - center;
    dir = -1;
  }
  center = Math.min(1 - half, Math.max(half, center));

  const inside = input !== null && Math.abs(input - center) <= half;
  const progress = clamp01(inside ? s.progress + p.gain : s.progress - p.loss);
  const patience = clamp01(inside ? s.patience : s.patience - p.patienceLoss);
  const tick = s.tick + 1;
  const done = progress >= 1 ? 'caught' : patience <= 0 || tick >= p.maxTicks ? 'escaped' : null;
  return { tick, center, dir, speedNow, progress, patience, done };
}

/** Rounds a cursor position the way the client sends it, so live play and replay see identical numbers. */
export const quantize = (x: number | null) => (x === null ? null : Math.round(clamp01(x) * 1000) / 1000);

/** The server's verdict on a recorded reel. Inputs after the end are ignored; too few is "incomplete". */
export function replayReel(p: ReelParams, inputs: (number | null)[]) {
  const rng = seededRng(p.seed);
  let s = initReel(p, rng);
  for (const x of inputs) {
    if (s.done) break;
    s = stepReel(s, p, rng, quantize(x));
  }
  return { outcome: (s.done ?? 'incomplete') as 'caught' | 'escaped' | 'incomplete', ticks: s.tick, progress: s.progress, patience: s.patience };
}
