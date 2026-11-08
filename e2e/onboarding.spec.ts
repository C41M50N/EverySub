import { expect, test } from './fixtures';
import { metricCard } from './locators';

test('a first visit sets up the account, adds a subscription, and ends on the dashboard', async ({
  page,
  signInAsNewUser,
}) => {
  await signInAsNewUser();

  // An account without a collection gets its Personal collection on the way in.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/c\/[^/]+\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Let’s add up what you pay for.' })).toBeVisible();

  // Quick add opens the form with the service filled in.
  await page.getByRole('button', { name: 'Add Netflix' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add subscription' });
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Netflix');
  await dialog.getByLabel('Cost').fill('15.49');
  await dialog.getByRole('button', { name: 'Add subscription', exact: true }).click();
  await expect(dialog).toBeHidden();

  // The save shows up in the quick-add list and the preview metrics.
  await expect(page.getByRole('heading', { name: 'Nice start. What else do you pay for?' })).toBeVisible();
  await expect(page.getByText('Added · $15.49')).toBeVisible();
  await expect(metricCard(page, 'Monthly cost')).toContainText('$15.49');

  await page.getByRole('button', { name: 'See your dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(metricCard(page, 'Monthly cost')).toContainText('$185.88 per year');
  await expect(metricCard(page, 'Active subscriptions').getByText('1', { exact: true })).toBeVisible();

  // Onboarding finished on the server, not just in this tab.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
