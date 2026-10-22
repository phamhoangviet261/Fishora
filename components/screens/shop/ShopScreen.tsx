'use client';

import { useState } from 'react';
import { Badge, Button, Drawer, Modal, Stepper, Tabs } from '@/components/ui';
import { errorText, kg, rarityStatus } from '@/lib/client/format';
import { useGame, useGameData } from '@/lib/client/GameProvider';
import { useAction } from '@/lib/client/useAction';
import type { shopCatalog } from '@/lib/game/shop';
import { useI18n, type MessageKey, type Translate } from '@/lib/i18n';
import s from '../screens.module.css';

type Catalog = Awaited<ReturnType<typeof shopCatalog>>;
type Tab = 'fish' | 'boxes' | 'items' | 'upgrades';

/** The shop (spec §8.2, §8.3) plus tank/storage upgrades (spec §4.1, §8.1). Prices and checks are server-side. */
export function ShopScreen() {
  const { close, arg } = useGame();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(arg === 'boxes' || arg === 'items' || arg === 'upgrades' ? arg : 'fish');
  const { data, error, reload } = useGameData<Catalog>('/api/shop');

  return (
    <Drawer title={t('nav.shop')} onClose={close}>
      <Tabs
        label={t('nav.shop')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'fish', label: t('shop.fish') },
          { id: 'boxes', label: t('shop.boxes') },
          { id: 'items', label: t('shop.items') },
          { id: 'upgrades', label: t('shop.upgrades') },
        ]}
      />
      {error ? (
        <div className={s.stack}>
          <p className={s.error}>{errorText(t, error)}</p>
          <Button onClick={reload}>{t('common.retry')}</Button>
        </div>
      ) : !data ? (
        <p className={s.muted}>{t('common.loading')}</p>
      ) : tab === 'fish' ? (
        <FishOffers data={data} />
      ) : tab === 'boxes' ? (
        <BoxOffers data={data} />
      ) : tab === 'items' ? (
        <ItemOffers data={data} />
      ) : (
        <Upgrades data={data} />
      )}
    </Drawer>
  );
}

function useCoins() {
  return useGame().snapshot?.player.coins ?? 0;
}

/** Shows what a purchase produced: the fish's name, with a link to it in storage. */
function Reveal({ fishId, onClose }: { fishId: string; onClose: () => void }) {
  const { open } = useGame();
  const { t } = useI18n();
  const { data } = useGameData<{ name: string; speciesName: string; fish: { rarity: string; weightGrams: number } }>(`/api/fish/${fishId}`);
  return (
    <Modal title={t('shop.bought')} onClose={onClose}>
      {data ? (
        <div className={s.stack}>
          <strong className={s.cardTitle}>{t('shop.got', { name: data.speciesName })}</strong>
          <div className={s.row}>
            <Badge status={rarityStatus[data.fish.rarity as keyof typeof rarityStatus]}>{t(`rarity.${data.fish.rarity}` as MessageKey)}</Badge>
            <span className={s.num}>{t('common.kg', { n: kg(data.fish.weightGrams) })}</span>
          </div>
          <div className={s.row}>
            <Button onClick={onClose}>{t('common.close')}</Button>
            <Button tone="mint" onClick={() => open('fish', fishId)} data-autofocus>
              {t('fd.history')}
            </Button>
          </div>
        </div>
      ) : (
        <p className={s.muted}>{t('common.loading')}</p>
      )}
    </Modal>
  );
}

function FishOffers({ data }: { data: Catalog }) {
  const { t } = useI18n();
  const coins = useCoins();
  const { run, busy } = useAction();
  const [got, setGot] = useState<string | null>(null);
  return (
    <>
      <ul className={s.grid}>
        {data.fish.map((f) => (
          <li key={f.key} className={s.card}>
            <strong className={s.cardTitle}>{f.displayName}</strong>
            <Badge status={rarityStatus[f.rarity]}>{t(`rarity.${f.rarity}` as MessageKey)}</Badge>
            <span className={s.meta}>{t('shop.weightRange', { min: kg(f.weightRangeGrams[0]), max: kg(f.weightRangeGrams[1]) })}</span>
            <span className={s.meta}>{t('shop.storageNeeds', { n: kg(f.weightRangeGrams[1]) })}</span>
            <Button
              tone="butter"
              disabled={busy || coins < f.price}
              title={coins < f.price ? t('error.insufficient_coins') : undefined}
              onClick={async () => {
                const r = await run<{ fishIds: string[] }>('POST', '/api/shop/buy', { type: 'fish', key: f.key });
                if (r.ok) setGot(r.data.fishIds[0]);
              }}
            >
              {t('shop.buy')} · {t('common.coins', { n: f.price })}
            </Button>
          </li>
        ))}
      </ul>
      {got && <Reveal fishId={got} onClose={() => setGot(null)} />}
    </>
  );
}

function BoxOffers({ data }: { data: Catalog }) {
  const { t } = useI18n();
  const coins = useCoins();
  const { run, busy } = useAction();
  const [got, setGot] = useState<string | null>(null);
  if (data.blindboxes.length === 0) return <p className={s.muted}>{t('st.empty')}</p>;
  return (
    <>
      <ul className={s.list}>
        {data.blindboxes.map((b) => (
          <li key={b.key} className={s.card}>
            <div className={s.spread}>
              <strong className={s.cardTitle}>{b.name}</strong>
              <span className={s.meta}>{t('shop.storageNeeds', { n: kg(b.maxWeightGrams) })}</span>
            </div>
            {/* The odds are shown before buying: the player knows what the random draw can give. */}
            <table className={s.odds}>
              <caption className={s.meta}>{t('shop.odds')}</caption>
              <tbody>
                {b.odds.map((o) => (
                  <tr key={o.speciesKey}>
                    <td>{o.displayName}</td>
                    <td>
                      <Badge status={rarityStatus[o.rarity]}>{t(`rarity.${o.rarity}` as MessageKey)}</Badge>
                    </td>
                    <td className={s.num}>{o.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              tone="butter"
              disabled={busy || coins < b.price}
              onClick={async () => {
                const r = await run<{ fishIds: string[] }>('POST', '/api/shop/buy', { type: 'blindbox', key: b.key });
                if (r.ok) setGot(r.data.fishIds[0]);
              }}
            >
              {t('shop.buy')} · {t('common.coins', { n: b.price })}
            </Button>
          </li>
        ))}
      </ul>
      {got && <Reveal fishId={got} onClose={() => setGot(null)} />}
    </>
  );
}

function ItemOffers({ data }: { data: Catalog }) {
  const { t } = useI18n();
  const coins = useCoins();
  const { run, busy } = useAction();
  const [qty, setQty] = useState<Record<string, number>>({});
  return (
    <ul className={s.list}>
      {data.items.map((i) => {
        const n = qty[i.key] ?? 1;
        const total = i.price * n;
        return (
          <li key={i.key} className={s.card}>
            <div className={s.spread}>
              <strong className={s.cardTitle}>{i.name}</strong>
              <span className={s.meta}>{t('common.coins', { n: i.price })}</span>
            </div>
            <div className={s.spread}>
              <Stepper value={n} max={999} onChange={(v) => setQty((q) => ({ ...q, [i.key]: v }))} label={t('shop.qty')} />
              <Button
                tone="butter"
                disabled={busy || coins < total}
                onClick={() => run('POST', '/api/shop/buy', { type: 'item', key: i.key, qty: n }, () => t('shop.bought'))}
              >
                {t('shop.buy')} · {t('common.coins', { n: total })}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function upgradeValueText(t: Translate, value: unknown): string {
  const v = (value ?? {}) as { maxFish?: number; maxGrams?: number; slots?: number; autoFeed?: boolean; autoClean?: boolean };
  if (v.maxFish !== undefined) return t('shop.value.maxFish', { n: v.maxFish });
  if (v.maxGrams !== undefined) return t('shop.value.maxGrams', { n: kg(v.maxGrams) });
  if (v.slots !== undefined) return t('shop.value.slots', { n: v.slots });
  const care = [v.autoFeed && t('shop.value.autoFeed'), v.autoClean && t('shop.value.autoClean')].filter(Boolean);
  return care.length ? care.join(' + ') : t('shop.value.none');
}

function Upgrades({ data }: { data: Catalog }) {
  const { snapshot } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  const coins = snapshot?.player.coins ?? 0;
  const level = snapshot?.player.level ?? 1;
  return (
    <ul className={s.list}>
      {data.upgrades.map((u) => (
        <li key={u.track} className={s.card}>
          <div className={s.spread}>
            <strong className={s.cardTitle}>{t(`shop.track.${u.track}` as MessageKey)}</strong>
            <Badge status="info">{t('shop.level', { n: u.level })}</Badge>
          </div>
          <span className={s.meta}>
            {upgradeValueText(t, u.value)}
            {u.next && ` → ${upgradeValueText(t, u.next.value)}`}
          </span>
          {u.next ? (
            <div className={s.spread}>
              {level < u.next.minPlayerLevel ? <Badge status="warn">{t('shop.needLevel', { n: u.next.minPlayerLevel })}</Badge> : <span />}
              <Button
                tone="butter"
                disabled={busy || coins < u.next.cost || level < u.next.minPlayerLevel}
                onClick={() => run('POST', '/api/upgrades/buy', { track: u.track }, () => t('shop.bought'))}
              >
                {t('shop.buy')} · {t('common.coins', { n: u.next.cost })}
              </Button>
            </div>
          ) : (
            <Badge status="good">{t('shop.maxed')}</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

