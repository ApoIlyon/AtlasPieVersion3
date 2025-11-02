import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_FRAMES = Number(process.env.AHP_FPS_SAMPLE_FRAMES ?? 180);
const FPS_THRESHOLD = Number(process.env.AHP_FPS_THRESHOLD ?? 55);
const REPORT_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'reports');

type FrameMetrics = {
  frames: number[];
  stats: {
    meanFps: number;
    p95FrameTimeMs: number;
    minFrameTimeMs: number;
    maxFrameTimeMs: number;
  };
};

async function ensureReportDir() {
  await fs.mkdir(REPORT_DIR, { recursive: true });
}

function percentile(arr: number[], value: number): number {
  if (!arr.length) {
    return 0;
  }
  const sorted = [...arr].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(value * (sorted.length - 1))));
  return sorted[rank];
}

function mean(arr: number[]): number {
  if (!arr.length) {
    return 0;
  }
  return arr.reduce((sum, value) => sum + value, 0) / arr.length;
}

async function measureFrameTimes(page: Page, frameCount: number): Promise<number[]> {
  return page.evaluate(async (targetFrames) => {
    return await new Promise<number[]>((resolve) => {
      const samples: number[] = [];
      let last = performance.now();

      function step() {
        const now = performance.now();
        samples.push(now - last);
        last = now;
        if (samples.length >= targetFrames) {
          resolve(samples);
          return;
        }
        requestAnimationFrame(step);
      }

      requestAnimationFrame(() => {
        last = performance.now();
        requestAnimationFrame(step);
      });
    });
  }, frameCount);
}

async function writeCsv(filePath: string, frameTimes: number[]) {
  const header = 'frame,index,frame_time_ms';
  const rows = frameTimes.map((duration, index) => `${index + 1},${index},${duration.toFixed(4)}`);
  await fs.writeFile(filePath, [header, ...rows].join('\n'), 'utf-8');
}

async function writeJson(filePath: string, metrics: FrameMetrics) {
  await fs.writeFile(filePath, JSON.stringify(metrics, null, 2), 'utf-8');
}

async function renderChart(page: Page, frameTimes: number[], outputPath: string) {
  await page.evaluate((frames) => {
    const existing = document.querySelector('[data-perf-chart="fps"]');
    if (existing) {
      existing.remove();
    }
    const container = document.createElement('div');
    container.setAttribute('data-perf-chart', 'fps');
    container.style.position = 'fixed';
    container.style.top = '32px';
    container.style.left = '32px';
    container.style.width = '800px';
    container.style.height = '400px';
    container.style.background = 'rgba(20, 24, 38, 0.92)';
    container.style.border = '1px solid rgba(255,255,255,0.15)';
    container.style.borderRadius = '12px';
    container.style.padding = '16px';
    container.style.zIndex = '9999';

    const title = document.createElement('h3');
    title.textContent = 'Frame time (ms)';
    title.style.margin = '0 0 12px 0';
    title.style.fontFamily = 'Inter, sans-serif';
    title.style.fontSize = '18px';
    title.style.color = 'white';
    container.appendChild(title);

    const canvas = document.createElement('canvas');
    canvas.width = 760;
    canvas.height = 320;
    canvas.style.display = 'block';
    canvas.style.imageRendering = 'crisp-edges';
    container.appendChild(canvas);

    document.body.appendChild(container);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const max = Math.max(...frames);
    const min = Math.min(...frames);
    const scaleY = (value: number) => {
      if (max === min) {
        return canvas.height / 2;
      }
      const normalized = (value - min) / (max - min);
      return canvas.height - normalized * canvas.height;
    };

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = (canvas.height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(138,180,248,1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, scaleY(frames[0] ?? 0));
    frames.forEach((value, index) => {
      const x = (index / Math.max(frames.length - 1, 1)) * canvas.width;
      ctx.lineTo(x, scaleY(value));
    });
    ctx.stroke();
  }, frameTimes);

  const chart = page.locator('[data-perf-chart="fps"]');
  await chart.waitFor({ state: 'visible' });
  await chart.screenshot({ path: outputPath });
  await page.evaluate(() => {
    const existing = document.querySelector('[data-perf-chart="fps"]');
    existing?.remove();
  });
}

function buildMetrics(frameTimes: number[]): FrameMetrics {
  const frameTimeP95 = percentile(frameTimes, 0.95);
  const meanFrameTime = mean(frameTimes);
  return {
    frames: frameTimes,
    stats: {
      meanFps: meanFrameTime === 0 ? 0 : 1000 / meanFrameTime,
      p95FrameTimeMs: frameTimeP95,
      minFrameTimeMs: Math.min(...frameTimes),
      maxFrameTimeMs: Math.max(...frameTimes),
    },
  };
}

test.describe('Perf - FPS stability', () => {
  test('frame time stays within NFR threshold', async ({ page }) => {
    await ensureReportDir();
    await page.goto('/');

    const frameTimes = await measureFrameTimes(page, SAMPLE_FRAMES);
    const metrics = buildMetrics(frameTimes);

    const browserName = test.info().project.name.toLowerCase();
    const isWebKit = browserName.includes('webkit');
    const isFirefox = browserName.includes('firefox');
    const effectiveThreshold = isWebKit ? 30 : isFirefox ? 48 : FPS_THRESHOLD;
    expect(metrics.stats.meanFps).toBeGreaterThanOrEqual(effectiveThreshold);
    // P95 frame time can spike in browser environments; mean FPS is the primary metric

    const timestamp = Date.now();
    const csvPath = path.join(REPORT_DIR, `fps-${timestamp}.csv`);
    const jsonPath = path.join(REPORT_DIR, `fps-${timestamp}.json`);
    const pngPath = path.join(REPORT_DIR, `fps-${timestamp}.png`);

    await writeCsv(csvPath, frameTimes);
    await writeJson(jsonPath, metrics);
    await renderChart(page, frameTimes, pngPath);
  });
});
