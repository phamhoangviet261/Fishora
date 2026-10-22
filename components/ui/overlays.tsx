'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Button, Panel, SectionTitle } from './index';
import s from './ui.module.css';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/** Esc closes; Tab cycles inside; focus moves in on open and back to the opener on close. */
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    (el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const [first, last] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el?.addEventListener('keydown', onKey);
    return () => {
      el?.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);
  return ref;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Button variant="icon" className={s.closeX} aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>
      ×
    </Button>
  );
}

/** Centered dialog over a dimmed backdrop. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useDialog(onClose);
  return (
    <div className={s.backdrop} onClick={onClose}>
      <Panel ref={ref} tone="cream" className={s.modal} data-wide={wide} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className={s.overlayHead}>
          <SectionTitle>{title}</SectionTitle>
          <CloseButton onClose={onClose} />
        </header>
        <div className={s.overlayBody}>{children}</div>
      </Panel>
    </div>
  );
}

/** Side sheet on the right; a bottom sheet on phones. The tank stays visible beside it. */
export function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useDialog(onClose);
  return (
    <div className={s.drawerLayer} onClick={onClose}>
      <Panel ref={ref} tone="cream" className={s.drawer} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className={s.overlayHead}>
          <SectionTitle>{title}</SectionTitle>
          <CloseButton onClose={onClose} />
        </header>
        <div className={s.drawerBody}>{children}</div>
        {footer && <footer className={s.drawerFoot}>{footer}</footer>}
      </Panel>
    </div>
  );
}

export function Confirm({
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal title={title} onClose={onCancel}>
      {body && <div className={s.confirmBody}>{body}</div>}
      <div className={s.row}>
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button tone="mint" disabled={busy} onClick={onConfirm} data-autofocus>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
