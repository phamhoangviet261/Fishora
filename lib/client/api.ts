// Browser side of the game API. Every mutation carries an Idempotency-Key; a network failure is retried once with
// the same key, so the server applies it at most once.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; detail?: unknown };
export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function api<T>(method: Method, path: string, body?: unknown, opts: { key?: string } = {}): Promise<Result<T>> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['idempotency-key'] = opts.key ?? crypto.randomUUID();
  if (body !== undefined) headers['content-type'] = 'application/json';
  const init: RequestInit = { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' };

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(path, init);
    } catch {
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: data as T };
    const err = data as { error?: string; detail?: unknown };
    return err.detail === undefined ? { ok: false, error: err.error ?? `http_${res.status}` } : { ok: false, error: err.error ?? `http_${res.status}`, detail: err.detail };
  }
  return { ok: false, error: 'network' };
}
