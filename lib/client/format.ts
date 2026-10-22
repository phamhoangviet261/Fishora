import type { Translate } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n';

/** Grams as kg with up to 2 decimals. */
export const kg = (grams: number) => (grams / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Player-facing text for an API error code (storage_full spells out the kg it needs). */
export function errorText(t: Translate, error: string, detail?: unknown): string {
  if (error === 'storage_full' && detail && typeof detail === 'object' && 'needGrams' in detail) {
    const d = detail as { needGrams: number; freeGrams: number };
    return t('error.storage_full_detail', { need: kg(d.needGrams), free: kg(d.freeGrams) });
  }
  const key = `error.${error}` as MessageKey;
  const msg = t(key);
  return msg === key ? t('error.generic') : msg;
}

export const rarityStatus = { common: undefined, uncommon: 'good', rare: 'info', epic: 'warn', legendary: 'bad' } as const;
