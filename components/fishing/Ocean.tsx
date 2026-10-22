'use client';

import { useFrame, useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// "Ocean water perfect loop" (public/models/fishing-assets; see CREDITS.md): a ~270 × 300 m baked ocean whose
// waves are 50 morph targets, one per frame, with no animation clip in the file. We play the loop ourselves by
// cross-fading from each frame to the next (frame 0 is the base mesh with no target applied).

export const OCEAN_URL = '/models/fishing-assets/Ocean_water_perfect_loop.glb';

/** Seconds per frame of the wave loop. */
const FRAME_SEC = 0.12;
/** Vertical scale of the baked swell (±4 m in the file is a storm; this calms it to roughly ±1.4 m). */
const SWELL = 0.35;
/** The file's mesh is off-centre along X (−151 … 122 m); shift it so the player sits near its middle. */
const CENTRE_X = 14.7;

export function Ocean() {
  const gltf = useLoader(GLTFLoader, OCEAN_URL);
  const { root, meshes, frames } = useMemo(() => {
    const scene = gltf.scene.clone(true); // own copy: the loader's cached scene can only have one parent
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences = mesh.morphTargetInfluences.slice(); // per-copy influences
        mesh.frustumCulled = false; // morphed bounds aren't tracked
        mesh.receiveShadow = true;
        meshes.push(mesh);
      }
    });
    const root = new THREE.Group();
    root.add(scene);
    root.position.x = CENTRE_X;
    root.scale.set(1, SWELL, 1);
    const frames = (meshes[0]?.morphTargetInfluences?.length ?? 0) + 1;
    return { root, meshes, frames };
  }, [gltf]);

  useFrame(({ clock }) => {
    if (frames < 2) return;
    const f = (clock.elapsedTime / FRAME_SEC) % frames;
    const k = Math.floor(f);
    const a = f - k;
    const next = (k + 1) % frames;
    for (const m of meshes) {
      const inf = m.morphTargetInfluences!;
      inf.fill(0);
      // Frame i>0 is target i−1; frame 0 is the base mesh (all influences 0).
      if (k > 0) inf[k - 1] = 1 - a;
      if (next > 0) inf[next - 1] = a;
    }
  });

  return <primitive object={root} />;
}
