'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Panel } from '@/components/ui';
import { CoinIcon } from '@/components/hud/icons';
import { ScreenHost } from '@/components/screens/ScreenHost';
import { ShopScreen } from '@/components/screens/shop/ShopScreen';
import { StorageScreen } from '@/components/screens/storage/StorageScreen';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { GameProvider, useGame, useGameData } from '@/lib/client/GameProvider';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { FishingSession } from './FishingSession';
import { PrepPanel } from './PrepPanel';
import { ReturnDialog } from './ReturnDialog';
import type { FishingView } from './types';
import s from './fishing.module.css';

/** /fishing: preparation (map + equipment), then the first-person session; the shop opens as the usual drawer. */
export function FishingPage() {
  return (
    <I18nProvider>
      <AuthProvider>
        <GameProvider>
          <Fishing />
        </GameProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

function Fishing() {
  const { t, locale } = useI18n();
  const { user, loading } = useAuth();
  const { snapshot, toast } = useGame();
  const { data: view, error, reload } = useGameData<FishingView>(user ? '/api/fishing' : null);
  const router = useRouter();
  const [mode, setMode] = useState<'prep' | 'session'>('prep');
  const [zoneKey, setZoneKey] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);

  // Default to the map last fished, else the first unlocked one.
  useEffect(() => {
    if (view && !zoneKey) setZoneKey(view.lastZoneKey ?? view.zones.find((z) => z.unlocked)?.key ?? null);
  }, [view, zoneKey]);

  return (
    <main className={s.page}>
      <div className={s.topBar}>
        <Button tone="sky" onClick={() => router.push('/')}>
          ← {t('fp.home')}
        </Button>
        <h1 style={{ margin: 0, fontSize: 18 }}>{t('fp.title')}</h1>
        {snapshot && (
          <Panel tone="butter" className={s.coins} aria-label={t('coins.aria', { n: snapshot.player.coins })}>
            <CoinIcon />
            {snapshot.player.coins.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')}
          </Panel>
        )}
      </div>

      {!loading && !user ? (
        <Panel tone="cream" className={s.result}>
          <p>{t('fp.signIn')}</p>
          <Link href="/">{t('fp.home')}</Link>
        </Panel>
      ) : !view ? (
        <Panel tone="cream" className={s.result}>
          {error ? error : t('common.loading')}
        </Panel>
      ) : mode === 'session' && zoneKey ? (
        <FishingSession view={view} zoneKey={zoneKey} onExit={() => setMode('prep')} onReturn={() => setReturning(true)} onChanged={reload} />
      ) : (
        <PrepPanel view={view} zoneKey={zoneKey} onZone={setZoneKey} onStart={() => setMode('session')} onReturn={() => setReturning(true)} />
      )}

      {returning && view && <ReturnDialog view={view} onClose={() => setReturning(false)} />}
      <ScreenHost screens={{ shop: () => <ShopScreen />, storage: () => <StorageScreen /> }} />
      {toast && (
        <Panel tone="butter" className={s.toast} role="status">
          {toast}
        </Panel>
      )}
    </main>
  );
}
