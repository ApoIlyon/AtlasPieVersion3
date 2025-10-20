import { test, expect, type Page } from '@playwright/test';

const HOTKEY = process.env.AHP_E2E_PIE_HOTKEY ?? 'Control+Shift+P';
const MENU_LATENCY_THRESHOLD_MS = Number(process.env.AHP_MENU_LATENCY_MS ?? 500);

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

test.describe('Perf - Hotkey to menu latency', () => {
  test('pie menu appears under SLA after triggering hotkey', async ({ page }) => {
    await page.goto('/');

    const start = Date.now();
    await triggerHotkey(page, HOTKEY);

    const pieMenu = page.getByTestId('pie-menu');
    await expect(pieMenu).toBeVisible({ timeout: 1_000 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThanOrEqual(MENU_LATENCY_THRESHOLD_MS);
  });
});
