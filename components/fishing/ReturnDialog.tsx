'use client';

import { useState } from 'react';
import { Badge, Button, Modal } from '@/components/ui';
import { kg, rarityStatus } from '@/lib/client/format';
import { useGameData } from '@/lib/client/GameProvider';
import { useAction } from '@/lib/client/useAction';
import { RELEASE_RATIO } from '@/lib/game/rules';
import type { storageView } from '@/lib/game/snapshot';
import { useI18n, type MessageKey } from '@/lib/i18n';
import type { FishingView } from './types';
import s from './fishing.module.css';

type StorageView = Awaited<ReturnType<typeof storageView>>;

/**
 * Return to shore: the carried fish move into shared storage in one server transaction. If storage is short the
 * player picks which to release (25% each); nothing is ever dropped silently, and a failed transfer leaves the
 * container exactly as it was.
 */
export function ReturnDialog({ view, onClose }: { view: FishingView; onClose: () => void }) {
  const { t } = useI18n();
  const { run, busy } = useAction();
  const { data: storage } = useGameData<StorageView>('/api/storage');
  const fish = view.container.fish;
  const [keep, setKeep] = useState<Set<string>>(() => new Set(fish.map((f) => f.id)));
  const free = storage ? Math.max(0, storage.fishCapacity.maxGrams - storage.fishCapacity.usedGrams) : null;
  const bringing = fish.filter((f) => keep.has(f.id)).reduce((g, f) => g + f.weightGrams, 0);
  const short = free === null ? 0 : Math.max(0, bringing - free);
  const toggle = (id: string) => setKeep((k) => (k.has(id) ? new Set([...k].filter((x) => x !== id)) : new Set([...k, id])));

  return (
    <Modal title={t('rs.title')} onClose={onClose}>
      {fish.length === 0 ? (
        <p className={s.meta}>{t('rs.empty')}</p>
      ) : (
        <div className={s.column} style={{ padding: 0 }}>
          <div className={s.spread}>
            <span className={s.meta}>{free === null ? t('common.loading') : t('rs.free', { n: kg(free) })}</span>
            <strong>{t('rs.bringing', { n: kg(bringing) })}</strong>
          </div>
          {fish.map((f) => (
            <label key={f.id} className={s.slot}>
              <span className={s.spread}>
                <span className={s.row}>
                  <input type="checkbox" checked={keep.has(f.id)} onChange={() => toggle(f.id)} aria-label={f.name} />
                  <strong>{f.name}</strong>
                  <Badge status={rarityStatus[f.rarity]}>{t(`rarity.${f.rarity}` as MessageKey)}</Badge>
                </span>
                <span>{t('common.kg', { n: kg(f.weightGrams) })}</span>
              </span>
              {!keep.has(f.id) && <span className={s.meta}>{t('rs.release', { n: Math.floor(f.baseValue * RELEASE_RATIO) })}</span>}
            </label>
          ))}
          {short > 0 && <p className={s.warn}>{t('rs.over', { n: kg(short) })}</p>}
        </div>
      )}
      <div className={s.row} style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          tone="mint"
          disabled={busy || fish.length === 0 || free === null || short > 0}
          onClick={async () => {
            const r = await run<{ kept: string[]; released: string[]; releasedCoins: number }>('POST', '/api/fishing/return', { keepIds: [...keep] }, (d) =>
              t('rs.done', {
                kept: d.kept.length,
                extra: d.released.length ? t('rs.extra', { released: d.released.length, coins: d.releasedCoins }) : '',
              }),
            );
            if (r.ok) onClose();
          }}
        >
          {t('rs.confirm')}
        </Button>
      </div>
    </Modal>
  );
}
