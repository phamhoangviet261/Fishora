'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { waterTime } from '@/lib/underwater';

/** A handful of faint drifting motes — just enough to read the water as a volume. */
export function SuspendedParticles({ data }: { data: Float32Array }) {
  const { geometry, material } = useMemo(() => {
    const n = data.length / 4;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = data[i * 4];
      pos[i * 3 + 1] = data[i * 4 + 1];
      pos[i * 3 + 2] = data[i * 4 + 2];
      seed[i] = data[i * 4 + 3];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: waterTime, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float t = uTime * 0.25 + aSeed * 40.0;
          p.x += sin( t ) * 0.012;
          p.y += sin( t * 0.7 + 1.3 ) * 0.01;
          p.z += cos( t * 0.8 ) * 0.008;
          vec4 mv = modelViewMatrix * vec4( p, 1.0 );
          gl_Position = projectionMatrix * mv;
          gl_PointSize = ( 1.2 + aSeed * 1.6 ) * ( 2.2 / -mv.z );
          vAlpha = 0.18 + 0.22 * aSeed;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length( gl_PointCoord - 0.5 );
          gl_FragColor = vec4( vec3( 0.86, 0.92, 0.88 ), vAlpha * smoothstep( 0.5, 0.1, d ) );
        }
      `,
    });
    return { geometry, material };
  }, [data]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return <points geometry={geometry} material={material} renderOrder={1} />;
}
