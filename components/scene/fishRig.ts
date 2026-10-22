import * as THREE from 'three';

/**
 * Procedural swim layer for the betta rig, applied on top of the baked clip every frame.
 * The baked "Take 01" only nudges a few fins and leaves the spine still, so this adds:
 *  - a body wave travelling from mid-body to the tail,
 *  - a slower, trailing ripple through the long caudal / dorsal / anal fins,
 *  - quick alternating pectoral beats (kept going while hovering),
 *  - gentle ventral fin sway,
 *  - a bend into turns.
 *
 * Bone roles were identified from the hierarchy in first-fish.glb (Bone.002→.005 spine to tail,
 * .005's children = caudal rays, .003/.004 side chains = dorsal/anal, .046–.051 = pectorals,
 * .010–.017 = ventral fins, .027–.032 = gill/opercular fins).
 */

type Axis = 'up' | 'forward';

interface Driver {
  bone: THREE.Bone;
  rest: THREE.Quaternion; // bind-pose rotation; offsets are applied on top of this
  axis: THREE.Vector3; // rotation axis in the bone's local frame
  amp: number; // radians at full swimming intensity
  idleAmp: number; // radians while hovering
  phase: number; // phase lag behind the driving wave
  rate: number; // multiple of the base beat frequency
  turn: number; // how much this bone bends into turns
}

interface Spec {
  ids: string[];
  axis: Axis;
  amp: number;
  idle?: number;
  phase0?: number;
  phaseStep?: number;
  rate?: number;
  sign?: number;
  turn?: number;
}

// Amplitudes are the TOTAL angle across a chain (children inherit their parent's rotation, so per-bone
// values would compound). The constructor spreads each total over the chain, weighted toward the tip.
const SPECS: Spec[] = [
  // Spine: gentle body wave, phase lags toward the tail.
  { ids: ['002', '003', '004', '005'], axis: 'up', amp: 0.2, idle: 0.04, phaseStep: 0.7, turn: 0.22 },
  // Caudal fin rays: trailing ripple (adds to the spine's swing).
  { ids: ['020', '025', '026'], axis: 'up', amp: 0.22, idle: 0.1, phase0: 1.6, phaseStep: 0.5 },
  { ids: ['039', '040', '041'], axis: 'up', amp: 0.2, idle: 0.09, phase0: 1.5, phaseStep: 0.5 },
  { ids: ['042', '043'], axis: 'up', amp: 0.22, idle: 0.1, phase0: 1.7, phaseStep: 0.5 },
  { ids: ['044', '045'], axis: 'up', amp: 0.2, idle: 0.09, phase0: 1.4, phaseStep: 0.5 },
  // Dorsal / anal fins: soft sideways ripple following the body.
  { ids: ['019', '023', '024'], axis: 'up', amp: 0.14, idle: 0.06, phase0: 1.2, phaseStep: 0.45 },
  { ids: ['034', '036', '038'], axis: 'up', amp: 0.14, idle: 0.06, phase0: 1.3, phaseStep: 0.45 },
  { ids: ['018', '021', '022'], axis: 'up', amp: 0.12, idle: 0.05, phase0: 0.9, phaseStep: 0.45 },
  { ids: ['033', '035', '037'], axis: 'up', amp: 0.12, idle: 0.05, phase0: 1.0, phaseStep: 0.45 },
  // Pectoral fins: fan back and forth, alternating sides; busiest while hovering.
  { ids: ['048', '050'], axis: 'up', amp: 0.3, idle: 0.4, rate: 1.6, phaseStep: 0.4, sign: 1 },
  { ids: ['049', '051'], axis: 'up', amp: 0.3, idle: 0.4, rate: 1.6, phase0: Math.PI, phaseStep: 0.4, sign: -1 },
  // Ventral fins: slow trailing sway.
  { ids: ['012', '014', '016'], axis: 'up', amp: 0.12, idle: 0.1, rate: 0.6, phase0: 0.6, phaseStep: 0.4 },
  { ids: ['013', '015', '017'], axis: 'up', amp: 0.12, idle: 0.1, rate: 0.6, phase0: 0.9, phaseStep: 0.4 },
  // Gill / opercular fins: small flutter.
  { ids: ['029', '031'], axis: 'forward', amp: 0.08, idle: 0.1, rate: 1.2, phaseStep: 0.3, sign: 1 },
  { ids: ['030', '032'], axis: 'forward', amp: 0.08, idle: 0.1, rate: 1.2, phase0: Math.PI, phaseStep: 0.3, sign: -1 },
];

const boneId = (name: string) => {
  // GLTFLoader sanitises "Bone.031_Armature" to "Bone031_Armature".
  const m = name.match(/^Bone\.?(\d{3})_Armature$/);
  return m ? m[1] : null;
};

export class FishRig {
  /** Dev toggle for inspecting the baked clip alone. */
  disabled = false;
  private drivers: Driver[] = [];
  private driven = new Set<string>();
  private phase = 0;
  private q = new THREE.Quaternion();

  /** `model` must be in its rest pose, parented under a wrapper whose +Z is the head and +Y is dorsal. */
  constructor(model: THREE.Object3D, wrapper: THREE.Object3D) {
    const bones = new Map<string, THREE.Bone>();
    model.traverse((o) => {
      const id = (o as THREE.Bone).isBone ? boneId(o.name) : null;
      if (id) bones.set(id, o as THREE.Bone);
    });

    wrapper.updateMatrixWorld(true);
    const wrapperInv = wrapper.getWorldQuaternion(new THREE.Quaternion()).invert();
    const up = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3(0, 0, 1);
    const boneQ = new THREE.Quaternion();

    for (const spec of SPECS) {
      // Weights rise toward the tip; normalised so the whole chain bends by the spec's total.
      const n = spec.ids.length;
      const weights = spec.ids.map((_, i) => 0.5 + (n > 1 ? i / (n - 1) : 1));
      const sum = weights.reduce((a, w) => a + w, 0);
      spec.ids.forEach((id, i) => {
        const bone = bones.get(id);
        if (!bone) return;
        // Express the fish-space axis in this bone's local frame (rest pose).
        bone.getWorldQuaternion(boneQ).premultiply(wrapperInv).invert();
        const axis = (spec.axis === 'up' ? up : forward).clone().applyQuaternion(boneQ).normalize();
        if (spec.sign && spec.sign < 0) axis.negate();
        const share = weights[i] / sum;
        this.driven.add(bone.name);
        this.drivers.push({
          bone,
          rest: bone.quaternion.clone(),
          axis,
          amp: spec.amp * share,
          idleAmp: (spec.idle ?? spec.amp * 0.3) * share,
          phase: (spec.phase0 ?? 0) + (spec.phaseStep ?? 0) * i,
          rate: spec.rate ?? 1,
          turn: (spec.turn ?? 0) * share,
        });
      });
    }
  }

  get boneCount() {
    return this.drivers.length;
  }

  /**
   * The baked clip holds static keys on the spine and fin roots that bend the tail ~45° to one side for the
   * whole loop. Keep only tracks that genuinely animate and that this rig does not drive.
   */
  filterClip(clip: THREE.AnimationClip): THREE.AnimationClip {
    const tracks = clip.tracks.filter((t) => t.times.length > 2 && !this.driven.has(t.name.split('.')[0]));
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  /**
   * Call after mixer.update(). Driven bones are rebuilt from their bind pose each frame, so offsets never accumulate.
   * @param effort 0 (hovering) … 1 (cruising) … >1 (sprinting)
   * @param turnRate signed yaw rate in rad/s (positive = turning left)
   */
  update(dt: number, effort: number, turnRate: number) {
    const e = THREE.MathUtils.clamp(effort, 0, 1.6);
    const freq = 0.7 + 1.0 * e; // tail beats per second
    this.phase += dt * freq * Math.PI * 2;
    const bend = THREE.MathUtils.clamp(turnRate * 0.5, -1, 1);
    for (const d of this.drivers) {
      const amp = THREE.MathUtils.lerp(d.idleAmp, d.amp, Math.min(e, 1)) * (e > 1 ? 1 + (e - 1) * 0.5 : 1);
      const angle = Math.sin(this.phase * d.rate - d.phase) * amp + bend * d.turn;
      d.bone.quaternion.copy(d.rest).multiply(this.q.setFromAxisAngle(d.axis, angle));
    }
  }
}
