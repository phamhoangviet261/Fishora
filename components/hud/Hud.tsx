'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { WATER_CHANGE_COST, weatherAt, type GameState, type WaterChangeResult } from '@/lib/game/useGameState';
import { Badge, Button, Divider, Panel, ProgressBar, SectionTitle, type Status } from '@/components/ui';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useGame } from '@/lib/client/GameProvider';
import { Dock } from './Dock';
import { FeedButton } from './FeedButton';
import { SettingsModal } from './SettingsModal';
import { BellButton, DeadChip, LevelBar } from './TopBar';
import { BrushIcon, BulbIcon, CoinIcon, FoodIcon, GearIcon, ShopIcon, WaterIcon, WeatherIcon } from './icons';
import s from './Hud.module.css';


interface Props {
  state: GameState;
  /** The signed-in tank panel; the guest demo shows its local status panel instead. */
  tankPanel?: ReactNode;
  onToggleLight: () => void;
  onFeed: () => void;
  onChangeWater: () => Promise<WaterChangeResult>;
  onClean: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

// Semantic thresholds for the water readouts (display only).
const phStatus = (ph: number): Status => (ph >= 6.5 && ph <= 7.5 ? 'good' : ph >= 6.2 && ph <= 7.8 ? 'warn' : 'bad');
const oxygenStatus = (o: number): Status => (o >= 7 ? 'good' : o >= 6 ? 'warn' : 'bad');
const algaeStatus = (a: number): Status => (a < 10 ? 'good' : a < 25 ? 'warn' : 'bad');
const satietyStatus = (v: number): Status => (v >= 60 ? 'good' : v >= 30 ? 'warn' : 'bad');

function Stat({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className={s.stat}>
      <dt>{label}</dt>
      <dd>
        {children}
        <span className={s.value}>{value}</span>
      </dd>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const { t } = useI18n();
  return status === 'info' ? null : <Badge status={status}>{t(`level.${status}` as MessageKey)}</Badge>;
}

export function Hud({ state, tankPanel, onToggleLight, onFeed, onChangeWater, onClean }: Props) {
  const { t, locale } = useI18n();
  const game = useGame();
  const snapshot = game.snapshot;
  const coins = snapshot ? snapshot.player.coins : state.coins;
  const [panel, setPanel] = useState<null | 'settings' | 'shop'>(null);
  const [statusOpen, setStatusOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(undefined);

  // Collapse the tank status panel by default on phones so the aquarium stays visible.
  useEffect(() => {
    if (window.innerWidth < 640) setStatusOpen(false);
  }, []);

  const say = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  const day = Math.floor(state.minutes / 1440) + 1;
  const minuteOfDay = state.minutes % 1440;
  const time = `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;
  const weather = weatherAt(state.minutes);
  const fishTotal = state.fish.reduce((n, g) => n + g.count, 0);
  const hasFish = fishTotal > 0;
  const canChangeWater = state.coins >= WATER_CHANGE_COST;

  const ph = phStatus(state.ph);
  const o2 = oxygenStatus(state.oxygen);
  const algae = algaeStatus(state.algae);
  const sat = satietyStatus(state.satiety);

  return (
    <div className={s.hud}>
      <div className={s.topLeft}>
        <div className={s.infoRow}>
          <Panel tone="cream" className={s.info} aria-label={t('info.label')}>
            <div className={s.clock}>
              <span className={s.time}>{time}</span>
              <span className={s.day}>{t('info.day', { n: day })}</span>
            </div>
            <Badge status="info">
              <WeatherIcon kind={weather} size={14} />
              <span className={s.weatherText}>{t(`weather.${weather}`)}</span>
            </Badge>
            <Button
              variant="icon"
              tone={state.lightOn ? 'butter' : 'cream'}
              className={s.light}
              aria-pressed={state.lightOn}
              aria-label={state.lightOn ? t('light.on') : t('light.off')}
              title={state.lightOn ? t('light.onShort') : t('light.offShort')}
              onClick={onToggleLight}
            >
              <BulbIcon on={state.lightOn} />
            </Button>
          </Panel>
          <Button tone="butter" className={s.coins} aria-label={t('coins.aria', { n: coins })} onClick={() => (snapshot ? game.open('shop') : setPanel('shop'))}>
            <CoinIcon />
            <span>{coins.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')}</span>
          </Button>
        </div>

        {snapshot ? (
          <>
            <LevelBar />
            <DeadChip />
            {tankPanel}
          </>
        ) : (
        <Panel tone="cream" className={s.status} aria-label={t('status.label')}>
          <button type="button" className={s.statusHead} aria-expanded={statusOpen} onClick={() => setStatusOpen((v) => !v)}>
            <span className={s.statusHeadText}>
              <SectionTitle>{t('status.yourTank')}</SectionTitle>
              <span className={s.tankName}>{t(`tank.${state.tankType}` as MessageKey)}</span>
            </span>
            <span className={s.chev} data-open={statusOpen} aria-hidden>
              ▾
            </span>
          </button>

          {statusOpen && (
            <div className={s.body}>
              <Divider />
              <SectionTitle>{t('status.fish', { n: fishTotal })}</SectionTitle>
              <div className={s.fishList}>
                {hasFish ? (
                  state.fish.map((g) => (
                    <Badge key={g.species} status="info">
                      {t(`fish.${g.species}` as MessageKey)} × {g.count}
                    </Badge>
                  ))
                ) : (
                  <span className={s.empty}>{t('status.noFish')}</span>
                )}
              </div>
              <dl className={s.stats}>
                <Stat label={t('status.satiety')} value={hasFish ? `${Math.round(state.satiety)}%` : '—'}>
                  {hasFish && <ProgressBar value={state.satiety} status={sat} label={t('status.satietyAria')} />}
                </Stat>
              </dl>

              <Divider />
              <SectionTitle>{t('status.environment')}</SectionTitle>
              <dl className={s.stats}>
                <Stat label={t('status.moss')} value={t('status.mossValue', { n: state.mossClumps })} />
                <Stat label={t('status.algae')} value={<>{state.algae.toFixed(1)}% <StatusBadge status={algae} /></>}>
                  <ProgressBar value={state.algae * 2} status={algae} label={t('status.algaeAria')} />
                </Stat>
                <Stat label={t('status.ph')} value={<>{state.ph.toFixed(1)} <StatusBadge status={ph} /></>}>
                  <ProgressBar value={((state.ph - 6) / 2) * 100} status={ph} label={t('status.phAria')} />
                </Stat>
                <Stat label={t('status.oxygen')} value={<>{state.oxygen.toFixed(1)} mg/L <StatusBadge status={o2} /></>}>
                  <ProgressBar value={((state.oxygen - 5) / 4) * 100} status={o2} label={t('status.oxygenAria')} />
                </Stat>
              </dl>
            </div>
          )}
        </Panel>
        )}
      </div>

      <div className={s.topRight}>
        <Button variant="icon" tone="sky" aria-label={t('nav.settings')} title={t('nav.settings')} onClick={() => setPanel('settings')}>
          <GearIcon />
        </Button>
        {snapshot ? (
          <BellButton />
        ) : (
          <Button variant="icon" tone="coral" aria-label={t('nav.shop')} title={t('nav.shop')} onClick={() => setPanel('shop')}>
            <ShopIcon />
          </Button>
        )}
      </div>

      {snapshot ? (
        <>
          <Dock />
          <FeedButton />
        </>
      ) : (
      <nav className={s.actions} aria-label={t('actions.label')}>
        <Button
          variant="stacked"
          tone="butter"
          onClick={() => {
            onFeed();
            say(hasFish ? t('toast.fed') : t('toast.noFish'));
          }}
        >
          <FoodIcon />
          <span>{t('actions.feed')}</span>
        </Button>
        <Button
          variant="stacked"
          tone="sky"
          disabled={!canChangeWater}
          title={canChangeWater ? t('actions.waterCost', { n: WATER_CHANGE_COST }) : t('actions.notEnough')}
          onClick={async () => {
            const result = await onChangeWater();
            say(
              result === 'ok'
                ? t('toast.water', { n: WATER_CHANGE_COST })
                : result === 'insufficient'
                  ? t('actions.notEnough')
                  : t('toast.serverError'),
            );
          }}
        >
          <WaterIcon />
          <span>{t('actions.water')}</span>
        </Button>
        <Button
          variant="stacked"
          tone="mint"
          onClick={() => {
            onClean();
            say(t('toast.clean'));
          }}
        >
          <BrushIcon />
          <span>{t('actions.clean')}</span>
        </Button>
        <Button variant="stacked" tone="coral" onClick={() => setPanel('settings')}>
          <GearIcon />
          <span>{t('nav.signIn')}</span>
        </Button>
      </nav>
      )}

      {(toast ?? game.toast) && (
        <Panel tone="butter" className={s.toast} role="status">
          {toast ?? game.toast}
        </Panel>
      )}

      {panel === 'settings' && <SettingsModal onClose={() => setPanel(null)} />}

      {panel === 'shop' && (
        <div className={s.backdrop} onClick={() => setPanel(null)}>
          <Panel tone="cream" className={s.modal} role="dialog" aria-modal="true" aria-label={t('nav.shop')} onClick={(e) => e.stopPropagation()}>
            <SectionTitle>{t('nav.shop')}</SectionTitle>
            <Divider />
            <p>{t('shop.soon')}</p>
            <Button tone="mint" onClick={() => setPanel(null)} autoFocus>
              {t('common.close')}
            </Button>
          </Panel>
        </div>
      )}
    </div>
  );
}
