'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { FRONT_Z, INNER, WATER_Y } from '@/lib/tank';
import { waterTime } from '@/lib/underwater';

/**
 * The water surface, seen from just below at a grazing angle. Small vertex ripples drive an
 * approximate underside look: mostly a dim greenish internal reflection with moving bright glints.
 */
export function WaterSurface() {
  const { geometry, material, meniscus, meniscusMat } = useMemo(() => {
    const w = INNER.xMax - INNER.xMin;
    const d = INNER.zMax - INNER.zMin;
    const geometry = new THREE.PlaneGeometry(w, d, 72, 26).rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: waterTime },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormal2;
        float height( vec2 p ) {
          return 0.0011 * sin( p.x * 23.0 + uTime * 1.05 )
               + 0.0008 * sin( p.y * 31.0 - uTime * 1.25 + p.x * 7.0 )
               + 0.0005 * sin( ( p.x + p.y ) * 47.0 + uTime * 1.8 );
        }
        void main() {
          vec3 p = position;
          vec4 wp = modelMatrix * vec4( p, 1.0 );
          float h = height( wp.xz );
          float e = 0.004;
          float hx = height( wp.xz + vec2( e, 0.0 ) ) - h;
          float hz = height( wp.xz + vec2( 0.0, e ) ) - h;
          vNormal2 = normalize( vec3( -hx / e, 1.0, -hz / e ) );
          wp.y += h;
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        varying vec3 vNormal2;
        void main() {
          vec3 v = normalize( vWorld - cameraPosition );
          vec3 n = vNormal2;
          // Grazing view from below: total internal reflection of the planted interior.
          vec3 interior = vec3( 0.07, 0.13, 0.1 );
          vec3 sky = vec3( 0.78, 0.9, 0.95 );
          float through = pow( clamp( dot( -v, -n ) * 1.0, 0.0, 1.0 ), 6.0 );
          float glint = pow( clamp( 1.0 - abs( n.x * 9.0 + n.z * 7.0 ), 0.0, 1.0 ), 5.0 );
          vec3 col = mix( interior, sky, through ) + sky * glint * 0.35;
          gl_FragColor = vec4( col, 0.62 );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    // A thin bright meniscus where the water meets the front glass.
    const meniscus = new THREE.PlaneGeometry(w, 0.0035);
    const meniscusMat = new THREE.MeshBasicMaterial({ color: '#d9ece6', transparent: true, opacity: 0.55, depthWrite: false });
    return { geometry, material, meniscus, meniscusMat };
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    meniscus.dispose();
    meniscusMat.dispose();
  }, [geometry, material, meniscus, meniscusMat]);

  return (
    <group>
      <mesh geometry={geometry} material={material} position={[0, WATER_Y, (INNER.zMin + INNER.zMax) / 2]} renderOrder={2} />
      <mesh geometry={meniscus} material={meniscusMat} position={[0, WATER_Y, FRONT_Z - 0.0105]} renderOrder={3} />
    </group>
  );
}
