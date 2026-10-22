import { adminRoute, readJson } from '@/lib/api';
import { str } from '@/lib/game/input';
import { createSpecies, listSpecies, type SpeciesPatch } from '@/lib/game/admin/species';

export const runtime = 'nodejs';

export async function GET() {
  return adminRoute(() => listSpecies());
}

export async function POST(req: Request) {
  const body = (await readJson(req)) as Record<string, unknown> | null;
  return adminRoute((adminId) => {
    const { key: _key, ...data } = body ?? {};
    return createSpecies(adminId, str(body, 'key'), data as SpeciesPatch & { displayName: string; modelKey: string; rarity: 'common' });
  });
}
