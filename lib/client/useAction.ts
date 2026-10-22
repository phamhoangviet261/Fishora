'use client';

import { useCallback, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Method, Result } from './api';
import { errorText } from './format';
import { useGame } from './GameProvider';

/** Runs a game action, toasting the error text on failure and an optional message on success. */
export function useAction() {
  const { act, say } = useGame();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(method: Method, path: string, body?: unknown, onOk?: (data: T) => string | void): Promise<Result<T>> => {
      setBusy(true);
      try {
        const r = await act<T>(method, path, body);
        if (r.ok) {
          const msg = onOk?.(r.data);
          if (msg) say(msg);
        } else {
          say(errorText(t, r.error, r.detail));
        }
        return r;
      } finally {
        setBusy(false);
      }
    },
    [act, say, t],
  );
  return { run, busy };
}
