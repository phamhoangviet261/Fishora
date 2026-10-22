'use client';

import type { ReactNode } from 'react';
import { Modal } from '@/components/ui';
import { useGame, type Screen } from '@/lib/client/GameProvider';
import { useI18n } from '@/lib/i18n';
import s from './screens.module.css';

/** Renders the open game screen. Each screen is an overlay over the live tank. */
export function ScreenHost({ screens }: { screens: Partial<Record<Screen, () => ReactNode>> }) {
  const { screen, close } = useGame();
  const { t } = useI18n();
  if (!screen) return null;
  const render = screens[screen];
  if (render) return <>{render()}</>;
  return (
    <Modal title={t(screen === 'fishing' ? 'nav.fishing' : 'common.loading')} onClose={close}>
      <p className={s.muted}>{t('fishing.soon')}</p>
    </Modal>
  );
}
