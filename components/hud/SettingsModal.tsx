'use client';

import { Button, Divider, Panel, SectionTitle } from '@/components/ui';
import { LOCALES, useI18n } from '@/lib/i18n';
import s from './Hud.module.css';

/** Settings dialog. For now it only holds the language picker. */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t, locale, setLocale } = useI18n();

  return (
    <div className={s.backdrop} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <Panel
        tone="cream"
        className={s.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.settings')}
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle>{t('nav.settings')}</SectionTitle>
        <Divider />
        <p className={s.fieldLabel} id="lang-label">
          {t('settings.language')}
        </p>
        <div className={s.langList} role="radiogroup" aria-labelledby="lang-label">
          {LOCALES.map((l) => {
            const selected = l.code === locale;
            return (
              <Button
                key={l.code}
                role="radio"
                aria-checked={selected}
                tone={selected ? 'mint' : 'cream'}
                className={s.langOption}
                lang={l.code}
                onClick={() => setLocale(l.code)}
              >
                <span className={s.radioDot} data-checked={selected} aria-hidden />
                {l.label}
              </Button>
            );
          })}
        </div>
        <Divider />
        <p className={s.fieldLabel}>{t('settings.credits')}</p>
        <p className={s.credit}>
          <a href="https://sketchfab.com/3d-models/betta-splendens-f4eeb7f50ad24873842bd954ad27d23b" target="_blank" rel="noreferrer">
            &ldquo;Betta Splendens&rdquo;
          </a>{' '}
          by{' '}
          <a href="https://sketchfab.com/BlueMesh" target="_blank" rel="noreferrer">
            BlueMesh
          </a>
          ,{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
          . Cleaned up and converted by AiZity.
        </p>
        <Divider />
        <Button tone="sky" onClick={onClose} autoFocus>
          {t('common.close')}
        </Button>
      </Panel>
    </div>
  );
}
