'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FLOOR_Y, TANK_TOP_Y } from '@/lib/tank';
import { tankLight } from '@/lib/underwater';

/**
 * Warm room light (lamp + hemisphere + a warm low environment map) against a cool
 * tank light from the LED fixture, which is the only shadow caster.
 */
export function Lighting({ shadowSize, lightOn }: { shadowSize: number; lightOn: boolean }) {
  const { gl, scene } = useThree();
  const spot = useRef<THREE.SpotLight>(null);

  // Ease the tank light toward its target so switching reads as a fixture warming up, not a cut.
  useFrame((_, delta) => {
    const target = lightOn ? 1 : 0;
    tankLight.value = THREE.MathUtils.damp(tankLight.value, target, 6, Math.min(delta, 0.1));
    if (spot.current) spot.current.intensity = 0.04 + 1.7 * tankLight.value;
  });

  // Small procedural "room" environment for reflections and soft fill. Built once with PMREM.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = new THREE.Scene();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(8, 4, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.11, 0.08), side: THREE.BackSide }),
    );
    box.position.y = 1.5;
    env.add(box);
    const panel = (color: THREE.Color, w: number, h: number, pos: [number, number, number], rotY: number) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      p.position.set(...pos);
      p.rotation.y = rotY;
      env.add(p);
      return p;
    };
    panel(new THREE.Color(5, 3.2, 1.7), 0.5, 0.5, [2.2, 1.6, 0.6], -Math.PI / 2);
    panel(new THREE.Color(1.1, 1.3, 1.6), 1.8, 1.4, [-3.9, 1.7, 1.0], Math.PI / 2);
    const fixture = panel(new THREE.Color(3, 3.2, 3.4), 1.2, 0.1, [0, 3.4, 0], 0);
    fixture.rotation.x = Math.PI / 2;
    const target = pmrem.fromScene(env, 0.035);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
      env.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    };
  }, [gl, scene]);

  const tankTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, FLOOR_Y, -0.02);
    return o;
  }, []);

  return (
    <>
      <hemisphereLight args={['#ffe6cc', '#3b2a1e', 0.3]} />
      {/* floor lamp bulb */}
      <pointLight position={[1.12, 1.52, -0.3]} color="#ffaa5c" intensity={1.8} distance={0} decay={2} />
      {/* cool overcast daylight from the window, left */}
      <directionalLight position={[-2.6, 1.9, 1.2]} color="#9cbce6" intensity={0.75} />
      {/* faint warm bounce from the room behind the viewer */}
      <directionalLight position={[1.5, 2.2, 3]} color="#ffd1a0" intensity={0.18} />

      {/* cool LED tank light */}
      <primitive object={tankTarget} />
      <spotLight
        ref={spot}
        position={[0, TANK_TOP_Y + 0.04, -0.01]}
        target={tankTarget}
        color="#dff3ff"
        intensity={1.74}
        angle={0.95}
        penumbra={0.8}
        distance={0}
        decay={2}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.015}
        shadow-camera-near={0.02}
        shadow-camera-far={1.2}
      />
    </>
  );
}
