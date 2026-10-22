'use client';

import { Badge, Button, Panel, ProgressBar, SectionTitle } from '@/components/ui';
import { kg, rarityStatus } from '@/lib/client/format';
import { useGame } from '@/lib/client/GameProvider';
import { useAction } from '@/lib/client/useAction';
import { fishingBlocker } from '@/lib/game/fishing/readiness';
import { useI18n, type MessageKey } from '@/lib/i18n';
import type { FishingView } from './types';
import s from './fishing.module.css';

export function blockerFor(view: FishingView, zoneKey: string | null) {
  const zone = view.zones.find((z) => z.key === zoneKey) ?? null;
  const rod = view.equipment.rods.find((r) => r.id === view.loadout.rodId) ?? null;
  const cooler = view.equipment.coolers.find((c) => c.id === view.loadout.coolerId) ?? null;
  const baitQty = view.equipment.baits.find((b) => b.itemKey === view.loadout.baitKey)?.qty ?? 0;
  return fishingBlocker({
    zone,
    rod,
    baitQty,
    container: cooler ? { capacityGrams: cooler.capacityGrams, carriedGrams: view.container.carriedGrams } : null,
  });
}

/** Map, rod, bait and container choice before a session (fishing MVP §A, §F). */
export function PrepPanel({
  view,
  zoneKey,
  onZone,
  onStart,
  onReturn,
}: {
  view: FishingView;
  zoneKey: string | null;
  onZone: (key: string) => void;
  onStart: () => void;
  onReturn: () => void;
}) {
  const { snapshot, open } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  const level = snapshot?.player.level ?? 1;
  const coins = snapshot?.player.coins ?? 0;
  const blocker = blockerFor(view, zoneKey);
  const rod = view.equipment.rods.find((r) => r.id === view.loadout.rodId) ?? null;
  const cooler = view.equipment.coolers.find((c) => c.id === view.loadout.coolerId) ?? null;
  const bait = view.equipment.baits.find((b) => b.itemKey === view.loadout.baitKey) ?? null;
  const setLoadout = (patch: Record<string, string | null>) => run('PUT', '/api/fishing/loadout', patch);
  const carrying = view.container.fish.length > 0;

  return (
    <div className={s.prep}>
      <Panel tone="cream" className={s.column}>
        <SectionTitle>{t('fp.maps')}</SectionTitle>
        <div className={s.maps}>
          {view.zones.map((z) => {
            const locked = !z.unlocked;
            return (
              <div
                key={z.key}
                className={s.mapCard}
                role="button"
                tabIndex={0}
                aria-pressed={z.key === zoneKey}
                data-locked={locked}
                onClick={() => !locked && onZone(z.key)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !locked && onZone(z.key)}
              >
                <span className={s.spread}>
                  <span className={s.mapName}>{z.name}</span>
                  {locked && level < z.minLevel && <Badge status="warn">{t('fp.needLevel', { n: z.minLevel })}</Badge>}
                </span>
                <span className={s.row}>
                  {z.odds.map((o) => (
                    <Badge key={o.speciesKey} status={rarityStatus[o.rarity]}>
                      {o.displayName} {o.pct}%
                    </Badge>
                  ))}
                </span>
                {locked ? (
                  <Button
                    tone="butter"
                    disabled={busy || level < z.minLevel || coins < z.unlockCost}
                    onClick={(e) => {
                      e.stopPropagation();
                      void run('POST', `/api/fishing/zones/${z.key}/unlock`);
                    }}
                  >
                    {t('fp.unlock', { n: z.unlockCost })}
                  </Button>
                ) : z.eligibleSpecies === 0 ? (
                  <span className={s.warn}>{t('fp.noneEligible')}</span>
                ) : (
                  <span className={s.meta}>{t('fp.eligible', { n: z.eligibleSpecies })}</span>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel tone="cream" className={s.column}>
        <div className={s.spread}>
          <SectionTitle>{t('fp.equipment')}</SectionTitle>
          <Button tone="coral" onClick={() => open('shop', 'items')}>
            {t('fp.openShop')}
          </Button>
        </div>

        <div className={s.slot}>
          <label className={s.slotHead} htmlFor="fp-rod">
            {t('fp.rod')}
            {rod && <Badge status={rarityStatus[rod.maxRarity]}>{t('fp.maxRarity', { r: t(`rarity.${rod.maxRarity}` as MessageKey) })}</Badge>}
          </label>
          <select id="fp-rod" className={s.select} value={view.loadout.rodId ?? ''} disabled={busy} onChange={(e) => setLoadout({ rodId: e.target.value || null })}>
            <option value="">{t('fp.none')}</option>
            {view.equipment.rods.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.durability}/{r.maxDurability}
                {r.broken ? ` · ${t('st.broken')}` : ''}
              </option>
            ))}
          </select>
          {rod && (
            <>
              <span className={s.meta}>{t('fp.rodStats', { m: rod.catchMult, s: Math.round(rod.stability * 100) })}</span>
              <ProgressBar value={(rod.durability / rod.maxDurability) * 100} status={rod.broken ? 'bad' : rod.durability / rod.maxDurability < 0.3 ? 'warn' : 'good'} label={t('st.durability')} />
              {rod.durability < rod.maxDurability && (
                <Button disabled={busy || coins < rod.repairCost} onClick={() => run('POST', `/api/gear/${rod.id}/repair`)}>
                  {t('fp.repair', { n: rod.repairCost })}
                </Button>
              )}
            </>
          )}
        </div>

        <div className={s.slot}>
          <label className={s.slotHead} htmlFor="fp-bait">
            {t('fp.bait')}
            {bait && <span className={s.meta}>{t('fp.owned', { n: bait.qty })}</span>}
          </label>
          <select id="fp-bait" className={s.select} value={view.loadout.baitKey ?? ''} disabled={busy} onChange={(e) => setLoadout({ baitKey: e.target.value || null })}>
            <option value="">{t('fp.none')}</option>
            {view.equipment.baits.map((b) => (
              <option key={b.itemKey} value={b.itemKey}>
                {b.name} × {b.qty}
              </option>
            ))}
          </select>
        </div>

        <div className={s.slot}>
          <label className={s.slotHead} htmlFor="fp-container">
            {t('fp.container')}
            {cooler && <span className={s.meta}>{t('fp.capacity', { n: kg(cooler.capacityGrams) })}</span>}
          </label>
          <select
            id="fp-container"
            className={s.select}
            value={view.loadout.coolerId ?? ''}
            disabled={busy || carrying}
            onChange={(e) => setLoadout({ coolerId: e.target.value || null })}
          >
            <option value="">{t('fp.none')}</option>
            {view.equipment.coolers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {t('fp.capacity', { n: kg(c.capacityGrams) })}
              </option>
            ))}
          </select>
          {cooler && (
            <>
              <ProgressBar value={(view.container.carriedGrams / Math.max(1, cooler.capacityGrams)) * 100} status="info" label={t('fs.container')} />
              <span className={s.meta}>
                {t('fp.carrying', { n: view.container.fish.length, kg: kg(view.container.carriedGrams), cap: kg(cooler.capacityGrams) })}
              </span>
            </>
          )}
          {carrying && (
            <Button tone="butter" onClick={onReturn}>
              {t('fs.returnShore')}
            </Button>
          )}
        </div>

        {blocker && <p className={s.warn}>{t(`fp.why.${blocker}` as MessageKey)}</p>}
        <Button tone="mint" className={s.start} disabled={!!blocker} onClick={onStart}>
          {t('fp.start')}
        </Button>
      </Panel>
    </div>
  );
}
