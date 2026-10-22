// Per-species model and behaviour settings. Licensing for each model is tracked in CREDITS.md.

export interface FishSpecies {
  id: string; // unique per model
  /** i18n key suffix (fish.<group>) and HUD grouping; colour variants of one species share a group. */
  group: string;
  url: string;
  /** Nose-to-tail length in metres once normalised. */
  length: number;
  /** Cruise speed in m/s. */
  cruise: number;
  /** Chance of pausing to hover on reaching a waypoint, and how long (seconds). */
  hoverChance: number;
  hoverTime: [number, number];
  /** Preferred band of the water column, 0 = just above the hardscape, 1 = just under the surface. */
  depth: [number, number];
  /** How quickly the fish changes heading (higher = snappier). */
  turnRate: number;
  /** Clip playback speed at rest and at cruise. */
  clipSpeed: [number, number];
  /** Model axis the head points along. Defaults to +Z. */
  headAxis?: '+z' | '+x';
  /** Use the procedural betta fin rig on top of the clip (the baked betta clip barely moves). */
  bettaRig?: boolean;
  /** Node names (or prefixes) to hide, e.g. stray helper meshes in an export. */
  hide?: string[];
}

/** Global size multiplier for every fish (user-tuned: the original sizes read too large in the 120cm tank). */
export const FISH_SIZE = 0.5;

export const BETTA: FishSpecies = {
  id: 'betta',
  group: 'betta',
  url: '/models/fishes/first-fish.glb',
  length: 0.09 * FISH_SIZE,
  cruise: 0.022,
  hoverChance: 0.55,
  hoverTime: [2.5, 6],
  depth: [0.35, 1],
  turnRate: 1.6,
  clipSpeed: [0.7, 0.7],
  bettaRig: true,
  hide: ['Cube', 'Betta_Splendens_Part02'],
};

// Tuna.glb ships with no author or license metadata — local preview only, see CREDITS.md.
// Shown at a small, tank-friendly size; a real tuna would not fit this aquarium.
export const TUNA: FishSpecies = {
  id: 'tuna',
  group: 'tuna',
  url: '/models/fishes/Tuna.glb',
  length: 0.15 * FISH_SIZE,
  cruise: 0.045,
  hoverChance: 0, // tuna never stop swimming
  hoverTime: [0, 0],
  depth: [0.15, 0.8],
  turnRate: 1.1,
  clipSpeed: [0.6, 1.1],
};

// ---------------------------------------------------------------- "Fish Pack 30 - Coral Bay"
// Split by scripts/split-fish-pack.mjs. License unverified — local preview only, see CREDITS.md.
// Every model in the pack is authored head toward +X.

type Behaviour = Pick<FishSpecies, 'cruise' | 'hoverChance' | 'hoverTime' | 'depth' | 'turnRate' | 'clipSpeed'>;

const TANG: Behaviour = { cruise: 0.04, hoverChance: 0.15, hoverTime: [1, 3], depth: [0.2, 0.85], turnRate: 1.5, clipSpeed: [0.8, 1.2] };
const GLIDER: Behaviour = { cruise: 0.027, hoverChance: 0.35, hoverTime: [2, 5], depth: [0.05, 0.6], turnRate: 1.3, clipSpeed: [0.7, 1.0] };
const CLOWN: Behaviour = { cruise: 0.03, hoverChance: 0.5, hoverTime: [1.5, 4], depth: [0.05, 0.5], turnRate: 2.0, clipSpeed: [0.9, 1.2] };
const CRUISER: Behaviour = { cruise: 0.055, hoverChance: 0, hoverTime: [0, 0], depth: [0.3, 1], turnRate: 1.0, clipSpeed: [0.9, 1.3] };
const DISCUS: Behaviour = { cruise: 0.024, hoverChance: 0.45, hoverTime: [2, 6], depth: [0.25, 0.85], turnRate: 1.2, clipSpeed: [0.7, 1.0] };
const TRIGGER: Behaviour = { cruise: 0.03, hoverChance: 0.3, hoverTime: [1.5, 4], depth: [0.05, 0.5], turnRate: 1.6, clipSpeed: [0.8, 1.1] };

const coral = (id: string, group: string, length: number, b: Behaviour): FishSpecies => ({
  id,
  group,
  url: `/models/fishes/coral-bay/${id}.glb`,
  length: length * FISH_SIZE,
  headAxis: '+x',
  ...b,
});

export const CORAL_BAY: FishSpecies[] = [
  coral('double-saddle', 'doubleSaddle', 0.1, GLIDER),
  coral('powder-blue-tang', 'powderBlueTang', 0.12, TANG),
  coral('yellow-tang', 'yellowTang', 0.11, TANG),
  coral('caranx', 'caranx', 0.15, CRUISER),
  coral('bannerfish', 'bannerfish', 0.12, GLIDER),
  coral('bicolor-angelfish', 'bicolorAngelfish', 0.09, GLIDER),
  coral('clown-triggerfish', 'clownTriggerfish', 0.13, TRIGGER),
  coral('convict-tang', 'convictTang', 0.1, TANG),
  coral('emperor-angelfish', 'emperorAngelfish', 0.15, GLIDER),
  coral('juvenile-angelfish', 'juvenileAngelfish', 0.09, GLIDER),
  coral('royal-angelfish', 'royalAngelfish', 0.08, GLIDER),
  coral('threadfin', 'threadfin', 0.11, GLIDER),
  coral('yellow-longnose', 'yellowLongnose', 0.1, GLIDER),
  coral('blue-tang', 'blueTang', 0.13, TANG),
  coral('purple-tang', 'purpleTang', 0.12, TANG),
  coral('copperband', 'copperband', 0.11, GLIDER),
  coral('lined-surgeon', 'linedSurgeon', 0.14, TANG),
  coral('flame-angelfish', 'flameAngelfish', 0.08, GLIDER),
  coral('fusilier', 'fusilier', 0.11, CRUISER),
  coral('clownfish-black', 'clownfishBlack', 0.07, CLOWN),
  coral('clownfish-orange', 'clownfishOrange', 0.07, CLOWN),
  ...[0.12, 0.13, 0.11, 0.12, 0.1, 0.12, 0.11, 0.13, 0.12].map((len, i) => coral(`discus-0${i + 1}`, 'discus', len, DISCUS)),
];

// TUNA is defined above but left out: its model file is no longer in public/models/fishes.
export const TANK_FISH: FishSpecies[] = [BETTA, ...CORAL_BAY];

/** HUD summary: one entry per species group, in tank order. */
export function fishGroups(fish: FishSpecies[] = TANK_FISH): { species: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const f of fish) counts.set(f.group, (counts.get(f.group) ?? 0) + 1);
  return [...counts].map(([species, count]) => ({ species, count }));
}
