'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import type { MapTheme } from './mapThemes';
import { PhuQuocDiorama } from './PhuQuoc';
import s from './fishing.module.css';

/** A small turning tabletop model of the map, shown on its card in the preparation screen. */
export function MapDiorama({ landmark }: { landmark: NonNullable<MapTheme['landmark']> }) {
  return (
    <div className={s.diorama} aria-hidden>
      <Canvas camera={{ position: [0, 0.42, 0.95], fov: 38 }} dpr={[1, 2]} onCreated={({ camera }) => camera.lookAt(0, 0.07, 0)}>
        <hemisphereLight args={['#fff6e6', '#5d6b7a', 1.1]} />
        <directionalLight position={[1.5, 2.5, 1.2]} intensity={1.8} color="#ffe2b8" />
        <Suspense fallback={null}>{landmark === 'phuQuoc' && <PhuQuocDiorama />}</Suspense>
      </Canvas>
    </div>
  );
}
