import { test, expect } from '@playwright/test';

test.describe('Accessibility smoke', () => {
  test('keyboard navigation reaches autostart controls', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/?mockPlatform=linux', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('heading', { name: 'Autostart' }).waitFor();

    // Первые табы попадают на управление инструкциями — проверим клавиатурную навигацию на читаемый элемент.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const instructionsButton = page.getByTestId('autostart-instructions');
    await expect(instructionsButton).toBeFocused();
  });

  test('linux fallback status panel toggles via keyboard', async ({ page }) => {
    await page.goto('/?mockTray=off&mockPlatform=linux');

    const statusToggle = page.getByTestId('linux-fallback-status-toggle');
    const fallbackPanel = page.getByTestId('linux-fallback-panel');

    await statusToggle.waitFor();
    await expect(statusToggle).toBeVisible();
    await statusToggle.press('Enter');
    await expect(fallbackPanel).toBeVisible();

    await statusToggle.press('Enter');
    await expect(fallbackPanel).toBeHidden();
  });
});
