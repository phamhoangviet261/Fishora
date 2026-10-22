'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const SLUGS = [
  'double-saddle', 'powder-blue-tang', 'yellow-tang', 'caranx', 'bannerfish', 'bicolor-angelfish',
  'clown-triggerfish', 'convict-tang', 'emperor-angelfish', 'juvenile-angelfish', 'royal-angelfish', 'threadfin',
  'yellow-longnose', 'blue-tang', 'purple-tang', 'copperband', 'lined-surgeon', 'flame-angelfish',
  'fusilier', 'clownfish-black', 'clownfish-orange',
  ...Array.from({ length: 9 }, (_, i) => `discus-0${i + 1}`),
];
const COLS = 6;
const CELL = 1.2;

function Specimen({ slug, index }: { slug: string; index: number }) {
  const gltf = useLoader(GLTFLoader, `/models/fishes/coral-bay/${slug}.glb`);
  const { object, mixer } = useMemo(() => {
    const model = cloneSkinned(gltf.scene);
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).frustumCulled = false;
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(box.getCenter(new THREE.Vector3()));
    const wrapper = new THREE.Group();
    wrapper.add(model);
    wrapper.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
    const mixer = new THREE.AnimationMixer(model);
    return { object: wrapper, mixer };
  }, [gltf]);

  useEffect(() => {
    // Dev inspection handle (orientation / animation checks from the console).
    const w = window as unknown as { __gallery?: Record<string, unknown> };
    (w.__gallery ??= {})[slug] = { object, mixer, clip: gltf.animations[0] };
  }, [slug, object, mixer, gltf]);

  useEffect(() => {
    const action = gltf.animations[0] ? mixer.clipAction(gltf.animations[0]) : null;
    action?.reset().play();
    return () => {
      action?.stop();
    };
  }, [gltf, mixer]);

  useFrame((_, dt) => mixer.update(Math.min(dt, 0.1)));

  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return <primitive object={object} position={[(col - (COLS - 1) / 2) * CELL, -(row - 2) * CELL, 0]} />;
}

export function FishGallery() {
  return (
    <main style={{ position: 'fixed', inset: 0, background: '#1c2733' }}>
      <Canvas camera={{ position: [0, 0, 7.5], fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={['#1c2733']} />
        <hemisphereLight args={['#ffffff', '#445566', 1.2]} />
        <directionalLight position={[3, 4, 5]} intensity={2} />
        {SLUGS.map((slug, i) => (
          <Suspense key={slug} fallback={null}>
            <Specimen slug={slug} index={i} />
          </Suspense>
        ))}
      </Canvas>
      <ol style={{ position: 'absolute', top: 8, left: 8, margin: 0, padding: '6px 10px 6px 28px', font: '11px/1.35 system-ui', color: '#cfe0f0', background: 'rgba(0,0,0,.35)', borderRadius: 8, columns: 2 }}>
        {SLUGS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </main>
  );
}
