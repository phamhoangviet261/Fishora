import { json, readJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/db';
import { listPlaced, parseLayout, saveLayout } from '@/lib/game/inventory';

export const runtime = 'nodejs';

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { tankType: true } });
  return json(200, { tankType: row?.tankType ?? 'planted120', items: await listPlaced(user.id) });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const entries = parseLayout(await readJson(req));
  if (!entries) return json(400, { error: 'invalid_layout' });
  const result = await saveLayout(user.id, entries);
  if (!result.ok) return json(result.error === 'not_owned' ? 403 : 400, { error: result.error });
  return json(200, { items: await listPlaced(user.id) });
}
