'use client';

import { useCallback, useEffect, useReducer } from 'react';

// Client-side prototype state. Per the architecture docs, coins and care state will move to the
// server later; this only drives the HUD so the layout and feel can be evaluated now.

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
  fish: [],
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
  | { type: 'clean' };

export const WATER_CHANGE_COST = 5;

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
    // tankType is not player-changeable yet; always use the current key (older saves stored a label).
    return raw ? { ...fallback, ...JSON.parse(raw), tankType: fallback.tankType } : fallback;
  } catch {
    return fallback; // storage unavailable: start fresh
  }
}

export function useGameState() {
  const [state, dispatch] = useReducer(reducer, INITIAL, loadSaved);

  useEffect(() => {
    const id = window.setInterval(() => dispatch({ type: 'tick', minutes: GAME_MINUTES_PER_SECOND }), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  return {
    state,
    toggleLight: useCallback(() => dispatch({ type: 'toggleLight' }), []),
    feed: useCallback(() => dispatch({ type: 'feed' }), []),
    changeWater: useCallback(() => dispatch({ type: 'changeWater' }), []),
    clean: useCallback(() => dispatch({ type: 'clean' }), []),
  };
}
