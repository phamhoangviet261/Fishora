import { fbm2 } from './noise';

// World units are metres. The tank sits centred on x = 0, z = 0.
export const TANK = {
  width: 1.2,
  height: 0.5,
  depth: 0.45,
  glass: 0.01,
  baseY: 0.805, // top of the cabinet + leveling mat
};

export const TANK_TOP_Y = TANK.baseY + TANK.height;
export const FLOOR_Y = TANK.baseY + TANK.glass;
export const WATER_Y = TANK_TOP_Y - 0.05;
export const FRONT_Z = TANK.depth / 2;

export const INNER = {
  xMin: -TANK.width / 2 + TANK.glass,
  xMax: TANK.width / 2 - TANK.glass,
  zMin: -TANK.depth / 2 + TANK.glass,
  zMax: TANK.depth / 2 - TANK.glass,
};

/** World-space height of the substrate surface: sloped from front to back, with a mound under the main rock. */
export function substrateHeight(x: number, z: number): number {
  const t = (INNER.zMax - z) / (INNER.zMax - INNER.zMin); // 0 front, 1 back
  let h = 0.035 + 0.075 * Math.pow(Math.max(t, 0), 1.3);
  h += 0.028 * Math.exp(-((x + 0.13) ** 2) / 0.03 - ((z + 0.04) ** 2) / 0.012);
  h += 0.014 * Math.pow(Math.abs(x) / INNER.xMax, 3);
  h += 0.008 * (fbm2(x * 9 + 4, z * 9 + 2, 3, 11) - 0.5);
  return FLOOR_Y + h;
}
