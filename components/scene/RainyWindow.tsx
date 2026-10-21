'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { waterTime } from '@/lib/underwater';

/**
 * A window onto an overcast, rainy afternoon, painted procedurally in a shader: soft layered sky,
 * hazy distant rooftops, falling rain streaks and a few droplets resting on the pane.
 * Unlit and slightly over 1.0 so it reads as the brightest, coolest light source in the room.
 */
export function RainyWindow({ position, width, height }: { position: [number, number, number]; width: number; height: number }) {
  const m = useMemo(() => {
    const view = new THREE.ShaderMaterial({
      uniforms: { uTime: waterTime, uAspect: { value: width / height } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uAspect;
        varying vec2 vUv;

        float hash( float n ) { return fract( sin( n ) * 43758.5453 ); }
        float hash2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        float vnoise( vec2 p ) {
          vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( hash2( i ), hash2( i + vec2( 1, 0 ) ), f.x ), mix( hash2( i + vec2( 0, 1 ) ), hash2( i + vec2( 1, 1 ) ), f.x ), f.y );
        }
        float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 4; i++ ) { s += a * vnoise( p ); p *= 2.03; a *= 0.5; } return s; }

        // Skyline height for a layer: blocky rooftops with occasional taller buildings.
        float skyline( float x, float seed, float base, float amp ) {
          float col = floor( x * 9.0 + seed * 13.0 );
          float h = base + amp * hash( col + seed * 7.1 );
          h += amp * 0.8 * step( 0.82, hash( col * 1.7 + seed ) );
          return h;
        }

        void main() {
          vec2 uv = vUv;
          float t = uTime;

          // Overcast sky: brighter, slightly warm haze near the horizon, cool blue-grey above.
          vec3 top = vec3( 0.40, 0.50, 0.64 );
          vec3 horizon = vec3( 0.80, 0.85, 0.88 );
          vec3 col = mix( horizon, top, smoothstep( 0.25, 1.0, uv.y ) );
          float clouds = fbm( vec2( uv.x * 2.2 * uAspect + t * 0.01, uv.y * 3.5 ) );
          col = mix( col, vec3( 0.88, 0.91, 0.93 ), smoothstep( 0.45, 0.8, clouds ) * 0.45 * smoothstep( 0.3, 0.9, uv.y ) );

          // Distant rooftops in two hazy layers (atmospheric perspective).
          float far = skyline( uv.x * uAspect, 1.0, 0.30, 0.12 );
          col = mix( col, vec3( 0.58, 0.66, 0.75 ), step( uv.y, far ) * 0.85 );
          float near = skyline( uv.x * uAspect * 0.7, 2.0, 0.16, 0.12 );
          col = mix( col, vec3( 0.40, 0.48, 0.58 ), step( uv.y, near ) * 0.9 );
          // A few warm lit windows in the nearer buildings.
          vec2 cell = floor( vec2( uv.x * uAspect * 40.0, uv.y * 50.0 ) );
          float lit = step( 0.93, hash2( cell ) ) * step( uv.y, near - 0.02 );
          col = mix( col, vec3( 1.0, 0.82, 0.55 ), lit * 0.55 );
          // Tree canopy along the bottom.
          float trees = 0.1 + 0.07 * fbm( vec2( uv.x * uAspect * 6.0, 1.0 ) );
          col = mix( col, vec3( 0.26, 0.36, 0.38 ), smoothstep( trees + 0.01, trees - 0.01, uv.y ) );

          // Mist.
          col = mix( col, vec3( 0.78, 0.83, 0.88 ), 0.18 + 0.1 * fbm( uv * 3.0 + vec2( t * 0.02, 0.0 ) ) );

          // Falling rain: thin slanted streaks in two depth layers.
          float rain = 0.0;
          for ( int l = 0; l < 2; l++ ) {
            float fl = float( l );
            vec2 p = vec2( ( uv.x + uv.y * 0.08 ) * uAspect * ( 70.0 + fl * 50.0 ), uv.y * ( 3.0 + fl ) );
            float c = floor( p.x );
            float off = hash( c + fl * 31.0 );
            float y = fract( p.y + t * ( 1.6 + fl * 0.7 + off ) + off * 10.0 );
            float streak = smoothstep( 0.0, 0.05, y ) * smoothstep( 0.22, 0.05, y );
            float thin = smoothstep( 0.5, 0.0, abs( fract( p.x ) - 0.5 ) * 2.0 * ( 3.0 + fl ) );
            rain += streak * thin * step( 0.55, off ) * ( 0.35 - fl * 0.12 );
          }
          col += vec3( 0.9, 0.94, 1.0 ) * rain;

          // Droplets resting on the glass: small bright rims with darker centres.
          vec2 dp = vec2( uv.x * uAspect, uv.y ) * 22.0;
          vec2 di = floor( dp );
          vec2 df = fract( dp ) - 0.5 - ( vec2( hash2( di ), hash2( di + 3.0 ) ) - 0.5 ) * 0.6;
          float r = 0.08 + 0.1 * hash2( di + 7.0 );
          float d = length( df );
          float present = step( 0.7, hash2( di + 11.0 ) );
          col = mix( col, col * 0.82, present * smoothstep( r, r * 0.6, d ) );
          col += present * smoothstep( r * 0.5, 0.0, length( df - vec2( -r * 0.35, r * 0.35 ) ) ) * 0.25;

          gl_FragColor = vec4( col * 1.25, 1.0 );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    return {
      view,
      frame: new THREE.MeshStandardMaterial({ color: '#5a3c26', roughness: 0.55 }),
      sill: new THREE.MeshStandardMaterial({ color: '#6b4a30', roughness: 0.5 }),
    };
  }, [width, height]);

  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);

  const f = 0.045; // frame thickness
  return (
    <group position={position}>
      <mesh material={m.view}>
        <planeGeometry args={[width, height]} />
      </mesh>
      {/* outer frame */}
      {[-1, 1].map((s) => (
        <mesh key={`v${s}`} material={m.frame} position={[s * (width / 2 + f / 2), 0, 0.02]} castShadow>
          <boxGeometry args={[f, height + 2 * f, 0.05]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`h${s}`} material={m.frame} position={[0, s * (height / 2 + f / 2), 0.02]}>
          <boxGeometry args={[width + 2 * f, f, 0.05]} />
        </mesh>
      ))}
      {/* mullions: a centre post and a thin transom, like a sliding Japanese window */}
      <mesh material={m.frame} position={[0, 0, 0.015]}>
        <boxGeometry args={[0.03, height, 0.035]} />
      </mesh>
      <mesh material={m.frame} position={[0, height * 0.18, 0.012]}>
        <boxGeometry args={[width, 0.018, 0.025]} />
      </mesh>
      {/* sill */}
      <mesh material={m.sill} position={[0, -height / 2 - f - 0.012, 0.06]} castShadow receiveShadow>
        <boxGeometry args={[width + 2 * f + 0.06, 0.024, 0.14]} />
      </mesh>
    </group>
  );
}
