'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { FLOOR_Y, FRONT_Z, INNER, WATER_Y } from '@/lib/tank';
import { tankLight, waterTime } from '@/lib/underwater';

const SHAFTS = [
  { x: -0.34, z: -0.06, w: 0.07, tilt: 0.1, phase: 0.0 },
  { x: -0.1, z: -0.1, w: 0.1, tilt: 0.08, phase: 1.7 },
  { x: 0.16, z: -0.04, w: 0.06, tilt: 0.12, phase: 3.1 },
  { x: 0.38, z: -0.09, w: 0.09, tilt: 0.07, phase: 4.6 },
];

/**
 * Soft, slowly breathing light shafts under the surface plus a faint diagonal gleam on the front glass.
 * Additive and very low alpha: they suggest light in the water without bloom or haze.
 */
export function LightShafts() {
  const m = useMemo(() => {
    const shaft = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: waterTime, uLight: tankLight, uPhase: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uLight;
        uniform float uPhase;
        varying vec2 vUv;
        void main() {
          float across = smoothstep( 0.0, 0.5, vUv.x ) * smoothstep( 1.0, 0.5, vUv.x );
          float down = smoothstep( 0.0, 0.25, vUv.y ) * ( 0.35 + 0.65 * vUv.y );
          float breathe = 0.55 + 0.45 * sin( uTime * 0.35 + uPhase );
          float a = across * across * down * breathe * 0.085 * uLight;
          gl_FragColor = vec4( vec3( 0.75, 0.95, 1.0 ) * a, 1.0 );
        }
      `,
    });
    const gleam = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          float d = vUv.x * 0.9 - vUv.y * 0.55;
          float band = smoothstep( 0.035, 0.0, abs( d - 0.06 ) ) * 0.7 + smoothstep( 0.012, 0.0, abs( d - 0.115 ) ) * 0.5;
          float fade = smoothstep( 0.0, 0.3, vUv.y ) * smoothstep( 1.0, 0.6, vUv.y ) * smoothstep( 0.55, 0.0, vUv.x );
          gl_FragColor = vec4( vec3( 0.85, 0.93, 1.0 ) * band * fade * 0.07, 1.0 );
        }
      `,
    });
    const shafts = SHAFTS.map((s) => {
      const mat = shaft.clone();
      mat.uniforms = { uTime: waterTime, uLight: tankLight, uPhase: { value: s.phase } };
      return mat;
    });
    shaft.dispose();
    return { shafts, gleam };
  }, []);

  useEffect(() => () => {
    m.shafts.forEach((x) => x.dispose());
    m.gleam.dispose();
  }, [m]);

  const height = WATER_Y - FLOOR_Y - 0.02;
  return (
    <group>
      {SHAFTS.map((s, i) => (
        <mesh key={i} material={m.shafts[i]} position={[s.x, FLOOR_Y + 0.02 + height / 2, s.z]} rotation={[0, 0, s.tilt]} renderOrder={2}>
          <planeGeometry args={[s.w, height]} />
        </mesh>
      ))}
      <mesh material={m.gleam} position={[0, (FLOOR_Y + WATER_Y) / 2 + 0.02, FRONT_Z + 0.001]} renderOrder={6}>
        <planeGeometry args={[INNER.xMax - INNER.xMin, 0.48]} />
      </mesh>
    </group>
  );
}
