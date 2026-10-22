import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { I18nProvider } from '@/lib/i18n';
import s from '@/components/admin/admin.module.css';

export const dynamic = 'force-dynamic';

/** Admin-only: everyone else gets a 404, so the pages don't advertise themselves. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const row = user && (await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } }));
  if (!user || row?.role !== 'admin') notFound();
  return (
    <div className={s.page}>
      <header className={s.header}>
        <strong>Fishora admin</strong>
        <nav className={s.nav}>
          <Link href="/admin">Species</Link>
          <Link href="/admin/milestones">Milestones</Link>
          <Link href="/admin/history">History</Link>
          <Link href="/">Game</Link>
        </nav>
        <span className={s.muted}>{user.email}</span>
      </header>
      {/* The shared UI kit (dialogs) reads its button labels from i18n. */}
      <I18nProvider>
        <main className={s.main}>{children}</main>
      </I18nProvider>
    </div>
  );
}
