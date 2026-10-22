'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import s from './admin.module.css';

type Entry = {
  id: string;
  target: 'species' | 'milestone';
  ref: string;
  kind: string;
  before: unknown;
  after: unknown;
  affected: unknown;
  policy: string | null;
  createdAt: string;
  admin: string;
};

/** Every species and milestone change: who, when, before/after, and what it touched (spec §6.2, §6.4). */
export function ChangeLogTable() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Entry[]>('GET', '/api/admin/history').then((r) => (r.ok ? setRows(r.data) : setError(r.error)));
  }, []);
  if (error) return <p className={s.error}>{error}</p>;
  if (!rows) return <p className={s.muted}>Loading…</p>;
  return (
    <>
      <h1>Change history</h1>
      {rows.length === 0 && <p className={s.muted}>No changes yet.</p>}
      {rows.map((r) => (
        <section key={r.id} className={s.section}>
          <h2>
            {r.target} {r.ref} · {r.kind}
            {r.policy ? ` · pending: ${r.policy}` : ''}
          </h2>
          <p className={s.muted}>
            {new Date(r.createdAt).toLocaleString()} · {r.admin} · affected: {Array.isArray(r.affected) ? r.affected.length : 0}
          </p>
          <div className={s.diff}>
            <pre aria-label="Before">{r.before ? JSON.stringify(r.before, null, 2) : '—'}</pre>
            <pre aria-label="After">{r.after ? JSON.stringify(r.after, null, 2) : '—'}</pre>
          </div>
        </section>
      ))}
    </>
  );
}
