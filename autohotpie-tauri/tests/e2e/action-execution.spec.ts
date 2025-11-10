import { test, expect } from '@playwright/test';

const HOTKEY = process.env.AHP_E2E_PIE_HOTKEY ?? 'Control+Shift+P';

function parseHotkey(hotkey: string): string[] {
  return hotkey.split('+').map((part) => part.trim());
}

test.describe('US1 - Action execution flow', () => {
  test('actions trigger immediately without confirmation dialogs', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => (window as unknown as { __PIE_PROFILES_READY__?: boolean }).__PIE_PROFILES_READY__ === true,
      { timeout: 2_000 },
    );

    const modifiers = parseHotkey(HOTKEY);
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

    const pieMenu = page.getByTestId('pie-menu');
    await expect(pieMenu).toBeVisible({ timeout: 1_000 });

    const targetSlice = pieMenu.getByRole('button').first();
    await targetSlice.hover();
    await targetSlice.click();

    const confirmationDialog = page.getByRole('dialog', { name: /confirm action/i });
    await expect(confirmationDialog).toHaveCount(0);

    const statusToast = page.getByRole('status').first();
    await expect(statusToast).toBeVisible({ timeout: 1_000 });
    await expect(statusToast).toContainText(/SUCCESS/i);
  await page.keyboard.press('Escape');
  // The pie menu fades out via opacity and uses an animation end to set visibility:hidden.
  // Playwright treats elements with opacity:0 as visible, so assert on aria-hidden which
  // is updated immediately when the menu is closed.
  await expect(pieMenu).toHaveAttribute('aria-hidden', 'true', { timeout: 2_000 });

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('pie-menu:action', {
          detail: {
            id: 'action-error',
            name: 'Failing Action',
            status: 'failure',
            message: 'Execution failed',
          },
        }),
      );
    });

    const errorToast = page.getByRole('status').first();
    await expect(errorToast).toBeVisible({ timeout: 1_000 });
    await expect(errorToast).toContainText(/ERROR/i);
  });
});
