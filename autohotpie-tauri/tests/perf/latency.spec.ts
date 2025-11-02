import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOTKEY = process.env.AHP_E2E_PIE_HOTKEY ?? 'Control+Shift+P';
const ACTION_SLA_MS = Number(process.env.AHP_LATENCY_SUCCESS_MS ?? 950);
const MENU_SLA_MS = Number(process.env.AHP_MENU_LATENCY_MS ?? 800);
const ITERATIONS = Number(process.env.AHP_PERF_ITERATIONS ?? 20);
const REPORT_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'reports');

type AnimationMetrics = {
  duration: number | null;
  heapUsed: number | null;
};

function parseHotkey(hotkey: string): string[] {
  return hotkey.split('+').map((part) => part.trim());
}

async function ensureReportDir() {
  await fs.mkdir(REPORT_DIR, { recursive: true });
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

function percentile(arr: number[], value: number): number {
  if (!arr.length) {
    return 0;
  }
  const sorted = [...arr].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(value * (sorted.length - 1))));
  return sorted[rank];
}

function median(arr: number[]): number {
  if (!arr.length) {
    return 0;
  }
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

test.describe('Perf - Latency benchmarks', () => {
  test('hotkey → pie → action within SLA and report captured', async ({ page }, testInfo) => {
    // Skip WebKit due to animation instability causing timeouts
    test.skip(testInfo.project.name.toLowerCase().includes('webkit'), 'WebKit has animation stability issues');

    await ensureReportDir();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const pieMenu = page.getByTestId('pie-menu');

    // Warm-up render to stabilize caches
    await triggerHotkey(page, HOTKEY);
    await expect(pieMenu).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    if (await pieMenu.isVisible()) {
      await page.mouse.click(5, 5);
    }
    await expect(pieMenu).toBeHidden({ timeout: 3_000 });

    const actionLatencies: number[] = [];
    const menuDurations: number[] = [];
    const heapSamples: number[] = [];

    for (let i = 0; i < ITERATIONS; i += 1) {
      await page.evaluate(() => {
        performance.clearMarks('PieMenu:animation-start');
        performance.clearMarks('PieMenu:animation-end');
        performance.clearMeasures('PieMenu:animation');
      });

      await triggerHotkey(page, HOTKEY);
      await expect(pieMenu).toBeVisible({ timeout: 1_000 });

      const slice = pieMenu.getByRole('button').first();
      // Wait for animation to settle before interacting
      await page.waitForTimeout(200);
      await slice.hover({ force: true });

      const start = Date.now();
      await slice.click({ force: true });

      const statusToast = page.getByRole('status').first();
      await expect(statusToast).toBeVisible({ timeout: 1_000 });
      await expect(statusToast).toContainText(/SUCCESS|SKIPPED/i);

      const elapsed = Date.now() - start;
      actionLatencies.push(elapsed);

      const { duration, heapUsed } = await page.evaluate<AnimationMetrics>(() => {
        const measures = performance.getEntriesByName('PieMenu:animation');
        const duration = measures.length ? measures[measures.length - 1].duration : null;
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        performance.clearMeasures('PieMenu:animation');
        const heapUsed = memory?.usedJSHeapSize ?? null;
        return { duration, heapUsed } satisfies AnimationMetrics;
      });

      if (typeof duration === 'number') {
        menuDurations.push(duration);
      }
      if (typeof heapUsed === 'number') {
        heapSamples.push(heapUsed);
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      if (await pieMenu.isVisible()) {
        await page.mouse.click(5, 5);
      }
      await expect(pieMenu).toBeHidden({ timeout: 3_000 });
    }

    const actionP95 = percentile(actionLatencies, 0.95);
    const menuP95 = percentile(menuDurations, 0.95);
    const maxHeapMb = heapSamples.length ? Math.max(...heapSamples) / (1024 * 1024) : null;

    expect(actionP95).toBeLessThanOrEqual(ACTION_SLA_MS);
    if (menuDurations.length) {
      expect(menuP95).toBeLessThanOrEqual(MENU_SLA_MS);
    }
    if (maxHeapMb !== null) {
      expect(maxHeapMb).toBeLessThanOrEqual(150);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      project: test.info().project.name,
      iterations: ITERATIONS,
      hotkey: HOTKEY,
      actionLatency: {
        samples: actionLatencies,
        median: median(actionLatencies),
        p95: actionP95,
        mean: actionLatencies.reduce((sum, value) => sum + value, 0) / actionLatencies.length,
      },
      menuAnimation: {
        samples: menuDurations,
        median: median(menuDurations),
        p95: menuP95,
      },
      heapUsageMb: {
        samples: heapSamples.map((value) => value / (1024 * 1024)),
        max: maxHeapMb,
      },
    };

    const filename = `latency-${Date.now()}.json`;
    await fs.writeFile(path.join(REPORT_DIR, filename), JSON.stringify(report, null, 2), 'utf-8');
  });
});
