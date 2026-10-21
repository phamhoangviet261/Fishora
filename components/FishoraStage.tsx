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
            onReady={() => {
              performance.mark('fishora-first-frame');
              setReady(true);
            }}
          />
        </SceneBoundary>
      )}
      {status === 'ok' && !ready && <div className="stage-loading">Filling the tank…</div>}
      {status === 'none' && <Fallback />}
      <div className="vignette" aria-hidden />
      <h1 className="wordmark">Fishora</h1>
    </main>
  );
}
