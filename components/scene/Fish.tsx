'use client';

import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { FishSpecies } from '@/lib/fishSpecies';
import { FLOOR_Y, INNER, WATER_Y, substrateHeight } from '@/lib/tank';
import { applyUnderwater, waterTime } from '@/lib/underwater';
import { FishRig } from './fishRig';
import { eatPellet, nearestPellet } from '@/lib/game/food';

const MARGIN = 0.07;
const MIN_Y = FLOOR_Y + 0.12;
const MAX_Y = WATER_Y - 0.05;

// Rough keep-out above the rockscape so wander targets don't sit inside stone.
const ROCK_ZONES = [
  { x: -0.13, z: -0.04, r: 0.09, top: 0.99 },
  { x: 0.3, z: -0.06, r: 0.14, top: 1.11 },
  { x: 0.42, z: -0.12, r: 0.1, top: 1.08 },
];

// Live positions (and body lengths) of every fish, for simple separation steering.
const school = new Set<{ pos: THREE.Vector3; length: number }>();

function pickTarget(out: THREE.Vector3, depth: [number, number], margin: number) {
  for (let i = 0; i < 20; i++) {
    const x = THREE.MathUtils.randFloat(INNER.xMin + margin, INNER.xMax - margin);
    const z = THREE.MathUtils.randFloat(INNER.zMin + MARGIN, INNER.zMax - MARGIN * 0.8);
    let lo = Math.max(MIN_Y, substrateHeight(x, z) + 0.08);
    for (const r of ROCK_ZONES) if ((x - r.x) ** 2 + (z - r.z) ** 2 < r.r ** 2) lo = Math.max(lo, r.top + 0.04);
    if (lo >= MAX_Y) continue;
    const y = THREE.MathUtils.lerp(lo, MAX_Y, THREE.MathUtils.randFloat(depth[0], depth[1]));
    return out.set(x, y, z);
  }
  return out.set(0, (MIN_Y + MAX_Y) / 2, 0);
}

/** One fish wandering the tank: smooth steering toward random waypoints, optional hovering, gentle separation. */
export function Fish({ species }: { species: FishSpecies }) {
  const gltf = useLoader(GLTFLoader, species.url);
  const root = useRef<THREE.Group>(null);
  const margin = Math.max(MARGIN, species.length * 0.8);

  const { model, mixer, action, rig } = useMemo(() => {
    const model = cloneSkinned(gltf.scene) as THREE.Group;
    const hidden = species.hide ?? [];
    model.traverse((o) => {
      if (hidden.some((h) => o.name === h || o.name.startsWith(h))) o.visible = false;
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.SkinnedMesh;
        mesh.frustumCulled = false; // skinned bounds don't follow the animation
        mesh.castShadow = true;
        const src = mesh.material as THREE.MeshStandardMaterial;
        const mat = applyUnderwater(src.clone(), { caustics: 0.5, glow: 0.12 });
        mat.depthWrite = true; // keep translucent fins from sorting against the body
        mat.alphaTest = 0.08;
        mesh.material = mat;
        mesh.renderOrder = 1;
      }
    });

    // Normalise: centre on the origin and scale so the longest dimension is the species length.
    // Models are authored dorsal toward +Y; species.headAxis says where the head points.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const wrapper = new THREE.Group();
    model.position.sub(centre);
    wrapper.add(model);
    wrapper.scale.setScalar(species.length / Math.max(size.x, size.y, size.z));
    // Turn models authored head-along-+X so the head points along +Z like the steering expects.
    if (species.headAxis === '+x') wrapper.rotation.y = -Math.PI / 2;

    // The betta rig must be built while the skeleton is still in its rest pose.
    const rig = species.bettaRig ? new FishRig(model, wrapper) : null;

    const mixer = new THREE.AnimationMixer(model);
    const clip = gltf.animations[0];
    const action = clip ? mixer.clipAction(rig ? rig.filterClip(clip) : clip) : null;
    return { model: wrapper, mixer, action, rig };
  }, [gltf, species]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as unknown as { __fishora?: Record<string, unknown> };
    if (w.__fishora) w.__fishora[`fish_${species.id}`] = { mixer, action, rig };
  }, [mixer, action, rig, species.id]);

  // Start the clip in an effect (not in useMemo) so a Strict Mode unmount/remount restarts it.
  useEffect(() => {
    // Start each fish at a different point in its clip.
    action?.reset().play();
    if (action) action.time = Math.random() * action.getClip().duration;
    return () => {
      action?.stop();
    };
  }, [action]);

  useEffect(
    () => () => {
      model.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        m?.dispose();
      });
    },
    [model],
  );

  // Each fish gets its own temperament so identical species don't move in lockstep.
  const persona = useMemo(
    () => ({
      speed: THREE.MathUtils.randFloat(0.8, 1.2),
      hover: THREE.MathUtils.randFloat(0.7, 1.3),
      clip: THREE.MathUtils.randFloat(0.9, 1.1),
    }),
    [],
  );

  const sim = useMemo(() => {
    const pos = pickTarget(new THREE.Vector3(), species.depth, margin);
    return {
      pos,
      vel: new THREE.Vector3(species.cruise, 0, 0),
      target: pickTarget(new THREE.Vector3(), species.depth, margin),
      hover: 0,
      chasing: false,
      lastT: waterTime.value,
      quat: new THREE.Quaternion(),
      heading: 0,
      turnRate: 0,
    };
  }, [species, margin]);

  useEffect(() => {
    const entry = { pos: sim.pos, length: species.length };
    school.add(entry);
    return () => {
      school.delete(entry);
    };
  }, [sim, species.length]);

  const tmp = useMemo(
    () => ({ desired: new THREE.Vector3(), away: new THREE.Vector3(), look: new THREE.Matrix4(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), origin: new THREE.Vector3() }),
    [],
  );

  useFrame(() => {
    // Drive everything from the shared water clock so reduced-motion slows the fish too.
    const dt = Math.min(Math.max(waterTime.value - sim.lastT, 0), 0.1);
    sim.lastT = waterTime.value;
    if (dt === 0 || !root.current) return;
    const cruise = species.cruise * persona.speed;

    // Food beats wandering: chase the nearest pellet and eat it on contact.
    const food = nearestPellet(sim.pos);
    if (food) {
      sim.target.copy(food.pos);
      sim.target.y = Math.min(sim.target.y, MAX_Y);
      sim.hover = 0;
      sim.chasing = true;
      if (sim.pos.distanceTo(sim.target) < Math.max(0.025, species.length * 0.35)) eatPellet(food);
    } else if (sim.chasing) {
      sim.chasing = false;
      pickTarget(sim.target, species.depth, margin);
    }

    const toTarget = tmp.desired.copy(sim.target).sub(sim.pos);
    const dist = toTarget.length();
    if (sim.chasing) {
      // no hovering while there is food about
    } else if (sim.hover > 0) {
      sim.hover -= dt;
      if (sim.hover <= 0) pickTarget(sim.target, species.depth, margin);
    } else if (dist < Math.max(0.04, species.length * 0.5)) {
      sim.hover = Math.random() < species.hoverChance * persona.hover ? THREE.MathUtils.randFloat(...species.hoverTime) : 0;
      if (sim.hover === 0) pickTarget(sim.target, species.depth, margin);
    }

    // Steer: ease toward the target at cruise speed (slow to a drift while hovering).
    const speed = sim.chasing ? cruise * THREE.MathUtils.clamp(dist / 0.08, 0.6, 1.8) : sim.hover > 0 ? cruise * 0.15 : cruise * THREE.MathUtils.clamp(dist / 0.12, 0.45, 1);
    const desired = dist > 1e-4 ? toTarget.multiplyScalar(speed / dist) : toTarget.set(0, 0, 0);
    if (!sim.chasing) desired.y *= 0.6; // prefer level swimming

    // Separation: veer away from any fish inside personal space.
    for (const other of school) {
      if (other.pos === sim.pos) continue;
      const space = (species.length + other.length) * 0.75;
      const away = tmp.away.copy(sim.pos).sub(other.pos);
      const d = away.length();
      if (d > 1e-4 && d < space) desired.addScaledVector(away, (cruise * (1 - d / space)) / d);
    }

    sim.vel.lerp(desired, 1 - Math.exp(-dt * (sim.chasing ? 1.6 : 0.8)));
    sim.pos.addScaledVector(sim.vel, dt);
    const edge = species.length * 0.45;
    sim.pos.x = THREE.MathUtils.clamp(sim.pos.x, INNER.xMin + edge, INNER.xMax - edge);
    sim.pos.z = THREE.MathUtils.clamp(sim.pos.z, INNER.zMin + 0.035, INNER.zMax - 0.035);
    sim.pos.y = THREE.MathUtils.clamp(sim.pos.y, Math.max(MIN_Y - 0.04, substrateHeight(sim.pos.x, sim.pos.z) + 0.04), MAX_Y);

    // Face the direction of travel (keeping the last heading while nearly still).
    const v = sim.vel.length();
    if (v > 0.004) {
      const dir = tmp.desired.copy(sim.vel).normalize();
      dir.y = THREE.MathUtils.clamp(dir.y, -0.35, 0.35);
      tmp.look.lookAt(tmp.origin, dir.negate(), tmp.up);
      tmp.q.setFromRotationMatrix(tmp.look);
      sim.quat.slerp(tmp.q, 1 - Math.exp(-dt * species.turnRate));
    }
    root.current.position.copy(sim.pos);
    root.current.quaternion.copy(sim.quat);

    // Yaw rate drives the body bend into turns.
    const heading = Math.atan2(sim.vel.x, sim.vel.z);
    if (v > 0.004) {
      const dh = Math.atan2(Math.sin(heading - sim.heading), Math.cos(heading - sim.heading));
      sim.turnRate = THREE.MathUtils.lerp(sim.turnRate, dh / dt, 1 - Math.exp(-dt * 4));
      sim.heading = heading;
    } else {
      sim.turnRate *= Math.exp(-dt * 3);
    }

    const effort = v / cruise;
    if (action) action.timeScale = persona.clip * THREE.MathUtils.lerp(species.clipSpeed[0], species.clipSpeed[1], Math.min(effort, 1));
    mixer.update(dt);
    if (rig && !rig.disabled) rig.update(dt, effort, sim.turnRate);
  });

  return (
    <group ref={root}>
      <primitive object={model} />
    </group>
  );
}

/**
 * Keeps one fish's failure (e.g. a model file that is missing locally) from taking down the whole scene:
 * the fish is simply left out and a warning is logged.
 */
export class FishBoundary extends Component<{ id: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(`[Fishora] Fish "${this.props.id}" could not be loaded and was skipped.`, error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
