'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { artTexture, plankTexture, plasterTexture, rugTexture, woodTexture } from '@/lib/textures';

const WALL_Z = -0.62;

/** Supporting room: floor, wall, rug, a floor lamp, a potted plant and two framed prints. */
export function Room() {
  const m = useMemo(() => {
    const planks = plankTexture();
    const plaster = plasterTexture();
    const rug = rugTexture();
    const art = artTexture();
    const frameWood = woodTexture([0.16, 0.1, 0.06], [0.3, 0.2, 0.12], 8, 256, 64);
    return {
      planks,
      plaster,
      rug,
      art,
      frameWood,
      floor: new THREE.MeshStandardMaterial({ map: planks, roughness: 0.58 }),
      wall: new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 }),
      trim: new THREE.MeshStandardMaterial({ color: '#d8ccbb', roughness: 0.7 }),
      rugMat: new THREE.MeshStandardMaterial({ map: rug, roughness: 1 }),
      frame: new THREE.MeshStandardMaterial({ map: frameWood, roughness: 0.6 }),
      artMat: new THREE.MeshStandardMaterial({ map: art, roughness: 0.9 }),
      mount: new THREE.MeshStandardMaterial({ color: '#e9e1d3', roughness: 0.9 }),
      brass: new THREE.MeshStandardMaterial({ color: '#9c7a48', metalness: 1, roughness: 0.38 }),
      shade: new THREE.MeshStandardMaterial({
        color: '#e8d6b8',
        emissive: new THREE.Color('#ffb36a'),
        emissiveIntensity: 0.55,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
      pot: new THREE.MeshStandardMaterial({ color: '#8a5a3e', roughness: 0.85 }),
      soil: new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: '#3f5a33', roughness: 0.65, side: THREE.DoubleSide }),
    };
  }, []);

  // Simple broad leaf shape for the house plant.
  const leafGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.13, 0.08, 0.12, 0.3, 0, 0.38);
    s.bezierCurveTo(-0.12, 0.3, -0.13, 0.08, 0, 0);
    return new THREE.ShapeGeometry(s, 10);
  }, []);

  const plantLeaves = useMemo(() => {
    const out: { pos: [number, number, number]; rot: [number, number, number]; s: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39996;
      const h = 0.5 + (i / 14) * 0.65;
      out.push({
        pos: [Math.cos(a) * 0.06, h, Math.sin(a) * 0.06],
        rot: [-0.9 + (i % 3) * 0.15, a + Math.PI / 2, 0.2],
        s: 0.75 + (i % 4) * 0.12,
      });
    }
    return out;
  }, []);

  useEffect(() => () => {
    Object.values(m).forEach((x) => x.dispose());
    leafGeo.dispose();
  }, [m, leafGeo]);

  const frame = (x: number, y: number, w: number, h: number) => (
    <group position={[x, y, WALL_Z + 0.015]}>
      <mesh material={m.frame} castShadow>
        <boxGeometry args={[w, h, 0.025]} />
      </mesh>
      <mesh material={m.mount} position={[0, 0, 0.0135]}>
        <planeGeometry args={[w - 0.05, h - 0.05]} />
      </mesh>
      <mesh material={m.artMat} position={[0, 0, 0.0145]}>
        <planeGeometry args={[w - 0.14, h - 0.14]} />
      </mesh>
    </group>
  );

  return (
    <group>
      <mesh material={m.floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 3]} receiveShadow>
        <planeGeometry args={[14, 14]} />
      </mesh>
      <mesh material={m.wall} position={[0, 1.6, WALL_Z]} receiveShadow>
        <planeGeometry args={[14, 3.2]} />
      </mesh>
      <mesh material={m.trim} position={[0, 0.05, WALL_Z + 0.008]}>
        <boxGeometry args={[14, 0.1, 0.016]} />
      </mesh>
      <mesh material={m.rugMat} rotation={[-Math.PI / 2, 0, 0]} position={[0.1, 0.004, 1.0]} receiveShadow>
        <planeGeometry args={[2.4, 1.7]} />
      </mesh>

      {frame(-1.05, 1.42, 0.36, 0.46)}
      {frame(-0.32, 1.98, 0.3, 0.38)}

      {/* floor lamp, right */}
      <group position={[1.12, 0, -0.3]}>
        <mesh material={m.brass} position={[0, 0.012, 0]}>
          <cylinderGeometry args={[0.14, 0.15, 0.024, 32]} />
        </mesh>
        <mesh material={m.brass} position={[0, 0.78, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 1.52, 10]} />
        </mesh>
        <mesh material={m.shade} position={[0, 1.55, 0]}>
          <cylinderGeometry args={[0.15, 0.2, 0.26, 40, 1, true]} />
        </mesh>
      </group>

      {/* potted plant, left */}
      <group position={[-1.12, 0, -0.25]}>
        <mesh material={m.pot} position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.13, 0.4, 28]} />
        </mesh>
        <mesh material={m.soil} position={[0, 0.39, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.16, 24]} />
        </mesh>
        <mesh material={m.leaf} position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.006, 0.008, 0.5, 6]} />
        </mesh>
        {plantLeaves.map((l, i) => (
          <mesh key={i} geometry={leafGeo} material={m.leaf} position={l.pos} rotation={l.rot} scale={l.s} castShadow />
        ))}
      </group>
    </group>
  );
}
