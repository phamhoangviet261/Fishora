import type { Prisma, PrismaClient } from '@prisma/client';
import type { GameConfig } from '../../lib/game/types';

// Upserts one content set. Shared by the dev seed (profile 'live') and the test fixtures (profile 'test').

export interface ContentSet {
  config: GameConfig;
  species: Prisma.SpeciesCreateManyInput[];
  items: Prisma.ItemDefCreateManyInput[];
  blindbox: Prisma.BlindboxEntryCreateManyInput[];
  zones: Prisma.ZoneCreateManyInput[];
  zoneSpecies: Prisma.ZoneSpeciesCreateManyInput[];
  upgrades: Omit<Prisma.UpgradeLevelCreateManyInput, 'profile'>[];
  quests: Omit<Prisma.QuestTemplateCreateManyInput, 'profile'>[];
  achievements: Omit<Prisma.AchievementDefCreateManyInput, 'profile'>[];
  milestones: { speciesKey: string | null; weightGrams: number; reward: Prisma.InputJsonValue }[];
}

export async function applyContent(db: PrismaClient, content: ContentSet, profile: string): Promise<void> {
  for (const [key, value] of Object.entries(content.config)) {
    await db.gameConfig.upsert({
      where: { profile_key: { profile, key } },
      create: { profile, key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
  }
  for (const s of content.species) await db.species.upsert({ where: { key: s.key }, create: s, update: s });
  for (const i of content.items) await db.itemDef.upsert({ where: { key: i.key }, create: i, update: i });
  for (const z of content.zones) await db.zone.upsert({ where: { key: z.key }, create: z, update: z });
  for (const e of content.zoneSpecies)
    await db.zoneSpecies.upsert({ where: { zoneKey_speciesKey: { zoneKey: e.zoneKey, speciesKey: e.speciesKey } }, create: e, update: e });
  for (const e of content.blindbox)
    await db.blindboxEntry.upsert({ where: { boxKey_speciesKey: { boxKey: e.boxKey, speciesKey: e.speciesKey } }, create: e, update: e });
  for (const u of content.upgrades) {
    const row = { ...u, profile };
    await db.upgradeLevel.upsert({ where: { profile_track_level: { profile, track: u.track, level: u.level } }, create: row, update: row });
  }
  for (const q of content.quests) await db.questTemplate.upsert({ where: { key: q.key }, create: { ...q, profile }, update: { ...q, profile } });
  for (const a of content.achievements)
    await db.achievementDef.upsert({ where: { key: a.key }, create: { ...a, profile }, update: { ...a, profile } });
  for (const m of content.milestones) {
    const live = await db.milestone.findFirst({ where: { speciesKey: m.speciesKey, weightGrams: m.weightGrams, deletedAt: null } });
    if (live) await db.milestone.update({ where: { id: live.id }, data: { reward: m.reward } });
    else await db.milestone.create({ data: m });
  }
}
