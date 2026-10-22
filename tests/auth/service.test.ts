import { prisma } from '@/lib/db';
import { loginUser, registerUser } from '@/lib/auth/service';
import { TEST_CONTENT, seedTestContent } from '../fixtures/content';
import { deleteTestUsers, testEmail } from '../helpers';

beforeAll(seedTestContent);
afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

describe('registerUser', () => {
  test('stores a lowercase email and a hash, never the password', async () => {
    const email = testEmail();
    const r = await registerUser({ email: email.toUpperCase(), password: 'secret123' });
    expect(r).toMatchObject({ ok: true, user: { email } });
    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(row.passwordHash).not.toBe('secret123');
  });

  test('same email in another case/spacing is taken', async () => {
    const email = testEmail();
    await registerUser({ email, password: 'secret123' });
    expect(await registerUser({ email: ` ${email.toUpperCase()} `, password: 'secret123' })).toEqual({ ok: false, error: 'email_taken' });
  });

  test('two concurrent registrations: one wins, the other is email_taken', async () => {
    const email = testEmail();
    const results = await Promise.all([registerUser({ email, password: 'secret123' }), registerUser({ email, password: 'secret123' })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: 'email_taken' });
  });

  test('invalid email is rejected', async () => {
    expect(await registerUser({ email: 'bad', password: 'secret123' })).toEqual({ ok: false, error: 'invalid_email' });
  });

  test('grants starting coins, a ledger row and a tank', async () => {
    const r = await registerUser({ email: testEmail(), password: 'secret123' });
    if (!r.ok) throw new Error(r.error);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: r.user.id }, include: { transactions: true, tank: true } });
    expect(user.coins).toBe(TEST_CONTENT.config.starter.coins);
    expect(user.transactions).toEqual([expect.objectContaining({ amount: 250, balanceAfter: 250, reason: 'starting_grant' })]);
    expect(user.tank).toMatchObject({ dirt: 0 });
  });
});

describe('loginUser', () => {
  test('right password logs in regardless of email case/spacing', async () => {
    const email = testEmail();
    await registerUser({ email, password: 'secret123' });
    expect(await loginUser({ email: `  ${email.toUpperCase()}`, password: 'secret123' })).toMatchObject({ ok: true, user: { email } });
  });

  test('wrong password and unknown email give the same answer', async () => {
    const email = testEmail();
    await registerUser({ email, password: 'secret123' });
    const wrong = await loginUser({ email, password: 'secret124' });
    const unknown = await loginUser({ email: testEmail(), password: 'secret123' });
    expect(wrong).toEqual({ ok: false, error: 'invalid_credentials' });
    expect(unknown).toEqual(wrong);
  });
});
