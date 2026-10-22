import { adminRoute, readJson } from '@/lib/api';
import { updateSpecies, type SpeciesPatch } from '@/lib/game/admin/species';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const body = ((await readJson(req)) ?? {}) as SpeciesPatch;
  return adminRoute((adminId) => updateSpecies(adminId, key, body));
}
