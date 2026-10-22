import type { ClaimSource, Prisma } from '@prisma/client';
import { applicableMilestones, newlyReached } from './fish/formulas';
import { adjustCoins } from './ledger';
import { bumpStat, grantExp } from './progression';
import { tryGrantItem } from './storage';
import type { PlayerCtx, Tx } from './tx';
import type { RewardBundle } from './types';

// Reward claims (spec §6.1): a claim is stored apart from storage and never expires; each part (coins, EXP, one
// item) is claimed on its own; items count as claimed only once they fit in storage.

/** Opens a claim once per (source, sourceRef); a repeat returns the existing one. */
export async function openClaim(
  tx: Tx,
  userId: string,
  source: ClaimSource,
  sourceRef: string,
  bundle: RewardBundle,
  fishId?: string,
): Promise<{ claimId: string; created: boolean }> {
  const existing = await tx.rewardClaim.findUnique({ where: { userId_source_sourceRef: { userId, source, sourceRef } } });
  if (existing) return { claimId: existing.id, created: false };
  const parts = bundleParts(bundle);
  const claim = await tx.rewardClaim.create({
    data: { userId, source, sourceRef, fishId, completedAt: parts.length ? null : new Date(), parts: { create: parts } },
  });
  return { claimId: claim.id, created: true };
}

export function bundleParts(b: RewardBundle): Prisma.RewardClaimPartCreateWithoutClaimInput[] {
  const parts: Prisma.RewardClaimPartCreateWithoutClaimInput[] = [];
  if (b.coins && b.coins > 0) parts.push({ kind: 'coins', qty: b.coins });
  if (b.exp && b.exp > 0) parts.push({ kind: 'exp', qty: b.exp });
  for (const i of b.items ?? []) if (i.qty > 0) parts.push({ kind: 'item', itemKey: i.itemKey, qty: i.qty });
  return parts;
}

/** Claims the player's pending parts among `partIds`. Already-claimed or foreign ids are skipped, so retries are safe. */
export async function claimParts(tx: Tx, userId: string, partIds: string[], ctx: PlayerCtx): Promise<{ claimed: string[]; blocked: string[] }> {
  const parts = await tx.rewardClaimPart.findMany({
    where: { id: { in: partIds }, status: 'pending', claim: { userId } },
    include: { claim: { select: { source: true } } },
  });
  const claimed: string[] = [];
  const blocked: string[] = [];
  for (const p of parts) {
    if (p.kind === 'coins') await adjustCoins(tx, userId, p.qty, `claim:${p.claim.source}`);
    else if (p.kind === 'exp') await grantExp(tx, userId, 'claim', ctx, p.qty);
    else if (!(await tryGrantItem(tx, userId, p.itemKey!, p.qty))) {
      blocked.push(p.id);
      continue;
    }
    await tx.rewardClaimPart.update({ where: { id: p.id }, data: { status: 'claimed', claimedAt: ctx.now } });
    claimed.push(p.id);
  }
  await completeClaims(tx, [...new Set(parts.map((p) => p.claimId))], ctx.now);
  return { claimed, blocked };
}

/** A claim is complete once none of its parts is pending. */
export async function completeClaims(tx: Tx, claimIds: string[], now: Date): Promise<void> {
  for (const id of claimIds) {
    const pending = await tx.rewardClaimPart.count({ where: { claimId: id, status: 'pending' } });
    await tx.rewardClaim.update({ where: { id }, data: { completedAt: pending === 0 ? now : null } });
  }
}

/** Milestone and maturity claims for the heaviest weight each fish reached (spec §6.1, §6.3). */
export async function openGrowthRewards(tx: Tx, userId: string, peaks: Record<string, { grams: number; at: Date }>, ctx: PlayerCtx): Promise<void> {
  const ids = Object.keys(peaks);
  if (ids.length === 0) return;
  const fish = await tx.fish.findMany({ where: { id: { in: ids }, userId }, include: { species: true, milestones: true } });
  const milestones = await tx.milestone.findMany({ where: { deletedAt: null, OR: [{ speciesKey: null }, { speciesKey: { in: fish.map((f) => f.speciesKey) } }] } });

  for (const f of fish) {
    const peak = peaks[f.id];
    const reached = new Set(f.milestones.map((m) => m.weightGrams));
    for (const m of newlyReached(peak.grams, applicableMilestones(milestones, f.speciesKey), reached)) {
      const { claimId } = await openClaim(tx, userId, 'milestone', `${f.id}:${m.weightGrams}`, m.reward as RewardBundle, f.id);
      await tx.fishMilestone.create({ data: { fishId: f.id, weightGrams: m.weightGrams, milestoneId: m.id, claimId, reachedAt: peak.at } });
      await tx.fishEvent.create({ data: { fishId: f.id, userId, type: 'milestone', data: { weightGrams: m.weightGrams }, occurredAt: peak.at } });
    }
    if (peak.grams >= f.species.maxWeightGrams && !f.maturedAt) await matureFish(tx, userId, f, peak.at, ctx);
  }
}

type FishWithSpecies = Prisma.FishGetPayload<{ include: { species: true } }>;

/** First maturity: snapshot the sale bonus and open the one-time maturity claim (spec §6.3). */
export async function matureFish(tx: Tx, userId: string, f: FishWithSpecies, at: Date, ctx: PlayerCtx): Promise<void> {
  await tx.fish.update({
    where: { id: f.id },
    data: { maturedAt: at, maturitySaleBonusCoins: f.species.maturitySaleBonusCoins, maturitySaleBonusPct: f.species.maturitySaleBonusPct },
  });
  await openClaim(tx, userId, 'maturity', f.id, f.species.maturityReward as RewardBundle, f.id);
  await tx.fishEvent.create({ data: { fishId: f.id, userId, type: 'matured', occurredAt: at } });
  await bumpStat(tx, userId, 'fish_matured', 1, ctx);
}

export async function rewardInbox(tx: Tx, userId: string) {
  const claims = await tx.rewardClaim.findMany({
    where: { userId, completedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { parts: { orderBy: { kind: 'asc' } } },
  });
  const fishIds = claims.flatMap((c) => (c.fishId ? [c.fishId] : []));
  const fish = await tx.fish.findMany({ where: { id: { in: fishIds } }, select: { id: true, nickname: true, species: { select: { displayName: true } } } });
  const names = new Map(fish.map((f) => [f.id, f.nickname ?? f.species.displayName]));
  return claims.map((c) => ({
    id: c.id,
    source: c.source,
    sourceRef: c.sourceRef,
    fishId: c.fishId,
    fishName: c.fishId ? (names.get(c.fishId) ?? null) : null,
    createdAt: c.createdAt,
    parts: c.parts.map((p) => ({ id: p.id, kind: p.kind, itemKey: p.itemKey, qty: p.qty, status: p.status })),
  }));
}
