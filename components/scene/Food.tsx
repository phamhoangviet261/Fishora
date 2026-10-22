'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MAX_PELLETS, PELLET_LIFETIME, pellets } from '@/lib/game/food';
import { WATER_Y, substrateHeight } from '@/lib/tank';
import { applyUnderwater, waterTime } from '@/lib/underwater';

const GRAVITY_AIR = 1.6;
const SINK_SPEED = 0.035;
const FLOAT_TIME = 1.2;

/** Food pellets: drop onto the surface, float briefly, then wobble down and settle on the substrate. */
export function Food() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { geometry, material } = useMemo(
    () => ({
      geometry: new THREE.SphereGeometry(0.0055, 8, 6),
      material: applyUnderwater(new THREE.MeshStandardMaterial({ color: '#c8742f', roughness: 0.8 }), { caustics: 0.3, glow: 0.1 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const state = useMemo(() => ({ lastT: waterTime.value, m: new THREE.Matrix4(), fall: new WeakMap<object, number>() }), []);

  useFrame(() => {
    const dt = Math.min(Math.max(waterTime.value - state.lastT, 0), 0.1);
    state.lastT = waterTime.value;
    const im = mesh.current;
    if (!im) return;

    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i];
      p.age += dt;
      if (p.age < 0) continue;
      if (p.age > PELLET_LIFETIME) {
        pellets.splice(i, 1);
        continue;
      }
      if (p.pos.y > WATER_Y) {
        // Falling through the air.
        const v = (state.fall.get(p) ?? 0) + GRAVITY_AIR * dt;
        state.fall.set(p, v);
        p.pos.y = Math.max(WATER_Y, p.pos.y - v * dt);
        if (p.pos.y === WATER_Y) p.age = 0;
      } else if (!p.resting && p.age > FLOAT_TIME) {
        const t = waterTime.value + p.seed;
        p.pos.y -= SINK_SPEED * dt;
        p.pos.x += Math.sin(t * 1.7) * 0.006 * dt;
        p.pos.z += Math.cos(t * 1.3) * 0.004 * dt;
        const floor = substrateHeight(p.pos.x, p.pos.z) + 0.005;
        if (p.pos.y <= floor) {
          p.pos.y = floor;
          p.resting = true;
        }
      }
    }

    let n = 0;
    for (const p of pellets) {
      if (p.age < 0 || n >= MAX_PELLETS) continue;
      im.setMatrixAt(n++, state.m.makeTranslation(p.pos.x, p.pos.y, p.pos.z));
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, MAX_PELLETS]} frustumCulled={false} castShadow />;
}
