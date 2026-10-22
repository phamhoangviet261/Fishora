import { configProfile } from './config';
import { createFish } from './fish/create';
import { adjustCoins } from './ledger';
import { pickWeighted } from './rng';
import { assertFishStorage, grantItemOrThrow, takeItem } from './storage';
import { GameError, type PlayerCtx, type Tx } from './tx';
import { upgradeStatus } from './upgrades';

// Shop (spec §8.2, §8.3). Every check that can fail runs before or inside the same transaction as the charge,
// so a refused purchase never costs coins. Bought fish always land in storage first.

const liveSpecies = () => ({ profile: configProfile(), active: true, deletedAt: null });

async function boxEntries(tx: Tx, boxKey: string) {
  const entries = await tx.blindboxEntry.findMany({ where: { boxKey, species: liveSpecies() }, include: { species: true } });
  if (entries.length === 0) throw new GameError('not_found', 404);
  return entries;
}

export async function shopCatalog(tx: Tx, userId: string, _ctx: PlayerCtx) {
  const profile = configProfile();
  const [species, items] = await Promise.all([
    tx.species.findMany({ where: { ...liveSpecies(), buyPrice: { not: null } }, orderBy: [{ buyPrice: 'asc' }, { key: 'asc' }] }),
    tx.itemDef.findMany({ where: { profile, active: true, shopVisible: true, price: { not: null } }, orderBy: [{ category: 'asc' }, { price: 'asc' }] }),
  ]);

  const blindboxes = [];
  for (const box of items.filter((i) => i.category === 'blindbox')) {
    const entries = await tx.blindboxEntry.findMany({ where: { boxKey: box.key, species: liveSpecies() }, include: { species: true }, orderBy: { weight: 'desc' } });
    if (entries.length === 0) continue;
    const total = entries.reduce((n, e) => n + e.weight, 0);
    blindboxes.push({
      key: box.key,
      name: box.name,
      price: box.price!,
      maxWeightGrams: Math.max(...entries.map((e) => e.species.spawnWeightMaxGrams)),
      odds: entries.map((e) => ({
        speciesKey: e.speciesKey,
        displayName: e.species.displayName,
        rarity: e.species.rarity,
        pct: Math.round((e.weight / total) * 10_000) / 100,
      })),
    });
  }

  return {
    fish: species.map((s) => ({
      key: s.key,
      displayName: s.displayName,
      rarity: s.rarity,
      modelKey: s.modelKey,
      price: s.buyPrice!,
      weightRangeGrams: [s.spawnWeightMinGrams, s.spawnWeightMaxGrams] as [number, number],
      maxWeightGrams: s.maxWeightGrams,
    })),
    blindboxes,
    items: items.filter((i) => i.category !== 'blindbox').map((i) => ({ key: i.key, category: i.category, name: i.name, price: i.price!, stats: i.stats })),
    upgrades: await upgradeStatus(tx, userId),
  };
}

export type ShopOffer = { type: 'fish' | 'blindbox' | 'item'; key: string; qty?: number };

export async function buy(tx: Tx, userId: string, offer: ShopOffer, ctx: PlayerCtx): Promise<{ fishIds?: string[]; coins: number }> {
  if (offer.type === 'fish') {
    const s = await tx.species.findFirst({ where: { key: offer.key, profile: configProfile() } });
    if (!s || s.buyPrice === null) throw new GameError('not_found', 404);
    if (!s.active || s.deletedAt) throw new GameError('species_inactive', 409);
    await assertFishStorage(tx, userId, s.spawnWeightMaxGrams);
    const coins = await adjustCoins(tx, userId, -s.buyPrice, `buy_fish:${s.key}`);
    const fish = await createFish(tx, userId, s.key, 'shop', { location: 'storage' }, ctx);
    return { fishIds: [fish.id], coins };
  }

  const def = await tx.itemDef.findFirst({ where: { key: offer.key, profile: configProfile(), active: true, shopVisible: true, price: { not: null } } });
  if (!def) throw new GameError('not_found', 404);

  if (offer.type === 'blindbox') {
    if (def.category !== 'blindbox') throw new GameError('not_found', 404);
    const fishId = await rollBox(tx, userId, def.key, ctx, () => adjustCoins(tx, userId, -def.price!, `buy_blindbox:${def.key}`));
    return { fishIds: [fishId], coins: (await tx.user.findUniqueOrThrow({ where: { id: userId } })).coins };
  }

  if (def.category === 'blindbox') throw new GameError('not_found', 404);
  const qty = offer.qty ?? 1;
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new GameError('invalid_input', 400);
  const coins = await adjustCoins(tx, userId, -def.price! * qty, `buy_item:${def.key}x${qty}`);
  await grantItemOrThrow(tx, userId, def.key, qty);
  return { coins };
}

/** Opens a box the player owns (e.g. from a reward). */
export async function openBlindbox(tx: Tx, userId: string, boxKey: string, ctx: PlayerCtx): Promise<{ fishId: string }> {
  const fishId = await rollBox(tx, userId, boxKey, ctx, () => takeItem(tx, userId, boxKey, 1));
  return { fishId };
}

/**
 * Storage is checked against the heaviest fish the box can give, before paying and before rolling, so a refused
 * open can't be retried for a better roll (spec §8.2).
 */
async function rollBox(tx: Tx, userId: string, boxKey: string, ctx: PlayerCtx, pay: () => Promise<unknown>): Promise<string> {
  const entries = await boxEntries(tx, boxKey);
  await assertFishStorage(tx, userId, Math.max(...entries.map((e) => e.species.spawnWeightMaxGrams)));
  await pay();
  const speciesKey = pickWeighted(entries.map((e) => ({ value: e.speciesKey, weight: e.weight })), ctx.rng);
  return (await createFish(tx, userId, speciesKey, 'blindbox', { location: 'storage' }, ctx)).id;
}
