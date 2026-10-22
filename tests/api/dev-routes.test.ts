import { POST as advance } from '@/app/api/dev/advance/route';
import { POST as seed } from '@/app/api/dev/seed/route';

const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

test('dev routes do not exist unless FISHORA_E2E=1', async () => {
  delete process.env.FISHORA_E2E;
  expect((await advance(post({ hours: 1 }))).status).toBe(404);
  expect((await seed(post({}))).status).toBe(404);
});

test('the dev seed only accepts its own small option set', async () => {
  const { parseSeedOptions } = await import('@/app/api/dev/seed/options');
  expect(parseSeedOptions({ coins: 1000, fillStorageGrams: 9990 })).toEqual({ coins: 1000, fillStorageGrams: 9990 });
  expect(parseSeedOptions({})).toEqual({});
  expect(parseSeedOptions({ coins: -1 })).toBeNull();
  expect(parseSeedOptions(null)).toEqual({});
});
