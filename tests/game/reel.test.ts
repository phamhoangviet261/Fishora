import { initReel, reelParams, replayReel, stepReel, type ReelParams } from '@/lib/game/fishing/reel';
import { seededRng } from '@/lib/game/rng';
import { TEST_CONTENT } from '../fixtures/content';

const reel = TEST_CONTENT.config.fishing.reel;
const rod = { tier: 1, maxDurability: 10, maxRarity: 'epic' as const, catchMult: 1, stability: 0 };

/** Plays a whole reel with a cursor policy, the way the client does, returning the recorded inputs. */
function play(p: ReelParams, cursor: (center: number, tick: number) => number | null) {
  const rng = seededRng(p.seed);
  let s = initReel(p, rng);
  const inputs: (number | null)[] = [];
  while (!s.done) {
    const x = cursor(s.center, s.tick);
    inputs.push(x);
    s = stepReel(s, p, rng, x);
  }
  return { inputs, final: s };
}

test('following the target fills progress to 100% and the fish is caught', () => {
  const p = reelParams('common', rod, reel, 42);
  const { inputs, final } = play(p, (c) => c);
  expect(final.done).toBe('caught');
  expect(final.progress).toBe(1);
  expect(replayReel(p, inputs)).toMatchObject({ outcome: 'caught' });
});

test('being outside the target lowers progress and patience; patience 0 means escape', () => {
  const p = reelParams('common', rod, reel, 42);
  const rng = seededRng(p.seed);
  const s0 = initReel(p, rng);
  const s1 = stepReel(s0, p, rng, s0.center > 0.5 ? 0 : 1);
  expect(s1.progress).toBeLessThan(s0.progress);
  expect(s1.patience).toBeLessThan(s0.patience);
  const { final } = play(p, () => null);
  expect(final.done).toBe('escaped');
  expect(final.patience).toBe(0);
});

test('replay is deterministic: same seed and inputs, same result as the live run', () => {
  const p = reelParams('rare', rod, reel, 7);
  const wobble = (c: number, t: number) => (t % 9 < 6 ? c : c + 0.3);
  const live = play(p, wobble);
  expect(replayReel(p, live.inputs)).toEqual({ outcome: live.final.done, ticks: live.inputs.length, progress: live.final.progress, patience: live.final.patience });
});

test('a forged "success" without matching inputs is not a catch', () => {
  const p = reelParams('legendary', rod, reel, 3);
  expect(replayReel(p, Array(50).fill(0.5)).outcome).not.toBe('caught');
  expect(replayReel(p, []).outcome).toBe('incomplete');
});

test('higher rarity moves faster and changes direction more often', () => {
  const c = reelParams('common', rod, reel, 1);
  const l = reelParams('legendary', rod, reel, 1);
  expect(l.speed).toBeGreaterThan(c.speed);
  expect(l.erratic).toBeGreaterThan(c.erratic);
});

test('rod stats: catch multiplier speeds progress, stability calms the fish', () => {
  const base = reelParams('epic', rod, reel, 1);
  const good = reelParams('epic', { ...rod, catchMult: 1.5, stability: 0.4 }, reel, 1);
  expect(good.gain).toBeCloseTo(base.gain * 1.5);
  expect(good.speed).toBeCloseTo(base.speed * 0.6);
  expect(good.erratic).toBeCloseTo(base.erratic * 0.6);
});

test('the target stays inside the bar', () => {
  const p = reelParams('legendary', rod, reel, 99);
  const { inputs } = play(p, (c) => c);
  const rng = seededRng(p.seed);
  let s = initReel(p, rng);
  for (const x of inputs) {
    expect(s.center).toBeGreaterThanOrEqual(p.targetWidth / 2);
    expect(s.center).toBeLessThanOrEqual(1 - p.targetWidth / 2);
    s = stepReel(s, p, rng, x);
  }
});

test('running past the tick limit is an escape', () => {
  const p = { ...reelParams('common', rod, reel, 5), gain: 0, loss: 0, patienceLoss: 0 };
  const { final, inputs } = play(p, (c) => c);
  expect(final.done).toBe('escaped');
  expect(inputs.length).toBe(p.maxTicks);
});
