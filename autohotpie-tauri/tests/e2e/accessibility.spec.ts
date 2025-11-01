import { test, expect } from '@playwright/test';

test.describe('Accessibility smoke', () => {
  test('keyboard navigation reaches autostart controls', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/?mockPlatform=linux', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('heading', { name: 'Autostart' }).waitFor();

    // Первые табы попадают на управление инструкциями — проверим клавиатурную навигацию на читаемый элемент.
    const instructionsButton = page.getByTestId('autostart-instructions');
    await expect(instructionsButton).toBeVisible();

    let reached = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await page.keyboard.press('Tab');
      const isFocused = await instructionsButton.evaluate((element) => element === document.activeElement);
      if (isFocused) {
        reached = true;
        break;
      }
    }

    if (!reached) {
      const focusDebug = await page.evaluate(() => {
        const active = document.activeElement;
        return {
          activeTag: active?.tagName,
          activeText: active?.textContent,
          activeTestId: active instanceof HTMLElement ? active.dataset.testid : undefined,
          focusableSnapshot: Array.from(
            document.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
          ).map((el) => ({
            tag: el.tagName,
            text: el.textContent,
            testId: el.dataset.testid,
            tabIndex: el.tabIndex,
            disabled: (el as HTMLButtonElement).disabled ?? false,
          })),
        };
      });
      console.log('Focus traversal debug:', focusDebug);
    }

    expect(reached).toBeTruthy();
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
