import { expect, test } from './fixtures';

test('signed out, the app sends you to log in and remembers where you were going', async ({ page }) => {
  await page.goto('/settings/notifications');

  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/settings/notifications');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('signed in, the login page hands you straight to your collection', async ({ page, signInAsAccount }) => {
  const { collectionId } = await signInAsAccount();

  await page.goto('/login');

  await expect(page).toHaveURL(`/c/${collectionId}/dashboard`);
});
