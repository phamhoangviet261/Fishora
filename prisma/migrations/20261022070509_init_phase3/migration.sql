-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "tankType" TEXT NOT NULL DEFAULT 'planted120',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "placed" BOOLEAN NOT NULL DEFAULT false,
    "posX" DOUBLE PRECISION,
    "posY" DOUBLE PRECISION,
    "posZ" DOUBLE PRECISION,
    "rotY" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "coin_transactions_userId_createdAt_idx" ON "coin_transactions"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "coin_transactions_userId_idempotencyKey_key" ON "coin_transactions"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "inventory_items_userId_idx" ON "inventory_items"("userId");

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Wallet can never go negative.
ALTER TABLE "users" ADD CONSTRAINT "users_coins_non_negative" CHECK ("coins" >= 0);
