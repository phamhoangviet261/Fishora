import { adminRoute, readJson } from '@/lib/api';
import { deleteMilestone, updateMilestone } from '@/lib/game/admin/milestones';
import { oneOf } from '@/lib/game/input';
import type { RewardBundle } from '@/lib/game/types';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await readJson(req)) as { weightGrams?: number; reward?: RewardBundle } | null;
  return adminRoute((adminId) => updateMilestone(adminId, id, { weightGrams: body?.weightGrams, reward: body?.reward }, oneOf(body, 'pendingPolicy', ['keep', 'replace'] as const)));
}

/** Soft delete: stops new claims, keeps the ones already opened. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return adminRoute((adminId) => deleteMilestone(adminId, id));
}
