import { addDays, format } from 'date-fns';

import { expect, test } from './fixtures';

function everySubExport(now: Date): string {
  const soon = format(addDays(now, 10), 'yyyy-MM-dd');
  const later = format(addDays(now, 40), 'yyyy-MM-dd');

  return [
    'name,collection,status,category,icon_ref,cost_amount_cents,cost_frequency,next_invoice_date,deactivated_at',
    `Figma,Personal,active,Design,figma.com,1500,monthly,${soon},`,
    `Adobe Creative Cloud,Personal,active,Design,adobe.com,59988,yearly,${later},`,
  ].join('\n');
}

test('an EverySub export is reviewed row by row and then lands on the table', async ({ page, signInAsAccount }) => {
  const { collectionId } = await signInAsAccount();

  await page.goto(`/c/${collectionId}/subscriptions`);
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Import subscriptions to Personal' });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'everysub-export.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(everySubExport(new Date())),
  });

  // Review: both rows parsed, selected, and ready to import.
  await expect(dialog.getByRole('row', { name: /Figma/ })).toBeVisible();
  await expect(dialog.getByRole('row', { name: /Adobe Creative Cloud/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Import 2 subscriptions' }).click();
  await expect(dialog).toBeHidden();

  // "Design" isn't a starter category, so the import created it.
  await expect(page.getByText('Imported 2 subscriptions · 1 new category')).toBeVisible();
  await expect(page.getByRole('row', { name: /Figma/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Adobe Creative Cloud/ })).toBeVisible();
});
