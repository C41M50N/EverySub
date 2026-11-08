import { expect, test } from './fixtures';
import { metricCard } from './locators';

test('a new subscription shows up on the table and in the dashboard totals', async ({ page, signInAsAccount }) => {
  const { collectionId } = await signInAsAccount({ tracking: [{ name: 'Spotify', costAmount: 1099 }] });

  // Visit the dashboard first so its cached totals have to be invalidated.
  await page.goto(`/c/${collectionId}/dashboard`);
  await expect(metricCard(page, 'Monthly cost')).toContainText('$10.99');

  await page.getByRole('link', { name: 'Subscriptions' }).click();
  await expect(page.getByRole('row', { name: /Spotify/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add subscription', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add subscription' });
  await dialog.getByLabel('Icon').click();
  await page.getByPlaceholder('Search brands or enter a domain').fill('notion.so');
  await page.getByRole('button', { name: 'Use “notion.so”' }).click();
  await dialog.getByLabel('Name', { exact: true }).fill('Notion');
  // Typed key by key, as the combobox filters on each keystroke and highlights
  // the one match. Enter before the highlight would submit the form instead.
  const category = dialog.getByLabel('Category');
  await category.pressSequentially('Productivity');
  await expect(page.locator('[role="option"][data-highlighted]')).toHaveText('Productivity');
  await category.press('Enter');
  await expect(category).toHaveValue('Productivity');
  await dialog.getByLabel('Cost').fill('8');
  await dialog.getByRole('button', { name: 'Add subscription', exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText('Added “Notion”')).toBeVisible();
  await expect(page.getByRole('row', { name: /Notion/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Spotify/ })).toBeVisible();

  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(metricCard(page, 'Monthly cost')).toContainText('$18.99');
  await expect(metricCard(page, 'Monthly cost')).toContainText('$227.88 per year');
  await expect(metricCard(page, 'Active subscriptions').getByText('2', { exact: true })).toBeVisible();
});
