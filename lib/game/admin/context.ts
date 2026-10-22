import { prisma } from '@/lib/db';
import { loadConfig } from '../config';
import { cryptoRng } from '../rng';
import { dbNow, type PlayerCtx, type Tx } from '../tx';

/** Runs an admin change as one transaction: any throw rolls back the change and its log together (spec §6.4). */
export function adminTx<T>(fn: (tx: Tx, ctx: PlayerCtx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => fn(tx, { now: await dbNow(tx), cfg: await loadConfig(tx), rng: cryptoRng }), { maxWait: 30_000, timeout: 60_000 });
}
