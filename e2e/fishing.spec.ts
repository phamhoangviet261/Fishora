import { expect, test, type Page } from '@playwright/test';
import { dock, drawer, newPlayer, openGame, state } from './helpers';

/** Buys rod, line, hook, cooler and bait, equips them, unlocks the test pond and starts a trip there. */
async function gearUpAndGo(page: Page) {
  await dock(page).getByRole('button', { name: 'Shop' }).click();
  const shop = drawer(page, 'Shop');
  await shop.getByRole('tab', { name: 'Items & gear' }).click();
  for (const name of ['Test rod', 'Test line', 'Test hook', 'Test cooler', 'Test bait']) {
    const row = shop.getByRole('listitem').filter({ hasText: name });
    if (name === 'Test bait') await row.getByRole('spinbutton').fill('10');
    await row.getByRole('button', { name: /Buy/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Bought' })).toBeVisible();
  }

  await dock(page).getByRole('button', { name: 'Fishing' }).click();
  const fishing = drawer(page, 'Fishing');
  await fishing.getByRole('tab', { name: 'Gear' }).click();
  for (const [label, option] of [['Rod', 'Test rod'], ['Line', 'Test line'], ['Hook', 'Test hook'], ['Cooler', 'Test cooler'], ['Bait', 'Test bait']]) {
    const select = fishing.getByLabel(label, { exact: true });
    await select.selectOption({ label: (await select.locator('option', { hasText: option }).first().textContent())! });
    await expect(select).not.toHaveValue('');
  }
  await fishing.getByRole('tab', { name: 'Spots' }).click();
  const pond = fishing.getByRole('listitem').filter({ hasText: 'Test pond' });
  await pond.getByRole('button', { name: /Unlock/ }).click();
  await pond.getByRole('button', { name: 'Go fishing' }).click();
  return page.getByRole('dialog', { name: 'Fishing · Test pond' });
}

// Spec §14: fish → bring the catch home → storage capacity is enforced.
test('a catch that does not fit in storage must be released before going home', async ({ page }) => {
  await newPlayer(page);
  await page.request.post('/api/dev/seed', { data: { coins: 1000, fillStorageGrams: 9990 } });
  await openGame(page);

  const trip = await gearUpAndGo(page);
  await trip.getByRole('button', { name: 'Cast' }).click();
  await expect(trip.getByRole('status')).toContainText('Caught Test Guppy');
  await expect(trip.getByText('Bait: 9')).toBeVisible();

  await trip.getByRole('button', { name: 'Return home' }).click();
  const ret = page.getByRole('dialog', { name: 'Return home' });
  await expect(ret.getByText(/Release .* kg more to fit/)).toBeVisible();
  await expect(ret.getByRole('button', { name: 'Bring them home' })).toBeDisabled();

  const before = (await state(page)).player.coins;
  await ret.getByRole('checkbox').first().uncheck();
  await ret.getByRole('button', { name: 'Bring them home' }).click();
  await expect(drawer(page, 'Storage')).toBeVisible();
  // Only the seeded filler is in storage; the guppy was released for 25% of its value.
  await expect(drawer(page, 'Storage').getByRole('listitem').filter({ hasText: 'Test Guppy' })).toHaveCount(0);
  expect((await state(page)).player.coins).toBeGreaterThanOrEqual(before);
});

test('closing the game mid-trip loses the catch', async ({ page }) => {
  await newPlayer(page);
  await page.request.post('/api/dev/seed', { data: { coins: 1000 } });
  await openGame(page);

  const trip = await gearUpAndGo(page);
  await trip.getByRole('button', { name: 'Cast' }).click();
  await expect(trip.getByRole('status')).toContainText('Caught Test Guppy');

  await openGame(page); // reload = the old page is gone
  await dock(page).getByRole('button', { name: 'Collection' }).click();
  const col = drawer(page, 'Collection');
  await col.getByRole('tab', { name: 'Every fish' }).click();
  await col.getByRole('button', { name: 'Left behind', exact: true }).click();
  await expect(col.getByRole('listitem').filter({ hasText: 'Test Guppy' })).toHaveCount(1);
});
