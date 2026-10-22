'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { substrateHeight } from '@/lib/tank';
import { applyUnderwater, type UnderwaterOptions } from '@/lib/underwater';
import { FishBoundary } from './Fish';

// Photo-scanned hardscape and plants from Poly Haven (CC0), see CREDITS.md.
const url = (id: string) => `/models/scape/${id}/${id}.gltf`;

interface Placement {
  /** Poly Haven asset id (folder and file name under public/models/scape). */
  asset: string;
  /** Name of one child node in the asset's scene; omit to use the whole scene. */
  node?: string;
  x: number;
  z: number;
  /** Target size in metres of the model's longest horizontal side. */
  size: number;
  rotY?: number;
  /** Extra tilt (radians) around X and Z, for logs leaning on things. */
  tilt?: [number, number];
  /** Fraction of the model height pushed below the substrate. */
  sink?: number;
  /** Extra lift above the substrate (metres), e.g. plants tied onto wood. */
  lift?: number;
  kind: 'rock' | 'wood' | 'plant';
  /** Colour multiplied into the scan's albedo, to pull pale field scans toward aquarium hardscape tones. */
  tint?: string;
}

// Lava-rock charcoal and soaked, dark driftwood.
const ROCK_TINT = '#6a625c';
const WOOD_TINT = '#8a6248';

const PLACEMENTS: Placement[] = [
  // Hardscape: a large root tangle across the back-left, a lying root in the foreground.
  { asset: 'root_cluster_01', x: -0.2, z: -0.1, size: 0.82, rotY: 0.35, tilt: [0.12, -0.32], sink: 0.05, kind: 'wood', tint: WOOD_TINT },
  { asset: 'single_root', x: -0.36, z: 0.05, size: 0.42, rotY: 1.9, sink: 0.25, kind: 'wood', tint: WOOD_TINT },
  { asset: 'dead_quiver_branch_01', x: 0.13, z: -0.15, size: 0.16, rotY: 0.8, sink: 0.05, kind: 'wood', tint: WOOD_TINT },

  // Rocks: big boulder group on the right, smaller stones in front.
  { asset: 'namaqualand_boulder_05', x: 0.3, z: -0.07, size: 0.3, rotY: -0.5, tilt: [0.25, 0.15], sink: 0.0, kind: 'rock', tint: '#4a4542' },
  { asset: 'rock_moss_set_02', node: 'rock_moss_set_02_rock13', x: 0.44, z: -0.13, size: 0.2, rotY: 1.2, sink: 0.2, kind: 'rock' },
  { asset: 'rock_moss_set_01', node: 'rock_moss_set_01_rock04', x: -0.13, z: -0.03, size: 0.13, rotY: 0.4, sink: 0.3, kind: 'rock' },
  { asset: 'rock_07', x: 0.2, z: 0.06, size: 0.12, rotY: 2.0, sink: 0.15, kind: 'rock', tint: ROCK_TINT },
  { asset: 'rock_moss_set_02', node: 'rock_moss_set_02_rock08', x: -0.3, z: 0.08, size: 0.09, rotY: 0.2, sink: 0.1, kind: 'rock' },
  { asset: 'rock_moss_set_02', node: 'rock_moss_set_02_rock09', x: 0.02, z: 0.1, size: 0.07, rotY: 0.9, sink: 0.1, kind: 'rock' },
  { asset: 'rock_moss_set_02', node: 'rock_moss_set_02_rock12', x: 0.47, z: 0.09, size: 0.08, rotY: 0.3, sink: 0.1, kind: 'rock' },

  // Plants: fern clumps (Java fern stand-in) and Anubias-like anthurium at rock and wood bases.
  { asset: 'fern_02', node: 'fern_02_b', x: -0.05, z: -0.14, size: 0.16, rotY: 0.3, kind: 'plant' },
  { asset: 'fern_02', node: 'fern_02_c', x: -0.42, z: -0.12, size: 0.15, rotY: 2.1, kind: 'plant' },
  { asset: 'fern_02', node: 'fern_02_a', x: 0.17, z: -0.02, size: 0.09, rotY: 4.0, kind: 'plant' },
  { asset: 'anthurium_botany_01', node: 'anthurium_botany_05_e', x: -0.37, z: 0.12, size: 0.09, rotY: 0.6, kind: 'plant' },
  { asset: 'anthurium_botany_01', node: 'anthurium_botany_06_f', x: 0.36, z: 0.13, size: 0.085, rotY: 2.4, kind: 'plant' },
  { asset: 'anthurium_botany_01', node: 'anthurium_botany_04_d', x: 0.1, z: -0.06, size: 0.1, rotY: 1.1, kind: 'plant' },
];

const SHADING: Record<Placement['kind'], UnderwaterOptions> = {
  rock: { caustics: 0.9 },
  wood: { caustics: 0.8 },
  plant: { caustics: 0.55, sway: 0.09, glow: 0.12 },
};

function ScannedModel({ p }: { p: Placement }) {
  const gltf = useLoader(GLTFLoader, url(p.asset));

  const object = useMemo(() => {
    const source = p.node ? gltf.scene.getObjectByName(p.node) : gltf.scene;
    if (!source) throw new Error(`Node "${p.node}" not found in ${p.asset}`);
    const model = source.clone(true);
    model.position.set(0, 0, 0);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      if (p.kind === 'plant') mat.side = THREE.DoubleSide;
      if (p.tint) mat.color.multiply(new THREE.Color(p.tint));
      mesh.material = applyUnderwater(mat, SHADING[p.kind]);
    });

    // Normalise: longest horizontal side = p.size, centred in XZ, base sunk into the substrate.
    const holder = new THREE.Group();
    holder.add(model);
    holder.rotation.y = p.rotY ?? 0;
    if (p.tilt) holder.rotation.set(p.tilt[0], p.rotY ?? 0, p.tilt[1], 'YXZ');
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = p.size / Math.max(size.x, size.z);
    const centre = box.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -box.min.y - size.y * (p.sink ?? 0), -centre.z);
    holder.scale.setScalar(scale);
    holder.position.set(p.x, substrateHeight(p.x, p.z) + (p.lift ?? 0), p.z);
    return holder;
  }, [gltf, p]);

  useEffect(
    () => () => {
      object.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
    },
    [object],
  );

  return <primitive object={object} />;
}

/** Scanned rocks, driftwood and plants; each loads on its own and a missing file is skipped. */
export function ScannedScape() {
  return (
    <>
      {PLACEMENTS.map((p, i) => (
        <FishBoundary key={i} id={`${p.asset}${p.node ? `:${p.node}` : ''}`}>
          <Suspense fallback={null}>
            <ScannedModel p={p} />
          </Suspense>
        </FishBoundary>
      ))}
    </>
  );
}
