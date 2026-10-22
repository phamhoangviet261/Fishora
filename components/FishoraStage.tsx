'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { dropFood } from '@/lib/game/food';
import { useGameState } from '@/lib/game/useGameState';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { Hud } from './hud/Hud';

const AquariumScene = dynamic(() => import('./scene/AquariumScene').then((m) => m.AquariumScene), {
  ssr: false,
  loading: () => null,
});

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function Fallback({ detail }: { detail?: string }) {
  const { t } = useI18n();
  return (
    <div className="stage-fallback" role="alert">
      <p>{t('fallback.title')}</p>
      <p className="hint">{t('fallback.hint')}</p>
      {detail ? <p className="hint">{detail}</p> : null}
    </div>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    return this.state.error ? <Fallback detail={this.state.error} /> : this.props.children;
  }
}

export function FishoraStage() {
  return (
    <I18nProvider>
      <Stage />
    </I18nProvider>
  );
}

function Stage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<'checking' | 'ok' | 'none'>('checking');
  const [mobile, setMobile] = useState(false);
  const [ready, setReady] = useState(false);
  const game = useGameState();

  useEffect(() => {
    setMobile(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);
    setStatus(hasWebGL() ? 'ok' : 'none');
  }, []);

  return (
    <main className="stage">
      {status === 'ok' && (
        <SceneBoundary>
          <AquariumScene
            mobile={mobile}
            lightOn={game.state.lightOn}
            onReady={() => {
              performance.mark('fishora-first-frame');
              setReady(true);
            }}
          />
        </SceneBoundary>
      )}
      {status === 'ok' && !ready && <div className="stage-loading">{t('loading')}</div>}
      {status === 'none' && <Fallback />}
      <h1 className="wordmark">Fishora</h1>
      {status === 'ok' && ready && (
        <Hud
          state={game.state}
          onToggleLight={game.toggleLight}
          onFeed={() => {
            game.feed();
            dropFood();
          }}
          onChangeWater={game.changeWater}
          onClean={game.clean}
        />
      )}
    </main>
  );
}
