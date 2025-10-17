import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(rootDir, './src'),
      '@components': resolve(rootDir, './src/components'),
      '@hooks': resolve(rootDir, './src/hooks'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./setupTests.ts'],
    css: true,
    reporters: ['default'],
    coverage: {
      enabled: false,
      provider: 'istanbul',
      reportsDirectory: './coverage/unit',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        lines: 50,
        statements: 50,
        branches: 40,
        functions: 40,
      },
    },
  },
});
