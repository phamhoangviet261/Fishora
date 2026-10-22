'use client';

import { useState } from 'react';
import { Badge, Button, Countdown, Drawer, ProgressBar, Tabs } from '@/components/ui';
import { errorText } from '@/lib/client/format';
import { useGame, useGameData } from '@/lib/client/GameProvider';
import { useAction } from '@/lib/client/useAction';
import type { achievementList, questList } from '@/lib/game/progression';
import type { rewardInbox } from '@/lib/game/rewards';
import type { RewardBundle } from '@/lib/game/types';
import { useI18n, type MessageKey, type Translate } from '@/lib/i18n';
import s from '../screens.module.css';

type Inbox = Awaited<ReturnType<typeof rewardInbox>>;
type Quests = Awaited<ReturnType<typeof questList>>;
type Achievements = Awaited<ReturnType<typeof achievementList>>;
type Tab = 'inbox' | 'quests' | 'achievements';

/** Pending rewards, daily quests with the login streak, and achievements (spec §6.1, §10.3, §10.4). */
export function RewardsScreen() {
  const { close } = useGame();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('inbox');
  return (
    <Drawer title={t('rw.title')} onClose={close}>
      <Tabs
        label={t('rw.title')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'inbox', label: t('rw.inbox') },
          { id: 'quests', label: t('rw.quests') },
          { id: 'achievements', label: t('rw.achievements') },
        ]}
      />
      {tab === 'inbox' ? <InboxTab /> : tab === 'quests' ? <QuestsTab /> : <AchievementsTab />}
    </Drawer>
  );
}

function bundleText(t: Translate, b: RewardBundle): string {
  return [b.coins && t('rw.part.coins', { n: b.coins }), b.exp && t('rw.part.exp', { n: b.exp }), ...(b.items ?? []).map((i) => t('rw.part.item', { qty: i.qty, name: i.itemKey }))]
    .filter(Boolean)
    .join(' · ');
}

function Loading({ error, reload }: { error: string | null; reload: () => void }) {
  const { t } = useI18n();
  return error ? (
    <div className={s.stack}>
      <p className={s.error}>{errorText(t, error)}</p>
      <Button onClick={reload}>{t('common.retry')}</Button>
    </div>
  ) : (
    <p className={s.muted}>{t('common.loading')}</p>
  );
}

function InboxTab() {
  const { t } = useI18n();
  const { run, busy } = useAction();
  const { data, error, reload } = useGameData<Inbox>('/api/rewards');
  if (!data) return <Loading error={error} reload={reload} />;
  if (data.length === 0) return <p className={s.muted}>{t('rw.empty')}</p>;

  const claim = (partIds: string[]) =>
    run<{ claimed: string[]; blocked: string[] }>('POST', '/api/rewards/claim', { partIds }, (r) => (r.blocked.length ? t('rw.blocked') : t('rw.claimed')));
  const pendingIds = (parts: Inbox[number]['parts']) => parts.filter((p) => p.status === 'pending').map((p) => p.id);
  const all = data.flatMap((c) => pendingIds(c.parts));

  return (
    <div className={s.stack}>
      <div className={s.row}>
        <Button tone="mint" disabled={busy || all.length === 0} onClick={() => claim(all)}>
          {t('rw.claimAll')}
        </Button>
      </div>
      <ul className={s.list}>
        {data.map((c) => (
          <li key={c.id} className={s.card}>
            <div className={s.spread}>
              <strong className={s.cardTitle}>{t(`rw.source.${c.source}` as MessageKey, { name: c.fishName ?? '' })}</strong>
              <Button tone="butter" disabled={busy} onClick={() => claim(pendingIds(c.parts))}>
                {t('rw.claim')}
              </Button>
            </div>
            <ul className={s.list}>
              {c.parts
                .filter((p) => p.status !== 'void')
                .map((p) => (
                  <li key={p.id} className={s.spread}>
                    <span className={s.meta}>
                      {p.kind === 'coins'
                        ? t('rw.part.coins', { n: p.qty })
                        : p.kind === 'exp'
                          ? t('rw.part.exp', { n: p.qty })
                          : t('rw.part.item', { qty: p.qty, name: p.itemName ?? p.itemKey ?? '' })}
                    </span>
                    {p.status === 'claimed' && <Badge status="good">{t('rw.claimed')}</Badge>}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestsTab() {
  const { t } = useI18n();
  const { data, error, reload } = useGameData<Quests>('/api/quests');
  if (!data) return <Loading error={error} reload={reload} />;
  const rewards = data.loginRewards as RewardBundle[];
  const today = rewards.length ? (Math.max(1, data.loginStreak) - 1) % rewards.length : -1;

  return (
    <div className={s.stack}>
      <div className={s.spread}>
        <span className={s.meta}>{t('q.resets')}</span>
        <Countdown to={data.resetsAt} />
      </div>
      <ul className={s.list}>
        {data.quests.map((q) => (
          <li key={q.id} className={s.card}>
            <div className={s.spread}>
              <strong className={s.cardTitle}>{q.metric ? t(`q.metric.${q.metric}` as MessageKey) : q.templateKey}</strong>
              {q.completed ? <Badge status="good">{t('q.done')}</Badge> : <span className={s.num}>{`${q.progress}/${q.target}`}</span>}
            </div>
            <ProgressBar value={(q.progress / q.target) * 100} status={q.completed ? 'good' : 'info'} label={`${q.progress}/${q.target}`} />
            <div className={s.spread}>
              <span className={s.meta}>{bundleText(t, q.reward as RewardBundle)}</span>
              {q.completed && <Badge status={q.claimed ? 'good' : 'warn'}>{q.claimed ? t('rw.claimed') : t('rw.inbox')}</Badge>}
            </div>
          </li>
        ))}
      </ul>
      {rewards.length > 0 && (
        <div className={s.card}>
          <strong className={s.cardTitle}>{t('login.streak', { n: data.loginStreak })}</strong>
          <ol className={s.streak}>
            {rewards.map((r, i) => (
              <li key={i} data-today={i === today}>
                <span className={s.meta}>{t('login.day', { n: i + 1 })}</span>
                <span className={s.num}>{bundleText(t, r)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function AchievementsTab() {
  const { t } = useI18n();
  const { data, error, reload } = useGameData<Achievements>('/api/achievements');
  if (!data) return <Loading error={error} reload={reload} />;
  return (
    <ul className={s.list}>
      {data.map((a) => (
        <li key={a.key} className={s.card} data-selected={!!a.completedAt}>
          <div className={s.spread}>
            <strong className={s.cardTitle}>{t(`q.metric.${a.metric}` as MessageKey)}</strong>
            {a.completedAt ? <Badge status="good">{t('q.done')}</Badge> : <span className={s.num}>{`${a.value}/${a.threshold}`}</span>}
          </div>
          <ProgressBar value={(a.value / a.threshold) * 100} status={a.completedAt ? 'good' : 'info'} label={`${a.value}/${a.threshold}`} />
          <span className={s.meta}>{bundleText(t, a.reward as RewardBundle)}</span>
        </li>
      ))}
    </ul>
  );
}
