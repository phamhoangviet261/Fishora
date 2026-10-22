'use client';

import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { SceneBus } from './sceneBus';

// The rigged fishing rod (public/models/fishing-assets). In the file the rod lies along −X with the butt at +X and a
// 10-bone chain (Bone001 → Bone010) running from the butt to the tip; its one clip ("Take 001") plays on each cast.
// Between casts the bones are posed in code: the blank bends with line tension and leans with the fish.

export const ROD_URL = '/models/fishing-assets/Fishing_Rod_Rigged_and_Animated.glb';

/** Rod length in the scene, metres (the file's blank is ~7.7 units long). */
const LENGTH = 1.9;
const FILE_LENGTH = 7.68;
/** Where the hand holds the rod, in file units along X (just ahead of the reel seat). */
const GRIP_X = 1.0;
/** Bend per bone at full tension (radians), and which way is "down" for this rig. Tune here if it bends the wrong way. */
const BEND_PER_BONE = 0.055;
const BEND_SIGN = 1;
const SWAY_PER_BONE = 0.02;
/** The rig's rest pose raises the blank ~50°; tilt it down so the tip stays in view (radians, about the grip). */
const TILT = -0.5;

const CAST_ANIM_MS = 2500;

export function RodModel({ bus, tipRef }: { bus: MutableRefObject<SceneBus>; tipRef: MutableRefObject<THREE.Object3D | null> }) {
  const gltf = useLoader(GLTFLoader, ROD_URL);

  const { root, bones, rest, mixer, cast } = useMemo(() => {
    // A skinned clone per instance: the loader's cached scene can only have one parent, so sharing it would leave
    // other instances (and StrictMode's second render) with an empty rod.
    const scene = cloneSkinned(gltf.scene) as THREE.Group;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false; // skinned bounds don't follow the bend
        mesh.castShadow = true;
      }
    });
    // Butt toward the camera at the grip, tip pointing forward (−X in the file → −Z here), scaled to LENGTH.
    const holder = new THREE.Group();
    scene.position.set(-GRIP_X, 0, 0);
    holder.add(scene);
    const root = new THREE.Group();
    root.name = 'rod-model';
    root.add(holder);
    holder.rotation.y = -Math.PI / 2;
    root.scale.setScalar(LENGTH / FILE_LENGTH);
    root.rotation.x = TILT;

    const bones: THREE.Bone[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone && /^Bone0\d\d/.test(o.name)) bones.push(o as THREE.Bone);
    });
    bones.sort((a, b) => a.name.localeCompare(b.name));
    const rest = bones.map((b) => b.quaternion.clone());

    const mixer = new THREE.AnimationMixer(scene);
    const clip = gltf.animations[0];
    const cast = clip ? mixer.clipAction(clip) : null;
    if (cast) {
      cast.setLoop(THREE.LoopOnce, 1);
      cast.clampWhenFinished = false;
    }
    return { root, bones, rest, mixer, cast };
  }, [gltf]);

  // The line leaves from the last bone (the rod tip).
  useLayoutEffect(() => {
    const tip = bones[bones.length - 1] ?? null;
    tipRef.current = tip;
    return () => {
      if (tipRef.current === tip) tipRef.current = null;
    };
  }, [bones, tipRef]);

  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), e: new THREE.Euler() }), []);
  const lastCastAt = useRef(0);

  useFrame((_, dt) => {
    const b = bus.current;
    const now = performance.now();

    // Each cast plays the rod's own animation once.
    if (cast && b.phase === 'casting' && b.castAt !== lastCastAt.current) {
      lastCastAt.current = b.castAt;
      cast.reset().play();
    }
    const animating = !!cast && cast.isRunning() && now - b.castAt < CAST_ANIM_MS;
    if (animating) {
      mixer.update(Math.min(dt, 0.05));
      return;
    }
    if (cast?.isRunning()) cast.stop();

    // Otherwise: rest pose plus a bend that grows toward the tip.
    const reeling = b.phase === 'reeling' || b.phase === 'resolving';
    const tension = reeling ? 0.35 + b.progress * 0.65 + Math.sin(now / 70) * 0.06 : b.phase === 'bite' ? 0.55 + Math.sin(now / 45) * 0.2 : b.phase === 'waiting' ? 0.08 : 0;
    const sway = reeling ? (b.center - 0.5) * 2 : 0;
    bones.forEach((bone, i) => {
      const k = (i + 1) / bones.length;
      tmp.e.set(0, sway * SWAY_PER_BONE * k, BEND_SIGN * tension * BEND_PER_BONE * k);
      bone.quaternion.copy(rest[i]).multiply(tmp.q.setFromEuler(tmp.e));
    });
  });

  return <primitive object={root} />;
}
