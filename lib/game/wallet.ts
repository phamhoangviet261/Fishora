import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';

export type SpendResult = { ok: true; balance: number } | { ok: false; error: 'insufficient_coins' };

/**
 * Atomically deducts coins and records the ledger row in one SQL statement: the conditional UPDATE makes
 * concurrent spends safe (no read-then-write race), and if the ledger insert fails the deduction rolls back
 * with it. A repeated idempotency key returns the first result without charging again.
 */
export async function spendCoins(userId: string, amount: number, reason: string, idempotencyKey: string): Promise<SpendResult> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`spendCoins: invalid amount ${amount}`);

  const previous = () =>
    prisma.coinTransaction.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } }, select: { balanceAfter: true } });

  const done = await previous();
  if (done) return { ok: true, balance: done.balanceAfter };

  try {
    const rows = await prisma.$queryRaw<{ balanceAfter: number }[]>`
      WITH spent AS (
        UPDATE "users" SET "coins" = "coins" - ${amount}
        WHERE "id" = ${userId} AND "coins" >= ${amount}
        RETURNING "coins"
      )
      INSERT INTO "coin_transactions" ("id", "userId", "amount", "balanceAfter", "reason", "idempotencyKey")
      SELECT ${randomUUID()}, ${userId}, ${-amount}, "coins", ${reason}, ${idempotencyKey} FROM spent
      RETURNING "balanceAfter"`;
    if (rows.length === 0) return { ok: false, error: 'insufficient_coins' };
    return { ok: true, balance: Number(rows[0].balanceAfter) };
  } catch (e) {
    // A concurrent request with the same key won the race (unique violation); ours rolled back entirely.
    const won = await previous();
    if (won) return { ok: true, balance: won.balanceAfter };
    throw e;
  }
}

export function listTransactions(userId: string, limit = 50) {
  const take = Math.min(200, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 50)));
  return prisma.coinTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, amount: true, balanceAfter: true, reason: true, createdAt: true },
  });
}
