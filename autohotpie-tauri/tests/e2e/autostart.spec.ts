import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

type AutostartInfo = {
  status: 'enabled' | 'disabled' | 'unsupported' | 'errored';
  launcherPath?: string | null;
  message?: string | null;
};

type AutostartStoreState = {
  info: AutostartInfo | null;
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

declare global {
  interface Window {
    __AUTOHOTPIE_AUTOSTART_STORE__?: {
      setState: (state: Partial<AutostartStoreState>) => void;
      getState: () => AutostartStoreState;
    };
    __AUTOHOTPIE_SYSTEM_STORE__?: {
      getState: () => {
        setStorageMode: (mode: 'read_write' | 'read_only') => void;
      };
    };
  }
}

const AUTOSTART_HEADING = 'Autostart';

async function setAutostartState(page: Page, info: AutostartInfo, extras?: Partial<AutostartStoreState>) {
  await page.evaluate(
    ({ info: payload, extras: state }) => {
      const store = window.__AUTOHOTPIE_AUTOSTART_STORE__;
      store?.setState({ info: payload, isLoading: false, isUpdating: false, error: null, ...state });
    },
    { info, extras },
  );
}

test.describe('US3 - Autostart settings', () => {
  test('renders status transitions and read-only guard in desktop mode', async ({ page }) => {
    await page.addInitScript(() => {
      (window as typeof window & { __TAURI__?: Record<string, never> }).__TAURI__ = {};
    });

    await page.goto('/');
    const autostartHeading = page.getByRole('heading', { name: AUTOSTART_HEADING });
    await autostartHeading.scrollIntoViewIfNeeded();

    const statusBadge = page.getByTestId('autostart-status');
    const enableButton = page.getByRole('button', { name: 'Enable autostart' });
    const disableButton = page.getByRole('button', { name: 'Disable autostart' });
    const retryButton = page.getByTestId('autostart-retry');

    await setAutostartState(page, { status: 'disabled', launcherPath: null, message: null });
    await expect(statusBadge).toHaveText('Autostart is currently disabled.');
    await expect(enableButton).toBeEnabled();
    await expect(disableButton).toBeDisabled();

    await setAutostartState(page, { status: 'enabled', launcherPath: '/tmp/launcher', message: null });
    await expect(statusBadge).toHaveText('Autostart is currently enabled.');
    await expect(enableButton).toBeDisabled();
    await expect(disableButton).toBeEnabled();

    await setAutostartState(page, {
      status: 'errored',
      launcherPath: null,
      message: 'Simulated autostart failure',
    });
    await expect(statusBadge).toHaveText('Autostart encountered an error.');
    await expect(page.getByTestId('autostart-status-message')).toContainText('Simulated autostart failure');

    await page.evaluate(() => {
      const store = window.__AUTOHOTPIE_AUTOSTART_STORE__;
      if (!store) {
        return;
      }
      store.getState().refresh = async () => {
        store.setState({
          info: { status: 'disabled', launcherPath: null, message: null },
          error: null,
          isLoading: false,
        });
      };
    });

    await retryButton.click();
    await expect(statusBadge).toHaveText('Autostart is currently disabled.');
    await expect(page.getByTestId('autostart-status-message')).toHaveCount(0);

    await page.evaluate(() => {
      const store = window.__AUTOHOTPIE_SYSTEM_STORE__;
      store?.getState().setStorageMode('read_only');
    });
    await expect(page.getByTestId('autostart-readonly-banner')).toBeVisible();
    await expect(enableButton).toBeDisabled();
    await expect(disableButton).toBeDisabled();

    await page.evaluate(() => {
      const store = window.__AUTOHOTPIE_SYSTEM_STORE__;
      store?.getState().setStorageMode('read_write');
    });
    await expect(page.getByTestId('autostart-readonly-banner')).toHaveCount(0);
  });

  test('opens quickstart instructions in browser preview', async ({ page }) => {
    await page.goto('/');
    const autostartHeading = page.getByRole('heading', { name: AUTOSTART_HEADING });
    await autostartHeading.scrollIntoViewIfNeeded();

    const instructionsButton = page.getByTestId('autostart-instructions');
    await expect(instructionsButton).toBeVisible();

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      instructionsButton.click(),
    ]);

    await expect(popup).toHaveURL(/specs\/001-build-tauri-pie\/quickstart\.md#troubleshooting/i);
    await popup.close();
  });
});

