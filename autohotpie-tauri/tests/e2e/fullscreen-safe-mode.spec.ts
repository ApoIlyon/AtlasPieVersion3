import { test, expect, type Page } from '@playwright/test';

const HOTKEY = process.env.AHP_E2E_PIE_HOTKEY ?? 'Control+Shift+P';

function parseHotkey(hotkey: string): string[] {
  return hotkey.split('+').map((part) => part.trim());
}

async function triggerHotkey(page: Page, hotkey: string) {
  const modifiers = parseHotkey(hotkey);
  const mainKey = modifiers.pop();
  if (!mainKey) {
    throw new Error('Invalid hotkey definition');
  }

  for (const modifier of modifiers) {
    await page.keyboard.down(modifier);
  }
  await page.keyboard.press(mainKey);
  for (const modifier of modifiers.reverse()) {
    await page.keyboard.up(modifier);
  }
}

test.describe('Edge case - Fullscreen safe-mode', () => {
  test('blocks pie menu when fullscreen game detected and shows notification', async ({ page }) => {
    await page.goto('/?mockSafeMode=strict');
    await page.waitForLoadState('networkidle');

    // Mock fullscreen game detection via system store
    await page.evaluate(() => {
      // @ts-expect-error vite runtime import for e2e setup
      return import(/* @vite-ignore */ '/src/state/systemStore.ts').then(({ useSystemStore }) => {
        const currentStatus = useSystemStore.getState().status;
        useSystemStore.setState({
          status: {
            ...currentStatus,
            window: {
              ...currentStatus.window,
              isFullscreen: true,
              processName: 'TestGame.exe',
            },
          },
        });
      });
    });

    // Wait for state propagation (WebKit needs more time)
    await page.waitForTimeout(300);

    // Attempt to trigger pie menu
    await triggerHotkey(page, HOTKEY);

    // Wait for potential menu animation
    await page.waitForTimeout(200);

    // Verify pie menu is NOT visible
    const pieMenu = page.getByTestId('pie-menu');
    await expect(pieMenu).not.toBeVisible({ timeout: 2_000 });

    // Verify notification appears
    const toast = page.getByRole('status').first();
    await expect(toast).toBeVisible({ timeout: 3_000 });
    await expect(toast).toContainText(/blocked|closed|safe-mode|fullscreen|paused/i);

    // Verify notification disappears after timeout (or manually dismiss)
    await expect(toast).not.toBeVisible({ timeout: 7_000 });

    // Restore normal mode
    await page.evaluate(() => {
      // @ts-expect-error vite runtime import for e2e setup
      return import(/* @vite-ignore */ '/src/state/systemStore.ts').then(({ useSystemStore }) => {
        const currentStatus = useSystemStore.getState().status;
        useSystemStore.setState({
          status: {
            ...currentStatus,
            window: {
              ...currentStatus.window,
              isFullscreen: false,
              processName: null,
            },
          },
        });
      });
    });

    await page.waitForTimeout(100);

    // Verify pie menu works again
    await triggerHotkey(page, HOTKEY);
    await expect(pieMenu).toBeVisible({ timeout: 1_000 });

  // Cleanup
  await page.keyboard.press('Escape');
  // Assert on aria-hidden to avoid flakiness due to opacity animation
  await expect(pieMenu).toHaveAttribute('aria-hidden', 'true', { timeout: 2_000 });
  });
});
