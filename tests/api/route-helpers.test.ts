import { gameRoute, idempotencyKeyOf } from '@/lib/api';
import { GameError } from '@/lib/game/tx';

test('gameRoute maps a GameError to its status and code', async () => {
  const res = await gameRoute(async () => {
    throw new GameError('storage_full', 409, { needGrams: 5 });
  })();
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: 'storage_full', detail: { needGrams: 5 } });
});

test('idempotencyKeyOf requires a short header', () => {
  expect(idempotencyKeyOf(new Request('http://x', { method: 'POST' }))).toBeNull();
  expect(idempotencyKeyOf(new Request('http://x', { method: 'POST', headers: { 'idempotency-key': 'k'.repeat(101) } }))).toBeNull();
  expect(idempotencyKeyOf(new Request('http://x', { method: 'POST', headers: { 'idempotency-key': 'abc' } }))).toBe('abc');
});
