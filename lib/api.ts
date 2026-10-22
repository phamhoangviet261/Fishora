import { NextResponse } from 'next/server';
import { getCurrentUser, type PublicUser } from '@/lib/auth/session';
import { assertAdmin } from '@/lib/game/admin/guard';
import { GameError, withPlayer, type PlayerCtx, type Tx } from '@/lib/game/tx';

export const json = (status: number, body: unknown) => NextResponse.json(body, { status });

/** The signed-in user, or a 401 response to return as-is. */
export async function requireUser(): Promise<PublicUser | NextResponse> {
  return (await getCurrentUser()) ?? json(401, { error: 'unauthenticated' });
}

/** Request JSON body, or null when it is missing or not JSON. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** The request's Idempotency-Key header, or null when missing or longer than 100 chars. */
export function idempotencyKeyOf(req: Request): string | null {
  const key = req.headers.get('idempotency-key');
  return key && key.length <= 100 ? key : null;
}

/** Wraps a handler so a GameError becomes `{ error, detail? }` with its status; anything else stays a 500. */
export function gameRoute<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof GameError) return json(e.status, e.detail === undefined ? { error: e.code } : { error: e.code, detail: e.detail });
      throw e;
    }
  };
}

type PlayerFn<T> = (tx: Tx, ctx: PlayerCtx, userId: string) => Promise<T>;

/** A signed-in, idempotent game mutation: 401 / 400 checks, then withPlayer, then 200 with the result. */
export function playerAction<T>(req: Request, kind: string, fn: PlayerFn<T>): Promise<Response> {
  return gameRoute(async () => {
    const user = await requireUser();
    if (user instanceof Response) return user;
    const key = idempotencyKeyOf(req);
    if (!key) return json(400, { error: 'missing_idempotency_key' });
    return json(200, await withPlayer(user.id, (tx, ctx) => fn(tx, ctx, user.id), { idempotencyKey: key, kind }));
  })();
}

/** A signed-in read that still catches the world up first (no idempotency key needed). */
export function playerRead<T>(fn: PlayerFn<T>): Promise<Response> {
  return gameRoute(async () => {
    const user = await requireUser();
    if (user instanceof Response) return user;
    const res = json(200, await withPlayer(user.id, (tx, ctx) => fn(tx, ctx, user.id)));
    res.headers.set('cache-control', 'no-store');
    return res;
  })();
}

/** An admin-only handler; non-admins get 403 forbidden. */
export function adminRoute(fn: (adminId: string) => Promise<unknown>): Promise<Response> {
  return gameRoute(async () => {
    const user = await requireUser();
    if (user instanceof Response) return user;
    await assertAdmin(user.id);
    return json(200, await fn(user.id));
  })();
}
