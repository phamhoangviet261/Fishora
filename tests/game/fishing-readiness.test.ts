import { fishingBlocker, type ReadinessInput } from '@/lib/game/fishing/readiness';

const ready: ReadinessInput = {
  zone: { unlocked: true, eligibleSpecies: 3, needGrams: 500 },
  rod: { broken: false },
  baitQty: 4,
  container: { capacityGrams: 5000, carriedGrams: 1000 },
};

test('fully equipped on an unlocked map with room: ready', () => {
  expect(fishingBlocker(ready)).toBeNull();
});

test('each missing piece blocks with its own reason, in the order the player fixes them', () => {
  expect(fishingBlocker({ ...ready, zone: null })).toBe('map');
  expect(fishingBlocker({ ...ready, zone: { ...ready.zone!, unlocked: false } })).toBe('map');
  expect(fishingBlocker({ ...ready, rod: null })).toBe('rod');
  expect(fishingBlocker({ ...ready, rod: { broken: true } })).toBe('broken');
  expect(fishingBlocker({ ...ready, container: null })).toBe('container');
  expect(fishingBlocker({ ...ready, baitQty: 0 })).toBe('bait');
  expect(fishingBlocker({ ...ready, zone: { ...ready.zone!, eligibleSpecies: 0 } })).toBe('eligible');
});

test('a container without room for the heaviest catchable fish is full', () => {
  expect(fishingBlocker({ ...ready, container: { capacityGrams: 5000, carriedGrams: 4600 } })).toBe('full');
  expect(fishingBlocker({ ...ready, container: { capacityGrams: 5000, carriedGrams: 4500 } })).toBeNull();
});
