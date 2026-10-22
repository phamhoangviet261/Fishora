'use client';

import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BETTA, TANK_FISH } from '@/lib/fishSpecies';

const MODELS = new Map(TANK_FISH.map((sp) => [sp.id, sp]));

/**
 * A species' existing GLB, normalised to `size` metres and playing its swim clip. Used outside the tank (catch
 * animation, collectible card); unknown model keys fall back to the betta, like the aquarium does.
 */
export function FishModel({ modelKey, size = 1, spin = 0 }: { modelKey: string; size?: number; spin?: number }) {
  const species = MODELS.get(modelKey) ?? BETTA;
  const gltf = useLoader(GLTFLoader, species.url);
  const root = useRef<THREE.Group>(null);

  const { model, mixer } = useMemo(() => {
    const model = cloneSkinned(gltf.scene) as THREE.Group;
    const hidden = species.hide ?? [];
    model.traverse((o) => {
      if (hidden.some((h) => o.name === h || o.name.startsWith(h))) o.visible = false;
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).frustumCulled = false;
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const dims = box.getSize(new THREE.Vector3());
    model.position.sub(box.getCenter(new THREE.Vector3()));
    const wrapper = new THREE.Group();
    wrapper.add(model);
    wrapper.scale.setScalar(size / Math.max(dims.x, dims.y, dims.z));
    if (species.headAxis === '+x') wrapper.rotation.y = -Math.PI / 2;
    const mixer = new THREE.AnimationMixer(model);
    const clip = gltf.animations[0];
    if (clip) mixer.clipAction(clip).play();
    return { model: wrapper, mixer };
  }, [gltf, species, size]);

  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  useFrame((_, dt) => {
    mixer.update(Math.min(dt, 0.05));
    if (spin && root.current) root.current.rotation.y += spin * dt;
  });

  return (
    <group ref={root}>
      <primitive object={model} />
    </group>
  );
}
