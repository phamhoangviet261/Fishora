'use client';

import { useEffect, useState } from 'react';
import type { Species } from '@prisma/client';
import { Button, Confirm } from '@/components/ui';
import { api } from '@/lib/client/api';
import { RARITIES, type RewardBundle } from '@/lib/game/types';
import { RewardBundleEditor } from './RewardBundleEditor';
import { useSpecies } from './SpeciesList';
import s from './admin.module.css';

const INT_FIELDS = [
  ['maxWeightGrams', 'Max weight (g)'],
  ['spawnWeightMinGrams', 'Spawn weight min (g)'],
  ['spawnWeightMaxGrams', 'Spawn weight max (g)'],
  ['spawnAgeMinDays', 'Spawn age min (days)'],
  ['spawnAgeMaxDays', 'Spawn age max (days)'],
  ['growthGramsPerTick', 'Growth per tick (g)'],
  ['foodUnitsPerFeed', 'Food units per feed'],
  ['valuePerKg', 'Value per kg'],
  ['maturitySaleBonusCoins', 'Mature sale bonus (coins)'],
  ['maturitySaleBonusPct', 'Mature sale bonus (%)'],
] as const;

type Draft = Pick<Species, (typeof INT_FIELDS)[number][0] | 'displayName' | 'modelKey' | 'rarity' | 'buyPrice'> & { maturityReward: RewardBundle };

const draftOf = (x: Species): Draft => ({
  displayName: x.displayName,
  modelKey: x.modelKey,
  rarity: x.rarity,
  buyPrice: x.buyPrice,
  maturityReward: (x.maturityReward ?? {}) as RewardBundle,
  ...(Object.fromEntries(INT_FIELDS.map(([k]) => [k, x[k]])) as Pick<Species, (typeof INT_FIELDS)[number][0]>),
});

/** Edits every field in one atomic save; the key never changes (spec §6.4). */
export function SpeciesForm({ speciesKey }: { speciesKey: string }) {
  const { species, error, reload } = useSpecies();
  const current = species?.find((x) => x.key === speciesKey) ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { label: string; patch: Record<string, unknown> }>(null);
  useEffect(() => {
    if (current) setDraft(draftOf(current));
  }, [current]);

  if (error) return <p className={s.error}>{error}</p>;
  if (!species) return <p className={s.muted}>Loading…</p>;
  if (!current || !draft) return <p className={s.error}>No species “{speciesKey}”.</p>;

  const changed = Object.fromEntries(
    Object.entries(draft).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((draftOf(current) as Record<string, unknown>)[k])),
  );
  const save = async (patch: Record<string, unknown>) => {
    const r = await api<Species>('PATCH', `/api/admin/species/${encodeURIComponent(speciesKey)}`, patch);
    setMsg(r.ok ? 'Saved.' : `Not saved: ${r.error}${r.detail ? ` ${JSON.stringify(r.detail)}` : ''}`);
    if (r.ok) await reload();
  };

  return (
    <>
      <h1>
        {current.displayName} <span className={s.muted}>({current.key} · v{current.version})</span>
      </h1>
      <p className={s.muted}>State: {current.deletedAt ? 'deleted' : current.active ? 'active' : 'inactive'}</p>
      <div className={s.form}>
        <label>
          Display name
          <input className={s.input} value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
        </label>
        <label>
          Model key
          <input className={s.input} value={draft.modelKey} onChange={(e) => setDraft({ ...draft, modelKey: e.target.value })} />
        </label>
        <label>
          Rarity
          <select className={s.input} value={draft.rarity} onChange={(e) => setDraft({ ...draft, rarity: e.target.value as Species['rarity'] })}>
            {RARITIES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Buy price (empty = not sold)
          <input
            className={s.input}
            type="number"
            min={0}
            value={draft.buyPrice ?? ''}
            onChange={(e) => setDraft({ ...draft, buyPrice: e.target.value === '' ? null : Math.floor(Number(e.target.value)) })}
          />
        </label>
        {INT_FIELDS.map(([k, label]) => (
          <label key={k}>
            {label}
            <input className={s.input} type="number" min={0} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: Math.floor(Number(e.target.value) || 0) })} />
          </label>
        ))}
      </div>
      <section className={s.section}>
        <h2>Maturity reward</h2>
        <RewardBundleEditor value={draft.maturityReward} onChange={(maturityReward) => setDraft({ ...draft, maturityReward })} />
      </section>
      <div className={s.toolbar}>
        <Button tone="mint" disabled={Object.keys(changed).length === 0} onClick={() => save(changed)}>
          Save {Object.keys(changed).length || ''} change(s)
        </Button>
        <Button onClick={() => setDraft(draftOf(current))}>Reset</Button>
        {current.active ? (
          <Button tone="coral" onClick={() => setConfirm({ label: 'Deactivate', patch: { active: false } })}>
            Deactivate
          </Button>
        ) : (
          <Button tone="sky" onClick={() => setConfirm({ label: 'Activate', patch: { active: true } })}>
            Activate
          </Button>
        )}
        {!current.deletedAt && (
          <Button tone="coral" onClick={() => setConfirm({ label: 'Soft delete', patch: { deleted: true, active: false } })}>
            Soft delete
          </Button>
        )}
        {msg && <span className={msg.startsWith('Saved') ? s.muted : s.error}>{msg}</span>}
      </div>
      {confirm && (
        <Confirm
          title={confirm.label}
          body="Existing fish keep their data and can still be cared for, sold and released. New fish of this species can't be bought or caught while it's inactive."
          confirmLabel={confirm.label}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await save(confirm.patch);
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}
