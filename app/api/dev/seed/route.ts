import { json, readJson } from '@/lib/api';
import { prisma } from '@/lib/db';
import { devOnly } from '@/lib/devOnly';
import { applyContent } from '@/prisma/seed/apply';
import { TEST_CONTENT } from '@/prisma/seed/test-content';

export const runtime = 'nodejs';

/** E2E setup: writes the deterministic test content (profile 'test'). */
export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  await readJson(req);
  await applyContent(prisma, TEST_CONTENT, 'test');
  return json(200, { ok: true });
}
