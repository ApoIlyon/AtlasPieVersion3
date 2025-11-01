import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { isTauriEnvironment } from '../utils/tauriEnvironment';

export type AutostartStatus = 'enabled' | 'disabled' | 'unsupported' | 'errored';

export type AutostartProvider =
  | 'systemd'
  | 'xdg_desktop'
  | 'plugin'
  | 'windows_startup'
  | 'macos_launch_agent'
  | 'unsupported';

export type AutostartReasonCode =
  | 'plugin_missing'
  | 'plugin_disabled'
  | 'plugin_error'
  | 'shortcut_missing'
  | 'startup_dir_error'
  | 'linux_no_provider'
  | 'linux_detection_error'
  | 'entry_missing'
  | 'unit_missing'
  | 'unit_disabled'
  | 'web_environment'
  | 'unexpected_error';

export interface AutostartInfo {
  status: AutostartStatus;
  launcherPath?: string | null;
  message?: string | null;
  provider?: AutostartProvider | null;
  reasonCode?: AutostartReasonCode | string | null;
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
          provider: 'unsupported',
          reasonCode: 'web_environment',
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
          provider: 'unsupported',
          reasonCode: 'web_environment',
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
          provider: 'unsupported',
          reasonCode: 'unexpected_error',
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
          provider: 'unsupported',
          reasonCode: 'unexpected_error',
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
        provider: 'unsupported',
        reasonCode: 'unexpected_error',
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
