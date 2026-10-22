import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm2, fbm3, mulberry32, noise3 } from './noise';
import { FLOOR_Y, INNER, WATER_Y, substrateHeight } from './tank';

// Builds every procedural mesh and instance layout for the tank interior in one deterministic pass.

export interface InstanceSet {
  count: number;
  matrices: Float32Array;
  colors: Float32Array;
}

export interface RockPiece {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
}

export interface Aquascape {
  substrate: THREE.BufferGeometry;
  rocks: RockPiece[];
  driftwood: THREE.BufferGeometry[];
  geometries: {
    ribbon: THREE.BufferGeometry;
    grass: THREE.BufferGeometry;
    leaf: THREE.BufferGeometry;
    leaflet: THREE.BufferGeometry;
    stem: THREE.BufferGeometry;
    moss: THREE.BufferGeometry;
    pebble: THREE.BufferGeometry;
  };
  ribbons: InstanceSet;
  grass: InstanceSet;
  leaves: InstanceSet;
  leaflets: InstanceSet;
  stems: InstanceSet;
  moss: InstanceSet;
  pebbles: InstanceSet;
  particles: Float32Array;
}

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

class InstanceBuffer {
  private m: number[] = [];
  private c: number[] = [];
  push(pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3, color: THREE.Color) {
    _m.compose(pos, quat, scale);
    _m.toArray(this.m, this.m.length);
    this.c.push(color.r, color.g, color.b);
  }
  toSet(): InstanceSet {
    return { count: this.c.length / 3, matrices: new Float32Array(this.m), colors: new Float32Array(this.c) };
  }
}

// Natural planted-tank palette: no stylised lift.
const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, Math.min(1, s), Math.min(0.85, l), THREE.SRGBColorSpace);

// ---------------------------------------------------------------- base geometries

/** Unit blade: width 1 across X, height 1 along Y, curving toward +Z. Vertex colours darken the base. */
function bladeGeometry(segments: number, halfWidth: (y: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const y = i / segments;
    const hw = halfWidth(y);
    const z = 0.12 * y * y;
    const shade = 0.5 + 0.5 * y;
    pos.push(-hw, y, z, hw, y, z);
    col.push(shade, shade, shade, shade, shade, shade);
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Unit lanceolate leaf with a short petiole, slight cupping and a lighter midrib. */
function leafGeometry(lenSeg = 8, widSeg = 4): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= lenSeg; i++) {
    const u = i / lenSeg;
    const blade = u < 0.12 ? 0 : Math.pow(Math.sin(Math.PI * Math.min(1, (u - 0.12) / 0.88)), 0.75) * 0.5;
    const w = Math.max(0.03, blade);
    for (let j = 0; j <= widSeg; j++) {
      const v = (j / widSeg) * 2 - 1;
      const x = v * w;
      const z = 0.35 * v * v * w - 0.12 * u * u;
      pos.push(x, u, z);
      const c = (0.72 + 0.28 * (1 - Math.abs(v))) * (0.82 + 0.18 * u);
      col.push(c, c, c);
      if (i < lenSeg && j < widSeg) {
        const a = i * (widSeg + 1) + j;
        const b = a + widSeg + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function stemGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1, true).translate(0, 0.5, 0);
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

function lumpGeometry(detail: number, roughness: number, seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise3(v.x * 2.3 + seed, v.y * 2.3, v.z * 2.3, seed);
    v.multiplyScalar(1 + roughness * (n - 0.5) * 2);
    p.setXYZ(i, v.x, v.y, v.z);
    const c = 0.7 + 0.3 * n;
    col.push(c, c, c);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- substrate

function substrateGeometry(): THREE.BufferGeometry {
  const NX = 110;
  const NZ = 42;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tile = 0.32; // metres per texture repeat
  const sand = [1, 1, 1];
  const soil = [0.3, 0.24, 0.2];

  for (let iz = 0; iz <= NZ; iz++) {
    for (let ix = 0; ix <= NX; ix++) {
      const x = INNER.xMin + (ix / NX) * (INNER.xMax - INNER.xMin);
      const z = INNER.zMin + (iz / NZ) * (INNER.zMax - INNER.zMin);
      pos.push(x, substrateHeight(x, z), z);
      uv.push(x / tile, z / tile);
      const back = (INNER.zMax - z) / (INNER.zMax - INNER.zMin);
      const tone = (0.86 + 0.22 * fbm2(x * 11, z * 11, 3, 3)) * (1 - 0.3 * back);
      col.push(tone, tone * 0.98, tone * 0.95);
    }
  }
  for (let iz = 0; iz < NZ; iz++) {
    for (let ix = 0; ix < NX; ix++) {
      const a = iz * (NX + 1) + ix;
      idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2);
    }
  }

  // Side "skirts" against the glass: dark aquasoil below, a sand cap on top.
  const ROWS = 6;
  const skirt = (cols: number, at: (t: number) => [number, number]) => {
    const start = pos.length / 3;
    for (let i = 0; i <= cols; i++) {
      const [x, z] = at(i / cols);
      const top = substrateHeight(x, z);
      for (let j = 0; j <= ROWS; j++) {
        const y = FLOOR_Y + ((top - FLOOR_Y) * j) / ROWS;
        pos.push(x, y, z);
        uv.push((x + z) / tile, y / tile);
        const k = j / ROWS;
        const c = k > 0.55 ? sand : soil;
        const n = 0.85 + 0.3 * fbm2(x * 40 + z * 40, y * 60, 2, 9);
        col.push(c[0] * n, c[1] * n, c[2] * n);
      }
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < ROWS; j++) {
        const a = start + i * (ROWS + 1) + j;
        const b = a + ROWS + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  };
  skirt(NX, (t) => [INNER.xMin + t * (INNER.xMax - INNER.xMin), INNER.zMax]); // front, faces +z
  skirt(NZ, (t) => [INNER.xMin, INNER.zMin + t * (INNER.zMax - INNER.zMin)]); // left, faces -x
  skirt(NZ, (t) => [INNER.xMax, INNER.zMax - t * (INNER.zMax - INNER.zMin)]); // right, faces +x

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- rocks

interface RockSpec {
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
  tiltX: number;
  tiltZ: number;
  seed: number;
}

const ROCKS: RockSpec[] = [
  { x: -0.13, z: -0.04, sx: 0.07, sy: 0.07, sz: 0.06, rotY: 0.4, tiltX: -0.05, tiltZ: -0.14, seed: 3 },
  { x: 0.3, z: -0.06, sx: 0.12, sy: 0.15, sz: 0.09, rotY: -0.7, tiltX: 0.05, tiltZ: 0.12, seed: 8 },
  { x: 0.42, z: -0.12, sx: 0.08, sy: 0.12, sz: 0.06, rotY: 1.2, tiltX: 0, tiltZ: -0.2, seed: 13 },
  { x: 0.2, z: 0.06, sx: 0.075, sy: 0.05, sz: 0.05, rotY: 2.1, tiltX: 0.1, tiltZ: 0.05, seed: 21 },
  { x: -0.3, z: 0.06, sx: 0.05, sy: 0.04, sz: 0.04, rotY: 0.2, tiltX: 0, tiltZ: 0.08, seed: 34 },
  { x: 0.02, z: 0.09, sx: 0.035, sy: 0.026, sz: 0.03, rotY: 0.9, tiltX: 0.1, tiltZ: 0, seed: 55 },
  { x: 0.46, z: 0.08, sx: 0.04, sy: 0.03, sz: 0.035, rotY: 0.3, tiltX: 0.1, tiltZ: 0, seed: 77 },
];

function rockGeometry(spec: RockSpec): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 11);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col: number[] = [];
  const v = new THREE.Vector3();
  const s = spec.seed;
  // A few random cutting planes give the angular, fractured faces of Seiryu-style stone.
  const crand = mulberry32(s * 97 + 1);
  const cuts = Array.from({ length: 6 }, () => {
    const n = new THREE.Vector3(crand() - 0.5, (crand() - 0.3) * 0.8, crand() - 0.5).normalize();
    return { n, d: 0.72 + crand() * 0.18 };
  });
  let minY = Infinity;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const broad = fbm3(v.x * 1.2 + s, v.y * 1.2, v.z * 1.2, 4, s);
    const ridge = 1 - Math.abs(noise3(v.x * 3.1, v.y * 3.1 + s, v.z * 3.1, s + 1) * 2 - 1);
    const fine = fbm3(v.x * 7, v.y * 7, v.z * 7, 2, s + 2);
    const r = 1 + 0.45 * (broad - 0.5) + 0.2 * (ridge - 0.5) + 0.08 * (fine - 0.5);
    v.multiplyScalar(r);
    for (const c of cuts) {
      const over = v.dot(c.n) - c.d;
      if (over > 0) v.addScaledVector(c.n, -over * 0.5);
    }
    // Lava-rock pores: sharp dimples where a high-frequency noise peaks.
    const pore = THREE.MathUtils.smoothstep(noise3(v.x * 9 + s, v.y * 9, v.z * 9, s + 9), 0.62, 0.8);
    v.multiplyScalar(1 - 0.09 * pore);
    v.set(v.x * spec.sx, v.y * spec.sy, v.z * spec.sz);
    const floor = -0.25 * spec.sy;
    if (v.y < floor) v.y = floor + (v.y - floor) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
    minY = Math.min(minY, v.y);

    // Dark charcoal lava rock with rusty-brown patches, near-black inside the pores.
    const cav = THREE.MathUtils.clamp((r - 0.85) / 0.3, 0, 1);
    let k = (0.6 + 0.4 * cav + 0.25 * (fine - 0.5)) * (1 - 0.75 * pore);
    const rust = THREE.MathUtils.smoothstep(fbm3(v.x * 18, v.y * 18, v.z * 18, 2, s + 4), 0.5, 0.75);
    k *= 0.3;
    col.push(0.24 * k + rust * 0.07 * k, 0.22 * k + rust * 0.03 * k, 0.21 * k);
  }
  g.translate(0, -minY, 0);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const blocked = (x: number, z: number, pad = 0) =>
  ROCKS.some((r) => ((x - r.x) / (r.sx * 0.95 + pad)) ** 2 + ((z - r.z) / (r.sz * 0.95 + pad)) ** 2 < 1);

const insideTank = (x: number, z: number, margin = 0.008) =>
  x > INNER.xMin + margin && x < INNER.xMax - margin && z > INNER.zMin + margin && z < INNER.zMax - margin;

// ---------------------------------------------------------------- driftwood

function driftwoodGeometry(points: THREE.Vector3[], radius: number, seed: number): { geometry: THREE.BufferGeometry; curve: THREE.CatmullRomCurve3 } {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubular = 48;
  const radial = 9;
  const g = new THREE.TubeGeometry(curve, tubular, radius, radial, false);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, c);
    const taper = 1 - 0.65 * Math.pow(t, 1.4);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c);
      const knot = 1 + 0.22 * (noise3(c.x * 30 + j * 0.7, c.y * 30, c.z * 30, seed) - 0.5);
      v.multiplyScalar(taper * knot);
      p.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  g.computeVertexNormals();
  return { geometry: g, curve };
}

// ---------------------------------------------------------------- builder

export function buildAquascape(seed = 7): Aquascape {
  const rand = mulberry32(seed);
  const rr = (a: number, b: number) => a + (b - a) * rand();

  const geometries = {
    ribbon: bladeGeometry(8, (y) => 0.5 * (1 - Math.pow(y, 6))),
    grass: bladeGeometry(3, (y) => 0.5 * (1 - y)),
    leaf: leafGeometry(),
    leaflet: leafGeometry(4, 2),
    stem: stemGeometry(),
    moss: lumpGeometry(2, 0.28, 4),
    pebble: lumpGeometry(1, 0.18, 9),
  };

  // Rocks
  const rocks: RockPiece[] = ROCKS.map((spec) => {
    const geometry = rockGeometry(spec);
    _e.set(spec.tiltX, spec.rotY, spec.tiltZ, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(spec.x, substrateHeight(spec.x, spec.z) - 0.014, spec.z);
    return { geometry, matrix: new THREE.Matrix4().compose(_p, _q, _s.set(1, 1, 1)) };
  });

  // Driftwood
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, FLOOR_Y + y, z);
  const branches = [
    // Main log: from high on the back-left, down across the tank to the substrate in front of the rocks.
    driftwoodGeometry([V(-0.53, 0.3, -0.17), V(-0.36, 0.2, -0.13), V(-0.16, 0.13, -0.09), V(0.04, 0.08, -0.04), V(0.14, 0.05, 0.0)], 0.03, 1),
    driftwoodGeometry([V(-0.36, 0.2, -0.13), V(-0.3, 0.3, -0.16), V(-0.2, 0.38, -0.19), V(-0.12, 0.41, -0.2)], 0.014, 2),
    driftwoodGeometry([V(-0.16, 0.13, -0.09), V(-0.1, 0.22, -0.13), V(-0.04, 0.31, -0.17)], 0.011, 3),
    driftwoodGeometry([V(-0.45, 0.26, -0.15), V(-0.5, 0.36, -0.17), V(-0.47, 0.42, -0.19)], 0.008, 4),
    driftwoodGeometry([V(0.0, 0.09, -0.05), V(0.08, 0.14, -0.1), V(0.13, 0.22, -0.14)], 0.009, 5),
    // Second, smaller piece lying on the left foreground.
    driftwoodGeometry([V(-0.48, 0.05, 0.04), V(-0.38, 0.07, 0.0), V(-0.26, 0.05, -0.02)], 0.014, 6),
  ];

  // Moss: on upward-facing rock surfaces and along the top of the driftwood.
  const moss = new InstanceBuffer();
  const pv = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  rocks.forEach((rock, ri) => {
    const pos = rock.geometry.attributes.position as THREE.BufferAttribute;
    const nor = rock.geometry.attributes.normal as THREE.BufferAttribute;
    nm.getNormalMatrix(rock.matrix);
    for (let i = 0; i < pos.count; i++) {
      nv.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      if (nv.y < 0.45) continue;
      pv.fromBufferAttribute(pos, i).applyMatrix4(rock.matrix);
      const patch = fbm3(pv.x * 22, pv.y * 22, pv.z * 22, 2, 70 + ri);
      if (patch < 0.6 || rand() > 0.6) continue;
      const s = rr(0.0035, 0.007) * (0.6 + patch);
      _q.setFromUnitVectors(UP, nv);
      moss.push(pv.addScaledVector(nv, s * 0.15), _q, _s.set(s, s * 0.55, s), hsl(rr(0.24, 0.3), rr(0.45, 0.65), rr(0.16, 0.26)));
    }
  });
  const attach: THREE.Vector3[] = [];
  branches.forEach(({ curve }, bi) => {
    const n = bi === 0 ? 260 : 50;
    for (let i = 0; i < n; i++) {
      const t = rr(0.08, 0.95);
      curve.getPointAt(t, pv);
      pv.y += 0.007 * (1 - 0.6 * t);
      pv.x += rr(-0.006, 0.006);
      pv.z += rr(-0.006, 0.006);
      const s = rr(0.004, 0.008);
      _q.setFromEuler(_e.set(rr(-0.4, 0.4), rand() * 6.28, rr(-0.4, 0.4)));
      moss.push(pv, _q, _s.set(s, s * 0.6, s), hsl(rr(0.23, 0.29), rr(0.45, 0.6), rr(0.15, 0.24)));
      if (i % 22 === 0) attach.push(pv.clone());
    }
  });

  // Pebbles scattered over the open sand.
  const pebbles = new InstanceBuffer();
  for (let i = 0; i < 1400; i++) {
    const x = rr(INNER.xMin + 0.01, INNER.xMax - 0.01);
    const z = rr(INNER.zMin + 0.02, INNER.zMax - 0.006);
    if (blocked(x, z, 0.004)) continue;
    const s = rr(0.0022, 0.0055) * (rand() < 0.08 ? 1.8 : 1);
    _q.setFromEuler(_e.set(rand() * 3, rand() * 6.28, rand() * 3));
    _p.set(x, substrateHeight(x, z) - s * 0.3, z);
    const kind = rand();
    const c =
      kind < 0.2 ? hsl(0.07, 0.05, rr(0.06, 0.12)) // black
      : kind < 0.32 ? hsl(0.1, 0.1, rr(0.7, 0.82)) // white quartz
      : kind < 0.55 ? hsl(rr(0.05, 0.08), rr(0.3, 0.45), rr(0.25, 0.38)) // brown
      : hsl(rr(0.08, 0.11), rr(0.25, 0.4), rr(0.48, 0.62)); // tan
    pebbles.push(_p, _q, _s.set(s, s * 0.65, s * 0.85), c);
  }

  const ribbons = new InstanceBuffer();
  const grass = new InstanceBuffer();
  const leaves = new InstanceBuffer();
  const leaflets = new InstanceBuffer();
  const stems = new InstanceBuffer();

  const capHeight = (y: number, h: number) => Math.min(h, WATER_Y - 0.012 - y);

  // Background ribbon plants (Vallisneria-like): denser towards the side walls.
  for (let i = 0; i < 520; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * (0.02 + 0.56 * Math.sqrt(rand()));
    const z = rr(INNER.zMin + 0.008, -0.125);
    if (!insideTank(x, z) || blocked(x, z, 0.005)) continue;
    const y = substrateHeight(x, z) - 0.004;
    const edge = Math.abs(x) / INNER.xMax;
    const h = capHeight(y, rr(0.13, 0.27) + 0.1 * edge);
    if (h < 0.05) continue;
    _q.setFromEuler(_e.set(rr(0.03, 0.22) * (rand() < 0.5 ? -1 : 1), rand() * 6.28, 0, 'YXZ'));
    _p.set(x, y, z);
    ribbons.push(_p, _q, _s.set(rr(0.006, 0.011), h, h), hsl(rr(0.24, 0.3), rr(0.42, 0.6), rr(0.27, 0.4)));
  }

  // Stem plant clumps.
  const stemClump = (
    cx: number,
    cz: number,
    radius: number,
    count: number,
    hMin: number,
    hMax: number,
    leafLen: number,
    leafWid: number,
    perNode: number,
    gap: number,
    leafColor: (t: number) => THREE.Color,
  ) => {
    const dir = new THREE.Vector3();
    const base = new THREE.Vector3();
    const node = new THREE.Vector3();
    for (let s = 0; s < count; s++) {
      const a = rand() * Math.PI * 2;
      const r = radius * Math.sqrt(rand());
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r * 0.7;
      if (!insideTank(x, z, 0.012) || blocked(x, z)) continue;
      base.set(x, substrateHeight(x, z) - 0.004, z);
      const h = capHeight(base.y, rr(hMin, hMax));
      const lean = 0.05 + 0.25 * (r / radius) + rr(0, 0.06);
      dir.set(Math.sin(lean) * Math.cos(a), Math.cos(lean), Math.sin(lean) * Math.sin(a) * 0.6).normalize();
      _q.setFromUnitVectors(UP, dir);
      stems.push(base, _q, _s.set(0.0024, h, 0.0024), hsl(0.22, 0.35, 0.3));
      let ni = 0;
      for (let d = gap * 0.6; d < h; d += gap, ni++) {
        const t = d / h;
        node.copy(base).addScaledVector(dir, d);
        const size = 1 - 0.45 * t * t;
        for (let k = 0; k < perNode; k++) {
          const yaw = ni * 2.4 + (k * Math.PI * 2) / perNode + rr(-0.2, 0.2);
          const tilt = THREE.MathUtils.lerp(1.3, 0.6, t) + rr(-0.15, 0.15);
          _q2.setFromEuler(_e.set(tilt, yaw, 0, 'YXZ'));
          leaflets.push(node, _q2.premultiply(_q), _s.set(leafWid * size, leafLen * size, leafLen * size), leafColor(t));
        }
      }
    }
  };

  // Rotala-like: green below, warm orange-pink tips.
  stemClump(0.42, -0.135, 0.085, 18, 0.2, 0.31, 0.017, 0.0045, 4, 0.011, (t) => {
    const g = hsl(rr(0.24, 0.28), 0.5, rr(0.28, 0.36));
    const tip = hsl(rr(0.02, 0.06), rr(0.5, 0.65), rr(0.42, 0.5));
    return g.lerp(tip, THREE.MathUtils.smoothstep(t, 0.55, 0.95));
  });
  // Red Ludwigia-like stems on the left, as in a classic Dutch-style planted tank.
  stemClump(-0.3, -0.15, 0.07, 16, 0.18, 0.3, 0.02, 0.008, 2, 0.013, (t) =>
    hsl(rr(0.98, 1.0), rr(0.5, 0.65), THREE.MathUtils.lerp(0.22, 0.36, t)),
  );
  stemClump(-0.15, -0.17, 0.06, 12, 0.2, 0.33, 0.016, 0.006, 3, 0.012, (t) =>
    hsl(rr(0.27, 0.31), rr(0.5, 0.65), THREE.MathUtils.lerp(0.22, 0.38, t)),
  );
  stemClump(0.05, -0.17, 0.08, 16, 0.22, 0.35, 0.022, 0.009, 2, 0.014, (t) =>
    hsl(rr(0.24, 0.28), rr(0.5, 0.65), THREE.MathUtils.lerp(0.25, 0.42, t)),
  );
  stemClump(0.48, -0.03, 0.05, 10, 0.12, 0.22, 0.018, 0.006, 3, 0.012, (t) =>
    hsl(rr(0.26, 0.3), rr(0.55, 0.7), THREE.MathUtils.lerp(0.26, 0.4, t)),
  );
  // Broad-leaved green stems on the left back.
  stemClump(-0.47, -0.13, 0.08, 14, 0.2, 0.29, 0.026, 0.011, 2, 0.016, (t) =>
    hsl(rr(0.25, 0.29), rr(0.45, 0.6), THREE.MathUtils.lerp(0.26, 0.4, t)),
  );
  // Bright, fine-leaved stems behind the second rock.
  stemClump(0.2, -0.16, 0.05, 9, 0.13, 0.2, 0.013, 0.003, 5, 0.009, (t) =>
    hsl(rr(0.22, 0.25), rr(0.55, 0.7), THREE.MathUtils.lerp(0.32, 0.45, t)),
  );

  // Rosette plants (Cryptocoryne / Anubias-like) around rock bases.
  const rosette = (cx: number, cz: number, n: number, len: [number, number], wid: [number, number], hue: [number, number], light: [number, number]) => {
    for (let i = 0; i < n; i++) {
      const x = cx + rr(-0.012, 0.012);
      const z = cz + rr(-0.008, 0.008);
      _p.set(x, substrateHeight(x, z) - 0.003, z);
      _q.setFromEuler(_e.set(rr(0.35, 1.05), (i / n) * Math.PI * 2 + rr(-0.3, 0.3), 0, 'YXZ'));
      const l = rr(len[0], len[1]);
      leaves.push(_p, _q, _s.set(rr(wid[0], wid[1]), l, l), hsl(rr(hue[0], hue[1]), rr(0.35, 0.5), rr(light[0], light[1])));
    }
  };
  rosette(-0.02, 0.01, 11, [0.045, 0.07], [0.018, 0.028], [0.15, 0.22], [0.2, 0.28]);
  rosette(0.24, -0.02, 12, [0.05, 0.075], [0.02, 0.03], [0.17, 0.24], [0.22, 0.3]);
  rosette(0.47, 0.05, 9, [0.04, 0.06], [0.018, 0.026], [0.25, 0.3], [0.17, 0.23]);
  rosette(-0.47, 0.02, 10, [0.04, 0.065], [0.016, 0.024], [0.13, 0.19], [0.2, 0.27]);
  // Bright broad-leaf foreground plants (Echinodorus / Anubias-like).
  rosette(-0.36, 0.11, 14, [0.05, 0.08], [0.025, 0.035], [0.27, 0.3], [0.3, 0.4]);
  rosette(0.36, 0.12, 12, [0.045, 0.07], [0.022, 0.032], [0.26, 0.3], [0.32, 0.42]);
  rosette(0.1, -0.08, 10, [0.06, 0.09], [0.02, 0.03], [0.25, 0.29], [0.24, 0.32]);

  // Fern-like leaves tied onto the driftwood.
  attach.forEach((pt) => {
    const n = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      _q.setFromEuler(_e.set(rr(0.5, 1.2), rand() * Math.PI * 2, 0, 'YXZ'));
      const l = rr(0.055, 0.09);
      leaves.push(pt, _q, _s.set(rr(0.011, 0.016), l, l), hsl(rr(0.26, 0.31), rr(0.4, 0.55), rr(0.17, 0.25)));
    }
  });

  // Small round-leaf carpet patches near rock bases.
  const carpet = (cx: number, cz: number, radius: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = radius * Math.sqrt(rand());
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r * 0.6;
      if (!insideTank(x, z) || blocked(x, z, -0.005)) continue;
      _p.set(x, substrateHeight(x, z) + 0.001, z);
      _q.setFromEuler(_e.set(rr(1.15, 1.45), rand() * Math.PI * 2, 0, 'YXZ'));
      const s = rr(0.005, 0.008);
      leaflets.push(_p, _q, _s.set(s, s, s), hsl(rr(0.25, 0.29), rr(0.55, 0.7), rr(0.36, 0.46)));
    }
  };
  carpet(-0.06, 0.05, 0.06, 260);
  carpet(0.21, 0.05, 0.06, 220);
  carpet(-0.3, 0.1, 0.05, 160);

  // Foreground hairgrass tufts, patchy, leaving open sand in front of the centre.
  for (let i = 0; i < 2600; i++) {
    const x = rr(INNER.xMin + 0.01, INNER.xMax - 0.01);
    const z = rr(-0.03, INNER.zMax - 0.015);
    const patch = fbm2(x * 7 + 3, z * 7, 3, 90);
    const gapFront = Math.abs(x - 0.07) < 0.16 && z > 0.1 ? 0.18 : 0;
    if (patch < 0.48 + gapFront + (z > 0.17 ? 0.06 : 0)) continue;
    if (blocked(x, z, 0.008) || !insideTank(x, z, 0.012)) continue;
    const tuft = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < tuft; k++) {
      const tx = x + rr(-0.004, 0.004);
      const tz = z + rr(-0.004, 0.004);
      _p.set(tx, substrateHeight(tx, tz) - 0.002, tz);
      _q.setFromEuler(_e.set(rr(0.1, 0.45), rand() * Math.PI * 2, 0, 'YXZ'));
      const h = rr(0.018, 0.04) * (1.15 - 0.6 * ((z + 0.03) / 0.25));
      grass.push(_p, _q, _s.set(0.0024, h, h), hsl(rr(0.25, 0.31), rr(0.5, 0.65), rr(0.3, 0.42)));
    }
  }

  // Suspended motes.
  const particles = new Float32Array(70 * 4);
  for (let i = 0; i < 70; i++) {
    particles[i * 4] = rr(INNER.xMin + 0.02, INNER.xMax - 0.02);
    particles[i * 4 + 1] = rr(FLOOR_Y + 0.1, WATER_Y - 0.02);
    particles[i * 4 + 2] = rr(INNER.zMin + 0.02, INNER.zMax - 0.02);
    particles[i * 4 + 3] = rand();
  }

  return {
    substrate: substrateGeometry(),
    rocks,
    driftwood: branches.map((b) => b.geometry),
    geometries,
    ribbons: ribbons.toSet(),
    grass: grass.toSet(),
    leaves: leaves.toSet(),
    leaflets: leaflets.toSet(),
    stems: stems.toSet(),
    moss: moss.toSet(),
    pebbles: pebbles.toSet(),
    particles,
  };
}

export function disposeAquascape(a: Aquascape) {
  a.substrate.dispose();
  a.rocks.forEach((r) => r.geometry.dispose());
  a.driftwood.forEach((g) => g.dispose());
  Object.values(a.geometries).forEach((g) => g.dispose());
}
