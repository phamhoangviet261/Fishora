'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Species } from '@prisma/client';
import { Button } from '@/components/ui';
import { api } from '@/lib/client/api';
import s from './admin.module.css';

type Filter = 'all' | 'active' | 'inactive' | 'deleted';

export function useSpecies() {
  const [species, setSpecies] = useState<Species[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => {
    const r = await api<Species[]>('GET', '/api/admin/species');
    if (r.ok) setSpecies(r.data);
    else setError(r.error);
  };
  useEffect(() => {
    void reload();
  }, []);
  return { species, error, reload };
}

export function SpeciesList() {
  const { species, error } = useSpecies();
  const [filter, setFilter] = useState<Filter>('all');
  if (error) return <p className={s.error}>{error}</p>;
  if (!species) return <p className={s.muted}>Loading…</p>;
  const shown = species.filter((x) =>
    filter === 'all' ? true : filter === 'deleted' ? !!x.deletedAt : filter === 'active' ? x.active && !x.deletedAt : !x.active && !x.deletedAt,
  );
  return (
    <>
      <h1>Species</h1>
      <div className={s.toolbar}>
        {(['all', 'active', 'inactive', 'deleted'] as const).map((f) => (
          <Button key={f} tone={filter === f ? 'butter' : 'cream'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f}
          </Button>
        ))}
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Key</th>
              <th>Name</th>
              <th>Rarity</th>
              <th>Max kg</th>
              <th>Price</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.key}>
                <td>
                  <Link href={`/admin/species/${encodeURIComponent(x.key)}`}>{x.key}</Link>
                </td>
                <td>{x.displayName}</td>
                <td>{x.rarity}</td>
                <td>{x.maxWeightGrams / 1000}</td>
                <td>{x.buyPrice ?? '—'}</td>
                <td>{x.deletedAt ? 'deleted' : x.active ? 'active' : 'inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
