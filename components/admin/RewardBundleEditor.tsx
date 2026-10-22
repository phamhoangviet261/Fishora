'use client';

import { Button } from '@/components/ui';
import type { RewardBundle } from '@/lib/game/types';
import s from './admin.module.css';

/** Coins, EXP and any number of items. */
export function RewardBundleEditor({ value, onChange }: { value: RewardBundle; onChange: (b: RewardBundle) => void }) {
  const items = value.items ?? [];
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  return (
    <div className={s.form}>
      <label>
        Coins
        <input className={s.input} type="number" min={0} value={value.coins ?? 0} onChange={(e) => onChange({ ...value, coins: num(e.target.value) })} />
      </label>
      <label>
        EXP
        <input className={s.input} type="number" min={0} value={value.exp ?? 0} onChange={(e) => onChange({ ...value, exp: num(e.target.value) })} />
      </label>
      {items.map((it, i) => (
        <div key={i} className={s.toolbar}>
          <input
            className={s.input}
            aria-label="Item key"
            placeholder="item key"
            value={it.itemKey}
            onChange={(e) => onChange({ ...value, items: items.map((x, j) => (j === i ? { ...x, itemKey: e.target.value } : x)) })}
          />
          <input
            className={s.input}
            aria-label="Quantity"
            type="number"
            min={1}
            value={it.qty}
            onChange={(e) => onChange({ ...value, items: items.map((x, j) => (j === i ? { ...x, qty: Math.max(1, num(e.target.value)) } : x)) })}
          />
          <Button onClick={() => onChange({ ...value, items: items.filter((_, j) => j !== i) })}>Remove</Button>
        </div>
      ))}
      <div>
        <Button onClick={() => onChange({ ...value, items: [...items, { itemKey: '', qty: 1 }] })}>Add item</Button>
      </div>
    </div>
  );
}
