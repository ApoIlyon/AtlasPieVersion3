import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __AUTOHOTPIE_LOCALIZATION_STORE__?: {
      getState: () => {
        missingKeys: string[];
        runtimeMissingKeys: string[];
        error: string | null;
      };
      setState: (state: Partial<{
        missingKeys: string[];
        runtimeMissingKeys: string[];
        error: string | null;
      }>) => void;
    };
  }
}

async function resetLocalizationStore(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const store = window.__AUTOHOTPIE_LOCALIZATION_STORE__;
    store?.setState({ missingKeys: [], runtimeMissingKeys: [], error: null });
  });
}

test.describe('Localization negative cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__AUTOHOTPIE_LOCALIZATION_STORE__));
    await resetLocalizationStore(page);
  });

  test('bad pack surfaces missing/runtime badges', async ({ page }) => {
    await page.evaluate(() => {
      const store = window.__AUTOHOTPIE_LOCALIZATION_STORE__;
      store?.setState({
        missingKeys: ['settings.autostart.status.enabled', 'settings.autostart.status.disabled'],
        runtimeMissingKeys: ['header.title'],
      });
    });

    const missingBadge = page.getByTestId('localization-missing-badge');
    await expect(missingBadge).toBeVisible();
    await expect(missingBadge).toContainText('2');

    const runtimeBadge = page.getByTestId('localization-runtime-badge');
    await expect(runtimeBadge).toBeVisible();
    await expect(runtimeBadge).toContainText('1');
  });

  test('schema mismatch triggers error affordance', async ({ page }) => {
    await page.evaluate(() => {
      const store = window.__AUTOHOTPIE_LOCALIZATION_STORE__;
      store?.setState({ error: 'Schema mismatch detected' });
    });

    const errorButton = page.getByTestId('localization-error-button');
    await expect(errorButton).toBeVisible();
    await expect(errorButton).toHaveText(/Failed to load localization/i);
  });

  test('error affordance clears store error', async ({ page }) => {
    await page.evaluate(() => {
      const store = window.__AUTOHOTPIE_LOCALIZATION_STORE__;
      store?.setState({ error: 'Simulated failure' });
    });

    const errorButton = page.getByTestId('localization-error-button');
    await expect(errorButton).toBeVisible();
    await errorButton.click();

    await expect(errorButton).not.toBeVisible();
  });
});
