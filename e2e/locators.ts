import type { Page } from '@playwright/test';

/** One of the dashboard's metric tiles, found by its label. */
export function metricCard(page: Page, label: string) {
  return page.locator('[data-slot="card"]', { has: page.getByText(label, { exact: true }) });
}
