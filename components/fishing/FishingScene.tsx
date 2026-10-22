'use client';

import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { woodTexture } from '@/lib/textures';
import { FishModel } from './FishModel';
import { CAST_FLIGHT_MS, CATCH_ANIM_MS, type SceneBus } from './sceneBus';

// First-person fishing view: a calm lake from the end of a wooden jetty. The rod is held in front of the camera;
// the line runs from its tip to the bobber. Built from primitives plus the project's existing boulder scans (there
// are no rod/lake assets). Animation only: it reads the bus and never touches game state.

const EYE = new THREE.Vector3(0, 1.55, 0.3);
const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

const WATER_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    vec3 p = position;
    float w = sin(p.x * 0.35 + uTime * 0.9) * 0.05 + sin(p.y * 0.5 - uTime * 1.3) * 0.04 + sin((p.x + p.y) * 1.7 + uTime * 2.1) * 0.012;
    p.z += w;
    vWave = w;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uFog;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 view = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);
    float dist = length(vWorld.xz - cameraPosition.xz);
    vec3 col = mix(uShallow, uDeep, smoothstep(2.0, 40.0, dist));
    col = mix(col, uSky, clamp(fres * 0.85, 0.0, 1.0));
    vec3 sun = normalize(vec3(-0.4, 0.6, -0.7));
    float spec = pow(max(dot(reflect(-sun, n), view), 0.0), 60.0);
    col += spec * 0.6 + vWave * 0.4;
    col = mix(col, uFog, smoothstep(40.0, 150.0, dist));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function Water() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uDeep: { value: new THREE.Color('#1d5a73') },
          uShallow: { value: new THREE.Color('#3f8e8c') },
          uSky: { value: new THREE.Color('#bfe0f2') },
          uFog: { value: new THREE.Color('#cfe5ef') },
        },
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => void (mat.uniforms.uTime.value += dt));
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <planeGeometry args={[400, 400, 160, 160]} />
    </mesh>
  );
}

function Jetty() {
  const wood = useMemo(() => {
    const tex = woodTexture([96, 66, 40], [138, 98, 62], 7);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  }, []);
  useEffect(() => () => wood.dispose(), [wood]);
  return (
    <group>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} material={wood} position={[0, 0.42, 1.2 - i * 0.32]} castShadow receiveShadow>
          <boxGeometry args={[1.8, 0.06, 0.29]} />
        </mesh>
      ))}
      {[-0.85, 0.85].flatMap((x) =>
        [0.9, -0.9].map((z) => (
          <mesh key={`${x}${z}`} material={wood} position={[x, 0.15, z]}>
            <cylinderGeometry args={[0.07, 0.08, 0.9, 10]} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Low hills and pines along the far shore. */
function Shore() {
  const hills = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const a = -Math.PI * 0.95 + (i / 13) * Math.PI * 0.9;
        const r = 95 + (i % 3) * 14;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 18 + ((i * 7) % 5) * 5 };
      }),
    [],
  );
  const pines = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const a = -Math.PI * 0.93 + (i / 59) * Math.PI * 0.86 + Math.sin(i * 3.1) * 0.02;
        const r = 72 + Math.abs(Math.sin(i * 1.7)) * 16;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, h: 5 + Math.abs(Math.sin(i * 2.3)) * 5 };
      }),
    [],
  );
  return (
    <group>
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, -2, h.z]} scale={[h.s, h.s * 0.45, h.s]}>
          <sphereGeometry args={[1, 16, 10]} />
          <meshStandardMaterial color={i % 2 ? '#4f7a52' : '#5d8a5c'} roughness={1} />
        </mesh>
      ))}
      {pines.map((p, i) => (
        <mesh key={i} position={[p.x, p.h / 2, p.z]}>
          <coneGeometry args={[p.h * 0.28, p.h, 7]} />
          <meshStandardMaterial color={i % 3 ? '#2f5a3a' : '#3b6b45'} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** The project's scanned boulders, reused as shoreline rocks. */
function Rocks() {
  const gltf = useLoader(GLTFLoader, '/models/scape/namaqualand_boulder_05/namaqualand_boulder_05.gltf');
  const rocks = useMemo(
    () =>
      [
        [-3.2, -0.1, -2.5, 1.6, 0.4],
        [3.6, -0.2, -3.5, 2.2, 2.1],
        [-6, -0.3, -9, 3, 1.2],
        [7.5, -0.4, -11, 3.6, 4],
      ].map(([x, y, z, s, r]) => {
        const o = gltf.scene.clone(true);
        o.position.set(x, y, z);
        o.scale.setScalar(s);
        o.rotation.y = r;
        return o;
      }),
    [gltf],
  );
  return (
    <>
      {rocks.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </>
  );
}

/** Where the bobber is for the current phase, in world space. */
function bobberTarget(bus: SceneBus, now: number, out: THREE.Vector3, tip: THREE.Vector3) {
  const dist = 7 + bus.power * 15;
  const rest = out.set(0, 0.03, -dist);
  if (bus.phase === 'casting') {
    const t = ease((now - bus.castAt) / CAST_FLIGHT_MS);
    const arc = Math.sin(t * Math.PI) * (2 + bus.power * 3);
    return out.set(tip.x + (rest.x - tip.x) * t, tip.y + (0.03 - tip.y) * t + arc, tip.z + (rest.z - tip.z) * t);
  }
  if (bus.phase === 'waiting') return rest.setY(0.03 + Math.sin(now / 380) * 0.025);
  if (bus.phase === 'bite') return rest.setY(-0.08 + Math.sin(now / 60) * 0.05);
  if (bus.phase === 'reeling' || bus.phase === 'resolving') {
    // The fish drags the bobber left and right; reeling pulls it in as progress rises.
    return out.set((bus.center - 0.5) * 7, 0.0 + Math.sin(now / 90) * 0.03, -dist * (1 - bus.progress * 0.6));
  }
  return rest;
}

function RodAndLine({ bus }: { bus: MutableRefObject<SceneBus> }) {
  const { camera } = useThree();
  const rig = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Group>(null);
  const tipMark = useRef<THREE.Object3D>(null);
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
    const slack = b.phase === 'reeling' || b.phase === 'resolving' ? 0.15 : b.phase === 'casting' ? 0.4 : 1.2;
    tmp.mid.copy(tmp.tip).lerp(tmp.bob, 0.5).setY(Math.min(tmp.tip.y, tmp.bob.y) - slack);
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
        catchFish.current.rotation.set(Math.sin(now / 80) * 0.4, now / 400, Math.sin(now / 60) * 0.3);
      }
    }
  });

  return (
    <>
      <group ref={rig}>
        <group position={[0.32, -0.42, -0.55]}>
          <group ref={rod} rotation={[-0.15, 0, 0]}>
            {/* cork handle, reel and a tapering blank pointing forward and up */}
            <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.022, 0.026, 0.3, 12]} />
              <meshStandardMaterial color="#b98d5a" roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.05, 0.02]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 0.03, 16]} />
              <meshStandardMaterial color="#5b6670" metalness={0.6} roughness={0.35} />
            </mesh>
            <group rotation={[0.42, 0, 0]}>
              <mesh position={[0, 0, -0.85]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.004, 0.014, 1.7, 8]} />
                <meshStandardMaterial color="#2b2f36" roughness={0.4} />
              </mesh>
              <object3D ref={tipMark} position={[0, 0, -1.7]} />
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

function Look() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.copy(EYE);
    camera.lookAt(0, 0.4, -14);
  }, [camera]);
  return null;
}

export function FishingScene({ bus }: { bus: MutableRefObject<SceneBus> }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 58, near: 0.05, far: 400, position: EYE.toArray() }}
      gl={{ antialias: true }}
      onCreated={({ scene, gl }) => {
        scene.background = new THREE.Color('#cfe5ef');
        scene.fog = new THREE.Fog('#cfe5ef', 60, 220);
        gl.toneMappingExposure = 1.05;
      }}
    >
      <Look />
      <hemisphereLight args={['#e8f4ff', '#55704a', 0.9]} />
      <directionalLight position={[-30, 40, -50]} intensity={1.6} color="#fff3dc" castShadow />
      <Water />
      <Jetty />
      <Shore />
      <Suspense fallback={null}>
        <Rocks />
      </Suspense>
      <RodAndLine bus={bus} />
    </Canvas>
  );
}
