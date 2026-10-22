import { fishingReducer, initialFishing, type FishingState } from '@/lib/game/fishing/machine';

const run = (events: Parameters<typeof fishingReducer>[1][], from: FishingState = initialFishing) => events.reduce(fishingReducer, from);
const attempt = { attemptId: 'a1', waitMs: 2000, bite: true, reel: { seed: 1 } as never };

test('press charges, release casts with the power, landing starts the wait', () => {
  let s = run([{ type: 'press', at: 0 }]);
  expect(s.phase).toBe('charging');
  s = run([{ type: 'release', power: 0.7 }], s);
  expect(s).toMatchObject({ phase: 'casting', power: 0.7 });
  s = run([{ type: 'attemptStarted', attempt }], s);
  expect(s.phase).toBe('casting');
  s = run([{ type: 'landed' }], s);
  expect(s).toMatchObject({ phase: 'waiting', attempt });
});

test('a bite moves to reeling; the reel result ends the attempt', () => {
  const waiting = run([{ type: 'press', at: 0 }, { type: 'release', power: 1 }, { type: 'attemptStarted', attempt }, { type: 'landed' }]);
  const bite = run([{ type: 'bite' }], waiting);
  expect(bite.phase).toBe('bite');
  const reeling = run([{ type: 'reel' }], bite);
  expect(reeling.phase).toBe('reeling');
  expect(run([{ type: 'reelDone', outcome: 'caught' }], reeling).phase).toBe('resolving');
  expect(run([{ type: 'reelDone', outcome: 'escaped' }], reeling).phase).toBe('resolving');
  expect(run([{ type: 'resolved', outcome: 'escaped', card: null }], run([{ type: 'reelDone', outcome: 'escaped' }], reeling)).phase).toBe('escaped');
});

test('no bite: the wait ends in "nothing" without reeling', () => {
  const waiting = run([{ type: 'press', at: 0 }, { type: 'release', power: 0.4 }, { type: 'attemptStarted', attempt: { ...attempt, bite: false } }, { type: 'landed' }]);
  expect(run([{ type: 'bite' }], waiting).phase).toBe('nothing');
});

test('casting power never travels to the server request: the attempt has no distance', () => {
  const s = run([{ type: 'press', at: 0 }, { type: 'release', power: 0.1 }]);
  expect(Object.keys(s.attempt ?? {})).not.toContain('power');
});

test('a failed start returns to idle with the error; events out of order are ignored', () => {
  const s = run([{ type: 'press', at: 0 }, { type: 'release', power: 1 }, { type: 'failed', error: 'no_bait' }]);
  expect(s).toMatchObject({ phase: 'idle', error: 'no_bait' });
  expect(run([{ type: 'reelDone', outcome: 'caught' }]).phase).toBe('idle');
  expect(run([{ type: 'bite' }]).phase).toBe('idle');
});

test('reset after a result goes back to idle and clears the attempt', () => {
  const done = run([{ type: 'press', at: 0 }, { type: 'release', power: 1 }, { type: 'attemptStarted', attempt }, { type: 'landed' }, { type: 'bite' }, { type: 'reel' }, { type: 'reelDone', outcome: 'caught' }, { type: 'resolved', outcome: 'caught', card: { fishId: 'f' } as never }]);
  expect(done.phase).toBe('caught');
  expect(run([{ type: 'reset' }], done)).toEqual(initialFishing);
});
