'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui';
import { kg } from '@/lib/client/format';
import type { CatchCard as Card } from '@/lib/game/fishing/machine';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { FishModel } from './FishModel';
import s from './fishing.module.css';

/** Sparkles around the card: angle (deg), distance from the centre (px), delay (s), size (px). */
const SPARKLES = Array.from({ length: 14 }, (_, i) => ({
  angle: (i / 14) * 360 + (i % 2) * 12,
  dist: 190 + (i % 3) * 28,
  delay: (i * 0.37) % 1.6,
  size: 14 + (i % 4) * 6,
}));

/**
 * The collectible card shown after a catch. Purely presentational: the fish was already stored by the server when
 * the reel was resolved, so flipping (or flipping twice, or closing) can never grant anything.
 */
export function CatchCard({ card, onClose }: { card: Card; onClose: () => void }) {
  const { t } = useI18n();
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={s.cardLayer} role="dialog" aria-modal="true" aria-label={card.name} data-rarity={card.rarity}>
      <div className={s.rays} aria-hidden />
      <div className={s.cardWrap}>
        <div className={s.sparkles} data-burst={flipped} aria-hidden>
          {SPARKLES.map((p, i) => (
            <span
              key={i}
              className={s.sparkle}
              style={{ '--a': `${p.angle}deg`, '--d': `${p.dist}px`, '--delay': `${p.delay}s`, '--size': `${p.size}px` } as CSSProperties}
            >
              ✦
            </span>
          ))}
        </div>
        <button
          type="button"
          className={s.card}
          data-rarity={card.rarity}
          data-flipped={flipped}
          aria-label={flipped ? card.name : t('fs.reveal')}
          onClick={() => setFlipped(true)}
          autoFocus
        >
          <span className={s.cardInner}>
            <span className={`${s.face} ${s.back}`}>
              <span className={s.backMark}>?</span>
              <span className={s.cardRarity}>{t(`rarity.${card.rarity}` as MessageKey)}</span>
              <span className={s.revealHint}>{t('fs.reveal')}</span>
            </span>
            <span className={`${s.face} ${s.front}`}>
              <span className={s.cardModel}>
                {flipped && (
                  <Canvas camera={{ position: [0, 0.1, 1.6], fov: 35 }} dpr={[1, 2]}>
                    <ambientLight intensity={1.2} />
                    <directionalLight position={[2, 3, 2]} intensity={1.5} />
                    <Suspense fallback={null}>
                      <FishModel modelKey={card.modelKey} size={0.55} spin={0.6} />
                    </Suspense>
                  </Canvas>
                )}
              </span>
              <span className={s.cardName}>{card.name}</span>
              <span className={s.cardRarity}>{t(`rarity.${card.rarity}` as MessageKey)}</span>
              <span className={s.meta}>{t('common.kg', { n: kg(card.weightGrams) })}</span>
              <strong className={s.cardValue}>{t('fs.value', { n: card.baseValue })}</strong>
            </span>
          </span>
        </button>
        {flipped && (
          <Button tone="mint" onClick={onClose}>
            {t('fs.continue')}
          </Button>
        )}
      </div>
    </div>
  );
}
