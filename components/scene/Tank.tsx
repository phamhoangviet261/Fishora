'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TANK, TANK_TOP_Y } from '@/lib/tank';
import { backdropTexture } from '@/lib/textures';
import { applyGlass } from '@/lib/underwater';
import { Aquascape } from './Aquascape';
import { WaterSurface } from './WaterSurface';

const W = TANK.width;
const H = TANK.height;
const D = TANK.depth;
const T = TANK.glass;
const CY = TANK.baseY + H / 2;

/** Rimless glass tank: panes, edge tint, black silicone, leveling mat, LED fixture, backdrop and contents. */
export function Tank() {
  const m = useMemo(() => {
    const backdrop = backdropTexture();
    return {
      backdrop,
      glass: applyGlass(
        new THREE.MeshPhysicalMaterial({
          color: '#e4f1ec',
          roughness: 0.04,
          metalness: 0,
          transparent: true,
          opacity: 0.06,
          envMapIntensity: 1.4,
          depthWrite: false,
        }),
        0.9,
      ),
      edge: applyGlass(
        new THREE.MeshPhysicalMaterial({
          color: '#8fc4ad',
          roughness: 0.1,
          transparent: true,
          opacity: 0.42,
          envMapIntensity: 1.2,
          depthWrite: false,
        }),
        0.6,
      ),
      silicone: new THREE.MeshStandardMaterial({ color: '#0d0f0f', roughness: 0.45 }),
      mat: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }),
      backdropMat: new THREE.MeshBasicMaterial({ map: backdrop }),
      sideMat: new THREE.MeshBasicMaterial({ map: backdrop, color: new THREE.Color(0.32, 0.38, 0.36) }),
      alu: new THREE.MeshStandardMaterial({ color: '#b9bcc0', metalness: 0.85, roughness: 0.35 }),
      led: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.75) }),
    };
  }, []);

  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);

  const pane = (key: string, size: [number, number, number], pos: [number, number, number], order: number) => (
    <mesh key={key} material={m.glass} position={pos} renderOrder={order}>
      <boxGeometry args={size} />
    </mesh>
  );

  const edgeV = (x: number, z: number) => (
    <mesh key={`ev${x}${z}`} material={m.edge} position={[x, CY, z]} renderOrder={5}>
      <boxGeometry args={[T, H, T]} />
    </mesh>
  );
  const edgeTop = (z: number) => (
    <mesh key={`et${z}`} material={m.edge} position={[0, TANK_TOP_Y - T / 2, z]} renderOrder={5}>
      <boxGeometry args={[W, T, T]} />
    </mesh>
  );
  const silicone = (x: number, z: number) => (
    <mesh key={`s${x}${z}`} material={m.silicone} position={[x, CY, z]}>
      <boxGeometry args={[0.007, H - T, 0.007]} />
    </mesh>
  );

  const ix = W / 2 - T - 0.0035;
  const iz = D / 2 - T - 0.0035;

  return (
    <group>
      {/* leveling mat */}
      <mesh material={m.mat} position={[0, TANK.baseY - 0.0025, 0]} receiveShadow>
        <boxGeometry args={[W, 0.005, D]} />
      </mesh>

      {/* backdrop film behind the back pane */}
      <mesh material={m.backdropMat} position={[0, CY, -D / 2 - 0.004]}>
        <planeGeometry args={[W, H]} />
      </mesh>

      {/* side glass: stand-in for the mirror-like internal reflection seen at a glancing angle */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.sideMat} position={[s * (W / 2 + 0.003), CY, 0]} rotation={[0, -s * Math.PI / 2, 0]}>
          <planeGeometry args={[D, H]} />
        </mesh>
      ))}

      <Aquascape />
      <WaterSurface />

      {/* panes: back & sides first, front last */}
      {pane('bottom', [W, T, D], [0, TANK.baseY + T / 2, 0], 3)}
      {pane('back', [W, H, T], [0, CY, -D / 2 + T / 2], 3)}
      {pane('left', [T, H, D - 2 * T], [-W / 2 + T / 2, CY, 0], 3)}
      {pane('right', [T, H, D - 2 * T], [W / 2 - T / 2, CY, 0], 3)}
      {pane('front', [W, H, T], [0, CY, D / 2 - T / 2], 4)}

      {edgeV(-W / 2 + T / 2, D / 2 - T / 2)}
      {edgeV(W / 2 - T / 2, D / 2 - T / 2)}
      {edgeV(-W / 2 + T / 2, -D / 2 + T / 2)}
      {edgeV(W / 2 - T / 2, -D / 2 + T / 2)}
      {edgeTop(D / 2 - T / 2)}
      {edgeTop(-D / 2 + T / 2)}

      {silicone(-ix, iz)}
      {silicone(ix, iz)}
      {silicone(-ix, -iz)}
      {silicone(ix, -iz)}

      {/* slim LED fixture on low legs */}
      <group position={[0, TANK_TOP_Y + 0.045, -0.01]}>
        <mesh material={m.alu} castShadow>
          <boxGeometry args={[W - 0.08, 0.012, 0.085]} />
        </mesh>
        <mesh material={m.led} position={[0, -0.0065, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[W - 0.1, 0.06]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} material={m.alu} position={[s * (W / 2 - T / 2), -0.025, 0]}>
            <boxGeometry args={[0.008, 0.05, 0.03]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
