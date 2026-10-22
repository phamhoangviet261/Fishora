import { json, requireUser } from '@/lib/api';

export const runtime = 'nodejs';

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return json(200, { user });
}
