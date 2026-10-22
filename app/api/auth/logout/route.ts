import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST() {
  const res = new NextResponse(null, { status: 204 });
  clearSessionCookie(res);
  return res;
}
