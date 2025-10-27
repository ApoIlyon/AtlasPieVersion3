import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { isTauriEnvironment } from '../utils/tauriEnvironment';

export type AutostartStatus = 'enabled' | 'disabled' | 'unsupported';

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
      set({ error: desktopOnlyError() });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const info = await invoke<AutostartInfo>('get_autostart_status');
      set({ info, isLoading: false });
    } catch (error) {
      set({ error: toMessage(error), isLoading: false });
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
      set({ error: toMessage(error), isUpdating: false });
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
