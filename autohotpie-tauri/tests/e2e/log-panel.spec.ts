import { expect, Page, test } from '@playwright/test';

const SAMPLE_SNAPSHOT = {
  entries: [
    {
      timestamp: '2025-10-30T14:00:00Z',
      level: 'INFO',
      message: 'Startup complete',
      raw: 'INFO Startup complete',
    },
    {
      timestamp: '2025-10-30T14:01:00Z',
      level: 'ERROR',
      message: 'Disk failure detected',
      raw: 'ERROR Disk failure detected',
    },
    {
      timestamp: '2025-10-30T14:02:00Z',
      level: 'ACTION',
      message: 'User triggered export',
      raw: 'ACTION export',
    },
  ],
  file_path: 'C:/logs/AHP-Audit-2025-10-30.log',
  truncated: false,
};

async function stubTauriSuccess(page: Page, snapshot = SAMPLE_SNAPSHOT) {
  await page.addInitScript(({ snapshot: injectedSnapshot }) => {
    const win = window as Window & {
      __TAURI__?: any;
      __TAURI_IPC__?: () => void;
      __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown>; transformCallback: (cb?: (...args: unknown[]) => void, once?: boolean) => number };
    };
    const handler = (command: string, args?: unknown) => {
      if (command === 'read_logs') {
        return Promise.resolve(injectedSnapshot);
      }
      if (command === 'open_logs') {
        return Promise.resolve();
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    };
    const transformCallback = (cb?: (...args: unknown[]) => void) => {
      const id = Math.floor(Math.random() * 10_000);
      if (cb) {
        setTimeout(() => {
          cb();
        }, 0);
      }
      return id;
    };
    Object.defineProperty(win, '__TAURI_IPC__', { value: () => {}, configurable: true });
    Object.defineProperty(win, '__TAURI_INTERNALS__', {
      value: {
        invoke(command: string, args?: unknown) {
          return handler(command, args);
        },
        transformCallback,
      },
      configurable: true,
    });
    Object.defineProperty(win, '__TAURI__', {
      value: {
        core: {
          invoke(command: string, args?: unknown) {
            return handler(command, args);
          },
          transformCallback,
        },
      },
      configurable: true,
    });
  }, { snapshot });
}

async function stubTauriFailure(page: Page, message = 'failed to read log file') {
  await page.addInitScript(({ errorMessage }) => {
    const win = window as Window & {
      __TAURI__?: any;
      __TAURI_IPC__?: () => void;
      __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown>; transformCallback: (cb?: (...args: unknown[]) => void, once?: boolean) => number };
    };
    const handler = (command: string, args?: unknown) => {
      if (command === 'read_logs') {
        return Promise.reject(new Error(errorMessage));
      }
      if (command === 'open_logs') {
        return Promise.resolve();
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    };
    const transformCallback = (cb?: (...args: unknown[]) => void) => {
      const id = Math.floor(Math.random() * 10_000);
      if (cb) {
        setTimeout(() => {
          cb();
        }, 0);
      }
      return id;
    };
    Object.defineProperty(win, '__TAURI_IPC__', { value: () => {}, configurable: true });
    Object.defineProperty(win, '__TAURI_INTERNALS__', {
      value: {
        invoke(command: string, args?: unknown) {
          return handler(command, args);
        },
        transformCallback,
      },
      configurable: true,
    });
    Object.defineProperty(win, '__TAURI__', {
      value: {
        core: {
          invoke(command: string, args?: unknown) {
            return handler(command, args);
          },
          transformCallback,
        },
      },
      configurable: true,
    });
  }, { errorMessage: message });
}

test.describe('Log panel (web build)', () => {
  test('shows desktop guard when Tauri environment is unavailable', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /open log/i }).click();

    await expect(page.getByTestId('log-desktop-guard')).toBeVisible();
  });
});

test.describe('Log panel (mocked Tauri)', () => {
  test('filters entries by level and search term', async ({ page }) => {
    await stubTauriSuccess(page);
    await page.goto('/');
    await page.getByRole('button', { name: /open log/i }).click();

    await page.evaluate((snapshot) => {
      const store = (window as unknown as { __AUTOHOTPIE_LOG_STORE__?: { setState: (state: unknown) => void } }).__AUTOHOTPIE_LOG_STORE__;
      store?.setState({
        entries: snapshot.entries,
        filtered: snapshot.entries,
        truncated: snapshot.truncated,
        filePath: snapshot.file_path,
        isLoading: false,
        isRefreshing: false,
        error: null,
        search: '',
        activeLevels: ['INFO', 'WARN', 'ERROR', 'ACTION'],
        autoRefresh: false,
        lastUpdated: new Date().toISOString(),
      });
    }, SAMPLE_SNAPSHOT);
    await expect.poll(async () => {
      return page.evaluate(() => {
        const store = (window as unknown as { __AUTOHOTPIE_LOG_STORE__?: { getState: () => { isLoading: boolean } } }).__AUTOHOTPIE_LOG_STORE__;
        return store?.getState().isLoading ?? true;
      });
    }).toBe(false);
    await expect.poll(async () => {
      return page.evaluate(() => {
        const store = (window as unknown as { __AUTOHOTPIE_LOG_STORE__?: { getState: () => { filtered: unknown[] } } }).__AUTOHOTPIE_LOG_STORE__;
        return store?.getState().filtered.length ?? 0;
      });
    }).toBe(3);

    await page.getByTestId('log-level-info').click();
    await expect.poll(async () => {
      return page.evaluate(() => {
        const store = (window as unknown as { __AUTOHOTPIE_LOG_STORE__?: { getState: () => { filtered: unknown[] } } }).__AUTOHOTPIE_LOG_STORE__;
        return store?.getState().filtered.length ?? 0;
      });
    }).toBe(2);

    await page.getByTestId('log-search').fill('disk');
    await expect.poll(async () => {
      return page.evaluate(() => {
        const store = (window as unknown as { __AUTOHOTPIE_LOG_STORE__?: { getState: () => { filtered: { message: string }[] } } }).__AUTOHOTPIE_LOG_STORE__;
        const state = store?.getState();
        return {
          count: state ? state.filtered.length : 0,
          message: state && state.filtered[0] ? state.filtered[0].message : null,
        };
      });
    }).toEqual({ count: 1, message: 'Disk failure detected' });
  });

  test('shows error banner when backend invoke fails', async ({ page }) => {
    await stubTauriFailure(page);

    await page.goto('/');
    await page.getByRole('button', { name: /open log/i }).click();

    await page.evaluate(async () => {
      const store = (window as unknown as {
        __AUTOHOTPIE_LOG_STORE__?: {
          getState: () => { refresh: (options?: { silent?: boolean }) => Promise<void> };
        };
      }).__AUTOHOTPIE_LOG_STORE__;
      if (store) {
        await store.getState().refresh();
      }
    });

    await expect.poll(async () => {
      return page.evaluate(() => {
        const store = (window as unknown as { __AUTOHOTPIE_LOG_STORE__?: { getState: () => { error: string | null } } }).__AUTOHOTPIE_LOG_STORE__;
        return store?.getState().error ?? null;
      });
    }).toBe('failed to read log file');

    const errorBanner = page.getByTestId('log-error');
    await expect(errorBanner).toBeVisible();
    await expect.poll(async () => errorBanner.textContent()).toContain('failed to read log file');
  });
});
