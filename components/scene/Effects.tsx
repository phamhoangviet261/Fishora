'use client';

import { Bloom, BrightnessContrast, DepthOfField, EffectComposer, HueSaturation, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { FLOOR_Y, TANK } from '@/lib/tank';

// Focus on the middle of the tank so the room behind it falls off into soft bokeh.
const FOCUS = new THREE.Vector3(0, FLOOR_Y + TANK.height * 0.45, 0);

/** Photographic finish: LED bloom, shallow depth of field on the room, and a clean, slightly warm grade. */
export function Effects({ mobile }: { mobile: boolean }) {
  return (
    <EffectComposer multisampling={mobile ? 0 : 4}>
      <>{!mobile && <DepthOfField target={FOCUS} worldFocusRange={0.9} bokehScale={3.5} />}</>
      <Bloom mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.15} intensity={0.4} radius={0.6} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={0.12} />
      <BrightnessContrast brightness={0.01} contrast={0.08} />
      <Vignette offset={0.32} darkness={0.55} />
    </EffectComposer>
  );
}
