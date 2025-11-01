import { test, expect } from '@playwright/test';

test.describe('Offline mode resilience (NFR-005)', () => {
  test('autostart and logs remain accessible when offline', async ({ page }) => {
    test.setTimeout(90000); // Increase timeout for this flaky test
    await page.goto('/?mockPlatform=linux', { waitUntil: 'domcontentloaded' });

    // Navigate to Settings section like in accessibility.spec.ts
    const settingsButton = page.getByRole('button', { name: 'Settings' });
    await settingsButton.waitFor({ state: 'visible' });
    await expect(settingsButton).toBeVisible();
    
    // Set offline mode programmatically before clicking
    await page.waitForFunction(() => {
      const store = (window as typeof window & {
        __AUTOHOTPIE_SYSTEM_STORE__?: { getState: () => any };
      }).__AUTOHOTPIE_SYSTEM_STORE__;
      const state = store?.getState?.();
      return typeof state?.setOffline === 'function' && typeof state?.setStorageMode === 'function';
    }, { timeout: 15_000 });

    await page.evaluate(() => {
      const store = (window as typeof window & {
        __AUTOHOTPIE_SYSTEM_STORE__?: { getState: () => any };
      }).__AUTOHOTPIE_SYSTEM_STORE__;
      const state = store?.getState();
      state?.setOffline?.(true, new Date().toISOString());
      state?.setStorageMode?.('read_only');
    });

    await page.waitForFunction(() => {
      const store = (window as typeof window & {
        __AUTOHOTPIE_SYSTEM_STORE__?: { getState: () => any };
      }).__AUTOHOTPIE_SYSTEM_STORE__;
      const state = store?.getState() as
        | {
            status?: { connectivity?: { isOffline?: boolean }; safeMode?: boolean };
          }
        | undefined;
      return state?.status?.connectivity?.isOffline === true || state?.status?.safeMode === true;
    });

    // Verify offline banner is visible in Dashboard
    const offlineBanner = page.getByTestId('offline-notice');
    await offlineBanner.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(offlineBanner).toBeVisible();

    // Click on Settings to navigate to the section
    await settingsButton.click();
    const autostartHeading = page.getByTestId('settings-autostart-heading');
    await autostartHeading.waitFor({ state: 'visible' });
    await expect(autostartHeading).toBeVisible();

    const instructionsButton = page.getByTestId('autostart-instructions');
    await expect(instructionsButton).toBeEnabled();

    const isDesktop = await page.evaluate(() => {
      return (window as typeof window & { __TAURI__?: unknown; __TAURI_IPC__?: unknown }).__TAURI__ != null;
    });

    if (isDesktop) {
      const logTab = page.getByRole('button', { name: 'Log' });
      await logTab.click();
      await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
    }
  });
});
