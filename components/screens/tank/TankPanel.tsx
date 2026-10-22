'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Divider, Panel, ProgressBar, SectionTitle, type Status } from '@/components/ui';
import { kg, rarityStatus } from '@/lib/client/format';
import { useGame, type Snapshot } from '@/lib/client/GameProvider';
import { useI18n, type MessageKey } from '@/lib/i18n';
import hud from '@/components/hud/Hud.module.css';
import s from '../screens.module.css';

/** How many dirt thresholds the tank is past: 0 = no effect on fish (spec §4.4). */
export function dirtLevel(tank: Snapshot['tank']): number {
  return tank.dirtThresholds.filter((at) => tank.dirt >= at).length;
}

export const dirtStatus = (level: number): Status => (level === 0 ? 'good' : level === 1 ? 'warn' : 'bad');

export const hpStatus = (hp: number, max: number): Status => (hp / max >= 0.6 ? 'good' : hp / max >= 0.3 ? 'warn' : 'bad');

export function DirtMeter({ tank }: { tank: Snapshot['tank'] }) {
  const { t } = useI18n();
  const level = dirtLevel(tank);
  const scale = Math.max(1, (tank.dirtThresholds[tank.dirtThresholds.length - 1] ?? tank.dirtMax) * 1.25);
  return (
    <div className={s.spread}>
      <span className={s.meta}>{t('tank.dirt')}</span>
      <ProgressBar value={(tank.dirt / scale) * 100} status={dirtStatus(level)} label={t('tank.dirt')} />
      <Badge status={dirtStatus(level)}>{level === 0 ? t('tank.dirt.clean') : t('tank.dirt.level', { n: level })}</Badge>
    </div>
  );
}

/** Compact live view of the player's tank in the HUD; rows open each fish. */
export function TankPanel() {
  const { snapshot, open } = useGame();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    if (window.innerWidth < 640) setExpanded(false);
  }, []);
  if (!snapshot) return null;
  const { tank, tankFish } = snapshot;

  return (
    <Panel tone="cream" className={hud.status} aria-label={t('tank.title')}>
      <button type="button" className={hud.statusHead} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        <span className={hud.statusHeadText}>
          <SectionTitle>{t('tank.title')}</SectionTitle>
          <span className={hud.tankName}>{t('tank.capacity', { used: tank.capacity.used, max: tank.capacity.max })}</span>
        </span>
        <span className={hud.chev} data-open={expanded} aria-hidden>
          ▾
        </span>
      </button>
      {expanded && (
        <div className={hud.body}>
          <Divider />
          <DirtMeter tank={tank} />
          <Divider />
          {tankFish.length === 0 ? (
            <p className={s.muted}>{t('tank.empty')}</p>
          ) : (
            <ul className={s.list}>
              {tankFish.map((f) => (
                <li key={f.id}>
                  <button type="button" className={`${s.card} ${s.fishRow}`} onClick={() => open('fish', f.id)}>
                    <span className={s.spread}>
                      <strong className={s.cardTitle}>{f.name}</strong>
                      <span className={s.num}>{t('common.kg', { n: kg(f.weightGrams) })}</span>
                    </span>
                    <span className={s.spread}>
                      <ProgressBar value={(f.hp / f.hpMax) * 100} status={hpStatus(f.hp, f.hpMax)} label={`${t('tank.hp')} ${f.name}`} />
                      <span className={s.meta}>{f.hp}</span>
                    </span>
                    <span className={s.row}>
                      <Badge status={rarityStatus[f.rarity]}>{t(`rarity.${f.rarity}` as MessageKey)}</Badge>
                      {f.hungry && <Badge status="warn">{t('tank.hungry')}</Badge>}
                      {f.mature && <Badge status="good">{t('tank.mature')}</Badge>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Divider />
          <div className={s.row}>
            <Button tone="butter" onClick={() => open('tank', 'feed')} disabled={tankFish.length === 0}>
              {t('tank.feed')}
            </Button>
            <Button tone="sky" onClick={() => open('tank', 'clean')}>
              {t('tank.clean')}
            </Button>
            <Button tone="mint" onClick={() => open('tank')}>
              {t('tank.auto')}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
