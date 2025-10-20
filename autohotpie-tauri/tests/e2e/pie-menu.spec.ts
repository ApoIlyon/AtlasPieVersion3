import { test, expect, type Page } from '@playwright/test';

const HOTKEY = process.env.AHP_E2E_PIE_HOTKEY ?? 'Control+Shift+P';

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

type SliceAssertion = {
  label: string | RegExp;
  visible: boolean;
};

async function expectPieMenuSlices(page: Page, assertions: SliceAssertion[]) {
  const pieMenu = page.getByTestId('pie-menu');
  await expect(pieMenu).toBeVisible({ timeout: 1_000 });

  for (const assertion of assertions) {
    const slice = pieMenu.getByRole('button', {
      name: assertion.label,
    });
    if (assertion.visible) {
      await expect(slice).toBeVisible();
    } else {
      await expect(slice).toHaveCount(0);
    }
  }
}

function parseHotkey(hotkey: string): string[] {
  return hotkey.split('+').map((part) => part.trim());
}

test.describe('US1 - Pie menu invocation', () => {
  test('default profile is used when no context matches', async ({ page }) => {
    await page.goto('/');

    await triggerHotkey(page, HOTKEY);

    await expectPieMenuSlices(page, [
      { label: /Launch Calculator/i, visible: true },
      { label: /Switch Terminal/i, visible: false },
      { label: /Open DevTools/i, visible: false },
    ]);

    const pieMenu = page.getByTestId('pie-menu');
    const targetSlice = pieMenu.getByRole('button', { name: /Launch Calculator/i });
    await targetSlice.hover();
    await targetSlice.click();

    const toast = page
      .locator('[role="status"]')
      .filter({ hasText: /Action completed successfully/i })
      .first();
    await expect(toast).toBeVisible({ timeout: 1_000 });
    await expect(pieMenu).not.toBeVisible({ timeout: 2_000 });
  });

  test('VS Code profile is selected when process matches', async ({ page }) => {
    await page.goto('/?mockProcess=code.exe&mockWindow=Visual%20Studio%20Code');

    await triggerHotkey(page, HOTKEY);

    await expectPieMenuSlices(page, [
      { label: /Switch Terminal/i, visible: true },
      { label: /Build Project/i, visible: true },
      { label: /Launch Calculator/i, visible: false },
    ]);
  });

  test('browser profile is selected when window title matches', async ({ page }) => {
    await page.goto('/?mockProcess=chrome.exe&mockWindow=Mozilla%20Firefox');

    await triggerHotkey(page, HOTKEY);

    await expectPieMenuSlices(page, [
      { label: /Open DevTools/i, visible: true },
      { label: /Refresh Tab/i, visible: true },
      { label: /Launch Calculator/i, visible: false },
    ]);
  });
});
