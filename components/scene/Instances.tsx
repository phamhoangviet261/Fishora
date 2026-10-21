'use client';

import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { InstanceSet } from '@/lib/aquascape';

interface Props {
  set: InstanceSet;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** Renders a pre-built InstanceSet as a single InstancedMesh (one draw call). */
export function Instances({ set, geometry, material, castShadow, receiveShadow }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(set.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(set.colors, 3);
    mesh.computeBoundingSphere();
  }, [set]);

  if (set.count === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, set.count]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}
