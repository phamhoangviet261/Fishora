'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { WATER_CHANGE_COST } from '@/lib/game/catalog';
import { fishGroups, TANK_FISH } from '@/lib/fishSpecies';

// HUD state. Signed out it is a local-only prototype; signed in, coins and fish come from the server
// (which is authoritative for them) while care stats stay client-side until Phase 5.

export { WATER_CHANGE_COST };

export const GAME_MINUTES_PER_SECOND = 1; // 1 real second = 1 in-game minute
const STORAGE_KEY = 'fishora.proto.v1';

export type Weather = 'rain' | 'cloudy' | 'clear';

export interface FishGroup {
  species: string;
  count: number;
}

export interface GameState {
  minutes: number; // in-game minutes since day 1, 00:00
  coins: number;
  lightOn: boolean;
  tankType: string;
  fish: FishGroup[];
  satiety: number; // 0–100, only meaningful with fish
  mossClumps: number;
  algae: number; // % coverage
  ph: number;
  oxygen: number; // mg/L
}

const INITIAL: GameState = {
  minutes: 7 * 60,
  coins: 250,
  lightOn: true,
  tankType: 'planted120', // i18n key suffix: tank.<type>
  fish: fishGroups(), // i18n key suffix: fish.<species>; derived from TANK_FISH
  satiety: 80,
  mossClumps: 12,
  algae: 4,
  ph: 6.9,
  oxygen: 7.6,
};

type Action =
  | { type: 'tick'; minutes: number }
  | { type: 'toggleLight' }
  | { type: 'feed' }
  | { type: 'changeWater' }
  | { type: 'clean' }
  | { type: 'server'; coins: number; fish: FishGroup[] }
  | { type: 'waterChanged'; coins: number };

export type WaterChangeResult = 'ok' | 'insufficient' | 'error';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function reducer(s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'tick': {
      const h = a.minutes / 60;
      return {
        ...s,
        minutes: s.minutes + a.minutes,
        satiety: s.fish.length ? clamp(s.satiety - 2 * h, 0, 100) : s.satiety,
        algae: clamp(s.algae + (s.lightOn ? 0.25 : 0.02) * h, 0, 100),
        ph: clamp(s.ph - 0.004 * h, 6.0, 8.0),
        oxygen: clamp(s.oxygen + (s.lightOn ? 0.05 : -0.08) * h, 5.5, 8.6),
      };
    }
    case 'toggleLight':
      return { ...s, lightOn: !s.lightOn };
    case 'feed':
      return s.fish.length ? { ...s, satiety: clamp(s.satiety + 25, 0, 100) } : s;
    case 'changeWater':
      if (s.coins < WATER_CHANGE_COST) return s;
      return { ...s, coins: s.coins - WATER_CHANGE_COST, ph: 7.0, oxygen: 8.2, algae: clamp(s.algae * 0.7, 0, 100) };
    case 'clean':
      return { ...s, algae: clamp(s.algae * 0.35, 0, 100) };
    case 'server':
      return { ...s, coins: a.coins, fish: a.fish };
    case 'waterChanged':
      return { ...s, coins: a.coins, ph: 7.0, oxygen: 8.2, algae: clamp(s.algae * 0.7, 0, 100) };
  }
}

export function weatherAt(minutes: number): Weather {
  // Deterministic per in-game day, rainy-leaning to match the scene's window.
  const day = Math.floor(minutes / 1440);
  const r = Math.abs(Math.sin(day * 12.9898) * 43758.5453) % 1;
  return r < 0.5 ? 'rain' : r < 0.8 ? 'cloudy' : 'clear';
}

function loadSaved(fallback: GameState): GameState {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // tankType and fish are not player-changeable yet (no shop); always use the current key (older saves stored a label).
    return raw ? { ...fallback, ...JSON.parse(raw), tankType: fallback.tankType, fish: fallback.fish } : fallback;
  } catch {
    return fallback; // storage unavailable: start fresh
  }
}

const SPECIES = new Map(TANK_FISH.map((f) => [f.id, f]));

/** HUD groups for the player's placed fish (unknown species keys are skipped). */
function placedFishGroups(items: { kind: string; itemKey: string }[]): FishGroup[] {
  return fishGroups(items.flatMap((i) => (i.kind === 'fish' && SPECIES.has(i.itemKey) ? [SPECIES.get(i.itemKey)!] : [])));
}

export function useGameState() {
  const [state, dispatch] = useReducer(reducer, INITIAL, loadSaved);
  const { user } = useAuth();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!user) {
      // Back to guest play: storage always holds the guest's own coins (see the save effect below).
      if (wasSignedIn.current) dispatch({ type: 'server', coins: loadSaved(INITIAL).coins, fish: INITIAL.fish });
      wasSignedIn.current = false;
      return;
    }
    wasSignedIn.current = true;
    let live = true;
    Promise.all([fetch('/api/player').then((r) => r.json()), fetch('/api/aquarium/layout').then((r) => r.json())])
      .then(([player, layout]) => {
        if (!live || typeof player.coins !== 'number') return;
        dispatch({ type: 'server', coins: player.coins, fish: placedFishGroups(layout.items ?? []) });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user]);

  useEffect(() => {
    const id = window.setInterval(() => dispatch({ type: 'tick', minutes: GAME_MINUTES_PER_SECOND }), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      // While signed in, the account's coins live on the server; keep the guest's coins in storage untouched.
      const saved = user ? { ...state, coins: loadSaved(INITIAL).coins, fish: INITIAL.fish } : state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [state, user]);

  const changeWater = useCallback(async (): Promise<WaterChangeResult> => {
    if (!user) {
      dispatch({ type: 'changeWater' });
      return 'ok';
    }
    try {
      const res = await fetch('/api/care/water-change', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) return 'insufficient';
      if (!res.ok || typeof data.coins !== 'number') return 'error';
      dispatch({ type: 'waterChanged', coins: data.coins });
      return 'ok';
    } catch {
      return 'error';
    }
  }, [user]);

  return {
    state,
    toggleLight: useCallback(() => dispatch({ type: 'toggleLight' }), []),
    feed: useCallback(() => dispatch({ type: 'feed' }), []),
    changeWater,
    clean: useCallback(() => dispatch({ type: 'clean' }), []),
  };
}
