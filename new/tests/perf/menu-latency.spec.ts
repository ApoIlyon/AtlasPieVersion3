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
    await page.waitForLoadState('networkidle');

    // Warm-up: first open and close to stabilize timings
    await triggerHotkey(page, HOTKEY);
    const warmPie = page.getByTestId('pie-menu');
    await expect(warmPie).toBeVisible({ timeout: 3_000 });
  await page.mouse.click(5, 5);
  await page.keyboard.press('Escape');
  // Assert on aria-hidden to avoid flakiness due to opacity animation
  await expect(warmPie).toHaveAttribute('aria-hidden', 'true', { timeout: 2_000 });

    async function measureOnce(): Promise<number> {
      const start = Date.now();
      await triggerHotkey(page, HOTKEY);
      const pieMenu = page.getByTestId('pie-menu');
      await expect(pieMenu).toBeVisible({ timeout: 1_000 });
      const elapsed = Date.now() - start;
  // close for next run
  await page.mouse.click(5, 5);
  await page.keyboard.press('Escape');
  // Assert on aria-hidden to avoid flakiness due to opacity animation
  await expect(pieMenu).toHaveAttribute('aria-hidden', 'true', { timeout: 2_000 });
      return elapsed;
    }

    const run1 = await measureOnce();
    const run2 = await measureOnce();
    const best = Math.min(run1, run2);

    const projectName = test.info().project.name.toLowerCase();
    const isWebKit = projectName.includes('webkit');
    const isFirefox = projectName.includes('firefox');
    const effectiveThreshold = isWebKit
      ? Math.max(MENU_LATENCY_THRESHOLD_MS, 650)
      : isFirefox
      ? Math.max(MENU_LATENCY_THRESHOLD_MS, 1000)
      : MENU_LATENCY_THRESHOLD_MS;
    expect(best).toBeLessThanOrEqual(effectiveThreshold);
  });
});
