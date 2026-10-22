'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { useGame, type Screen } from '@/lib/client/GameProvider';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { BookIcon, BoxIcon, GiftIcon, RodIcon, ShopIcon, TankIcon } from './icons';
import s from './Hud.module.css';

/** A dock entry opens a screen over the tank, or (`href`) its own page. */
const ITEMS: { screen: Screen | null; href?: string; label: MessageKey; icon: ReactNode; tone: 'butter' | 'sky' | 'mint' | 'coral' | 'cream' }[] = [
  { screen: 'tank', label: 'nav.tank', icon: <TankIcon />, tone: 'sky' },
  { screen: 'storage', label: 'nav.storage', icon: <BoxIcon />, tone: 'cream' },
  { screen: 'shop', label: 'nav.shop', icon: <ShopIcon />, tone: 'coral' },
  { screen: null, href: '/fishing', label: 'nav.fishing', icon: <RodIcon />, tone: 'mint' },
  { screen: 'rewards', label: 'nav.rewards', icon: <GiftIcon />, tone: 'butter' },
  { screen: 'collection', label: 'nav.collection', icon: <BookIcon />, tone: 'cream' },
];

/** Bottom navigation between the game screens (signed in). */
export function Dock() {
  const { screen, open, close } = useGame();
  const { t } = useI18n();
  const router = useRouter();
  return (
    <nav className={s.dock} aria-label={t('nav.main')}>
      {ITEMS.map((item) => {
        const active = item.screen !== null && (screen === item.screen || (item.screen === 'tank' && screen === 'fish'));
        return (
          <Button
            key={item.label}
            variant="stacked"
            tone={item.tone}
            className={s.dockItem}
            aria-pressed={active}
            onClick={() => (item.href ? router.push(item.href) : active ? close() : open(item.screen!))}
          >
            {item.icon}
            <span>{t(item.label)}</span>
          </Button>
        );
      })}
    </nav>
  );
}
