import { json, readJson } from '@/lib/api';
import { loginUser } from '@/lib/auth/service';
import { setSessionCookie, signSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const result = await loginUser(await readJson(req));
  if (!result.ok) return json(401, { error: result.error });
  const res = json(200, { user: result.user });
  setSessionCookie(res, await signSession(result.user.id));
  return res;
}
