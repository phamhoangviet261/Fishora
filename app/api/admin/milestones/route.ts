import { adminRoute, readJson } from '@/lib/api';
import { createMilestone, listMilestones } from '@/lib/game/admin/milestones';
import { oneOf, posInt } from '@/lib/game/input';
import type { RewardBundle } from '@/lib/game/types';

export const runtime = 'nodejs';

export async function GET() {
  return adminRoute(() => listMilestones());
}

export async function POST(req: Request) {
  const body = (await readJson(req)) as { speciesKey?: unknown; reward?: unknown } | null;
  return adminRoute((adminId) =>
    createMilestone(
      adminId,
      { speciesKey: typeof body?.speciesKey === 'string' ? body.speciesKey : null, weightGrams: posInt(body, 'weightGrams', 10_000_000), reward: body?.reward as RewardBundle },
      oneOf(body, 'pendingPolicy', ['keep', 'replace'] as const),
    ),
  );
}
