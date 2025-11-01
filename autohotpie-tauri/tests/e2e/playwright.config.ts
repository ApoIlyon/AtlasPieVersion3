import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const moduleDir = fileURLToPath(new URL('.', import.meta.url));
const contextProfiles = JSON.parse(
  readFileSync(new URL('./fixtures/context-profiles.json', import.meta.url), 'utf-8')
);

export default defineConfig({
  testDir: join(moduleDir),
  testMatch: [
    '**/app-smoke.spec.ts',
    '**/pie-menu.spec.ts',
    '**/action-execution.spec.ts',
    '**/autostart.spec.ts',
    '**/hotkey-conflict.spec.ts',
    '**/localization.spec.ts',
    '**/localization-negative.spec.ts',
    '**/log-panel.spec.ts',
    '**/import-export-negative.spec.ts',
    '**/linux-fallback.spec.ts',
    '**/offline.spec.ts',
    '**/accessibility.spec.ts',
  ],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      metadata: {
        contextProfiles,
      },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      metadata: {
        contextProfiles,
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      metadata: {
        contextProfiles,
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
