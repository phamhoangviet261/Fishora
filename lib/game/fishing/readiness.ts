// Can the player cast right now? The same rules the server enforces on startAttempt, checked up front so the UI can
// say why before any bait is spent. The server stays the authority.

export interface ReadinessInput {
  zone: { unlocked: boolean; eligibleSpecies: number; needGrams: number } | null;
  rod: { broken: boolean } | null;
  baitQty: number;
  container: { capacityGrams: number; carriedGrams: number } | null;
}

export type FishingBlocker = 'map' | 'rod' | 'broken' | 'container' | 'bait' | 'eligible' | 'full';

export function fishingBlocker(i: ReadinessInput): FishingBlocker | null {
  if (!i.zone?.unlocked) return 'map';
  if (!i.rod) return 'rod';
  if (i.rod.broken) return 'broken';
  if (!i.container) return 'container';
  if (i.baitQty < 1) return 'bait';
  if (i.zone.eligibleSpecies === 0) return 'eligible';
  if (i.container.capacityGrams - i.container.carriedGrams < i.zone.needGrams) return 'full';
  return null;
}
