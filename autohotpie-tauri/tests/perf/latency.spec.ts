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

    // Warm-up: open once to initialize layout/caches
    await triggerHotkey(page, HOTKEY);
    const warmPie = page.getByTestId('pie-menu');
    await expect(warmPie).toBeVisible({ timeout: 1_000 });
    await page.mouse.click(5, 5);
    await expect(warmPie).not.toBeVisible({ timeout: 1_000 });

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
    const isWebKit = test.info().project.name.toLowerCase().includes('webkit');
    const effectiveThreshold = isWebKit ? Math.max(SUCCESS_THRESHOLD_MS, 900) : SUCCESS_THRESHOLD_MS;
    expect(elapsed).toBeLessThanOrEqual(effectiveThreshold);
  });
});
