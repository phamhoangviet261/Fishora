'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Confirm, Modal, ProgressBar, Stepper } from '@/components/ui';
import { api } from '@/lib/client/api';
import { errorText, kg, rarityStatus } from '@/lib/client/format';
import { useGame, useGameData } from '@/lib/client/GameProvider';
import { useAction } from '@/lib/client/useAction';
import type { CastResult } from '@/lib/game/fishing/cast';
import type { tripView } from '@/lib/game/fishing/trip';
import type { storageView } from '@/lib/game/snapshot';
import { RELEASE_RATIO } from '@/lib/game/rules';
import { useI18n, type MessageKey } from '@/lib/i18n';
import s from '../screens.module.css';

type Trip = Awaited<ReturnType<typeof tripView>>;
type StorageView = Awaited<ReturnType<typeof storageView>>;

/**
 * An open fishing trip (spec §7.3, §7.4). Casts are decided by the server; the catch waits in the cooler until
 * "Return home". The page keeps the trip alive with a heartbeat; closing the page or leaving loses the catch.
 */
export function TripScreen({ tripId }: { tripId: string }) {
  const { snapshot, open, say } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  const { data: trip, error, reload } = useGameData<Trip>(`/api/fishing/trips/${tripId}`);
  const [last, setLast] = useState<CastResult | null>(null);
  const [casting, setCasting] = useState(false);
  const [baitQty, setBaitQty] = useState(10);
  const [leaving, setLeaving] = useState(false);
  const [returning, setReturning] = useState(false);

  // Heartbeat while the screen is open; a closed page cancels the trip outright.
  const beatSec = snapshot?.tripHeartbeatSec ?? 30;
  useEffect(() => {
    const id = window.setInterval(() => void api('POST', `/api/fishing/trips/${tripId}/heartbeat`), beatSec * 1000);
    const onHide = () => navigator.sendBeacon(`/api/fishing/trips/${tripId}/cancel`);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('pagehide', onHide);
    };
  }, [tripId, beatSec]);

  const doCast = async () => {
    setCasting(true);
    // A short cast animation; the result was decided by the server the moment the request arrived.
    const [r] = await Promise.all([api<CastResult>('POST', `/api/fishing/trips/${tripId}/cast`), new Promise((ok) => setTimeout(ok, 900))]);
    setCasting(false);
    if (r.ok) setLast(r.data);
    else say(errorText(t, r.error, r.detail));
    await reload();
  };

  if (error) {
    return (
      <Modal title={t('nav.fishing')} onClose={() => open('fishing')}>
        <p className={s.error}>{errorText(t, error)}</p>
        <Button onClick={() => open('fishing')}>{t('common.back')}</Button>
      </Modal>
    );
  }
  if (!trip) {
    return (
      <Modal title={t('nav.fishing')} onClose={() => setLeaving(true)}>
        <p className={s.muted}>{t('common.loading')}</p>
      </Modal>
    );
  }

  const full = trip.coolerGrams > trip.capacityGrams;
  return (
    <Modal title={t('trip.title', { zone: trip.zone.name })} onClose={() => setLeaving(true)} wide>
      <div className={s.stack}>
        <div className={s.spread}>
          <span className={s.num}>{t('trip.bait', { n: trip.bait.qty })}</span>
          {trip.bait.key && trip.bait.price !== null && (
            <span className={s.row}>
              <Stepper value={baitQty} max={999} onChange={setBaitQty} label={t('shop.qty')} />
              <Button
                disabled={busy || (snapshot?.player.coins ?? 0) < trip.bait.price * baitQty}
                onClick={() => run('POST', '/api/shop/buy', { type: 'item', key: trip.bait.key, qty: baitQty }).then(() => reload())}
              >
                {t('trip.buyBait')} · {t('common.coins', { n: trip.bait.price * baitQty })}
              </Button>
            </span>
          )}
        </div>

        <Button tone="mint" className={s.castButton} disabled={casting || busy || trip.bait.qty === 0 || full} onClick={doCast} data-casting={casting}>
          {casting ? t('trip.casting') : t('trip.cast')}
        </Button>

        {last && !casting && (
          <div className={s.card} role="status">
            {last.outcome === 'miss' ? (
              <span className={s.cardTitle}>{t('trip.miss')}</span>
            ) : last.outcome === 'caught' ? (
              <>
                <strong className={s.cardTitle}>
                  {t('trip.caught', { name: last.speciesName, kg: kg(last.weightGrams) })}
                </strong>
                {last.fought && <Badge status="good">{t('trip.fought')}</Badge>}
              </>
            ) : (
              <span className={s.cardTitle}>{t('trip.escaped', { name: last.speciesName, kg: kg(last.weightGrams) })}</span>
            )}
          </div>
        )}

        <div className={s.spread}>
          <strong>{t('trip.cooler')}</strong>
          <ProgressBar value={(trip.coolerGrams / Math.max(1, trip.capacityGrams)) * 100} status={full ? 'bad' : trip.coolerGrams / trip.capacityGrams > 0.8 ? 'warn' : 'good'} label={t('trip.cooler')} />
          <span className={s.num}>
            {kg(trip.coolerGrams)} / {t('common.kg', { n: kg(trip.capacityGrams) })}
          </span>
        </div>
        {full && <p className={s.error}>{t('error.cooler_full')}</p>}
        {trip.cooler.length === 0 ? (
          <p className={s.muted}>{t('trip.empty')}</p>
        ) : (
          <ul className={s.list}>
            {trip.cooler.map((f) => (
              <li key={f.id} className={s.card}>
                <div className={s.spread}>
                  <strong className={s.cardTitle}>{f.name}</strong>
                  <span className={s.num}>{t('common.kg', { n: kg(f.weightGrams) })}</span>
                </div>
                <div className={s.spread}>
                  <Badge status={rarityStatus[f.rarity]}>{t(`rarity.${f.rarity}` as MessageKey)}</Badge>
                  <Button
                    tone="coral"
                    disabled={busy}
                    onClick={() =>
                      run<{ total: number }>('POST', `/api/fishing/trips/${tripId}/release`, { fishIds: [f.id] }, (r) => t('trip.released', { n: r.total })).then(() =>
                        reload(),
                      )
                    }
                  >
                    {t('trip.release')} · +{Math.floor(f.baseValue * RELEASE_RATIO)}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className={s.row}>
          <Button onClick={() => setLeaving(true)}>{t('trip.leaveConfirm')}</Button>
          <Button tone="butter" disabled={busy} onClick={() => setReturning(true)}>
            {t('trip.return')}
          </Button>
        </div>
      </div>

      {leaving && (
        <Confirm
          title={t('trip.leave')}
          body={trip.cooler.length ? t('trip.leaveBody') : undefined}
          confirmLabel={t('trip.leaveConfirm')}
          onCancel={() => setLeaving(false)}
          onConfirm={async () => {
            await run('POST', `/api/fishing/trips/${tripId}/cancel`);
            open('fishing');
          }}
        />
      )}
      {returning && <ReturnHomeDialog trip={trip} onClose={() => setReturning(false)} />}
    </Modal>
  );
}

/** Choose which fish to bring home; storage must hold them all, the rest are released for 25% (spec §7.4). */
function ReturnHomeDialog({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { open } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  const { data: storage } = useGameData<StorageView>('/api/storage');
  const [keep, setKeep] = useState<Set<string>>(() => new Set(trip.cooler.map((f) => f.id)));
  const free = storage ? Math.max(0, storage.fishCapacity.maxGrams - storage.fishCapacity.usedGrams) : null;
  const selected = trip.cooler.filter((f) => keep.has(f.id)).reduce((g, f) => g + f.weightGrams, 0);
  const over = free === null ? 0 : Math.max(0, selected - free);
  const toggle = (id: string) => setKeep((k) => (k.has(id) ? new Set([...k].filter((x) => x !== id)) : new Set([...k, id])));

  return (
    <Modal title={t('ret.title')} onClose={onClose}>
      <div className={s.stack}>
        <div className={s.spread}>
          <span className={s.meta}>{free === null ? t('common.loading') : t('ret.free', { n: kg(free) })}</span>
          <span className={s.num}>{t('ret.selected', { n: kg(selected) })}</span>
        </div>
        <ul className={s.list}>
          {trip.cooler.map((f) => (
            <li key={f.id} className={s.card} data-selected={keep.has(f.id)}>
              <label className={s.spread}>
                <span className={s.row}>
                  <input type="checkbox" className={s.check} checked={keep.has(f.id)} onChange={() => toggle(f.id)} aria-label={f.name} />
                  <strong className={s.cardTitle}>{f.name}</strong>
                </span>
                <span className={s.num}>{t('common.kg', { n: kg(f.weightGrams) })}</span>
              </label>
              {!keep.has(f.id) && <span className={s.meta}>{t('ret.releaseFor', { n: Math.floor(f.baseValue * RELEASE_RATIO) })}</span>}
            </li>
          ))}
        </ul>
        {over > 0 && <p className={s.error}>{t('ret.over', { n: kg(over) })}</p>}
        <div className={s.row}>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            tone="mint"
            disabled={busy || free === null || over > 0}
            onClick={async () => {
              const r = await run<{ kept: string[]; released: string[]; releasedCoins: number }>(
                'POST',
                `/api/fishing/trips/${trip.id}/return`,
                { keepIds: [...keep] },
                (d) => t('ret.done', { kept: d.kept.length, released: d.released.length, coins: d.releasedCoins }),
              );
              if (r.ok) open('storage');
            }}
          >
            {t('ret.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
