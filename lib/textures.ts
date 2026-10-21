import * as THREE from 'three';
import { fbm2, mulberry32, noise2 } from './noise';

type RGB = [number, number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function pixelTexture(
  w: number,
  h: number,
  shade: (x: number, y: number) => RGB,
  { srgb = true, repeat = [1, 1] as [number, number] } = {},
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = shade(x, y);
      const i = (y * w + x) * 4;
      img.data[i] = clamp01(c[0]) * 255;
      img.data[i + 1] = clamp01(c[1]) * 255;
      img.data[i + 2] = clamp01(c[2]) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  return tex;
}

/** Long-grain wood; grain runs along the U axis. */
export function woodTexture(dark: RGB, light: RGB, seed = 1, w = 1024, h = 256): THREE.CanvasTexture {
  return pixelTexture(w, h, (x, y) => {
    const warp = fbm2(x / 260, y / 26, 4, seed);
    const ring = 0.5 + 0.5 * Math.sin((y / h) * 34 + warp * 9);
    const streak = noise2(x / 40, y / 1.6, seed + 3);
    const t = clamp01(ring * 0.55 + warp * 0.35 + streak * 0.2 - 0.1);
    const c = mix(dark, light, t);
    const fleck = 0.94 + 0.06 * noise2(x / 2, y / 2, seed + 9);
    return [c[0] * fleck, c[1] * fleck, c[2] * fleck];
  });
}

/** Oak floor planks running front-to-back (along V). 1024px covers 2m. */
export function plankTexture(): THREE.CanvasTexture {
  const rand = mulberry32(42);
  const plankPx = 92; // ~0.18m
  const cols = Math.ceil(1024 / plankPx) + 1;
  const tones: number[] = [];
  const joints: number[] = [];
  for (let i = 0; i < cols; i++) {
    tones.push(0.82 + rand() * 0.3);
    joints.push(rand() * 1024);
  }
  const dark: RGB = [0.29, 0.19, 0.12];
  const light: RGB = [0.55, 0.39, 0.25];
  return pixelTexture(1024, 1024, (x, y) => {
    const col = Math.floor(x / plankPx);
    const lx = x - col * plankPx;
    const tone = tones[col % cols];
    const grain = fbm2(x / 9, y / 140, 3, col + 5);
    let c = mix(dark, light, clamp01(grain * 0.9 + 0.1));
    c = [c[0] * tone, c[1] * tone, c[2] * tone];
    const seam = lx < 2 || Math.abs(((y + joints[col % cols]) % 1024) - 512) < 1.2;
    if (seam) c = [c[0] * 0.45, c[1] * 0.45, c[2] * 0.45];
    return c;
  }, { repeat: [6, 6] });
}

/** Soft warm plaster wall. */
export function plasterTexture(): THREE.CanvasTexture {
  const base: RGB = [0.66, 0.62, 0.56];
  return pixelTexture(512, 512, (x, y) => {
    const n = fbm2(x / 70, y / 70, 4, 21) * 0.7 + noise2(x / 3, y / 3, 22) * 0.3;
    const k = 0.9 + 0.12 * n;
    return [base[0] * k, base[1] * k, base[2] * k];
  }, { repeat: [5, 2] });
}

/** Sand: fine multi-coloured grains over low-frequency tone variation. Also used as a bump map. */
export function sandTexture(): THREE.CanvasTexture {
  const rand = mulberry32(7);
  const sand: RGB = [0.78, 0.7, 0.57];
  const darkGrain: RGB = [0.36, 0.31, 0.26];
  const lightGrain: RGB = [0.95, 0.91, 0.82];
  return pixelTexture(512, 512, (x, y) => {
    const tone = 0.85 + 0.2 * fbm2(x / 60, y / 60, 3, 31);
    const g = rand();
    let c: RGB = sand;
    if (g < 0.12) c = mix(sand, darkGrain, 0.7);
    else if (g > 0.9) c = mix(sand, lightGrain, 0.6);
    const grain = 0.88 + 0.12 * noise2(x / 1.5, y / 1.5, 33);
    return [c[0] * tone * grain, c[1] * tone * grain, c[2] * tone * grain];
  }, { repeat: [1, 1] });
}

/** Woven rug with a muted border band. */
export function rugTexture(): THREE.CanvasTexture {
  const field: RGB = [0.62, 0.5, 0.4];
  const band: RGB = [0.42, 0.25, 0.18];
  const cream: RGB = [0.82, 0.75, 0.64];
  const w = 512;
  const h = 384;
  return pixelTexture(w, h, (x, y) => {
    const ex = Math.min(x, w - 1 - x);
    const ey = Math.min(y, h - 1 - y);
    const e = Math.min(ex, ey);
    let c = field;
    if (e < 26) c = band;
    else if (e < 32) c = cream;
    else if (e < 44) c = band;
    else {
      const d = Math.abs(((x - w / 2) % 64) + ((y - h / 2) % 64)) % 64;
      if (d < 3) c = mix(field, cream, 0.5);
    }
    const weave = 0.86 + 0.14 * ((x + y) % 3 === 0 ? 1 : 0) * noise2(x / 2, y / 2, 5);
    const tone = 0.92 + 0.12 * fbm2(x / 40, y / 40, 3, 6);
    return [c[0] * weave * tone, c[1] * weave * tone, c[2] * weave * tone];
  });
}

/** Painterly abstract landscape for the wall art. */
export function artTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 320;
  const sky: RGB = [0.78, 0.7, 0.58];
  const hill: RGB = [0.42, 0.47, 0.36];
  const far: RGB = [0.6, 0.6, 0.52];
  const soil: RGB = [0.55, 0.4, 0.28];
  return pixelTexture(w, h, (x, y) => {
    const u = x / w;
    const v = y / h;
    const n = fbm2(x / 30, y / 30, 4, 50);
    const farLine = 0.5 + 0.06 * Math.sin(u * 5 + 1) + 0.05 * (n - 0.5);
    const nearLine = 0.66 + 0.08 * Math.sin(u * 3.3 + 2.4) + 0.06 * (n - 0.5);
    let c = mix(sky, [0.85, 0.78, 0.66], v);
    if (v > farLine) c = far;
    if (v > nearLine) c = mix(hill, soil, clamp01((v - nearLine) * 3));
    const brush = 0.92 + 0.1 * noise2(x / 3, y / 9, 51);
    return [c[0] * brush, c[1] * brush, c[2] * brush];
  });
}

/** Back-of-tank gradient film, pre-tinted to read as seen through water. */
export function backdropTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const glow: RGB = [0.72, 0.9, 0.92];
  const edge: RGB = [0.14, 0.34, 0.44];
  return pixelTexture(w, h, (x, y) => {
    const u = x / w - 0.5;
    const v = 1 - y / h; // 0 bottom
    const d = Math.sqrt(u * u * 1.6 + (v - 0.38) ** 2 * 2.2);
    const t = clamp01(1 - d * 1.45);
    const c = mix(edge, glow, t * t * (3 - 2 * t));
    return c;
  });
}
