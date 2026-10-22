'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { FishModel } from './FishModel';
import { RodModel } from './RodModel';
import { Skybox } from './Skybox';
import { CAST_FLIGHT_MS, CATCH_ANIM_MS, type SceneBus } from './sceneBus';

// First-person fishing view: a calm lake from the end of a wooden jetty. The rod is held in front of the camera;
// the line runs from its tip to the bobber. Built from primitives plus the project's existing boulder scans (there
// are no rod/lake assets). Animation only: it reads the bus and never touches game state.

/** Eye height above the water line (y = 0, where the bobber floats): standing on the shore. */
const EYE = new THREE.Vector3(0, 2.2, 0.3);
/** Where the view is aimed: almost level, so the skybox's mountains fill the top and the lake the bottom. */
const LOOK_AT = new THREE.Vector3(0, 1.0, -30);
const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** Where the bobber is for the current phase, in world space. */
/** Turns a point about the player (EYE, vertical axis) by `yaw`: the cast goes the way the player faced. */
function aroundPlayer(v: THREE.Vector3, yaw: number) {
  if (!yaw) return v;
  const x = v.x - EYE.x;
  const z = v.z - EYE.z;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return v.set(EYE.x + x * c + z * s, v.y, EYE.z - x * s + z * c);
}

/** Where the bobber is for the current phase, in world space. */
function bobberTarget(bus: SceneBus, now: number, out: THREE.Vector3, tip: THREE.Vector3) {
  const dist = 7 + bus.power * 15;
  if (bus.phase === 'casting') {
    const rest = aroundPlayer(out.set(0, 0.03, -dist), bus.castYaw);
    const t = ease((now - bus.castAt) / CAST_FLIGHT_MS);
    const arc = Math.sin(t * Math.PI) * (2 + bus.power * 3);
    return out.set(tip.x + (rest.x - tip.x) * t, tip.y + (0.03 - tip.y) * t + arc, tip.z + (rest.z - tip.z) * t);
  }
  if (bus.phase === 'waiting') out.set(0, 0.03 + Math.sin(now / 380) * 0.025, -dist);
  else if (bus.phase === 'bite') out.set(0, -0.08 + Math.sin(now / 60) * 0.05, -dist);
  else if (bus.phase === 'reeling' || bus.phase === 'resolving') {
    // The fish drags the bobber left and right; reeling pulls it in as progress rises.
    out.set((bus.center - 0.5) * 7, Math.sin(now / 90) * 0.03, -dist * (1 - bus.progress * 0.6));
  } else out.set(0, 0.03, -dist);
  return aroundPlayer(out, bus.castYaw);
}

function RodAndLine({ bus }: { bus: MutableRefObject<SceneBus> }) {
  const { camera } = useThree();
  const rig = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Group>(null);
  /** The rod tip the line leaves from: the model's last bone, or the stand-in's tip marker. */
  const tipMark = useRef<THREE.Object3D | null>(null);
  const bobber = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const catchFish = useRef<THREE.Group>(null);
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 32 }, () => new THREE.Vector3()));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.85 }));
  }, []);
  useEffect(() => () => line.geometry.dispose(), [line]);
  const tmp = useMemo(() => ({ tip: new THREE.Vector3(), bob: new THREE.Vector3(), mid: new THREE.Vector3(), curve: new THREE.QuadraticBezierCurve3() }), []);

  useFrame(() => {
    const b = bus.current;
    const now = performance.now();
    if (!rig.current || !rod.current || !tipMark.current || !bobber.current) return;

    // The rod rides with the camera, low and to the right.
    rig.current.position.copy(camera.position);
    rig.current.quaternion.copy(camera.quaternion);

    // Rod pose per phase: pulled back while charging, swung forward on the cast, swaying with the fish while reeling.
    let pitch = -0.15;
    let yaw = 0;
    let roll = 0;
    if (b.phase === 'charging') pitch = -0.15 + b.power * 0.9;
    else if (b.phase === 'casting') pitch = 0.75 - ease((now - b.castAt) / (CAST_FLIGHT_MS * 0.6)) * 1.05;
    else if (b.phase === 'bite') pitch = -0.32 + Math.sin(now / 50) * 0.04;
    else if (b.phase === 'reeling' || b.phase === 'resolving') {
      yaw = -(b.center - 0.5) * 0.7;
      pitch = 0.1 + b.progress * 0.35 + Math.sin(now / 70) * 0.03;
      roll = Math.sin(now / 110) * 0.05;
    } else if (b.phase === 'caught') pitch = 0.22;
    rod.current.rotation.set(pitch, yaw, roll);

    tipMark.current.getWorldPosition(tmp.tip);
    const showBobber = b.phase !== 'idle' && b.phase !== 'charging' && b.phase !== 'caught';
    bobber.current.visible = showBobber;
    line.visible = showBobber || b.phase === 'caught';
    if (showBobber) bobberTarget(b, now, tmp.bob, tmp.tip);
    else tmp.bob.copy(tmp.tip).add(new THREE.Vector3(0, -0.6, 0));
    bobber.current.position.copy(tmp.bob);

    // Slack line sags; a taut one (reeling) is nearly straight.
    // Taut once the bobber is out: a light sag while waiting, nearly straight under load; loose only in flight.
    const slack = b.phase === 'casting' ? 0.4 : b.phase === 'waiting' ? 0.12 : b.phase === 'reeling' || b.phase === 'resolving' || b.phase === 'bite' ? 0.03 : 0.6;
    // The sag hangs below the straight tip→bobber line (not below the bobber), so a small slack reads as taut.
    tmp.mid.copy(tmp.tip).lerp(tmp.bob, 0.5);
    tmp.mid.y -= slack * 2; // a quadratic Bézier sags half as far as its control point
    tmp.curve.v0.copy(tmp.tip);
    tmp.curve.v1.copy(tmp.mid);
    tmp.curve.v2.copy(tmp.bob);
    line.geometry.setFromPoints(tmp.curve.getPoints(31));

    // Splash ring on landing and on the bite.
    if (ring.current) {
      const since = b.phase === 'bite' ? now - b.biteAt : b.phase === 'waiting' ? now - b.castAt - CAST_FLIGHT_MS : 9999;
      const k = Math.min(1, since / 900);
      ring.current.visible = since < 900;
      ring.current.position.set(tmp.bob.x, 0.02, tmp.bob.z);
      ring.current.scale.setScalar(0.2 + k * 1.4);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
    }

    // The shared catch animation: the fish leaps from the water up toward the rod tip.
    if (catchFish.current) {
      const t = (now - b.caughtAt) / CATCH_ANIM_MS;
      catchFish.current.visible = b.phase === 'caught' && t < 1.4;
      if (catchFish.current.visible) {
        const k = ease(Math.min(1, t));
        const from = tmp.mid.set(0, 0, -8);
        catchFish.current.position.set(from.x * (1 - k) + 0.25 * k, Math.sin(Math.min(1, t) * Math.PI) * 2.2 + k * 1.1, from.z * (1 - k) - 1.6 * k);
        aroundPlayer(catchFish.current.position, b.castYaw);
        catchFish.current.rotation.set(Math.sin(now / 80) * 0.4, now / 400, Math.sin(now / 60) * 0.3);
      }
    }
  });

  return (
    <>
      <group ref={rig}>
        <group position={[0.32, -0.42, -0.55]}>
          <group ref={rod} rotation={[-0.15, 0, 0]}>
            <group rotation={[0.42, 0, 0]}>
              {/* The rigged rod model; the simple stand-in shows while its file loads (or if it fails). */}
              <Suspense fallback={<StandInRod tipRef={tipMark} />}>
                <RodModel bus={bus} tipRef={tipMark} />
              </Suspense>
            </group>
          </group>
        </group>
      </group>
      <primitive object={line} />
      <group ref={bobber}>
        <mesh position={[0, 0.04, 0]}>
          <sphereGeometry args={[0.07, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#e2433a" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.04, 0]} rotation={[Math.PI, 0, 0]}>
          <sphereGeometry args={[0.07, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#f5f1e8" roughness={0.5} />
        </mesh>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={catchFish} visible={false}>
        <CatchFish bus={bus} />
      </group>
    </>
  );
}

/** Primitive rod shown until the rigged model has loaded. */
function StandInRod({ tipRef }: { tipRef: MutableRefObject<THREE.Object3D | null> }) {
  return (
    <group rotation={[-0.42, 0, 0]}>
      <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.026, 0.3, 12]} />
        <meshStandardMaterial color="#b98d5a" roughness={0.9} />
      </mesh>
      <group rotation={[0.42, 0, 0]}>
        <mesh position={[0, 0, -0.85]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.004, 0.014, 1.7, 8]} />
          <meshStandardMaterial color="#2b2f36" roughness={0.4} />
        </mesh>
        <object3D
          position={[0, 0, -1.7]}
          ref={(o) => {
            if (o) tipRef.current = o;
            else if (tipRef.current?.userData.standIn) tipRef.current = null;
          }}
          userData={{ standIn: true }}
        />
      </group>
    </group>
  );
}

/** Swaps in the caught species' model when the catch animation starts. */
function CatchFish({ bus }: { bus: MutableRefObject<SceneBus> }) {
  const [modelKey, setModelKey] = useState<string | null>(null);
  useFrame(() => {
    if (bus.current.catchModelKey !== modelKey) setModelKey(bus.current.catchModelKey);
  });
  return modelKey ? (
    <Suspense fallback={null}>
      <FishModel key={modelKey} modelKey={modelKey} size={0.7} />
    </Suspense>
  ) : null;
}

/** The fixed default view, turned by the player's look-around (Ctrl + drag) every frame. */
const BASE_YAW = Math.atan2(-(LOOK_AT.x - EYE.x), -(LOOK_AT.z - EYE.z));
const BASE_PITCH = Math.atan2(LOOK_AT.y - EYE.y, Math.hypot(LOOK_AT.x - EYE.x, LOOK_AT.z - EYE.z));

function Look({ bus }: { bus: MutableRefObject<SceneBus> }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.copy(EYE);
    camera.rotation.order = 'YXZ';
  }, [camera]);
  useFrame(() => {
    camera.rotation.set(BASE_PITCH + bus.current.viewPitch, BASE_YAW + bus.current.viewYaw, 0);
  });
  return null;
}

/** The player's view while fishing: the mountain-lake skybox (background and water) and the rod, line and bobber.
 *  (`zoneKey` is kept for per-map scenery.) */
export function FishingScene({ bus }: { bus: MutableRefObject<SceneBus>; zoneKey: string }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 64, near: 0.05, far: 600, position: EYE.toArray() }}
      gl={{ antialias: true }}
      onCreated={({ scene, gl, camera }) => {
        if (process.env.NODE_ENV !== 'production') (window as unknown as { __fishingScene: unknown }).__fishingScene = { scene, camera };
        scene.background = new THREE.Color('#cfe5ef');
        gl.toneMappingExposure = 1.05;
      }}
    >
      <Look bus={bus} />
      <hemisphereLight args={['#e8f4ff', '#3d5a6a', 0.9]} />
      <directionalLight position={[-30, 40, -50]} intensity={1.6} color="#fff3dc" castShadow />
      <Suspense fallback={null}>
        <Skybox />
      </Suspense>
      <RodAndLine bus={bus} />
    </Canvas>
  );
}
