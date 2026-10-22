export type Credentials = { email: string; password: string };
export type CredentialsError = 'invalid_email' | 'weak_password';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MIN_PASSWORD_BYTES = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything past 72 bytes

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseCredentials(input: unknown): { ok: true; value: Credentials } | { ok: false; error: CredentialsError } {
  const o = (input ?? {}) as Record<string, unknown>;
  if (typeof o.email !== 'string') return { ok: false, error: 'invalid_email' };
  const email = normalizeEmail(o.email);
  if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return { ok: false, error: 'invalid_email' };
  if (typeof o.password !== 'string') return { ok: false, error: 'weak_password' };
  const bytes = new TextEncoder().encode(o.password).length;
  if (bytes < MIN_PASSWORD_BYTES || bytes > MAX_PASSWORD_BYTES) return { ok: false, error: 'weak_password' };
  return { ok: true, value: { email, password: o.password } };
}
