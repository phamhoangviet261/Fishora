-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('player', 'admin');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('common', 'uncommon', 'rare', 'epic', 'legendary');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "FishLocation" AS ENUM ('storage', 'tank', 'trip', 'none');

-- CreateEnum
CREATE TYPE "FishStatus" AS ENUM ('alive', 'dead', 'lost', 'sold', 'released', 'abandoned');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ClaimSource" AS ENUM ('milestone', 'maturity', 'quest', 'achievement', 'login');

-- CreateEnum
CREATE TYPE "PartKind" AS ENUM ('coins', 'exp', 'item');

-- CreateEnum
CREATE TYPE "PartStatus" AS ENUM ('pending', 'claimed', 'void');

-- CreateEnum
CREATE TYPE "StackBucket" AS ENUM ('main', 'reserve');

-- AlterTable
ALTER TABLE "coin_transactions" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "inventory_items" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "exp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginDay" TEXT,
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "loginStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'player',
ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "game_config" (
    "profile" TEXT NOT NULL DEFAULT 'live',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "game_config_pkey" PRIMARY KEY ("profile","key")
);

-- CreateTable
CREATE TABLE "species" (
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "modelKey" TEXT NOT NULL,
    "maxWeightGrams" INTEGER NOT NULL,
    "spawnWeightMinGrams" INTEGER NOT NULL,
    "spawnWeightMaxGrams" INTEGER NOT NULL,
    "spawnAgeMinDays" INTEGER NOT NULL,
    "spawnAgeMaxDays" INTEGER NOT NULL,
    "growthGramsPerTick" INTEGER NOT NULL,
    "foodUnitsPerFeed" INTEGER NOT NULL,
    "valuePerKg" INTEGER NOT NULL,
    "buyPrice" INTEGER,
    "maturityReward" JSONB NOT NULL DEFAULT '{}',
    "maturitySaleBonusCoins" INTEGER NOT NULL DEFAULT 0,
    "maturitySaleBonusPct" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "species_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "species_change_log" (
    "id" TEXT NOT NULL,
    "speciesKey" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "affectedFishIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "species_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "speciesKey" TEXT,
    "weightGrams" INTEGER NOT NULL,
    "reward" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_change_log" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "pendingPolicy" TEXT,
    "affectedClaimIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_defs" (
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stackable" BOOLEAN NOT NULL,
    "price" INTEGER,
    "shopVisible" BOOLEAN NOT NULL DEFAULT true,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "item_defs_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "blindbox_entries" (
    "boxKey" TEXT NOT NULL,
    "speciesKey" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,

    CONSTRAINT "blindbox_entries_pkey" PRIMARY KEY ("boxKey","speciesKey")
);

-- CreateTable
CREATE TABLE "zones" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minLevel" INTEGER NOT NULL,
    "unlockCost" INTEGER NOT NULL,
    "missWeight" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "zone_species" (
    "zoneKey" TEXT NOT NULL,
    "speciesKey" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,

    CONSTRAINT "zone_species_pkey" PRIMARY KEY ("zoneKey","speciesKey")
);

-- CreateTable
CREATE TABLE "upgrade_levels" (
    "track" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL,
    "minPlayerLevel" INTEGER NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "upgrade_levels_pkey" PRIMARY KEY ("track","level")
);

-- CreateTable
CREATE TABLE "quest_templates" (
    "key" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "minLevel" INTEGER NOT NULL,
    "requires" JSONB NOT NULL DEFAULT '{}',
    "reward" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "quest_templates_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "achievement_defs" (
    "key" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "reward" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "achievement_defs_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "tanks" (
    "userId" TEXT NOT NULL,
    "dirt" INTEGER NOT NULL DEFAULT 0,
    "simulatedUntil" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoFeed" BOOLEAN NOT NULL DEFAULT false,
    "autoClean" BOOLEAN NOT NULL DEFAULT false,
    "autoFeedItemKey" TEXT,
    "lastAutoCleanAt" TIMESTAMP(3),

    CONSTRAINT "tanks_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "fish" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "speciesKey" TEXT NOT NULL,
    "nickname" TEXT,
    "sex" "Sex" NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "hp" INTEGER NOT NULL,
    "satietyTicks" INTEGER NOT NULL DEFAULT 0,
    "growthMult" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "ageDays" INTEGER NOT NULL,
    "daysInTank" INTEGER NOT NULL DEFAULT 0,
    "baseValue" INTEGER NOT NULL,
    "location" "FishLocation" NOT NULL,
    "status" "FishStatus" NOT NULL DEFAULT 'alive',
    "tripId" TEXT,
    "origin" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diedAt" TIMESTAMP(3),
    "reviveDeadline" TIMESTAMP(3),
    "revivedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "maturedAt" TIMESTAMP(3),
    "maturitySaleBonusCoins" INTEGER,
    "maturitySaleBonusPct" INTEGER,

    CONSTRAINT "fish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fish_events" (
    "id" TEXT NOT NULL,
    "fishId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fish_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fish_sales" (
    "fishId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "maturityBonus" INTEGER NOT NULL DEFAULT 0,
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fish_sales_pkey" PRIMARY KEY ("fishId")
);

-- CreateTable
CREATE TABLE "inventory_stacks" (
    "userId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "bucket" "StackBucket" NOT NULL DEFAULT 'main',
    "qty" INTEGER NOT NULL,

    CONSTRAINT "inventory_stacks_pkey" PRIMARY KEY ("userId","itemKey","bucket")
);

-- CreateTable
CREATE TABLE "gear_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defKey" TEXT NOT NULL,
    "durability" INTEGER NOT NULL,
    "maxDurability" INTEGER NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gear_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gear_loadouts" (
    "userId" TEXT NOT NULL,
    "rodId" TEXT,
    "lineId" TEXT,
    "hookId" TEXT,
    "coolerId" TEXT,
    "baitKey" TEXT,

    CONSTRAINT "gear_loadouts_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "user_upgrades" (
    "userId" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "level" INTEGER NOT NULL,

    CONSTRAINT "user_upgrades_pkey" PRIMARY KEY ("userId","track")
);

-- CreateTable
CREATE TABLE "unlocked_zones" (
    "userId" TEXT NOT NULL,
    "zoneKey" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unlocked_zones_pkey" PRIMARY KEY ("userId","zoneKey")
);

-- CreateTable
CREATE TABLE "fishing_trips" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zoneKey" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "fishing_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_claims" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "ClaimSource" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "fishId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "reward_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_claim_parts" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "kind" "PartKind" NOT NULL,
    "itemKey" TEXT,
    "qty" INTEGER NOT NULL,
    "status" "PartStatus" NOT NULL DEFAULT 'pending',
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "reward_claim_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fish_milestones" (
    "fishId" TEXT NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fish_milestones_pkey" PRIMARY KEY ("fishId","weightGrams")
);

-- CreateTable
CREATE TABLE "player_quests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "player_quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_logins" (
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "streak" INTEGER NOT NULL,

    CONSTRAINT "daily_logins_pkey" PRIMARY KEY ("userId","dayKey")
);

-- CreateTable
CREATE TABLE "player_achievements" (
    "userId" TEXT NOT NULL,
    "achievementKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_achievements_pkey" PRIMARY KEY ("userId","achievementKey")
);

-- CreateTable
CREATE TABLE "player_stats" (
    "userId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "player_stats_pkey" PRIMARY KEY ("userId","metric")
);

-- CreateTable
CREATE TABLE "species_discoveries" (
    "userId" TEXT NOT NULL,
    "speciesKey" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "species_discoveries_pkey" PRIMARY KEY ("userId","speciesKey")
);

-- CreateTable
CREATE TABLE "exp_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exp_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("userId","key")
);

-- CreateIndex
CREATE INDEX "species_change_log_speciesKey_createdAt_idx" ON "species_change_log"("speciesKey", "createdAt");

-- CreateIndex
CREATE INDEX "milestones_speciesKey_idx" ON "milestones"("speciesKey");

-- CreateIndex
CREATE INDEX "fish_userId_location_status_idx" ON "fish"("userId", "location", "status");

-- CreateIndex
CREATE INDEX "fish_speciesKey_status_idx" ON "fish"("speciesKey", "status");

-- CreateIndex
CREATE INDEX "fish_events_fishId_occurredAt_idx" ON "fish_events"("fishId", "occurredAt");

-- CreateIndex
CREATE INDEX "fish_sales_userId_createdAt_idx" ON "fish_sales"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "gear_items_userId_idx" ON "gear_items"("userId");

-- CreateIndex
CREATE INDEX "fishing_trips_userId_status_idx" ON "fishing_trips"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reward_claims_userId_source_sourceRef_key" ON "reward_claims"("userId", "source", "sourceRef");

-- CreateIndex
CREATE INDEX "reward_claim_parts_claimId_idx" ON "reward_claim_parts"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "player_quests_userId_dayKey_templateKey_key" ON "player_quests"("userId", "dayKey", "templateKey");

-- CreateIndex
CREATE INDEX "exp_grants_userId_source_dayKey_idx" ON "exp_grants"("userId", "source", "dayKey");

-- AddForeignKey
ALTER TABLE "blindbox_entries" ADD CONSTRAINT "blindbox_entries_speciesKey_fkey" FOREIGN KEY ("speciesKey") REFERENCES "species"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_species" ADD CONSTRAINT "zone_species_zoneKey_fkey" FOREIGN KEY ("zoneKey") REFERENCES "zones"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_species" ADD CONSTRAINT "zone_species_speciesKey_fkey" FOREIGN KEY ("speciesKey") REFERENCES "species"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fish" ADD CONSTRAINT "fish_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fish" ADD CONSTRAINT "fish_speciesKey_fkey" FOREIGN KEY ("speciesKey") REFERENCES "species"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fish_events" ADD CONSTRAINT "fish_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fish_sales" ADD CONSTRAINT "fish_sales_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stacks" ADD CONSTRAINT "inventory_stacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gear_items" ADD CONSTRAINT "gear_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gear_items" ADD CONSTRAINT "gear_items_defKey_fkey" FOREIGN KEY ("defKey") REFERENCES "item_defs"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gear_loadouts" ADD CONSTRAINT "gear_loadouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_upgrades" ADD CONSTRAINT "user_upgrades_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unlocked_zones" ADD CONSTRAINT "unlocked_zones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fishing_trips" ADD CONSTRAINT "fishing_trips_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_claim_parts" ADD CONSTRAINT "reward_claim_parts_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "reward_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fish_milestones" ADD CONSTRAINT "fish_milestones_fishId_fkey" FOREIGN KEY ("fishId") REFERENCES "fish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logins" ADD CONSTRAINT "daily_logins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "species_discoveries" ADD CONSTRAINT "species_discoveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exp_grants" ADD CONSTRAINT "exp_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------- hand-written constraints
ALTER TABLE "fish" ADD CONSTRAINT "fish_hp_non_negative" CHECK ("hp" >= 0);
ALTER TABLE "fish" ADD CONSTRAINT "fish_weight_positive" CHECK ("weightGrams" > 0);
ALTER TABLE "inventory_stacks" ADD CONSTRAINT "inventory_stacks_qty_non_negative" CHECK ("qty" >= 0);
ALTER TABLE "gear_items" ADD CONSTRAINT "gear_items_durability_range" CHECK ("durability" BETWEEN 0 AND "maxDurability");

-- One live milestone per (species or default set, weight); deleted ones don't block re-creation (spec §6.2).
CREATE UNIQUE INDEX "milestones_live_species_weight_key" ON "milestones" (COALESCE("speciesKey", ''), "weightGrams") WHERE "deletedAt" IS NULL;

-- At most one active fishing trip per player.
CREATE UNIQUE INDEX "fishing_trips_one_active_key" ON "fishing_trips" ("userId") WHERE "status" = 'active';

-- Fish moved to their own table. Pre-release: existing fish rows were dev data only.
DELETE FROM "inventory_items" WHERE "kind" = 'fish';

-- Every existing account gets its tank.
INSERT INTO "tanks" ("userId") SELECT "id" FROM "users" ON CONFLICT DO NOTHING;
