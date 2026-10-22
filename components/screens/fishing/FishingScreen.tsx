'use client';

import { useState } from 'react';
import { Badge, Button, Drawer, Field, ProgressBar, Tabs } from '@/components/ui';
import { errorText, kg, rarityStatus } from '@/lib/client/format';
import { useGame, useGameData } from '@/lib/client/GameProvider';
import { useAction } from '@/lib/client/useAction';
import type { zoneList } from '@/lib/game/fishing/zones';
import type { storageView } from '@/lib/game/snapshot';
import { useI18n, type MessageKey } from '@/lib/i18n';
import s from '../screens.module.css';

type Zones = Awaited<ReturnType<typeof zoneList>>;
type StorageView = Awaited<ReturnType<typeof storageView>>;
type Tab = 'spots' | 'gear';

/** Fishing spots and the active gear set (spec §7.1, §7.2). Starting a trip opens the trip screen. */
export function FishingScreen() {
  const { close } = useGame();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('spots');
  const storage = useGameData<StorageView>('/api/storage');
  return (
    <Drawer title={t('nav.fishing')} onClose={close}>
      <Tabs
        label={t('nav.fishing')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'spots', label: t('fz.spots') },
          { id: 'gear', label: t('fz.gear') },
        ]}
      />
      {tab === 'spots' ? <Spots storage={storage.data} onNeedGear={() => setTab('gear')} /> : <Loadout storage={storage.data} />}
    </Drawer>
  );
}

const SLOTS = [
  ['rodId', 'rod'],
  ['lineId', 'line'],
  ['hookId', 'hook'],
  ['coolerId', 'cooler'],
] as const;

/** Ready to fish: every slot filled with unbroken gear and some bait. */
export function gearReady(storage: StorageView | null): boolean {
  const l = storage?.loadout;
  if (!storage || !l) return false;
  const ok = SLOTS.every(([slot]) => {
    const g = storage.gear.find((x) => x.id === l[slot]);
    return g && !g.broken;
  });
  return ok && !!l.baitKey && (storage.stacks.find((x) => x.itemKey === l.baitKey)?.qty ?? 0) > 0;
}

function Spots({ storage, onNeedGear }: { storage: StorageView | null; onNeedGear: () => void }) {
  const { snapshot, open } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  const { data, error, reload } = useGameData<Zones>('/api/fishing/zones');
  if (!data) return error ? <Button onClick={reload}>{errorText(t, error)}</Button> : <p className={s.muted}>{t('common.loading')}</p>;
  const level = snapshot?.player.level ?? 1;
  const coins = snapshot?.player.coins ?? 0;
  const ready = gearReady(storage);

  return (
    <div className={s.stack}>
      {storage && !ready && (
        <div className={s.spread}>
          <span className={s.muted}>{t('fz.notReady')}</span>
          <Button onClick={onNeedGear}>{t('fz.gear')}</Button>
        </div>
      )}
      <ul className={s.list}>
        {data.map((z) => (
          <li key={z.key} className={s.card} data-selected={z.unlocked}>
            <div className={s.spread}>
              <strong className={s.cardTitle}>{z.name}</strong>
              {!z.unlocked && level < z.minLevel && <Badge status="warn">{t('shop.needLevel', { n: z.minLevel })}</Badge>}
            </div>
            <table className={s.odds}>
              <caption className={s.meta}>{t('shop.odds')}</caption>
              <tbody>
                {z.odds.map((o) => (
                  <tr key={o.speciesKey}>
                    <td>{o.displayName}</td>
                    <td>
                      <Badge status={rarityStatus[o.rarity]}>{t(`rarity.${o.rarity}` as MessageKey)}</Badge>
                    </td>
                    <td className={s.num}>{o.pct}%</td>
                  </tr>
                ))}
                <tr>
                  <td>{t('fz.miss')}</td>
                  <td />
                  <td className={s.num}>{z.missPct}%</td>
                </tr>
              </tbody>
            </table>
            {z.unlocked ? (
              <Button
                tone="mint"
                disabled={busy || !ready}
                onClick={async () => {
                  const r = await run<{ tripId: string }>('POST', '/api/fishing/trips', { zoneKey: z.key });
                  if (r.ok) open('trip', r.data.tripId);
                }}
              >
                {t('fz.go')}
              </Button>
            ) : (
              <Button tone="butter" disabled={busy || level < z.minLevel || coins < z.unlockCost} onClick={() => run('POST', `/api/fishing/zones/${z.key}/unlock`).then(() => reload())}>
                {t('fz.unlock', { n: z.unlockCost })}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Loadout({ storage }: { storage: StorageView | null }) {
  const { t } = useI18n();
  const { run, busy } = useAction();
  if (!storage) return <p className={s.muted}>{t('common.loading')}</p>;
  const l = storage.loadout;
  const equipped = SLOTS.map(([slot]) => storage.gear.find((g) => g.id === l?.[slot]));
  const tackle = equipped.slice(0, 3).filter(Boolean) as StorageView['gear'];
  const limit = tackle.length === 3 ? Math.min(...tackle.map((g) => g.maxLoadGrams ?? 0)) : null;
  const tiers = tackle.map((g) => g.tier);
  const baits = storage.stacks.filter((x) => x.category === 'bait');
  const set = (patch: Record<string, string | null>) => run('PUT', '/api/fishing/loadout', patch);

  return (
    <div className={s.stack}>
      {SLOTS.map(([slot, category]) => {
        const options = storage.gear.filter((g) => g.category === category);
        return (
          <Field key={slot} label={t(`fz.slot.${slot}` as MessageKey)}>
            {(id) => (
              <select id={id} value={l?.[slot] ?? ''} disabled={busy} onChange={(e) => set({ [slot]: e.target.value || null })}>
                <option value="">{t('fz.none')}</option>
                {options.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {g.durability}/{g.maxDurability}
                    {g.broken ? ` · ${t('st.broken')}` : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
        );
      })}
      <Field label={t('fz.slot.baitKey')}>
        {(id) => (
          <select id={id} value={l?.baitKey ?? ''} disabled={busy} onChange={(e) => set({ baitKey: e.target.value || null })}>
            <option value="">{t('fz.none')}</option>
            {baits.map((b) => (
              <option key={b.itemKey} value={b.itemKey}>
                {b.name} × {b.qty}
              </option>
            ))}
          </select>
        )}
      </Field>
      {limit !== null && <span className={s.meta}>{t('fz.limit', { n: kg(limit) })}</span>}
      {tiers.length === 3 && Math.max(...tiers) - Math.min(...tiers) > 1 && <Badge status="warn">{t('fz.mismatch')}</Badge>}

      <SectionRepairs storage={storage} />
    </div>
  );
}

function SectionRepairs({ storage }: { storage: StorageView }) {
  const { snapshot } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  const worn = storage.gear.filter((g) => g.durability < g.maxDurability);
  if (worn.length === 0) return null;
  return (
    <ul className={s.list} aria-label={t('fz.repairAll')}>
      {worn.map((g) => (
        <li key={g.id} className={s.card}>
          <div className={s.spread}>
            <strong className={s.cardTitle}>{g.name}</strong>
            {g.broken && <Badge status="bad">{t('st.broken')}</Badge>}
          </div>
          <ProgressBar value={(g.durability / g.maxDurability) * 100} status={g.broken ? 'bad' : 'warn'} label={t('st.durability')} />
          <Button
            tone="butter"
            disabled={busy || g.repairCost === null || (snapshot?.player.coins ?? 0) < (g.repairCost ?? 0)}
            onClick={() => run('POST', `/api/gear/${g.id}/repair`)}
          >
            {t('st.repair', { n: g.repairCost ?? '?' })}
          </Button>
        </li>
      ))}
    </ul>
  );
}
