import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

/** A fresh account on the test content, signed in through the API (cookies land in the page's context). */
export async function newPlayer(page: Page) {
  expect((await page.request.post('/api/dev/seed', { data: {} })).ok()).toBe(true);
  const email = `e2e+${randomUUID().slice(0, 8)}@fishora.test`;
  const res = await page.request.post('/api/auth/register', { data: { email, password: `pw-${randomUUID()}` } });
  expect(res.status()).toBe(201);
  return email;
}

/** Loads the game and waits for the signed-in HUD (the dock appears once the scene is ready). */
export async function openGame(page: Page) {
  await page.goto('/');
  await expect(dock(page).getByRole('button', { name: 'Shop' })).toBeVisible({ timeout: 120_000 });
}

export const dock = (page: Page) => page.getByRole('navigation', { name: 'Game menu' });
export const drawer = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });

export async function state(page: Page) {
  const res = await page.request.get('/api/state');
  expect(res.ok()).toBe(true);
  return (await res.json()) as { player: { coins: number }; tankFish: { id: string; name: string; weightGrams: number }[]; counts: { pendingClaims: number } };
}
