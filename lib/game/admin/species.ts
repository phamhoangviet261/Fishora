import type { Prisma, Species } from '@prisma/client';
import { configProfile } from '../config';
import { matureFish } from '../rewards';
import { GameError, type PlayerCtx, type Tx } from '../tx';
import { RARITIES, type RewardBundle } from '../types';
import { adminTx } from './context';

// Species admin (spec §6.3, §6.4, §12). The key is immutable; species are deactivated or soft-deleted, never
// removed; every change writes a before/after snapshot with the fish it touched, in the same transaction.

const INT_FIELDS = [
  'maxWeightGrams',
  'spawnWeightMinGrams',
  'spawnWeightMaxGrams',
  'spawnAgeMinDays',
  'spawnAgeMaxDays',
  'growthGramsPerTick',
  'foodUnitsPerFeed',
  'valuePerKg',
  'maturitySaleBonusCoins',
  'maturitySaleBonusPct',
] as const;

export type SpeciesPatch = Partial<
  Pick<Species, (typeof INT_FIELDS)[number] | 'displayName' | 'modelKey' | 'rarity' | 'buyPrice' | 'active'> & { maturityReward: RewardBundle; deleted: boolean }
>;

const ALLOWED = new Set<string>([...INT_FIELDS, 'displayName', 'modelKey', 'rarity', 'buyPrice', 'active', 'maturityReward', 'deleted']);
const bad = (field: string) => new GameError('invalid_input', 400, { field });

export function validateRewardBundle(b: unknown): RewardBundle {
  if (!b || typeof b !== 'object') throw bad('reward');
  const r = b as RewardBundle;
  const okInt = (n: unknown) => n === undefined || (typeof n === 'number' && Number.isInteger(n) && n >= 0);
  if (!okInt(r.coins) || !okInt(r.exp)) throw bad('reward');
  if (r.items !== undefined && (!Array.isArray(r.items) || !r.items.every((i) => typeof i?.itemKey === 'string' && Number.isInteger(i.qty) && i.qty > 0))) throw bad('reward');
  return { ...(r.coins ? { coins: r.coins } : {}), ...(r.exp ? { exp: r.exp } : {}), ...(r.items?.length ? { items: r.items } : {}) };
}

/** Checks every field before anything is written. */
function validate(patch: Record<string, unknown>, current: Species): Prisma.SpeciesUpdateInput {
  const data: Prisma.SpeciesUpdateInput = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED.has(k)) throw bad(k);
    if ((INT_FIELDS as readonly string[]).includes(k)) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw bad(k);
      (data as Record<string, unknown>)[k] = v;
    } else if (k === 'displayName' || k === 'modelKey') {
      if (typeof v !== 'string' || !v.trim() || v.length > 60) throw bad(k);
      data[k] = v.trim();
    } else if (k === 'rarity') {
      if (!RARITIES.includes(v as never)) throw bad(k);
      data.rarity = v as Species['rarity'];
    } else if (k === 'buyPrice') {
      if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 0)) throw bad(k);
      data.buyPrice = v as number | null;
    } else if (k === 'active' || k === 'deleted') {
      if (typeof v !== 'boolean') throw bad(k);
      if (k === 'active') data.active = v;
      else data.deletedAt = v ? new Date() : null;
    } else if (k === 'maturityReward') {
      data.maturityReward = validateRewardBundle(v) as Prisma.InputJsonValue;
    }
  }
  const merged = { ...current, ...(data as Partial<Species>) };
  if (merged.maxWeightGrams < 1 || merged.spawnWeightMinGrams < 1) throw bad('maxWeightGrams');
  if (merged.spawnWeightMinGrams > merged.spawnWeightMaxGrams || merged.spawnWeightMaxGrams > merged.maxWeightGrams) throw bad('spawnWeightMinGrams');
  if (merged.spawnAgeMinDays > merged.spawnAgeMaxDays) throw bad('spawnAgeMinDays');
  if (merged.foodUnitsPerFeed < 1) throw bad('foodUnitsPerFeed');
  return data;
}

function kindOf(patch: SpeciesPatch): string {
  const keys = Object.keys(patch);
  if (keys.length === 1 && keys[0] === 'displayName') return 'rename';
  if (keys.length === 1 && keys[0] === 'active') return patch.active ? 'activate' : 'deactivate';
  if (patch.deleted === true) return 'soft_delete';
  return 'update';
}

const snapshot = (s: Species) => JSON.parse(JSON.stringify(s)) as Prisma.InputJsonValue;

export function updateSpecies(adminId: string, key: string, patch: SpeciesPatch): Promise<Species> {
  return adminTx(async (tx, ctx) => {
    const before = await tx.species.findUnique({ where: { key } });
    if (!before) throw new GameError('not_found', 404);
    const data = validate(patch as Record<string, unknown>, before);
    const after = await tx.species.update({ where: { key }, data: { ...data, version: { increment: 1 } } });
    if (patch.maxWeightGrams !== undefined) await reconcileMaturity(tx, key, ctx);
    const affected = await tx.fish.findMany({ where: { speciesKey: key, status: { in: ['alive', 'dead'] } }, select: { id: true }, orderBy: { id: 'asc' } });
    await tx.speciesChangeLog.create({
      data: { speciesKey: key, adminId, kind: kindOf(patch), before: snapshot(before), after: snapshot(after), affectedFishIds: affected.map((f) => f.id) },
    });
    return after;
  });
}

export function createSpecies(adminId: string, key: string, data: SpeciesPatch & { displayName: string; modelKey: string; rarity: Species['rarity'] }): Promise<Species> {
  return adminTx(async (tx) => {
    if (!/^[a-z0-9_]{2,40}$/.test(key)) throw bad('key');
    if (await tx.species.findUnique({ where: { key } })) throw new GameError('duplicate', 409);
    const blank: Species = {
      key, profile: configProfile(), displayName: '', rarity: 'common', modelKey: '', maxWeightGrams: 1, spawnWeightMinGrams: 1, spawnWeightMaxGrams: 1,
      spawnAgeMinDays: 0, spawnAgeMaxDays: 0, growthGramsPerTick: 0, foodUnitsPerFeed: 1, valuePerKg: 0, buyPrice: null, maturityReward: {},
      maturitySaleBonusCoins: 0, maturitySaleBonusPct: 0, active: true, deletedAt: null, version: 1,
    };
    const fields = validate(data as Record<string, unknown>, blank);
    const created = await tx.species.create({ data: { ...(blank as Prisma.SpeciesCreateInput), ...(fields as Prisma.SpeciesCreateInput), key } });
    await tx.speciesChangeLog.create({ data: { speciesKey: key, adminId, kind: 'create', after: snapshot(created), affectedFishIds: [] } });
    return created;
  });
}

/** Live fish now at or over a lowered max mature at once, weight untouched; a matured fish never re-earns the reward. */
async function reconcileMaturity(tx: Tx, speciesKey: string, ctx: PlayerCtx): Promise<void> {
  const species = await tx.species.findUniqueOrThrow({ where: { key: speciesKey } });
  const fish = await tx.fish.findMany({
    where: { speciesKey, status: 'alive', maturedAt: null, weightGrams: { gte: species.maxWeightGrams } },
    include: { species: true },
  });
  for (const f of fish) await matureFish(tx, f.userId, f, ctx.now, ctx);
}

export function listSpecies() {
  return adminTx((tx) => tx.species.findMany({ where: { profile: configProfile() }, orderBy: [{ deletedAt: 'asc' }, { key: 'asc' }] }));
}
