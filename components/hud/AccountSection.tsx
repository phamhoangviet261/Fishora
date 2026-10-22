'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useI18n, type MessageKey } from '@/lib/i18n';
import s from './Hud.module.css';

type Tx = { id: string; amount: number; reason: string; createdAt: string };

/** Login / register form when signed out; account email, recent coin history and logout when signed in. */
export function AccountSection() {
  const { t, locale } = useI18n();
  const { user, error, login, register, logout } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Tx[] | null>(null);

  useEffect(() => {
    if (!user) return setHistory(null);
    fetch('/api/wallet/transactions?limit=5')
      .then((r) => (r.ok ? r.json() : { transactions: [] }))
      .then((d) => setHistory(d.transactions))
      .catch(() => setHistory([]));
  }, [user]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await (mode === 'login' ? login : register)(email, password);
    setBusy(false);
    if (ok) setPassword('');
  };

  if (user) {
    const fmt = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });
    return (
      <section className={s.account}>
        <p className={s.fieldLabel}>{t('account.title')}</p>
        <p className={s.accountEmail}>{t('account.signedInAs', { email: user.email })}</p>
        {history && history.length > 0 && (
          <ul className={s.txList} aria-label={t('account.history')}>
            {history.map((tx) => (
              <li key={tx.id}>
                <span>{t(`account.reason.${tx.reason}` as MessageKey)}</span>
                <span className={tx.amount < 0 ? s.txMinus : s.txPlus}>{tx.amount > 0 ? `+${tx.amount}` : tx.amount}</span>
                <time dateTime={tx.createdAt}>{fmt.format(new Date(tx.createdAt))}</time>
              </li>
            ))}
          </ul>
        )}
        <Button tone="coral" onClick={logout}>
          {t('account.logout')}
        </Button>
      </section>
    );
  }

  return (
    <form className={s.account} onSubmit={onSubmit} noValidate>
      <p className={s.fieldLabel}>{t('account.title')}</p>
      <label className={s.input}>
        <span>{t('account.email')}</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className={s.input}>
        <span>{t('account.password')}</span>
        <input
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && (
        <p className={s.formError} role="alert">
          {t(`account.error.${error}` as MessageKey)}
        </p>
      )}
      <Button type="submit" tone="mint" disabled={busy}>
        {t(mode === 'login' ? 'account.login' : 'account.register')}
      </Button>
      <button type="button" className={s.linkButton} onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {t(mode === 'login' ? 'account.switchToRegister' : 'account.switchToLogin')}
      </button>
    </form>
  );
}
