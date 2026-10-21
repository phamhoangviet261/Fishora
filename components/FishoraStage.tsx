'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type ReactNode } from 'react';

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
  return (
    <div className="stage-fallback" role="alert">
      <p>This aquarium needs WebGL, which isn&apos;t available in this browser right now.</p>
      <p className="hint">Try enabling hardware acceleration or opening the page in a recent version of Chrome, Edge, Firefox or Safari.</p>
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
  const [status, setStatus] = useState<'checking' | 'ok' | 'none'>('checking');
  const [mobile, setMobile] = useState(false);
  const [ready, setReady] = useState(false);
  const [lightOn, setLightOn] = useState(true);

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
            lightOn={lightOn}
            onReady={() => {
              performance.mark('fishora-first-frame');
              setReady(true);
            }}
          />
        </SceneBoundary>
      )}
      {status === 'ok' && !ready && <div className="stage-loading">Filling the tank…</div>}
      {status === 'none' && <Fallback />}
      <div className="grade" aria-hidden />
      <div className="vignette" aria-hidden />
      <h1 className="wordmark">Fishora</h1>
      {status === 'ok' && ready && (
        <button
          type="button"
          className={`light-toggle${lightOn ? ' on' : ''}`}
          aria-pressed={lightOn}
          aria-label={lightOn ? 'Tắt đèn bể cá' : 'Bật đèn bể cá'}
          title={lightOn ? 'Tắt đèn' : 'Bật đèn'}
          onClick={() => setLightOn((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path
              d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"
              fill={lightOn ? 'currentColor' : 'none'}
              fillOpacity={lightOn ? 0.25 : 0}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </main>
  );
}
