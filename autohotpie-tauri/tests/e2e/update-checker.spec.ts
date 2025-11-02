import { expect, test } from '@playwright/test';

test.describe('US3 - Updates flow', () => {
  test('shows cached status, refreshes from GitHub and surfaces offline fallback', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      const app = window as typeof window & {
        __AUTOHOTPIE_MOCKS__?: {
          updates?: {
            seed(status: unknown): void;
            next(status: unknown): void;
            fail(message: string): void;
            openCalls: string[];
          };
        };
      };

      const seedStatus = {
        currentVersion: '0.9.0',
        latestVersion: '1.0.0',
        isUpdateAvailable: true,
        downloadUrl: 'https://example.com/v1.0.0/download',
        releaseNotes: 'Initial release',
        lastChecked: '2025-10-28T10:00:00Z',
        error: null,
      };
      const refreshedStatus = {
        currentVersion: '0.9.0',
        latestVersion: '1.1.0',
        isUpdateAvailable: true,
        downloadUrl: 'https://example.com/v1.1.0/download',
        releaseNotes: 'Patch notes',
        lastChecked: '2025-11-02T10:00:00Z',
        error: null,
      };

      app.__AUTOHOTPIE_MOCKS__?.updates?.seed(seedStatus);
      app.__AUTOHOTPIE_MOCKS__?.updates?.next(refreshedStatus);
    });

    const updatesSection = page.getByRole('region', { name: /updates/i });
    await expect(updatesSection.getByText('0.9.0')).toBeVisible();
    await expect(updatesSection.getByText('1.0.0')).toBeVisible();

    const downloadButton = updatesSection.getByRole('button', { name: /download/i });
    await expect(downloadButton).toBeEnabled();
    await downloadButton.click();

    const openTargets = await page.evaluate(() => {
      const app = window as typeof window & {
        __AUTOHOTPIE_MOCKS__?: {
          updates?: { openCalls: string[] };
        };
      };

      return app.__AUTOHOTPIE_MOCKS__?.updates?.openCalls ?? [];
    });
    expect(openTargets).toContain('https://example.com/v1.0.0/download');

    await updatesSection.getByRole('button', { name: /check/i }).click();
    await expect(updatesSection.getByText(/checking/i)).toBeVisible();

    await expect(updatesSection.getByText('1.1.0')).toBeVisible();

    await page.evaluate(() => {
      const app = window as typeof window & {
        __AUTOHOTPIE_MOCKS__?: {
          updates?: { fail(message: string): void };
        };
      };
      app.__AUTOHOTPIE_MOCKS__?.updates?.fail('updates.error.network:Network unavailable');
    });

    await updatesSection.getByRole('button', { name: /force check/i }).click();

    const errorBanner = updatesSection.getByRole('alert');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Network unavailable');

    const lastChecked = await updatesSection.locator('[data-testid="updates-last-checked"]').innerText();
    expect(lastChecked).toMatch(/2025/);
  });
});
