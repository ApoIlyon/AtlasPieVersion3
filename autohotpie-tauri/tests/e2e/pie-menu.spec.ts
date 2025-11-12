import { test, expect, type Page } from '@playwright/test';

const HOTKEY = process.env.AHP_E2E_PIE_HOTKEY ?? 'Control+Shift+P';

async function ensurePageFocus(page: Page) {
  await page.evaluate(() => {
    window.focus();
    document.body?.focus?.();
  });
}

async function waitForProfilesReady(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __PIE_PROFILES_READY__?: boolean }).__PIE_PROFILES_READY__ === true,
    { timeout: 2_000 },
  );
}

async function waitForHotkeyReady(page: Page, hotkey: string) {
  const expected = hotkey.toLowerCase();
  await page.waitForFunction(
    (needle) => {
      const matchers = (window as unknown as { __PIE_HOTKEY_MATCHERS__?: string[] }).__PIE_HOTKEY_MATCHERS__;
      return Array.isArray(matchers) && matchers.includes(needle);
    },
    expected,
    { timeout: 2_000 },
  );
}

async function triggerHotkey(page: Page, hotkey: string) {
  await ensurePageFocus(page);

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
  const pieMenu = page.getByTestId('pie-menu').last();
  // Wait until the last pie-menu is logically visible. Different browsers
  // may treat opacity/ancestor styles differently, so accept either an
  // element with aria-hidden="false" or computed opacity > 0.
  await page.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('[data-testid="pie-menu"]'));
    const el = els[els.length - 1] as HTMLElement | undefined;
    if (!el) return false;
    if (el.getAttribute('aria-hidden') === 'false') return true;
    const style = window.getComputedStyle(el);
    return parseFloat(style.opacity || '0') > 0;
  }, { timeout: 1_000 });

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
    await page.goto('/?mockSafeModeIgnore=1&mockHotkeyDialog=off&pieHotkey=Control%2BShift%2BP');

    await waitForProfilesReady(page);
    await waitForHotkeyReady(page, HOTKEY);

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
  await page.keyboard.press('Escape');
  // Assert on aria-hidden to avoid flakiness due to opacity animation
  await expect(pieMenu).toHaveAttribute('aria-hidden', 'true', { timeout: 2_000 });
  });

  test('VS Code profile is selected when process matches', async ({ page }) => {
    await page.goto('/?mockSafeModeIgnore=1&mockHotkeyDialog=off&pieHotkey=Control%2BShift%2BP&mockProcess=code.exe&mockWindow=Visual%20Studio%20Code');

    await waitForProfilesReady(page);
    await waitForHotkeyReady(page, HOTKEY);

    await triggerHotkey(page, HOTKEY);

    await expectPieMenuSlices(page, [
      { label: /Switch Terminal/i, visible: true },
      { label: /Build Project/i, visible: true },
      { label: /Launch Calculator/i, visible: false },
    ]);
  });

  test('browser profile is selected when window title matches', async ({ page }) => {
    await page.goto('/?mockSafeModeIgnore=1&mockHotkeyDialog=off&pieHotkey=Control%2BShift%2BP&mockProcess=chrome.exe&mockWindow=Mozilla%20Firefox');

    await waitForProfilesReady(page);
    await waitForHotkeyReady(page, HOTKEY);

    await triggerHotkey(page, HOTKEY);

    await expectPieMenuSlices(page, [
      { label: /Open DevTools/i, visible: true },
      { label: /Refresh Tab/i, visible: true },
      { label: /Launch Calculator/i, visible: false },
    ]);
  });
});
