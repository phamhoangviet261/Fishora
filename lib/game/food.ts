import * as THREE from 'three';
import { INNER, WATER_Y } from '@/lib/tank';

export interface Pellet {
  pos: THREE.Vector3;
  /** Seconds since it hit the water. */
  age: number;
  /** Random phase for the sinking wobble. */
  seed: number;
  resting: boolean;
}

export const MAX_PELLETS = 48;
export const PELLET_LIFETIME = 45;

/** Live food in the tank, shared between the pellet renderer and the fish. */
export const pellets: Pellet[] = [];

/** Sprinkle a pinch of food near a random spot on the surface. */
export function dropFood(count = 8) {
  const cx = THREE.MathUtils.randFloat(INNER.xMin * 0.6, INNER.xMax * 0.6);
  const cz = THREE.MathUtils.randFloat(INNER.zMin * 0.5, INNER.zMax * 0.5);
  for (let i = 0; i < count; i++) {
    if (pellets.length >= MAX_PELLETS) pellets.shift();
    pellets.push({
      pos: new THREE.Vector3(cx + THREE.MathUtils.randFloatSpread(0.08), WATER_Y + 0.12 + Math.random() * 0.06, cz + THREE.MathUtils.randFloatSpread(0.06)),
      age: -Math.random() * 0.4, // staggered so they don't land as one clump
      seed: Math.random() * Math.PI * 2,
      resting: false,
    });
  }
}

export function eatPellet(p: Pellet) {
  const i = pellets.indexOf(p);
  if (i >= 0) pellets.splice(i, 1);
}

/** Nearest pellet that is already in the water, or null. */
export function nearestPellet(from: THREE.Vector3, maxDist = Infinity): Pellet | null {
  let best: Pellet | null = null;
  let bestD = maxDist * maxDist;
  for (const p of pellets) {
    if (p.pos.y > WATER_Y) continue;
    const d = p.pos.distanceToSquared(from);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
