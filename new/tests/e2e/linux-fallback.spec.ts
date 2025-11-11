import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

type AutostartProvider =
  | 'systemd'
  | 'xdg_desktop'
  | 'plugin'
  | 'windows_startup'
  | 'macos_launch_agent'
  | 'unsupported';

type AutostartInfo = {
  status: 'enabled' | 'disabled' | 'unsupported' | 'errored';
  launcherPath?: string | null;
  message?: string | null;
  provider?: AutostartProvider | null;
  reasonCode?: string | null;
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
  }
}

async function setAutostartState(page: Page, info: AutostartInfo, extras?: Partial<AutostartStoreState>) {
  await page.evaluate(
    ({ payload, state }) => {
      const store = window.__AUTOHOTPIE_AUTOSTART_STORE__;
      store?.setState({ info: payload, isLoading: false, isUpdating: false, error: null, ...state });
    },
    { payload: info, state: extras },
  );
}

async function waitForAutostartStore(page: Page) {
  await page.waitForFunction(
    () => Boolean(window.__AUTOHOTPIE_AUTOSTART_STORE__),
    undefined,
    { timeout: 5_000 },
  );
}

test.describe('NFR-006 - Linux fallback panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (X11; Linux x86_64)',
      });
      Object.defineProperty(window, 'process', {
        value: { platform: 'linux' },
      });
    });
  });

  test('shows fallback controls and provider hints', async ({ page }) => {
    await page.goto('/');
    await waitForAutostartStore(page);

    await setAutostartState(page, {
      status: 'disabled',
      launcherPath: '/home/test/.config/autostart/AutoHotPie.desktop',
      message: 'Desktop entry missing. Enable autostart to create it.',
      provider: 'xdg_desktop',
      reasonCode: 'entry_missing',
    });

    const toggleGroup = page.getByTestId('linux-fallback-toggle');
    await expect(toggleGroup).toBeVisible();

    const primaryToggle = toggleGroup.getByRole('button', { name: /toggle/i }).first();
    await primaryToggle.click();

    const panel = page.getByTestId('linux-fallback-panel');
    await expect(panel).toBeVisible();

    await expect(page.getByTestId('linux-fallback-autostart-status')).toContainText('Autostart is currently disabled.');
    await expect(page.getByTestId('linux-fallback-autostart-provider')).toContainText('Autostart provider: XDG desktop entry');
    await expect(page.getByTestId('linux-fallback-autostart-reason')).toContainText('Desktop entry missing. Enable autostart to create it.');

    const instructionsButton = page.getByTestId('linux-fallback-autostart-instructions');
    const [instructionsPopup] = await Promise.all([
      page.waitForEvent('popup'),
      instructionsButton.click(),
    ]);
    await expect(instructionsPopup).toHaveURL(/quickstart\.md#troubleshooting/i);
    await instructionsPopup.close();
  });

  test('handles enable/disable actions and surfaces errors', async ({ page }) => {
    await page.goto('/');
    await waitForAutostartStore(page);

    await setAutostartState(page, {
      status: 'disabled',
      launcherPath: null,
      message: null,
      provider: 'plugin',
      reasonCode: 'plugin_disabled',
    });

    const panelToggle = page.getByTestId('linux-fallback-toggle').getByRole('button', { name: /toggle/i }).first();
    await panelToggle.click();

    const enableButton = page.getByTestId('linux-fallback-autostart-enable');
    await enableButton.click();
    await expect(page.getByTestId('linux-fallback-autostart-error')).toBeVisible();

    const clearErrorButton = page.getByTestId('linux-fallback-autostart-error').getByRole('button', { name: /clear/i });
    await clearErrorButton.click();
    await expect(page.getByTestId('linux-fallback-autostart-error')).toHaveCount(0);

    await setAutostartState(page, {
      status: 'enabled',
      launcherPath: '/home/test/.config/systemd/user/autohotpie.service',
      message: 'Autostart managed via systemd user service.',
      provider: 'systemd',
      reasonCode: null,
    });
    await expect(page.getByTestId('linux-fallback-autostart-status')).toContainText('Autostart is currently enabled.');

    const disableButton = page.getByTestId('linux-fallback-autostart-disable');
    await disableButton.click();
    await expect(page.getByTestId('linux-fallback-autostart-error')).toBeVisible();
  });
});
