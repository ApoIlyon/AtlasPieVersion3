import { test, expect } from '@playwright/test';

test.describe('US3 - Import/Export negative scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Enable desktop UI
      (window as unknown as { __TAURI__?: Record<string, never> }).__TAURI__ = {};
    });
  });

  async function openSettings(page: import('@playwright/test').Page) {
    await page.goto('/');
    const settingsButton = page.getByRole('button', { name: 'Settings' });
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();
    await expect(page.getByRole('heading', { name: 'Import bundle' })).toBeVisible();
  }

  test('shows disabled state when input is empty', async ({ page }) => {
    await openSettings(page);

    const importButton = page.getByRole('button', { name: 'Import bundle' });
    await expect(importButton).toBeVisible();
    await expect(importButton).toBeDisabled();
  });

  test('renders error banner on backend import failure', async ({ page }) => {
    await openSettings(page);

    // Stub store import to fail
    await page.evaluate(() => {
      const win = window as unknown as {
        __AUTOHOTPIE_IMPORTEXPORT_STORE__?: {
          setState: (state: any) => void;
          getState: () => any;
        };
      };
      const store = win.__AUTOHOTPIE_IMPORTEXPORT_STORE__;
      if (!store) return;
      const original = store.getState().importBundle;
      store.setState({
        importBundle: async () => {
          store.setState({ error: 'Schema validation failed: profiles[] missing' });
          throw new Error('Schema validation failed: profiles[] missing');
        },
      });
      // keep a reference if needed later
      (window as any).__ORIG_IMPORT__ = original;
    });

    // Provide some JSON to enable the button
    const textarea = page.getByPlaceholder('Paste bundle JSON here or use the file picker');
    await textarea.fill('{"not":"valid bundle"}');

    const importButton = page.getByRole('button', { name: 'Import bundle' });
    await expect(importButton).toBeEnabled();
    await importButton.click();

    const errorBanner = page.getByText('Schema validation failed: profiles[] missing');
    await expect(errorBanner).toBeVisible();
  });
});



