'use client';

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const FOV = 32;
const HALF_H = 0.56; // vertical half-extent to frame on wide screens (cabinet top → above tank)
const HALF_W = 0.7; // horizontal half-extent: the tank (1.2m) plus a small margin

// Drag-to-orbit limits: front and sides only, never round the back of the tank.
const MAX_YAW = THREE.MathUtils.degToRad(70);
const MIN_PITCH = THREE.MathUtils.degToRad(-4);
const MAX_PITCH = THREE.MathUtils.degToRad(35);
const DRAG_SPEED = 0.006; // radians per pixel

/**
 * Front-facing camera that can be orbited around the tank by press-and-drag.
 * Framing distance is recomputed on resize: on wide screens the vertical framing wins,
 * on narrow/portrait screens the camera pulls back so the full tank width always fits.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const dom = useThree((s) => s.gl.domElement);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  const frame = useMemo(() => {
    const aspect = width / Math.max(height, 1);
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const dist = Math.max(HALF_H / tanV, HALF_W / (tanV * aspect));
    const portrait = THREE.MathUtils.clamp((1.2 - aspect) / 0.75, 0, 1);
    const targetY = THREE.MathUtils.lerp(1.0, 0.86, portrait);
    // The original fixed shot looks slightly down; keep that as the resting pitch.
    const basePitch = Math.atan2(0.06 + 0.02 * dist, dist);
    return { aspect, dist: Math.hypot(dist, 0.06 + 0.02 * dist), target: new THREE.Vector3(0, targetY, 0), basePitch };
  }, [width, height]);

  const orbit = useMemo(() => ({ yaw: 0, pitch: 0, goalYaw: 0, goalPitch: 0 }), []);

  useEffect(() => {
    orbit.goalPitch = orbit.pitch = frame.basePitch;
  }, [frame, orbit]);

  useEffect(() => {
    camera.fov = FOV;
    camera.aspect = frame.aspect;
    camera.near = 0.05;
    camera.far = Math.max(20, frame.dist + 10);
    camera.updateProjectionMatrix();
  }, [camera, frame]);

  useEffect(() => {
    let drag: { id: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || drag) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
      dom.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      orbit.goalYaw = THREE.MathUtils.clamp(orbit.goalYaw - (e.clientX - drag.x) * DRAG_SPEED, -MAX_YAW, MAX_YAW);
      orbit.goalPitch = THREE.MathUtils.clamp(orbit.goalPitch + (e.clientY - drag.y) * DRAG_SPEED, MIN_PITCH, MAX_PITCH);
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      dom.style.cursor = 'grab';
    };
    dom.style.cursor = 'grab';
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    return () => {
      dom.removeEventListener('pointerdown', down);
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up);
      dom.removeEventListener('pointercancel', up);
      dom.style.cursor = '';
    };
  }, [dom, orbit]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    orbit.yaw = THREE.MathUtils.damp(orbit.yaw, orbit.goalYaw, 8, dt);
    orbit.pitch = THREE.MathUtils.damp(orbit.pitch, orbit.goalPitch, 8, dt);
    const { dist, target } = frame;
    const flat = Math.cos(orbit.pitch) * dist;
    camera.position.set(target.x + Math.sin(orbit.yaw) * flat, target.y + Math.sin(orbit.pitch) * dist, target.z + Math.cos(orbit.yaw) * flat);
    camera.lookAt(target);
  });

  return null;
}
