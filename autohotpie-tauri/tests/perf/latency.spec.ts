import { test, expect, type Page } from '@playwright/test';

const HOTKEY = process.env.AHP_E2E_PIE_HOTKEY ?? 'Control+Shift+P';
const SUCCESS_THRESHOLD_MS = Number(process.env.AHP_LATENCY_SUCCESS_MS ?? 700);

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

test.describe('Perf - Sequential runner latency', () => {
  test('action execution toast appears within SLA', async ({ page }) => {
    await page.goto('/');

    await triggerHotkey(page, HOTKEY);

    const pieMenu = page.getByTestId('pie-menu');
    await expect(pieMenu).toBeVisible({ timeout: 1_000 });

    const firstSlice = pieMenu.getByRole('button').first();
    await firstSlice.hover();

    const start = Date.now();
    await firstSlice.click();

    const statusToast = page.getByRole('status').first();
    await expect(statusToast).toBeVisible({ timeout: 1_000 });
    await expect(statusToast).toContainText(/SUCCESS/i);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThanOrEqual(SUCCESS_THRESHOLD_MS);
  });
});
