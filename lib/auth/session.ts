import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Stateless session: a signed JWT in an httpOnly cookie, verified on every request.

export const SESSION_COOKIE = 'fishora_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, seconds

let cachedKey: Uint8Array | null = null;
function key(): Uint8Array {
  if (cachedKey) return cachedKey;
  const raw = process.env.AUTH_SECRET;
  const bytes = raw ? Uint8Array.from(Buffer.from(raw, 'base64')) : new Uint8Array();
  if (bytes.length < 32) throw new Error('AUTH_SECRET must be set to at least 32 random bytes (base64).');
  return (cachedKey = bytes);
}

export async function signSession(userId: string, now: Date = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_MAX_AGE)
    .sign(key());
}

/** The user id in a valid, unexpired token; null for anything else. Never throws. */
export async function verifySession(token: string | undefined, now: Date = new Date()): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'], currentDate: now });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export type PublicUser = { id: string; email: string };

/** The signed-in user for this request, or null (no/invalid cookie, or the account no longer exists). */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const id = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  return prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
}
