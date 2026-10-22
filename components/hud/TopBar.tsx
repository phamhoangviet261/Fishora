'use client';

import { Badge, Button, Panel, ProgressBar } from '@/components/ui';
import { useGame } from '@/lib/client/GameProvider';
import { useI18n } from '@/lib/i18n';
import { BellIcon } from './icons';
import s from './Hud.module.css';

/** Level badge and EXP bar toward the next level (signed in only). */
export function LevelBar() {
  const { snapshot } = useGame();
  const { t } = useI18n();
  if (!snapshot) return null;
  const { level, exp, prevLevelExp, nextLevelExp } = snapshot.player;
  const pct = nextLevelExp === null ? 100 : ((exp - prevLevelExp) / Math.max(1, nextLevelExp - prevLevelExp)) * 100;
  return (
    <Panel tone="cream" className={s.levelBar}>
      <Badge status="info">{t('top.level', { n: level })}</Badge>
      <ProgressBar value={pct} status="info" label={t('top.expAria')} />
      <span className={s.expText}>{nextLevelExp === null ? t('top.expMax', { n: exp }) : t('top.exp', { n: exp, m: nextLevelExp })}</span>
    </Panel>
  );
}

/** Rewards waiting to be claimed; opens the Rewards screen. */
export function BellButton() {
  const { snapshot, open } = useGame();
  const { t } = useI18n();
  if (!snapshot) return null;
  const n = snapshot.counts.pendingClaims;
  return (
    <Button variant="icon" tone="butter" className={s.bell} aria-label={t('top.bell', { n })} title={t('top.bell', { n })} onClick={() => open('rewards')}>
      <BellIcon />
      {n > 0 && <span className={s.bellCount}>{n > 99 ? '99+' : n}</span>}
    </Button>
  );
}

/** A dead fish waiting for a revive, with the time left; opens its detail. */
export function DeadChip() {
  const { snapshot, open } = useGame();
  const { t } = useI18n();
  const first = snapshot?.dead[0];
  if (!first) return null;
  return (
    <Button tone="coral" className={s.deadChip} onClick={() => open('fish', first.id)}>
      {t('top.dead', { name: first.name })}
    </Button>
  );
}
