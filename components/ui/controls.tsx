'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './index';
import s from './ui.module.css';

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className={s.tabs} role="tablist" aria-label={label}>
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          className={s.tab}
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** A labelled input/select. */
export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

export function Stepper({ value, min = 1, max, onChange, label }: { value: number; min?: number; max: number; onChange: (n: number) => void; label: string }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n) || min));
  return (
    <span className={s.stepper} role="group" aria-label={label}>
      <Button variant="icon" aria-label="−" disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
        −
      </Button>
      <input type="number" inputMode="numeric" aria-label={label} min={min} max={max} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      <Button variant="icon" aria-label="+" disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
        +
      </Button>
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Live "Nd hh:mm:ss" until `to`. */
export function Countdown({ to }: { to: string | Date }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, Math.floor((target - now) / 1000));
  const d = Math.floor(left / 86400);
  const text = `${d ? `${d}d ` : ''}${pad(Math.floor((left % 86400) / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
  return (
    <time className={s.countdown} dateTime={new Date(target).toISOString()}>
      {text}
    </time>
  );
}
