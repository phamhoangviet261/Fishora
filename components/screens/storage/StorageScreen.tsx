'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Confirm, Drawer, Field, ProgressBar, Tabs } from '@/components/ui';
import { api } from '@/lib/client/api';
import { errorText, kg, rarityStatus } from '@/lib/client/format';
import { useGame, useGameData } from '@/lib/client/GameProvider';
import { useAction } from '@/lib/client/useAction';
import type { storageView } from '@/lib/game/snapshot';
import { RARITIES, type Rarity } from '@/lib/game/types';
import { useI18n, type MessageKey } from '@/lib/i18n';
import s from '../screens.module.css';

type StorageView = Awaited<ReturnType<typeof storageView>>;
type Tab = 'fish' | 'items' | 'gear';

/** Storage: stored fish by weight, item stacks by slot, gear pieces (spec §8.1, §9.2). */
export function StorageScreen() {
  const { close, arg } = useGame();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(arg === 'items' || arg === 'gear' ? arg : 'fish');
  const { data, error, reload } = useGameData<StorageView>('/api/storage');

  return (
    <Drawer title={t('st.title')} onClose={close}>
      <Tabs
        label={t('st.title')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'fish', label: t('st.fish') },
          { id: 'items', label: t('st.items') },
          { id: 'gear', label: t('st.gear') },
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
        <FishTab data={data} />
      ) : tab === 'items' ? (
        <ItemsTab data={data} />
      ) : (
        <GearTab data={data} />
      )}
    </Drawer>
  );
}

function FishTab({ data }: { data: StorageView }) {
  const { open } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  const [species, setSpecies] = useState('');
  const [rarities, setRarities] = useState<Set<Rarity>>(new Set());
  const [minKg, setMinKg] = useState('');
  const [maxKg, setMaxKg] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const speciesOptions = useMemo(() => [...new Map(data.fish.map((f) => [f.speciesKey, f.speciesName])).entries()], [data.fish]);
  const shown = data.fish.filter(
    (f) =>
      (!species || f.speciesKey === species) &&
      (rarities.size === 0 || rarities.has(f.rarity)) &&
      (minKg === '' || f.weightGrams >= Number(minKg) * 1000) &&
      (maxKg === '' || f.weightGrams <= Number(maxKg) * 1000),
  );
  // Drop selections that left storage (sold, moved) after a refresh.
  useEffect(() => setSelected((sel) => new Set([...sel].filter((id) => data.fish.some((f) => f.id === id)))), [data.fish]);

  const toggle = (id: string) => setSelected((sel) => (sel.has(id) ? new Set([...sel].filter((x) => x !== id)) : new Set([...sel, id])));
  const { usedGrams, maxGrams } = data.fishCapacity;

  return (
    <div className={s.stack}>
      <div className={s.spread}>
        <span className={s.meta}>{t('st.capacity')}</span>
        <ProgressBar value={(usedGrams / Math.max(1, maxGrams)) * 100} status={usedGrams / maxGrams > 0.9 ? 'bad' : usedGrams / maxGrams > 0.7 ? 'warn' : 'good'} label={t('st.capacity')} />
        <span className={s.num}>
          {kg(usedGrams)} / {t('common.kg', { n: kg(maxGrams) })}
        </span>
      </div>
      <div className={s.row}>
        <Button tone="coral" onClick={() => open('shop', 'upgrades')}>
          {t('st.upgrade')}
        </Button>
      </div>

      {data.fish.length === 0 ? (
        <p className={s.muted}>{t('st.empty')}</p>
      ) : (
        <>
          <div className={s.filters}>
            <Field label={t('fd.species')}>
              {(id) => (
                <select id={id} value={species} onChange={(e) => setSpecies(e.target.value)}>
                  <option value="">{t('st.allSpecies')}</option>
                  {speciesOptions.map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('st.minKg')}>{(id) => <input id={id} type="number" min={0} step="0.01" value={minKg} onChange={(e) => setMinKg(e.target.value)} />}</Field>
            <Field label={t('st.maxKg')}>{(id) => <input id={id} type="number" min={0} step="0.01" value={maxKg} onChange={(e) => setMaxKg(e.target.value)} />}</Field>
          </div>
          <div className={s.row} role="group" aria-label={t('fd.rarity')}>
            {RARITIES.map((r) => (
              <Button
                key={r}
                tone={rarities.has(r) ? 'butter' : 'cream'}
                aria-pressed={rarities.has(r)}
                className={s.chip}
                onClick={() => setRarities((cur) => (cur.has(r) ? new Set([...cur].filter((x) => x !== r)) : new Set([...cur, r])))}
              >
                {t(`rarity.${r}` as MessageKey)}
              </Button>
            ))}
          </div>
          <label className={s.row}>
            <input
              type="checkbox"
              className={s.check}
              checked={shown.length > 0 && shown.every((f) => selected.has(f.id))}
              onChange={(e) => setSelected(e.target.checked ? new Set([...selected, ...shown.map((f) => f.id)]) : new Set([...selected].filter((id) => !shown.some((f) => f.id === id))))}
            />
            <span className={s.meta}>{t('st.selectAll')}</span>
          </label>
          <ul className={s.list}>
            {shown.map((f) => (
              <li key={f.id} className={s.card} data-selected={selected.has(f.id)}>
                <div className={s.spread}>
                  <label className={s.row}>
                    <input type="checkbox" className={s.check} checked={selected.has(f.id)} onChange={() => toggle(f.id)} aria-label={f.name} />
                    <strong className={s.cardTitle}>{f.name}</strong>
                  </label>
                  <span className={s.num}>{t('common.kg', { n: kg(f.weightGrams) })}</span>
                </div>
                <div className={s.row}>
                  <Badge status={rarityStatus[f.rarity]}>{t(`rarity.${f.rarity}` as MessageKey)}</Badge>
                  {f.mature && <Badge status="good">{t('tank.mature')}</Badge>}
                  <span className={s.meta}>{t('common.coins', { n: f.baseValue })}</span>
                </div>
                <div className={s.row}>
                  <Button tone="sky" disabled={busy} onClick={() => run('POST', `/api/fish/${f.id}/move`, { to: 'tank' }, () => t('fd.moved'))}>
                    {t('fd.toTank')}
                  </Button>
                  <Button onClick={() => open('fish', f.id)}>{t('fd.history')}</Button>
                </div>
              </li>
            ))}
          </ul>
          {selected.size > 0 && <BulkSellBar ids={[...selected]} onDone={() => setSelected(new Set())} />}
        </>
      )}
    </div>
  );
}

/** Sell or release the selection; the total shown is the server's own preview (spec §9.2). */
function BulkSellBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const { run, busy } = useAction();
  const [mode, setMode] = useState<'sell' | 'release'>('sell');
  const [total, setTotal] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const key = ids.join(',');

  useEffect(() => {
    setTotal(null);
    const timer = window.setTimeout(async () => {
      const r = await api<{ total: number }>('POST', '/api/fish/sell/preview', { fishIds: key.split(','), mode });
      setTotal(r.ok ? r.data.total : null);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [key, mode]);

  return (
    <div className={s.stickyBar}>
      <span className={s.num}>{t('st.selected', { n: ids.length })}</span>
      <span className={s.row}>
        <Button tone={mode === 'sell' ? 'butter' : 'cream'} aria-pressed={mode === 'sell'} className={s.chip} onClick={() => setMode('sell')}>
          {t('fd.sell')}
        </Button>
        <Button tone={mode === 'release' ? 'coral' : 'cream'} aria-pressed={mode === 'release'} className={s.chip} onClick={() => setMode('release')}>
          {t('fd.release')}
        </Button>
      </span>
      <span className={s.num}>{total === null ? '…' : t('st.total', { n: total })}</span>
      <Button tone="mint" disabled={busy || total === null} onClick={() => setConfirming(true)}>
        {t('common.confirm')}
      </Button>
      {confirming && total !== null && (
        <Confirm
          title={mode === 'sell' ? t('fd.sell') : t('fd.release')}
          body={`${t('st.selected', { n: ids.length })} · ${t('st.total', { n: total })}`}
          confirmLabel={mode === 'sell' ? t('fd.sell') : t('fd.release')}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            const r = await run<{ total: number }>('POST', '/api/fish/sell', { fishIds: ids, mode }, (d) => t('fd.sold', { n: d.total }));
            setConfirming(false);
            if (r.ok) onDone();
          }}
        />
      )}
    </div>
  );
}

function ItemsTab({ data }: { data: StorageView }) {
  const { open } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  const byCategory = useMemo(() => {
    const m = new Map<string, StorageView['stacks']>();
    for (const st of data.stacks) m.set(st.category, [...(m.get(st.category) ?? []), st]);
    return [...m.entries()];
  }, [data.stacks]);

  return (
    <div className={s.stack}>
      <div className={s.spread}>
        <span className={s.meta}>{t('st.slots', { used: data.slots.used, max: data.slots.max })}</span>
        <ProgressBar value={(data.slots.used / Math.max(1, data.slots.max)) * 100} status={data.slots.used >= data.slots.max ? 'bad' : 'good'} label={t('st.slots', { used: data.slots.used, max: data.slots.max })} />
      </div>
      <p className={s.muted}>{t('st.noResale')}</p>
      {byCategory.length === 0 && <p className={s.muted}>{t('st.empty')}</p>}
      {byCategory.map(([category, stacks]) => (
        <ul key={category} className={s.list}>
          {stacks.map((st) => (
            <li key={st.itemKey} className={s.card}>
              <div className={s.spread}>
                <strong className={s.cardTitle}>{st.name}</strong>
                <span className={s.num}>× {st.qty}</span>
              </div>
              {category === 'blindbox' && (
                <div className={s.row}>
                  <Button
                    tone="butter"
                    disabled={busy}
                    onClick={async () => {
                      const r = await run<{ fishId: string }>('POST', '/api/items/blindbox/open', { itemKey: st.itemKey });
                      if (r.ok) open('fish', r.data.fishId);
                    }}
                  >
                    {t('st.open')}
                  </Button>
                </div>
              )}
              {category === 'food' && (
                <div className={s.row}>
                  <Button onClick={() => open('tank', 'auto')}>{t('st.toHopper')}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ))}
      {data.reserve.length > 0 && (
        <ul className={s.list}>
          {data.reserve.map((st) => (
            <li key={st.itemKey} className={s.card}>
              <div className={s.spread}>
                <strong className={s.cardTitle}>
                  {st.name} · {t('tank.hopper')}
                </strong>
                <span className={s.num}>× {st.qty}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GearTab({ data }: { data: StorageView }) {
  const { t } = useI18n();
  const equipped = new Set(Object.values(data.loadout ?? {}).filter(Boolean) as string[]);
  if (data.gear.length === 0) return <p className={s.muted}>{t('st.empty')}</p>;
  return (
    <ul className={s.list}>
      {data.gear.map((g) => (
        <li key={g.id} className={s.card}>
          <div className={s.spread}>
            <strong className={s.cardTitle}>{g.name}</strong>
            <span className={s.row}>
              {equipped.has(g.id) && <Badge status="info">{t('st.equipped')}</Badge>}
              {g.broken && <Badge status="bad">{t('st.broken')}</Badge>}
            </span>
          </div>
          <span className={s.meta}>
            {g.maxLoadGrams !== null && t('st.load', { n: kg(g.maxLoadGrams) })}
            {g.capacityGrams !== null && t('st.cooler', { n: kg(g.capacityGrams) })}
          </span>
          <div className={s.spread}>
            <span className={s.meta}>{t('st.durability')}</span>
            <ProgressBar value={(g.durability / g.maxDurability) * 100} status={g.broken ? 'bad' : g.durability / g.maxDurability < 0.3 ? 'warn' : 'good'} label={t('st.durability')} />
            <span className={s.num}>
              {g.durability}/{g.maxDurability}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
