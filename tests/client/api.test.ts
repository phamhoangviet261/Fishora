import { api } from '@/lib/client/api';

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('a mutation sends an Idempotency-Key and JSON body', async () => {
  const fetchMock = vi.fn(async () => reply(200, { ok: 1 }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await api('POST', '/api/x', { a: 1 })).toEqual({ ok: true, data: { ok: 1 } });
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  const headers = new Headers(init.headers);
  expect(headers.get('idempotency-key')).toMatch(/[0-9a-f-]{36}/);
  expect(init.body).toBe('{"a":1}');
});

test('a network failure is retried once with the same key', async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(reply(200, {}));
  vi.stubGlobal('fetch', fetchMock);
  expect((await api('POST', '/api/x', {})).ok).toBe(true);
  const keys = fetchMock.mock.calls.map(([, init]) => new Headers((init as RequestInit).headers).get('idempotency-key'));
  expect(keys[0]).toBe(keys[1]);
});

test('an error response maps to its code and detail', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(409, { error: 'storage_full', detail: { needGrams: 5 } })));
  expect(await api('POST', '/api/x', {})).toEqual({ ok: false, error: 'storage_full', detail: { needGrams: 5 } });
});

test('GET sends no key and two failures report network', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
  vi.stubGlobal('fetch', fetchMock);
  expect(await api('GET', '/api/x')).toEqual({ ok: false, error: 'network' });
  expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('idempotency-key')).toBeNull();
});
