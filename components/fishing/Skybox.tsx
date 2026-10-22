'use client';

import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// "Lake in the Mountains - Day & Twilight - Skybox" (public/models/fishing-assets; see CREDITS.md): six faces of a
// ~255 m box, each with a 2048 px photo; the lake and its reflections are painted into the lower faces, so it is
// both the background and the water. Drawn unlit (true photo colours, no fog), behind everything, and kept centred
// on the camera so it reads as infinitely far away and never clips.

export const SKYBOX_URL = '/models/fishing-assets/Lake_in_the_Mountains_-_Day_amp_Twilight_-_Skybox.glb';

export function Skybox() {
  const gltf = useLoader(GLTFLoader, SKYBOX_URL);
  const { camera } = useThree();

  const root = useMemo(() => {
    const copy = gltf.scene.clone(true); // own copy: the loader's cached scene can only have one parent
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      mesh.material = new THREE.MeshBasicMaterial({ map: src.map, side: THREE.DoubleSide, fog: false, toneMapped: false, depthWrite: false });
      mesh.renderOrder = -1;
      mesh.frustumCulled = false;
    });
    return copy;
  }, [gltf]);

  useEffect(
    () => () =>
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
      }),
    [root],
  );

  useFrame(() => void root.position.copy(camera.position));

  return <primitive object={root} />;
}
