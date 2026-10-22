import { NextResponse } from 'next/server';
import { getCurrentUser, type PublicUser } from '@/lib/auth/session';

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
