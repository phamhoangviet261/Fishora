import { GameError, type Tx } from './tx';

/**
 * Changes the balance by `delta` and writes the ledger row, inside the caller's transaction (under withPlayer's
 * player lock). The conditional UPDATE refuses to go below 0, so a failed spend changes nothing.
 */
export async function adjustCoins(tx: Tx, userId: string, delta: number, reason: string): Promise<number> {
  if (!Number.isInteger(delta)) throw new Error(`adjustCoins: invalid delta ${delta}`);
  const rows = await tx.$queryRaw<{ coins: number }[]>`
    UPDATE "users" SET "coins" = "coins" + ${delta}
    WHERE "id" = ${userId} AND "coins" + ${delta} >= 0
    RETURNING "coins"`;
  if (rows.length === 0) throw new GameError('insufficient_coins', 409);
  const balance = Number(rows[0].coins);
  await tx.coinTransaction.create({ data: { userId, amount: delta, balanceAfter: balance, reason } });
  return balance;
}
