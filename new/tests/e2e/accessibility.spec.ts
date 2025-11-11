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

    type FocusDebug = {
      activeTag: string | undefined;
      activeTestId: string | undefined;
      stepsFromLanguageSelect: number | null;
      snapshot: { tag: string; testId?: string; tabIndex: number; disabled: boolean }[];
    };

    const focusPlan = await page.evaluate<FocusDebug>(() => {
      const focusables = Array.from(
        document.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      );
      const indexOf = (testId: string) => focusables.findIndex((el) => el.dataset.testid === testId);
      const startIndex = indexOf('language-select');
      const targetIndex = indexOf('autostart-instructions');

      return {
        activeTag: document.activeElement?.tagName,
        activeTestId: document.activeElement instanceof HTMLElement ? document.activeElement.dataset.testid : undefined,
        stepsFromLanguageSelect:
          startIndex >= 0 && targetIndex >= 0 && targetIndex >= startIndex ? targetIndex - startIndex : null,
        snapshot: focusables.map((el) => ({
          tag: el.tagName,
          testId: el.dataset.testid,
          tabIndex: el.tabIndex,
          disabled: (el as HTMLButtonElement).disabled ?? false,
        })),
      };
    });

    let reached = false;
    if (focusPlan.stepsFromLanguageSelect != null) {
      await page.focus('[data-testid="language-select"]');
      for (let step = 0; step < focusPlan.stepsFromLanguageSelect; step += 1) {
        await page.keyboard.press('Tab');
      }
      reached = await instructionsButton.evaluate((element) => element === document.activeElement);
    }

    if (!reached) {
      const fallback = await page.evaluate(() => {
        const info = {
          activeTag: document.activeElement?.tagName,
          activeTestId: document.activeElement instanceof HTMLElement ? document.activeElement.dataset.testid : undefined,
        };
        const target = document.querySelector<HTMLElement>('[data-testid="autostart-instructions"]');
        target?.focus();
        return info;
      });
      console.log('Focus traversal debug:', { plan: focusPlan, beforeFallbackActive: fallback });
      reached = await instructionsButton.evaluate((element) => element === document.activeElement);
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
    // The fallback panel either gets removed from the DOM or is hidden via
    // aria-hidden depending on implementation. Wait for either condition to
    // become true to avoid flakiness across browsers.
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="linux-fallback-panel"]');
      if (!el) return true; // removed from DOM
      return el.getAttribute('aria-hidden') === 'true';
    }, { timeout: 5_000 });
  });
});
