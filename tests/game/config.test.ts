import { prisma } from '@/lib/db';
import { loadConfig } from '@/lib/game/config';
import { dayKey, nextDayBoundary } from '@/lib/game/tx';
import { seedTestContent, TEST_CONTENT } from '../fixtures/content';

beforeAll(seedTestContent);
afterAll(() => prisma.$disconnect());

test('loadConfig returns the test profile', async () => {
  const cfg = await loadConfig(prisma);
  expect(cfg.care.tickMinutes).toBe(TEST_CONTENT.config.care.tickMinutes);
  expect(cfg.starter).toEqual(TEST_CONTENT.config.starter);
});

test('a missing section throws config_missing:<key>', async () => {
  await expect(loadConfig(prisma, 'no_such_profile')).rejects.toThrow('config_missing:time');
});

test('dayKey splits at midnight in the game timezone', () => {
  expect(dayKey(new Date('2026-10-22T16:59:59Z'), 'Asia/Ho_Chi_Minh', 0)).toBe('2026-10-22');
  expect(dayKey(new Date('2026-10-22T17:00:00Z'), 'Asia/Ho_Chi_Minh', 0)).toBe('2026-10-23');
});

test('dayKey honours a reset hour', () => {
  expect(dayKey(new Date('2026-10-22T21:59:59Z'), 'Asia/Ho_Chi_Minh', 5)).toBe('2026-10-22');
  expect(dayKey(new Date('2026-10-22T22:00:00Z'), 'Asia/Ho_Chi_Minh', 5)).toBe('2026-10-23');
});

test('nextDayBoundary is the next reset instant', () => {
  expect(nextDayBoundary(new Date('2026-10-22T10:00:00Z'), 'Asia/Ho_Chi_Minh', 0).toISOString()).toBe('2026-10-22T17:00:00.000Z');
  expect(nextDayBoundary(new Date('2026-10-22T17:00:00Z'), 'Asia/Ho_Chi_Minh', 0).toISOString()).toBe('2026-10-23T17:00:00.000Z');
});
