import { expect, test, type Page } from '@playwright/test';
import { dock, newPlayer, openGame } from './helpers';

/**
 * Plays like a perfect angler: once the reel starts, holds the button and keeps the cursor on the moving target
 * (read from the track's data attribute). Synthetic pointer events on the input layer, the same path a mouse takes.
 */
async function startReelBot(page: Page) {
  await page.evaluate(() => {
    const input = () => document.querySelector('[data-testid=fishing-input]');
    const fire = (type: string, x: number, y: number) =>
      input()?.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, isPrimary: true }));
    let down = false;
    const id = window.setInterval(() => {
      const track = document.querySelector<HTMLElement>('[data-testid=reel-track]');
      if (track) {
        const r = track.getBoundingClientRect();
        const x = r.left + Number(track.dataset.center) * r.width;
        if (!down) fire('pointerdown', x, r.top + 200);
        down = true;
        fire('pointermove', x, r.top + 200);
      } else if (down) {
        fire('pointerup', 10, 10);
        down = false;
      }
    }, 25);
    window.setTimeout(() => window.clearInterval(id), 90_000);
  });
}

async function storageFishCount(page: Page) {
  const res = await page.request.get('/api/storage');
  return ((await res.json()) as { fish: unknown[] }).fish.length;
}

test('home → /fishing; cast, reel, reveal the card; the catch survives a refresh and returns to shore once', async ({ page }) => {
  await newPlayer(page);
  await page.request.post('/api/dev/seed', { data: { fishingKit: { bait: 5 } } });
  await openGame(page);

  await dock(page).getByRole('button', { name: 'Fishing' }).click();
  await expect(page).toHaveURL(/\/fishing$/, { timeout: 120_000 }); // the first visit compiles the route in dev
  await expect(page.getByText('Choose a map')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /Test pond/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Lands up to Epic')).toBeVisible();
  await page.getByRole('button', { name: 'Start fishing' }).click();

  // Hold to charge, release to cast.
  const layer = page.getByTestId('fishing-input');
  await expect(page.getByText('Hold the mouse button to charge, release to cast')).toBeVisible({ timeout: 60_000 });
  const box = (await layer.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByRole('meter', { name: 'Power' })).toBeVisible();
  await page.mouse.up();
  await expect(page.getByText('Waiting for a bite…')).toBeVisible();
  await expect(page.getByText('Bait: 4')).toBeVisible();

  await startReelBot(page);
  const card = page.getByRole('button', { name: 'Click to reveal' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.click();
  await expect(page.getByRole('dialog', { name: 'Test Guppy' })).toContainText('Value:');
  await page.getByRole('button', { name: 'Keep fishing' }).click();

  // Refresh: the unfinished state is gone, the caught fish is still carried.
  await page.reload();
  await expect(page.getByText(/Carrying 1 fish/)).toBeVisible({ timeout: 60_000 });
  expect(await storageFishCount(page)).toBe(0);

  await page.getByRole('button', { name: 'Return to shore' }).click();
  await page.getByRole('button', { name: 'Bring them home' }).click();
  await expect(page.getByText(/Carrying 0 fish/)).toBeVisible();
  expect(await storageFishCount(page)).toBe(1);

  // Retrying the return can't bring it home twice.
  const again = await page.request.post('/api/fishing/return', { data: {}, headers: { 'idempotency-key': crypto.randomUUID() } });
  expect(again.status()).toBe(409);
  expect(await storageFishCount(page)).toBe(1);
});

test('without bait the session cannot start and no attempt is made', async ({ page }) => {
  await newPlayer(page);
  await page.request.post('/api/dev/seed', { data: { fishingKit: { bait: 0 } } });
  await page.goto('/fishing');
  await expect(page.getByText('You need bait')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Start fishing' })).toBeDisabled();
  const direct = await page.request.post('/api/fishing/attempts', { data: { zoneKey: 't_pond' }, headers: { 'idempotency-key': crypto.randomUUID() } });
  expect(await direct.json()).toEqual({ error: 'no_bait' });
});
