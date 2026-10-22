import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { STARTING_COINS, startingFish } from '@/lib/game/catalog';
import { parseCredentials } from './credentials';
import { hashPassword, verifyPassword } from './password';
import type { PublicUser } from './session';

// Compared against when the email is unknown, so that path costs the same as a wrong password.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword('fishora-timing-equaliser'));

export const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Creates the account with its starting grant (coins + fish) in one transaction. */
export async function registerUser(
  input: unknown,
): Promise<{ ok: true; user: PublicUser } | { ok: false; error: 'invalid_email' | 'weak_password' | 'email_taken' }> {
  const parsed = parseCredentials(input);
  if (!parsed.ok) return parsed;
  const { email, password } = parsed.value;
  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        coins: STARTING_COINS,
        transactions: { create: { amount: STARTING_COINS, balanceAfter: STARTING_COINS, reason: 'starting_grant' } },
        items: { create: startingFish().map((itemKey) => ({ kind: 'fish', itemKey, placed: true })) },
      },
      select: { id: true, email: true },
    });
    return { ok: true, user };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: 'email_taken' };
    throw e;
  }
}

export async function loginUser(input: unknown): Promise<{ ok: true; user: PublicUser } | { ok: false; error: 'invalid_credentials' }> {
  const parsed = parseCredentials(input);
  if (!parsed.ok) return { ok: false, error: 'invalid_credentials' };
  const { email, password } = parsed.value;
  const row = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, passwordHash: true } });
  const match = await verifyPassword(password, row?.passwordHash ?? (await getDummyHash()));
  if (!row || !match) return { ok: false, error: 'invalid_credentials' };
  return { ok: true, user: { id: row.id, email: row.email } };
}
