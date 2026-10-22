'use client';

import { useState } from 'react';
import { Badge, Button, Divider, Drawer, Field, SectionTitle, Stepper, Tabs } from '@/components/ui';
import { useAction } from '@/lib/client/useAction';
import { useGame, useGameData } from '@/lib/client/GameProvider';
import type { storageView } from '@/lib/game/snapshot';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { pinchFor } from '@/components/hud/FeedButton';
import { dropFood } from '@/lib/game/food';
import s from '../screens.module.css';
import { DirtMeter } from './TankPanel';

type StorageView = Awaited<ReturnType<typeof storageView>>;
type Tab = 'feed' | 'clean' | 'auto';

/** Tank care: feed, clean, and the automatic care settings with the feeder reserve (spec §4). */
export function TankScreen() {
  const { snapshot, arg, close } = useGame();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(arg === 'clean' || arg === 'auto' ? arg : arg === 'feed' ? 'feed' : 'auto');
  const storage = useGameData<StorageView>('/api/storage');
  if (!snapshot) return null;

  return (
    <Drawer title={t('tank.title')} onClose={close}>
      <div className={s.stack}>
        <DirtMeter tank={snapshot.tank} />
        <Tabs
          label={t('tank.title')}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'feed', label: t('tank.feed') },
            { id: 'clean', label: t('tank.clean') },
            { id: 'auto', label: t('tank.auto') },
          ]}
        />
        {tab === 'feed' && <FeedPanel storage={storage.data} />}
        {tab === 'clean' && <CleanPanel storage={storage.data} />}
        {tab === 'auto' && <AutoCarePanel storage={storage.data} />}
      </div>
    </Drawer>
  );
}

const foodsOf = (storage: StorageView | null) => (storage?.stacks ?? []).filter((x) => x.category === 'food');

function FeedPanel({ storage }: { storage: StorageView | null }) {
  const { snapshot } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  const foods = foodsOf(storage);
  const need = snapshot?.tankFish.reduce((n, f) => n + f.foodUnitsPerFeed, 0) ?? 0;

  if (!snapshot?.tankFish.length) return <p className={s.muted}>{t('tank.empty')}</p>;
  if (storage && foods.length === 0) return <p className={s.muted}>{t('tank.noFood')}</p>;
  return (
    <div className={s.stack}>
      <p className={s.muted}>{t('feed.need', { n: need })}</p>
      <ul className={s.list}>
        {foods.map((f) => (
          <li key={f.itemKey} className={s.card}>
            <div className={s.spread}>
              <strong className={s.cardTitle}>{f.name}</strong>
              <span className={s.meta}>{t('feed.have', { n: f.qty })}</span>
            </div>
            <div className={s.row}>
              {f.qty < need && <Badge status="warn">{t('feed.short')}</Badge>}
              <Button
                tone="butter"
                disabled={busy}
                onClick={async () => {
                  const r = await run<{ fedIds: string[]; skippedIds: string[] }>('POST', '/api/tank/feed', { itemKey: f.itemKey }, (d) =>
                    d.skippedIds.length ? t('feed.result', { fed: d.fedIds.length, skipped: d.skippedIds.length }) : t('feed.done', { n: d.fedIds.length }),
                  );
                  if (r.ok && r.data.fedIds.length > 0) dropFood(pinchFor(r.data.fedIds.length));
                }}
              >
                {t('tank.feed')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CleanPanel({ storage }: { storage: StorageView | null }) {
  const { snapshot } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  if (!snapshot) return null;
  const owned = (key?: string) => storage?.stacks.find((x) => x.itemKey === key)?.qty ?? 0;
  const itemName = (key?: string) => storage?.stacks.find((x) => x.itemKey === key)?.name ?? key;
  const levelName = (key: string) => {
    const k = `clean.level.${key}` as MessageKey;
    const v = t(k);
    return v === k ? key : v;
  };

  return (
    <ul className={s.list}>
      {snapshot.tank.cleaningLevels.map((l) => {
        const lacksItem = !!l.itemKey && owned(l.itemKey) < (l.itemQty ?? 1);
        const lacksCoins = !!l.coins && snapshot.player.coins < l.coins;
        return (
          <li key={l.key} className={s.card}>
            <div className={s.spread}>
              <strong className={s.cardTitle}>{levelName(l.key)}</strong>
              <Badge status="good">{t('clean.effect', { n: l.dirtReduction })}</Badge>
            </div>
            <div className={s.spread}>
              <span className={s.meta}>
                {l.coins ? t('common.coins', { n: l.coins }) : null}
                {l.itemKey ? `${l.itemQty ?? 1} × ${itemName(l.itemKey)} (${owned(l.itemKey)})` : null}
              </span>
              <Button
                tone="sky"
                disabled={busy || lacksItem || lacksCoins}
                title={lacksCoins ? t('error.insufficient_coins') : lacksItem ? t('error.insufficient_items') : undefined}
                onClick={() => run<{ dirt: number }>('POST', '/api/tank/clean', { levelKey: l.key }, (d) => t('clean.done', { n: d.dirt }))}
              >
                {t('tank.clean')}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AutoCarePanel({ storage }: { storage: StorageView | null }) {
  const { snapshot, open } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  const [qty, setQty] = useState(5);
  if (!snapshot) return null;
  const { tank } = snapshot;
  const foods = foodsOf(storage);
  const foodKey = tank.autoFeedItemKey ?? foods[0]?.itemKey ?? '';
  const reserve = storage?.reserve.find((r) => r.itemKey === foodKey)?.qty ?? 0;
  const main = storage?.stacks.find((r) => r.itemKey === foodKey)?.qty ?? 0;
  const set = (body: Record<string, unknown>) => run('PATCH', '/api/tank/settings', body);

  return (
    <div className={s.stack}>
      {!tank.care.autoFeed && !tank.care.autoClean && (
        <div className={s.spread}>
          <span className={s.muted}>{t('tank.needsUpgrade')}</span>
          <Button tone="coral" onClick={() => open('shop', 'upgrades')}>
            {t('st.upgrade')}
          </Button>
        </div>
      )}
      <label className={s.spread}>
        <span className={s.cardTitle}>{t('tank.autoFeed')}</span>
        <input
          type="checkbox"
          className={s.check}
          checked={tank.autoFeed}
          disabled={busy || !tank.care.autoFeed || !foodKey}
          onChange={(e) => set({ autoFeed: e.target.checked, ...(foodKey ? { autoFeedItemKey: foodKey } : {}) })}
        />
      </label>
      {foods.length > 0 && (
        <Field label={t('tank.autoFood')}>
          {(id) => (
            <select id={id} value={foodKey} disabled={busy || !tank.care.autoFeed} onChange={(e) => set({ autoFeedItemKey: e.target.value })}>
              {foods.map((f) => (
                <option key={f.itemKey} value={f.itemKey}>
                  {f.name} ({f.qty})
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <label className={s.spread}>
        <span className={s.cardTitle}>{t('tank.autoClean')}</span>
        <input type="checkbox" className={s.check} checked={tank.autoClean} disabled={busy || !tank.care.autoClean} onChange={(e) => set({ autoClean: e.target.checked })} />
      </label>

      <Divider />
      <SectionTitle>{t('tank.hopper')}</SectionTitle>
      <p className={s.muted}>{t('tank.hopperHint')}</p>
      {foodKey ? (
        <div className={s.stack}>
          <div className={s.spread}>
            <span className={s.meta}>{storage?.stacks.find((f) => f.itemKey === foodKey)?.name ?? foodKey}</span>
            <span className={s.num}>{reserve}</span>
          </div>
          <div className={s.row}>
            <Stepper value={qty} max={Math.max(1, main, reserve)} onChange={setQty} label={t('shop.qty')} />
            <Button disabled={busy || main < qty} onClick={() => run('POST', '/api/tank/reserve', { itemKey: foodKey, qty, direction: 'in' })}>
              {t('tank.hopperIn')}
            </Button>
            <Button disabled={busy || reserve < qty} onClick={() => run('POST', '/api/tank/reserve', { itemKey: foodKey, qty, direction: 'out' })}>
              {t('tank.hopperOut')}
            </Button>
          </div>
        </div>
      ) : (
        <p className={s.muted}>{t('tank.noFood')}</p>
      )}
    </div>
  );
}
