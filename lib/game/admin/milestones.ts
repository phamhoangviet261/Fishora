import type { Milestone, Prisma } from '@prisma/client';
import { configProfile } from '../config';
import { applicableMilestones } from '../fish/formulas';
import { bundleParts, completeClaims, openClaim } from '../rewards';
import { GameError, type PlayerCtx, type Tx } from '../tx';
import type { RewardBundle } from '../types';
import { adminTx } from './context';
import { validateRewardBundle } from './species';

// Milestone admin (spec §6.2). Changes apply to existing and new fish; completed claims are never touched;
// pending claims at the same weight follow the admin's keep/replace decision; a fish can earn a given
// species+weight milestone once in its life, even if the milestone is deleted and re-created.

export type PendingPolicy = 'keep' | 'replace';

const snapshot = (m: Milestone | null) => (m ? (JSON.parse(JSON.stringify(m)) as Prisma.InputJsonValue) : undefined);

function checkWeight(w: unknown): number {
  if (typeof w !== 'number' || !Number.isInteger(w) || w < 1) throw new GameError('invalid_input', 400, { field: 'weightGrams' });
  return w;
}

/** Species this milestone applies to: its own species, or every species of the profile still on the default set. */
async function speciesFor(tx: Tx, m: Milestone): Promise<string[]> {
  if (m.speciesKey) return [m.speciesKey];
  const [species, own] = await Promise.all([
    tx.species.findMany({ where: { profile: configProfile() }, select: { key: true } }),
    tx.milestone.findMany({ where: { deletedAt: null, speciesKey: { not: null } }, select: { speciesKey: true } }),
  ]);
  const custom = new Set(own.map((o) => o.speciesKey));
  return species.map((s) => s.key).filter((k) => !custom.has(k));
}

/** Pending claims for this species+weight get the new bundle (replace) or stay as they are (keep). */
async function applyPolicy(tx: Tx, m: Milestone, policy: PendingPolicy, ctx: PlayerCtx): Promise<string[]> {
  const species = await speciesFor(tx, m);
  const reached = await tx.fishMilestone.findMany({ where: { weightGrams: m.weightGrams, fish: { speciesKey: { in: species } } } });
  const claims = await tx.rewardClaim.findMany({ where: { id: { in: reached.map((r) => r.claimId) }, completedAt: null } });
  if (policy === 'keep') return [];
  for (const c of claims) {
    await tx.rewardClaimPart.updateMany({ where: { claimId: c.id, status: 'pending' }, data: { status: 'void' } });
    await tx.rewardClaimPart.createMany({ data: bundleParts(m.reward as RewardBundle).map((p) => ({ ...p, claimId: c.id })) });
  }
  await tx.fishMilestone.updateMany({ where: { claimId: { in: claims.map((c) => c.id) } }, data: { milestoneId: m.id } });
  await completeClaims(tx, claims.map((c) => c.id), ctx.now);
  return claims.map((c) => c.id);
}

/** Live fish already at or above the milestone, without it yet, become eligible now (spec §6.2). */
async function reconcile(tx: Tx, m: Milestone, ctx: PlayerCtx): Promise<string[]> {
  const species = await speciesFor(tx, m);
  const all = await tx.milestone.findMany({ where: { deletedAt: null, OR: [{ speciesKey: null }, { speciesKey: { in: species } }] } });
  const fish = await tx.fish.findMany({
    where: { speciesKey: { in: species }, status: 'alive', weightGrams: { gte: m.weightGrams }, milestones: { none: { weightGrams: m.weightGrams } } },
  });
  const opened: string[] = [];
  for (const f of fish) {
    if (!applicableMilestones(all, f.speciesKey).some((x) => x.id === m.id)) continue;
    const { claimId } = await openClaim(tx, f.userId, 'milestone', `${f.id}:${m.weightGrams}`, m.reward as RewardBundle, f.id);
    await tx.fishMilestone.create({ data: { fishId: f.id, weightGrams: m.weightGrams, milestoneId: m.id, claimId, reachedAt: ctx.now } });
    await tx.fishEvent.create({ data: { fishId: f.id, userId: f.userId, type: 'milestone', data: { weightGrams: m.weightGrams }, occurredAt: ctx.now } });
    opened.push(claimId);
  }
  return opened;
}

export function createMilestone(adminId: string, input: { speciesKey: string | null; weightGrams: number; reward: RewardBundle }, policy: PendingPolicy): Promise<Milestone> {
  return adminTx(async (tx, ctx) => {
    const weightGrams = checkWeight(input.weightGrams);
    if (input.speciesKey && !(await tx.species.findUnique({ where: { key: input.speciesKey } }))) throw new GameError('not_found', 404);
    const clash = await tx.milestone.findFirst({ where: { speciesKey: input.speciesKey, weightGrams, deletedAt: null } });
    if (clash) throw new GameError('duplicate', 409);
    const m = await tx.milestone.create({ data: { speciesKey: input.speciesKey, weightGrams, reward: validateRewardBundle(input.reward) as Prisma.InputJsonValue } });
    const affected = [...(await applyPolicy(tx, m, policy, ctx)), ...(await reconcile(tx, m, ctx))];
    await tx.milestoneChangeLog.create({ data: { milestoneId: m.id, adminId, kind: 'create', after: snapshot(m), pendingPolicy: policy, affectedClaimIds: affected } });
    return m;
  });
}

export function updateMilestone(adminId: string, id: string, patch: { weightGrams?: number; reward?: RewardBundle }, policy: PendingPolicy): Promise<Milestone> {
  return adminTx(async (tx, ctx) => {
    const before = await tx.milestone.findUnique({ where: { id } });
    if (!before || before.deletedAt) throw new GameError('not_found', 404);
    const data: Prisma.MilestoneUpdateInput = {};
    if (patch.weightGrams !== undefined) {
      data.weightGrams = checkWeight(patch.weightGrams);
      const clash = await tx.milestone.findFirst({ where: { speciesKey: before.speciesKey, weightGrams: data.weightGrams, deletedAt: null, id: { not: id } } });
      if (clash) throw new GameError('duplicate', 409);
    }
    if (patch.reward !== undefined) data.reward = validateRewardBundle(patch.reward) as Prisma.InputJsonValue;
    const after = await tx.milestone.update({ where: { id }, data });
    const affected = [...(await applyPolicy(tx, after, policy, ctx)), ...(await reconcile(tx, after, ctx))];
    await tx.milestoneChangeLog.create({
      data: { milestoneId: id, adminId, kind: 'update', before: snapshot(before), after: snapshot(after), pendingPolicy: policy, affectedClaimIds: affected },
    });
    return after;
  });
}

/** Stops new claims; claims already opened, pending or done, stay as they are. A deleted milestone never returns. */
export function deleteMilestone(adminId: string, id: string): Promise<Milestone> {
  return adminTx(async (tx, ctx) => {
    const before = await tx.milestone.findUnique({ where: { id } });
    if (!before || before.deletedAt) throw new GameError('not_found', 404);
    const after = await tx.milestone.update({ where: { id }, data: { deletedAt: ctx.now } });
    await tx.milestoneChangeLog.create({ data: { milestoneId: id, adminId, kind: 'delete', before: snapshot(before), after: snapshot(after), affectedClaimIds: [] } });
    return after;
  });
}

export function listMilestones() {
  return adminTx((tx) => tx.milestone.findMany({ where: { deletedAt: null }, orderBy: [{ speciesKey: 'asc' }, { weightGrams: 'asc' }] }));
}

/** Species and milestone change logs, newest first, with the admin's email. */
export function changeHistory(limit = 200) {
  return adminTx(async (tx) => {
    const [species, milestones] = await Promise.all([
      tx.speciesChangeLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      tx.milestoneChangeLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
    ]);
    const admins = await tx.user.findMany({ where: { id: { in: [...species, ...milestones].map((l) => l.adminId) } }, select: { id: true, email: true } });
    const email = new Map(admins.map((a) => [a.id, a.email]));
    return [
      ...species.map((l) => ({ id: l.id, target: 'species' as const, ref: l.speciesKey, kind: l.kind, before: l.before, after: l.after, affected: l.affectedFishIds, policy: null, createdAt: l.createdAt, admin: email.get(l.adminId) ?? l.adminId })),
      ...milestones.map((l) => ({ id: l.id, target: 'milestone' as const, ref: l.milestoneId, kind: l.kind, before: l.before, after: l.after, affected: l.affectedClaimIds, policy: l.pendingPolicy, createdAt: l.createdAt, admin: email.get(l.adminId) ?? l.adminId })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  });
}
