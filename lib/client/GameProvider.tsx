'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { GameSnapshot } from '@/lib/game/snapshot';
import { api, type Method, type Result } from './api';

// The signed-in game's client state: the server snapshot plus which screen is open. The server is the authority;
// after every successful action the snapshot is re-read rather than patched locally.

export type Screen = 'tank' | 'fish' | 'storage' | 'shop' | 'fishing' | 'trip' | 'rewards' | 'collection';
/** JSON-serialised snapshot (dates arrive as strings). */
export type Snapshot = Omit<GameSnapshot, 'now' | 'dead'> & { now: string; dead: (Omit<GameSnapshot['dead'][number], 'reviveDeadline'> & { reviveDeadline: string })[] };

interface Game {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
  screen: Screen | null;
  /** Screen argument, e.g. the fish id for 'fish' or a tab for 'shop'. */
  arg: string | null;
  open(screen: Screen, arg?: string): void;
  close(): void;
  refresh(): Promise<void>;
  /** Runs a mutation and, on success, refreshes the snapshot. */
  act<T>(method: Method, path: string, body?: unknown): Promise<Result<T>>;
  toast: string | null;
  say(msg: string): void;
  /** Bumped after every successful action, so open screens can re-read their own data. */
  version: number;
}

const Ctx = createContext<Game | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nav, setNav] = useState<{ screen: Screen | null; arg: string | null }>({ screen: null, arg: null });
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const toastTimer = useRef<number>(undefined);
  const lastRefresh = useRef(0);

  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    lastRefresh.current = Date.now();
    // The first read of this page is a fresh load; later ones are refreshes.
    const r = await api<Snapshot>('GET', loaded.current ? '/api/state' : '/api/state?load=1');
    loaded.current = true;
    if (r.ok) {
      setSnapshot(r.data);
      setError(null);
    } else {
      setError(r.error);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setSnapshot(null);
      setNav({ screen: null, arg: null });
      return;
    }
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [user, refresh]);

  // Keep the tank current while the page is open: once per simulation tick, and whenever the tab comes back.
  const tickMs = Math.max(60_000, (snapshot?.tank.tickMinutes ?? 5) * 60_000);
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => document.visibilityState === 'visible' && refresh(), tickMs);
    // Coming back to the tab re-reads, but not more than every 15 s (some browsers fire this very often).
    const onVisible = () => document.visibilityState === 'visible' && Date.now() - lastRefresh.current > 15_000 && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, refresh, tickMs]);

  const act = useCallback(
    async <T,>(method: Method, path: string, body?: unknown): Promise<Result<T>> => {
      const r = await api<T>(method, path, body);
      if (r.ok) {
        await refresh();
        setVersion((v) => v + 1);
      }
      return r;
    },
    [refresh],
  );

  const say = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const value = useMemo<Game>(
    () => ({
      snapshot,
      loading,
      error,
      screen: nav.screen,
      arg: nav.arg,
      open: (screen, arg) => setNav({ screen, arg: arg ?? null }),
      close: () => setNav({ screen: null, arg: null }),
      refresh,
      act,
      toast,
      say,
      version,
    }),
    [snapshot, loading, error, nav, refresh, act, toast, say, version],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): Game {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}

/** Fetches a read endpoint and re-fetches after every successful game action. */
export function useGameData<T>(path: string | null) {
  const { version } = useGame();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const reload = useCallback(async () => {
    if (!path) return;
    const r = await api<T>('GET', path);
    setState(r.ok ? { data: r.data, error: null, loading: false } : { data: null, error: r.error, loading: false });
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload, version]);
  return { ...state, reload };
}
