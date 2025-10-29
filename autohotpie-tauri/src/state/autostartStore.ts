import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { isTauriEnvironment } from '../utils/tauriEnvironment';

export type AutostartStatus = 'enabled' | 'disabled' | 'unsupported' | 'errored';

export interface AutostartInfo {
  status: AutostartStatus;
  launcherPath?: string | null;
  message?: string | null;
}

interface AutostartState {
  info: AutostartInfo | null;
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  setEnabled: (enable: boolean) => Promise<void>;
  openLocation: () => Promise<void>;
  clearError: () => void;
  setErrored: (message: string) => void;
}

function desktopOnlyError(): string {
  return 'Autostart is only available in the desktop build.';
}

export const useAutostartStore = create<AutostartState>((set, get) => ({
  info: null,
  isLoading: false,
  isUpdating: false,
  error: null,
  async initialize() {
    if (!isTauriEnvironment()) {
      set({
        info: {
          status: 'unsupported',
          launcherPath: null,
          message: desktopOnlyError(),
        },
        error: null,
        isLoading: false,
      });
      return;
    }
    await get().refresh();
  },
  async refresh() {
    if (!isTauriEnvironment()) {
      set({
        info: {
          status: 'unsupported',
          launcherPath: null,
          message: desktopOnlyError(),
        },
        error: null,
      });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const info = await invoke<AutostartInfo>('get_autostart_status');
      set({ info, isLoading: false });
    } catch (error) {
      const message = toMessage(error);
      set({
        info: {
          status: 'errored',
          launcherPath: null,
          message,
        },
        error: message,
        isLoading: false,
      });
    }
  },
  async setEnabled(enable) {
    if (!isTauriEnvironment()) {
      set({ error: desktopOnlyError() });
      return;
    }
    set({ isUpdating: true, error: null });
    try {
      const info = await invoke<AutostartInfo>('set_autostart_enabled', { enable });
      set({ info, isUpdating: false });
    } catch (error) {
      const message = toMessage(error);
      set({
        info: {
          status: 'errored',
          launcherPath: null,
          message,
        },
        error: message,
        isUpdating: false,
      });
    }
  },
  async openLocation() {
    if (!isTauriEnvironment()) {
      set({ error: desktopOnlyError() });
      return;
    }
    try {
      await invoke('open_autostart_location');
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },
  clearError() {
    set({ error: null });
  },
  setErrored(message) {
    set({
      info: {
        status: 'errored',
        launcherPath: null,
        message,
      },
      error: message,
    });
  },
}));

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

if (typeof window !== 'undefined') {
  (window as typeof window & { __AUTOHOTPIE_AUTOSTART_STORE__?: typeof useAutostartStore }).__AUTOHOTPIE_AUTOSTART_STORE__ =
    useAutostartStore;
}
