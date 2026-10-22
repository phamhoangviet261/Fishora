import { json, readJson } from '@/lib/api';
import { registerUser } from '@/lib/auth/service';
import { setSessionCookie, signSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const result = await registerUser(await readJson(req));
  if (!result.ok) return json(result.error === 'email_taken' ? 409 : 400, { error: result.error });
  const res = json(201, { user: result.user });
  setSessionCookie(res, await signSession(result.user.id));
  return res;
}
