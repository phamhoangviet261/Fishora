'use client';

import { useEffect, useState } from 'react';
import type { Milestone } from '@prisma/client';
import { Button, Modal } from '@/components/ui';
import { api } from '@/lib/client/api';
import type { RewardBundle } from '@/lib/game/types';
import { RewardBundleEditor } from './RewardBundleEditor';
import { useSpecies } from './SpeciesList';
import s from './admin.module.css';

type Policy = 'keep' | 'replace';
type Pending = { title: string; send: (policy: Policy) => Promise<void> };

/**
 * Default milestones and per-species overrides (spec §6.2). Every change asks what happens to rewards already
 * unlocked but not yet claimed at that weight: keep them as they are, or replace them with the new bundle.
 */
export function MilestoneEditor() {
  const { species } = useSpecies();
  const [list, setList] = useState<Milestone[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState<{ speciesKey: string; kg: string; reward: RewardBundle }>({ speciesKey: '', kg: '', reward: { coins: 10 } });

  const reload = async () => {
    const r = await api<Milestone[]>('GET', '/api/admin/milestones');
    if (r.ok) setList(r.data);
    else setMsg(r.error);
  };
  useEffect(() => {
    void reload();
  }, []);

  const report = async (r: { ok: boolean; error?: string }) => {
    setMsg(r.ok ? 'Saved.' : `Not saved: ${r.error}`);
    if (r.ok) await reload();
  };

  if (!list) return <p className={s.muted}>{msg ?? 'Loading…'}</p>;
  const groups = new Map<string, Milestone[]>();
  for (const m of list) groups.set(m.speciesKey ?? '', [...(groups.get(m.speciesKey ?? '') ?? []), m]);

  return (
    <>
      <h1>Weight milestones</h1>
      <p className={s.muted}>A species with any milestone of its own ignores the default set. Deleted milestones never come back; create a new one instead.</p>
      {msg && <p className={msg === 'Saved.' ? s.muted : s.error}>{msg}</p>}

      <section className={s.section}>
        <h2>Add a milestone</h2>
        <div className={s.form}>
          <label>
            Species
            <select className={s.input} value={draft.speciesKey} onChange={(e) => setDraft({ ...draft, speciesKey: e.target.value })}>
              <option value="">Default set</option>
              {species?.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.displayName} ({x.key})
                </option>
              ))}
            </select>
          </label>
          <label>
            Weight (kg)
            <input className={s.input} type="number" min={0.001} step="0.001" value={draft.kg} onChange={(e) => setDraft({ ...draft, kg: e.target.value })} />
          </label>
        </div>
        <RewardBundleEditor value={draft.reward} onChange={(reward) => setDraft({ ...draft, reward })} />
        <Button
          tone="mint"
          disabled={!(Number(draft.kg) > 0)}
          onClick={() =>
            setPending({
              title: 'Create milestone',
              send: async (pendingPolicy) =>
                report(
                  await api('POST', '/api/admin/milestones', {
                    speciesKey: draft.speciesKey || null,
                    weightGrams: Math.round(Number(draft.kg) * 1000),
                    reward: draft.reward,
                    pendingPolicy,
                  }),
                ),
            })
          }
        >
          Create
        </Button>
      </section>

      {[...groups.entries()].map(([key, rows]) => (
        <section key={key} className={s.section}>
          <h2>{key ? (species?.find((x) => x.key === key)?.displayName ?? key) : 'Default set'}</h2>
          {rows.map((m) => (
            <MilestoneRow key={m.id} m={m} onSave={(patch) => setPending({ title: 'Update milestone', send: async (pendingPolicy) => report(await api('PATCH', `/api/admin/milestones/${m.id}`, { ...patch, pendingPolicy })) })} onDelete={async () => report(await api('DELETE', `/api/admin/milestones/${m.id}`))} />
          ))}
        </section>
      ))}

      {pending && (
        <Modal title={pending.title} onClose={() => setPending(null)}>
          <p className={s.muted}>Rewards at this weight that players unlocked but have not claimed yet:</p>
          <div className={s.toolbar}>
            <Button
              onClick={async () => {
                await pending.send('keep');
                setPending(null);
              }}
            >
              Keep as they are
            </Button>
            <Button
              tone="mint"
              onClick={async () => {
                await pending.send('replace');
                setPending(null);
              }}
            >
              Replace with this bundle
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function MilestoneRow({ m, onSave, onDelete }: { m: Milestone; onSave: (patch: { weightGrams?: number; reward?: RewardBundle }) => void; onDelete: () => void }) {
  const [kg, setKg] = useState(String(m.weightGrams / 1000));
  const [reward, setReward] = useState<RewardBundle>(m.reward as RewardBundle);
  const weightGrams = Math.round(Number(kg) * 1000);
  const dirty = weightGrams !== m.weightGrams || JSON.stringify(reward) !== JSON.stringify(m.reward);
  return (
    <div className={s.section}>
      <div className={s.toolbar}>
        <label>
          Weight (kg){' '}
          <input className={s.input} type="number" min={0.001} step="0.001" value={kg} onChange={(e) => setKg(e.target.value)} />
        </label>
        <Button tone="mint" disabled={!dirty || !(weightGrams > 0)} onClick={() => onSave({ ...(weightGrams !== m.weightGrams ? { weightGrams } : {}), reward })}>
          Save
        </Button>
        <Button tone="coral" onClick={onDelete}>
          Delete
        </Button>
      </div>
      <RewardBundleEditor value={reward} onChange={setReward} />
    </div>
  );
}
