'use client';

import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Panel, ProgressBar } from '@/components/ui';
import { api } from '@/lib/client/api';
import { errorText, kg } from '@/lib/client/format';
import { useGame } from '@/lib/client/GameProvider';
import { sfx } from '@/lib/client/sfx';
import { fishingReducer, initialFishing, type AttemptInfo, type CatchCard as Card } from '@/lib/game/fishing/machine';
import { initReel, quantize, stepReel, type ReelState } from '@/lib/game/fishing/reel';
import { seededRng, type Rng } from '@/lib/game/prng';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { CatchCard } from './CatchCard';
import { FishingScene } from './FishingScene';
import { blockerFor } from './PrepPanel';
import { CAST_FLIGHT_MS, CATCH_ANIM_MS, newSceneBus } from './sceneBus';
import type { FishingView } from './types';
import s from './fishing.module.css';

const CHARGE_PERIOD_MS = 1200;
const BITE_SHOW_MS = 700;
const RESULT_SHOW_MS = 1800;

/** Charge oscillates 0→1→0 while held, so timing the release matters (cosmetic only: it sets how far the bobber flies). */
const chargeAt = (ms: number) => {
  const t = (ms % (CHARGE_PERIOD_MS * 2)) / CHARGE_PERIOD_MS;
  return t <= 1 ? t : 2 - t;
};

type Reel = { s: ReelState; rng: Rng; inputs: (number | null)[]; acc: number; last: number };
type ResolveResponse = { outcome: 'caught' | 'escaped' | 'nothing'; card: Card | null };

/**
 * One fishing session on a map: hold to charge, release to cast, wait for the bite, then reel by holding the button
 * and keeping the cursor inside the moving zone. Transient state lives here; the server owns bait, the attempt, the
 * verdict and the fish.
 */
export function FishingSession({
  view,
  zoneKey,
  onExit,
  onReturn,
  onChanged,
}: {
  view: FishingView;
  zoneKey: string;
  onExit: () => void;
  onReturn: () => void;
  /** Server state changed (bait used, fish stored): re-read the view and the coin balance. */
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { say, refresh } = useGame();
  const [state, dispatch] = useReducer(fishingReducer, initialFishing);
  const bus = useRef(newSceneBus());
  const pointer = useRef({ holding: false, x: 0.5 });
  const trackRef = useRef<HTMLDivElement>(null);
  const reel = useRef<Reel | null>(null);
  const [reelView, setReelView] = useState({ center: 0.5, progress: 0, patience: 1 });
  const [power, setPower] = useState(0);
  const [cursorX, setCursorX] = useState(0.5);
  const [showCard, setShowCard] = useState<Card | null>(null);
  const [retry, setRetry] = useState<null | { inputs: (number | null)[]; key: string }>(null);
  const live = useRef(state);
  live.current = state;

  const zone = view.zones.find((z) => z.key === zoneKey);
  const bait = view.equipment.baits.find((b) => b.itemKey === view.loadout.baitKey)?.qty ?? 0;
  const cooler = view.equipment.coolers.find((c) => c.id === view.loadout.coolerId);
  const blocker = blockerFor(view, zoneKey);

  useEffect(() => {
    bus.current.phase = state.phase;
  }, [state.phase]);

  const reloadView = useCallback(() => {
    onChanged();
    void refresh();
  }, [onChanged, refresh]);

  // ---------- cast ----------

  const cast = useCallback(async () => {
    const p = chargeAt(performance.now() - live.current.chargeStart);
    dispatch({ type: 'release', power: p });
    bus.current.power = p;
    bus.current.castAt = performance.now();
    window.setTimeout(() => dispatch({ type: 'landed' }), CAST_FLIGHT_MS);
    // The cast power is not sent: distance never affects what bites.
    const r = await api<AttemptInfo>('POST', '/api/fishing/attempts', { zoneKey });
    if (r.ok) dispatch({ type: 'attemptStarted', attempt: r.data });
    else {
      dispatch({ type: 'failed', error: r.error });
      say(errorText(t, r.error, r.detail));
    }
    reloadView();
  }, [zoneKey, say, t, reloadView]);

  // ---------- resolve ----------

  const resolve = useCallback(
    async (attemptId: string, inputs: (number | null)[], key = crypto.randomUUID()) => {
      setRetry(null);
      const r = await api<ResolveResponse>('POST', `/api/fishing/attempts/${attemptId}/resolve`, { inputs }, { key });
      if (!r.ok) {
        // Keep the recorded reel and the same key: a retry can't be counted twice, and nothing is lost.
        if (r.error === 'network' || r.error.startsWith('http_5')) setRetry({ inputs, key });
        else {
          dispatch({ type: 'failed', error: r.error });
          say(errorText(t, r.error, r.detail));
        }
        return;
      }
      dispatch({ type: 'resolved', outcome: r.data.outcome, card: r.data.card });
      if (r.data.outcome === 'caught' && r.data.card) {
        bus.current.caughtAt = performance.now();
        bus.current.catchModelKey = r.data.card.modelKey;
        sfx.caught();
        const card = r.data.card;
        window.setTimeout(() => setShowCard(card), CATCH_ANIM_MS);
      } else {
        if (r.data.outcome === 'escaped') sfx.escaped();
        window.setTimeout(() => dispatch({ type: 'reset' }), RESULT_SHOW_MS);
      }
      reloadView();
    },
    [say, t, reloadView],
  );

  // ---------- phase timers ----------

  useEffect(() => {
    if (state.phase === 'waiting' && state.attempt) {
      const id = window.setTimeout(() => dispatch({ type: 'bite' }), state.attempt.waitMs);
      return () => window.clearTimeout(id);
    }
    if (state.phase === 'bite') {
      bus.current.biteAt = performance.now();
      sfx.bite();
      const id = window.setTimeout(() => dispatch({ type: 'reel' }), BITE_SHOW_MS);
      return () => window.clearTimeout(id);
    }
    if (state.phase === 'nothing' && state.attempt) void resolve(state.attempt.attemptId, []);
  }, [state.phase, state.attempt, resolve]);

  // ---------- charging loop (cosmetic) ----------

  useEffect(() => {
    if (state.phase !== 'charging') return;
    let raf = 0;
    const loop = () => {
      const p = chargeAt(performance.now() - state.chargeStart);
      bus.current.power = p;
      setPower(p);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.phase, state.chargeStart]);

  // ---------- reel loop: fixed ticks, the same simulation the server replays ----------

  useEffect(() => {
    if (state.phase !== 'reeling' || !state.attempt?.reel) return;
    const p = state.attempt.reel;
    const rng = seededRng(p.seed);
    reel.current = { s: initReel(p, rng), rng, inputs: [], acc: 0, last: performance.now() };
    const attemptId = state.attempt.attemptId;
    let raf = 0;
    const loop = () => {
      const r = reel.current!;
      const now = performance.now();
      r.acc += Math.min(now - r.last, 250); // a stalled tab doesn't fast-forward the fish
      r.last = now;
      while (r.acc >= p.tickMs && !r.s.done) {
        const x = pointer.current.holding ? quantize(pointer.current.x) : null;
        r.inputs.push(x);
        r.s = stepReel(r.s, p, r.rng, x);
        r.acc -= p.tickMs;
      }
      bus.current.center = r.s.center;
      bus.current.progress = r.s.progress;
      setReelView({ center: r.s.center, progress: r.s.progress, patience: r.s.patience });
      if (r.s.done) {
        dispatch({ type: 'reelDone', outcome: r.s.done });
        void resolve(attemptId, r.inputs);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.phase, state.attempt, resolve]);

  // ---------- leaving: the unfinished attempt is cancelled; caught fish stay in the container ----------

  useEffect(() => {
    const unfinished = () => {
      const st = live.current;
      return st.attempt && ['casting', 'waiting', 'bite', 'reeling'].includes(st.phase) ? st.attempt.attemptId : null;
    };
    const onHide = () => {
      const id = unfinished();
      if (id) navigator.sendBeacon(`/api/fishing/attempts/${id}/cancel`);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      const id = unfinished();
      if (id) void api('POST', `/api/fishing/attempts/${id}/cancel`);
    };
  }, []);

  // Losing focus releases the button; an unreleased charge is dropped (no bait is spent before the release).
  useEffect(() => {
    const letGo = () => {
      pointer.current.holding = false;
      if (live.current.phase === 'charging') dispatch({ type: 'reset' });
    };
    const onVis = () => document.visibilityState === 'hidden' && letGo();
    window.addEventListener('blur', letGo);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('blur', letGo);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // ---------- pointer input ----------

  const trackX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0.5;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    sfx.unlock();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured (e.g. synthetic ones); moves over the layer still track it.
    }
    pointer.current = { holding: true, x: trackX(e.clientX) };
    setCursorX(pointer.current.x);
    if (live.current.phase === 'idle' && !blocker) dispatch({ type: 'press', at: performance.now() });
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointer.current.x = trackX(e.clientX);
    setCursorX(pointer.current.x);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    pointer.current.holding = false;
    if (live.current.phase === 'charging') void cast();
  };
  const onCancel = () => {
    pointer.current.holding = false;
    if (live.current.phase === 'charging') dispatch({ type: 'reset' });
  };

  const phase = state.phase;
  const reeling = phase === 'reeling' || phase === 'resolving';
  const busyAttempt = !['idle', 'caught', 'escaped', 'nothing'].includes(phase);
  const hint =
    phase === 'idle' ? (blocker ? t(`fp.why.${blocker}` as MessageKey) : t('fs.hint.idle')) : phase === 'charging' ? t('fs.hint.charging') : phase === 'casting' || phase === 'waiting' ? t('fs.hint.waiting') : phase === 'reeling' ? t('fs.hint.reeling') : null;
  const width = state.attempt?.reel?.targetWidth ?? 0.2;
  const onTarget = pointer.current.holding && Math.abs(cursorX - reelView.center) <= width / 2;

  return (
    <>
      <div className={s.canvas}>
        <FishingScene bus={bus} zoneKey={zoneKey} />
      </div>
      <div
        className={s.input}
        data-phase={phase}
        data-testid="fishing-input"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onLostPointerCapture={() => (pointer.current.holding = false)}
      />

      {reeling && (
        <div className={s.patience} aria-label={t('fs.patience')}>
          <div ref={trackRef} className={s.track} data-testid="reel-track" data-center={reelView.center.toFixed(3)}>
            <span className={s.target} data-on={onTarget} style={{ left: `${(reelView.center - width / 2) * 100}%`, width: `${width * 100}%` }} />
            <span className={s.cursor} style={{ left: `${cursorX * 100}%` }} />
          </div>
          <div className={s.patienceMeter} role="meter" aria-label={t('fs.patience')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(reelView.patience * 100)}>
            <span style={{ width: `${reelView.patience * 100}%` }} />
          </div>
          <div className={s.label}>{t('fs.patience')}</div>
        </div>
      )}
      {/* Keep a (hidden) track measured outside the reel too, so the first reel frame maps the cursor correctly. */}
      {!reeling && <div ref={trackRef} className={s.patience} style={{ visibility: 'hidden' }} aria-hidden />}

      {(reeling || phase === 'charging') && (
        <div className={s.vertical}>
          <div
            className={s.vbar}
            data-kind={reeling ? 'progress' : 'power'}
            role="meter"
            aria-label={reeling ? t('fs.progress') : t('fs.power')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((reeling ? reelView.progress : power) * 100)}
          >
            <span style={{ height: `${(reeling ? reelView.progress : power) * 100}%` }} />
          </div>
          <span className={s.sideLabel}>{reeling ? t('fs.progress') : t('fs.power')}</span>
        </div>
      )}

      {phase === 'bite' && <div className={s.bite} role="alert">{t('fs.bite')}</div>}
      {phase === 'resolving' && !retry && <Panel tone="butter" className={s.result}>{t('fs.resolving')}</Panel>}
      {phase === 'escaped' && <Panel tone="coral" className={s.result}>{t('fs.escaped')}</Panel>}
      {phase === 'nothing' && <Panel tone="sky" className={s.result}>{t('fs.nothing')}</Panel>}
      {retry && state.attempt && (
        <Panel tone="butter" className={s.result} role="alert">
          <p>{t('fs.retry')}</p>
          <Button tone="mint" onClick={() => resolve(state.attempt!.attemptId, retry.inputs, retry.key)}>
            {t('fs.retryButton')}
          </Button>
        </Panel>
      )}
      {hint && <Panel tone="cream" className={s.hint}>{hint}</Panel>}

      <Panel tone="cream" className={s.status}>
        <strong>{zone?.name}</strong>
        <span className={s.spread}>
          <span>{t('fs.bait', { n: bait })}</span>
          <span className={s.meta}>{cooler ? `${kg(view.container.carriedGrams)} / ${t('common.kg', { n: kg(cooler.capacityGrams) })}` : ''}</span>
        </span>
        {cooler && <ProgressBar value={(view.container.carriedGrams / Math.max(1, cooler.capacityGrams)) * 100} status={blocker === 'full' ? 'bad' : 'info'} label={t('fs.container')} />}
        {blocker === 'full' && <span className={s.warn}>{t('fs.full')}</span>}
        <div className={s.row}>
          <Button tone="butter" disabled={busyAttempt || view.container.fish.length === 0} onClick={onReturn}>
            {t('fs.returnShore')}
          </Button>
          <Button disabled={busyAttempt} onClick={onExit}>
            {t('fs.changeGear')}
          </Button>
        </div>
      </Panel>

      {showCard && (
        <CatchCard
          card={showCard}
          onClose={() => {
            setShowCard(null);
            bus.current.catchModelKey = null;
            dispatch({ type: 'reset' });
          }}
        />
      )}
    </>
  );
}
