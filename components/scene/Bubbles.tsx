'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/noise';
import { WATER_Y } from '@/lib/tank';
import { waterTime } from '@/lib/underwater';

const COUNT = 140;

/** A column of air bubbles rising from the filter outlet, widening and wobbling as they go. */
export function Bubbles({ x, z, fromY }: { x: number; z: number; fromY: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { geometry, material, seeds } = useMemo(() => {
    const rand = mulberry32(42);
    return {
      geometry: new THREE.SphereGeometry(1, 8, 6),
      material: new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        roughness: 0.05,
        transparent: true,
        opacity: 0.45,
        envMapIntensity: 2,
        depthWrite: false,
      }),
      seeds: Array.from({ length: COUNT }, () => ({ phase: rand(), speed: 0.75 + rand() * 0.5, size: 0.0012 + rand() * 0.0028, a: rand() * 6.28 })),
    };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const m = useMemo(() => new THREE.Matrix4(), []);
  const span = WATER_Y - 0.004 - fromY;
  useFrame(() => {
    const im = mesh.current;
    if (!im) return;
    const t = waterTime.value;
    seeds.forEach((s, i) => {
      const k = (s.phase + (t * 0.22 * s.speed) / span) % 1;
      const y = fromY + k * span;
      const spread = 0.004 + 0.03 * k;
      const wob = Math.sin(t * 6 * s.speed + s.a * 3) * 0.002;
      const r = s.size * (0.7 + 0.6 * k);
      m.makeScale(r, r * 0.85, r).setPosition(x + Math.cos(s.a) * spread * s.phase + wob, y, z + Math.sin(s.a) * spread * 0.5 * s.phase);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, COUNT]} frustumCulled={false} renderOrder={2} />;
}
