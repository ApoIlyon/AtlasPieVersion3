import { test, expect } from '@playwright/test';

test.describe('App shell smoke', () => {
  test('loads dashboard shell with status widgets', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('banner').getByRole('heading', { name: 'Pie Menu Studio' })).toBeVisible();
    await expect(page.getByRole('banner').getByText('AutoHotPie Tauri')).toBeVisible();
    await expect(page.getByTestId('status-last-check')).toBeVisible();
  });
});
