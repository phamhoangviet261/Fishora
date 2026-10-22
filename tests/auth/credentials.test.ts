import { parseCredentials } from '@/lib/auth/credentials';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('parseCredentials', () => {
  test('normalises the email', () => {
    expect(parseCredentials({ email: '  A@Fish.io ', password: 'secret123' })).toEqual({
      ok: true,
      value: { email: 'a@fish.io', password: 'secret123' },
    });
  });

  test.each([
    [{ email: 'not-an-email', password: 'secret123' }],
    [{ email: `${'a'.repeat(250)}@x.io`, password: 'secret123' }],
    [{ password: 'secret123' }],
    [{ email: 42, password: 'secret123' }],
    [null],
  ])('rejects bad email %#', (input) => {
    expect(parseCredentials(input)).toEqual({ ok: false, error: 'invalid_email' });
  });

  test.each([['short'], ['a'.repeat(73)], ['ệ'.repeat(25)]])('rejects weak/oversized password %#', (password) => {
    expect(parseCredentials({ email: 'a@fish.io', password })).toEqual({ ok: false, error: 'weak_password' });
  });

  test('accepts exactly 72 bytes', () => {
    expect(parseCredentials({ email: 'a@fish.io', password: 'a'.repeat(72) }).ok).toBe(true);
  });
});

describe('password hashing', () => {
  test('bcrypt cost 12, verifies only the right password', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword('secret123', hash)).toBe(true);
    expect(await verifyPassword('secret124', hash)).toBe(false);
  });
});
