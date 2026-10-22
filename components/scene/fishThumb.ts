'use client';

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BETTA, TANK_FISH } from '@/lib/fishSpecies';

// Still pictures of a species' 3D model for lists (storage cards). One shared offscreen renderer draws each model
// once, side-on, and the PNG is cached per model key: a page of cards costs no WebGL context of its own, and a
// browser allows only a handful of those.

const MODELS = new Map(TANK_FISH.map((sp) => [sp.id, sp]));
const W = 320;
const H = 200;

const cache = new Map<string, Promise<string>>();
let renderer: THREE.WebGLRenderer | null = null;
const loader = new GLTFLoader();

function draw(modelKey: string): Promise<string> {
  const species = MODELS.get(modelKey) ?? BETTA;
  return loader.loadAsync(species.url).then((gltf) => {
    renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);

    const model = gltf.scene;
    const hidden = species.hide ?? [];
    model.traverse((o) => {
      if (hidden.some((h) => o.name === h || o.name.startsWith(h))) o.visible = false;
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const dims = box.getSize(new THREE.Vector3());
    model.position.sub(box.getCenter(new THREE.Vector3()));
    const wrapper = new THREE.Group();
    wrapper.add(model);
    wrapper.scale.setScalar(1 / Math.max(dims.x, dims.y, dims.z));
    // Models swim towards +z (or +x); turn the head to the right and a little towards the viewer.
    wrapper.rotation.y = (species.headAxis === '+x' ? 0 : Math.PI / 2) - 0.45;

    const scene = new THREE.Scene();
    scene.add(wrapper, new THREE.AmbientLight(0xffffff, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(1, 2, 3);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 10);
    camera.position.set(0, 0.12, 1.9);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  });
}

/** A data-URL picture of the species' model, or null while it is being drawn (or if the model failed to load). */
export function useFishThumb(modelKey: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let p = cache.get(modelKey);
    if (!p) {
      p = draw(modelKey);
      p.catch(() => cache.delete(modelKey));
      cache.set(modelKey, p);
    }
    p.then((u) => live && setUrl(u)).catch(() => {});
    return () => {
      live = false;
    };
  }, [modelKey]);
  return url;
}
