'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { woodTexture } from '@/lib/textures';

const CW = 1.3; // cabinet width
const CD = 0.5;
const TOP = 0.8;
const SLAB = 0.028;
const FRONT = CD / 2 - 0.02;

/** Walnut shaker-style cabinet with two doors and brass pulls. */
export function Cabinet() {
  const m = useMemo(() => {
    const across = woodTexture([0.2, 0.12, 0.07], [0.42, 0.27, 0.16], 2);
    const upright = across.clone();
    upright.center.set(0.5, 0.5);
    upright.rotation = Math.PI / 2;
    upright.needsUpdate = true;
    return {
      across,
      upright,
      woodH: new THREE.MeshStandardMaterial({ map: across, roughness: 0.52 }),
      woodV: new THREE.MeshStandardMaterial({ map: upright, roughness: 0.52 }),
      shadow: new THREE.MeshStandardMaterial({ color: '#120c08', roughness: 1 }),
      brass: new THREE.MeshStandardMaterial({ color: '#b48d55', metalness: 1, roughness: 0.32 }),
    };
  }, []);

  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);

  const doorW = (CW - 0.06) / 2 - 0.004;
  const doorH = TOP - SLAB - 0.11;
  const doorY = 0.06 + doorH / 2 + 0.012;
  const rail = 0.06;

  const door = (side: number) => {
    const x = side * (doorW / 2 + 0.004);
    const z = FRONT + 0.01;
    return (
      <group key={side} position={[x, doorY, z]}>
        <mesh material={m.woodV} castShadow receiveShadow>
          <boxGeometry args={[doorW, doorH, 0.018]} />
        </mesh>
        {/* raised frame: stiles and rails */}
        {[-1, 1].map((s) => (
          <mesh key={`st${s}`} material={m.woodV} position={[s * (doorW / 2 - rail / 2), 0, 0.011]} receiveShadow>
            <boxGeometry args={[rail, doorH, 0.006]} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={`rl${s}`} material={m.woodH} position={[0, s * (doorH / 2 - rail / 2), 0.011]} receiveShadow>
            <boxGeometry args={[doorW - 2 * rail, rail, 0.006]} />
          </mesh>
        ))}
        {/* brass pull near the centre gap */}
        <mesh material={m.brass} position={[-side * (doorW / 2 - 0.035), 0.08, 0.026]}>
          <cylinderGeometry args={[0.005, 0.005, 0.12, 10]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={`pb${s}`} material={m.brass} position={[-side * (doorW / 2 - 0.035), 0.08 + s * 0.05, 0.018]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.004, 0.004, 0.018, 8]} />
          </mesh>
        ))}
      </group>
    );
  };

  return (
    <group>
      {/* top slab, slightly overhanging */}
      <mesh material={m.woodH} position={[0, TOP - SLAB / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[CW + 0.02, SLAB, CD + 0.02]} />
      </mesh>
      {/* carcass */}
      <mesh material={m.woodH} position={[0, (TOP - SLAB + 0.05) / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[CW, TOP - SLAB - 0.05, CD - 0.04]} />
      </mesh>
      {/* recessed plinth */}
      <mesh material={m.shadow} position={[0, 0.025, -0.02]}>
        <boxGeometry args={[CW - 0.06, 0.05, CD - 0.1]} />
      </mesh>
      {door(-1)}
      {door(1)}
      {/* faint gap shadow between doors */}
      <mesh material={m.shadow} position={[0, doorY, FRONT + 0.001]}>
        <boxGeometry args={[0.008, doorH, 0.004]} />
      </mesh>
    </group>
  );
}
