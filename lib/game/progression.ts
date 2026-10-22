import { configProfile } from './config';
import { openClaim } from './rewards';
import { shuffle } from './rng';
import { dayKey, nextDayBoundary, type PlayerCtx, type Tx } from './tx';
import type { RewardBundle } from './types';

// Levels, stats, daily quests, login streak, achievements and the collection (spec §9.3, §10).
// Every day boundary uses config `time` (one timezone for the whole game, spec §10.3).

export const METRICS = ['fish_caught', 'casts', 'species_discovered', 'fish_matured', 'zones_unlocked', 'fish_fed', 'tank_cleaned', 'fish_sold'] as const;
export type Metric = (typeof METRICS)[number];

const today = (ctx: PlayerCtx) => dayKey(ctx.now, ctx.cfg.time.timezone, ctx.cfg.time.resetHour);

export const levelFor = (exp: number, thresholds: number[]) => 1 + thresholds.filter((t) => exp >= t).length;

/** Adds EXP from a source, capped per game day when the source has a dailyCap (anti-farm, spec §10.2). */
export async function grantExp(tx: Tx, userId: string, source: string, ctx: PlayerCtx, amount?: number): Promise<{ granted: number; level: number }> {
  const src = ctx.cfg.exp.sources[source];
  let granted = amount ?? src?.exp ?? 0;
  const day = today(ctx);
  if (src?.dailyCap != null && granted > 0) {
    const sum = await tx.expGrant.aggregate({ where: { userId, source, dayKey: day }, _sum: { amount: true } });
    granted = Math.max(0, Math.min(granted, src.dailyCap - (sum._sum.amount ?? 0)));
  }
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { exp: true, level: true } });
  if (granted <= 0) return { granted: 0, level: user.level };
  const exp = user.exp + granted;
  const level = levelFor(exp, ctx.cfg.exp.levelThresholds);
  await tx.expGrant.create({ data: { userId, source, dayKey: day, amount: granted } });
  await tx.user.update({ where: { id: userId }, data: { exp, level } });
  return { granted, level };
}

/** Counts an activity, then advances today's quests and checks achievements on that metric. */
export async function bumpStat(tx: Tx, userId: string, metric: Metric, by: number, ctx: PlayerCtx): Promise<void> {
  if (by <= 0) return;
  const stat = await tx.playerStat.upsert({
    where: { userId_metric: { userId, metric } },
    create: { userId, metric, value: by },
    update: { value: { increment: by } },
  });

  const quests = await tx.playerQuest.findMany({ where: { userId, dayKey: today(ctx), completedAt: null } });
  if (quests.length) {
    const templates = await tx.questTemplate.findMany({ where: { key: { in: quests.map((q) => q.templateKey) }, metric } });
    const byKey = new Map(templates.map((t) => [t.key, t]));
    for (const q of quests) {
      const t = byKey.get(q.templateKey);
      if (!t) continue;
      const progress = Math.min(q.target, q.progress + by);
      const done = progress >= q.target;
      await tx.playerQuest.update({ where: { id: q.id }, data: { progress, completedAt: done ? ctx.now : null } });
      if (done) await openClaim(tx, userId, 'quest', q.id, t.reward as RewardBundle);
    }
  }

  const defs = await tx.achievementDef.findMany({ where: { profile: configProfile(), metric, threshold: { lte: stat.value } } });
  for (const d of defs) {
    const made = await tx.playerAchievement.createMany({ data: [{ userId, achievementKey: d.key, completedAt: ctx.now }], skipDuplicates: true });
    if (made.count > 0) await openClaim(tx, userId, 'achievement', d.key, d.reward as RewardBundle);
  }
}

/** Today's quests, handing out new ones on the first call of the day. Only quests the player can do (spec §10.3). */
export async function ensureDailyQuests(tx: Tx, userId: string, ctx: PlayerCtx) {
  const day = today(ctx);
  const existing = await tx.playerQuest.findMany({ where: { userId, dayKey: day } });
  if (existing.length) return existing;

  const [user, tankFish, zones, templates] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } }),
    tx.fish.count({ where: { userId, location: 'tank', status: 'alive' } }),
    tx.unlockedZone.findMany({ where: { userId }, select: { zoneKey: true } }),
    tx.questTemplate.findMany({ where: { profile: configProfile(), active: true }, orderBy: { key: 'asc' } }),
  ]);
  const unlocked = new Set(zones.map((z) => z.zoneKey));
  const eligible = templates.filter((t) => {
    const req = (t.requires ?? {}) as { tankFish?: boolean; zoneKey?: string };
    return t.minLevel <= user.level && (!req.tankFish || tankFish > 0) && (!req.zoneKey || unlocked.has(req.zoneKey));
  });
  const picked = shuffle(eligible, ctx.rng).slice(0, ctx.cfg.quests.perDay);
  await tx.playerQuest.createMany({ data: picked.map((t) => ({ userId, dayKey: day, templateKey: t.key, target: t.target })), skipDuplicates: true });
  return tx.playerQuest.findMany({ where: { userId, dayKey: day } });
}

/** First login of a game day: streak +1 if yesterday was a login day, else back to 1; one reward per day. */
export async function recordDailyLogin(tx: Tx, userId: string, ctx: PlayerCtx): Promise<{ streak: number; claimId: string | null }> {
  const day = today(ctx);
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { loginStreak: true, lastLoginDay: true } });
  if (user.lastLoginDay === day) return { streak: user.loginStreak, claimId: null };
  const yesterday = dayKey(new Date(ctx.now.getTime() - 86_400_000), ctx.cfg.time.timezone, ctx.cfg.time.resetHour);
  const streak = user.lastLoginDay === yesterday ? user.loginStreak + 1 : 1;
  await tx.dailyLogin.create({ data: { userId, dayKey: day, streak } });
  await tx.user.update({ where: { id: userId }, data: { loginStreak: streak, lastLoginDay: day } });
  const rewards = ctx.cfg.login.rewards;
  const claim = rewards.length ? await openClaim(tx, userId, 'login', day, rewards[(streak - 1) % rewards.length]) : null;
  return { streak, claimId: claim?.claimId ?? null };
}

export async function questList(tx: Tx, userId: string, ctx: PlayerCtx) {
  const quests = await ensureDailyQuests(tx, userId, ctx);
  const templates = await tx.questTemplate.findMany({ where: { key: { in: quests.map((q) => q.templateKey) } } });
  const byKey = new Map(templates.map((t) => [t.key, t]));
  const claims = await tx.rewardClaim.findMany({ where: { userId, source: 'quest', sourceRef: { in: quests.map((q) => q.id) } } });
  const claimOf = new Map(claims.map((c) => [c.sourceRef, c]));
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { loginStreak: true } });
  return {
    resetsAt: nextDayBoundary(ctx.now, ctx.cfg.time.timezone, ctx.cfg.time.resetHour),
    loginStreak: user.loginStreak,
    loginRewards: ctx.cfg.login.rewards,
    quests: quests.map((q) => ({
      id: q.id,
      templateKey: q.templateKey,
      metric: byKey.get(q.templateKey)?.metric ?? null,
      progress: q.progress,
      target: q.target,
      reward: byKey.get(q.templateKey)?.reward ?? {},
      completed: q.completedAt !== null,
      claimed: claimOf.get(q.id)?.completedAt != null,
    })),
  };
}

export async function achievementList(tx: Tx, userId: string) {
  const [defs, mine, stats] = await Promise.all([
    tx.achievementDef.findMany({ where: { profile: configProfile() }, orderBy: { sortOrder: 'asc' } }),
    tx.playerAchievement.findMany({ where: { userId } }),
    tx.playerStat.findMany({ where: { userId } }),
  ]);
  const done = new Map(mine.map((a) => [a.achievementKey, a.completedAt]));
  const value = new Map(stats.map((s) => [s.metric, s.value]));
  return defs.map((d) => ({
    key: d.key,
    metric: d.metric,
    threshold: d.threshold,
    value: Math.min(d.threshold, value.get(d.metric) ?? 0),
    reward: d.reward,
    completedAt: done.get(d.key) ?? null,
  }));
}

/** Species ever discovered and every fish ever owned, whatever became of it (spec §9.3). */
export async function collection(tx: Tx, userId: string) {
  const [species, found, fish] = await Promise.all([
    tx.species.findMany({ where: { profile: configProfile(), deletedAt: null }, orderBy: [{ rarity: 'asc' }, { key: 'asc' }] }),
    tx.speciesDiscovery.findMany({ where: { userId } }),
    tx.fish.findMany({ where: { userId }, orderBy: { acquiredAt: 'desc' }, include: { species: { select: { displayName: true, modelKey: true } } } }),
  ]);
  const seen = new Map(found.map((d) => [d.speciesKey, d]));
  return {
    species: species.map((s) => ({
      key: s.key,
      displayName: s.displayName,
      rarity: s.rarity,
      modelKey: s.modelKey,
      discovered: seen.has(s.key),
      via: seen.get(s.key)?.via ?? null,
      firstAt: seen.get(s.key)?.firstAt ?? null,
    })),
    history: fish.map((f) => ({
      id: f.id,
      name: f.nickname ?? f.species.displayName,
      speciesKey: f.speciesKey,
      speciesName: f.species.displayName,
      rarity: f.rarity,
      weightGrams: f.weightGrams,
      status: f.status,
      location: f.location,
      origin: f.origin,
      acquiredAt: f.acquiredAt,
      endedAt: f.endedAt,
    })),
  };
}
