import { TANK_FISH } from '@/lib/fishSpecies';

// Server-side list of what can exist in an inventory. Prices arrive with the shop (Phase 4).

export const STARTING_COINS = 250; // D-040: prototype value until the economy is balanced
export const WATER_CHANGE_COST = 5;

export type ItemKind = 'fish' | 'decor';

const FISH_KEYS = new Set(TANK_FISH.map((f) => f.id));

/** Poly Haven scans shipped in public/models/scape. */
const DECOR_KEYS = new Set([
  'root_cluster_01',
  'single_root',
  'dead_quiver_branch_01',
  'namaqualand_boulder_05',
  'rock_07',
  'rock_moss_set_01',
  'rock_moss_set_02',
  'fern_02',
  'anthurium_botany_01',
  'moss_01',
]);

export function isKnownItem(kind: string, itemKey: string): boolean {
  return kind === 'fish' ? FISH_KEYS.has(itemKey) : kind === 'decor' ? DECOR_KEYS.has(itemKey) : false;
}

/** The fish a new player starts with: the prototype tank's population, one entry per fish. */
export function startingFish(): string[] {
  return TANK_FISH.map((f) => f.id);
}
