'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildAquascape, disposeAquascape } from '@/lib/aquascape';
import { gravelTexture, woodTexture } from '@/lib/textures';
import { applyUnderwater } from '@/lib/underwater';
import { Instances } from './Instances';
import { SuspendedParticles } from './SuspendedParticles';

/** Everything inside the water: substrate, rocks, driftwood, moss and plants. */
export function Aquascape() {
  const scape = useMemo(() => buildAquascape(), []);

  const materials = useMemo(() => {
    const sand = gravelTexture();
    const drift = woodTexture([0.12, 0.08, 0.05], [0.42, 0.3, 0.2], 5, 512, 128);
    drift.repeat.set(4, 1);
    return {
      sand,
      drift,
      substrate: applyUnderwater(
        new THREE.MeshStandardMaterial({ map: sand, bumpMap: sand, bumpScale: 2.2, vertexColors: true, roughness: 0.9 }),
        { caustics: 1.15 },
      ),
      rock: applyUnderwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { caustics: 0.9 }),
      wood: applyUnderwater(new THREE.MeshStandardMaterial({ map: drift, bumpMap: drift, bumpScale: 3, roughness: 0.85 }), { caustics: 0.8 }),
      plant: applyUnderwater(
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide }),
        { caustics: 0.55, sway: 0.09, glow: 0.12 },
      ),
      moss: applyUnderwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { caustics: 0.6, glow: 0.15 }),
      pebble: applyUnderwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), { caustics: 1.0 }),
    };
  }, []);

  useEffect(
    () => () => {
      disposeAquascape(scape);
      Object.values(materials).forEach((m) => m.dispose());
    },
    [scape, materials],
  );

  const g = scape.geometries;
  return (
    <group>
      <mesh geometry={scape.substrate} material={materials.substrate} receiveShadow />
      {scape.rocks.map((rock, i) => (
        <mesh
          key={i}
          geometry={rock.geometry}
          material={materials.rock}
          matrixAutoUpdate={false}
          matrix={rock.matrix}
          castShadow
          receiveShadow
        />
      ))}
      {scape.driftwood.map((geo, i) => (
        <mesh key={i} geometry={geo} material={materials.wood} castShadow receiveShadow />
      ))}
      <Instances set={scape.pebbles} geometry={g.pebble} material={materials.pebble} receiveShadow />
      <Instances set={scape.moss} geometry={g.moss} material={materials.moss} castShadow receiveShadow />
      <Instances set={scape.ribbons} geometry={g.ribbon} material={materials.plant} castShadow receiveShadow />
      <Instances set={scape.stems} geometry={g.stem} material={materials.plant} castShadow />
      <Instances set={scape.leaves} geometry={g.leaf} material={materials.plant} castShadow receiveShadow />
      <Instances set={scape.leaflets} geometry={g.leaflet} material={materials.plant} castShadow receiveShadow />
      <Instances set={scape.grass} geometry={g.grass} material={materials.plant} receiveShadow />
      <SuspendedParticles data={scape.particles} />
    </group>
  );
}
