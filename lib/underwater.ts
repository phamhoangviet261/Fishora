import * as THREE from 'three';
import { FRONT_Z, FLOOR_Y, WATER_Y } from './tank';

/** Shared animation clock for every water-related shader. Advanced once per frame by <WaterClock>. */
export const waterTime = { value: 0 };

const f = (n: number) => n.toFixed(5);

export interface UnderwaterOptions {
  /** Strength of the projected caustic pattern. */
  caustics?: number;
  /** World-space sway amplitude (plants). */
  sway?: number;
  /** Fake light-through-leaf lift for vegetation. */
  glow?: number;
}

const VERT_HEAD = /* glsl */ `
uniform float uTime;
varying vec3 vUwWorldPos;
varying vec3 vUwWorldNormal;
`;

const projectVertex = (sway: number) => /* glsl */ `
vec4 uwPos = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  uwPos = instanceMatrix * uwPos;
#endif
uwPos = modelMatrix * uwPos;
${
  sway > 0
    ? `{
  float h = max( uwPos.y - ${f(FLOOR_Y + 0.03)}, 0.0 );
  float k = h * h * ${f(sway)};
  float ph = uwPos.x * 5.0 + uwPos.z * 3.0;
  uwPos.x += k * ( sin( uTime * 0.85 + ph ) + 0.35 * sin( uTime * 1.9 + ph * 2.3 ) );
  uwPos.z += k * 0.6 * cos( uTime * 0.65 + ph * 1.3 );
}`
    : ''
}
vUwWorldPos = uwPos.xyz;
vec4 mvPosition = viewMatrix * uwPos;
gl_Position = projectionMatrix * mvPosition;
`;

const FRAG_HEAD = /* glsl */ `
uniform float uTime;
varying vec3 vUwWorldPos;
varying vec3 vUwWorldNormal;

vec2 uwHash2( vec2 p ) {
  p = vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) );
  return fract( sin( p ) * 43758.5453 );
}

// Distance to the nearest cell border of an animated Voronoi field.
float uwCellEdge( vec2 p, float t ) {
  vec2 n = floor( p );
  vec2 fr = fract( p );
  float d1 = 8.0;
  float d2 = 8.0;
  for ( int j = -1; j <= 1; j++ ) {
    for ( int i = -1; i <= 1; i++ ) {
      vec2 g = vec2( float( i ), float( j ) );
      vec2 o = uwHash2( n + g );
      o = 0.5 + 0.42 * sin( t + 6.2831 * o );
      vec2 r = g + o - fr;
      float d = dot( r, r );
      if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) { d2 = d; }
    }
  }
  return sqrt( d2 ) - sqrt( d1 );
}

float uwCaustics( vec3 wp ) {
  float t = uTime;
  vec2 p = wp.xz * 19.0 + wp.y * 3.0;
  p += vec2( sin( p.y * 0.45 + t * 0.35 ), cos( p.x * 0.4 - t * 0.3 ) ) * 0.55;
  float e1 = uwCellEdge( p, t * 0.8 );
  float e2 = uwCellEdge( p * 1.7 + 3.1, -t * 1.0 );
  float c = exp( -e1 * 9.0 ) * 0.75 + exp( -e2 * 11.0 ) * 0.4;
  return c * c;
}
`;

const causticsFragment = (caustics: number, glow: number) => /* glsl */ `
#include <lights_fragment_end>
{
  float uwMask = smoothstep( -0.35, 0.9, normalize( vUwWorldNormal ).y );
  float uwDepth = clamp( ( ${f(WATER_Y)} - vUwWorldPos.y ) / 0.45, 0.0, 1.0 );
  float uwC = uwCaustics( vUwWorldPos ) * uwMask * mix( 1.0, 0.6, uwDepth );
  reflectedLight.directDiffuse += diffuseColor.rgb * vec3( 0.80, 0.94, 1.0 ) * uwC * ${f(caustics)};
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3( 0.16, 0.26, 0.22 ) * ${f(glow)};
}
`;

// Wavelength-dependent absorption + in-scatter along an approximate in-water view path.
const ABSORPTION = /* glsl */ `
{
  float uwPath = max( ${f(FRONT_Z)} - vUwWorldPos.z, 0.0 ) + max( ${f(WATER_Y)} - vUwWorldPos.y, 0.0 ) * 0.35;
  vec3 uwAbsorb = exp( -vec3( 0.85, 0.30, 0.36 ) * uwPath );
  vec3 uwScatter = vec3( 0.035, 0.068, 0.064 );
  outgoingLight = outgoingLight * uwAbsorb + uwScatter * ( 1.0 - exp( -1.5 * uwPath ) );
}
#include <opaque_fragment>
`;

/** Patches a MeshStandardMaterial so it reads as underwater: caustics, depth tint and optional sway. */
export function applyUnderwater<T extends THREE.MeshStandardMaterial>(material: T, options: UnderwaterOptions = {}): T {
  const { caustics = 1, sway = 0, glow = 0 } = options;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\nvUwWorldNormal = normalize( ( vec4( transformedNormal, 0.0 ) * viewMatrix ).xyz );',
      )
      .replace('#include <project_vertex>', projectVertex(sway));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <lights_fragment_end>', causticsFragment(caustics, glow))
      .replace('#include <opaque_fragment>', ABSORPTION);
  };
  material.customProgramCacheKey = () => `uw-${caustics}-${sway}-${glow}`;
  return material;
}

/**
 * Glass: raise alpha where the surface reflects light, so reflections are not washed out by the low base opacity.
 * This is an approximation of Fresnel-weighted reflection; there is no refraction.
 */
export function applyGlass<T extends THREE.MeshPhysicalMaterial>(material: T, specAlpha = 0.9): T {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `diffuseColor.a = clamp( diffuseColor.a + dot( totalSpecular, vec3( 0.3333 ) ) * ${f(specAlpha)}, 0.0, 0.9 );\n#include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => `glass-${specAlpha}`;
  return material;
}
