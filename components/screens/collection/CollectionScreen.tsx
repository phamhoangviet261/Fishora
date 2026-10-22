'use client';

import { useState } from 'react';
import { Badge, Button, Drawer, Tabs } from '@/components/ui';
import { errorText, kg, rarityStatus } from '@/lib/client/format';
import { useGame, useGameData } from '@/lib/client/GameProvider';
import type { collection } from '@/lib/game/progression';
import { useI18n, type MessageKey } from '@/lib/i18n';
import s from '../screens.module.css';

type Collection = Awaited<ReturnType<typeof collection>>;
type Tab = 'species' | 'history';
const STATUSES = ['alive', 'dead', 'sold', 'released', 'lost', 'abandoned'] as const;

/** The species catalogue and every fish ever owned, whatever became of it (spec §9.3). */
export function CollectionScreen() {
  const { close, open } = useGame();
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>('species');
  const [status, setStatus] = useState<string | null>(null);
  const { data, error, reload } = useGameData<Collection>('/api/collection');
  const date = (x: string | Date) => new Date(x).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US');

  return (
    <Drawer title={t('col.title')} onClose={close}>
      <Tabs
        label={t('col.title')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'species', label: t('col.species') },
          { id: 'history', label: t('col.history') },
        ]}
      />
      {!data ? (
        error ? (
          <div className={s.stack}>
            <p className={s.error}>{errorText(t, error)}</p>
            <Button onClick={reload}>{t('common.retry')}</Button>
          </div>
        ) : (
          <p className={s.muted}>{t('common.loading')}</p>
        )
      ) : tab === 'species' ? (
        <div className={s.stack}>
          <span className={s.meta}>{t('col.discovered', { n: data.species.filter((x) => x.discovered).length, m: data.species.length })}</span>
          <ul className={s.grid}>
            {data.species.map((sp) => (
              <li key={sp.key} className={`${s.card} ${sp.discovered ? '' : s.silhouette}`}>
                <strong className={s.cardTitle}>{sp.discovered ? sp.displayName : t('col.unknown')}</strong>
                <Badge status={rarityStatus[sp.rarity]}>{t(`rarity.${sp.rarity}` as MessageKey)}</Badge>
                {sp.firstAt && <span className={s.meta}>{t('col.firstSeen', { date: date(sp.firstAt) })}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className={s.stack}>
          <div className={s.row} role="group" aria-label={t('col.history')}>
            <Button tone={status === null ? 'butter' : 'cream'} aria-pressed={status === null} className={s.chip} onClick={() => setStatus(null)}>
              {t('col.all')}
            </Button>
            {STATUSES.map((st) => (
              <Button key={st} tone={status === st ? 'butter' : 'cream'} aria-pressed={status === st} className={s.chip} onClick={() => setStatus(st)}>
                {t(`col.status.${st}` as MessageKey)}
              </Button>
            ))}
          </div>
          <ul className={s.list}>
            {data.history
              .filter((h) => !status || h.status === status)
              .map((h) => (
                <li key={h.id}>
                  <button type="button" className={`${s.card} ${s.fishRow}`} onClick={() => open('fish', h.id)}>
                    <span className={s.spread}>
                      <strong className={s.cardTitle}>{h.name}</strong>
                      <span className={s.num}>{t('common.kg', { n: kg(h.weightGrams) })}</span>
                    </span>
                    <span className={s.row}>
                      <Badge status={h.status === 'alive' ? 'good' : h.status === 'dead' ? 'warn' : undefined}>{t(`col.status.${h.status}` as MessageKey)}</Badge>
                      <span className={s.meta}>
                        {h.speciesName} · {date(h.acquiredAt)}
                        {h.endedAt ? ` → ${date(h.endedAt)}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </Drawer>
  );
}
