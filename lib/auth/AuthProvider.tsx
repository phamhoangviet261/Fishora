'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type PublicUser = { id: string; email: string };
export type AuthErrorCode = 'invalid_email' | 'weak_password' | 'email_taken' | 'invalid_credentials' | 'network';

interface Auth {
  user: PublicUser | null;
  /** True until the first /api/auth/me check finishes. */
  loading: boolean;
  error: AuthErrorCode | null;
  login(email: string, password: string): Promise<boolean>;
  register(email: string, password: string): Promise<boolean>;
  logout(): Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Holds the signed-in player (session lives in an httpOnly cookie; this only mirrors who it is). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const submit = useCallback(async (path: string, email: string, password: string) => {
    setError(null);
    try {
      const res = await post(path, { email, password });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.error as AuthErrorCode) ?? 'network');
        return false;
      }
      setUser(data.user);
      return true;
    } catch {
      setError('network');
      return false;
    }
  }, []);

  const value = useMemo<Auth>(
    () => ({
      user,
      loading,
      error,
      login: (email, password) => submit('/api/auth/login', email, password),
      register: (email, password) => submit('/api/auth/register', email, password),
      logout: async () => {
        await post('/api/auth/logout').catch(() => undefined);
        setUser(null);
      },
    }),
    [user, loading, error, submit],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
