import { NextResponse } from 'next/server';
import { SESSION_COOKIE, setSessionCookie, signSession, verifySession } from '@/lib/auth/session';

describe('session token', () => {
  test('round trip', async () => {
    expect(await verifySession(await signSession('u1'))).toBe('u1');
  });

  test('expired after 30 days', async () => {
    const token = await signSession('u1', new Date('2026-01-01T00:00:00Z'));
    expect(await verifySession(token, new Date('2026-01-30T00:00:00Z'))).toBe('u1');
    expect(await verifySession(token, new Date('2026-03-01T00:00:00Z'))).toBeNull();
  });

  test('tampered, missing or garbage tokens read as logged out', async () => {
    const token = await signSession('u1');
    const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
    expect(await verifySession(tampered)).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession('garbage')).toBeNull();
  });

  test('token signed with another secret is rejected', async () => {
    const { SignJWT } = await import('jose');
    const other = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('u1').setExpirationTime('1h').sign(new Uint8Array(32).fill(7));
    expect(await verifySession(other)).toBeNull();
  });

  test('cookie flags', () => {
    const res = NextResponse.json({});
    setSessionCookie(res, 'tok');
    const c = res.cookies.get(SESSION_COOKIE)!;
    expect(c).toMatchObject({ value: 'tok', httpOnly: true, sameSite: 'lax', path: '/', maxAge: 2592000 });
  });
});
