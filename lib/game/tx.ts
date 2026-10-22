import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { loadConfig } from './config';
import { cryptoRng, type Rng } from './rng';
import { advanceWorld } from './sim/advance';
import type { GameConfig } from './types';

export type Tx = Prisma.TransactionClient;

/** What every rule gets besides the transaction: the request's instant, the config and the randomness source. */
export interface PlayerCtx {
  now: Date;
  cfg: GameConfig;
  rng: Rng;
}

/** A rule refusing an action. Routes turn it into `{ error: code }` with this HTTP status. */
export class GameError extends Error {
  constructor(
    public code: string,
    public status: number,
    public detail?: unknown,
  ) {
    super(code);
  }
}

export async function dbNow(tx: Tx): Promise<Date> {
  const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT CURRENT_TIMESTAMP AS now`;
  return now;
}

export interface WithPlayerOptions {
  /** Makes the call once-only: a repeat returns the first result. */
  idempotencyKey?: string;
  kind?: string;
  /** Overrides the DB clock (tests, dev time travel). */
  now?: Date;
  rng?: Rng;
  /** Skip catching the world up to `now` (tests that check a rule's own guard). */
  skipAdvance?: boolean;
}

/**
 * The one way to change a player's state. Locks the player's row, so each player's requests run one at a time,
 * catches the world up to `now` (offline ticks, revive expiry), runs `fn`, and records the idempotent result,
 * all in one transaction. Any throw rolls everything back.
 */
export async function withPlayer<T>(userId: string, fn: (tx: Tx, ctx: PlayerCtx) => Promise<T>, opts: WithPlayerOptions = {}): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      if (locked.length === 0) throw new GameError('unauthenticated', 401);

      if (opts.idempotencyKey) {
        const done = await tx.operation.findUnique({ where: { userId_key: { userId, key: opts.idempotencyKey } } });
        if (done) return done.result as T;
      }

      const ctx: PlayerCtx = { now: opts.now ?? (await dbNow(tx)), cfg: await loadConfig(tx), rng: opts.rng ?? cryptoRng };
      if (!opts.skipAdvance) await advanceWorld(tx, userId, ctx);

      // Round-trip through JSON so a first call and its replay return the same shape.
      const result = JSON.parse(JSON.stringify((await fn(tx, ctx)) ?? null)) as T;
      if (opts.idempotencyKey) {
        await tx.operation.create({
          data: { userId, key: opts.idempotencyKey, kind: opts.kind ?? 'op', result: result as Prisma.InputJsonValue },
        });
      }
      return result;
    },
    { maxWait: 30_000, timeout: 30_000 },
  );
}

// ---------------------------------------------------------------- game days

const HOUR_MS = 3_600_000;

const ymdFormat = new Map<string, Intl.DateTimeFormat>();
const wallFormat = new Map<string, Intl.DateTimeFormat>();

function ymd(at: Date, tz: string): string {
  let f = ymdFormat.get(tz);
  if (!f) ymdFormat.set(tz, (f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })));
  return f.format(at);
}

/** Offset of the zone's wall clock from UTC at `at`, in ms. */
function zoneOffset(at: Date, tz: string): number {
  let f = wallFormat.get(tz);
  if (!f)
    wallFormat.set(
      tz,
      (f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })),
    );
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The game day an instant belongs to: 'YYYY-MM-DD' in the game timezone, with days starting at resetHour. */
export function dayKey(at: Date, tz: string, resetHour: number): string {
  return ymd(new Date(at.getTime() - resetHour * HOUR_MS), tz);
}

/** The first day-reset instant strictly after `at`. */
export function nextDayBoundary(at: Date, tz: string, resetHour: number): Date {
  const [y, m, d] = dayKey(at, tz, resetHour).split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d + 1, resetHour);
  let guess = wall - zoneOffset(new Date(wall), tz);
  guess = wall - zoneOffset(new Date(guess), tz); // second pass settles a DST change between the two
  return new Date(guess);
}
