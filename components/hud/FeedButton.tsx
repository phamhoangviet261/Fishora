'use client';

import { Button } from '@/components/ui';
import { api } from '@/lib/client/api';
import { useGame } from '@/lib/client/GameProvider';
import { useAction } from '@/lib/client/useAction';
import { dropFood } from '@/lib/game/food';
import type { storageView } from '@/lib/game/snapshot';
import { useI18n } from '@/lib/i18n';
import { FoodIcon } from './icons';
import s from './Hud.module.css';

type StorageView = Awaited<ReturnType<typeof storageView>>;

/** Pellets for a feeding: a pinch per fed fish, within what the tank draws. */
export const pinchFor = (fed: number) => Math.min(24, 6 + fed * 3);

/**
 * One-click feeding for the signed-in tank: picks a food the player owns (the auto-feed food first, then one that
 * covers every fish, then the biggest stack), feeds through the server, and drops pellets into the water.
 */
export function FeedButton() {
  const { snapshot, open, say } = useGame();
  const { t } = useI18n();
  const { run, busy } = useAction();
  const fish = snapshot?.tankFish ?? [];

  const feed = async () => {
    if (fish.length === 0) return say(t('tank.empty'));
    const st = await api<StorageView>('GET', '/api/storage');
    if (!st.ok) return say(t('toast.serverError'));
    const foods = st.data.stacks.filter((x) => x.category === 'food' && x.qty > 0);
    if (foods.length === 0) {
      say(t('tank.noFood'));
      return open('shop');
    }
    const need = fish.reduce((n, f) => n + f.foodUnitsPerFeed, 0);
    const food =
      foods.find((f) => f.itemKey === snapshot?.tank.autoFeedItemKey) ?? foods.find((f) => f.qty >= need) ?? [...foods].sort((a, b) => b.qty - a.qty)[0];
    const r = await run<{ fedIds: string[]; skippedIds: string[] }>('POST', '/api/tank/feed', { itemKey: food.itemKey }, (d) =>
      d.skippedIds.length ? t('feed.result', { fed: d.fedIds.length, skipped: d.skippedIds.length }) : t('feed.done', { n: d.fedIds.length }),
    );
    if (r.ok && r.data.fedIds.length > 0) dropFood(pinchFor(r.data.fedIds.length));
  };

  return (
    <Button variant="stacked" tone="butter" className={s.feedButton} disabled={busy} onClick={feed}>
      <FoodIcon size={30} />
      <span>{t('tank.feed')}</span>
    </Button>
  );
}
