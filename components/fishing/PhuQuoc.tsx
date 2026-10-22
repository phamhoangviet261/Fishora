'use client';

import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// "Đảo ngọc Phú Quốc" diorama (1DesignTool 3D library, free for commercial use; see CREDITS.md): Dinh Cậu shrine,
// the lighthouse on its rock, palms, beach and moored fishing boats on a slate plinth, with a 10 s loop (boats bob,
// ripples, palms sway). Shown on the Phú Quốc map card.

export const PHU_QUOC_URL = '/models/landmarks/dao-phu-quoc.glb';

/** Plays the model's loop on `root`. */
function useLoop(root: THREE.Object3D, clip: THREE.AnimationClip | undefined) {
  const mixer = useMemo(() => {
    const mixer = new THREE.AnimationMixer(root);
    if (clip) mixer.clipAction(clip).play();
    return mixer;
  }, [root, clip]);
  useEffect(() => () => void mixer.stopAllAction(), [mixer]);
  useFrame((_, dt) => mixer.update(Math.min(dt, 0.05)));
}

/** The whole tabletop diorama (plinth included), slowly turning: the Phú Quốc map card's picture. */
export function PhuQuocDiorama() {
  const gltf = useLoader(GLTFLoader, PHU_QUOC_URL);
  const root = useMemo(() => {
    const g = new THREE.Group();
    g.add(cloneSkinned(gltf.scene)); // own copy: the loader's cached scene can only have one parent
    return g;
  }, [gltf]);
  useLoop(root, gltf.animations[0]);
  useFrame((_, dt) => void (root.rotation.y += dt * 0.25));
  return <primitive object={root} />;
}
