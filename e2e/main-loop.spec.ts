import { expect, test } from '@playwright/test';
import { dock, drawer, newPlayer, openGame, state } from './helpers';

// Spec §14: buy a fish → move it into the tank → care for it → reach a milestone → sell it.
test('buy, raise, reach a milestone and sell a fish', async ({ page }) => {
  await newPlayer(page);
  await openGame(page);
  const start = (await state(page)).player.coins;

  // Buy a Test Guppy (50): it lands in storage first.
  await dock(page).getByRole('button', { name: 'Shop' }).click();
  const shop = drawer(page, 'Shop');
  await shop.getByRole('listitem').filter({ hasText: 'Test Guppy' }).getByRole('button', { name: /Buy/ }).click();
  await expect(page.getByRole('dialog', { name: 'Bought' })).toContainText('You got Test Guppy!');
  await page.getByRole('dialog', { name: 'Bought' }).getByRole('button', { name: 'Close', exact: true }).first().click();

  // Food (20 × 2) and the Care upgrade (50) so the tank feeds itself while the player is away.
  await shop.getByRole('tab', { name: 'Items & gear' }).click();
  const flakes = shop.getByRole('listitem').filter({ hasText: 'Test flakes' });
  await flakes.getByRole('spinbutton').fill('20');
  await flakes.getByRole('button', { name: /Buy/ }).click();
  await shop.getByRole('tab', { name: 'Upgrades' }).click();
  await shop.getByRole('listitem').filter({ hasText: 'Tank care' }).getByRole('button', { name: /Buy/ }).click();
  await expect.poll(async () => (await state(page)).player.coins).toBe(start - 50 - 40 - 50);

  // Storage → tank.
  await dock(page).getByRole('button', { name: 'Storage' }).click();
  await drawer(page, 'Storage').getByRole('listitem').filter({ hasText: 'Test Guppy' }).getByRole('button', { name: 'To tank' }).click();
  await expect.poll(async () => (await state(page)).tankFish.length).toBe(1);

  // Turn on auto-feed.
  await dock(page).getByRole('button', { name: 'Tank' }).click();
  const tank = drawer(page, 'Your tank');
  await tank.getByRole('tab', { name: 'Auto care' }).click();
  // Controlled by server state: it flips once the setting is saved.
  await tank.getByRole('checkbox').first().click();
  await expect(tank.getByRole('checkbox').first()).toBeChecked();

  // A day passes offline; the guppy grows past its 1 kg milestone.
  expect((await page.request.post('/api/dev/advance', { data: { hours: 24 } })).ok()).toBe(true);
  const grown = await state(page);
  expect(grown.tankFish[0].weightGrams).toBeGreaterThanOrEqual(1000);
  expect(grown.counts.pendingClaims).toBeGreaterThanOrEqual(2); // daily login + the milestone

  // Claim everything from the bell.
  await openGame(page);
  await page.getByRole('button', { name: /rewards waiting/ }).click();
  const rewards = drawer(page, 'Rewards');
  await rewards.getByRole('button', { name: 'Claim all' }).click();
  await expect(rewards).toContainText('Nothing to claim right now');
  const afterClaim = await state(page);
  expect(afterClaim.player.coins).toBeGreaterThan(start - 140);

  // Sell it from its detail drawer; the confirm shows the server's price and the balance moves by exactly that.
  await page.getByRole('button', { name: /Test Guppy/ }).first().click();
  const fish = drawer(page, 'Test Guppy');
  await fish.getByRole('button', { name: 'Sell', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Sell' });
  const price = Number((await confirm.textContent())?.match(/for (\d+) coins/)?.[1]);
  expect(price).toBeGreaterThan(0);
  await confirm.getByRole('button', { name: 'Sell', exact: true }).click();
  await expect.poll(async () => (await state(page)).player.coins).toBe(afterClaim.player.coins + price);
  expect((await state(page)).tankFish).toHaveLength(0);
});
