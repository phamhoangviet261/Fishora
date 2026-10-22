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
  /** Look-around offsets from the default view (Ctrl + drag), radians. */
  viewYaw: number;
  viewPitch: number;
  /** The view's yaw when the line was cast: the bobber lands in that direction. */
  castYaw: number;
}

export const newSceneBus = (): SceneBus => ({
  phase: 'idle',
  power: 0,
  castAt: 0,
  center: 0.5,
  progress: 0,
  biteAt: 0,
  caughtAt: 0,
  catchModelKey: null,
  viewYaw: 0,
  viewPitch: 0,
  castYaw: 0,
});

/** How far the view may tilt up/down from level, radians. */
export const MAX_PITCH = 0.6;

/** How long the bobber flies after release, ms (shared by the scene and the "landed" timer). */
export const CAST_FLIGHT_MS = 700;
/** The shared catch animation's length, ms, before the card appears. */
export const CATCH_ANIM_MS = 1400;
