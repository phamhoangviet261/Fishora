import { adminRoute } from '@/lib/api';
import { changeHistory } from '@/lib/game/admin/milestones';

export const runtime = 'nodejs';

export async function GET() {
  return adminRoute(() => changeHistory());
}
