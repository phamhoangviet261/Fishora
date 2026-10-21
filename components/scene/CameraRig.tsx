'use client';

import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

const FOV = 32;
const HALF_H = 0.56; // vertical half-extent to frame on wide screens (cabinet top → above tank)
const HALF_W = 0.7; // horizontal half-extent: the tank (1.2m) plus a small margin

/**
 * Fixed, front-facing camera. Recomputed only on resize: on wide screens the vertical framing wins,
 * on narrow/portrait screens the camera pulls back so the full tank width always fits.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useLayoutEffect(() => {
    const aspect = width / Math.max(height, 1);
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const dist = Math.max(HALF_H / tanV, HALF_W / (tanV * aspect));
    const portrait = THREE.MathUtils.clamp((1.2 - aspect) / 0.75, 0, 1);
    const targetY = THREE.MathUtils.lerp(1.0, 0.86, portrait);
    camera.fov = FOV;
    camera.aspect = aspect;
    camera.position.set(0, targetY + 0.06 + 0.02 * dist, dist);
    camera.lookAt(0, targetY, 0);
    camera.near = 0.05;
    camera.far = Math.max(20, dist + 10);
    camera.updateProjectionMatrix();
  }, [camera, width, height]);

  return null;
}
