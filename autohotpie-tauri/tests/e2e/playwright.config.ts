import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

const contextProfiles = JSON.parse(
  readFileSync(new URL('./fixtures/context-profiles.json', import.meta.url), 'utf-8')
);

export default defineConfig({
  testDir: '../',
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
