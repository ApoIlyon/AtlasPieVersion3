import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpdateStore, disposeUpdateStoreListener } from '../updateStore';

vi.mock('../../utils/tauriEnvironment', () => ({
  isTauriEnvironment: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

import { isTauriEnvironment } from '../../utils/tauriEnvironment';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Event, UnlistenFn } from '@tauri-apps/api/event';

describe('useUpdateStore', () => {
  beforeEach(async () => {
    useUpdateStore.setState(
      (state) => ({
        ...state,
        status: null,
        isChecking: false,
        initialized: false,
        error: null,
      }),
    );
    vi.clearAllMocks();
    await disposeUpdateStoreListener();
  });

  it('handles specific update errors', async () => {
    vi.mocked(isTauriEnvironment).mockReturnValue(true);
    const mockedInvoke = vi.mocked(invoke);

    mockedInvoke.mockImplementation((command: string) => {
      if (command === 'get_update_status') {
        return Promise.resolve({
          currentVersion: '0.9.0',
          latestVersion: null,
          isUpdateAvailable: false,
          downloadUrl: null,
          releaseNotes: null,
          lastChecked: null,
          error: 'updates.error.rateLimit',
        });
      }
      if (command === 'check_updates') {
        return Promise.reject(new Error('updates.error.network:timeout'));
      }
      return Promise.reject(new Error(`Unexpected invoke command: ${command}`));
    });

    await useUpdateStore.getState().initialize();
    expect(useUpdateStore.getState().status?.error).toBe('updates.error.rateLimit');

    await useUpdateStore.getState().checkForUpdates();
    expect(useUpdateStore.getState().error).toBe('updates.error.network:timeout');
  });

  it('returns desktop-only status when not in Tauri', async () => {
    vi.mocked(isTauriEnvironment).mockReturnValue(false);

    await useUpdateStore.getState().initialize();

    const state = useUpdateStore.getState();
    expect(state.initialized).toBe(true);
    expect(state.status).toMatchObject({
      isUpdateAvailable: false,
      error: 'updates.desktopOnly',
    });
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });

  it('loads backend status and refreshes on demand', async () => {
    vi.mocked(isTauriEnvironment).mockReturnValue(true);
    const mockedInvoke = vi.mocked(invoke);
    const mockedListen = vi.mocked(listen);

    const unlisten = vi.fn(() => {}) as unknown as UnlistenFn;
    type UpdateHandler = (event: Event<unknown>) => void;
    let capturedHandler: UpdateHandler | undefined;

    mockedListen.mockImplementation(async (_event, handler) => {
      capturedHandler = handler as UpdateHandler;
      return Promise.resolve(unlisten);
    });

    const initialStatus = {
      currentVersion: '0.9.0',
      latestVersion: null,
      isUpdateAvailable: false,
      downloadUrl: null,
      releaseNotes: null,
      lastChecked: null,
      error: null,
    };

    const refreshedStatus = {
      currentVersion: '0.9.0',
      latestVersion: '1.0.0',
      isUpdateAvailable: true,
      downloadUrl: 'https://example.com',
      releaseNotes: 'Changelog',
      lastChecked: '2025-10-27T00:00:00Z',
      error: null,
    };

    mockedInvoke.mockImplementation((command: string) => {
      if (command === 'get_update_status') {
        return Promise.resolve(initialStatus);
      }
      if (command === 'check_updates') {
        return Promise.resolve(refreshedStatus);
      }
      return Promise.reject(new Error(`Unexpected invoke command: ${command}`));
    });

    await useUpdateStore.getState().initialize();
    expect(useUpdateStore.getState().status).toEqual(initialStatus);
    expect(mockedListen).toHaveBeenCalledWith('updates://status', expect.any(Function));

    await useUpdateStore.getState().checkForUpdates();
    expect(useUpdateStore.getState().status).toEqual(refreshedStatus);

    // simulate backend event
    const eventPayload = { ...refreshedStatus, error: null, latestVersion: '1.1.0' };
    if (capturedHandler) {
      capturedHandler({ event: 'updates://status', id: 1, payload: eventPayload } as Event<unknown>);
    }
    expect(useUpdateStore.getState().status).toEqual(eventPayload);
  });
});
