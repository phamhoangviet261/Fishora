import { prisma } from '@/lib/db';
import { applyContent } from '@/prisma/seed/apply';
import { TEST_CONTENT } from '@/prisma/seed/test-content';

export { TEST_CONTENT, TEST_SPECIES } from '@/prisma/seed/test-content';

let seeded: Promise<void> | null = null;

/** Idempotent; safe to call from every test file's beforeAll. */
export function seedTestContent(): Promise<void> {
  return (seeded ??= applyContent(prisma, TEST_CONTENT, 'test'));
}
