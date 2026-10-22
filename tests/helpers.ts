import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { registerUser } from '@/lib/auth/service';

// Tests run against the real database; every test account uses this domain and is removed afterwards.
export const TEST_DOMAIN = 'fishora.test';

export const testEmail = () => `test+${randomUUID().slice(0, 8)}@${TEST_DOMAIN}`;

export async function createTestUser(password = 'secret123') {
  const result = await registerUser({ email: testEmail(), password });
  if (!result.ok) throw new Error(`could not create test user: ${result.error}`);
  return result.user;
}

export async function deleteTestUsers() {
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_DOMAIN}` } } });
}
