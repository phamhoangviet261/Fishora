'use client';

import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Cabinet } from './Cabinet';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { Room } from './Room';
import { Tank } from './Tank';
import { Effects } from './Effects';
import { WaterClock } from './WaterClock';

export function AquariumScene({ mobile, lightOn, onReady }: { mobile: boolean; lightOn: boolean; onReady?: () => void }) {
  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      dpr={[1, mobile ? 1.5 : 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 32, near: 0.05, far: 20, position: [0, 1.1, 2.3] }}
      onCreated={({ gl, scene, camera, advance }) => {
        gl.toneMappingExposure = 1.15;
        scene.background = new THREE.Color('#141518');
        onReady?.();
        if (process.env.NODE_ENV !== 'production') {
          (window as unknown as { __fishora: unknown }).__fishora = { gl, scene, camera, advance };
        }
      }}
    >
      <CameraRig />
      <WaterClock />
      <Lighting shadowSize={mobile ? 1024 : 2048} lightOn={lightOn} />
      <Room />
      <Cabinet />
      <Tank />
      <Effects mobile={mobile} />
    </Canvas>
  );
}
