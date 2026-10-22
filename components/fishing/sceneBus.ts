import type { FishingPhase } from '@/lib/game/fishing/machine';

/**
 * What the 3D scene needs to animate, written by the gameplay layer and read every frame by the scene. A plain
 * mutable object (not React state) so a 60 fps animation never re-renders the UI. Purely presentational.
 */
export interface SceneBus {
  phase: FishingPhase;
  /** Charge 0..1 while charging; the cast power afterwards (cosmetic: how far the bobber flies). */
  power: number;
  /** performance.now() of the release. */
  castAt: number;
  /** Reel target centre 0..1 (the fish pulling left/right). */
  center: number;
  /** Catch progress 0..1 (line tension). */
  progress: number;
  /** performance.now() of the bite / of the landed catch. */
  biteAt: number;
  caughtAt: number;
  /** Model of the caught fish for the shared catch animation. */
  catchModelKey: string | null;
}

export const newSceneBus = (): SceneBus => ({ phase: 'idle', power: 0, castAt: 0, center: 0.5, progress: 0, biteAt: 0, caughtAt: 0, catchModelKey: null });

/** How long the bobber flies after release, ms (shared by the scene and the "landed" timer). */
export const CAST_FLIGHT_MS = 700;
/** The shared catch animation's length, ms, before the card appears. */
export const CATCH_ANIM_MS = 1400;
