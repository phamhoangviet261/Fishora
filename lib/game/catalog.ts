// Decor keys and the prototype constants still in use. Fish and every tunable number live in the database now.

export const WATER_CHANGE_COST = 5;

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

export function isKnownDecor(itemKey: string): boolean {
  return DECOR_KEYS.has(itemKey);
}
