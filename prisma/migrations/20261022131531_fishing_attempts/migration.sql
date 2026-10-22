-- AlterTable
ALTER TABLE "coin_transactions" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "exp_grants" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "fish" ALTER COLUMN "acquiredAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "fish_events" ALTER COLUMN "processedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "fish_sales" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "fishing_trips" ALTER COLUMN "startedAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lastSeenAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "game_config" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "gear_items" ALTER COLUMN "acquiredAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "inventory_items" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "milestone_change_log" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "milestones" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "operations" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "reward_claims" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "species_change_log" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "species_discoveries" ALTER COLUMN "firstAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "tanks" ALTER COLUMN "simulatedUntil" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "unlocked_zones" ALTER COLUMN "unlockedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "fishing_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "zoneKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "seed" INTEGER NOT NULL,
    "speciesKey" TEXT,
    "weightGrams" INTEGER,
    "reel" JSONB,
    "waitMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "fishId" TEXT,
    "result" JSONB,

    CONSTRAINT "fishing_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fishing_attempts_userId_status_idx" ON "fishing_attempts"("userId", "status");

-- CreateIndex
CREATE INDEX "fishing_attempts_tripId_idx" ON "fishing_attempts"("tripId");

-- AddForeignKey
ALTER TABLE "fishing_attempts" ADD CONSTRAINT "fishing_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one open attempt per player: repeated clicks or retries cannot start (and pay bait for) a second one.
CREATE UNIQUE INDEX "fishing_attempts_one_open_key" ON "fishing_attempts" ("userId") WHERE "status" = 'open';
