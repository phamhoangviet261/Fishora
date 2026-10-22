'use client';

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import s from './ui.module.css';

// Shared Fishora UI kit: every HUD surface and control is built from these.

export type Tone = 'cream' | 'butter' | 'mint' | 'sky' | 'coral';
export type Status = 'good' | 'warn' | 'bad' | 'info';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

export const Panel = forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & { tone?: Tone }>(function Panel({ tone, className, ...rest }, ref) {
  return <section ref={ref} {...rest} data-tone={tone} className={cx(s.panel, className)} />;
});

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className={s.sectionTitle}>{children}</h2>;
}

export function Divider() {
  return <hr className={s.divider} />;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  variant?: 'default' | 'icon' | 'stacked';
}

export function Button({ tone = 'cream', variant = 'default', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      data-tone={tone}
      className={cx(s.button, variant === 'icon' && s.icon, variant === 'stacked' && s.stacked, className)}
    />
  );
}

export function Badge({ status, children }: { status?: Status; children: ReactNode }) {
  return (
    <span className={s.badge} data-status={status}>
      {children}
    </span>
  );
}

/** Rounded meter. Pair with a text value or Badge so the meaning never relies on colour alone. */
export function ProgressBar({ value, status = 'good', label }: { value: number; status?: Status; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className={s.bar} data-status={status} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <span style={{ width: `${v}%` }} />
    </span>
  );
}

export { Confirm, Drawer, Modal } from './overlays';
export { Countdown, Field, Stepper, Tabs } from './controls';
