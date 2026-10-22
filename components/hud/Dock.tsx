'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { useGame, type Screen } from '@/lib/client/GameProvider';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { BookIcon, BoxIcon, GiftIcon, RodIcon, ShopIcon, TankIcon } from './icons';
import s from './Hud.module.css';

const ITEMS: { screen: Screen; label: MessageKey; icon: ReactNode; tone: 'butter' | 'sky' | 'mint' | 'coral' | 'cream' }[] = [
  { screen: 'tank', label: 'nav.tank', icon: <TankIcon />, tone: 'sky' },
  { screen: 'storage', label: 'nav.storage', icon: <BoxIcon />, tone: 'cream' },
  { screen: 'shop', label: 'nav.shop', icon: <ShopIcon />, tone: 'coral' },
  { screen: 'fishing', label: 'nav.fishing', icon: <RodIcon />, tone: 'mint' },
  { screen: 'rewards', label: 'nav.rewards', icon: <GiftIcon />, tone: 'butter' },
  { screen: 'collection', label: 'nav.collection', icon: <BookIcon />, tone: 'cream' },
];

/** Bottom navigation between the game screens (signed in). */
export function Dock() {
  const { screen, open, close } = useGame();
  const { t } = useI18n();
  return (
    <nav className={s.dock} aria-label={t('nav.main')}>
      {ITEMS.map((item) => {
        const active = screen === item.screen || (item.screen === 'tank' && screen === 'fish') || (item.screen === 'fishing' && screen === 'trip');
        return (
          <Button
            key={item.screen}
            variant="stacked"
            tone={item.tone}
            className={s.dockItem}
            aria-pressed={active}
            onClick={() => (active ? close() : open(item.screen))}
          >
            {item.icon}
            <span>{t(item.label)}</span>
          </Button>
        );
      })}
    </nav>
  );
}
