'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Confirm, Countdown, Divider, Drawer, ProgressBar, SectionTitle } from '@/components/ui';
import { api } from '@/lib/client/api';
import { errorText, kg, rarityStatus } from '@/lib/client/format';
import { useGame, useGameData } from '@/lib/client/GameProvider';
import { useAction } from '@/lib/client/useAction';
import type { fishDetail } from '@/lib/game/care';
import { useI18n, type MessageKey } from '@/lib/i18n';
import s from '../screens.module.css';
import { hpStatus } from './TankPanel';

type Detail = Awaited<ReturnType<typeof fishDetail>>;
type Pending = { mode: 'sell' | 'release'; coins: number } | null;

/** One fish: its stats, milestones and history, and what can be done with it right now (spec §3, §5, §6, §9). */
export function FishDrawer({ fishId }: { fishId: string }) {
  const { close, open, snapshot, say } = useGame();
  const { t, locale } = useI18n();
  const { run, busy } = useAction();
  const { data: d, error, reload } = useGameData<Detail>(`/api/fish/${fishId}`);
  const [name, setName] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  useEffect(() => setName(d?.fish.nickname ?? ''), [d?.fish.nickname]);

  const when = (x: string | Date) => new Date(x).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });

  if (error) {
    return (
      <Drawer title={t('fd.history')} onClose={close}>
        <p className={s.error}>{errorText(t, error)}</p>
        <Button onClick={reload}>{t('common.retry')}</Button>
      </Drawer>
    );
  }
  if (!d) {
    return (
      <Drawer title="…" onClose={close}>
        <p className={s.muted}>{t('common.loading')}</p>
      </Drawer>
    );
  }

  const f = d.fish;
  const alive = f.status === 'alive' && (f.location === 'tank' || f.location === 'storage');
  const hpMax = snapshot?.tankFish[0]?.hpMax ?? 100;

  const askSale = async (mode: 'sell' | 'release') => {
    const r = await api<{ total: number }>('POST', '/api/fish/sell/preview', { fishIds: [f.id], mode });
    if (r.ok) setPending({ mode, coins: r.data.total });
    else say(errorText(t, r.error, r.detail));
  };

  const rename = () => {
    const next = name.trim() || null;
    if (next === f.nickname) return;
    void run('PATCH', `/api/fish/${f.id}`, { nickname: next });
  };

  return (
    <Drawer
      title={d.name}
      onClose={close}
      footer={
        alive ? (
          <div className={s.row}>
            <Button tone="sky" disabled={busy} onClick={() => run('POST', `/api/fish/${f.id}/move`, { to: f.location === 'tank' ? 'storage' : 'tank' }, () => t('fd.moved'))}>
              {f.location === 'tank' ? t('fd.toStorage') : t('fd.toTank')}
            </Button>
            <Button tone="butter" disabled={busy} onClick={() => askSale('sell')}>
              {t('fd.sell')}
            </Button>
            <Button tone="coral" disabled={busy} onClick={() => askSale('release')}>
              {t('fd.release')}
            </Button>
          </div>
        ) : f.status === 'dead' && d.reviveCost !== null ? (
          <div className={s.stack}>
            <div className={s.spread}>
              <span className={s.meta}>{t('fd.deadline')}</span>
              {f.reviveDeadline && <Countdown to={f.reviveDeadline} />}
            </div>
            <div className={s.row}>
              <Button tone="mint" disabled={busy} onClick={() => run('POST', `/api/fish/${f.id}/revive`, { method: 'coins' }, () => t('fd.revived'))}>
                {t('fd.reviveCoins', { n: d.reviveCost })}
              </Button>
              <Button disabled={busy} onClick={() => run('POST', `/api/fish/${f.id}/revive`, { method: 'item' }, () => t('fd.revived'))}>
                {t('fd.reviveItem')}
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      <div className={s.stack}>
        {f.status !== 'alive' ? (
          <Badge status={f.status === 'dead' ? 'warn' : 'bad'}>{t(`fd.status.${f.status}` as MessageKey)}</Badge>
        ) : f.location === 'trip' ? (
          <Badge status="info">{t('fd.location.trip')}</Badge>
        ) : null}

        <div className={s.row}>
          <label className={s.meta} htmlFor="fish-name">
            {t('fd.rename')}
          </label>
          <input
            id="fish-name"
            className={`${s.nameInput} ${s.textInput}`}
            value={name}
            maxLength={24}
            placeholder={d.speciesName}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && rename()}
          />
          <Button disabled={busy || (name.trim() || null) === f.nickname} onClick={rename}>
            {t('common.save')}
          </Button>
        </div>

        <dl className={s.dl}>
          <dt>{t('fd.species')}</dt>
          <dd>{d.speciesName}</dd>
          <dt>{t('fd.rarity')}</dt>
          <dd>
            <Badge status={rarityStatus[f.rarity]}>{t(`rarity.${f.rarity}` as MessageKey)}</Badge>
          </dd>
          <dt>{t('fd.sex')}</dt>
          <dd>{t(`sex.${f.sex}` as MessageKey)}</dd>
          <dt>{t('fd.age')}</dt>
          <dd>{t('common.days', { n: f.ageDays })}</dd>
          <dt>{t('fd.daysInTank')}</dt>
          <dd>{t('common.days', { n: f.daysInTank })}</dd>
          <dt>{t('tank.weight')}</dt>
          <dd>
            {kg(f.weightGrams)} / {t('common.kg', { n: kg(d.maxWeightGrams) })} {d.mature && <Badge status="good">{t('tank.mature')}</Badge>}
          </dd>
          <dt>{t('fd.value')}</dt>
          <dd>{t('common.coins', { n: f.baseValue })}</dd>
          {f.maturitySaleBonusCoins !== null && (
            <>
              <dt>{t('fd.bonus')}</dt>
              <dd>{t('fd.bonusValue', { coins: f.maturitySaleBonusCoins, pct: f.maturitySaleBonusPct ?? 0 })}</dd>
            </>
          )}
        </dl>
        <div className={s.spread}>
          <span className={s.meta}>{t('tank.hp')}</span>
          <ProgressBar value={(f.hp / hpMax) * 100} status={hpStatus(f.hp, hpMax)} label={t('tank.hp')} />
          <span className={s.num}>{f.hp}</span>
        </div>

        {d.milestones.length > 0 && (
          <>
            <Divider />
            <SectionTitle>{t('fd.milestones')}</SectionTitle>
            <ul className={s.list}>
              {d.milestones.map((m) => (
                <li key={m.weightGrams} className={s.spread}>
                  <span className={s.num}>{t('common.kg', { n: kg(m.weightGrams) })}</span>
                  {m.state === 'claimable' ? (
                    <Button tone="butter" onClick={() => open('rewards')}>
                      {t('fd.ms.claimable')}
                    </Button>
                  ) : (
                    <Badge status={m.state === 'claimed' ? 'good' : undefined}>{t(`fd.ms.${m.state}` as MessageKey)}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        <Divider />
        <SectionTitle>{t('fd.history')}</SectionTitle>
        <ol className={s.timeline}>
          {d.events.map((e, i) => (
            <li key={i}>
              {t(`ev.${e.type}` as MessageKey)}
              <time dateTime={new Date(e.occurredAt).toISOString()}>{when(e.occurredAt)}</time>
            </li>
          ))}
        </ol>
      </div>

      {pending && (
        <Confirm
          title={pending.mode === 'sell' ? t('fd.sell') : t('fd.release')}
          body={pending.mode === 'sell' ? t('fd.sellConfirm', { name: d.name, n: pending.coins }) : t('fd.releaseConfirm', { name: d.name, n: pending.coins })}
          confirmLabel={pending.mode === 'sell' ? t('fd.sell') : t('fd.release')}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const r = await run<{ total: number }>('POST', '/api/fish/sell', { fishIds: [f.id], mode: pending.mode }, (x) => t('fd.sold', { n: x.total }));
            setPending(null);
            if (r.ok) close();
          }}
        />
      )}
    </Drawer>
  );
}
