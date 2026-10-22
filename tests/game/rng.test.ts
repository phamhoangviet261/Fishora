import { pickWeighted, seededRng, shuffle } from '@/lib/game/rng';

test('pickWeighted follows the weights', () => {
  const rng = seededRng(1);
  let heavy = 0;
  for (let i = 0; i < 10_000; i++) if (pickWeighted([{ value: 'a', weight: 1 }, { value: 'b', weight: 3 }], rng) === 'b') heavy++;
  expect(heavy / 10_000).toBeGreaterThan(0.72);
  expect(heavy / 10_000).toBeLessThan(0.78);
});

test('weight 0 is never picked', () => {
  const rng = seededRng(2);
  for (let i = 0; i < 1000; i++) expect(pickWeighted([{ value: 'x', weight: 0 }, { value: 'y', weight: 1 }], rng)).toBe('y');
});

test('seededRng is deterministic and shuffle keeps every element', () => {
  expect(shuffle([1, 2, 3, 4, 5], seededRng(9))).toEqual(shuffle([1, 2, 3, 4, 5], seededRng(9)));
  expect([...shuffle([1, 2, 3, 4, 5], seededRng(9))].sort()).toEqual([1, 2, 3, 4, 5]);
});

test('cryptoRng stays in [0, 1)', async () => {
  const { cryptoRng } = await import('@/lib/game/rng');
  for (let i = 0; i < 1000; i++) {
    const r = cryptoRng();
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  }
});
